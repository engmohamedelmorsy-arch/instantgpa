// graduation-predictor.js
// Formula: requiredGPA = (targetCGPA * totalCredits - currentCGPA * currentCredits) / remainingCredits
// where totalCredits = currentCredits + remainingCredits.

import { GradingEngine } from "./grading-engine.js";
import { AcademicState } from "./academic-state.js";
import { Storage } from "./storage.js";
import { t } from "./localization.js";
import { track } from "./analytics.js";

export function calculateGraduationTarget({ currentCgpa, currentCredits, remainingCredits, targetCgpa }, gradingSystem) {
  const cur = Number(currentCgpa);
  const curCredits = Number(currentCredits);
  const remaining = Number(remainingCredits);
  const target = Number(targetCgpa);

  if (![cur, curCredits, remaining, target].every(Number.isFinite)) return { ok: false, error: "invalid" };
  if (curCredits < 0 || remaining <= 0) return { ok: false, error: "invalid" };

  const maxGpa = gradingSystem?.maxGpa ?? Infinity;
  if (cur < 0 || cur > maxGpa || target < 0 || target > maxGpa) return { ok: false, error: "range", max: maxGpa };

  const totalCredits = curCredits + remaining;
  const required = (target * totalCredits - cur * curCredits) / remaining;

  if (required <= 0) return { ok: true, status: "achieved", required: 0 };
  if (required > maxGpa) return { ok: true, status: "impossible", required: Math.round(required * 1000) / 1000, max: maxGpa };
  return { ok: true, status: "normal", required: Math.round(required * 1000) / 1000 };
}

export function mount(container) {
  const system = GradingEngine.getActive();
  const maxGpa = system?.maxGpa ?? 4.0;
  const summary = AcademicState.cumulativeSummary(system);
  const progress = AcademicState.programProgress(system);
  const savedGoal = Storage.get("graduationGoal:v1", {}) || {};
  const commandSettings = Storage.get("commandCenterSettings:v1", {}) || {};
  const inferredTarget = Number(savedGoal.targetCgpa ?? commandSettings.target ?? Math.min(maxGpa, Math.max(summary.gpa || 0, maxGpa * 0.8)));

  container.innerHTML = `
    <div class="tool-card">
      <h2>${t("tools.graduation.title")}</h2>
      <p class="tool-sub">${t("graduation.subtitle")}</p>
      <p class="record-connected">${summary.totalCourses ? `● Current GPA and credits loaded from ${summary.totalCourses} transcript courses.` : "● Import a transcript to prefill your current GPA and credits."}</p>
      <div class="field-grid">
        <label class="field"><span>${t("graduation.currentCgpa")}</span><input type="number" id="gpCurCgpa" min="0" max="${maxGpa}" step="0.001" value="${summary.gpa == null ? "" : summary.gpa.toFixed(3)}"></label>
        <label class="field"><span>${t("graduation.currentCredits")}</span><input type="number" id="gpCurCredits" min="0" step="0.5" value="${summary.gpaCredits || ""}"></label>
        <label class="field"><span>${t("graduation.remainingCredits")}</span><input type="number" id="gpRemaining" min="0" step="0.5" value="${savedGoal.remainingCredits ?? progress.remainingCredits ?? ""}"></label>
        <label class="field"><span>${t("graduation.targetCgpa")}</span><input type="number" id="gpTarget" min="0" max="${maxGpa}" step="0.001" value="${Number.isFinite(inferredTarget) ? inferredTarget : ""}"></label>
      </div>
      <div class="row-actions"><button type="button" class="btn btn--primary" id="gpCalc">${t("graduation.calculate")}</button></div>
      <div id="gpResult" class="result-box" aria-live="polite"></div>
    </div>`;

  container.querySelector("#gpCalc").addEventListener("click", () => {
    const input = {
      currentCgpa: container.querySelector("#gpCurCgpa").value,
      currentCredits: container.querySelector("#gpCurCredits").value,
      remainingCredits: container.querySelector("#gpRemaining").value,
      targetCgpa: container.querySelector("#gpTarget").value,
    };
    const result = calculateGraduationTarget(input, system);
    const resultEl = container.querySelector("#gpResult");
    if (!result.ok) {
      resultEl.innerHTML = `<p class="result-note result-note--warn">${
        result.error === "range" ? t("cgpa.error.range").replace("{max}", String(maxGpa)) : t("gpa.error.credits")
      }</p>`;
      return;
    }
    track("calculator_opened", { tool: "graduation-predictor" });
    Storage.set("graduationGoal:v1", {
      targetCgpa: Number(input.targetCgpa),
      remainingCredits: Number(input.remainingCredits),
      currentCgpa: Number(input.currentCgpa),
      currentCredits: Number(input.currentCredits),
      result,
      updatedAt: new Date().toISOString(),
    });
    if (result.status === "achieved") {
      resultEl.innerHTML = `<p class="result-note result-note--muted">${t("graduation.result.achieved")}</p>`;
    } else if (result.status === "impossible") {
      resultEl.innerHTML = `<p class="result-note result-note--warn">${t("graduation.result.impossible")}</p>`;
    } else {
      const totalCredits = Number(input.currentCredits) + Number(input.remainingCredits);
      const currentPoints = Number(input.currentCgpa) * Number(input.currentCredits);
      const targetPoints = Number(input.targetCgpa) * totalCredits;
      resultEl.innerHTML = `
        <div class="result-headline">
          <span class="result-label">${t("graduation.result.title")}</span>
          <span class="result-value">${result.required.toFixed(3)}</span>
        </div>
        <details class="calculation-breakdown">
          <summary>Show calculation</summary>
          <div>
            <p><span>Current quality points</span><strong>${Number(input.currentCgpa).toFixed(3)} × ${Number(input.currentCredits)} = ${currentPoints.toFixed(3)}</strong></p>
            <p><span>Target quality points</span><strong>${Number(input.targetCgpa).toFixed(3)} × ${totalCredits} = ${targetPoints.toFixed(3)}</strong></p>
            <p class="calculation-total"><span>Required GPA</span><strong>(${targetPoints.toFixed(3)} − ${currentPoints.toFixed(3)}) ÷ ${Number(input.remainingCredits)} = ${result.required.toFixed(3)}</strong></p>
          </div>
        </details>
        <div class="result-learning-links"><a href="/transcript-to-graduation-plan">Transcript-to-graduation workflow</a><a href="/trust">Methodology</a></div>`;
    }
  });

  if (summary.gpaCredits && Number(container.querySelector("#gpRemaining").value) > 0 && Number.isFinite(Number(container.querySelector("#gpTarget").value))) {
    container.querySelector("#gpCalc").click();
  }
}
