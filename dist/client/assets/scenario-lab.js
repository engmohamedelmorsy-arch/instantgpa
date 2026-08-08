// scenario-lab.js
// projectedCGPA = (baselineCGPA*baselineCredits + sum(hypCredits*points)) / (baselineCredits + sum(hypCredits))
// Same underlying math as the CGPA calculator; the difference is purely
// the UI — multiple hypothetical courses at once instead of one blended
// "this term" number — so students can sketch out "what if I get an A in
// this and a B in that" directly.

import { GradingEngine } from "./grading-engine.js";
import { AcademicState } from "./academic-state.js";
import { t } from "./localization.js";
import { track } from "./analytics.js";
import { Storage } from "./storage.js";

const SAVED_SCENARIO_KEY = "scenarioLabScenarios:v2";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

export function calculateScenario({ baselineCgpa, baselineCredits, courses }, gradingSystem) {
  const base = Number(baselineCgpa) || 0;
  const baseCredits = Number(baselineCredits) || 0;
  if (base < 0 || baseCredits < 0) return { ok: false, error: "invalid" };

  const maxGpa = gradingSystem?.maxGpa ?? Infinity;
  if (base > maxGpa) return { ok: false, error: "range", max: maxGpa };

  const byLabel = new Map((gradingSystem?.grades || []).map((g) => [g.label, g]));
  let hypCredits = 0;
  let hypPoints = 0;
  let usable = 0;

  for (const c of courses || []) {
    const credits = Number(c.credits);
    const grade = byLabel.get(c.grade);
    if (!c.grade || !Number.isFinite(credits)) continue;
    if (credits < 0) return { ok: false, error: "invalid" };
    if (!grade) continue;
    usable += 1;
    hypCredits += credits;
    hypPoints += credits * grade.points;
  }

  const totalCredits = baseCredits + hypCredits;
  if (usable === 0 || totalCredits === 0) return { ok: false, error: "noCourses" };

  const projected = (base * baseCredits + hypPoints) / totalCredits;
  return {
    ok: true,
    projected: Math.round(projected * 1000) / 1000,
    baseline: Math.round(base * 1000) / 1000,
    delta: Math.round((projected - base) * 1000) / 1000,
  };
}

let rowId = 0;
function newRow(course = {}) {
  rowId += 1;
  return { id: rowId, attemptId: course.attemptId || null, name: course.name || course.code || "", credits: course.credits ?? "", grade: course.grade || "" };
}

