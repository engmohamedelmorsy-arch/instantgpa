// degree-audit.js
// A deterministic, local audit: you define requirement groups (e.g. "Major
// Courses — 60 credits"), assign each imported transcript course to a
// group, and this totals completed/remaining credits per group and
// overall. No AI, no guessing at official degree rules — if something
// isn't knowable from what you've entered, it's reported as "Unknown"
// rather than invented.

import { Storage } from "./storage.js";
import { getSavedImport } from "./transcript-import.js";
import { routeHref } from "./app.js";
import { t } from "./localization.js";
import { track } from "./analytics.js";
import { GradingEngine } from "./grading-engine.js";
import { courseIdentityKey, evaluateCourse, resolveGrade } from "./academic-policy.js";
import { AcademicRecord } from "./academic-record.js";
import { inferAuditSetup } from "./degree-audit-inference.js";
import { AcademicProfile } from "./academic-profile.js";
import { CloudSync } from "./cloud-sync.js";

export { inferAuditSetup } from "./degree-audit-inference.js";

const GROUPS_KEY = "degreeAuditGroups";
const ASSIGNMENTS_KEY = "degreeAuditAssignments";

export function calculateAudit(groups, records, assignments, system = GradingEngine.getActive(), minimumGrades = {}) {
  if (!groups.length) return { ok: false, error: "noGroups" };

  const byGroup = groups.map((g) => ({
    ...g,
    creditsCompleted: 0,
    courseCount: 0,
    inProgressCourseCount: 0,
    completedCoursesMissingCredits: 0,
    belowMinimumCourseCount: 0,
  }));
  const byId = Object.fromEntries(byGroup.map((g) => [g.id, g]));

  let totalCompleted = 0;
  let totalRequired = 0;

  const countedCourses = new Set();
  const countedInProgress = new Set();
  records.map((record) => evaluateCourse(record, system)).reverse().forEach((record) => {
    const groupId = assignments[record.attemptId || record.id];
    const group = byId[groupId];
    const identity = courseIdentityKey(record) || record.attemptId || record.id;
    if (!group || countedCourses.has(identity)) return;
    if (record.outcome === "inProgress") {
      if (!countedInProgress.has(identity)) {
        countedInProgress.add(identity);
        group.inProgressCourseCount += 1;
      }
      return;
    }
    if (record.outcome === "passed" && record.issue === "missing_or_invalid_credits") {
      countedCourses.add(identity);
      group.completedCoursesMissingCredits += 1;
      return;
    }
    if (!record.earnsCredit) return;
    const requiredLabel = minimumGrades[identity] || group.minimumGrade || "";
    const required = requiredLabel ? resolveGrade(system, requiredLabel) : null;
    if (required?.grade && Number.isFinite(record.gradePoints) && Number(record.gradePoints) < Number(required.grade.points)) {
      countedCourses.add(identity);
      group.belowMinimumCourseCount += 1;
      return;
    }
    countedCourses.add(identity);
    group.creditsCompleted += Number(record.credits) || 0;
    group.courseCount += 1;
  });

  const results = byGroup.map((g) => {
    totalCompleted += g.creditsCompleted;
    totalRequired += g.creditsRequired;
    const remaining = g.completedCoursesMissingCredits > 0
      ? null
      : Math.max(0, g.creditsRequired - g.creditsCompleted);
    let status;
    if (g.creditsRequired <= 0) status = "unknown";
    else if (g.creditsCompleted >= g.creditsRequired) status = "complete";
    else if (g.creditsCompleted > 0 || g.inProgressCourseCount > 0 || g.completedCoursesMissingCredits > 0) status = "inProgress";
    else status = "remaining";
    return { ...g, remaining, status };
  });

  const hasMissingCompletedCredits = results.some((group) => group.completedCoursesMissingCredits > 0);
  const overallPct = totalRequired > 0 && !hasMissingCompletedCredits
    ? Math.min(100, Math.round((totalCompleted / totalRequired) * 1000) / 10)
    : null;

  return { ok: true, groups: results, totalCompleted, totalRequired, overallPct };
}

