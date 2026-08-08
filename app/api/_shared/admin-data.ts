import { env } from "cloudflare:workers";
import {
  getPremiumAccount,
  getPremiumEntitlement,
  setPremiumEntitlement,
  upsertPremiumAccount,
} from "./premium-firestore";
import { setFirestoreDocument } from "./firebase-admin-rest";

const FIREBASE_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "AIzaSyAgOy_cEEkYU4CmHmVJrtqGoqeK5cN_Tig";
const DEFAULT_OWNER_EMAIL = "eng.mohamedelmorsy@gmail.com";

export class AdminHttpError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type FirebaseIdentity = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  provider: string;
};

function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("ADMIN_DATABASE_UNAVAILABLE");
  return db;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return "";
  return authorization.slice(7).trim();
}

export function ownerEmails() {
  // Product policy: there is exactly one Owner. This is intentionally not an
  // environment allow-list so a deployment setting cannot create a second
  // administrator by mistake.
  return new Set([DEFAULT_OWNER_EMAIL]);
}

export function premiumOwnerOnly() {
  // Public account creation and paid Premium enrollment are open. Owner
  // privileges are still checked separately against the one fixed email.
  return false;
}

export function isActivePayPalEntitlement(
  status: string | null | undefined,
  source: string | null | undefined,
) {
  return status === "active" && source === "paypal";
}

export function isOwnerIdentity(user: FirebaseIdentity) {
  return user.emailVerified && ownerEmails().has(user.email);
}

export function ownerDisplayName() {
  return process.env.INSTANTGPA_OWNER_NAME || "Mohamed Elmorsy";
}

export async function authenticateFirebase(request: Request): Promise<FirebaseIdentity> {
  const token = bearerToken(request);
  if (!token) throw new AdminHttpError("Sign in required.", 401, "SIGN_IN_REQUIRED");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      cache: "no-store",
    },
  );
  const body = await response.json().catch(() => ({})) as {
    users?: Array<{
      localId?: string;
      email?: string;
      displayName?: string;
      emailVerified?: boolean;
      providerUserInfo?: Array<{ providerId?: string }>;
    }>;
  };
  const user = body.users?.[0];
  if (!response.ok || !user?.localId || !user.email) {
    throw new AdminHttpError(
      "Your sign-in session is invalid or expired.",
      401,
      "SESSION_EXPIRED",
    );
  }
  return {
    id: user.localId,
    email: user.email.trim().toLowerCase(),
    displayName: user.displayName || "",
    emailVerified: Boolean(user.emailVerified),
    provider: user.providerUserInfo?.[0]?.providerId || "password",
  };
}

