import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

const localStorage = new MemoryStorage();
globalThis.window = { localStorage };
globalThis.document = {
  querySelector() {
    return null;
  },
};

const {
  AcademicProfile,
  sortGradeRowsByPoints,
} = await import("../static-site/assets/academic-profile.js");

test("first visit has no implicit academic context", () => {
  assert.equal(AcademicProfile.get(), null);
  assert.equal(AcademicProfile.isConfirmed(), false);
  assert.equal(localStorage.getItem("instantgpa:academicProfile"), null);
  assert.equal(localStorage.getItem("instantgpa:gradingSystem"), null);
});

test("incomplete drafts cannot become active", () => {
  const result = AcademicProfile.confirm(
    { countryCode: "", university: "", presetId: "" },
    null,
  );
  assert.equal(result.ok, false);
  assert.equal(AcademicProfile.get(), null);
  assert.equal(localStorage.getItem("instantgpa:gradingSystem"), null);
});

test("an orphan grading system is removed when no profile was confirmed", () => {
  localStorage.setItem("instantgpa:gradingSystem", JSON.stringify({
    label: "Orphan scale",
  }));

  assert.equal(AcademicProfile.get(), null);
  assert.equal(localStorage.getItem("instantgpa:gradingSystem"), null);
});

test("previously confirmed default context is invalidated by the clean setup migration", () => {
  localStorage.setItem("instantgpa:academicProfile", JSON.stringify({
    schemaVersion: 2,
    confirmedAt: "2026-07-27T00:00:00.000Z",
    countryCode: "EG",
    countryName: "Egypt",
    university: "Arab Academy for Science, Technology and Maritime Transport",
    presetId: "us-4.0",
  }));
  localStorage.setItem("instantgpa:gradingSystem", JSON.stringify({
    label: "Legacy auto-saved scale",
  }));

  assert.equal(AcademicProfile.get(), null);
  assert.equal(localStorage.getItem("instantgpa:academicProfile"), null);
  assert.equal(localStorage.getItem("instantgpa:gradingSystem"), null);
});

test("profile and grading system persist only after explicit confirmation", () => {
  const result = AcademicProfile.confirm(
    {
      countryCode: "EG",
      countryName: "Egypt",
      university: "Example University",
      college: "Faculty of Engineering",
      department: "Civil Engineering",
      presetId: "custom",
    },
    {
      label: "Reviewed 4.0 system",
      maxGpa: 4,
      scaleType: "letter",
      grades: [
        { label: "A", points: 4, min: 90 },
        { label: "F", points: 0, min: 0 },
      ],
    },
  );

  assert.equal(result.ok, true);
  assert.equal(AcademicProfile.isConfirmed(), true);
  assert.equal(AcademicProfile.get().university, "Example University");
  assert.equal(AcademicProfile.get().schemaVersion, 4);
  assert.equal(JSON.parse(localStorage.getItem("instantgpa:gradingSystem")).label, "Reviewed 4.0 system");
});

test("the clean setup has no university demo or automatic non-country values", async () => {
  const [profileSource, appSource] = await Promise.all([
    readFile(new URL("../static-site/assets/academic-profile.js", import.meta.url), "utf8"),
    readFile(new URL("../static-site/assets/app.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(profileSource, /Arab Academy|Engineering & Technology|instantgpa:demo/);
  assert.doesNotMatch(appSource, /Demo student|demoStudent|instantgpa:demo/);
  assert.match(profileSource, /draft\.countryCode = country\.code;/);
  assert.doesNotMatch(profileSource, /was suggested from your approximate IP location|location-suggestion/);
  assert.match(profileSource, /university:\s*""/);
  assert.match(profileSource, /college:\s*""/);
  assert.match(profileSource, /department:\s*""/);
  assert.match(profileSource, /gradingSystemId:\s*""/);
});

test("the full academic profile requires college and department and submits a deduplicated directory contribution", async () => {
  const source = await readFile(new URL("../static-site/assets/academic-profile.js", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/academic-profile/route.ts", import.meta.url), "utf8");

  assert.match(source, /!profile\.college \|\| !profile\.department/);
  assert.match(source, /AcademicProfile\.submitContribution/);
  assert.match(source, /directoryUniversity/);
  assert.match(api, /contributorId = `anon:\$\{installId\}`/);
  assert.doesNotMatch(api, /authenticateFirebase/);
  assert.match(api, /ON CONFLICT\(contributor_id\) DO UPDATE/);
  assert.match(api, /university_profiles/);
  assert.match(api, /university_academic_units/);
});

test("homepage exposes an always-open custom grading editor with a working add action", async () => {
  const source = await readFile(
    new URL("../static-site/assets/academic-profile.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /id:\s*CUSTOM_SYSTEM_ID/);
  assert.match(source, /label:\s*t\("setup\.grading\.customOption"\)/);
  assert.match(source, /<section class="grading-editor"/);
  assert.doesNotMatch(source, /<details class="grading-editor"/);
  assert.match(source, /addEventListener\("click", addDraftGrade\)/);
  assert.match(source, /grades\.splice\(insertAt,\s*0,/);
  assert.doesNotMatch(source, /id="confirmAcademicContext"[^>]*disabled/);
});

test("custom grade rows sort by points descending with stable threshold tie-breaking", () => {
  const rows = [
    { label: "C", points: "2", min: "70" },
    { label: "A", points: "4", min: "90" },
    { label: "B-", points: "3", min: "75" },
    { label: "B+", points: "3", min: "85" },
    { label: "F", points: "0", min: "0" },
  ];

  assert.deepEqual(
    sortGradeRowsByPoints(rows).map((grade) => grade.label),
    ["A", "B+", "B-", "C", "F"],
  );
});
