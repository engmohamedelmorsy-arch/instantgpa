import {
  AdminHttpError,
  ensureAdminSchema,
  getAdminDb,
  ownerEmails,
} from "./admin-data";
import { runProAnalysis } from "./pro-analysis";

const ALLOWED_BULK_ACTIONS = new Set([
  "academic_twin",
  "academic_undo",
  "credit_conversion",
  "transfer",
  "integrity",
]);

export type InstitutionApiIdentity = {
  keyId: string;
  userId: string;
  plan: string;
  monthlyLimit: number;
};

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createInstitutionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `igpa_live_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function requireInstitutionApiKey(request: Request): Promise<InstitutionApiIdentity> {
  await ensureAdminSchema();
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith("igpa_live_") || token.length < 32) {
    throw new AdminHttpError("A valid InstantGPA institution API key is required.", 401, "API_KEY_REQUIRED");
  }
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const row = await getAdminDb().prepare(`SELECT
    k.id AS keyId,
    k.user_id AS userId,
    u.status AS userStatus,
    u.email AS email,
    u.email_verified AS emailVerified
    FROM institution_api_keys k
    INNER JOIN site_users u ON u.id = k.user_id
    WHERE k.token_hash = ?
      AND k.active = 1
      AND k.revoked_at IS NULL
    LIMIT 1`)
    .bind(tokenHash)
    .first<{
      keyId: string;
      userId: string;
      userStatus: string;
      email: string;
      emailVerified: number;
    }>();
  if (!row) throw new AdminHttpError("The institution API key is invalid or revoked.", 401, "API_KEY_INVALID");
  const owner = Boolean(row.emailVerified) && ownerEmails().has(row.email.toLowerCase());
  if (row.userStatus === "blocked" || !owner) {
    throw new AdminHttpError("This institutional API is restricted to the verified Owner.", 403, "OWNER_REQUIRED");
  }
  await getAdminDb().prepare("UPDATE institution_api_keys SET last_used_at = ? WHERE id = ?")
    .bind(now, row.keyId)
    .run();
  return {
    keyId: row.keyId,
    userId: row.userId,
    plan: "InstantGPA Pro — Owner",
    monthlyLimit: 5_000,
  };
}

export async function runInstitutionBatch(
  userId: string,
  apiKeyId: string | null,
  action: string,
  records: unknown[],
) {
  if (!ALLOWED_BULK_ACTIONS.has(action)) {
    throw new AdminHttpError("Choose a supported institutional action.", 400, "UNSUPPORTED_BULK_ACTION");
  }
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    throw new AdminHttpError("Each batch must contain between 1 and 100 records.", 400, "INVALID_BATCH_SIZE");
  }
  const db = getAdminDb();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const usage = await db.prepare(`SELECT COALESCE(SUM(record_count), 0) AS records
    FROM institution_batch_jobs
    WHERE user_id = ? AND created_at >= ? AND status = 'completed'`)
    .bind(userId, monthStart.toISOString())
    .first<{ records: number }>();
  if ((usage?.records || 0) + records.length > 5_000) {
    throw new AdminHttpError("The 5,000-record monthly institutional beta limit has been reached.", 429, "MONTHLY_BATCH_LIMIT");
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.prepare(`INSERT INTO institution_batch_jobs
    (id, user_id, api_key_id, action, status, record_count, success_count, failed_count, created_at)
    VALUES (?, ?, ?, ?, 'processing', ?, 0, 0, ?)`)
    .bind(id, userId, apiKeyId, action, records.length, createdAt)
    .run();
  const results = records.map((record, index) => {
    try {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error("Record must be a JSON object.");
      }
      return { index, ok: true, result: runProAnalysis(action, record as Record<string, unknown>) };
    } catch (error) {
      return {
        index,
        ok: false,
        error: error instanceof Error ? error.message : "ANALYSIS_FAILED",
      };
    }
  });
  const successCount = results.filter((result) => result.ok).length;
  const failedCount = results.length - successCount;
  const completedAt = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE institution_batch_jobs
      SET status = 'completed', success_count = ?, failed_count = ?, completed_at = ?
      WHERE id = ?`)
      .bind(successCount, failedCount, completedAt, id),
    db.prepare(`INSERT INTO pro_usage_events
      (id, user_id, action, units, created_at)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), userId, `institution.${action}`, records.length, completedAt),
  ]);
  return {
    id,
    action,
    status: "completed",
    recordCount: records.length,
    successCount,
    failedCount,
    results,
    createdAt,
    completedAt,
  };
}

export function apiJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}
