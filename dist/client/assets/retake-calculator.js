// retake-calculator.js
// Six retake policies, all built on the same idea: your current CGPA times
// your current credits gives your current total "quality points" (this
// already includes the course being retaken, since it was already taken).
// We remove or adjust that course's contribution depending on the policy,
// then divide by the resulting credits.

import { GradingEngine } from "./grading-engine.js";
import { AcademicState } from "./academic-state.js";
import { Storage } from "./storage.js";
import { t } from "./localization.js";
import { track } from "./analytics.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

export function calculateRetake({ currentCgpa, currentCredits, courseCredits, oldGrade, newGrade, policy }, gradingSystem) {
  const cgpa = Number(currentCgpa);
  const credits = Number(currentCredits);
  const cc = Number(courseCredits);
  if (![cgpa, credits, cc].every(Number.isFinite) || credits <= 0 || cc <= 0 || cc > credits) {
    return { ok: false, error: "invalid" };
  }
  const maxGpa = gradingSystem?.maxGpa ?? Infinity;
  if (cgpa < 0 || cgpa > maxGpa) return { ok: false, error: "range", max: maxGpa };

  const newPoints = gradePoints(newGrade, gradingSystem);
  const oldP = gradePoints(oldGrade, gradingSystem);
  if (oldP == null || newPoints == null) return { ok: false, error: "unknownGrade" };

  const totalQualityPoints = cgpa * credits;
  const oldContribution = oldP * cc;

  let newTotalQualityPoints, newTotalCredits;

  switch (policy) {
    case "highest":
      newTotalQualityPoints = totalQualityPoints - oldContribution + Math.max(oldP, newPoints) * cc;
      newTotalCredits = credits;
      break;
    case "latest":
    case "replace":
      newTotalQualityPoints = totalQualityPoints - oldContribution + newPoints * cc;
      newTotalCredits = credits;
      break;
    case "average":
      newTotalQualityPoints = totalQualityPoints - oldContribution + ((oldP + newPoints) / 2) * cc;
      newTotalCredits = credits;
      break;
    case "both":
      newTotalQualityPoints = totalQualityPoints + newPoints * cc;
      newTotalCredits = credits + cc;
      break;
    case "none":
      newTotalQualityPoints = totalQualityPoints;
      newTotalCredits = credits;
      break;
    default:
      return { ok: false, error: "invalid" };
  }

  const newCgpa = newTotalQualityPoints / newTotalCredits;
  return {
    ok: true,
    before: Math.round(cgpa * 1000) / 1000,
    after: Math.round(newCgpa * 1000) / 1000,
    delta: Math.round((newCgpa - cgpa) * 1000) / 1000,
  };
}

function gradePoints(label, system) {
  if (!label || !system) return null;
  const g = system.grades.find((row) => row.label === label);
  return g ? g.points : null;
}

