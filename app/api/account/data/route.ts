import { assertSameOrigin, authenticateFirebase, errorResponse, getAdminDb, json } from "../../_shared/admin-data";
import { cancelPayPalSubscription } from "../../_shared/paypal";
import { getPremiumAccount, getPremiumEntitlement } from "../../_shared/premium-firestore";
import {
  deleteFirestoreDocument, getFirestoreDocument, listAllFirestoreDocuments,
} from "../../_shared/firebase-admin-rest";
import { ensureObservabilitySchema, sha256 } from "../../_shared/product-observability";

const validInstallId = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
const cleanExport = (value: unknown): unknown => Array.isArray(value) ? value.map(cleanExport) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !/(?:passwordHash|passwordSalt|tokenHash|privateKey|secret)/i.test(key)).map(([key, nested]) => [key, cleanExport(nested)])) : value;

async function freeData(installId: string) {
  const db = getAdminDb();
  const [record, profile] = await Promise.all([
    db.prepare("SELECT payload, created_at AS createdAt, updated_at AS updatedAt FROM academic_records WHERE owner_key = ? LIMIT 1").bind(`anon:${installId}`).first<{ payload: string; createdAt: string; updatedAt: string }>(),
    db.prepare(`SELECT country_code AS countryCode, country_name AS countryName, university_name AS university,
      college_name AS college, department_name AS department, grading_system_id AS gradingSystemId,
      grading_system_label AS gradingSystemLabel, quality_status AS qualityStatus, created_at AS createdAt,
      updated_at AS updatedAt FROM academic_profile_contributions WHERE contributor_id = ? LIMIT 1`)
      .bind(`anon:${installId}`).first<Record<string, unknown>>(),
  ]);
  let academicRecord = null;
  try { academicRecord = record?.payload ? JSON.parse(record.payload) : null; } catch { academicRecord = null; }
  return { tier: "free", academicProfile: profile || null, academicRecord, exportedAt: new Date().toISOString() };
}

