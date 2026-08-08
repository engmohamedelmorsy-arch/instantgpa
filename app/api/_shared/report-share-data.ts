import { getAdminDb } from "./admin-data";
import { deleteFirestoreDocument } from "./firebase-admin-rest";

const MAX_REPORT_BYTES = 120_000;
const ALLOWED_SCOPES = new Set(["results", "plan", "full"]);

export type ReportShareRecord = {
  id: string;
  token_hash: string;
  user_id: string;
  title: string;
  scope: string;
  payload: string;
  password_hash: string | null;
  password_salt: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_accessed_at: string | null;
  view_count: number;
};

export async function ensureReportShareSchema() {
  const db = getAdminDb();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS academic_report_shares (
      id TEXT PRIMARY KEY NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      scope TEXT NOT NULL,
      payload TEXT NOT NULL,
      password_hash TEXT,
      password_salt TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      last_accessed_at TEXT,
      view_count INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS academic_report_shares_user_idx ON academic_report_shares(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS academic_report_shares_expiry_idx ON academic_report_shares(expires_at, revoked_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS academic_report_share_attempts (
      share_token_hash TEXT NOT NULL,
      client_key TEXT NOT NULL,
      window_started_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (share_token_hash, client_key)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS academic_report_share_attempts_window_idx ON academic_report_share_attempts(window_started_at)"),
  ]);
  const now = new Date();
  const revokedRetentionCutoff = new Date(now.getTime() - 30 * 86_400_000);
  const staleFirebaseRows = await db.prepare(`SELECT id FROM academic_report_shares
    WHERE payload = ('firebase:' || id)
      AND (expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?))
    LIMIT 100`)
    .bind(now.toISOString(), revokedRetentionCutoff.toISOString())
    .all<{ id: string }>();
  const firestoreCleanup = await Promise.allSettled((staleFirebaseRows.results || []).map((row) =>
    deleteFirestoreDocument(`reportShares/${row.id}`)));
  await Promise.all((staleFirebaseRows.results || []).flatMap((row, index) =>
    firestoreCleanup[index]?.status === "fulfilled"
      ? [db.prepare("DELETE FROM academic_report_shares WHERE id = ?").bind(row.id).run()]
      : []));
  await db.prepare(`DELETE FROM academic_report_shares
    WHERE payload NOT LIKE 'firebase:%'
      AND (expires_at <= ?
        OR (revoked_at IS NOT NULL AND revoked_at <= ?))`)
    .bind(now.toISOString(), revokedRetentionCutoff.toISOString())
    .run();
  await db.prepare("DELETE FROM academic_report_share_attempts WHERE window_started_at <= ?")
    .bind(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
    .run();
}

export function validateShareInput(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("INVALID_REPORT");
  const input = value as Record<string, unknown>;
  const title = String(input.title || "Academic Journey Report").trim().slice(0, 120);
  const scope = String(input.scope || "");
  const expiresInDays = Number(input.expiresInDays);
  const password = String(input.password || "");
  if (!ALLOWED_SCOPES.has(scope)) throw new Error("INVALID_SCOPE");
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) throw new Error("INVALID_EXPIRY");
  if (password && (password.length < 6 || password.length > 72)) throw new Error("INVALID_PASSWORD");
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) throw new Error("INVALID_REPORT");
  const payload = JSON.stringify(input.payload);
  if (new TextEncoder().encode(payload).byteLength > MAX_REPORT_BYTES) throw new Error("REPORT_TOO_LARGE");
  return { title, scope, expiresInDays, password, payload };
}

export function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(value);
}

export async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(bytes));
}

export async function passwordDigest(password: string, salt: string) {
  return digest(`${salt}:${password}`);
}

// A plain !== leaks how many leading characters of the stored digest matched
// through response timing. Both inputs here are fixed-length base64url
// SHA-256 digests, so a length check first does not leak anything about the
// password itself.
export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function publicShareUrl(request: Request, token: string) {
  const url = new URL(request.url);
  return `${url.origin}/shared-report/#token=${encodeURIComponent(token)}`;
}

export function shareErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_REPORT";
  const known: Record<string, { status: number; message: string }> = {
    INVALID_REPORT: { status: 400, message: "The report payload is invalid." },
    INVALID_SCOPE: { status: 400, message: "Choose a valid report scope." },
    INVALID_EXPIRY: { status: 400, message: "Choose an expiry between 1 and 90 days." },
    INVALID_PASSWORD: { status: 400, message: "Use 6 to 72 password characters." },
    REPORT_TOO_LARGE: { status: 413, message: "The report is too large to share safely." },
  };
  return { code, ...(known[code] || { status: 500, message: "The report link request could not be completed." }) };
}
