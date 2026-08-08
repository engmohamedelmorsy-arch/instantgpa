import assert from "node:assert/strict";
import test from "node:test";

import { buildPlan } from "../static-site/assets/planning.js";

const system = {
  maxGpa: 4,
  grades: [
    { label: "A", points: 4, min: 90 },
    { label: "F", points: 0, min: 0 },
  ],
};

test("failed courses do not satisfy prerequisites", () => {
  const result = buildPlan([
    { code: "CS101", credits: 3, grade: "F", status: "graded" },
    { code: "CS102", credits: 3, grade: "", status: "planned", prerequisites: ["CS101"] },
  ], { system });
  assert.equal(result.terms.length, 0);
  assert.equal(result.blockedCourses[0].reason, "unmet_prerequisites");
});

test("a later passed retake satisfies prerequisites", () => {
  const result = buildPlan([
    { code: "CS101", credits: 3, grade: "F", status: "graded" },
    { code: "CS101", credits: 3, grade: "A", status: "graded", isRetake: true },
    { code: "CS102", credits: 3, grade: "", status: "planned", prerequisites: ["CS101"] },
  ], { system });
  assert.equal(result.terms[0].courses[0].code, "CS102");
});

test("missing credits and prerequisite cycles remain blocked", () => {
  const result = buildPlan([
    { code: "A", credits: null, grade: "", status: "planned" },
    { code: "B", credits: 3, grade: "", status: "planned", prerequisites: ["C"] },
    { code: "C", credits: 3, grade: "", status: "planned", prerequisites: ["B"] },
  ], { system });
  assert.equal(result.terms.length, 0);
  assert.deepEqual(new Set(result.blockedCourses.map((course) => course.reason)), new Set(["missing_credits", "unmet_prerequisites"]));
});

test("a U course is currently registered, not failed, completed, or scheduled again", () => {
  const result = buildPlan([
    { code: "CB312", credits: null, grade: "U", status: "in_progress" },
    { code: "CB313", credits: 3, grade: "", status: "planned", prerequisites: ["CB312"] },
  ], { system });
  assert.equal(result.inProgressCourses.length, 1);
  assert.equal(result.terms.length, 0);
  assert.equal(result.blockedCourses.length, 1);
  assert.equal(result.blockedCourses[0].code, "CB313");
  assert.equal(result.blockedCourses[0].reason, "unmet_prerequisites");
});

test("a passed course with unknown credit hours still satisfies a prerequisite without adding GPA credits", () => {
  const result = buildPlan([
    { code: "BA329", credits: null, grade: "A", status: "graded" },
    { code: "CB313", credits: 3, grade: "", status: "planned", prerequisites: ["BA329"] },
  ], { system });
  assert.equal(result.terms[0].courses[0].code, "CB313");
});
