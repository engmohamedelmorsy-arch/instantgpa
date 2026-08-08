import { assertSameOrigin, errorResponse, getAdminDb, json } from "../../_shared/admin-data";
import {
  PRODUCT_EVENT_NAMES,
  cleanText,
  enforceObservabilityRateLimit,
  ensureObservabilitySchema,
  safeMetadata,
  safePath,
  sha256,
} from "../../_shared/product-observability";

type BrowserEvent = {
  name?: unknown;
  path?: unknown;
  tool?: unknown;
  language?: unknown;
  country?: unknown;
  metadata?: unknown;
  occurredAt?: unknown;
};

function validIdentifier(value: unknown) {
  const normalized = cleanText(value, 80);
  return /^[a-zA-Z0-9_-]{12,80}$/.test(normalized) ? normalized : "";
}

function bucketCountry(request: Request, supplied: unknown) {
  const cfCountry = cleanText((request as Request & { cf?: { country?: string } }).cf?.country, 2).toUpperCase();
  const candidate = cfCountry || cleanText(supplied, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(candidate) ? candidate : "";
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 32_768) return json({ error: "Event batch is too large.", code: "EVENT_BATCH_TOO_LARGE" }, 413);
    await ensureObservabilitySchema();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = validIdentifier(body.sessionId);
    if (!sessionId) return json({ error: "Invalid analytics session.", code: "INVALID_SESSION" }, 400);
    const sessionHash = await sha256(`session:${sessionId}`);
    if (!await enforceObservabilityRateLimit(sessionHash)) {
      return json({ error: "Too many events.", code: "RATE_LIMITED" }, 429);
    }
    const installId = validIdentifier(body.installId);
    const installHash = installId ? await sha256(`install:${installId}`) : null;
    const events = (Array.isArray(body.events) ? body.events : []).slice(0, 20) as BrowserEvent[];
    const now = new Date().toISOString();
    const db = getAdminDb();
    const statements = events.flatMap((event) => {
      const name = cleanText(event.name, 48);
      if (!PRODUCT_EVENT_NAMES.has(name)) return [];
      const language = cleanText(event.language, 2) === "ar" ? "ar" : "en";
      return [db.prepare(`INSERT INTO product_events
        (id, event_name, install_hash, session_hash, path, tool, language, country, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(),
          name,
          installHash,
          sessionHash,
          safePath(event.path),
          cleanText(event.tool, 60) || null,
          language,
          bucketCountry(request, event.country) || null,
          JSON.stringify(safeMetadata(event.metadata)),
          now,
        )];
    });
    if (statements.length) await db.batch(statements);
    if (Math.random() < 0.01) {
      await db.batch([
        db.prepare("DELETE FROM product_events WHERE created_at < datetime('now', '-180 days')"),
        db.prepare("DELETE FROM product_error_events WHERE created_at < datetime('now', '-90 days')"),
        db.prepare("DELETE FROM observability_rate_limits WHERE window_started_at < datetime('now', '-2 days')"),
      ]);
    }
    return json({ accepted: statements.length }, 202);
  } catch (error) {
    console.error(JSON.stringify({ event: "analytics_ingest_failed", message: error instanceof Error ? error.message : "unknown" }));
    return errorResponse(error);
  }
}
