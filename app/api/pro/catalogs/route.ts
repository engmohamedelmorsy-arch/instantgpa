import { errorResponse, getAdminDb, json, requireActiveSubscriber } from "../../_shared/admin-data";
import { ensureCatalogSchema } from "../../_shared/catalog-ingestion";

const parseJson = (value: unknown) => { try { return JSON.parse(String(value || "[]")); } catch { return []; } };

export async function GET(request: Request) {
  try {
    const user = await requireActiveSubscriber(request);
    await ensureCatalogSchema();
    const url = new URL(request.url);
    const institution = (url.searchParams.get("institution") || "").slice(0, 180);
    const countryCode = (url.searchParams.get("countryCode") || "").slice(0, 3).toUpperCase();
    const college = (url.searchParams.get("college") || "").slice(0, 180);
    const department = (url.searchParams.get("department") || "").slice(0, 180);
    const program = (url.searchParams.get("program") || "").slice(0, 180);
    const catalogYear = (url.searchParams.get("catalogYear") || "").slice(0, 30);
    if (!institution) return json({ sources: [], facts: [], verified: false, reason: "institution_required" });
    const sourceRows = await getAdminDb().prepare(`SELECT id, institution, country_code AS countryCode, college, department, program,
      catalog_year AS catalogYear, source_url AS sourceUrl, source_title AS sourceTitle, reviewed_at AS reviewedAt
      FROM academic_catalog_sources WHERE status = 'approved' AND lower(institution) = lower(?)
      AND (? = '' OR country_code = ?) AND (? = '' OR college = '' OR lower(college) = lower(?))
      AND (? = '' OR department = '' OR lower(department) = lower(?))
      AND (? = '' OR program = '' OR lower(program) = lower(?))
      AND (? = '' OR catalog_year = ?) ORDER BY
        (CASE WHEN program != '' THEN 4 ELSE 0 END + CASE WHEN department != '' THEN 2 ELSE 0 END + CASE WHEN college != '' THEN 1 ELSE 0 END) DESC,
        catalog_year DESC LIMIT 10`)
      .bind(institution, countryCode, countryCode, college, college, department, department, program, program, catalogYear, catalogYear).all<{
        id: string; institution: string; countryCode: string; college: string; department: string; program: string;
        catalogYear: string; sourceUrl: string; sourceTitle: string; reviewedAt: string;
      }>();
    const sourceIds = (sourceRows.results || []).map((source) => source.id);
    if (!sourceIds.length) return json({ sources: [], facts: [], verified: false, reason: "no_approved_catalog", entitlement: user.entitlement.status });
    const placeholders = sourceIds.map(() => "?").join(",");
    const factRows = await getAdminDb().prepare(`SELECT id, source_id AS sourceId, kind, code, title, credits,
      minimum_grade AS minimumGrade, prerequisite_codes AS prerequisiteCodes, corequisite_codes AS corequisiteCodes,
      group_name AS groupName, rule_type AS ruleType, summary, source_page AS sourcePage, confidence
      FROM academic_catalog_facts WHERE status = 'approved' AND source_id IN (${placeholders})
      ORDER BY source_page, kind, code LIMIT 10000`).bind(...sourceIds).all<{
        id: string; sourceId: string; kind: string; code: string; title: string; credits: number | null;
        minimumGrade: string; prerequisiteCodes: string; corequisiteCodes: string; groupName: string;
        ruleType: string; summary: string; sourcePage: number; confidence: number;
      }>();
    const facts = (factRows.results || []).map((fact) => ({
      ...fact,
      prerequisiteCodes: parseJson(fact.prerequisiteCodes),
      corequisiteCodes: parseJson(fact.corequisiteCodes),
      citation: { sourceId: fact.sourceId, page: fact.sourcePage },
    }));
    return json({ sources: sourceRows.results || [], facts, verified: true, entitlement: user.entitlement.status });
  } catch (error) {
    return errorResponse(error);
  }
}
