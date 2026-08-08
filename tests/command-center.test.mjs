import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Academic Command Center connects overview, roadmap, goals, what-if, transfer, adviser, and policy sources", async () => {
  const source = await read("static-site/assets/academic-command-center.js");
  for (const marker of [
    "ACADEMIC COMMAND CENTER",
    "GPA TRAJECTORY",
    "ACADEMIC ROADMAP",
    "GOAL PLANNER + GPA TRAJECTORY",
    "WHAT-IF LAB",
    "PREREQUISITE BOTTLENECKS",
    "TRANSFER CREDIT EVALUATOR",
    "ADVISER MODE",
    "GRADING SYSTEM LIBRARY",
    "DATA CONTROLS",
  ]) assert.match(source, new RegExp(marker.replace(/[+]/g, "\\+")));
  assert.match(source, /analyzeGoal/);
  assert.match(source, /prerequisiteBottlenecks/);
  assert.match(source, /workloadForTerm/);
  assert.match(source, /planning estimate, not university decisions|planning scenarios, not university decisions/i);
});

test("transcript review links source preview, field confidence, merge preview, versions, and mobile scan", async () => {
  const [source, css] = await Promise.all([
    read("static-site/assets/transcript-import.js"),
    read("static-site/assets/product-flow-v60.css"),
  ]);
  assert.match(source, /class="transcript-split-view"/);
  assert.match(source, /fieldConfidence/);
  assert.match(source, /low-confidence fields/);
  assert.match(source, /importChangeSummary/);
  assert.match(source, /Accept all and merge/);
  assert.match(source, /Transcript Version History/);
  assert.match(source, /Mobile Scan Mode/);
  assert.match(css, /\.transcript-source-pane/);
  assert.match(css, /\.confidence-chip/);
});
