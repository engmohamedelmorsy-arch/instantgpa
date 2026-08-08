import { assertSameOrigin, errorResponse, getAdminDb, json } from "../_shared/admin-data";
import { cleanText, ensureObservabilitySchema, safePath, sha256 } from "../_shared/product-observability";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureObservabilitySchema();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const answer = cleanText(body.answer, 8);
    if (!["yes", "no"].includes(answer)) return json({ error: "Choose yes or no.", code: "INVALID_ANSWER" }, 400);
    const sessionId = cleanText(body.sessionId, 80);
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(sessionId)) return json({ error: "Invalid session.", code: "INVALID_SESSION" }, 400);
    await getAdminDb().prepare(`INSERT INTO result_feedback
      (id, session_hash, path, tool, answer, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), await sha256(`session:${sessionId}`), safePath(body.path),
        cleanText(body.tool, 60) || null, answer, cleanText(body.note, 500) || null,
        new Date().toISOString(),
      ).run();
    return json({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
