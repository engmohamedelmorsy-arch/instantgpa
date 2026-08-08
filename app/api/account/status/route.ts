import { waitUntil } from "cloudflare:workers";
import {
  authenticateFirebase,
  ensureAdminSchema,
  errorResponse,
  getAdminDb,
  isActivePayPalEntitlement,
  isOwnerIdentity,
  premiumOwnerOnly,
} from "../../_shared/admin-data";
import { sendPremiumWelcomeEmail } from "../../_shared/email";
import {
  deleteFirestoreDocument,
  getFirestoreDocument,
  setFirestoreDocument,
} from "../../_shared/firebase-admin-rest";
import {
  getEmailDelivery,
  getPremiumAccount,
  getPremiumEntitlement,
  setEmailDelivery,
  setPayPalCheckout,
  setPayPalSubscriptionRecord,
  setPremiumEntitlement,
  setPremiumUsageEvent,
  upsertPremiumAccount,
  type PremiumEntitlement,
  type PremiumIdentity,
} from "../../_shared/premium-firestore";

type UpstreamStatus = { usage?: Record<string, unknown> | null };
type LegacyEntitlement = {
  plan: string;
  status: string;
  source: string;
  monthlyPageLimit: number;
  startsAt: string;
  endsAt: string | null;
  note: string | null;
};
type LegacyAcademicRecord = {
  ownerKey: string;
  payload: string;
  courseCount: number;
  semesterCount: number;
  createdAt: string;
  updatedAt: string;
};
type LegacyReportShare = {
  id: string;
  tokenHash: string;
  title: string;
  scope: string;
  payload: string;
  passwordHash: string | null;
  passwordSalt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  lastAccessedAt: string | null;
  viewCount: number;
};
type LegacyUser = {
  email: string;
  displayName: string | null;
  emailVerified: number;
  provider: string;
  status: string;
  createdAt: string;
  lastSeenAt: string;
};
type LegacyWebhook = {
  eventId: string;
  eventType: string;
  subscriptionId: string | null;
  status: string;
  receivedAt: string;
  processedAt: string | null;
  error: string | null;
};

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseUpstreamStatus(value: unknown): UpstreamStatus | null {
  const body = objectRecord(value);
  return body ? { usage: objectRecord(body.usage) } : null;
}

