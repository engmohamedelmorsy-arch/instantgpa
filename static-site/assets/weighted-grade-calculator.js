// weighted-grade-calculator.js
// Formula: finalScore = sum(score * weight) / sum(weight)
// Weights are normalized by their own total, so entries don't have to sum
// to exactly 100 (e.g. someone can enter 30/40/30 or 3/4/3 — same result).

import { t } from "./localization.js";
import { track } from "./analytics.js";
import { AcademicState } from "./academic-state.js";
import { Storage } from "./storage.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

export function calculateWeighted(components) {
  let totalWeight = 0;
  let totalScoreWeight = 0;
  let usable = 0;

  for (const c of components || []) {
    const weight = Number(c.weight);
    const score = Number(c.score);
    if (!Number.isFinite(weight) || !Number.isFinite(score)) continue; // incomplete, skip
    if (weight < 0 || weight > 100 || score < 0 || score > 100) return { ok: false, error: "invalid" };
    usable += 1;
    totalWeight += weight;
    totalScoreWeight += weight * score;
  }

  if (usable === 0 || totalWeight === 0) return { ok: false, error: "noComponents" };

  return {
    ok: true,
    finalScore: Math.round((totalScoreWeight / totalWeight) * 100) / 100,
    totalWeight: Math.round(totalWeight * 100) / 100,
    weightedContribution: Math.round((totalScoreWeight / 100) * 100) / 100,
    remainingWeight: Math.max(0, Math.round((100 - totalWeight) * 100) / 100),
  };
}

let rowId = 0;
function newRow(component = {}) {
  rowId += 1;
  return { id: rowId, name: component.name || component.label || "", weight: component.weight ?? "", score: component.score ?? "" };
}

