import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }
}

globalThis.window = {
  localStorage: new MemoryStorage(),
  dispatchEvent() {},
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

const { AcademicRecord } = await import("../static-site/assets/academic-record.js");

test("a saved transcript course can be removed without affecting other courses", () => {
  const saved = AcademicRecord.save([
    { term: "Semester 1", code: "CS101", name: "Programming", credits: 3, grade: "A" },
    { term: "Semester 1", code: "MA101", name: "Calculus", credits: 3, grade: "B" },
  ]);

  assert.ok(saved);
  const [firstCourse] = AcademicRecord.courses();
  assert.equal(AcademicRecord.removeCourse(firstCourse.attemptId), true);
  assert.deepEqual(AcademicRecord.courses().map((course) => course.code), ["MA101"]);
  assert.equal(AcademicRecord.removeCourse("missing-attempt"), false);
});

test("Free records sync anonymously to D1 while paid records sync privately to Firebase", async () => {
  const [client, cloudSync, route, schema, rules] = await Promise.all([
    readFile(new URL("../static-site/assets/academic-cloud-record.js", import.meta.url), "utf8"),
    readFile(new URL("../static-site/assets/cloud-sync.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/academic-record/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_shared/admin-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  ]);
  assert.match(client, /AcademicRecord\.get\(\)/);
  assert.match(client, /AcademicRecord\.summary\(system\)/);
  assert.match(client, /AcademicProfile\.installId\(\)/);
  assert.match(client, /savePremiumAcademicRecord/);
  assert.match(client, /hydratePremiumAcademicRecord/);
  assert.match(client, /restorePremiumSnapshot/);
  assert.match(client, /transcriptHistory/);
  assert.match(client, /degreeAuditGroups/);
  assert.match(client, /scenarioLabSaved:v1/);
  assert.match(client, /instantgpa:academic-sync-status/);
  assert.match(cloudSync, /firebase-firestore\.js/);
  assert.match(cloudSync, /"premiumUsers", user\.uid, "academic", "current"/);
  assert.match(cloudSync, /loadPremiumAcademicRecord/);
  assert.match(cloudSync, /firestoreSdk\.getDoc/);
  assert.match(route, /`anon:\$\{installId\}`/);
  assert.doesNotMatch(route, /`user:\$\{user\.id\}`/);
  assert.match(route, /ACADEMIC_RECORD_RATE_LIMIT/);
  assert.match(route, /"rawText"/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS academic_records/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS academic_record_rate_limits/);
  assert.match(rules, /function isOwner\(uid\)/);
  assert.match(rules, /request\.auth\.uid == uid/);
});
