// gpa-calculator.js
// Formula: GPA = sum(credits * points) / sum(credits)
// Deterministic, no AI involved. calculateGpa() is pure and unit-testable.

import { GradingEngine } from "./grading-engine.js";
import { AcademicRecord } from "./academic-record.js";
import { t } from "./localization.js";
import { track } from "./analytics.js";
import { evaluateCourse, normalizeGradeLabel } from "./academic-policy.js";
import { Storage } from "./storage.js";
import { FreeWorkflow } from "./free-workflow.js";

// courses: [{ name, credits, grade }]
// Completely empty/planned rows are skipped so a half-filled form does not
// block calculation. Completed malformed rows and duplicate transcript
// selections are explicit errors rather than silently producing a wrong GPA.
export function calculateGpa(courses, gradingSystem) {
  if (!gradingSystem || !Array.isArray(gradingSystem.grades)) {
    return { ok: false, error: "noSystem" };
  }

  let totalCredits = 0;
  let totalPoints = 0;
  let usableRows = 0;
  const selectedTranscriptCourses = new Set();

  for (const c of courses || []) {
    if (!c.name && !c.code && !c.grade && (c.credits === "" || c.credits == null)) continue;
    const transcriptKey = String(c.sourceAttemptId || "").trim();
    if (transcriptKey) {
      if (selectedTranscriptCourses.has(transcriptKey)) return { ok: false, error: "duplicateCourse" };
      selectedTranscriptCourses.add(transcriptKey);
    }
    const evaluated = evaluateCourse({ ...c, status: c.status || (c.grade ? "graded" : "planned") }, gradingSystem);
    if (evaluated.issue === "missing_or_invalid_credits" && !["inProgress", "planned"].includes(evaluated.outcome)) return { ok: false, error: "invalidCredits" };
    if (evaluated.issue === "unknown_grade") return { ok: false, error: "unknownGrade" };
    if (!evaluated.includeInGpa) continue;
    usableRows += 1;
    totalCredits += evaluated.credits;
    totalPoints += evaluated.qualityPoints;
  }

  if (usableRows === 0) return { ok: false, error: "noCourses" };
  if (totalCredits === 0) return { ok: false, error: "noCourses" };

  const gpa = totalPoints / totalCredits;
  return {
    ok: true,
    gpa: Math.round(gpa * 1000) / 1000, // exactly 3 decimal places
    totalCredits,
    totalPoints: Math.round(totalPoints * 1000) / 1000,
  };
}

let rowId = 0;
function newRow(term = "") {
  rowId += 1;
  return { id: `manual-${rowId}`, term, code: "", name: "", credits: "", grade: "", type: "Core", source: "manual" };
}

function sourceCourseKey(course = {}) {
  return String(
    course.attemptId
      || course.sourceAttemptId
      || course.id
      || [course.term, course.code, course.name].map((value) => String(value || "").trim().toLocaleLowerCase()).join("|")
  );
}

