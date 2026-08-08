import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePrerequisiteGroups,
  prerequisitesSatisfied,
} from "../static-site/assets/prerequisite-policy.js";

test("ampersand prerequisites require every course", () => {
  const groups = parsePrerequisiteGroups("CB354 & CB362");
  assert.deepEqual(groups, [["CB354"], ["CB362"]]);
  assert.equal(prerequisitesSatisfied({ prerequisiteGroups: groups }, new Set(["CB354"])), false);
  assert.equal(prerequisitesSatisfied({ prerequisiteGroups: groups }, new Set(["CB354", "CB362"])), true);
});

test("pipe prerequisites accept either course and trailing operators are ignored", () => {
  assert.deepEqual(parsePrerequisiteGroups("CB444 | CB455"), [["CB444", "CB455"]]);
  assert.equal(prerequisitesSatisfied({ prerequisites: ["CB444 | CB455"] }, new Set(["CB455"])), true);
  assert.deepEqual(parsePrerequisiteGroups("CC114 |"), [["CC114"]]);
});
