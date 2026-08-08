import { getAdminDb } from "./admin-data";

export const PRODUCT_EVENT_NAMES = new Set([
  "page_viewed",
  "journey_exit",
  "onboarding_started",
  "academic_context_confirmed",
  "academic_workspace_configured",
  "academic_profile_contributed",
  "academic_profile_contribution_failed",
  "university_changed",
  "calculator_opened",
  "tool_opened",
  "gpa_calculated",
  "cgpa_calculated",
  "grade_converted",
  "transcript_upload_started",
  "transcript_import_started",
  "transcript_review_started",
  "transcript_field_corrected",
  "transcript_import_completed",
  "degree_audit_started",
  "degree_audit_completed",
  "pricing_viewed",
  "checkout_account_started",
  "checkout_started",
  "checkout_returned",
  "checkout_completed",
  "premium_activated",
  "premium_tool_opened",
  "integration_started",
  "integration_completed",
  "ocr_consent_shown",
  "ocr_consent_granted",
  "ocr_completed",
  "ocr_failed",
]);

let schemaReady: Promise<void> | null = null;

export function ensureObservabilitySchema() {
  if (schemaReady) return schemaReady;
  const db = getAdminDb();
  schemaReady = db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS product_events (
      id TEXT PRIMARY KEY NOT NULL,
      event_name TEXT NOT NULL,
      install_hash TEXT,
      session_hash TEXT NOT NULL,
      path TEXT NOT NULL,
      tool TEXT,
      language TEXT NOT NULL,
      country TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS product_events_name_created_idx ON product_events(event_name, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS product_events_session_created_idx ON product_events(session_hash, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS product_error_events (
      id TEXT PRIMARY KEY NOT NULL,
      fingerprint TEXT NOT NULL,
      path TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT,
      line INTEGER,
      column_number INTEGER,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS product_errors_fingerprint_created_idx ON product_error_events(fingerprint, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS result_feedback (
      id TEXT PRIMARY KEY NOT NULL,
      session_hash TEXT NOT NULL,
      path TEXT NOT NULL,
      tool TEXT,
      answer TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS result_feedback_created_idx ON result_feedback(created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS observability_rate_limits (
      rate_key TEXT PRIMARY KEY NOT NULL,
      window_started_at TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0
    )`),
  ]).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function cleanText(value: unknown, max = 160) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export function safePath(value: unknown) {
  const raw = cleanText(value, 240);
  try {
    const parsed = new URL(raw, "https://instantgpa.invalid");
    return parsed.pathname.replace(/\/{2,}/g, "/").slice(0, 180) || "/";
  } catch {
    return "/";
  }
}

export function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set([
    "billing_period", "confidence_bucket", "file_type", "page_bucket",
    "processor", "quality", "reason", "row_count_bucket", "scale_type",
    "size_bucket", "source", "stage", "status", "duration_bucket",
    "integration", "result_type",
  ]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => allowed.has(key) && ["string", "number", "boolean"].includes(typeof item))
    .slice(0, 20)
    .map(([key, item]) => [key, typeof item === "string" ? cleanText(item, 80) : item]));
}

export async function enforceObservabilityRateLimit(sessionHash: string, limit = 120) {
  const db = getAdminDb();
  const now = new Date();
  const windowStartedAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
  const rateKey = `${sessionHash}:${windowStartedAt}`;
  await db.prepare(`INSERT INTO observability_rate_limits (rate_key, window_started_at, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(rate_key) DO UPDATE SET request_count = request_count + 1`)
    .bind(rateKey, windowStartedAt)
    .run();
  const row = await db.prepare("SELECT request_count AS requestCount FROM observability_rate_limits WHERE rate_key = ?")
    .bind(rateKey)
    .first<{ requestCount: number }>();
  return Number(row?.requestCount || 0) <= limit;
}
