import {
  ensureAdminSchema,
  errorResponse,
  getAdminDb,
  json,
  premiumOwnerOnly,
} from "../_shared/admin-data";
import { firebaseAdminConfigured, listFirestoreDocuments } from "../_shared/firebase-admin-rest";

export async function GET() {
  try {
    await ensureAdminSchema();
    const db = getAdminDb();
    const [rows, premiumAccounts] = await Promise.all([
      db.prepare(
        "SELECT key, value FROM site_settings WHERE key IN ('registration', 'maintenanceMessage', 'supportEmail', 'trustStatsVisible')",
      ).all<{ key: string; value: string }>(),
      firebaseAdminConfigured()
        ? listFirestoreDocuments<Record<string, unknown>>("premiumAccounts", 300).catch(() => [])
        : Promise.resolve([]),
    ]);
    const values = Object.fromEntries((rows.results || []).map((row) => [row.key, row.value]));
    return json({
      premiumMode: premiumOwnerOnly() ? "owner_only" : "open",
      // Accounts are identities for a paid checkout (or the single Owner),
      // never a third "registered free" product tier.
      registration: values.registration === "closed" ? "closed" : "checkout_only",
      maintenanceMessage: values.maintenanceMessage || "",
      supportEmail: values.supportEmail || "",
      trustStats: {
        visible: values.trustStatsVisible === "visible",
        totalUsers: premiumAccounts.length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