export function mount(container) {
  const system = GradingEngine.getActive();
  const maxGpa = system?.maxGpa ?? 4.0;
  const summary = AcademicState.cumulativeSummary(system);
  const configuredPolicy = system?.retakePolicy === "all" ? "both" : (system?.retakePolicy || "highest");
  const completedAttempts = summary.courses.filter((course) => ["passed", "failed"].includes(course.outcome));
  const currentRegistrations = summary.courses.filter((course) => course.outcome === "inProgress");
  const identity = (course) => String(course.code || course.name || "").trim().toLocaleLowerCase("en");
  const retakeCandidates = completedAttempts.map((course) => ({
    key: `completed:${course.attemptId}`,
    course,
    oldAttempt: course,
    context: "completed course",
  }));
  currentRegistrations.forEach((course) => {
    const prior = completedAttempts.filter((attempt) => identity(attempt) && identity(attempt) === identity(course)).at(-1);
    if (prior) retakeCandidates.unshift({
      key: `registered:${course.attemptId}`,
      course,
      oldAttempt: prior,
      context: "registered retake",
    });
  });

  function gradeOptions(selected) {
    return (system?.grades || [])
      .slice()
      .sort((a, b) => b.min - a.min)
      .map((g) => `<option value="${escapeHtml(g.label)}" ${g.label === selected ? "selected" : ""}>${escapeHtml(g.label)}</option>`)
      .join("");
  }

  container.innerHTML = `
    <div class="tool-card">
      <h2>${t("tools.retake.title")}</h2>
      <p class="tool-sub">${t("retake.subtitle")}</p>
      <p class="record-connected">${summary.totalCourses ? `● Current CGPA and credits loaded from ${summary.totalCourses} transcript courses.` : "● Import a transcript to prefill your current CGPA and credits."}</p>
      ${retakeCandidates.length ? `
      <label class="field"><span>Choose a completed course or a retake registered now</span>
        <select id="rtCourseSource"><option value="">— choose a course —</option>${retakeCandidates
          .map(({ key, course, oldAttempt, context }) => `<option value="${escapeHtml(key)}">${escapeHtml(course.code || course.name)} · ${escapeHtml(course.term)} · ${escapeHtml(oldAttempt.grade)} · ${escapeHtml(context)}</option>`)
          .join("")}</select>
      </label>` : ""}
      <div class="field-grid">
        <label class="field"><span>${t("retake.currentCgpa")}</span><input type="number" id="rtCgpa" min="0" max="${maxGpa}" step="0.001" value="${summary.gpa == null ? "" : summary.gpa.toFixed(3)}"></label>
        <label class="field"><span>${t("retake.currentCredits")}</span><input type="number" id="rtCredits" min="0" step="0.5" value="${summary.gpaCredits || ""}"></label>
        <label class="field"><span>${t("retake.courseCredits")}</span><input type="number" id="rtCourseCredits" min="0" step="0.5"></label>
        <label class="field"><span>${t("retake.policy")}</span>
          <select id="rtPolicy">
            <option value="highest" ${configuredPolicy === "highest" ? "selected" : ""}>${t("retake.policy.highest")}</option>
            <option value="latest" ${configuredPolicy === "latest" ? "selected" : ""}>${t("retake.policy.latest")}</option>
            <option value="average" ${configuredPolicy === "average" ? "selected" : ""}>${t("retake.policy.average")}</option>
            <option value="replace" ${configuredPolicy === "replace" ? "selected" : ""}>${t("retake.policy.replace")}</option>
            <option value="both" ${configuredPolicy === "both" ? "selected" : ""}>${t("retake.policy.both")}</option>
            <option value="none" ${configuredPolicy === "none" ? "selected" : ""}>${t("retake.policy.none")}</option>
          </select>
        </label>
        <label class="field"><span>${t("retake.oldGrade")}</span><select id="rtOldGrade"><option value="">—</option>${gradeOptions()}</select></label>
        <label class="field"><span>${t("retake.newGrade")}</span><select id="rtNewGrade"><option value="">—</option>${gradeOptions()}</select></label>
      </div>
      <div class="row-actions"><button type="button" class="btn btn--primary" id="rtCalc">${t("retake.calculate")}</button></div>
      <div id="rtResult" class="result-box" aria-live="polite"></div>
    </div>`;

  container.querySelector("#rtCourseSource")?.addEventListener("change", (event) => {
    const candidate = retakeCandidates.find((item) => item.key === event.target.value);
    if (!candidate) return;
    container.querySelector("#rtCourseCredits").value = candidate.course.credits ?? candidate.oldAttempt.credits ?? "";
    container.querySelector("#rtOldGrade").value = candidate.oldAttempt.grade;
  });

  container.querySelector("#rtCalc").addEventListener("click", () => {
    const input = {
      currentCgpa: container.querySelector("#rtCgpa").value,
      currentCredits: container.querySelector("#rtCredits").value,
      courseCredits: container.querySelector("#rtCourseCredits").value,
      oldGrade: container.querySelector("#rtOldGrade").value,
      newGrade: container.querySelector("#rtNewGrade").value,
      policy: container.querySelector("#rtPolicy").value,
    };
    const result = calculateRetake(input, system);
    const resultEl = container.querySelector("#rtResult");
    if (!result.ok) {
      resultEl.innerHTML = `<p class="result-note result-note--warn">${
        result.error === "range" ? t("cgpa.error.range").replace("{max}", String(maxGpa)) : t("gpa.error.credits")
      }</p>`;
      return;
    }
    track("calculator_opened", { tool: "retake" });
    Storage.set("latestRetake:v1", {
      courseAttemptId: retakeCandidates.find((item) => item.key === container.querySelector("#rtCourseSource")?.value)?.course?.attemptId || null,
      ...input,
      result,
      updatedAt: new Date().toISOString(),
    });
    const sign = result.delta > 0 ? "+" : "";
    resultEl.innerHTML = `
      <div class="result-headline">
        <span class="result-label">${t("retake.result.title")}</span>
        <span class="result-value">${result.after.toFixed(3)}</span>
      </div>
      <div class="result-meta">
        <span>${t("retake.result.before")}: <strong>${result.before.toFixed(3)}</strong></span>
        <span>${t("retake.result.change")}: <strong>${sign}${result.delta.toFixed(3)}</strong></span>
      </div>
      <details class="calculation-breakdown">
        <summary>Show calculation and policy</summary>
        <div>
          <p><span>Starting quality points</span><strong>${Number(input.currentCgpa).toFixed(3)} × ${Number(input.currentCredits)} = ${(Number(input.currentCgpa) * Number(input.currentCredits)).toFixed(3)}</strong></p>
          <p><span>Selected policy</span><strong>${escapeHtml(input.policy)}</strong></p>
          <p><span>Course attempt</span><strong>${Number(input.courseCredits)} credits · ${escapeHtml(input.oldGrade)} → ${escapeHtml(input.newGrade)}</strong></p>
          <p class="calculation-total"><span>Estimated change</span><strong>${result.before.toFixed(3)} → ${result.after.toFixed(3)}</strong></p>
        </div>
      </details>
      <div class="result-learning-links"><a href="/guides/retake-policy-example">Compare four retake policies</a><a href="/international-systems">Verify university policy</a></div>`;
  });
}
