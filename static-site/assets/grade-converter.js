import { GradingEngine } from "./grading-engine.js";
import { AcademicState } from "./academic-state.js";
import { courseIdentityKey, evaluateCourse, normalizeGradeLabel, selectAttemptsForGpa } from "./academic-policy.js";
import { t } from "./localization.js";
import { track } from "./analytics.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

function sortedGrades(system) {
  return [...(system?.grades || [])].sort((a, b) => Number(b.min) - Number(a.min));
}

export function convertPercentage(percentage, gradingSystem) {
  const value = Number(percentage);
  if (!Number.isFinite(value) || value < 0 || value > 100) return { ok: false, error: "range" };
  const grades = sortedGrades(gradingSystem);
  const grade = grades.find((row) => value >= Number(row.min)) || grades.at(-1);
  return grade ? { ok: true, label: grade.label, points: Number(grade.points) } : { ok: false, error: "range" };
}

export function convertLetter(label, gradingSystem) {
  const normalized = normalizeGradeLabel(label);
  const grade = (gradingSystem?.grades || []).find((row) => normalizeGradeLabel(row.label) === normalized);
  return grade ? { ok: true, points: Number(grade.points) } : { ok: false, error: "unknownLetter" };
}

function estimatePercentageBand(label, sourceSystem) {
  const grades = sortedGrades(sourceSystem);
  const index = grades.findIndex((grade) => normalizeGradeLabel(grade.label) === normalizeGradeLabel(label));
  if (index < 0) return null;
  const lower = Number(grades[index].min);
  const upper = index === 0 ? 100 : Number(grades[index - 1].min) - 0.01;
  return { lower, upper, midpoint: Math.round(((lower + upper) / 2) * 100) / 100 };
}

export function convertCourseGrade(course, sourceSystem, targetSystem) {
  const evaluated = evaluateCourse(course, sourceSystem);
  if (evaluated.issue || ["withdrawn", "incomplete", "inProgress", "planned", "unknown"].includes(evaluated.outcome)) {
    return { ok: false, status: evaluated.outcome === "unknown" ? "Unknown grade" : "Not convertible", outcome: evaluated.outcome };
  }
  const exactPercentage = Number(course.percentage);
  const hasExactPercentage = course.percentage !== "" && course.percentage != null && Number.isFinite(exactPercentage);
  const estimatedBand = hasExactPercentage ? { lower: exactPercentage, upper: exactPercentage, midpoint: exactPercentage } : estimatePercentageBand(course.grade, sourceSystem);
  const percentage = estimatedBand?.midpoint;
  if (percentage == null) return { ok: false, status: "Not convertible", outcome: evaluated.outcome };
  const target = convertPercentage(percentage, targetSystem);
  const targetLow = convertPercentage(estimatedBand.lower, targetSystem);
  const targetHigh = convertPercentage(estimatedBand.upper, targetSystem);
  if (!target.ok) return { ok: false, status: "Not convertible", outcome: evaluated.outcome };
  return {
    ok: true,
    ...target,
    percentage,
    percentageRange: [estimatedBand.lower, estimatedBand.upper],
    pointsRange: targetLow.ok && targetHigh.ok
      ? [Math.min(targetLow.points, targetHigh.points), Math.max(targetLow.points, targetHigh.points)]
      : [target.points, target.points],
    confidence: hasExactPercentage ? "Exact" : "Estimated range",
    status: evaluated.earnsCredit ? "Passing" : "Failing",
    outcome: evaluated.outcome,
  };
}

