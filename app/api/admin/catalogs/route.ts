import { assertSameOrigin, audit, errorResponse, getAdminDb, json, requireOwner } from "../../_shared/admin-data";
import {
  catalogInstitutionKey, contentHash, ensureCatalogSchema, fetchCatalogPages,
  parseCatalogPages, validateOfficialSourceUrl, type CatalogPage,
} from "../../_shared/catalog-ingestion";

const clean = (value: unknown, max = 240) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    await ensureCatalogSchema();
    const url = new URL(request.url);
    const status = clean(url.searchParams.get("status"), 30) || "pending_review";
    const sources = await getAdminDb().prepare(`SELECT
      id, institution, country_code AS countryCode, college, department, program,
      catalog_year AS catalogYear, source_url AS sourceUrl, source_title AS sourceTitle,
      source_type AS sourceType, page_count AS pageCount, fact_count AS factCount,
      status, import_notes AS importNotes, imported_by AS importedBy,
      reviewed_by AS reviewedBy, reviewed_at AS reviewedAt, created_at AS createdAt
      FROM academic_catalog_sources WHERE status = ? ORDER BY created_at DESC LIMIT 200`)
      .bind(status).all();
    return json({ sources: sources.results || [], status });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const owner = await requireOwner(request);
    await ensureCatalogSchema();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = clean(body.action, 30);
    const db = getAdminDb();

    if (action === "review") {
      const sourceId = clean(body.sourceId, 80);
      const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : "";
      if (!sourceId || !decision) return json({ error: "A valid source and decision are required.", code: "INVALID_REVIEW" }, 400);
      const now = new Date().toISOString();
      const source = await db.prepare("SELECT id FROM academic_catalog_sources WHERE id = ?").bind(sourceId).first();
      if (!source) return json({ error: "Catalog source not found.", code: "SOURCE_NOT_FOUND" }, 404);
      await db.batch([
        db.prepare("UPDATE academic_catalog_sources SET status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").bind(decision, owner.email, now, now, sourceId),
        db.prepare("UPDATE academic_catalog_facts SET status = ? WHERE source_id = ?").bind(decision, sourceId),
      ]);
      await audit(owner.email, `catalog_${decision}`, "academic_catalog", sourceId);
      return json({ ok: true, sourceId, status: decision });
    }

    if (action !== "import") return json({ error: "Unsupported catalog action.", code: "INVALID_ACTION" }, 400);
    const institution = clean(body.institution, 180);
    const catalogYear = clean(body.catalogYear, 30);
    const sourceTitle = clean(body.sourceTitle, 180) || "Official academic catalog";
    if (!institution || !catalogYear) return json({ error: "Institution and catalog year are required.", code: "MISSING_CATALOG_CONTEXT" }, 400);
    const sourceUrl = validateOfficialSourceUrl(body.sourceUrl);
    let pages = Array.isArray(body.pages)
      ? body.pages.slice(0, 1_000).map((value: unknown, index) => {
        const page = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return { page: Math.max(1, Number(page.page) || index + 1), text: String(page.text || "").slice(0, 120_000) };
      })
      : [] as CatalogPage[];
    if (!pages.some((page) => page.text.trim())) pages = await fetchCatalogPages(sourceUrl);
    const facts = parseCatalogPages(pages);
    if (!facts.length) return json({ error: "No reviewable catalog facts were extracted.", code: "NO_CATALOG_FACTS" }, 422);
    const sourceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const countryCode = clean(body.countryCode, 3).toUpperCase();
    const college = clean(body.college, 180);
    const department = clean(body.department, 180);
    const program = clean(body.program, 180);
    const institutionKey = catalogInstitutionKey([countryCode, institution, college, department, program]);
    const hash = await contentHash(pages);
    const duplicate = await db.prepare("SELECT id, status FROM academic_catalog_sources WHERE institution_key = ? AND catalog_year = ? AND content_hash = ?")
      .bind(institutionKey, catalogYear, hash).first<{ id: string; status: string }>();
    if (duplicate) return json({ ok: true, duplicate: true, sourceId: duplicate.id, status: duplicate.status });
    const statements = [
      db.prepare(`INSERT INTO academic_catalog_sources
        (id, institution_key, institution, country_code, college, department, program, catalog_year,
         source_url, source_title, source_type, content_hash, page_count, fact_count, status,
         import_notes, imported_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?)`)
        .bind(sourceId, institutionKey, institution, countryCode, college, department, program, catalogYear,
          sourceUrl.href, sourceTitle, clean(body.sourceType, 30) || "catalog", hash, pages.length, facts.length,
          clean(body.importNotes, 500), owner.email, now, now),
      ...facts.map((fact) => db.prepare(`INSERT INTO academic_catalog_facts
        (id, source_id, kind, code, title, credits, minimum_grade, prerequisite_codes,
         corequisite_codes, group_name, rule_type, summary, source_page, confidence, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?)`)
        .bind(fact.id, sourceId, fact.kind, fact.code, fact.title, fact.credits, fact.minimumGrade,
          JSON.stringify(fact.prerequisiteCodes), JSON.stringify(fact.corequisiteCodes), fact.groupName,
          fact.ruleType, fact.summary, fact.page, fact.confidence, now)),
    ];
    for (let index = 0; index < statements.length; index += 80) await db.batch(statements.slice(index, index + 80));
    await audit(owner.email, "catalog_imported", "academic_catalog", sourceId, { institution, catalogYear, factCount: facts.length });
    return json({ ok: true, sourceId, status: "pending_review", pageCount: pages.length, factCount: facts.length }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CATALOG_")) return json({ error: error.message, code: error.message }, 400);
    return errorResponse(error);
  }
}
