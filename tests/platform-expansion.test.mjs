import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { combinedEvents, createCalendarExport, parseCalendarFile } from "../static-site/assets/pro-integrations.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("LMS calendar imports are structured, deduplicated, and exportable", () => {
  const calendar = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:canvas-1",
    "DTSTART:20260901T090000Z",
    "SUMMARY:Calculus quiz",
    "DESCRIPTION:Chapter 2",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const imported = parseCalendarFile(calendar, "canvas");
  assert.equal(imported.length, 1);
  assert.equal(imported[0].provider, "canvas");
  assert.equal(imported[0].title, "Calculus quiz");
  const combined = combinedEvents({ calendarEvents: [...imported, { ...imported[0], id: "copy" }], syllabi: [] });
  assert.equal(combined.length, 1);
  assert.match(createCalendarExport(combined), /SUMMARY:Calculus quiz/);
});

test("catalog imports require official sources and Owner review before Premium use", async () => {
  const [ingestion, ownerRoute, premiumRoute, migration] = await Promise.all([
    read("app/api/_shared/catalog-ingestion.ts"),
    read("app/api/admin/catalogs/route.ts"),
    read("app/api/pro/catalogs/route.ts"),
    read("drizzle/0012_academic_catalog_ingestion.sql"),
  ]);
  assert.match(ingestion, /validateOfficialSourceUrl/);
  assert.match(ingestion, /CATALOG_SOURCE_URL_REJECTED/);
  assert.match(ingestion, /catalog_year/);
  assert.match(ingestion, /prerequisiteCodes/);
  assert.match(ownerRoute, /requireOwner/);
  assert.match(ownerRoute, /pending_review/);
  assert.match(ownerRoute, /approved/);
  assert.match(premiumRoute, /requireActiveSubscriber/);
  assert.match(premiumRoute, /status = 'approved'/);
  assert.match(migration, /academic_catalog_facts/);
});

test("grounded intelligence identifies its evidence and refuses unsupported answers", async () => {
  const [intelligence, analysis, workspace] = await Promise.all([
    read("app/api/_shared/grounded-intelligence.ts"),
    read("app/api/_shared/pro-analysis.ts"),
    read("static-site/assets/pro-workspace.js"),
  ]);
  assert.match(intelligence, /@cf\/baai\/bge-m3/);
  assert.match(intelligence, /Uncertain: no approved official source supports an answer/);
  assert.match(intelligence, /sourcePage/);
  assert.match(analysis, /nextTermPlan/);
  assert.match(analysis, /no official next-term offering list was provided/);
  assert.match(analysis, /confidenceBasis/);
  assert.match(workspace, /policy_question/);
  assert.match(workspace, /offeredCourseCodes/);
  assert.match(workspace, /advisorDecisions/);
});

test("data rights cover paginated Premium data and pseudonymous Free records", async () => {
  const [dataRoute, firebaseRest, accountPanel, privacy] = await Promise.all([
    read("app/api/account/data/route.ts"),
    read("app/api/_shared/firebase-admin-rest.ts"),
    read("static-site/assets/account-panel.js"),
    read("static-site/privacy.html"),
  ]);
  assert.match(dataRoute, /export_free/);
  assert.match(dataRoute, /delete_premium/);
  assert.match(dataRoute, /cancelPayPalSubscription/);
  assert.match(firebaseRest, /listAllFirestoreDocuments/);
  assert.match(firebaseRest, /nextPageToken/);
  assert.match(accountPanel, /deleteCurrentFirebaseUser/);
  assert.match(privacy, /self-service JSON export and deletion/);
  assert.match(privacy, /تصدير JSON وحذف البيانات ذاتيًا/);
});

test("the PWA carries deadlines and the public app uses one consolidated stylesheet", async () => {
  const [pwa, serviceWorker, manifest, index, buildScript] = await Promise.all([
    read("static-site/assets/pwa.js"),
    read("static-site/service-worker.js"),
    read("static-site/manifest.webmanifest"),
    read("static-site/index.html"),
    read("scripts/build-verified.sh"),
  ]);
  assert.match(pwa, /deadlines/);
  assert.match(pwa, /setAppBadge/);
  assert.match(serviceWorker, /event\.data/);
  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(manifest, /Calendar and LMS/);
  assert.match(index, /app-bundle\.css/);
  assert.equal((index.match(/<link rel="stylesheet" href="\/assets\/[^\"]+\.css/g) || []).length, 1);
  assert.match(buildScript, /bundle-css\.mjs/);
});

test("large transcript readers are separated from review UI", async () => {
  const [importUi, reader, documentReader] = await Promise.all([
    read("static-site/assets/transcript-import.js"),
    read("static-site/assets/transcript-file-reader.js"),
    read("static-site/assets/document-reader.js"),
  ]);
  assert.match(importUi, /from "\.\/transcript-file-reader\.js"/);
  assert.doesNotMatch(importUi, /Tesseract\.createWorker/);
  assert.match(reader, /FREE_MAX_PDF_PAGES = 3/);
  assert.match(reader, /PREMIUM_MAX_PDF_PAGES = 30/);
  assert.match(reader, /result\.data\.confidence/);
  assert.match(documentReader, /extractAcademicDocument/);
});
