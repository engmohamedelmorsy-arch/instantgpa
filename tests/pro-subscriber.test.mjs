import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Premium workflows allow the owner or an active paid subscriber", async () => {
  const [adminData, workspaceApi, analyzeApi, reportShareApi] = await Promise.all([
    read("app/api/_shared/admin-data.ts"),
    read("app/api/pro/workspace/route.ts"),
    read("app/api/pro/analyze/route.ts"),
    read("app/api/report-shares/route.ts"),
  ]);

  assert.match(adminData, /requireActiveSubscriber/);
  assert.match(adminData, /premiumOwnerOnly/);
  assert.match(adminData, /isOwnerIdentity/);
  assert.match(adminData, /PREMIUM_OWNER_ONLY/);
  assert.match(adminData, /InstantGPA Pro — Owner/);
  assert.match(adminData, /SUBSCRIPTION_REQUIRED/);
  assert.match(adminData, /isActivePayPalEntitlement/);
  assert.match(adminData, /source === "paypal"/);
  assert.match(adminData, /status === "active"/);
  assert.match(adminData, /new Set\(\[DEFAULT_OWNER_EMAIL\]\)/);
  assert.match(adminData, /export function premiumOwnerOnly\(\)[\s\S]*?return false/);
  assert.doesNotMatch(adminData, /INSTANTGPA_OWNER_EMAILS/);
  assert.doesNotMatch(adminData, /\["active", "gifted", "trialing"\]/);
  assert.match(workspaceApi, /requireActiveSubscriber/);
  assert.match(workspaceApi, /WORKSPACE_MOVED_TO_FIREBASE/);
  assert.doesNotMatch(workspaceApi, /INSERT INTO pro_workspaces/);
  assert.match(analyzeApi, /requireActiveSubscriber/);
  assert.match(reportShareApi, /requireActiveSubscriber/);
});