function parsedObject(value: string): Record<string, unknown> | null {
  try { return objectRecord(JSON.parse(value)); } catch { return null; }
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

async function sendWelcomeOnce(user: PremiumIdentity) {
  const existing = await getEmailDelivery(user.id, "premium-welcome");
  if (existing?.status === "sent") return;
  const updatedAt = Date.parse(String(existing?.updatedAt || ""));
  if (existing?.status === "pending" && Number.isFinite(updatedAt) && updatedAt > Date.now() - 10 * 60 * 1_000) return;
  const now = new Date().toISOString();
  await setEmailDelivery(user.id, "premium-welcome", {
    uid: user.id,
    emailType: "premium_welcome",
    status: "pending",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  const result = await sendPremiumWelcomeEmail(user.email, user.displayName);
  await setEmailDelivery(user.id, "premium-welcome", {
    uid: user.id,
    emailType: "premium_welcome",
    status: !result.configured ? "provider_not_configured" : result.sent ? "sent" : "failed",
    providerMessageId: result.id || null,
    error: result.error || null,
    createdAt: existing?.createdAt || now,
    updatedAt: new Date().toISOString(),
  });
}

async function migrateAndRemoveLegacyPremiumData(
  user: PremiumIdentity,
  current: PremiumEntitlement | null,
  account: Record<string, unknown>,
) {
  if (Number(account.legacyD1MigrationVersion) >= 1) return current;
  await ensureAdminSchema();
  const db = getAdminDb();
  const legacy = await db.prepare(`SELECT plan, status, source,
    monthly_page_limit AS monthlyPageLimit, starts_at AS startsAt,
    ends_at AS endsAt, note FROM entitlements WHERE user_id = ? LIMIT 1`)
    .bind(user.id).first<LegacyEntitlement>();
  const subscription = await db.prepare(`SELECT subscription_id AS subscriptionId, plan_id AS planId,
    status, payer_id AS payerId, payer_email AS payerEmail, started_at AS startedAt,
    next_billing_at AS nextBillingAt, cancelled_at AS cancelledAt,
    raw_updated_at AS providerUpdatedAt, created_at AS createdAt, updated_at AS updatedAt
    FROM paypal_subscriptions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`)
    .bind(user.id).first<Record<string, unknown>>();
  const webhookEvents = await db.prepare(`SELECT event_id AS eventId, event_type AS eventType,
    subscription_id AS subscriptionId, status, received_at AS receivedAt,
    processed_at AS processedAt, error
    FROM paypal_webhook_events
    WHERE subscription_id IN (SELECT subscription_id FROM paypal_subscriptions WHERE user_id = ?)
    ORDER BY received_at ASC LIMIT 1000`)
    .bind(user.id).all<LegacyWebhook>();
  const checkout = await db.prepare(`SELECT id, subscription_id AS subscriptionId, plan_id AS planId,
    approval_url AS approvalUrl, status, created_at AS createdAt, updated_at AS updatedAt
    FROM paypal_checkout_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(user.id).first<Record<string, unknown>>();
  const email = await db.prepare(`SELECT email_type AS emailType, status,
    provider_message_id AS providerMessageId, error, created_at AS createdAt, updated_at AS updatedAt
    FROM transactional_email_log WHERE user_id = ? AND email_type = 'premium_welcome' LIMIT 1`)
    .bind(user.id).first<Record<string, unknown>>();
  const usage = await db.prepare(`SELECT id, action, units, created_at AS createdAt
    FROM pro_usage_events WHERE user_id = ? ORDER BY created_at ASC LIMIT 1000`)
    .bind(user.id).all<Record<string, unknown>>();
  const legacyUser = await db.prepare(`SELECT email, display_name AS displayName,
    email_verified AS emailVerified, provider, status,
    created_at AS createdAt, last_seen_at AS lastSeenAt
    FROM site_users WHERE id = ? LIMIT 1`).bind(user.id).first<LegacyUser>();
  const academicRecords = await db.prepare(`SELECT owner_key AS ownerKey, payload,
    course_count AS courseCount, semester_count AS semesterCount,
    created_at AS createdAt, updated_at AS updatedAt
    FROM academic_records WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20`)
    .bind(user.id).all<LegacyAcademicRecord>();
  let reportShares: LegacyReportShare[] = [];
  try {
    const rows = await db.prepare(`SELECT id, token_hash AS tokenHash, title, scope, payload,
      password_hash AS passwordHash, password_salt AS passwordSalt,
      expires_at AS expiresAt, revoked_at AS revokedAt, created_at AS createdAt,
      last_accessed_at AS lastAccessedAt, view_count AS viewCount
      FROM academic_report_shares WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`)
      .bind(user.id).all<LegacyReportShare>();
    reportShares = rows.results || [];
  } catch {
    // The legacy share table was created lazily; no table means there is
    // nothing to migrate for this account.
  }

  let entitlement = current;
  if (!entitlement && legacy) {
    entitlement = await setPremiumEntitlement({
      uid: user.id,
      plan: legacy.plan,
      status: legacy.status,
      source: legacy.source,
      subscriptionId: String(subscription?.subscriptionId || "") || null,
      paypalPlanId: String(subscription?.planId || "") || null,
      monthlyPageLimit: legacy.monthlyPageLimit,
      startsAt: legacy.startsAt,
      endsAt: legacy.endsAt,
      updatedAt: new Date().toISOString(),
    });
  }
  const migrations: Promise<unknown>[] = [];
  if (subscription?.subscriptionId) migrations.push(setPayPalSubscriptionRecord(String(subscription.subscriptionId), { ...subscription, uid: user.id }));
  for (const event of webhookEvents.results || []) {
    migrations.push(setFirestoreDocument(`paypalWebhookEvents/${event.eventId}`, { ...event, uid: user.id, migratedFromD1: true }));
  }
  if (checkout) migrations.push(setPayPalCheckout(user.id, { ...checkout, uid: user.id }));
  if (email) migrations.push(setEmailDelivery(user.id, "premium-welcome", { ...email, uid: user.id }));
  for (const event of usage.results || []) migrations.push(setPremiumUsageEvent(user.id, String(event.id), { ...event, uid: user.id }));
  await Promise.all(migrations);
  if (legacyUser) {
    const existingAccount = await getPremiumAccount(user.id) || {};
    const migratedAccount = {
      ...existingAccount,
      uid: user.id,
      email: user.email || legacyUser.email,
      displayName: user.displayName || legacyUser.displayName || "",
      emailVerified: user.emailVerified || Boolean(legacyUser.emailVerified),
      provider: user.provider || legacyUser.provider,
      status: legacyUser.status || existingAccount.status || "active",
      createdAt: legacyUser.createdAt || existingAccount.createdAt || new Date().toISOString(),
      lastSeenAt: existingAccount.lastSeenAt || legacyUser.lastSeenAt,
      migratedFromD1: true,
      migratedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await Promise.all([
      setFirestoreDocument(`premiumUsers/${user.id}/account/current`, migratedAccount),
      setFirestoreDocument(`premiumAccounts/${user.id}`, migratedAccount),
    ]);
  }

  const existingAcademic = await getFirestoreDocument<Record<string, unknown>>(`premiumUsers/${user.id}/academic/current`);
  for (const [index, record] of (academicRecords.results || []).entries()) {
    const snapshot = parsedObject(record.payload) || {
      legacyPayload: record.payload,
      legacyPayloadParseFailed: true,
    };
    const target = !existingAcademic && index === 0
      ? `premiumUsers/${user.id}/academic/current`
      : `premiumUsers/${user.id}/academic/legacy-d1-${index + 1}`;
    await setFirestoreDocument(target, {
      ...snapshot,
      migratedFromD1: true,
      legacyOwnerKey: record.ownerKey,
      legacyCourseCount: Number(record.courseCount) || 0,
      legacySemesterCount: Number(record.semesterCount) || 0,
      legacyCreatedAt: record.createdAt,
      legacyUpdatedAt: record.updatedAt,
      migratedAt: new Date().toISOString(),
    });
  }

  for (const share of reportShares) {
    const legacyFirebaseId = share.payload.startsWith("firebase:") ? share.payload.slice("firebase:".length) : "";
    const oldCloudShare = legacyFirebaseId
      ? await getFirestoreDocument<Record<string, unknown>>(`reportShares/${legacyFirebaseId}`)
      : null;
    const payload = oldCloudShare?.payload || parsedObject(share.payload) || { legacyPayload: share.payload };
    const migratedShare = {
      ...(oldCloudShare || {}),
      id: share.id,
      userId: user.id,
      tokenHash: share.tokenHash,
      title: share.title,
      scope: share.scope,
      payload,
      passwordHash: share.passwordHash,
      passwordSalt: share.passwordSalt,
      expiresAt: share.expiresAt,
      revokedAt: share.revokedAt,
      createdAt: share.createdAt,
      lastAccessedAt: share.lastAccessedAt,
      viewCount: Number(share.viewCount) || 0,
      migratedFromD1: true,
      migratedAt: new Date().toISOString(),
    };
    await setFirestoreDocument(`premiumUsers/${user.id}/reportShares/${share.id}`, migratedShare);
    if (!share.revokedAt) {
      await setFirestoreDocument(`reportShareTokens/${share.tokenHash}`, {
        shareId: share.id,
        userId: user.id,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
      });
    }
    if (legacyFirebaseId) await deleteFirestoreDocument(`reportShares/${legacyFirebaseId}`);
  }

  if (legacyUser || legacy || subscription || checkout || email || (webhookEvents.results || []).length || (usage.results || []).length || (academicRecords.results || []).length || reportShares.length) {
    const cleanup = [
      db.prepare("DELETE FROM paypal_webhook_events WHERE subscription_id IN (SELECT subscription_id FROM paypal_subscriptions WHERE user_id = ?)").bind(user.id),
      db.prepare("DELETE FROM transactional_email_log WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM pro_usage_events WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM paypal_checkout_sessions WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM paypal_subscriptions WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM entitlements WHERE user_id = ?").bind(user.id),
      db.prepare("UPDATE academic_profile_contributions SET user_id = NULL WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM academic_records WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM site_users WHERE id = ?").bind(user.id),
    ];
    if (reportShares.length) {
      cleanup.unshift(
        db.prepare("DELETE FROM academic_report_share_attempts WHERE share_token_hash IN (SELECT token_hash FROM academic_report_shares WHERE user_id = ?)").bind(user.id),
        db.prepare("DELETE FROM academic_report_shares WHERE user_id = ?").bind(user.id),
      );
    }
    await db.batch(cleanup);
  }
  const latestAccount = await getPremiumAccount(user.id) || account;
  const migrationState = {
    ...latestAccount,
    legacyD1MigrationVersion: 1,
    legacyD1MigratedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await Promise.all([
    setFirestoreDocument(`premiumUsers/${user.id}/account/current`, migrationState),
    setFirestoreDocument(`premiumAccounts/${user.id}`, migrationState),
  ]);
  return entitlement;
}

export async function GET(request: Request) {
  const serviceUrl = process.env.TRANSCRIPT_SERVICE_URL?.replace(/\/+$/, "");
  const backendKey = process.env.INSTANTGPA_BACKEND_KEY;
  try {
    const user = await authenticateFirebase(request);
    const initialAccount = await upsertPremiumAccount(user);
    const isOwner = isOwnerIdentity(user);
    const ownerOnly = premiumOwnerOnly();
    const now = new Date().toISOString();
    let internal = await getPremiumEntitlement(user.id);
    internal = await migrateAndRemoveLegacyPremiumData(user, internal, initialAccount);
    const account = await getPremiumAccount(user.id);
    if (account?.status === "blocked") return json({ error: "This account has been blocked by the site owner.", code: "ACCOUNT_BLOCKED" }, 403);
    if (internal?.endsAt && internal.endsAt <= now && internal.status === "active") {
      internal = await setPremiumEntitlement({ ...internal, status: "expired", updatedAt: now });
    }

    let upstreamBody: UpstreamStatus | null = null;
    let upstreamAvailable = false;
    if (serviceUrl && (isOwner || !ownerOnly)) {
      try {
        const upstream = await fetch(`${serviceUrl}/v1/me`, {
          headers: {
            ...(backendKey ? { "x-instantgpa-backend-key": backendKey } : {}),
            authorization: request.headers.get("authorization") || "",
            ...(request.headers.get("x-firebase-appcheck") ? { "x-firebase-appcheck": request.headers.get("x-firebase-appcheck")! } : {}),
          },
          cache: "no-store",
        });
        upstreamBody = parseUpstreamStatus(await upstream.json().catch(() => null));
        upstreamAvailable = upstream.ok;
      } catch { upstreamAvailable = false; }
    }

    const internalActive = Boolean(internal && isActivePayPalEntitlement(internal.status, internal.source) && (!internal.endsAt || internal.endsAt > now));
    const entitlement: PremiumEntitlement & { cloudOcr: boolean } = isOwner ? {
      uid: user.id, plan: "InstantGPA Pro — Owner", status: "active", source: "owner",
      monthlyPageLimit: 100_000, startsAt: now, endsAt: null, cloudOcr: true, updatedAt: now,
    } : !ownerOnly && internalActive && internal ? { ...internal, cloudOcr: true } : {
      uid: user.id, plan: "Payment not active", status: "inactive", source: "pending",
      monthlyPageLimit: 0, startsAt: null, endsAt: null, cloudOcr: false, updatedAt: now,
    };

    if (isOwner) await setPremiumEntitlement(entitlement);
    if (upstreamBody?.usage) await setFirestoreDocument(`premiumUsers/${user.id}/usage/current`, { ...upstreamBody.usage, updatedAt: now });
    if (!isOwner && entitlement.status === "active" && entitlement.source === "paypal") {
      waitUntil(sendWelcomeOnce(user).catch(() => { /* retried on a later status check */ }));
    }
    return json({
      user: { id: user.id, email: user.email, displayName: user.displayName },
      isOwner,
      premiumMode: ownerOnly ? "owner_only" : "open",
      entitlement,
      usage: upstreamBody?.usage || null,
      secureOcrConnected: (isOwner || !ownerOnly) && upstreamAvailable,
      emailDelivery: entitlement.status === "active" ? await getEmailDelivery(user.id, "premium-welcome") : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