export function getSavedAuditSummary(records) {
  const groups = loadGroups().filter((g) => g.name && g.name.trim());
  const assignments = loadAssignments();
  if (!groups.length || !records || !records.length) return null;
  const cleanGroups = groups.map((g) => ({
    id: g.id, name: g.name.trim(), creditsRequired: Number(g.creditsRequired) || 0,
    minimumGrade: g.minimumGrade || "", sourceId: g.sourceId || "", sourcePage: g.sourcePage || null,
  }));
  const result = calculateAudit(cleanGroups, records, assignments, GradingEngine.getActive());
  return result.ok ? result : null;
}

function loadGroups() {
  return Storage.get(GROUPS_KEY, []);
}
function saveGroups(groups) {
  Storage.set(GROUPS_KEY, groups);
}
function loadAssignments() {
  return Storage.get(ASSIGNMENTS_KEY, {});
}
function saveAssignments(a) {
  Storage.set(ASSIGNMENTS_KEY, a);
}

let groupId = 0;

export function setupFromApprovedCatalog(catalog, records) {
  if (!catalog?.verified || !Array.isArray(catalog.facts)) return { groups: [], assignments: {}, citations: [] };
  const requirementFacts = catalog.facts.filter((fact) => fact.kind === "requirement" && Number(fact.credits) > 0);
  const courseFacts = catalog.facts.filter((fact) => fact.kind === "course" && fact.code);
  const groupMap = new Map();
  for (const fact of requirementFacts) {
    const name = fact.groupName || fact.title || "Programme requirements";
    const existing = groupMap.get(name);
    if (!existing || Number(fact.credits) > existing.creditsRequired) {
      groupMap.set(name, {
        id: groupMap.size + 1,
        name,
        creditsRequired: Number(fact.credits),
        sourceId: fact.sourceId,
        sourcePage: fact.sourcePage,
        minimumGrade: fact.minimumGrade || "",
      });
    }
  }
  for (const fact of courseFacts) {
    const name = fact.groupName || "Programme courses";
    if (!groupMap.has(name)) {
      const credits = courseFacts.filter((course) => (course.groupName || "Programme courses") === name).reduce((sum, course) => sum + (Number(course.credits) || 0), 0);
      groupMap.set(name, { id: groupMap.size + 1, name, creditsRequired: credits, sourceId: fact.sourceId, sourcePage: fact.sourcePage, minimumGrade: "" });
    }
  }
  const groups = [...groupMap.values()];
  const byName = new Map(groups.map((group) => [group.name, group.id]));
  const catalogByCode = new Map(courseFacts.map((fact) => [String(fact.code).replace(/[^a-z0-9]/gi, "").toUpperCase(), fact]));
  const assignments = {};
  const minimumGrades = {};
  for (const record of records || []) {
    const normalizedCode = String(record.code || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    const fact = catalogByCode.get(normalizedCode);
    if (fact) {
      assignments[record.attemptId || record.id] = byName.get(fact.groupName || "Programme courses");
      if (fact.minimumGrade) minimumGrades[courseIdentityKey(record)] = fact.minimumGrade;
    }
  }
  return {
    groups,
    assignments,
    citations: catalog.sources || [],
    courseFacts,
    policyFacts: catalog.facts.filter((fact) => fact.kind === "policy"),
    minimumGrades,
  };
}

export async function mount(container) {
  const imported = getSavedImport();
  const programRequirements = AcademicRecord.programRequirements();
  const sharedSummary = AcademicRecord.summary(GradingEngine.getActive());
  const profile = AcademicProfile.get();
  const requestedCatalogYear = Storage.get("degreeAuditCatalogYear", "");
  let approvedCatalog = null;
  if (profile && imported?.records?.length) {
    const result = await CloudSync.getApprovedCatalog({
      institution: profile.university,
      countryCode: profile.countryCode,
      college: profile.college,
      department: profile.department,
      program: profile.department,
      catalogYear: requestedCatalogYear,
    });
    if (result.ok && result.data?.verified) approvedCatalog = result.data;
  }
  let groups = loadGroups();
  let assignments = loadAssignments(); // { recordIndex: groupId }
  let autoSetupApplied = false;
  const officialSetup = setupFromApprovedCatalog(approvedCatalog, imported?.records || []);

  if (!groups.length) {
    const inferred = officialSetup.groups.length ? officialSetup : inferAuditSetup(imported?.records || [], programRequirements);
    groups = inferred.groups;
    assignments = inferred.assignments;
    autoSetupApplied = groups.length > 0;
    if (autoSetupApplied) {
      saveGroups(groups);
      saveAssignments(assignments);
    } else {
      groups = [{ id: ++groupId, name: "", creditsRequired: "" }];
    }
    groupId = Math.max(...groups.map((group) => Number(group.id) || 0), 0);
  } else {
    groupId = Math.max(...groups.map((g) => g.id), 0);
  }

  function render() {
    if (!imported || !imported.records.length) {
      container.innerHTML = `
        <div class="tool-card">
          <h2>${t("tools.degreeAudit.title")}</h2>
          <p class="tool-sub">${t("audit.subtitle")}</p>
          <p class="result-note result-note--muted">${t("audit.noTranscript")}</p>
          <a class="btn btn--primary" href="${routeHref("transcript-import")}">${t("audit.goImport")}</a>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="tool-card tool-card--wide">
        <h2>${t("tools.degreeAudit.title")}</h2>
        <p class="tool-sub">${t("audit.subtitle")}</p>
        <label class="field"><span>${document.documentElement.lang === "ar" ? "سنة الكتالوج" : "Catalog year"}</span><input id="auditCatalogYear" maxlength="30" value="${escapeHtml(requestedCatalogYear)}" placeholder="2026–2027"><small>${document.documentElement.lang === "ar" ? "يجب أن تطابق سنة دخولك أو السنة التي تعتمدها جامعتك." : "Use your entry year or the catalog year assigned by your university."}</small></label>
        ${officialSetup.groups.length ? `<p class="record-connected">● ${document.documentElement.lang === "ar" ? "تم إعداد التدقيق من كتالوج رسمي راجعه واعتمده المسؤول." : "This audit was prepared from an Owner-reviewed official catalog."}</p>` : autoSetupApplied ? '<p class="record-connected">● Requirement groups and course assignments were inferred from the reviewed transcript/study plan. They are not official until matched to an approved catalog.</p>' : `<p class="result-note result-note--warn">${document.documentElement.lang === "ar" ? "لا يوجد كتالوج رسمي معتمد مطابق. النتائج اليدوية غير مؤكدة." : "No matching approved official catalog exists. Manual results are unverified."}</p>`}
        ${officialSetup.citations?.length ? `<div class="result-note"><strong>${document.documentElement.lang === "ar" ? "المصادر الرسمية" : "Official sources"}</strong><ul>${officialSetup.citations.map((source) => `<li><a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(source.sourceTitle)}</a> · ${escapeHtml(source.catalogYear)}</li>`).join("")}</ul></div>` : ""}
        ${programRequirements ? `<section class="program-requirement-summary" aria-label="Program credit requirement">
          <div><span>Total program requirement</span><strong>${programRequirements.totalCreditsRequired} credits</strong></div>
          <div><span>Completed credits confirmed</span><strong>${sharedSummary.earnedCredits || "—"}</strong></div>
          <div><span>Currently registered (U)</span><strong>${sharedSummary.inProgressCourses}</strong></div>
        </section>
        ${sharedSummary.issues.some((issue) => issue.issue === "missing_or_invalid_credits") ? `<p class="result-note result-note--warn"><strong>Course-level credits are missing.</strong> The ${programRequirements.totalCreditsRequired}-credit program total is used only as a graduation requirement; completed and remaining credits cannot be calculated accurately until each completed course has its own credit hours.</p>` : ""}` : ""}

        <h3>${t("audit.groups.title")}</h3>
        <div class="course-rows" role="table">
          <div class="course-row course-row--head" role="row">
            <span role="columnheader">${t("audit.groups.name")}</span>
            <span role="columnheader">${t("audit.groups.credits")}</span>
            <span role="columnheader" class="visually-hidden">${t("gpa.remove")}</span>
          </div>
          ${groups
            .map(
              (g) => `
            <div class="course-row course-row--2" role="row" data-group="${g.id}">
              <input type="text" class="ag-name" placeholder="${t("audit.groups.name.placeholder")}" value="${escapeHtml(g.name)}">
              <input type="number" class="ag-credits" min="0" step="1" value="${g.creditsRequired}">
              <button type="button" class="row-remove" data-remove-group="${g.id}" aria-label="${t("gpa.remove")}">✕</button>
            </div>`
            )
            .join("")}
        </div>
        <div class="row-actions"><button type="button" class="btn btn--ghost" id="auAddGroup">+ ${t("audit.groups.add")}</button></div>

        <h3 style="margin-top:24px">${t("audit.assign.title")}</h3>
        <table class="intl-table table--standard responsive-table">
          <thead><tr><th>${t("gpa.course")}</th><th>${t("gpa.credits")}</th><th>${t("audit.assign.group")}</th></tr></thead>
          <tbody>
            ${imported.records
              .map(
                (r) => `
              <tr>
                <td data-label="${t("gpa.course")}">${escapeHtml(r.name)}</td>
                <td data-label="${t("gpa.credits")}">${r.credits ?? "Needs review"}</td>
                <td data-label="${t("audit.assign.group")}">
                  <select class="ag-assign" data-attempt="${escapeHtml(r.attemptId || r.id)}">
                    <option value="">${t("audit.assign.unassigned")}</option>
                    ${groups.map((g) => `<option value="${g.id}" ${assignments[r.attemptId || r.id] === g.id ? "selected" : ""}>${escapeHtml(g.name) || "—"}</option>`).join("")}
                  </select>
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>

        <div class="row-actions"><button type="button" class="btn btn--primary" id="auRun">${t("audit.run")}</button></div>
        <div id="auResult" class="result-box" aria-live="polite"></div>
      </div>`;

    container.querySelectorAll(".ag-name, .ag-credits").forEach((el) => {
      el.addEventListener("change", () => {
        persistGroups();
        syncAssignOptionLabels();
      });
      el.addEventListener("input", () => {
        if (el.classList.contains("ag-name")) syncAssignOptionLabels(el);
      });
    });
    container.querySelector("#auditCatalogYear")?.addEventListener("change", (event) => {
      Storage.set("degreeAuditCatalogYear", event.target.value.trim());
      window.location.reload();
    });
    container.querySelectorAll("[data-remove-group]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.removeGroup);
        groups = groups.filter((g) => g.id !== id);
        render();
        persistGroups();
      });
    });
    container.querySelector("#auAddGroup").addEventListener("click", () => {
      groups.push({ id: ++groupId, name: "", creditsRequired: "" });
      render();
    });
    container.querySelectorAll(".ag-assign").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const attemptId = e.target.dataset.attempt;
        assignments[attemptId] = e.target.value ? Number(e.target.value) : null;
        saveAssignments(assignments);
      });
    });
    container.querySelector("#auRun").addEventListener("click", runAudit);
  }

  function syncAssignOptionLabels(fromInput) {
    const rowsToSync = fromInput ? [fromInput.closest("[data-group]")] : [...container.querySelectorAll("[data-group]")];
    rowsToSync.forEach((row) => {
      if (!row) return;
      const id = row.dataset.group;
      const name = row.querySelector(".ag-name").value.trim() || "—";
      container.querySelectorAll(`.ag-assign option[value="${id}"]`).forEach((opt) => {
        opt.textContent = name;
      });
    });
  }

  function persistGroups() {
    groups = groups.map((g) => {
      const row = container.querySelector(`[data-group="${g.id}"]`);
      if (!row) return g;
      return {
        ...g,
        id: g.id,
        name: row.querySelector(".ag-name").value,
        creditsRequired: Number(row.querySelector(".ag-credits").value) || 0,
      };
    });
    saveGroups(groups);
  }

  function runAudit() {
    persistGroups();
    const cleanGroups = groups
      .filter((g) => g.name.trim())
      .map((g) => ({
        id: g.id, name: g.name.trim(), creditsRequired: Number(g.creditsRequired) || 0,
        minimumGrade: g.minimumGrade || "", sourceId: g.sourceId || "", sourcePage: g.sourcePage || null,
      }));
    const result = calculateAudit(cleanGroups, imported.records, assignments, GradingEngine.getActive(), officialSetup.minimumGrades || {});
    const resultEl = container.querySelector("#auResult");
    if (!result.ok) {
      resultEl.innerHTML = `<p class="result-note result-note--warn">${t("audit.error.noGroups")}</p>`;
      return;
    }
    track("degree_audit_completed");
    const statusLabel = { complete: t("audit.status.complete"), inProgress: t("audit.status.inProgress"), remaining: t("audit.status.remaining"), unknown: t("audit.status.unknown") };
    resultEl.innerHTML = `
      <div class="result-headline">
        <span class="result-label">${t("audit.overall")}</span>
        <span class="result-value">${result.overallPct == null ? t("common.optional") : result.overallPct + "%"}</span>
      </div>
      <div class="result-meta">
        <span>${t("audit.totalCompleted")}: <strong>${result.totalCompleted}</strong></span>
        <span>${t("audit.totalRequired")}: <strong>${result.totalRequired}</strong></span>
      </div>
      <div class="audit-visual-grid" aria-label="Requirement progress">
        ${result.groups.map((g) => {
          const percent = g.creditsRequired > 0 ? Math.max(0, Math.min(100, (g.creditsCompleted / g.creditsRequired) * 100)) : 0;
          const groupCourses = imported.records
            .filter((record) => assignments[record.attemptId || record.id] === g.id)
            .map((record) => evaluateCourse(record, GradingEngine.getActive()));
          const completed = groupCourses.filter((course) => course.earnsCredit);
          const current = groupCourses.filter((course) => course.outcome === "inProgress");
          const planned = groupCourses.filter((course) => course.outcome === "planned");
          return `<details class="audit-visual-card">
            <summary><span class="audit-ring" style="--progress:${percent.toFixed(1)}"><b>${Math.round(percent)}%</b></span><span><strong>${escapeHtml(g.name)}</strong><small>${g.creditsCompleted} of ${g.creditsRequired} credits · ${statusLabel[g.status]}</small></span></summary>
            <div class="audit-course-states">
              <p><b>Completed</b><span>${completed.length ? completed.map((course) => escapeHtml(course.code || course.name)).join(", ") : "None assigned"}</span></p>
              <p><b>In progress</b><span>${current.length ? current.map((course) => escapeHtml(course.code || course.name)).join(", ") : "None"}</span></p>
              <p><b>Planned</b><span>${planned.length ? planned.map((course) => escapeHtml(course.code || course.name)).join(", ") : "None"}</span></p>
              <p><b>Remaining</b><span>${g.remaining == null ? "Needs credit review" : `${g.remaining} credits`}</span></p>
              ${g.belowMinimumCourseCount ? `<p><b>${document.documentElement.lang === "ar" ? "أقل من الحد الأدنى" : "Below minimum grade"}</b><span>${g.belowMinimumCourseCount}</span></p>` : ""}
              <p><b>Possible alternatives</b><span>Confirm approved electives or substitutions in the official programme handbook.</span></p>
            </div>
          </details>`;
        }).join("")}
      </div>
      <div class="record-table-wrap" style="margin-top:14px">
      <table class="intl-table table--wide responsive-table">
        <thead><tr><th>${t("audit.groups.name")}</th><th>${t("audit.totalCompleted")}</th><th>In progress (U)</th><th>${t("audit.groups.credits")}</th><th>${t("audit.remaining")}</th><th>Status</th></tr></thead>
        <tbody>${result.groups
          .map(
            (g) =>
              `<tr><td data-label="${t("audit.groups.name")}">${escapeHtml(g.name)}</td><td data-label="${t("audit.totalCompleted")}">${g.creditsCompleted}${g.completedCoursesMissingCredits ? ` + ${g.completedCoursesMissingCredits} course(s) awaiting credit hours` : ""}${g.belowMinimumCourseCount ? ` · ${g.belowMinimumCourseCount} below minimum` : ""}</td><td data-label="In progress (U)">${g.inProgressCourseCount}</td><td data-label="${t("audit.groups.credits")}">${g.creditsRequired}</td><td data-label="${t("audit.remaining")}">${g.remaining == null ? "Unknown" : g.remaining}</td><td data-label="Status">${statusLabel[g.status]}</td></tr>`
          )
          .join("")}</tbody>
      </table>
      </div>`;
    if (officialSetup.policyFacts?.length) {
      resultEl.insertAdjacentHTML("beforeend", `<details class="result-note"><summary><strong>${document.documentElement.lang === "ar" ? "قواعد الإعادة والتحويل والإعفاء" : "Retake, transfer, and exemption rules"}</strong></summary><ul>${officialSetup.policyFacts.map((fact) => `<li>${escapeHtml(fact.summary)} <small>(${document.documentElement.lang === "ar" ? "صفحة" : "page"} ${fact.sourcePage})</small></li>`).join("")}</ul></details>`);
    }
  }

  render();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
