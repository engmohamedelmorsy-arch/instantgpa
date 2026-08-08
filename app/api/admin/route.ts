import {
  assertSameOrigin,
  audit,
  ensureAdminSchema,
  errorResponse,
  getAdminDb,
  json,
  ownerDisplayName,
  requireOwner,
} from "../_shared/admin-data";
import { getFirestoreDocument, listFirestoreDocuments, setFirestoreDocument } from "../_shared/firebase-admin-rest";

type AdminAction =
  | "set_user_status"
  | "save_settings";

type SettingRow = { key: string; value: string; updatedAt: string };
type AuditRow = {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: string;
  createdAt: string;
};

function cleanText(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(request: Request) {
  try {
    await ensureAdminSchema();
    const owner = await requireOwner(request);
    const db = getAdminDb();
    const now = new Date().toISOString();

    const [directoryMetrics, premiumAccounts, settings, legacyAudit, universityProfiles, academicUnits] = await Promise.all([
      db.prepare(`SELECT
        (SELECT count(*) FROM university_profiles WHERE contributor_count > 0) AS universities,
        (SELECT count(*) FROM academic_profile_contributions) AS academicProfiles,
        (SELECT count(*) FROM academic_profile_contributions WHERE quality_status = 'directory_verified') AS verifiedAcademicProfiles`).first(),
      listFirestoreDocuments<Record<string, unknown>>("premiumAccounts", 250),
      db.prepare("SELECT key, value, updated_at AS updatedAt FROM site_settings ORDER BY key").all(),
      db.prepare(`SELECT id, actor_email AS actorEmail, action, target_type AS targetType,
        target_id AS targetId, metadata, created_at AS createdAt
        FROM admin_audit_log ORDER BY created_at ASC LIMIT 1000`).all<AuditRow>(),
      db.prepare(`SELECT id, country_code AS countryCode, country_name AS countryName,
        university_name AS universityName, source_status AS sourceStatus,
        contributor_count AS contributorCount, college_count AS collegeCount,
        department_count AS departmentCount, created_at AS createdAt,
        updated_at AS updatedAt, last_contributed_at AS lastContributedAt
        FROM university_profiles WHERE contributor_count > 0
        ORDER BY contributor_count DESC, university_name ASC LIMIT 500`).all(),
      db.prepare(`SELECT id, university_profile_id AS universityProfileId,
        college_name AS collegeName, department_name AS departmentName,
        quality_status AS qualityStatus, contributor_count AS contributorCount,
        last_contributed_at AS lastContributedAt
        FROM university_academic_units WHERE contributor_count > 0
        ORDER BY contributor_count DESC, college_name ASC, department_name ASC LIMIT 2000`).all(),
    ]);

    const legacyAuditRows = (legacyAudit.results || []) as AuditRow[];
    if (legacyAuditRows.length) {
      await Promise.all(legacyAuditRows.map((row) => setFirestoreDocument(`adminAuditLog/${row.id}`, {
        id: row.id,
        actorEmail: row.actorEmail,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId || null,
        metadata: (() => { try { return JSON.parse(row.metadata || "{}"); } catch { return {}; } })(),
        createdAt: row.createdAt,
        migratedFromD1: true,
      })));
      await db.batch(legacyAuditRows.map((row) => db.prepare("DELETE FROM admin_audit_log WHERE id = ?").bind(row.id)));
    }
    const auditLog = await listFirestoreDocuments<Record<string, unknown>>("adminAuditLog", 300);

    const users = await Promise.all(premiumAccounts.map(async (account) => {
      const entitlement = await getFirestoreDocument<Record<string, unknown>>(`entitlements/${account.id}`);
      return {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        emailVerified: account.emailVerified,
        provider: account.provider,
        status: account.status,
        createdAt: account.createdAt,
        lastSeenAt: account.lastSeenAt,
        plan: entitlement?.plan || null,
        planStatus: entitlement?.status || "inactive",
        source: entitlement?.source || null,
        monthlyPageLimit: entitlement?.monthlyPageLimit || 0,
        startsAt: entitlement?.startsAt || null,
        endsAt: entitlement?.endsAt || null,
      };
    }));
    users.sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
    const activeAfter = Date.now() - 30 * 86_400_000;
    const metrics = {
      ...(directoryMetrics || {}),
      totalUsers: users.length,
      active30d: users.filter((user) => Date.parse(String(user.lastSeenAt || "")) >= activeAfter).length,
      activePlans: users.filter((user) => user.planStatus === "active" && (!user.endsAt || String(user.endsAt) > now)).length,
    };
    return json({
      owner: { email: owner.email, name: ownerDisplayName() },
      metrics: metrics || {},
      users,
      settings: Object.fromEntries(
        ((settings.results || []) as SettingRow[]).map((row) => [row.key, row.value]),
      ),
      audit: auditLog
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, 100),
      universityProfiles: universityProfiles.results || [],
      academicUnits: academicUnits.results || [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureAdminSchema();
    const owner = await requireOwner(request);
    const db = getAdminDb();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = cleanText(body.action, 40) as AdminAction;
    const now = new Date().toISOString();

    if (action === "set_user_status") {
      const userId = cleanText(body.userId, 120);
      const status = cleanText(body.status, 16);
      if (!["active", "blocked"].includes(status)) {
        return json({ error: "Invalid account status.", code: "INVALID_STATUS" }, 400);
      }
      const user = await getFirestoreDocument<Record<string, unknown>>(`premiumAccounts/${userId}`);
      if (!user) return json({ error: "User not found.", code: "NOT_FOUND" }, 404);
      if (String(user.email || "").toLowerCase() === owner.email) {
        return json({ error: "The owner account cannot be blocked.", code: "OWNER_PROTECTED" }, 400);
      }
      const updated = { ...user, status, updatedAt: now };
      await Promise.all([
        setFirestoreDocument(`premiumAccounts/${userId}`, updated),
        setFirestoreDocument(`premiumUsers/${userId}/account/current`, updated),
      ]);
      await audit(owner.email, `user.${status}`, "user", userId, { email: user.email });
      return json({ ok: true });
    }

    if (action === "save_settings") {
      const allowed = ["registration", "maintenanceMessage", "supportEmail", "trustStatsVisible"];
      const entries = Object.entries((body.settings || {}) as Record<string, unknown>)
        .filter(([key]) => allowed.includes(key))
        .map(([key, value]) => [key, cleanText(value, 500)] as const);
      await db.batch(entries.map(([key, value]) =>
        db.prepare(`INSERT INTO site_settings (key, value, updated_by, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
          .bind(key, value, owner.email, now),
      ));
      await audit(owner.email, "settings.updated", "site", "instantgpa", { keys: entries.map(([key]) => key) });
      return json({ ok: true });
    }

    return json({ error: "Unknown management action.", code: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
