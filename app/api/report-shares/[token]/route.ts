import { assertSameOrigin, json } from "../../_shared/admin-data";
import { digest, passwordDigest, timingSafeEqual } from "../../_shared/report-share-data";
import {
  deleteFirestoreDocument,
  getFirestoreDocument,
  setFirestoreDocument,
} from "../../_shared/firebase-admin-rest";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(request);
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return json({ error: "This report link is invalid.", code: "INVALID_SHARE" }, 404);
    const body = await request.json().catch(() => ({})) as { password?: string };
    const tokenHash = await digest(token);
    const pointer = await getFirestoreDocument<{ shareId: string; userId: string; expiresAt: string }>(`reportShareTokens/${tokenHash}`);
    if (!pointer || pointer.expiresAt <= new Date().toISOString()) return json({ error: "This report link is unavailable, expired, or revoked.", code: "SHARE_UNAVAILABLE" }, 404);
    const sharePath = `premiumUsers/${pointer.userId}/reportShares/${pointer.shareId}`;
    const share = await getFirestoreDocument<Record<string, unknown>>(sharePath);
    if (!share || share.revokedAt || String(share.expiresAt) <= new Date().toISOString() || share.tokenHash !== tokenHash) {
      return json({ error: "This report link is unavailable, expired, or revoked.", code: "SHARE_UNAVAILABLE" }, 404);
    }

    if (share.passwordHash && share.passwordSalt) {
      const clientKey = await digest(`${tokenHash}:${request.headers.get("cf-connecting-ip") || "unknown"}`);
      const attemptPath = `reportShareAttempts/${clientKey}`;
      const attempt = await getFirestoreDocument<Record<string, unknown>>(attemptPath);
      const inWindow = Boolean(attempt && Date.now() - Date.parse(String(attempt.windowStartedAt || "")) < 15 * 60 * 1_000);
      if (inWindow && Number(attempt?.attempts) >= 8) return json({ error: "Too many password attempts. Try again in 15 minutes.", code: "RATE_LIMITED" }, 429);
      const password = String(body.password || "");
      if (!password) return json({ error: "Enter the report password.", code: "PASSWORD_REQUIRED" }, 401);
      const supplied = await passwordDigest(password, String(share.passwordSalt));
      if (!timingSafeEqual(supplied, String(share.passwordHash))) {
        await setFirestoreDocument(attemptPath, {
          tokenHash,
          windowStartedAt: inWindow ? attempt?.windowStartedAt : new Date().toISOString(),
          attempts: inWindow ? Number(attempt?.attempts || 0) + 1 : 1,
          updatedAt: new Date().toISOString(),
        });
        return json({ error: "The report password is incorrect.", code: "PASSWORD_INCORRECT" }, 401);
      }
      await deleteFirestoreDocument(attemptPath);
    }

    const accessedAt = new Date().toISOString();
    await setFirestoreDocument(sharePath, { ...share, lastAccessedAt: accessedAt, viewCount: Number(share.viewCount || 0) + 1 });
    return json({
      title: share.title,
      scope: share.scope,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
      passwordProtected: Boolean(share.passwordHash),
      report: share.payload,
    });
  } catch {
    return json({ error: "The shared report could not be opened.", code: "SHARE_ERROR" }, 500);
  }
}