export function mount(container) {
  container.classList.add("tool-host--gpa-entry");
  const system = GradingEngine.getActive();
  const imported = AcademicRecord.courses();
  const registered = imported.filter((course) => normalizeGradeLabel(course.grade) === "U" || course.status === "in_progress");
  // When U/in-progress rows exist, those are the natural current-semester
  // choices. When they do not, expose the reviewed transcript by semester so
  // the student can select a course instead of retyping it into the six slots.
  const selectableCourses = registered.length
    ? imported.filter((course) => registered.includes(course) || course.status === "planned" || !course.grade || course.grade === "--")
    : imported;
  const knownTerms = [...new Set((selectableCourses.length ? selectableCourses : imported).map((course) => course.term).filter(Boolean))];
  const defaultTerm = registered[0]?.term || knownTerms.at(-1) || "Current term";
  const savedDraft = Storage.get("currentTermGpa:v1", null);
  let rows = registered.length
    ? registered.map((course) => ({ ...course, id: `current-${course.attemptId || course.id || ++rowId}`, sourceAttemptId: sourceCourseKey(course), originalGrade: course.grade, grade: "", status: "planned" }))
    : Array.isArray(savedDraft?.courses) && savedDraft.courses.length
      ? savedDraft.courses.map((course) => ({ ...course }))
      : Array.from({ length: 6 }, () => newRow(defaultTerm));
  let influentialOnly = false;
  let deletedRow = null;

  function gradeOptions(selected) {
    const options = (system?.grades || [])
      .slice()
      .sort((a, b) => b.min - a.min)
      .map((g) => `<option value="${escapeHtml(g.label)}" ${g.label === selected ? "selected" : ""}>${escapeHtml(g.label)}</option>`)
      .join("");
    return normalizeGradeLabel(selected) === "U" && !(system?.grades || []).some((grade) => normalizeGradeLabel(grade.label) === "U")
      ? `${options}<option value="U" selected>U · Ungraded / currently registered</option>`
      : options;
  }

  function termOptions(selected) {
    const terms = [...new Set([selected, ...knownTerms, "Current term"].filter(Boolean))];
    return terms.map((term) => `<option value="${escapeHtml(term)}" ${term === selected ? "selected" : ""}>${escapeHtml(term)}</option>`).join("");
  }

  function courseSuggestions(row) {
    const selectedElsewhere = new Set(
      rows
        .filter((candidate) => candidate.id !== row.id && candidate.sourceAttemptId)
        .map((candidate) => String(candidate.sourceAttemptId))
    );
    return selectableCourses.filter((course) => {
      const termMatches = !row.term || course.term === row.term;
      const courseKey = sourceCourseKey(course);
      return termMatches && (!selectedElsewhere.has(courseKey) || String(row.sourceAttemptId || "") === courseKey);
    });
  }

  function render() {
    container.innerHTML = `
      <div class="tool-card gpa-entry-workspace">
        <header class="gpa-workspace-title">
          <div>
            <h2>${t("gpa.title")}</h2>
            <p class="tool-sub">${t("gpa.subtitle")}</p>
          </div>
          <span class="gpa-live-badge">Updates instantly</span>
        </header>

        <nav class="calculator-mode-tabs" aria-label="GPA calculator modes">
          <span class="is-active" aria-current="page">Semester GPA</span>
          <a href="/cgpa-calculator">Cumulative GPA</a>
          <a href="/graduation-predictor">Target GPA</a>
        </nav>

        <div class="gpa-calculator-grid">
          <section class="gpa-table-panel" aria-labelledby="semesterCoursesTitle">
            <div class="gpa-table-heading">
              <h3 id="semesterCoursesTitle">Semester courses</h3>
              <span>Enter one course per row</span>
            </div>
            ${registered.length
              ? `<p class="record-connected">● ${registered.length} currently registered course${registered.length === 1 ? "" : "s"} loaded from U grades. Choose the expected grade; course names and credits are already filled.</p>`
              : `<p class="record-connected record-connected--empty">● No U-grade courses were found. Six clean slots are ready; choose a term to see only courses from that term.</p>`}
            <div class="course-rows" role="table" aria-label="Semester courses and grades">
              <div class="course-row course-row--head" role="row">
                <span role="columnheader">${t("gpa.course")}</span>
                <span role="columnheader">${t("gpa.grade")}</span>
                <span role="columnheader">${t("gpa.credits")}</span>
                <span role="columnheader" class="visually-hidden">${t("gpa.remove")}</span>
              </div>
              ${rows
                .filter((r) => !influentialOnly || (r.grade && Number(r.credits) > 0))
                .map(
                  (r) => `
                <div class="course-row" role="row" data-row="${r.id}">
                  <label class="course-field">
                    <span>${t("gpa.course")}</span>
                    <select class="course-term" aria-label="Semester for ${escapeHtml(r.name || "course")}">${termOptions(r.term || defaultTerm)}</select>
                    <input type="text" class="course-name" list="gpaCourseSuggestions-${escapeHtml(r.id)}" placeholder="${t("gpa.course.placeholder")}" value="${escapeHtml([r.code, r.name].filter(Boolean).join(" — "))}" aria-label="${t("gpa.course")}">
                    <datalist id="gpaCourseSuggestions-${escapeHtml(r.id)}">${courseSuggestions(r).map((course) => `<option value="${escapeHtml([course.code, course.name].filter(Boolean).join(" — "))}"></option>`).join("")}</datalist>
                  </label>
                  <label class="course-field">
                    <span>${t("gpa.grade")}</span>
                    <select class="course-grade" aria-label="${t("gpa.grade")}">
                      <option value="">—</option>
                      ${gradeOptions(r.grade)}
                    </select>
                  </label>
                  <label class="course-field">
                    <span>${t("gpa.credits")}</span>
                    <input type="number" class="course-credits" min="0" step="0.5" inputmode="decimal" value="${r.credits ?? ""}" aria-label="${t("gpa.credits")}">
                  </label>
                  <button type="button" class="row-remove" aria-label="${t("gpa.remove")}" data-remove="${r.id}">✕</button>
                </div>`
                )
                .join("")}
            </div>
            <div class="gpa-table-actions">
              <div class="row-actions">
                <button type="button" class="btn btn--ghost" id="gpaAddCourse">+ ${t("gpa.addCourse")}</button>
                <button type="button" class="btn btn--text" id="gpaInfluential">${influentialOnly ? "Show all courses" : "Show influential courses only"}</button>
                ${deletedRow ? '<button type="button" class="btn btn--text" id="gpaUndoDelete">↶ Undo delete</button>' : ""}
                <button type="button" class="btn btn--text" id="gpaReset">${t("gpa.reset")}</button>
              </div>
              <span class="tool-sub">Grades use your selected university scale.</span>
            </div>
          </section>

          <aside class="gpa-result-rail" aria-label="Live GPA result">
            <section class="gpa-result-card">
              <header class="gpa-result-card__head">
                <strong>Live result</strong>
                <span>Semester</span>
              </header>
              <div class="gpa-summary-strip" id="gpaSummary"></div>
              <div id="gpaResult" class="result-box" aria-live="polite"></div>
            </section>
            <section class="gpa-formula-card">
              <span>Calculation</span>
              <strong>Quality points ÷ total credits</strong>
              <p>The result updates as soon as each grade and credit value is complete.</p>
            </section>
          </aside>
        </div>
      </div>`;

    container.querySelectorAll(".course-row:not(.course-row--head)").forEach((rowEl) => {
      const id = rowEl.dataset.row;
      const row = rows.find((r) => r.id === id);
      rowEl.querySelector(".course-term").addEventListener("change", (e) => {
        row.term = e.target.value;
        const stillValid = courseSuggestions(row).some((course) => [course.code, course.name].filter(Boolean).join(" — ") === [row.code, row.name].filter(Boolean).join(" — "));
        if (!stillValid && row.source !== "manual") Object.assign(row, { code: "", name: "", credits: "", grade: "", source: "manual", sourceAttemptId: "" });
        persist();
        render();
      });
      rowEl.querySelector(".course-name").addEventListener("input", (e) => {
        const matched = courseSuggestions(row).find((course) => [course.code, course.name].filter(Boolean).join(" — ") === e.target.value);
        if (matched) {
          Object.assign(row, { code: matched.code, name: matched.name, credits: matched.credits, source: "transcript", sourceAttemptId: sourceCourseKey(matched) });
        } else {
          row.name = e.target.value;
          row.code = "";
          row.source = "manual";
          row.sourceAttemptId = "";
        }
        persist();
        recalc();
      });
      rowEl.querySelector(".course-name").addEventListener("paste", (event) => {
        const pasted = event.clipboardData?.getData("text/plain") || "";
        if (!/[\t\r\n]/.test(pasted)) return;
        event.preventDefault();
        const pastedRows = pasted.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
          const [name = "", credits = "", grade = ""] = line.split(/\t|,/).map((part) => part.trim());
          return { ...newRow(), name, credits, grade, status: grade ? "graded" : "planned" };
        });
        const targetIndex = rows.findIndex((candidate) => candidate.id === id);
        rows.splice(targetIndex, 1, ...pastedRows);
        persist();
        render();
      });
      rowEl.querySelector(".course-credits").addEventListener("input", (e) => {
        row.credits = e.target.value;
        persist();
        recalc();
      });
      rowEl.querySelector(".course-grade").addEventListener("change", (e) => {
        row.grade = e.target.value;
        row.status = normalizeGradeLabel(row.grade) === "U" ? "in_progress" : row.grade ? "graded" : "planned";
        persist();
        recalc();
      });
      rowEl.querySelector(".row-remove").addEventListener("click", () => {
        deletedRow = { row: { ...row }, index: rows.findIndex((candidate) => candidate.id === id) };
        rows = rows.filter((r) => r.id !== id);
        persist();
        render();
      });
    });

    container.querySelector("#gpaAddCourse").addEventListener("click", () => {
      rows.push(newRow());
      render();
    });
    container.querySelector("#gpaInfluential")?.addEventListener("click", () => {
      influentialOnly = !influentialOnly;
      render();
    });
    container.querySelector("#gpaUndoDelete")?.addEventListener("click", () => {
      if (!deletedRow) return;
      rows.splice(Math.max(0, deletedRow.index), 0, deletedRow.row);
      deletedRow = null;
      persist();
      render();
    });
    container.querySelector("#gpaReset").addEventListener("click", () => {
      Storage.remove("currentTermGpa:v1");
      FreeWorkflow.markTranscriptReviewed();
      rows = Array.from({ length: 6 }, () => newRow(defaultTerm));
      render();
    });

    recalc();
  }

  function recalc() {
    const resultEl = container.querySelector("#gpaResult");
    const summaryEl = container.querySelector("#gpaSummary");
    const result = calculateGpa(rows, system);
    if (!result.ok) {
      const hadAnyInput = rows.some((r) => r.name || r.credits || r.grade);
      resultEl.innerHTML = hadAnyInput
        ? `<p class="result-note result-note--muted">${
            ["negativeCredits", "invalidCredits"].includes(result.error)
              ? t("gpa.error.credits")
              : result.error === "unknownGrade"
                ? "Resolve the unknown grade before calculating."
                : result.error === "duplicateCourse"
                  ? "Each transcript course can be selected once. Choose a different course for the duplicate row."
                  : t("gpa.error.noCourses")
          }</p>`
        : "";
      summaryEl.innerHTML = `<span><b>GPA</b><strong>—</strong> / ${system?.maxGpa || 4}</span><span>Total credits <strong>0</strong></span><span>Total grade points <strong>0</strong></span>`;
      return;
    }
    track("gpa_calculated");
    FreeWorkflow.markGpaCompleted(result);
    const breakdown = rows
      .map((row) => evaluateCourse({ ...row, status: row.status || (row.grade ? "graded" : "planned") }, system))
      .filter((course) => course.includeInGpa);
    const excluded = rows
      .map((row) => evaluateCourse({ ...row, status: row.status || (row.grade ? "graded" : "planned") }, system))
      .filter((course) => (course.name || course.code || course.grade) && !course.includeInGpa);
    resultEl.innerHTML = `
      <div class="result-headline">
        <span class="result-label">${t("gpa.result.title")}</span>
        <span class="result-value">${result.gpa.toFixed(3)}</span>
      </div>
      <div class="result-meta">
        <span>${t("gpa.result.totalCredits")}: <strong>${result.totalCredits}</strong></span>
        <span>${t("gpa.result.totalPoints")}: <strong>${result.totalPoints}</strong></span>
      </div>
      <details class="calculation-breakdown">
        <summary>Show calculation</summary>
        <div>
          ${breakdown.map((course) => `<p><span>${escapeHtml(course.name || course.code || "Course")}</span><strong>${course.credits} credits × ${Number(course.gradePoints).toFixed(2)} points = ${Number(course.qualityPoints).toFixed(2)}</strong></p>`).join("")}
          <p class="calculation-total"><span>GPA</span><strong>${result.totalPoints.toFixed(2)} ÷ ${result.totalCredits} = ${result.gpa.toFixed(3)}</strong></p>
        </div>
      </details>
      ${excluded.length ? `<details class="calculation-breakdown"><summary>Why some courses do not affect GPA</summary><div>${excluded.map((course) => `<p><span>${escapeHtml(course.name || course.code || "Course")}</span><strong>${escapeHtml(course.issue || course.outcome || "Excluded by policy")}</strong></p>`).join("")}</div></details>` : ""}
      <div class="result-learning-links"><a href="/guides/gpa-calculation-example">Worked example</a><a href="/trust">Methodology and exclusions</a></div>
      <aside class="post-value-actions" aria-label="Advanced academic analysis">
        <div><strong>Your semester GPA is ready.</strong><p>Continue to CGPA; your reviewed transcript is already connected and will be calculated automatically.</p></div>
        <a class="btn btn--primary" href="/cgpa-calculator">Continue to CGPA →</a>
      </aside>`;
    summaryEl.innerHTML = `<span><b>GPA</b><strong>${result.gpa.toFixed(2)}</strong> / ${system?.maxGpa || 4}</span><span>Total credits <strong>${result.totalCredits}</strong></span><span>Total grade points <strong>${result.totalPoints.toFixed(2)}</strong></span>`;
  }

  function persist() {
    const courses = rows
      .filter((row) => row.name || row.code || row.grade)
      .map((row) => ({ ...row, term: row.term || "Semester 1", credits: row.credits === "" ? null : Number(row.credits) }));
    Storage.set("currentTermGpa:v1", { courses, updatedAt: new Date().toISOString() });
  }

  render();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
