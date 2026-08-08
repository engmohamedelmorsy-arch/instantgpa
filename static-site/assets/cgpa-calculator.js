// cgpa-calculator.js
// Formula: newCGPA = (prevGPA*prevCredits + curGPA*curCredits) / (prevCredits + curCredits)

import { GradingEngine } from "./grading-engine.js";
import { AcademicState } from "./academic-state.js";
import { t } from "./localization.js";
import { track } from "./analytics.js";

export function calculateCgpa({ prevCredits, prevGpa, curGpa, curCredits }, gradingSystem) {
  const pc = Number(prevCredits) || 0;
  const pg = Number(prevGpa) || 0;
  const cg = Number(curGpa) || 0;
  const cc = Number(curCredits) || 0;

  if (pc < 0 || pg < 0 || cg < 0 || cc < 0) return { ok: false, error: "negative" };

  const maxGpa = gradingSystem?.maxGpa ?? Infinity;
  if (pg > maxGpa || cg > maxGpa) return { ok: false, error: "range", max: maxGpa };

  const totalCredits = pc + cc;
  if (totalCredits === 0) return { ok: false, error: "noCredits" };

  const cgpa = (pg * pc + cg * cc) / totalCredits;
  return {
    ok: true,
    cgpa: Math.round(cgpa * 1000) / 1000,
    totalCredits,
  };
}

export function mount(container) {
  const system = GradingEngine.getActive();
  const maxGpa = system?.maxGpa ?? 4.0;
  const recordSummary = AcademicState.recordSummary(system);
  const previous = AcademicState.previousRecord();
  const currentTerm = AcademicState.currentTermSummary(system);

  container.innerHTML = `
    <div class="tool-card">
      <h2>${t("cgpa.title")}</h2>
      <p class="tool-sub">${t("cgpa.subtitle")}</p>
      <p class="record-connected">${recordSummary.totalCourses ? `● Calculated from your reviewed transcript${currentTerm.gpaCredits ? ` plus ${currentTerm.gradedCourses} current-term course${currentTerm.gradedCourses === 1 ? "" : "s"}` : ""}. Add only credits that are not already present in the transcript.` : "● Import a transcript or calculate the current semester GPA to fill this automatically."}</p>
      <div class="field-grid">
        <label class="field">
          <span>Older credits not in your transcript</span>
          <input type="number" id="cgpaPrevCredits" min="0" step="0.5" inputmode="decimal" value="${previous.credits || 0}">
        </label>
        <label class="field">
          <span>GPA for those older credits</span>
          <input type="number" id="cgpaPrevGpa" min="0" max="${maxGpa}" step="0.001" inputmode="decimal" value="${previous.gpa || 0}">
        </label>
        <label class="field">
          <span>${t("cgpa.currentGpa")}</span>
          <input type="number" id="cgpaCurGpa" min="0" max="${maxGpa}" step="0.001" inputmode="decimal" value="${recordSummary.gpa == null ? "" : recordSummary.gpa.toFixed(4)}">
        </label>
        <label class="field">
          <span>${t("cgpa.currentCredits")}</span>
          <input type="number" id="cgpaCurCredits" min="0" step="0.5" inputmode="decimal" value="${recordSummary.gpaCredits || ""}">
        </label>
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn--primary" id="cgpaCalc">${t("cgpa.calculate")}</button>
      </div>
      <div id="cgpaResult" class="result-box" aria-live="polite"></div>
      <aside class="post-value-actions" aria-label="Free plan boundary">
        <div><strong>Your free workflow is complete.</strong><p>Academic setup, transcript review, GPA and CGPA remain available without an account. Conversions, retakes, planning and predictive tools require an active subscription.</p></div>
        <a class="btn btn--primary" href="/instantgpa-pro">See Premium tools</a>
      </aside>
    </div>`;

  const ids = ["cgpaPrevCredits", "cgpaPrevGpa", "cgpaCurGpa", "cgpaCurCredits"];
  const getInputs = () => ({
    prevCredits: container.querySelector("#cgpaPrevCredits").value,
    prevGpa: container.querySelector("#cgpaPrevGpa").value,
    curGpa: container.querySelector("#cgpaCurGpa").value,
    curCredits: container.querySelector("#cgpaCurCredits").value,
  });

  function recalc() {
    const resultEl = container.querySelector("#cgpaResult");
    const result = calculateCgpa(getInputs(), system);
    if (!result.ok) {
      const messages = {
        negative: t("cgpa.error.negative"),
        range: t("cgpa.error.range").replace("{max}", String(maxGpa)),
        noCredits: t("cgpa.error.noCredits"),
      };
      resultEl.innerHTML = `<p class="result-note result-note--warn">${messages[result.error] || ""}</p>`;
      return;
    }
    track("cgpa_calculated");
    AcademicState.savePreviousRecord({
      gpa: Number(container.querySelector("#cgpaPrevGpa").value) || 0,
      credits: Number(container.querySelector("#cgpaPrevCredits").value) || 0,
    });
    AcademicState.saveLatestCgpa({
      gpa: result.cgpa,
      credits: result.totalCredits,
      qualityPoints: result.cgpa * result.totalCredits,
      maxGpa,
      includesCurrentTermProjection: currentTerm.gpaCredits > 0,
    });
    resultEl.innerHTML = `
      <div class="result-headline">
        <span class="result-label">${t("cgpa.result.title")}</span>
        <span class="result-value">${result.cgpa.toFixed(3)}</span>
      </div>
      <div class="result-meta"><span>${t("cgpa.result.totalCredits")}: <strong>${result.totalCredits}</strong></span></div>
      <div class="cgpa-breakdown">
        <div><span>Older record not imported</span><strong>${Number(getInputs().prevGpa || 0).toFixed(2)} · ${Number(getInputs().prevCredits || 0)} credits</strong></div>
        <div><span>Connected transcript${currentTerm.gpaCredits ? " + current term" : ""}</span><strong>${Number(getInputs().curGpa || 0).toFixed(2)} · ${Number(getInputs().curCredits || 0)} credits</strong></div>
        <div><span>New cumulative GPA</span><strong>${result.cgpa.toFixed(3)} / ${maxGpa}</strong></div>
      </div>
      <details class="calculation-breakdown">
        <summary>Show calculation</summary>
        <div>
          <p><span>Previous quality points</span><strong>${Number(getInputs().prevGpa || 0).toFixed(3)} × ${Number(getInputs().prevCredits || 0)} = ${(Number(getInputs().prevGpa || 0) * Number(getInputs().prevCredits || 0)).toFixed(3)}</strong></p>
          <p><span>Current quality points</span><strong>${Number(getInputs().curGpa || 0).toFixed(3)} × ${Number(getInputs().curCredits || 0)} = ${(Number(getInputs().curGpa || 0) * Number(getInputs().curCredits || 0)).toFixed(3)}</strong></p>
          <p class="calculation-total"><span>CGPA</span><strong>Total quality points ÷ ${result.totalCredits} credits = ${result.cgpa.toFixed(3)}</strong></p>
        </div>
      </details>
      <div class="result-learning-links"><a href="/guides/gpa-calculation-example">GPA formula example</a><a href="/trust">Methodology</a></div>`;
  }

  container.querySelector("#cgpaCalc").addEventListener("click", recalc);
  ids.forEach((id) => container.querySelector(`#${id}`).addEventListener("keydown", (e) => {
    if (e.key === "Enter") recalc();
  }));
  if (recordSummary.gpaCredits) recalc();
}
