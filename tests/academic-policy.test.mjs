import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCourse,
  normalizeGradeLabel,
  selectAttemptsForGpa,
} from "../static-site/assets/academic-policy.js";

const system = {
  maxGpa: 4,
  grades: [
    { label: "A", points: 4, min: 90 },
    { label: "F", points: 0, min: 0 },
  ],
};

test("normalizes grade spacing and case", () => {
  assert.equal(normalizeGradeLabel(" a - "), "A-");
});

test("separates GPA credits from earned credits outcomes", () => {
  const a = evaluateCourse({ code: "A1", credits: 3, grade: "A", status: "graded" }, system);
  const f = evaluateCourse({ code: "F1", credits: 3, grade: "F", status: "graded" }, system);
  const w = evaluateCourse({ code: "W1", credits: 3, grade: "W", status: "graded" }, system);
  const p = evaluateCourse({ code: "P1", credits: 3, grade: "P", status: "graded" }, system);
  assert.equal(a.includeInGpa, true);
  assert.equal(a.earnsCredit, true);
  assert.equal(f.includeInGpa, true);
  assert.equal(f.earnsCredit, false);
  assert.equal(w.includeInGpa, false);
  assert.equal(w.earnsCredit, false);
  assert.equal(p.includeInGpa, false);
  assert.equal(p.earnsCredit, true);
});

test("unknown grades and missing credits are explicit issues", () => {
  assert.equal(evaluateCourse({ credits: 3, grade: "ZZ", status: "graded" }, system).issue, "unknown_grade");
  assert.equal(evaluateCourse({ credits: null, grade: "A", status: "graded" }, system).issue, "missing_or_invalid_credits");
});

test("an explicitly ungraded U course is in progress, never failed or counted in GPA", () => {
  const course = evaluateCourse({
    code: "CB312",
    credits: null,
    grade: "U",
    status: "in_progress",
  }, system);
  assert.equal(course.outcome, "inProgress");
  assert.equal(course.includeInGpa, false);
  assert.equal(course.earnsCredit, false);
  assert.equal(course.issue, "missing_or_invalid_credits");
});

test("retake selection supports highest and latest without deleting attempts", () => {
  const attempts = [
    evaluateCourse({ code: "CS101", credits: 3, grade: "F", status: "graded" }, system),
    evaluateCourse({ code: "CS101", credits: 3, grade: "A", status: "graded" }, system),
  ];
  assert.equal(selectAttemptsForGpa(attempts, "all").length, 2);
  assert.equal(selectAttemptsForGpa(attempts, "highest")[0].gradePoints, 4);
  assert.equal(selectAttemptsForGpa(attempts, "latest")[0].gradePoints, 4);
});