export function mount(container) {
  const syllabi = Storage.get("premiumSyllabi:v1", []) || [];
  const connectedCourses = AcademicState.recordSummary().courses.filter((course) => ["inProgress", "planned"].includes(course.outcome));
  const saved = Storage.get("weightedGrade:v1", null);
  let selectedSyllabus = Number.isInteger(saved?.syllabusIndex) ? saved.syllabusIndex : (syllabi.length ? 0 : -1);
  let courseName = saved?.courseName || syllabi[selectedSyllabus]?.courseName || connectedCourses[0]?.name || connectedCourses[0]?.code || "";
  let rows = Array.isArray(saved?.components) && saved.components.length
    ? saved.components.map((component) => newRow(component))
    : syllabi[selectedSyllabus]?.assessments?.length
      ? syllabi[selectedSyllabus].assessments.map((component) => newRow(component))
      : [newRow(), newRow(), newRow()];

  function persist(result = null) {
    Storage.set("weightedGrade:v1", {
      syllabusIndex: selectedSyllabus,
      courseName,
      components: rows.map(({ name, weight, score }) => ({ name, weight, score })),
      result,
      updatedAt: new Date().toISOString(),
    });
  }

  function render() {
    container.innerHTML = `
      <div class="tool-card">
        <h2>${t("tools.weighted.title")}</h2>
        <p class="tool-sub">${t("weighted.subtitle")}</p>
        <div class="field-grid">
          ${syllabi.length ? `<label class="field"><span>Use an imported syllabus</span><select id="wSyllabus"><option value="-1">Manual components</option>${syllabi.map((syllabus, index) => `<option value="${index}" ${index === selectedSyllabus ? "selected" : ""}>${escapeHtml(syllabus.courseName || `Course ${index + 1}`)}</option>`).join("")}</select></label>` : ""}
          <label class="field"><span>Course</span><input id="wCourseName" list="wCourseList" value="${escapeHtml(courseName)}" placeholder="Choose or type a course"><datalist id="wCourseList">${connectedCourses.map((course) => `<option value="${escapeHtml(course.name || course.code)}">`).join("")}</datalist></label>
        </div>
        <div class="course-rows" role="table">
          <div class="course-row course-row--head" role="row">
            <span role="columnheader">${t("weighted.component")}</span>
            <span role="columnheader">${t("weighted.weight")}</span>
            <span role="columnheader">${t("weighted.score")}</span>
            <span role="columnheader" class="visually-hidden">${t("gpa.remove")}</span>
          </div>
          ${rows
            .map(
              (r) => `
            <div class="course-row" role="row" data-row="${r.id}">
              <input type="text" class="w-name" placeholder="${t("weighted.component.placeholder")}" value="${escapeHtml(r.name)}" aria-label="${t("weighted.component")}">
              <input type="number" class="w-weight" min="0" max="100" step="1" inputmode="decimal" value="${r.weight}" aria-label="${t("weighted.weight")}">
              <input type="number" class="w-score" min="0" max="100" step="0.1" inputmode="decimal" value="${r.score}" aria-label="${t("weighted.score")}">
              <button type="button" class="row-remove" aria-label="${t("gpa.remove")}" data-remove="${r.id}">✕</button>
            </div>`
            )
            .join("")}
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn--ghost" id="wAdd">+ ${t("weighted.add")}</button>
          <button type="button" class="btn btn--text" id="wReset">${t("gpa.reset")}</button>
        </div>
        <div id="wResult" class="result-box" aria-live="polite"></div>
      </div>`;

    container.querySelectorAll(".course-row:not(.course-row--head)").forEach((rowEl) => {
      const id = Number(rowEl.dataset.row);
      const row = rows.find((r) => r.id === id);
      rowEl.querySelector(".w-name").addEventListener("input", (e) => { row.name = e.target.value; persist(); });
      rowEl.querySelector(".w-weight").addEventListener("input", (e) => {
        row.weight = e.target.value;
        persist();
        recalc();
      });
      rowEl.querySelector(".w-score").addEventListener("input", (e) => {
        row.score = e.target.value;
        persist();
        recalc();
      });
      rowEl.querySelector(".row-remove").addEventListener("click", () => {
        rows = rows.filter((r) => r.id !== id);
        persist();
        render();
      });
    });
    container.querySelector("#wAdd").addEventListener("click", () => {
      rows.push(newRow());
      persist();
      render();
    });
    container.querySelector("#wReset").addEventListener("click", () => {
      rows = [newRow(), newRow(), newRow()];
      selectedSyllabus = -1;
      persist();
      render();
    });
    container.querySelector("#wCourseName").addEventListener("input", (event) => { courseName = event.target.value; persist(); });
    container.querySelector("#wSyllabus")?.addEventListener("change", (event) => {
      selectedSyllabus = Number(event.target.value);
      const syllabus = syllabi[selectedSyllabus];
      if (syllabus) {
        courseName = syllabus.courseName || courseName;
        rows = (syllabus.assessments || []).map((component) => newRow(component));
        if (!rows.length) rows = [newRow(), newRow(), newRow()];
      }
      persist();
      render();
    });
    recalc();
  }

  function recalc() {
    const resultEl = container.querySelector("#wResult");
    const result = calculateWeighted(rows);
    if (!result.ok) {
      const hadInput = rows.some((r) => r.name || r.weight || r.score);
      resultEl.innerHTML = hadInput
        ? `<p class="result-note result-note--muted">${t(result.error === "invalid" ? "weighted.error.invalid" : "weighted.error.noComponents")}</p>`
        : "";
      return;
    }
    track("calculator_opened", { tool: "weighted-grade" });
    persist(result);
    resultEl.innerHTML = `
      <div class="result-headline">
        <span class="result-label">${t("weighted.result.title")}</span>
        <span class="result-value">${result.finalScore.toFixed(2)}%</span>
      </div>
      <div class="result-meta"><span>Entered weight: <strong>${result.totalWeight.toFixed(2)}%</strong></span><span>Contribution to final course mark: <strong>${result.weightedContribution.toFixed(2)} points</strong></span></div>
      ${result.totalWeight < 100 ? `<p class="result-note result-note--muted">This is your normalized average across the ${result.totalWeight.toFixed(2)}% entered. ${result.remainingWeight.toFixed(2)}% of the course is still missing or ungraded.</p>` : result.totalWeight > 100 ? '<p class="result-note result-note--warn">The weights exceed 100%. Review the syllabus weights before relying on this result.</p>' : ""}`;
  }

  render();
}
