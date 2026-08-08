import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyMapping,
  guessColumnMapping,
  parseTranscriptText,
} from "../static-site/assets/transcript-parser-core.js";

const projectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the live transcript tool accepts every supported format and uses one parser core", async () => {
  const [source, reader] = await Promise.all([
    projectFile("static-site/assets/transcript-import.js"),
    projectFile("static-site/assets/transcript-file-reader.js"),
  ]);
  const accept = source.match(/accept="([^"]*\.xlsx[^"]*)"/)?.[1] || "";
  for (const format of [".xlsx", ".pdf", ".csv", "image/*"]) assert.match(accept, new RegExp(format.replace(".", "\\.")));
  assert.match(source, /from "\.\/transcript-parser-core\.js"/);
  assert.match(source, /from "\.\/transcript-file-reader\.js"/);
  assert.match(reader, /export async function parseUploadedFile/);
  assert.match(source, /localOcr: mode === "local-ocr"/);
  assert.match(reader, /Google Document AI/);
});

test("structured transcript parsing preserves A+, P, and repeated attempts", () => {
  const parsed = parseTranscriptText([
    "Semester\tCode\tCourse Title\tCredits\tGrade",
    "Fall 2024\tCE101\tConstruction I\t3\tF",
    "Spring 2025\tCE101\tConstruction I\t3\tA+",
    "Spring 2025\tUNI100\tUniversity Skills\t2\tP",
  ].join("\n"));
  const mapping = guessColumnMapping(parsed.headers);
  const result = applyMapping(parsed.rows, mapping);
  assert.equal(result.records.length, 3);
  assert.deepEqual(result.records.map((row) => row.grade), ["F", "A+", "P"]);
  assert.equal(result.records[0].code, result.records[1].code);
});

test("AASTMT Preq.Code and Gr. headers map to separate prerequisite and grade fields", () => {
  const parsed = parseTranscriptText([
    "Semester\tCode\tCourse Title\tStatus\tPreq.Code\tGr.",
    "1\tBA118\tChemistry\tCore\tD",
    "4\tCB242\tStrength of Materials\tCore\tCB241 & CB251\tB",
  ].join("\n"));
  const mapping = guessColumnMapping(parsed.headers);
  const result = applyMapping(parsed.rows, mapping);

  assert.deepEqual(mapping, ["term", "code", "name", "type", "prerequisite", "grade"]);
  assert.equal(result.records[0].prerequisite, "");
  assert.equal(result.records[0].grade, "D");
  assert.equal(result.records[1].prerequisite, "CB241 & CB251");
  assert.equal(result.records[1].grade, "B");
});

test("every imported value is reconciled with the semantic type of its table column", () => {
  const headers = ["Semester", "Course", "Hours", "Course status", "Result", "Prerequisite"];
  const mapping = guessColumnMapping(headers);
  const result = applyMapping([
    ["First", "CC111", "1", "CORE", "CORE", "A"],
    ["Second", "BA114", "Accounting Principles", "3", "ELECTIVE", "B+"],
  ], mapping);

  const course = Object.fromEntries(Object.entries(result.records[0]).filter(([key]) => (
    !["reviewId", "status", "include", "importAction"].includes(key)
  )));
  assert.deepEqual(course, {
    term: "First",
    code: "CC111",
    name: "",
    credits: 1,
    percentage: null,
    grade: "A",
    type: "Core",
    prerequisite: "",
  });
  assert.equal(result.records[1].term, "Second");
  assert.equal(result.records[1].code, "BA114");
  assert.equal(result.records[1].name, "Accounting Principles");
  assert.equal(result.records[1].credits, 3);
  assert.equal(result.records[1].type, "Elective");
  assert.equal(result.records[1].grade, "B+");
  assert.equal(result.records[1].prerequisite, "");
});

test("grades and credit hours can never leak into prerequisites", () => {
  const mapping = guessColumnMapping([
    "Semester", "Code", "Course Title", "Credit Hrs", "Core/Elective", "Grade", "Prereqs",
  ]);
  const result = applyMapping([
    ["Fourth", "CB242", "Strength of Materials", "3", "Core", "B", "CB241 & CB251"],
    ["First", "ME151", "", "1", "Core", "A+", "A+"],
  ], mapping);

  assert.equal(result.records[0].prerequisite, "CB241 & CB251");
  assert.equal(result.records[0].grade, "B");
  assert.equal(result.records[1].credits, 1);
  assert.equal(result.records[1].grade, "A+");
  assert.equal(result.records[1].prerequisite, "");
});

test("a missing course title stays blank instead of duplicating the course code", () => {
  const mapping = guessColumnMapping(["Semester", "Course Code", "Course Title", "Credits", "Grade"]);
  const result = applyMapping([["Fall 2026", "CE101", "", "3", "A"]], mapping);
  assert.equal(result.records[0].name, "");
  assert.equal(result.records[0].code, "CE101");
});

test("compound Course Grade headers do not get misclassified as Course Title", () => {
  assert.deepEqual(
    guessColumnMapping(["Semester", "Course Code", "Course Title", "Credits", "Course Grade"]),
    ["term", "code", "name", "credits", "grade"],
  );
});

test("the live transcript path preserves attempts for the shared policy engine", async () => {
  const [source, record, policy] = await Promise.all([
    projectFile("static-site/assets/transcript-import.js"),
    projectFile("static-site/assets/academic-record.js"),
    projectFile("static-site/assets/academic-policy.js"),
  ]);
  assert.match(source, /AcademicRecord\.import/);
  assert.match(record, /attemptId/);
  assert.match(policy, /selectAttemptsForGpa/);
  assert.match(policy, /highest|latest|average|all/);
});

test("the old embedded transcript application is removed", async () => {
  const sync = await projectFile("scripts/sync-static-site.sh");
  assert.match(sync, /rm -rf "\$\{public_root\}\/instantgpa"/);
  assert.match(sync, /"\$\{public_root\}\/assets\/transcript-reader\.js"/);
});

test("local OCR assets are copied from locked dependencies", async () => {
  const sync = await projectFile("scripts/sync-static-site.sh");
  const transcriptReader = await projectFile("static-site/assets/transcript-file-reader.js");
  const documentReader = await projectFile("static-site/assets/document-reader.js");
  assert.match(sync, /tesseract-worker\.min\.js/);
  assert.match(sync, /tesseract-core\*-lstm\.wasm\.js/);
  assert.match(sync, /eng\.traineddata\.gz/);
  assert.match(sync, /ara\.traineddata\.gz/);
  assert.match(transcriptReader, /LOCAL_OCR_LANGUAGES = \["eng", "ara"\]/);
  for (const source of [transcriptReader, documentReader]) {
    assert.match(source, /workerPath: "\/vendor\/tesseract-worker\.min\.js"/);
    assert.match(source, /langPath: "\/vendor\/tesseract-lang"/);
    assert.match(source, /corePath: "\/vendor\/tesseract-core"/);
  }
});
