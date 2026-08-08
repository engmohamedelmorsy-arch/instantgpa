import { assertSameOrigin, errorResponse, json, requireActiveSubscriber } from "../_shared/admin-data";
import {
  digest,
  passwordDigest,
  publicShareUrl,
  randomToken,
  shareErrorMessage,
  validateShareInput,
} from "../_shared/report-share-data";
import {
  deleteFirestoreDocument,
  getFirestoreDocument,
  listFirestoreDocuments,
  setFirestoreDocument,
} from "../_shared/firebase-admin-rest";

export async function GET(request: Request) {
  try {
    const user = await requireActiveSubscriber(request);
    const rows = await listFirestoreDocuments<Record<string, unknown>>(`premiumUsers/${user.id}/reportShares`, 100);
    return json({
      shares: rows
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, 30)
        .map((row) => ({
          id: row.id,
          title: row.title,
          scope: row.scope,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt || null,
          createdAt: row.createdAt,
          viewCount: Number(row.viewCount) || 0,
          passwordProtected: Boolean(row.passwordHash),
        })),
    });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveSubscriber(request);
    const input = validateShareInput(await request.json());
    const token = randomToken();
    const tokenHash = await digest(token);
    const salt = input.password ? randomToken(18) : null;
    const passwordHash = input.password && salt ? await passwordDigest(input.password, salt) : null;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.expiresInDays * 86_400_000);
    const id = crypto.randomUUID();
    const share = {
      id,
      userId: user.id,
      tokenHash,
      title: input.title,
      scope: input.scope,
      payload: JSON.parse(input.payload),
      passwordHash,
      passwordSalt: salt,
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
      createdAt: now.toISOString(),
      lastAccessedAt: null,
      viewCount: 0,
    };
    await Promise.all([
      setFirestoreDocument(`premiumUsers/${user.id}/reportShares/${id}`, share),
      setFirestoreDocument(`reportShareTokens/${tokenHash}`, { shareId: id, userId: user.id, expiresAt: share.expiresAt, createdAt: share.createdAt }),
    ]);
    return json({ id, url: publicShareUrl(request, token), scope: input.scope, expiresAt: share.expiresAt, passwordProtected: Boolean(passwordHash) }, 201);
  } catch (error) {
    const validation = shareErrorMessage(error);
    if (validation.status !== 500) return json({ error: validation.message, code: validation.code }, validation.status);
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveSubscriber(request);
    const body = await request.json().catch(() => ({})) as { id?: string };
    const id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Choose a valid report link.", code: "INVALID_SHARE" }, 400);
    const path = `premiumUsers/${user.id}/reportShares/${id}`;
    const share = await getFirestoreDocument<Record<string, unknown>>(path);
    if (!share || share.revokedAt) return json({ error: "The report link was not found or was already revoked.", code: "SHARE_NOT_FOUND" }, 404);
    await Promise.all([
      setFirestoreDocument(path, { ...share, revokedAt: new Date().toISOString() }),
      share.tokenHash ? deleteFirestoreDocument(`reportShareTokens/${String(share.tokenHash)}`) : Promise.resolve(),
    ]);
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
