import {
  assertSameOrigin,
  ensureAdminSchema,
  errorResponse,
  getAdminDb,
  json,
} from "../_shared/admin-data";

const MAX_PAYLOAD_BYTES = 600_000;
const MAX_COURSES = 1_000;
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const ANONYMOUS_REQUEST_LIMIT = 30;

function validInstallId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function forbiddenKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(forbiddenKeys);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    ["rawText", "ocrText", "fileName", "fileData", "image", "pdf"].includes(key) || forbiddenKeys(nested));
}

async function enforceAnonymousRateLimit(db: D1Database, ownerKey: string) {
  const now = Date.now();
  const current = await db.prepare(
    "SELECT window_started_at AS windowStartedAt, request_count AS requestCount FROM academic_record_rate_limits WHERE owner_key = ? LIMIT 1",
  ).bind(ownerKey).first<{ windowStartedAt: string; requestCount: number }>();
  const currentStart = current?.windowStartedAt ? Date.parse(current.windowStartedAt) : 0;
  const reset = !currentStart || now - currentStart >= RATE_WINDOW_MS;
  if (!reset && (current?.requestCount || 0) >= ANONYMOUS_REQUEST_LIMIT) {
    return false;
  }
  const windowStartedAt = reset ? new Date(now).toISOString() : current!.windowStartedAt;
  const requestCount = reset ? 1 : (current?.requestCount || 0) + 1;
  await db.prepare(`INSERT INTO academic_record_rate_limits (owner_key, window_started_at, request_count)
    VALUES (?, ?, ?)
    ON CONFLICT(owner_key) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      request_count = excluded.request_count`)
    .bind(ownerKey, windowStartedAt, requestCount).run();
  return true;
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureAdminSchema();
    const body = await request.json().catch(() => null) as {
      installId?: unknown;
      snapshot?: { record?: { courses?: unknown[] }; summary?: { semesterCount?: unknown } };
    } | null;
    const installId = String(body?.installId || "").trim().toLowerCase();
    if (!validInstallId(installId)) return json({ error: "Invalid browser identifier.", code: "INVALID_INSTALL_ID" }, 400);
    const snapshot = body?.snapshot;
    const courses = snapshot?.record?.courses;
    if (!snapshot || typeof snapshot !== "object" || !Array.isArray(courses) || courses.length > MAX_COURSES || forbiddenKeys(snapshot)) {
      return json({ error: "Invalid structured academic record.", code: "INVALID_ACADEMIC_RECORD" }, 400);
    }
    const payload = JSON.stringify(snapshot);
    if (new TextEncoder().encode(payload).byteLength > MAX_PAYLOAD_BYTES) {
      return json({ error: "The structured academic record is too large.", code: "ACADEMIC_RECORD_TOO_LARGE" }, 413);
    }
    // This endpoint is intentionally pseudonymous-only. Paid subscriber records
    // are written directly to that user's private Firebase/Firestore path.
    const ownerKey = `anon:${installId}`;
    const now = new Date().toISOString();
    const semesterCount = Math.max(0, Math.min(500, Number(snapshot.summary?.semesterCount) || 0));
    const db = getAdminDb();
    if (!await enforceAnonymousRateLimit(db, ownerKey)) {
      return json({
        error: "Too many academic record updates. Wait a few minutes and try again.",
        code: "ACADEMIC_RECORD_RATE_LIMIT",
      }, 429);
    }
    await db.prepare(`INSERT INTO academic_records
      (owner_key, user_id, install_id, payload, course_count, semester_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_key) DO UPDATE SET
        user_id = excluded.user_id, install_id = excluded.install_id, payload = excluded.payload,
        course_count = excluded.course_count, semester_count = excluded.semester_count,
        updated_at = excluded.updated_at`)
      .bind(ownerKey, null, installId, payload, courses.length, semesterCount, now, now).run();
    return json({ ok: true, owner: "browser", courseCount: courses.length, updatedAt: now });
  } catch (error) {
    return errorResponse(error);
  }
}
