import { AcademicRecord } from "./academic-record.js";
import { AcademicState } from "./academic-state.js";
import { GradingEngine } from "./grading-engine.js";
import { evaluateCourse, normalizeCourseCode } from "./academic-policy.js";
import { prerequisitesSatisfied } from "./prerequisite-policy.js";
import { Storage } from "./storage.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function buildPlan(courses, { maxCredits = 18, summer = false, summerCredits = 9, system = GradingEngine.getActive() } = {}) {
  const evaluated = courses.map((course) => evaluateCourse(course, system));
  const pending = evaluated.filter((course) => course.outcome === "planned");
  const inProgressCourses = evaluated.filter((course) => course.outcome === "inProgress");
  const completedCodes = new Set(evaluated
    .filter((course) => course.earnsCredit || course.wouldEarnCredit)
    .map((course) => normalizeCourseCode(course.code))
    .filter(Boolean));
  const remaining = [...pending];
  const terms = [];
  const blockedCourses = [];
  let termNumber = 1;
  let guard = 0;
  while (remaining.length && guard < 100) {
    guard += 1;
    const isSummer = summer && termNumber % 3 === 0;
    const limit = isSummer ? summerCredits : maxCredits;
    let used = 0;
    const selected = [];
    for (const course of [...remaining]) {
      const prerequisitesMet = prerequisitesSatisfied(course, completedCodes);
      const credits = Number(course.credits);
      if (!Number.isFinite(credits) || credits <= 0 || !prerequisitesMet || used + credits > limit) continue;
      selected.push(course);
      used += credits;
    }
    if (!selected.length) {
      blockedCourses.push(...remaining.map((course) => ({
        ...course,
        reason: !Number.isFinite(Number(course.credits)) || Number(course.credits) <= 0
          ? "missing_credits"
          : "unmet_prerequisites",
      })));
      break;
    }
    selected.forEach((course) => {
      remaining.splice(remaining.indexOf(course), 1);
    });
    selected.forEach((course) => {
      const code = normalizeCourseCode(course.code);
      if (code) completedCodes.add(code);
    });
    terms.push({ name: isSummer ? `Summer ${Math.ceil(termNumber / 3)}` : `Planned Semester ${termNumber - Math.floor(termNumber / 3)}`, courses: selected, credits: selected.reduce((sum, course) => sum + Number(course.credits), 0) });
    termNumber += 1;
  }
  return { terms, blockedCourses, inProgressCourses };
}

export function mount(container) {
  const system = GradingEngine.getActive();
  const courses = AcademicState.mergedCourses();
  const summary = AcademicState.recordSummary(system);
  const programRequirements = AcademicRecord.programRequirements();
  const savedSettings = Storage.get("commandCenterSettings:v1", {}) || {};
  const settings = {
    maxCredits: Number(savedSettings.maxCredits) || 18,
    summer: Boolean(savedSettings.summer),
    summerCredits: Number(savedSettings.summerCredits) || Math.min(9, Number(savedSettings.maxCredits) || 18),
  };
  let plan = [];

  container.innerHTML = `
    <div class="record-page">
      <h2>Auto-Scheduler</h2>
      <p class="tool-sub">Build a term-by-term plan from your shared transcript, course status, credits, and prerequisite codes.</p>
      <section class="tool-card tool-card--wide">
        <p class="record-connected">${summary.totalCourses ? `● ${summary.totalCourses} courses connected; ${summary.plannedCourses} planned and ${summary.inProgressCourses} currently registered.` : "● No transcript data yet. Import courses in the Transcript tab to generate a plan."}</p>
        ${programRequirements ? `<p class="result-note result-note--muted"><strong>${programRequirements.totalCreditsRequired} total program credits required.</strong> This requirement is for graduation planning only; course credits are never inferred from it.</p>` : ""}
        ${summary.inProgressCourses ? `<p class="result-note"><strong>${summary.inProgressCourses} course(s) are currently registered (U).</strong> They will not be scheduled again, will not satisfy prerequisites yet, and do not affect GPA.</p>` : ""}
        <div class="planner-settings">
          <label><span>Summer terms available</span><input type="checkbox" id="planSummer" ${settings.summer ? "checked" : ""}></label>
          <label><span>Max credits per semester</span><input type="number" id="planMax" min="1" value="${settings.maxCredits}"></label>
          <label><span>Max credits per summer term</span><input type="number" id="planSummerMax" min="1" value="${settings.summerCredits}"></label>
        </div>
        <div class="row-actions"><button class="btn btn--primary" id="planGenerate" ${summary.totalCourses ? "" : "disabled"}>✣ Generate plan</button></div>
      </section>
      <section class="tool-card tool-card--wide" id="planOutput"></section>
    </div>`;

  const output = container.querySelector("#planOutput");
  output.innerHTML = `<p class="result-note result-note--muted">${summary.totalCourses ? "Generate a plan to arrange all remaining courses." : "Import a transcript first to generate a plan."}</p>`;
  container.querySelector("#planGenerate").addEventListener("click", () => {
    settings.summer = container.querySelector("#planSummer").checked;
    settings.maxCredits = Number(container.querySelector("#planMax").value) || 18;
    settings.summerCredits = Number(container.querySelector("#planSummerMax").value) || 9;
    Storage.set("commandCenterSettings:v1", { ...savedSettings, ...settings });
    const result = buildPlan(courses, {
      summer: settings.summer,
      maxCredits: settings.maxCredits,
      summerCredits: settings.summerCredits,
      system,
    });
    plan = result.terms;
    output.innerHTML = plan.length ? `
      <h3>Graduation plan</h3>
      ${plan.map((term) => `<details open><summary><strong>${esc(term.name)}</strong><span>${term.courses.length} courses · ${term.credits} credits</span></summary>
        <div class="saved-course-list">${term.courses.map((course) => `<p><span>${esc([course.code, course.name].filter(Boolean).join(" — "))}</span><span>${course.credits} credits</span></p>`).join("")}</div>
      </details>`).join("")}
      ${result.blockedCourses.length ? `<div class="result-note result-note--warn"><strong>${result.blockedCourses.length} courses need attention.</strong><p>Add missing credits or complete their prerequisites before scheduling them.</p></div>` : ""}` : result.blockedCourses.length
        ? `<p class="result-note result-note--warn">${result.blockedCourses.length} courses are blocked by missing credits or unmet prerequisites.</p>`
        : `<p class="result-note result-note--muted">${result.inProgressCourses.length ? `${result.inProgressCourses.length} course(s) are already in progress; no other schedulable courses were found.` : "All transcript courses are already graded. Add planned courses to build a graduation plan."}</p>`;
  });
}
