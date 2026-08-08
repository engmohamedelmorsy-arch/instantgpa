import assert from "node:assert/strict";
import test from "node:test";

import { inferAuditSetup } from "../static-site/assets/degree-audit-inference.js";

test("a published program total becomes the safe editable audit when only completed transcript rows exist", () => {
  const result = inferAuditSetup([
    { attemptId: "a1", code: "CS101", name: "Programming I", credits: 3, grade: "A", status: "graded" },
    { attemptId: "a2", code: "MA101", name: "Calculus", credits: 4, grade: "B+", status: "graded" },
  ], { totalCreditsRequired: 180 });

  assert.equal(result.source, "program-total");
  assert.deepEqual(result.groups.map(({ name, creditsRequired }) => ({ name, creditsRequired })), [
    { name: "Program requirements", creditsRequired: 180 },
  ]);
  assert.equal(result.assignments.a1, result.groups[0].id);
  assert.equal(result.assignments.a2, result.groups[0].id);
});

test("a complete study plan seeds requirement groups and assignments from reviewed course types", () => {
  const result = inferAuditSetup([
    { attemptId: "core-1", code: "CS101", type: "Core", credits: 3, grade: "A", status: "graded" },
    { attemptId: "core-2", code: "CS102", type: "Core", credits: 4, grade: "U", status: "in_progress" },
    { attemptId: "elective-1", code: "EL201", type: "Elective", credits: 2, grade: "--", status: "planned" },
  ], { totalCreditsRequired: 12 });

  assert.equal(result.source, "study-plan-types");
  assert.deepEqual(result.groups.map(({ name, creditsRequired }) => ({ name, creditsRequired })), [
    { name: "Core courses", creditsRequired: 7 },
    { name: "Elective courses", creditsRequired: 2 },
    { name: "Other program requirements", creditsRequired: 3 },
  ]);
  assert.equal(result.assignments["core-2"], result.groups[0].id);
  assert.equal(result.assignments["elective-1"], result.groups[1].id);
});

test("retake attempts stay assignable but do not inflate inferred requirement credits", () => {
  const result = inferAuditSetup([
    { attemptId: "old", code: "CS101", type: "Core", credits: 3, grade: "F", status: "graded" },
    { attemptId: "new", code: "CS101", type: "Core", credits: 3, grade: "U", status: "in_progress", isRetake: true },
    { attemptId: "next", code: "CS102", type: "Core", credits: 4, grade: "--", status: "planned" },
  ]);

  assert.equal(result.groups[0].creditsRequired, 7);
  assert.equal(result.assignments.old, result.groups[0].id);
  assert.equal(result.assignments.new, result.groups[0].id);
});