async function deleteFreeData(installId: string) {
  const db = getAdminDb();
  const existing = await db.prepare(`SELECT university_profile_id AS universityId, college_name AS college,
    department_name AS department FROM academic_profile_contributions WHERE contributor_id = ? LIMIT 1`)
    .bind(`anon:${installId}`).first<{ universityId: string; college: string; department: string }>();
  await ensureObservabilitySchema();
  const installHash = await sha256(installId);
  await db.batch([
    db.prepare("DELETE FROM academic_records WHERE owner_key = ?").bind(`anon:${installId}`),
    db.prepare("DELETE FROM academic_record_rate_limits WHERE owner_key = ?").bind(`anon:${installId}`),
    db.prepare("DELETE FROM academic_profile_contributions WHERE contributor_id = ?").bind(`anon:${installId}`),
    db.prepare("DELETE FROM product_events WHERE install_hash = ?").bind(installHash),
  ]);
  if (existing?.universityId) {
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE university_profiles SET contributor_count =
        (SELECT count(*) FROM academic_profile_contributions WHERE university_profile_id = ?),
        college_count = (SELECT count(DISTINCT lower(college_name)) FROM academic_profile_contributions WHERE university_profile_id = ?),
        department_count = (SELECT count(DISTINCT lower(college_name) || '|' || lower(department_name)) FROM academic_profile_contributions WHERE university_profile_id = ?),
        updated_at = ? WHERE id = ?`).bind(existing.universityId, existing.universityId, existing.universityId, now, existing.universityId),
      db.prepare(`UPDATE university_academic_units SET contributor_count =
        (SELECT count(*) FROM academic_profile_contributions WHERE university_profile_id = ?
          AND lower(college_name) = lower(?) AND lower(department_name) = lower(?)), updated_at = ?
        WHERE university_profile_id = ? AND lower(college_name) = lower(?) AND lower(department_name) = lower(?)`)
        .bind(existing.universityId, existing.college, existing.department, now,
          existing.universityId, existing.college, existing.department),
      db.prepare("DELETE FROM university_academic_units WHERE university_profile_id = ? AND contributor_count = 0 AND quality_status <> 'directory_verified'")
        .bind(existing.universityId),
      db.prepare("DELETE FROM university_profiles WHERE id = ? AND contributor_count = 0 AND source_status <> 'directory_verified'")
        .bind(existing.universityId),
    ]);
  }
  return { deleted: true };
}

async function premiumData(uid: string) {
  const [account, entitlement, academic, workspace, checkout, emailDeliveries, usageEvents, reportShares] = await Promise.all([
    getPremiumAccount(uid), getPremiumEntitlement(uid),
    getFirestoreDocument(`premiumUsers/${uid}/academic/current`),
    getFirestoreDocument(`premiumUsers/${uid}/workspace/current`),
    getFirestoreDocument(`paypalCheckoutSessions/${uid}`),
    listAllFirestoreDocuments(`premiumUsers/${uid}/emailDeliveries`),
    listAllFirestoreDocuments(`premiumUsers/${uid}/usageEvents`),
    listAllFirestoreDocuments(`premiumUsers/${uid}/reportShares`),
  ]);
  const subscription = entitlement?.subscriptionId ? await getFirestoreDocument(`paypalSubscriptions/${entitlement.subscriptionId}`) : null;
  return cleanExport({ tier: "premium", account, entitlement, academic, workspace, checkout, subscription, emailDeliveries, usageEvents, reportShares, exportedAt: new Date().toISOString() });
}

async function deletePremiumData(uid: string) {
  const entitlement = await getPremiumEntitlement(uid);
  if (entitlement?.subscriptionId && entitlement.status === "active") await cancelPayPalSubscription(entitlement.subscriptionId);
  const [emailDeliveries, usageEvents, reportShares] = await Promise.all([
    listAllFirestoreDocuments(`premiumUsers/${uid}/emailDeliveries`),
    listAllFirestoreDocuments(`premiumUsers/${uid}/usageEvents`),
    listAllFirestoreDocuments(`premiumUsers/${uid}/reportShares`),
  ]);
  const deletions: Promise<unknown>[] = [];
  for (const entry of [...emailDeliveries.map((row) => `premiumUsers/${uid}/emailDeliveries/${row.id}`), ...usageEvents.map((row) => `premiumUsers/${uid}/usageEvents/${row.id}`)]) {
    deletions.push(deleteFirestoreDocument(entry));
  }
  for (const share of reportShares) {
    deletions.push(deleteFirestoreDocument(`premiumUsers/${uid}/reportShares/${share.id}`));
    if (share.tokenHash) deletions.push(deleteFirestoreDocument(`reportShareTokens/${share.tokenHash}`));
  }
  deletions.push(
    deleteFirestoreDocument(`premiumUsers/${uid}/academic/current`), deleteFirestoreDocument(`premiumUsers/${uid}/workspace/current`),
    deleteFirestoreDocument(`premiumUsers/${uid}/account/current`), deleteFirestoreDocument(`premiumAccounts/${uid}`),
    deleteFirestoreDocument(`entitlements/${uid}`), deleteFirestoreDocument(`paypalCheckoutSessions/${uid}`),
  );
  if (entitlement?.subscriptionId) deletions.push(deleteFirestoreDocument(`paypalSubscriptions/${entitlement.subscriptionId}`));
  await Promise.all(deletions);
  return { deleted: true, firebaseIdentityDeletionRequired: true };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "export_free" || action === "delete_free") {
      const installId = String(body.installId || "").toLowerCase();
      if (!validInstallId(installId)) return json({ error: "Invalid browser installation key.", code: "INVALID_INSTALL_ID" }, 400);
      if (action === "delete_free") {
        if (body.confirmation !== "DELETE") return json({ error: "Deletion confirmation is required.", code: "CONFIRMATION_REQUIRED" }, 400);
        return json(await deleteFreeData(installId));
      }
      return json(await freeData(installId));
    }
    const user = await authenticateFirebase(request);
    if (action === "export_premium") return json(await premiumData(user.id));
    if (action === "delete_premium") {
      if (body.confirmation !== "DELETE") return json({ error: "Deletion confirmation is required.", code: "CONFIRMATION_REQUIRED" }, 400);
      return json(await deletePremiumData(user.id));
    }
    return json({ error: "Unsupported data action.", code: "INVALID_ACTION" }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
