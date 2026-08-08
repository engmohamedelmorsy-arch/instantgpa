import { getAdminDb } from "./admin-data";

export type CatalogPage = { page: number; text: string };
export type CatalogFact = {
  id: string;
  kind: "course" | "requirement" | "policy";
  code: string;
  title: string;
  credits: number | null;
  minimumGrade: string;
  prerequisiteCodes: string[];
  corequisiteCodes: string[];
  groupName: string;
  ruleType: string;
  summary: string;
  page: number;
  confidence: number;
};

let schemaPromise: Promise<void> | null = null;

export async function ensureCatalogSchema() {
  if (!schemaPromise) {
    const db = getAdminDb();
    schemaPromise = (async () => {
      const statements = [
        `CREATE TABLE IF NOT EXISTS academic_catalog_sources (
          id TEXT PRIMARY KEY, institution_key TEXT NOT NULL, institution TEXT NOT NULL,
          country_code TEXT NOT NULL DEFAULT '', college TEXT NOT NULL DEFAULT '',
          department TEXT NOT NULL DEFAULT '', program TEXT NOT NULL DEFAULT '',
          catalog_year TEXT NOT NULL, source_url TEXT NOT NULL, source_title TEXT NOT NULL,
          source_type TEXT NOT NULL DEFAULT 'catalog', content_hash TEXT NOT NULL,
          page_count INTEGER NOT NULL DEFAULT 1, fact_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending_review', import_notes TEXT NOT NULL DEFAULT '',
          imported_by TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_catalog_sources_lookup ON academic_catalog_sources
          (institution_key, catalog_year, status)`,
        `CREATE TABLE IF NOT EXISTS academic_catalog_facts (
          id TEXT PRIMARY KEY, source_id TEXT NOT NULL, kind TEXT NOT NULL,
          code TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', credits REAL,
          minimum_grade TEXT NOT NULL DEFAULT '', prerequisite_codes TEXT NOT NULL DEFAULT '[]',
          corequisite_codes TEXT NOT NULL DEFAULT '[]', group_name TEXT NOT NULL DEFAULT '',
          rule_type TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '',
          source_page INTEGER NOT NULL DEFAULT 1, confidence REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending_review', created_at TEXT NOT NULL,
          FOREIGN KEY (source_id) REFERENCES academic_catalog_sources(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_catalog_facts_source ON academic_catalog_facts (source_id, status, kind)`,
      ];
      for (const sql of statements) await db.prepare(sql).run();
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

const clean = (value: unknown, max = 240) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
const codePattern = /\b([A-Z]{2,8}[\s-]?\d{2,4}[A-Z]?)\b/i;
const creditsPattern = /\b(\d+(?:\.\d+)?)\s*(?:credit(?:s|\s*hours?)?|cr\.?|units?|ساع(?:ة|ات))\b/i;
const prerequisitePattern = /(?:pre-?requisites?|prereq\.?|المتطلبات?\s*السابقة?)\s*[:：-]?\s*([^.;\n]{2,180})/i;
const corequisitePattern = /(?:co-?requisites?|coreq\.?|المتطلبات?\s*المتزامنة?)\s*[:：-]?\s*([^.;\n]{2,180})/i;
const minimumGradePattern = /(?:minimum\s+grade|min\.\s*grade|at\s+least|بحد\s*أدنى\s*تقدير)\s*[:：-]?\s*([A-F][+-]?|\d{1,3}%?)/i;
const requirementPattern = /(?:minimum|required|complete|at least|إجمالي|إكمال|حد أدنى)[^\n]{0,90}?(\d+(?:\.\d+)?)\s*(?:credits?|credit hours?|units?|ساعة|ساعات)/i;

function codesFrom(value: string | undefined) {
  if (!value) return [];
  return [...new Set((value.match(/[A-Z]{2,8}[\s-]?\d{2,4}[A-Z]?/gi) || []).map((code) => code.replace(/[\s-]/g, "").toUpperCase()))].slice(0, 20);
}

function lineConfidence({ hasCode, hasCredits, hasTitle, hasSourcePage }: Record<string, boolean>) {
  const score = 0.42 + (hasCode ? 0.22 : 0) + (hasCredits ? 0.14 : 0) + (hasTitle ? 0.12 : 0) + (hasSourcePage ? 0.1 : 0);
  return Math.min(0.99, Math.round(score * 100) / 100);
}

export function parseCatalogPages(pages: CatalogPage[]): CatalogFact[] {
  const facts: CatalogFact[] = [];
  for (const pageEntry of pages.slice(0, 1_000)) {
    const page = Math.max(1, Math.floor(Number(pageEntry.page) || 1));
    const lines = String(pageEntry.text || "").split(/\r?\n/).map((line) => clean(line, 700)).filter(Boolean);
    let currentGroup = "";
    for (const line of lines) {
      if (line.length < 110 && /(?:requirements?|curriculum|core|electives?|major|general education|متطلبات|إجباري|اختياري)/i.test(line)) {
        currentGroup = line.slice(0, 120);
      }
      const codeMatch = line.match(codePattern);
      const creditMatch = line.match(creditsPattern);
      if (codeMatch && (creditMatch || line.length <= 260)) {
        const code = codeMatch[1].replace(/[\s-]/g, "").toUpperCase();
        const withoutCode = line.replace(codeMatch[0], "").replace(creditsPattern, "").replace(prerequisitePattern, "").replace(corequisitePattern, "");
        const title = clean(withoutCode.replace(/^[-–—:|]+|[-–—:|]+$/g, ""), 180);
        const prerequisite = line.match(prerequisitePattern)?.[1];
        const corequisite = line.match(corequisitePattern)?.[1];
        const minimumGrade = clean(line.match(minimumGradePattern)?.[1], 12).toUpperCase();
        facts.push({
          id: crypto.randomUUID(), kind: "course", code, title,
          credits: creditMatch ? Number(creditMatch[1]) : null,
          minimumGrade, prerequisiteCodes: codesFrom(prerequisite), corequisiteCodes: codesFrom(corequisite),
          groupName: currentGroup, ruleType: "course_definition", summary: line.slice(0, 500), page,
          confidence: lineConfidence({ hasCode: true, hasCredits: Boolean(creditMatch), hasTitle: title.length > 3, hasSourcePage: true }),
        });
      }
      const requirementMatch = line.match(requirementPattern);
      if (requirementMatch) {
        facts.push({
          id: crypto.randomUUID(), kind: "requirement", code: "", title: currentGroup || "Program requirement",
          credits: Number(requirementMatch[1]), minimumGrade: clean(line.match(minimumGradePattern)?.[1], 12).toUpperCase(),
          prerequisiteCodes: [], corequisiteCodes: [], groupName: currentGroup, ruleType: "credit_requirement",
          summary: line.slice(0, 500), page,
          confidence: lineConfidence({ hasCode: false, hasCredits: true, hasTitle: Boolean(currentGroup), hasSourcePage: true }),
        });
      }
      if (/(?:retake|repeat|transfer credit|residency|waiver|exemption|إعادة|تحويل|إعفاء)/i.test(line) && line.length >= 25) {
        const ruleType = /(?:retake|repeat|إعادة)/i.test(line) ? "retake"
          : /(?:transfer|تحويل)/i.test(line) ? "transfer" : "exemption";
        facts.push({
          id: crypto.randomUUID(), kind: "policy", code: "", title: currentGroup || "Academic policy", credits: null,
          minimumGrade: clean(line.match(minimumGradePattern)?.[1], 12).toUpperCase(), prerequisiteCodes: [], corequisiteCodes: [],
          groupName: currentGroup, ruleType, summary: line.slice(0, 500), page,
          confidence: lineConfidence({ hasCode: false, hasCredits: false, hasTitle: true, hasSourcePage: true }),
        });
      }
    }
  }
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.kind}|${fact.code}|${fact.ruleType}|${fact.summary}|${fact.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10_000);
}

export function validateOfficialSourceUrl(value: unknown) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("CATALOG_SOURCE_URL_REJECTED");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || /^\d+(?:\.\d+){3}$/.test(hostname) || hostname.includes(":")) {
    throw new Error("CATALOG_SOURCE_URL_REJECTED");
  }
  return url;
}

export async function fetchCatalogPages(sourceUrl: URL): Promise<CatalogPage[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(sourceUrl, {
      redirect: "error",
      signal: controller.signal,
      headers: { accept: "text/html,text/plain,application/xhtml+xml;q=0.9" },
    });
    if (!response.ok) throw new Error("CATALOG_SOURCE_FETCH_FAILED");
    const type = response.headers.get("content-type") || "";
    if (!/(?:text\/html|text\/plain|application\/xhtml\+xml)/i.test(type)) throw new Error("CATALOG_SOURCE_NEEDS_DOCUMENT_EXTRACTION");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > 2_000_000) throw new Error("CATALOG_SOURCE_TOO_LARGE");
    const raw = (await response.text()).slice(0, 2_000_000);
    const text = raw
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(?:p|li|tr|h[1-6]|div|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
    return [{ page: 1, text }];
  } finally {
    clearTimeout(timer);
  }
}

export async function contentHash(pages: CatalogPage[]) {
  const bytes = new TextEncoder().encode(pages.map((page) => `${page.page}:${page.text}`).join("\n"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

export function catalogInstitutionKey(parts: unknown[]) {
  return parts.map((part) => clean(part, 160).toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")).filter(Boolean).join("|").slice(0, 600);
}