test("InstantGPA Pro implements the connected subscriber workflows", async () => {
  const [workspace, app, cloudSync, checkout, firestoreRules, homePortal] = await Promise.all([
    read("static-site/assets/pro-workspace.js"),
    read("static-site/assets/app.js"),
    read("static-site/assets/cloud-sync.js"),
    read("app/api/subscription/checkout/route.ts"),
    read("firestore.rules"),
    read("static-site/assets/home-portal.js"),
  ]);

  for (const feature of [
    "Live semester",
    "Syllabus",
    "Academic Twin",
    "Academic Undo",
    "Policies",
    "Transfer",
    "Translate",
    "Integrity",
    "Institution",
    "Adviser",
  ]) assert.match(workspace, new RegExp(feature));
  for (const action of [
    "syllabus",
    "syllabus_chat",
    "academic_twin",
    "academic_undo",
    "transfer",
    "translate_document",
    "credit_conversion",
    "integrity",
  ]) {
    assert.match(workspace, new RegExp(`runProAnalysis\\("${action}"`));
  }
  assert.match(workspace, /createReportShare/);
  assert.match(workspace, /text\/calendar/);
  assert.match(workspace, /SHA-256/);
  assert.match(app, /"pro-workspace"/);
  assert.match(cloudSync, /firebase-firestore\.js/);
  assert.match(cloudSync, /"premiumUsers", user\.uid, "workspace", "current"/);
  assert.match(cloudSync, /runTransaction/);
  assert.match(cloudSync, /"premiumUsers", user\.uid, "academic", "current"/);
  assert.match(cloudSync, /\/api\/pro\/analyze/);
  assert.match(cloudSync, /\/api\/pro\/policies/);
  assert.match(cloudSync, /\/api\/pro\/institution\/keys/);
  assert.match(cloudSync, /\/api\/pro\/institution\/bulk/);
  assert.match(cloudSync, /\/api\/subscription\/checkout/);
  assert.match(checkout, /createPayPalSubscription/);
  assert.match(checkout, /EMAIL_VERIFICATION_REQUIRED/);
  assert.match(checkout, /setPayPalCheckout/);
  assert.match(checkout, /approval_pending/);
  assert.match(checkout, /assertSameOrigin/);
  assert.match(firestoreRules, /request\.auth\.uid == uid/);
  assert.match(firestoreRules, /hasActivePremium/);
  assert.match(firestoreRules, /source in \['paypal', 'owner'\]/);
  assert.match(firestoreRules, /allow write: if false/);
  assert.doesNotMatch(firestoreRules, /match \/premiumUsers\/\{uid\}\/\{document=\*\*\} \{\s*allow read, write:/);
  assert.match(app, /"instantgpa-pro"/);
  assert.doesNotMatch(homePortal, /function renderGPA|function renderCGPA|function renderConvert/);
});

test("Premium enrollment uses verified PayPal subscriptions and server-owned Firebase entitlement", async () => {
  const [checkout, webhook, paypal, regionalPricing, entitlement, pricing, cloudSync, location, rules, migration, regionalMigration] = await Promise.all([
    read("app/api/subscription/checkout/route.ts"),
    read("app/api/subscription/paypal/webhook/route.ts"),
    read("app/api/_shared/paypal.ts"),
    read("app/api/_shared/regional-pricing.ts"),
    read("app/api/_shared/paypal-entitlement.ts"),
    read("static-site/assets/pricing-page.js"),
    read("static-site/assets/cloud-sync.js"),
    read("app/api/location/route.ts"),
    read("firestore.rules"),
    read("drizzle/0008_paypal_subscriptions.sql"),
    read("drizzle/0010_regional_paypal_plans.sql"),
  ]);

  assert.match(checkout, /assertSameOrigin\(request\)/);
  assert.match(checkout, /authenticateFirebase/);
  assert.match(checkout, /createPayPalSubscription/);
  assert.match(webhook, /verifyPayPalWebhook/);
  assert.match(webhook, /webhookSubscriptionId/);
  assert.match(paypal, /verify-webhook-signature/);
  assert.match(paypal, /PAYPAL_WEBHOOK_ID/);
  assert.match(paypal, /PAYPAL_CLIENT_SECRET/);
  assert.match(regionalPricing, /PAYPAL_PLAN_\$\{tier\.toUpperCase\(\)\}_\$\{billingPeriod\.toUpperCase\(\)\}/);
  assert.match(paypal, /PAYPAL_PLAN_CONFIGURATION_MISMATCH/);
  assert.match(regionalPricing, /price: 2\.99/);
  assert.match(regionalPricing, /price: 4\.99/);
  assert.match(regionalPricing, /price: 7\.99/);
  assert.match(regionalPricing, /price: 25/);
  assert.match(regionalPricing, /price: 50/);
  assert.match(regionalPricing, /price: 75/);
  assert.match(regionalPricing, /EG/);
  assert.match(checkout, /countryCodeFromRequest/);
  assert.match(checkout, /billingPeriod/);
  assert.match(checkout, /configuredPayPalPlanForCountry/);
  assert.match(location, /request\.cf|cf\?: \{ country\?: string \}/);
  assert.doesNotMatch(location, /x-country-code|x-vercel-ip-country|cloudfront-viewer-country/);
  assert.match(entitlement, /setPremiumEntitlement/);
  assert.match(entitlement, /pricingTier/);
  assert.match(entitlement, /billingPeriod/);
  assert.doesNotMatch(entitlement, /INSERT INTO entitlements/);
  assert.match(entitlement, /setPremiumEntitlement/);
  assert.match(pricing, /Pay with PayPal or card/);
  assert.match(pricing, /billing=monthly/);
  assert.match(pricing, /billing=annual/);
  assert.match(cloudSync, /billingPeriod === "annual"/);
  assert.match(rules, /get\(\/databases\/\$\(database\)\/documents\/entitlements/);
  assert.match(migration, /paypal_subscriptions/);
  assert.match(migration, /paypal_webhook_events/);
  assert.match(regionalMigration, /ADD `plan_id` text/);
});

test("Pro public SEO page is indexable while the private workspace is not", async () => {
  const [siteHtml, sitemapScript, editorial] = await Promise.all([
    read("app/site-html.ts"),
    read("scripts/generate-sitemap.mjs"),
    read("static-site/assets/editorial-content.js"),
  ]);

  assert.match(siteHtml, /"\/instantgpa-pro\/"/);
  assert.match(siteHtml, /"\/pro-workspace\/"[\s\S]*?index: false/);
  assert.match(siteHtml, /isAccessibleForFree: false/);
  assert.match(sitemapScript, /"\/instantgpa-pro\/"/);
  assert.doesNotMatch(sitemapScript, /"\/pro-workspace\/"/);
  assert.match(editorial, /InstantGPA Pro and the Academic Twin/);
});

test("Premium workspace and usage payloads are Firebase-only", async () => {
  const [schema, workspaceApi, usageApi, premiumFirestore] = await Promise.all([
    read("db/schema.ts"),
    read("app/api/pro/workspace/route.ts"),
    read("app/api/pro/analyze/route.ts"),
    read("app/api/_shared/premium-firestore.ts"),
  ]);

  assert.doesNotMatch(schema, /proWorkspaces/);
  assert.match(workspaceApi, /moved to the user's private Firebase record/);
  assert.match(usageApi, /recordPremiumUsage/);
  assert.match(premiumFirestore, /premiumUsers\/\$\{uid\}\/usageEvents/);
  assert.doesNotMatch(usageApi, /INSERT INTO pro_usage_events/);
});

test("Academic Undo uses bounded simulations and exposes evidence and uncertainty", async () => {
  const analysis = await read("app/api/_shared/pro-analysis.ts");

  assert.match(analysis, /const simulations = 5_000/);
  assert.match(analysis, /targetProbability/);
  assert.match(analysis, /scholarshipProbability/);
  assert.match(analysis, /gpaRange95/);
  assert.match(analysis, /policySource/);
  assert.match(analysis, /affectedPrerequisites/);
  assert.match(analysis, /The simulation uses the averages and uncertainty entered by the student/);
});

test("Syllabus chat is source-grounded and credit conversion preserves uncertainty", async () => {
  const analysis = await read("app/api/_shared/pro-analysis.ts");

  assert.match(analysis, /sourceExcerpt/);
  assert.match(analysis, /lineStart/);
  assert.match(analysis, /citations/);
  assert.match(analysis, /I could not find a supported answer/);
  assert.match(analysis, /US semester-credit comparisons are workload heuristics/);
  assert.match(analysis, /two UK credits for one ECTS credit/);
  assert.match(analysis, /not a certified full-document translation/);
});

test("Policy catalog and institutional APIs stay behind active subscriber access", async () => {
  const [policyApi, policyCatalog, keyApi, browserBulk, externalBulk, institutionAuth] = await Promise.all([
    read("app/api/pro/policies/route.ts"),
    read("app/api/_shared/policy-catalog.ts"),
    read("app/api/pro/institution/keys/route.ts"),
    read("app/api/pro/institution/bulk/route.ts"),
    read("app/api/v1/institution/bulk/route.ts"),
    read("app/api/_shared/institution-api.ts"),
  ]);

  assert.match(policyApi, /requireActiveSubscriber/);
  for (const region of ["Egypt", "Gulf", "United States"]) assert.match(policyCatalog, new RegExp(region));
  assert.match(policyCatalog, /College Scorecard API/);
  assert.match(keyApi, /requireOwner/);
  assert.match(keyApi, /sha256/);
  assert.match(browserBulk, /requireOwner/);
  assert.match(externalBulk, /requireInstitutionApiKey/);
  assert.match(institutionAuth, /records\.length > 100/);
  assert.match(institutionAuth, /5_000/);
  assert.match(institutionAuth, /token_hash/);
  assert.match(institutionAuth, /ownerEmails/);
  assert.match(institutionAuth, /OWNER_REQUIRED/);
});

test("the single modern Premium entry accepts the owner or a paid subscriber", async () => {
  const [app, entitlement, workspace, statusApi] = await Promise.all([
    read("static-site/assets/app.js"),
    read("static-site/assets/entitlement.js"),
    read("static-site/assets/pro-workspace.js"),
    read("app/api/account/status/route.ts"),
  ]);

  assert.match(app, /"instantgpa-pro"/);
  assert.match(app, /"pro-workspace"/);
  assert.match(entitlement, /cloudSync\.getAccountStatus/);
  assert.match(entitlement, /status === "active"/);
  assert.match(workspace, /CloudSync\.getAccountStatus/);
  assert.match(workspace, /activeEntitlement/);
  assert.match(statusApi, /const entitlement:[\s\S]*?= isOwner/);
  assert.match(statusApi, /premiumMode: ownerOnly \? "owner_only" : "open"/);
  assert.match(statusApi, /InstantGPA Pro — Owner/);
});

test("secure OCR rejects unreadable and oversized PDFs before the upstream service", async () => {
  const transcriptApi = await read("app/api/transcript/parse/route.ts");

  assert.match(transcriptApi, /PDFDocument\.load/);
  assert.match(transcriptApi, /pdf\.getPageCount\(\)/);
  assert.doesNotMatch(transcriptApi, /pdfjs-dist|DOMMatrix/);
  assert.match(transcriptApi, /pdfPageCount\(file\)/);
  assert.match(transcriptApi, /hasExpectedFileSignature\(file\)/);
  assert.match(transcriptApi, /INVALID_FILE_SIGNATURE/);
  assert.match(transcriptApi, /pages > PREMIUM_MAX_PAGES/);
  assert.match(transcriptApi, /INVALID_PDF/);
  assert.ok(
    transcriptApi.indexOf("pages > PREMIUM_MAX_PAGES")
      < transcriptApi.indexOf("upstreamForm.set"),
    "the local page-limit check must run before the OCR upload",
  );
});

test("public account creation, owner sign-in, and Premium email use Firebase and Resend", async () => {
  const [accountPage, accountLoader, accountClient, cloudSync, adminData, accountStatus, email] = await Promise.all([
    read("app/account/page.tsx"),
    read("app/account/firebase-account-loader.tsx"),
    read("static-site/assets/firebase-account-page.js"),
    read("static-site/assets/cloud-sync.js"),
    read("app/api/_shared/admin-data.ts"),
    read("app/api/account/status/route.ts"),
    read("app/api/_shared/email.ts"),
  ]);

  assert.match(accountPage, /Continue with Google/);
  assert.match(accountPage, /firebaseEmailForm/);
  assert.match(accountPage, /FirebaseAccountLoader/);
  assert.match(accountLoader, /firebase-account-page\.js/);
  assert.match(accountLoader, /firebase-config\.js/);
  assert.match(accountPage, /eng\.mohamedelmorsy@gmail\.com/);
  assert.match(accountPage, /Open Premium workspace/);
  assert.match(accountClient, /CloudSync\.signInWithGoogle/);
  assert.match(accountClient, /CloudSync\.signIn/);
  assert.match(accountClient, /CloudSync\.signUp/);
  assert.match(accountClient, /CloudSync\.resetPassword/);
  assert.match(cloudSync, /signInWithPopup/);
  assert.match(cloudSync, /signInWithRedirect/);
  assert.match(cloudSync, /getRedirectResult/);
  assert.match(cloudSync, /user\.getIdToken/);
  assert.match(cloudSync, /authorization: `Bearer \$\{credentials\.idToken\}`/);
  assert.match(adminData, /accounts:lookup/);
  assert.match(adminData, /transactional_email_log/);
  assert.match(accountStatus, /sendWelcomeOnce/);
  assert.match(accountStatus, /waitUntil\(sendWelcomeOnce/);
  assert.match(email, /api\.resend\.com\/emails/);
  assert.match(email, /RESEND_API_KEY/);
  assert.doesNotMatch(adminData, /oai-authenticated-user-email/);
  assert.doesNotMatch(accountPage, /ChatGPT/);
});

test("Institution tables and migration are generated", async () => {
  const [schema, migration, adminSchema] = await Promise.all([
    read("db/schema.ts"),
    read("drizzle/0003_tranquil_shen.sql"),
    read("app/api/_shared/admin-data.ts"),
  ]);

  assert.match(schema, /institutionApiKeys/);
  assert.match(schema, /institutionBatchJobs/);
  assert.match(migration, /CREATE TABLE `institution_api_keys`/);
  assert.match(migration, /CREATE TABLE `institution_batch_jobs`/);
  assert.match(adminSchema, /CREATE TABLE IF NOT EXISTS institution_api_keys/);
  assert.match(adminSchema, /CREATE TABLE IF NOT EXISTS institution_batch_jobs/);
});

test("PWA caches only the public shell and keeps API responses out of cache", async () => {
  const [manifest, serviceWorker, pwa, index] = await Promise.all([
    read("static-site/manifest.webmanifest"),
    read("static-site/service-worker.js"),
    read("static-site/assets/pwa.js"),
    read("static-site/index.html"),
  ]);

  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /Academic Undo Button/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /SYNC_PRO_DUE_COUNT/);
  assert.match(serviceWorker, /periodicsync/);
  assert.match(pwa, /Notification\.requestPermission/);
  assert.match(pwa, /dueCount/);
  assert.match(index, /rel="manifest"/);
  assert.match(index, /assets\/pwa\.js/);
});
