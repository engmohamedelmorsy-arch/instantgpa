import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("first-party funnel collection excludes academic and identity fields", async () => {
  const [client, shared, events] = await Promise.all([
    readFile(new URL("static-site/assets/analytics.js", root), "utf8"),
    readFile(new URL("app/api/_shared/product-observability.ts", root), "utf8"),
    readFile(new URL("app/api/analytics/events/route.ts", root), "utf8"),
  ]);
  assert.match(client, /transcript_upload_started/);
  assert.match(client, /checkout_completed/);
  assert.match(shared, /safeMetadata/);
  assert.match(events, /assertSameOrigin\(request\)/);
  assert.doesNotMatch(shared, /courseName|courseCode|studentId|gpaValue/i);
});

test("operational errors and feedback are sanitized and have bounded retention", async () => {
  const [errors, feedback, privacy] = await Promise.all([
    readFile(new URL("app/api/analytics/errors/route.ts", root), "utf8"),
    readFile(new URL("app/api/feedback/route.ts", root), "utf8"),
    readFile(new URL("static-site/privacy.html", root), "utf8"),
  ]);
  assert.match(errors, /sanitizeMessage/);
  assert.match(feedback, /500/);
  assert.match(privacy, /180 days/);
  assert.match(privacy, /90 days/);
  assert.match(privacy, /180 يوم/);
  assert.match(privacy, /90 يوم/);
});

test("the Owner dashboard exposes conversion and quality signals", async () => {
  const panel = await readFile(new URL("static-site/assets/admin-panel.js", root), "utf8");
  assert.match(panel, /Funnel & errors/);
  assert.match(panel, /Positive feedback/);
  assert.match(panel, /conversionFromPrevious/);
  assert.match(panel, /dropOffFromPrevious/);
});
