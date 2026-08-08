import {
  assertSameOrigin,
  errorResponse,
  getAdminDb,
  json,
  requireOwner,
} from "../../../_shared/admin-data";
import {
  createInstitutionToken,
  sha256,
} from "../../../_shared/institution-api";

const clean = (value: unknown, max = 80) =>
  String(value ?? "").normalize("NFKC").trim().slice(0, max);

export async function GET(request: Request) {
  try {
    const user = await requireOwner(request);
    const keys = await getAdminDb().prepare(`SELECT
      id, name, prefix, scopes, active,
      created_at AS createdAt,
      last_used_at AS lastUsedAt,
      revoked_at AS revokedAt
      FROM institution_api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20`)
      .bind(user.id)
      .all();
    return json({ keys: keys.results || [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const name = clean(body.name) || "Institution integration";
    const existing = await getAdminDb().prepare(
      "SELECT COUNT(*) AS total FROM institution_api_keys WHERE user_id = ? AND active = 1",
    ).bind(user.id).first<{ total: number }>();
    if ((existing?.total || 0) >= 5) {
      return json({ error: "Revoke an existing key before creating another.", code: "API_KEY_LIMIT" }, 409);
    }
    const token = createInstitutionToken();
    const id = crypto.randomUUID();
    const prefix = token.slice(0, 18);
    const createdAt = new Date().toISOString();
    await getAdminDb().prepare(`INSERT INTO institution_api_keys
      (id, user_id, name, prefix, token_hash, scopes, active, created_at)
      VALUES (?, ?, ?, ?, ?, 'bulk:analyze', 1, ?)`)
      .bind(id, user.id, name, prefix, await sha256(token), createdAt)
      .run();
    return json({
      key: { id, name, prefix, scopes: "bulk:analyze", createdAt },
      token,
      warning: "Copy this token now. InstantGPA stores only its cryptographic hash and cannot show it again.",
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = clean(body.id, 80);
    if (!id) return json({ error: "Choose an API key to revoke.", code: "API_KEY_ID_REQUIRED" }, 400);
    const now = new Date().toISOString();
    const result = await getAdminDb().prepare(`UPDATE institution_api_keys
      SET active = 0, revoked_at = ?
      WHERE id = ? AND user_id = ? AND active = 1`)
      .bind(now, id, user.id)
      .run();
    if (!result.meta.changes) return json({ error: "API key not found.", code: "API_KEY_NOT_FOUND" }, 404);
    return json({ ok: true, id, revokedAt: now });
  } catch (error) {
    return errorResponse(error);
  }
}
