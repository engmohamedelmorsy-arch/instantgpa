import { assertSameOrigin, errorResponse, getAdminDb, json } from "../../_shared/admin-data";
import { cleanText, ensureObservabilitySchema, safeMetadata, safePath, sha256 } from "../../_shared/product-observability";

function sanitizeMessage(value: unknown) {
  return cleanText(value, 320)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{7,}\b/g, "[number]")
    .replace(/https?:\/\/[^\s]+/gi, "[url]");
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 8_192) return json({ error: "Error report is too large.", code: "REPORT_TOO_LARGE" }, 413);
    await ensureObservabilitySchema();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const message = sanitizeMessage(body.message);
    if (!message) return json({ error: "Missing error message.", code: "MISSING_MESSAGE" }, 400);
    const path = safePath(body.path);
    const category = cleanText(body.category, 32) || "runtime";
    const source = safePath(body.source);
    const fingerprint = await sha256(`${category}|${path}|${source}|${message}`);
    await getAdminDb().prepare(`INSERT INTO product_error_events
      (id, fingerprint, path, category, message, source, line, column_number, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), fingerprint, path, category, message, source || null,
        Math.max(0, Math.min(1_000_000, Number(body.line) || 0)),
        Math.max(0, Math.min(1_000_000, Number(body.column) || 0)),
        JSON.stringify(safeMetadata(body.metadata)), new Date().toISOString(),
      ).run();
    console.error(JSON.stringify({ event: "browser_error", fingerprint, path, category }));
    return json({ accepted: true }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