export async function ensureAdminSchema() {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS site_users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      provider TEXT NOT NULL DEFAULT 'firebase',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS site_users_last_seen_idx ON site_users(last_seen_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS university_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      country_code TEXT NOT NULL,
      country_name TEXT NOT NULL,
      university_name TEXT NOT NULL,
      university_normalized TEXT NOT NULL,
      university_slug TEXT NOT NULL,
      source_status TEXT NOT NULL DEFAULT 'user_submitted',
      contributor_count INTEGER NOT NULL DEFAULT 0,
      college_count INTEGER NOT NULL DEFAULT 0,
      department_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_contributed_at TEXT NOT NULL,
      UNIQUE(country_code, university_normalized)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS university_profiles_country_idx ON university_profiles(country_code, contributor_count)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS academic_profile_contributions (
      contributor_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,
      install_id TEXT,
      university_profile_id TEXT NOT NULL,
      country_code TEXT NOT NULL,
      country_name TEXT NOT NULL,
      university_name TEXT NOT NULL,
      college_name TEXT NOT NULL,
      department_name TEXT NOT NULL,
      grading_system_id TEXT NOT NULL,
      grading_system_label TEXT NOT NULL,
      directory_university INTEGER NOT NULL DEFAULT 0,
      directory_college INTEGER NOT NULL DEFAULT 0,
      directory_department INTEGER NOT NULL DEFAULT 0,
      quality_status TEXT NOT NULL DEFAULT 'user_submitted',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS academic_profile_contributions_user_idx ON academic_profile_contributions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS academic_profile_contributions_university_idx ON academic_profile_contributions(university_profile_id, updated_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS academic_records (
      owner_key TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,
      install_id TEXT,
      payload TEXT NOT NULL,
      course_count INTEGER NOT NULL DEFAULT 0,
      semester_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS academic_records_user_idx ON academic_records(user_id, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS academic_records_install_idx ON academic_records(install_id, updated_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS academic_record_rate_limits (
      owner_key TEXT PRIMARY KEY NOT NULL,
      window_started_at TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS university_academic_units (
      id TEXT PRIMARY KEY NOT NULL,
      university_profile_id TEXT NOT NULL,
      college_name TEXT NOT NULL,
      college_slug TEXT NOT NULL,
      department_name TEXT NOT NULL,
      department_slug TEXT NOT NULL,
      quality_status TEXT NOT NULL DEFAULT 'user_submitted',
      contributor_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_contributed_at TEXT NOT NULL,
      UNIQUE(university_profile_id, college_slug, department_slug)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS university_academic_units_university_idx ON university_academic_units(university_profile_id, contributor_count)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS entitlements (
      user_id TEXT PRIMARY KEY NOT NULL,
      plan TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      monthly_page_limit INTEGER NOT NULL DEFAULT 90,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      note TEXT,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS entitlements_status_idx ON entitlements(status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS paypal_checkout_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      subscription_id TEXT NOT NULL UNIQUE,
      plan_id TEXT,
      approval_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'approval_pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS paypal_checkout_user_idx ON paypal_checkout_sessions(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS paypal_checkout_plan_idx ON paypal_checkout_sessions(user_id, plan_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS paypal_subscriptions (
      subscription_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payer_id TEXT,
      payer_email TEXT,
      started_at TEXT,
      next_billing_at TEXT,
      cancelled_at TEXT,
      raw_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS paypal_subscriptions_user_idx ON paypal_subscriptions(user_id, status)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS paypal_webhook_events (
      event_id TEXT PRIMARY KEY NOT NULL,
      event_type TEXT NOT NULL,
      subscription_id TEXT,
      status TEXT NOT NULL,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      error TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS paypal_webhook_received_idx ON paypal_webhook_events(received_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY NOT NULL,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_log(created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS pro_usage_events (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      units INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS pro_usage_user_created_idx ON pro_usage_events(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS pro_usage_action_created_idx ON pro_usage_events(action, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS transactional_email_log (
      dedupe_key TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      email_type TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_message_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS transactional_email_user_idx ON transactional_email_log(user_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS institution_api_keys (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      scopes TEXT NOT NULL DEFAULT 'bulk:analyze',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS institution_api_keys_user_idx ON institution_api_keys(user_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS institution_batch_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      api_key_id TEXT,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      record_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS institution_batch_jobs_user_idx ON institution_batch_jobs(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS institution_batch_jobs_key_idx ON institution_batch_jobs(api_key_id, created_at)"),
  ]);
}

async function migrateSiteUserIdentity(db: D1Database, fromId: string, toId: string) {
  if (!fromId || fromId === toId) return;

  const target = await db.prepare("SELECT id FROM site_users WHERE id = ? LIMIT 1")
    .bind(toId)
    .first<{ id: string }>();
  if (target?.id) {
    throw new AdminHttpError(
      "This administrator account is already linked to another identity.",
      409,
      "ACCOUNT_IDENTITY_CONFLICT",
    );
  }

  await db.batch([
    db.prepare("UPDATE OR IGNORE entitlements SET user_id = ? WHERE user_id = ?").bind(toId, fromId),
    db.prepare("DELETE FROM entitlements WHERE user_id = ?").bind(fromId),
    db.prepare("UPDATE paypal_checkout_sessions SET user_id = ? WHERE user_id = ?").bind(toId, fromId),
    db.prepare("UPDATE paypal_subscriptions SET user_id = ? WHERE user_id = ?").bind(toId, fromId),
    db.prepare("UPDATE site_settings SET updated_by = ? WHERE updated_by = ?").bind(toId, fromId),
    db.prepare("UPDATE pro_usage_events SET user_id = ? WHERE user_id = ?").bind(toId, fromId),
    db.prepare("UPDATE academic_report_shares SET user_id = ? WHERE user_id = ?").bind(toId, fromId),
    db.prepare("UPDATE institution_api_keys SET user_id = ? WHERE user_id = ?").bind(toId, fromId),
    db.prepare("UPDATE institution_batch_jobs SET user_id = ? WHERE user_id = ?").bind(toId, fromId),
    db.prepare("UPDATE OR IGNORE academic_profile_contributions SET user_id = ?, contributor_id = ? WHERE user_id = ?")
      .bind(toId, `user:${toId}`, fromId),
    db.prepare("DELETE FROM academic_profile_contributions WHERE user_id = ?").bind(fromId),
    db.prepare("UPDATE OR IGNORE academic_records SET user_id = ?, owner_key = ? WHERE user_id = ?")
      .bind(toId, `user:${toId}`, fromId),
    db.prepare("DELETE FROM academic_records WHERE user_id = ?").bind(fromId),
    db.prepare("UPDATE site_users SET id = ? WHERE id = ?").bind(toId, fromId),
  ]);
}

export async function upsertSiteUser(user: FirebaseIdentity) {
  await ensureAdminSchema();
  const db = database();
  const now = new Date().toISOString();
  const existingIdentity = await db.prepare(
    "SELECT id FROM site_users WHERE lower(email) = ? LIMIT 1",
  ).bind(user.email).first<{ id: string }>();

  if (existingIdentity?.id && existingIdentity.id !== user.id) {
    const isPendingIdentity = existingIdentity.id.startsWith("pending:");
    if (!isPendingIdentity && !isOwnerIdentity(user)) {
      throw new AdminHttpError(
        "This email is already linked to another account.",
        409,
        "ACCOUNT_IDENTITY_CONFLICT",
      );
    }
    await migrateSiteUserIdentity(db, existingIdentity.id, user.id);
  }

  await db.prepare(`INSERT INTO site_users
    (id, email, display_name, email_verified, provider, status, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      email_verified = excluded.email_verified,
      provider = excluded.provider,
      last_seen_at = excluded.last_seen_at`)
    .bind(
      user.id,
      user.email,
      user.displayName,
      user.emailVerified ? 1 : 0,
      user.provider,
      now,
      now,
    )
    .run();
  return user;
}

export async function requireOwner(request: Request) {
  const user = await upsertSiteUser(await authenticateFirebase(request));
  if (!isOwnerIdentity(user)) {
    throw new AdminHttpError("Owner access only.", 403, "OWNER_ACCESS_REQUIRED");
  }
  return user;
}

export type ActiveSubscriber = FirebaseIdentity & {
  entitlement: {
    plan: string;
    status: string;
    source: string;
    monthlyPageLimit: number;
    startsAt: string;
    endsAt: string | null;
  };
};

export async function requireActiveSubscriber(request: Request): Promise<ActiveSubscriber> {
  const user = await authenticateFirebase(request);
  await upsertPremiumAccount(user);
  const account = await getPremiumAccount(user.id);
  if (account?.status === "blocked") {
    throw new AdminHttpError(
      "This account has been blocked by the site owner.",
      403,
      "ACCOUNT_BLOCKED",
    );
  }

  if (isOwnerIdentity(user)) {
    const now = new Date().toISOString();
    return {
      ...user,
      entitlement: {
        plan: "InstantGPA Pro — Owner",
        status: "active",
        source: "owner",
        monthlyPageLimit: 100_000,
        startsAt: now,
        endsAt: null,
      },
    };
  }

  if (premiumOwnerOnly()) {
    throw new AdminHttpError(
      "InstantGPA Premium is temporarily closed. Owner access only.",
      403,
      "PREMIUM_OWNER_ONLY",
    );
  }

  const now = new Date().toISOString();
  const entitlement = await getPremiumEntitlement(user.id);

  const active = Boolean(
    entitlement &&
      isActivePayPalEntitlement(entitlement.status, entitlement.source) &&
      (!entitlement.endsAt || entitlement.endsAt > now),
  );
  if (!active || !entitlement) {
    if (
      entitlement?.endsAt &&
      entitlement.endsAt <= now &&
      entitlement.status === "active"
    ) {
      await setPremiumEntitlement({ ...entitlement, status: "expired", updatedAt: now });
    }
    throw new AdminHttpError(
      "An active InstantGPA Pro subscription is required.",
      403,
      "SUBSCRIPTION_REQUIRED",
    );
  }

  return {
    ...user,
    entitlement: {
      plan: entitlement.plan,
      status: entitlement.status,
      source: entitlement.source,
      monthlyPageLimit: entitlement.monthlyPageLimit,
      startsAt: entitlement.startsAt || now,
      endsAt: entitlement.endsAt || null,
    },
  };
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AdminHttpError("Cross-site request rejected.", 403, "CROSS_SITE_REJECTED");
  }
}

export function getAdminDb() {
  return database();
}

export async function audit(
  actorEmail: string,
  action: string,
  targetType: string,
  targetId = "",
  metadata: Record<string, unknown> = {},
) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await setFirestoreDocument(`adminAuditLog/${id}`, {
    id,
    actorEmail,
    action,
    targetType,
    targetId: targetId || null,
    metadata,
    createdAt: now,
  });
}

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof AdminHttpError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (message === "ADMIN_DATABASE_UNAVAILABLE") {
    return json({ error: "The management database is not ready.", code: message }, 503);
  }
  return json({ error: "The management request could not be completed.", code: "ADMIN_ERROR" }, 500);
}
