import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  #values = new Map();
  get length() { return this.#values.size; }
  getItem(key) { return this.#values.get(key) ?? null; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key) { this.#values.delete(key); }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

globalThis.window = { localStorage: new MemoryStorage(), dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};

const { calculateGpa } = await import("../static-site/assets/gpa-calculator.js");

const system = {
  maxGpa: 4,
  grades: [
    { label: "A", points: 4, min: 90 },
    { label: "B", points: 3, min: 80 },
    { label: "F", points: 0, min: 0 },
  ],
};

test("GPA is weighted by credits and rounded consistently", () => {
  const result = calculateGpa([
    { name: "Calculus", credits: 4, grade: "A" },
    { name: "Writing", credits: 2, grade: "B" },
  ], system);
  assert.deepEqual(result, { ok: true, gpa: 3.667, totalCredits: 6, totalPoints: 22 });
});

test("the same transcript attempt cannot be counted twice", () => {
  const result = calculateGpa([
    { name: "Calculus", credits: 4, grade: "A", sourceAttemptId: "attempt-1" },
    { name: "Calculus", credits: 4, grade: "A", sourceAttemptId: "attempt-1" },
  ], system);
  assert.deepEqual(result, { ok: false, error: "duplicateCourse" });
});