export function mount(container) {
  const system = GradingEngine.getActive();
  const summary = AcademicState.cumulativeSummary(system);
  const pendingCourses = summary.courses.filter((course) => ["inProgress", "planned"].includes(course.outcome));
  let rows = pendingCourses.length ? pendingCourses.map((course) => newRow(course)) : [newRow(), newRow()];
  let baselineCgpa = summary.gpa == null ? "" : summary.gpa.toFixed(3);
  let baselineCredits = summary.gpaCredits || "";
  const legacyScenario = Storage.get("scenarioLabSaved:v1", null);
  let savedScenarios = Storage.get(SAVED_SCENARIO_KEY, null);
  if (!Array.isArray(savedScenarios)) savedScenarios = legacyScenario ? [{ id: `legacy-${Date.now()}`, name: "Saved scenario", ...legacyScenario }] : [];
  let scenarioName = `Scenario ${savedScenarios.length + 1}`;
  let saveMessage = "";

  function gradeOptions(selected) {
    return (system?.grades || [])
      .slice()
      .sort((a, b) => b.min - a.min)
      .map((g) => `<option value="${escapeHtml(g.label)}" ${g.label === selected ? "selected" : ""}>${escapeHtml(g.label)}</option>`)
      .join("");
  }

  function render() {
    container.innerHTML = `
      <div class="tool-card">
        <h2>${t("tools.scenario.title")}</h2>
        <p class="tool-sub">${t("scenario.subtitle")}</p>
        <p class="record-connected">${summary.totalCourses ? `● Baseline CGPA and credits loaded from ${summary.totalCourses} transcript courses.` : "● Import a transcript to prefill your baseline CGPA and credits."}</p>
        <div class="field-grid">
          <label class="field"><span>Scenario name</span><input type="text" id="scName" maxlength="80" value="${escapeHtml(scenarioName)}"></label>
          <label class="field"><span>${t("scenario.baselineCgpa")}</span><input type="number" id="scBaseCgpa" min="0" max="${system?.maxGpa ?? 4}" step="0.001" value="${baselineCgpa}"></label>
          <label class="field"><span>${t("scenario.baselineCredits")}</span><input type="number" id="scBaseCredits" min="0" step="0.5" value="${baselineCredits}"></label>
        </div>
        <div class="course-rows" role="table">
          <div class="course-row course-row--head" role="row">
            <span role="columnheader">${t("gpa.course")}</span>
            <span role="columnheader">${t("gpa.credits")}</span>
            <span role="columnheader">${t("gpa.grade")}</span>
            <span role="columnheader" class="visually-hidden">${t("gpa.remove")}</span>
          </div>
          ${rows
            .map(
              (r) => `
            <div class="course-row" role="row" data-row="${r.id}">
              <input type="text" class="sc-name" placeholder="${t("gpa.course.placeholder")}" value="${escapeHtml(r.name)}">
              <input type="number" class="sc-credits" min="0" step="0.5" value="${r.credits}">
              <select class="sc-grade"><option value="">—</option>${gradeOptions(r.grade)}</select>
              <button type="button" class="row-remove" aria-label="${t("gpa.remove")}" data-remove="${r.id}">✕</button>
            </div>`
            )
            .join("")}
        </div>
        <div class="row-actions"><button type="button" class="btn btn--ghost" id="scAdd">+ ${t("scenario.addCourse")}</button></div>
        <div id="scResult" class="result-box" aria-live="polite"></div>
        ${savedScenarios.length ? `<section class="saved-scenario-list"><h3>Saved comparisons</h3>${savedScenarios.map((scenario) => `<div class="saved-course-list"><p><button type="button" class="btn btn--text" data-load-scenario="${escapeHtml(scenario.id)}">${escapeHtml(scenario.name || "Scenario")}</button><span>${Number(scenario.result).toFixed(3)} <button type="button" class="row-remove" data-delete-scenario="${escapeHtml(scenario.id)}" aria-label="Delete ${escapeHtml(scenario.name || "scenario")}">✕</button></span></p></div>`).join("")}</section>` : ""}
      </div>`;

    container.querySelectorAll(".course-row:not(.course-row--head)").forEach((rowEl) => {
      const id = Number(rowEl.dataset.row);
      const row = rows.find((r) => r.id === id);
      rowEl.querySelector(".sc-name").addEventListener("input", (e) => (row.name = e.target.value));
      rowEl.querySelector(".sc-credits").addEventListener("input", (e) => {
        row.credits = e.target.value;
        recalc();
      });
      rowEl.querySelector(".sc-grade").addEventListener("change", (e) => {
        row.grade = e.target.value;
        recalc();
      });
      rowEl.querySelector(".row-remove").addEventListener("click", () => {
        rows = rows.filter((r) => r.id !== id);
        render();
      });
    });
    container.querySelector("#scAdd").addEventListener("click", () => {
      rows.push(newRow());
      render();
    });
    container.querySelector("#scBaseCgpa").addEventListener("input", (e) => {
      baselineCgpa = e.target.value;
      recalc();
    });
    container.querySelector("#scBaseCredits").addEventListener("input", (e) => {
      baselineCredits = e.target.value;
      recalc();
    });
    container.querySelector("#scName").addEventListener("input", (e) => { scenarioName = e.target.value; });
    container.querySelectorAll("[data-load-scenario]").forEach((button) => button.addEventListener("click", () => {
      const saved = savedScenarios.find((scenario) => scenario.id === button.dataset.loadScenario);
      if (!saved) return;
      scenarioName = saved.name || "Scenario";
      baselineCgpa = saved.baselineCgpa;
      baselineCredits = saved.baselineCredits;
      rows = (saved.courses || []).map((course) => newRow(course));
      saveMessage = "Loaded. Change any grade to compare a new outcome.";
      render();
    }));
    container.querySelectorAll("[data-delete-scenario]").forEach((button) => button.addEventListener("click", () => {
      savedScenarios = savedScenarios.filter((scenario) => scenario.id !== button.dataset.deleteScenario);
      Storage.set(SAVED_SCENARIO_KEY, savedScenarios);
      render();
    }));

    recalc();
  }

  function recalc() {
    const resultEl = container.querySelector("#scResult");
    const input = {
      baselineCgpa: container.querySelector("#scBaseCgpa").value,
      baselineCredits: container.querySelector("#scBaseCredits").value,
      courses: rows,
    };
    const result = calculateScenario(input, system);
    if (!result.ok) {
      resultEl.innerHTML = "";
      return;
    }
    track("calculator_opened", { tool: "scenario-lab" });
    const sign = result.delta > 0 ? "+" : "";
    resultEl.innerHTML = `
      <div class="result-headline">
        <span class="result-label">${t("scenario.result.title")}</span>
        <span class="result-value">${result.projected.toFixed(3)}</span>
      </div>
      <div class="result-meta">
        <span>${t("scenario.result.baseline")}: <strong>${result.baseline.toFixed(3)}</strong></span>
        <span>${t("scenario.result.delta")}: <strong>${sign}${result.delta.toFixed(3)}</strong></span>
      </div>
      <div class="scenario-save-row">
        <button class="btn btn--ghost" type="button" id="scSaveScenario">Save this scenario</button>
        ${saveMessage ? `<span class="setup-status__text">${escapeHtml(saveMessage)}</span>` : ""}
      </div>
      <p class="field-note">${savedScenarios.length} saved · Premium keeps these scenarios synchronized with your account.</p>`;
    resultEl.querySelector("#scSaveScenario")?.addEventListener("click", () => {
      const savedScenario = {
        id: crypto.randomUUID(),
        name: scenarioName.trim() || `Scenario ${savedScenarios.length + 1}`,
        savedAt: new Date().toISOString(),
        baselineCgpa: input.baselineCgpa,
        baselineCredits: input.baselineCredits,
        courses: rows.map((row) => ({ name: row.name, credits: row.credits, grade: row.grade })),
        result: result.projected,
      };
      savedScenarios = [savedScenario, ...savedScenarios].slice(0, 25);
      Storage.set(SAVED_SCENARIO_KEY, savedScenarios);
      scenarioName = `Scenario ${savedScenarios.length + 1}`;
      saveMessage = "Scenario saved and queued for Premium sync.";
      track("scenario_saved", { slot: savedScenarios.length });
      render();
    });
  }

  render();
}
