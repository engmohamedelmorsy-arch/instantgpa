import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  #values = new Map();
  get length() { return this.#values.size; }
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key) { this.#values.delete(key); }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

globalThis.window = { localStorage: new MemoryStorage(), dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};

const { AcademicRecord } = await import("../static-site/assets/academic-record.js");
const { AcademicState } = await import("../static-site/assets/academic-state.js");
const { Storage } = await import("../static-site/assets/storage.js");

const system = {
  maxGpa: 4,
  retakePolicy: "latest",
  grades: [
    { label: "A", points: 4, min: 90 },
    { label: "B", points: 3, min: 80 },
    { label: "F", points: 0, min: 0 },
  ],
};

test("current-term grade replaces its ungraded transcript attempt exactly once", () => {
  AcademicRecord.save([
    { term: "Fall", code: "CS101", credits: 3, grade: "B" },
    { term: "Spring", code: "CS102", credits: 3, grade: "U", status: "in_progress" },
  ]);
  const current = AcademicRecord.courses().find((course) => course.code === "CS102");
  Storage.set("currentTermGpa:v1", {
    courses: [{ sourceAttemptId: current.attemptId, term: current.term, code: current.code, name: current.name, credits: 3, grade: "A", status: "graded" }],
    updatedAt: new Date().toISOString(),
  });

  const summary = AcademicState.recordSummary(system);
  assert.equal(summary.totalCourses, 2);
  assert.equal(summary.gpaCredits, 6);
  assert.equal(summary.qualityPoints, 21);
  assert.equal(summary.gpa, 3.5);
  assert.equal(summary.courses.filter((course) => course.code === "CS102").length, 1);
});

test("older aggregate credits are added only after the connected record", () => {
  AcademicState.savePreviousRecord({ gpa: 2, credits: 3 });
  const summary = AcademicState.cumulativeSummary(system);
  assert.equal(summary.gpaCredits, 9);
  assert.equal(summary.qualityPoints, 27);
  assert.equal(summary.gpa, 3);
  assert.equal(summary.sourceBreakdown.previous.credits, 3);
});
