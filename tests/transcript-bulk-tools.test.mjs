import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  applyBulkValue,
  bulkTargetSummary,
  normalizeBulkValue,
} from "../static-site/assets/transcript-bulk-tools.js";

function records() {
  return [
    { include: true, importAction: "", term: "Semester 1", credits: null, grade: "" },
    { include: true, importAction: "", term: "Semester 1", credits: 4, grade: "A" },
    { include: false, importAction: "", term: "", credits: null, grade: "" },
    { include: true, importAction: "ignore", term: "", credits: null, grade: "" },
  ];
}

test("bulk credits fill only missing included rows by default", () => {
  const rows = records();
  const result = applyBulkValue(rows, {
    field: "credits",
    rawValue: "3",
    mode: "missing",
  });

  assert.equal(result.changed, 1);
  assert.equal(rows[0].credits, 3);
  assert.equal(rows[1].credits, 4);
  assert.equal(rows[2].credits, null);
});

test("bulk replacement reports existing values before changing them", () => {
  const rows = records();
  const summary = bulkTargetSummary(rows, {
    field: "credits",
    rawValue: "3",
    mode: "all",
  });

  assert.deepEqual(summary, { valid: true, targets: 2, replacements: 1 });
  applyBulkValue(rows, { field: "credits", rawValue: "3", mode: "all" });
  assert.equal(rows[0].credits, 3);
  assert.equal(rows[1].credits, 3);
});

test("bulk values reject invalid fields and credit ranges", () => {
  assert.equal(normalizeBulkValue("credits", "0").ok, false);
  assert.equal(normalizeBulkValue("credits", "61").ok, false);
  assert.equal(normalizeBulkValue("code", "CS101").ok, false);
});

test("transcript import provides course deletion and a five-second GPA redirect", async () => {
  const source = await readFile(new URL("../static-site/assets/transcript-import.js", import.meta.url), "utf8");
  assert.match(source, /AUTO_REDIRECT_SECONDS = 5/);
  assert.match(source, /navigateTo\("gpa-calculator"\)/);
  assert.match(source, /Your transcript is approved and ready/);
  assert.match(source, /We’ll take you to GPA in/);
  assert.match(source, /Continue to GPA/);
  assert.match(source, /data-remove-review=/);
  assert.match(source, /data-delete-course=/);
  assert.match(source, /AcademicRecord\.removeCourse/);
});

test("current GPA course slots render as one clear full-width row per course", async () => {
  const [layout, workspaceLayout, calculator] = await Promise.all([
    readFile(new URL("../static-site/assets/navy-gold-v50.css", import.meta.url), "utf8"),
    readFile(new URL("../static-site/assets/student-ui-v43.css", import.meta.url), "utf8"),
    readFile(new URL("../static-site/assets/gpa-calculator.js", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /\.gpa-entry-workspace \.course-row/);
  assert.match(workspaceLayout, /\.gpa-entry-workspace \.course-rows/);
  assert.match(calculator, /class="course-rows"/);
  assert.match(calculator, /class="course-row course-row--head"/);
});

test("workspace tools use visible buttons instead of a dropdown switcher", async () => {
  const source = await readFile(new URL("../static-site/assets/app.js", import.meta.url), "utf8");
  assert.match(source, /workspace-subnav workspace-tool-buttons/);
  assert.doesNotMatch(source, /<details class="workspace-tool-switcher"/);
});