export async function mount(container) {
  const sourceSystem = GradingEngine.getActive();
  const presets = await GradingEngine.listPresets();
  const allCourses = AcademicState.mergedCourses();
  const sourceSummary = AcademicState.recordSummary(sourceSystem);
  let targetSystemId = Object.keys(presets).find((id) => id !== sourceSystem?.presetId) || Object.keys(presets)[0];
  let mode = "all-systems";
  let selectedCourseId = allCourses.find((course) => course.grade && !["U", "IP", "W", "I", "--"].includes(normalizeGradeLabel(course.grade)))?.attemptId || "";

  function targetSystem() {
    return presets[targetSystemId] || sourceSystem;
  }

  function convertedCourses() {
    return allCourses.map((course) => ({
      course,
      result: convertCourseGrade(course, sourceSystem, targetSystem()),
    }));
  }

  function convertedForSystem(system) {
    return allCourses.map((course) => ({ course, result: convertCourseGrade(course, sourceSystem, system) }));
  }

  function targetSummary(courses) {
    const convertible = courses.filter(({ result, course }) => result.ok && Number.isFinite(Number(course.credits)));
    const convertedAttempts = convertible.map((item, index) => ({
      ...item.course,
      includeInGpa: true,
      gradePoints: Number(item.result.points),
      qualityPoints: Number(item.course.credits) * Number(item.result.points),
      lowPoints: Number(item.result.pointsRange?.[0] ?? item.result.points),
      highPoints: Number(item.result.pointsRange?.[1] ?? item.result.points),
      conversionIndex: index,
    }));
    const policy = sourceSystem?.retakePolicy || "all";
    let attempts = selectAttemptsForGpa(convertedAttempts, policy);
    if (policy === "average") {
      const grouped = new Map();
      convertedAttempts.forEach((attempt) => {
        const key = courseIdentityKey(attempt) || attempt.attemptId;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(attempt);
      });
      attempts = attempts.map((attempt) => {
        const group = grouped.get(courseIdentityKey(attempt) || attempt.attemptId) || [attempt];
        return {
          ...attempt,
          lowPoints: group.reduce((sum, item) => sum + item.lowPoints, 0) / group.length,
          highPoints: group.reduce((sum, item) => sum + item.highPoints, 0) / group.length,
        };
      });
    }
    const credits = attempts.reduce((sum, item) => sum + Number(item.credits), 0);
    const qualityPoints = attempts.reduce((sum, item) => sum + Number(item.qualityPoints), 0);
    const lowQualityPoints = attempts.reduce((sum, item) => sum + Number(item.credits) * Number(item.lowPoints ?? item.gradePoints), 0);
    const highQualityPoints = attempts.reduce((sum, item) => sum + Number(item.credits) * Number(item.highPoints ?? item.gradePoints), 0);
    return { credits, qualityPoints, gpa: credits ? qualityPoints / credits : null, gpaRange: credits ? [lowQualityPoints / credits, highQualityPoints / credits] : null };
  }

  function render() {
    const summary = sourceSummary;
    container.innerHTML = `
      <div class="tool-card tool-card--wide">
        <h2>${t("converter.title")}</h2>
        <p class="tool-sub">Convert transcript results using deterministic grade bands. Values without an original percentage are clearly marked as estimates.</p>
        <p class="record-connected">${summary.totalCourses ? `● Connected to ${summary.totalCourses} transcript courses.` : "● No transcript data yet — import courses to populate conversion."}</p>
        ${["courses", "semesters", "cumulative"].includes(mode) ? `<label class="converter-target">
          <span>Convert to:</span>
          <select id="converterTarget">
            ${Object.entries(presets).map(([id, preset]) => `<option value="${escapeHtml(id)}" ${id === targetSystemId ? "selected" : ""}>${escapeHtml(preset.label)}</option>`).join("")}
          </select>
        </label>` : ""}
        <div class="segmented" role="tablist" aria-label="Conversion view">
          <button type="button" class="segmented__btn ${mode === "all-systems" ? "is-active" : ""}" data-mode="all-systems">All systems</button>
          <button type="button" class="segmented__btn ${mode === "single-course" ? "is-active" : ""}" data-mode="single-course">One course</button>
          <button type="button" class="segmented__btn ${mode === "courses" ? "is-active" : ""}" data-mode="courses">One target</button>
          <button type="button" class="segmented__btn ${mode === "semesters" ? "is-active" : ""}" data-mode="semesters">Semester GPA</button>
          <button type="button" class="segmented__btn ${mode === "cumulative" ? "is-active" : ""}" data-mode="cumulative">Cumulative GPA</button>
        </div>
        <div class="converter-results">${renderResults()}</div>
        <p class="tool-note">Conversions are planning estimates, not an official credential evaluation. Confirm them with the responsible institution.</p>
      </div>`;
    container.querySelector("#converterTarget")?.addEventListener("change", (event) => {
      targetSystemId = event.target.value;
      track("grade_converted", { target: targetSystemId });
      render();
    });
    container.querySelector("#converterCourse")?.addEventListener("change", (event) => {
      selectedCourseId = event.target.value;
      render();
    });
    container.querySelectorAll(".segmented__btn").forEach((button) => button.addEventListener("click", () => {
      mode = button.dataset.mode;
      render();
    }));
  }

  function renderResults() {
    const courses = convertedCourses();
    if (!courses.length) return `<p class="result-note result-note--muted">Import a transcript first.</p>`;
    if (mode === "all-systems") {
      return `<section class="conversion-overview" aria-labelledby="allSystemsTitle">
        <div class="gpa-table-heading"><div><h3 id="allSystemsTitle">Your record in every available system</h3><p class="tool-sub">Calculated once from the reviewed transcript. Exact percentages are used when available; otherwise grade-band midpoints are clearly estimated.</p></div></div>
        <div class="record-table-wrap"><table class="intl-table responsive-table table--wide">
          <caption class="visually-hidden">Cumulative record converted to all grading systems</caption>
          <thead><tr><th>System</th><th>Scale</th><th>Estimated result</th><th>Converted credits</th><th>Coverage</th></tr></thead>
          <tbody>${Object.entries(presets).map(([id, preset]) => {
            const items = convertedForSystem(preset);
            const summary = targetSummary(items);
            const converted = items.filter((item) => item.result.ok).length;
            return `<tr class="${id === sourceSystem?.presetId ? "is-current-system" : ""}">
              <td data-label="System"><strong>${escapeHtml(preset.label)}</strong>${id === sourceSystem?.presetId ? "<small>Current system</small>" : ""}</td>
              <td data-label="Scale">0–${Number(preset.maxGpa)}</td>
              <td data-label="Estimated result"><strong>${summary.gpa == null ? "—" : summary.gpaRange && Math.abs(summary.gpaRange[1] - summary.gpaRange[0]) > .001 ? `${summary.gpaRange[0].toFixed(3)}–${summary.gpaRange[1].toFixed(3)}` : summary.gpa.toFixed(3)}</strong></td>
              <td data-label="Converted credits">${summary.credits}</td>
              <td data-label="Coverage">${converted}/${items.length} courses</td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>
      </section>`;
    }
    if (mode === "single-course") {
      const eligible = allCourses.filter((course) => course.grade && !["U", "IP", "W", "I", "--"].includes(normalizeGradeLabel(course.grade)));
      const selected = eligible.find((course) => course.attemptId === selectedCourseId) || eligible[0];
      if (!selected) return `<p class="result-note result-note--muted">No completed graded course is available for conversion.</p>`;
      selectedCourseId = selected.attemptId;
      return `<section class="single-course-converter">
        <label class="field"><span>Choose a completed course</span><select id="converterCourse">${eligible.map((course) => `<option value="${escapeHtml(course.attemptId)}" ${course.attemptId === selected.attemptId ? "selected" : ""}>${escapeHtml([course.code, course.name].filter(Boolean).join(" — "))} · ${escapeHtml(course.grade)}</option>`).join("")}</select></label>
        <div class="record-table-wrap"><table class="intl-table responsive-table table--wide">
          <caption class="visually-hidden">Selected course converted to every grading system</caption>
          <thead><tr><th>System</th><th>Original</th><th>Converted grade</th><th>Points</th><th>Confidence</th></tr></thead>
          <tbody>${Object.values(presets).map((preset) => {
            const result = convertCourseGrade(selected, sourceSystem, preset);
            return `<tr><td data-label="System">${escapeHtml(preset.label)}</td><td data-label="Original">${escapeHtml(selected.grade)}</td><td data-label="Converted grade"><strong>${result.ok ? escapeHtml(result.label) : "—"}</strong></td><td data-label="Points">${result.ok ? Number(result.points).toFixed(2) : "—"}</td><td data-label="Confidence">${result.ok ? result.confidence : escapeHtml(result.status)}</td></tr>`;
          }).join("")}</tbody>
        </table></div>
      </section>`;
    }
    if (mode === "courses") {
      return `<div class="record-table-wrap"><table class="intl-table responsive-table table--wide">
        <caption class="visually-hidden">Converted course grades</caption>
        <thead><tr><th scope="col">Course</th><th scope="col">Credits</th><th scope="col">Original</th><th scope="col">${escapeHtml(targetSystem().label)}</th><th scope="col">Confidence</th><th scope="col">Status</th></tr></thead>
        <tbody>${courses.map(({ course, result }) => `<tr>
          <td data-label="Course" dir="auto">${escapeHtml([course.code, course.name].filter(Boolean).join(" — "))}</td>
          <td data-label="Credits" class="bidi-token">${course.credits ?? "Needs review"}</td>
          <td data-label="Original" class="bidi-token">${escapeHtml(course.grade || "--")}</td>
          <td data-label="Converted" class="bidi-token">${result.ok ? `${escapeHtml(result.label)} (${Number(result.points).toFixed(2)})` : "—"}</td>
          <td data-label="Confidence">${result.ok ? result.confidence : "—"}</td>
          <td data-label="Status" class="${result.status === "Passing" ? "good" : ""}">${escapeHtml(result.status)}</td>
        </tr>`).join("")}</tbody>
      </table></div>`;
    }
    if (mode === "semesters") {
      const terms = new Map();
      courses.forEach((item) => {
        const term = item.course.term || "Semester";
        if (!terms.has(term)) terms.set(term, []);
        terms.get(term).push(item);
      });
      return `<table class="intl-table responsive-table table--standard"><caption class="visually-hidden">Converted semester GPA</caption>
        <thead><tr><th scope="col">Semester</th><th scope="col">Courses</th><th scope="col">Credits</th><th scope="col">Converted GPA</th></tr></thead>
        <tbody>${[...terms.entries()].map(([term, items]) => {
          const summary = targetSummary(items);
          return `<tr><td data-label="Semester">${escapeHtml(term)}</td><td data-label="Courses">${items.length}</td><td data-label="Credits">${summary.credits}</td><td data-label="Converted GPA"><strong>${summary.gpa == null ? "—" : summary.gpa.toFixed(2)}</strong></td></tr>`;
        }).join("")}</tbody>
      </table>`;
    }
    const summary = targetSummary(courses);
    return `<div class="cumulative-result"><span>Estimated CGPA</span><strong>${summary.gpa == null ? "—" : summary.gpa.toFixed(2)}</strong><small>/ ${targetSystem().maxGpa}</small></div>
      <table class="intl-table responsive-table table--standard"><caption class="visually-hidden">Converted cumulative GPA</caption>
        <thead><tr><th scope="col">System</th><th scope="col">Result</th><th scope="col">Credits</th><th scope="col">Confidence</th></tr></thead>
        <tbody><tr><td data-label="System">${escapeHtml(targetSystem().label)}</td><td data-label="Result"><strong>${summary.gpa == null ? "—" : summary.gpa.toFixed(2)}</strong></td><td data-label="Credits">${summary.credits}</td><td data-label="Confidence">Estimated where percentages are missing</td></tr></tbody>
      </table>`;
  }

  render();
}
