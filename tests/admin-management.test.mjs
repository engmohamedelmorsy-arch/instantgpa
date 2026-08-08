import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("owner dashboard covers accounts, verified PayPal access, controls, and audit history", async () => {
  const panel = await readFile(new URL("static-site/assets/admin-panel.js", root), "utf8");
  for (const section of [
    "Users & access",
    "PayPal-controlled access",
    "Operational settings",
    "Owner activity",
  ]) {
    assert.match(panel, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(panel, /data-user-status/);
  assert.match(panel, /Paid subscriptions only/);
  assert.doesNotMatch(panel, /waitlist|discount code|country pricing/i);
});

test("legacy waitlist, fake discounts, and country-price checkout paths are removed", async () => {
  const [shared, route, panel, cloudSync, migration] = await Promise.all([
    readFile(new URL("app/api/_shared/admin-data.ts", root), "utf8"),
    readFile(new URL("app/api/admin/route.ts", root), "utf8"),
    readFile(new URL("static-site/assets/admin-panel.js", root), "utf8"),
    readFile(new URL("static-site/assets/cloud-sync.js", root), "utf8"),
    readFile(new URL("drizzle/0009_remove_legacy_enrollment.sql", root), "utf8"),
  ]);
  for (const source of [shared, route, panel, cloudSync]) {
    assert.doesNotMatch(source, /premium_waitlist|redeemPromotion|create_promotion|save_country_price/);
  }
  assert.match(migration, /DROP TABLE IF EXISTS `premium_waitlist`/);
  assert.match(migration, /DROP TABLE IF EXISTS `promotions`/);
  assert.match(migration, /DROP TABLE IF EXISTS `country_prices`/);
});

test("management API is owner-only, audited, and same-origin for changes", async () => {
  const shared = await readFile(new URL("app/api/_shared/admin-data.ts", root), "utf8");
  const route = await readFile(new URL("app/api/admin/route.ts", root), "utf8");
  assert.match(shared, /emailVerified/);
  assert.match(shared, /ownerEmails\(\)\.has/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /await requireOwner\(request\)/);
  assert.match(route, /await audit\(/);
  assert.match(route, /The owner account cannot be blocked/);
});

test("verified owner identity is migrated to Firebase and redirected to administration", async () => {
  const shared = await readFile(new URL("app/api/_shared/admin-data.ts", root), "utf8");
  const account = await readFile(new URL("static-site/assets/firebase-account-page.js", root), "utf8");

  assert.match(shared, /migrateSiteUserIdentity/);
  assert.match(shared, /UPDATE site_users SET id = \? WHERE id = \?/);
  assert.match(shared, /UPDATE academic_report_shares SET user_id = \? WHERE user_id = \?/);
  assert.match(shared, /!isPendingIdentity && !isOwnerIdentity\(user\)/);
  assert.match(account, /window\.location\.replace\("\/admin"\)/);
});

test("only a live PayPal entitlement or the single Owner unlocks Premium", async () => {
  const [shared, status, institution] = await Promise.all([
    readFile(new URL("app/api/_shared/admin-data.ts", root), "utf8"),
    readFile(new URL("app/api/account/status/route.ts", root), "utf8"),
    readFile(new URL("app/api/_shared/institution-api.ts", root), "utf8"),
  ]);
  assert.match(shared, /isActivePayPalEntitlement/);
  assert.match(shared, /source === "paypal"/);
  assert.match(status, /isActivePayPalEntitlement\(internal\.status, internal\.source\)/);
  assert.match(institution, /restricted to the verified Owner/);
  assert.doesNotMatch(shared, /gifted|trialing/);
});
