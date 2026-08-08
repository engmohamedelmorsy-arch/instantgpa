import { AcademicProfile } from "./academic-profile.js";
import { AcademicRecord } from "./academic-record.js";
import { AcademicState } from "./academic-state.js";
import { GradingEngine } from "./grading-engine.js";
import { getSavedAuditSummary } from "./degree-audit.js";
import { buildPlan } from "./planning.js";
import { CloudSync } from "./cloud-sync.js";
import { routeHref } from "./app.js";
import { Storage } from "./storage.js";

const METHOD_VERSION = "2026.07.29";

function reportData() {
  const profile = AcademicProfile.get() || {};
  const system = GradingEngine.getActive() || { label: "Not configured", maxGpa: 4, retakePolicy: "all" };
  const courses = AcademicState.mergedCourses();
  const summary = AcademicState.cumulativeSummary(system);
  const semesters = AcademicState.semesterSummaries(system);
  const programRequirements = AcademicRecord.programRequirements();
  const audit = getSavedAuditSummary(courses);
  const settings = { maxCredits: 18, summer: false, summerCredits: 9, ...(Storage.get("commandCenterSettings:v1", {}) || {}) };
  const plan = buildPlan(courses, { maxCredits: settings.maxCredits, summer: settings.summer, summerCredits: settings.summerCredits, system });
  return {
    reportType: "InstantGPA Academic Journey Report",
    methodVersion: METHOD_VERSION,
    createdAt: new Date().toISOString(),
    disclaimer: "Planning report only. The institution's Registrar and official academic record remain authoritative.",
    profile: {
      country: profile.countryName || "",
      university: profile.university || "",
      college: profile.college || "",
      program: profile.program || "",
    },
    gradingSystem: {
      label: system.label || "",
      maximumGpa: system.maxGpa || 4,
      retakePolicy: system.retakePolicy || "all",
      sourceStatus: system.presetId ? "Configured preset; confirm against the current official university policy" : "User-customized",
    },
    summary: {
      gpa: summary.gpa,
      maximumGpa: summary.maxGpa,
      gpaCredits: summary.gpaCredits,
      qualityPoints: summary.qualityPoints,
      earnedCredits: summary.earnedCredits,
      registeredCredits: summary.registeredCredits,
      gradedCourses: summary.gradedCourses,
      inProgressCourses: summary.inProgressCourses,
      plannedCourses: summary.plannedCourses,
      semesterCount: semesters.length,
      issues: summary.issues,
    },
    semesters: semesters.map((semester) => ({
      name: semester.name,
      gpa: semester.gpa,
      credits: semester.credits,
      qualityPoints: semester.qualityPoints,
    })),
    courses: summary.courses.map((course) => ({
      term: course.term,
      code: course.code,
      name: course.name,
      credits: course.credits,
      grade: course.grade,
      gradePoints: course.gradePoints,
      qualityPoints: course.qualityPoints,
      includedInGpa: Boolean(course.includeInGpa),
      outcome: course.outcome,
      issue: course.issue || "",
      source: course.source,
    })),
    programRequirements,
    degreeAudit: audit,
    graduationPlan: {
      assumptions: { maxCreditsPerSemester: 18, summerTerms: false },
      terms: plan.terms.map((term) => ({
        name: term.name,
        credits: term.credits,
        courses: term.courses.map((course) => ({
          code: course.code,
          name: course.name,
          credits: course.credits,
        })),
      })),
      blockedCourses: plan.blockedCourses.map((course) => ({
        code: course.code,
        name: course.name,
        reason: course.reason,
      })),
      inProgressCourses: plan.inProgressCourses.map((course) => ({
        code: course.code,
        name: course.name,
        credits: course.credits,
      })),
    },
    evidence: {
      methodology: "https://instantgpa.com/trust/",
      editorialPolicy: "https://instantgpa.com/editorial-policy/",
      corrections: "https://instantgpa.com/corrections/",
      originalTranscriptIncluded: false,
    },
  };
}

function score(value, digits = 3) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function summaryCards(report) {
  return `
    <section class="report-summary" aria-label="Academic summary">
      <div><span>Current GPA</span><strong>${score(report.summary.gpa)}</strong><small>of ${report.summary.maximumGpa}</small></div>
      <div><span>GPA credits</span><strong>${report.summary.gpaCredits}</strong><small>${report.summary.gradedCourses} counted courses</small></div>
      <div><span>Earned credits</span><strong>${report.summary.earnedCredits}</strong><small>${report.summary.inProgressCourses} in progress</small></div>
      <div><span>Semesters</span><strong>${report.summary.semesterCount}</strong><small>${report.summary.plannedCourses} planned courses</small></div>
    </section>`;
}

function issuePanel(report) {
  if (!report.summary.issues.length && !report.graduationPlan.blockedCourses.length) {
    return '<p class="report-assurance report-assurance--ok"><strong>No calculation-blocking issues detected.</strong> Official programme completion must still be confirmed by the institution.</p>';
  }
  return `<section class="report-assurance">
    <h3>Data that needs review</h3>
    <ul>
      ${report.summary.issues.map((issue) => `<li>${escapeHtml(issue.code || "Course")}: ${escapeHtml(issue.issue.replaceAll("_", " "))}</li>`).join("")}
      ${report.graduationPlan.blockedCourses.map((course) => `<li>${escapeHtml(course.code || course.name)}: ${escapeHtml(course.reason.replaceAll("_", " "))}</li>`).join("")}
    </ul>
  </section>`;
}

function courseTable(report) {
  if (!report.courses.length) return '<p class="result-note result-note--muted">No approved transcript courses are available yet.</p>';
  return `<div class="record-table-wrap">
    <table class="intl-table table--wide report-course-table">
      <thead><tr><th>Term</th><th>Course</th><th>Credits</th><th>Grade</th><th>Included</th><th>Quality points</th></tr></thead>
      <tbody>${report.courses.map((course) => `<tr>
        <td>${escapeHtml(course.term)}</td>
        <td><strong>${escapeHtml(course.code || course.name)}</strong>${course.code && course.name ? `<small>${escapeHtml(course.name)}</small>` : ""}</td>
        <td>${course.credits ?? "Needs review"}</td>
        <td>${escapeHtml(course.grade || course.outcome || "—")}</td>
        <td>${course.includedInGpa ? "Yes" : `No${course.issue ? ` · ${escapeHtml(course.issue.replaceAll("_", " "))}` : ""}`}</td>
        <td>${course.includedInGpa ? score(course.qualityPoints, 2) : "—"}
          ${course.includedInGpa ? `<details class="inline-calculation"><summary>Show calculation</summary><span>${course.credits} credits × ${score(course.gradePoints, 2)} points = ${score(course.qualityPoints, 2)}</span></details>` : ""}
        </td>
      </tr>`).join("")}</tbody>
    </table>
  </div>`;
}

function auditSection(report) {
  if (!report.degreeAudit) {
    return `<p class="result-note result-note--muted">Set requirement groups and assign courses in Degree Audit to include a reproducible audit here.</p>`;
  }
  const audit = report.degreeAudit;
  return `
    <div class="report-inline-stats">
      <span><strong>${audit.overallPct == null ? "Unknown" : `${audit.overallPct}%`}</strong> overall progress</span>
      <span><strong>${audit.totalCompleted}</strong> completed credits</span>
      <span><strong>${audit.totalRequired}</strong> required credits</span>
    </div>
    <div class="record-table-wrap">
      <table class="intl-table table--standard">
        <thead><tr><th>Requirement</th><th>Completed</th><th>Required</th><th>Remaining</th><th>Status</th></tr></thead>
        <tbody>${audit.groups.map((group) => `<tr><td>${escapeHtml(group.name)}</td><td>${group.creditsCompleted}</td><td>${group.creditsRequired}</td><td>${group.remaining == null ? "Unknown" : group.remaining}</td><td>${escapeHtml(group.status)}</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function planSection(report) {
  const plan = report.graduationPlan;
  if (!plan.terms.length) {
    return '<p class="result-note result-note--muted">No schedulable planned courses are available. Add planned courses with credits and prerequisites to build this section.</p>';
  }
  return plan.terms.map((term) => `<details open class="report-term">
    <summary><strong>${escapeHtml(term.name)}</strong><span>${term.credits} credits</span></summary>
    <ul>${term.courses.map((course) => `<li><span>${escapeHtml([course.code, course.name].filter(Boolean).join(" — "))}</span><strong>${course.credits} credits</strong></li>`).join("")}</ul>
  </details>`).join("");
}

function sharePayload(report, scope) {
  const common = {
    reportType: report.reportType,
    methodVersion: report.methodVersion,
    createdAt: report.createdAt,
    disclaimer: report.disclaimer,
    profile: report.profile,
    gradingSystem: report.gradingSystem,
    evidence: report.evidence,
  };
  if (scope === "results") return { ...common, summary: report.summary, semesters: report.semesters };
  if (scope === "plan") return { ...common, programRequirements: report.programRequirements, degreeAudit: report.degreeAudit, graduationPlan: report.graduationPlan };
  return report;
}

export async function mount(container) {
  const report = reportData();
  if (!report.courses.length) {
    container.innerHTML = `<section class="tool-card tool-card--wide report-empty">
      <span class="section-kicker">Academic Journey Report</span>
      <h2>Build one report from your approved transcript</h2>
      <p class="tool-sub">The report combines row-level GPA calculations, excluded courses, degree progress, graduation planning, sources, and method version. The original transcript file is never included automatically.</p>
      <div class="row-actions">
        <a class="btn btn--primary" href="${routeHref("transcript-import")}">Import transcript</a>
        <a class="btn btn--ghost" href="${routeHref("resources/academic-adviser-report")}">View report template</a>
      </div>
    </section>`;
    return;
  }

  container.innerHTML = `
    <article class="academic-report" id="academicReport">
      <header class="report-header">
        <div>
          <span class="section-kicker">Academic Journey Report</span>
          <h2>${escapeHtml(report.profile.university || "Academic progress report")}</h2>
          <p>${escapeHtml([report.profile.country, report.profile.college, report.profile.program].filter(Boolean).join(" · ") || "Student-confirmed academic context")}</p>
        </div>
        <div class="report-version"><span>Method</span><strong>${METHOD_VERSION}</strong><small>${new Date(report.createdAt).toLocaleString()}</small></div>
      </header>
      ${summaryCards(report)}
      ${issuePanel(report)}
      <section class="report-section">
        <div class="report-section__head"><div><span>01</span><h3>Calculation summary</h3></div><a href="${routeHref("trust")}">Methodology</a></div>
        <div class="formula-card">
          <p><strong>GPA</strong> = ${score(report.summary.qualityPoints, 2)} quality points ÷ ${report.summary.gpaCredits} GPA credits = <strong>${score(report.summary.gpa)}</strong></p>
          <p>Retake policy: <strong>${escapeHtml(report.gradingSystem.retakePolicy)}</strong>. Scale: <strong>${escapeHtml(report.gradingSystem.label)}</strong>.</p>
        </div>
        ${courseTable(report)}
      </section>
      <section class="report-section">
        <div class="report-section__head"><div><span>02</span><h3>Degree audit</h3></div><a href="${routeHref("degree-audit")}">Edit audit</a></div>
        ${auditSection(report)}
      </section>
      <section class="report-section">
        <div class="report-section__head"><div><span>03</span><h3>Graduation plan</h3></div><a href="${routeHref("planning")}">Edit plan</a></div>
        <p class="result-note result-note--muted">Default report assumption: maximum 18 credits per semester and no summer terms.</p>
        ${planSection(report)}
      </section>
      <section class="report-section">
        <div class="report-section__head"><div><span>04</span><h3>Evidence and limitations</h3></div><a href="${routeHref("editorial-policy")}">Source policy</a></div>
        <ul class="trust-list">
          <li>The report contains approved academic data, not the original transcript file or raw OCR text.</li>
          <li>University and programme policies must be confirmed against the current official source.</li>
          <li>Unknown grades, missing credits, and blocked prerequisites remain visible rather than being guessed.</li>
          <li>${escapeHtml(report.disclaimer)}</li>
        </ul>
      </section>
      <section class="tool-card tool-card--wide report-actions-panel">
        <div>
          <h3>Export this report</h3>
          <p>Files are created locally in your browser. “PDF” opens the print dialog so you can save a tagged, printable copy.</p>
        </div>
        <div class="row-actions report-export-actions">
          <button class="btn btn--primary" type="button" id="reportPrint">Print / Save PDF</button>
          <button class="btn btn--ghost" type="button" id="reportCsv">Excel / CSV</button>
          <button class="btn btn--ghost" type="button" id="reportJson">JSON</button>
          <button class="btn btn--ghost" type="button" id="reportHtml">HTML</button>
          <button class="btn btn--ghost" type="button" id="reportIcs">ICS plan</button>
        </div>
      </section>
      <section class="tool-card tool-card--wide report-share-panel">
        <div>
          <h3>Create a private read-only link · Pro</h3>
          <p>The original transcript is never shared. An active subscription is required, and every link can be revoked later.</p>
        </div>
        <div class="report-share-grid">
          <label class="field"><span>Visible sections</span><select id="reportShareScope"><option value="results">Results only</option><option value="plan">Degree audit and plan</option><option value="full">Full reviewed report</option></select></label>
          <label class="field"><span>Expires after</span><select id="reportShareExpiry"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
          <label class="field"><span>Optional password</span><input id="reportSharePassword" type="password" minlength="6" maxlength="72" autocomplete="new-password" placeholder="At least 6 characters"></label>
        </div>
        <div class="row-actions"><button class="btn btn--primary" type="button" id="reportCreateShare">Create link</button><a class="btn btn--text" href="${routeHref("account")}">Account</a></div>
        <div id="reportShareStatus" class="setup-status" aria-live="polite"></div>
        <div id="reportShareList"></div>
      </section>
    </article>`;

  wireExports(container, report);
  await wireSharing(container, report);
}

function wireExports(container, report) {
  container.querySelector("#reportPrint").addEventListener("click", () => window.print());
  container.querySelector("#reportJson").addEventListener("click", () => download("instantgpa-academic-report.json", JSON.stringify(report, null, 2), "application/json"));
  container.querySelector("#reportCsv").addEventListener("click", () => {
    const header = ["Term", "Code", "Course", "Credits", "Grade", "Grade points", "Quality points", "Included in GPA", "Issue"];
    const rows = report.courses.map((course) => [
      course.term, course.code, course.name, course.credits ?? "", course.grade,
      course.gradePoints ?? "", course.qualityPoints ?? "", course.includedInGpa ? "Yes" : "No", course.issue,
    ]);
    download("instantgpa-academic-report.csv", [header, ...rows].map((row) => row.map(csv).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  });
  container.querySelector("#reportHtml").addEventListener("click", () => {
    const clone = container.querySelector("#academicReport").cloneNode(true);
    clone.querySelectorAll(".report-actions-panel,.report-share-panel,button").forEach((node) => node.remove());
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>InstantGPA Academic Journey Report</title><style>body{font:15px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:0 24px;color:#102a2a}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #ccd}section{margin:28px 0}small{display:block}</style></head><body>${clone.outerHTML}</body></html>`;
    download("instantgpa-academic-report.html", html, "text/html;charset=utf-8");
  });
  container.querySelector("#reportIcs").addEventListener("click", () => {
    const tasks = report.graduationPlan.terms.flatMap((term) => term.courses.map((course, index) => [
      "BEGIN:VTODO",
      `UID:${crypto.randomUUID()}@instantgpa.com`,
      `DTSTAMP:${icsDate(new Date())}`,
      `SUMMARY:${icsText(`${term.name}: ${course.code || course.name}`)}`,
      `DESCRIPTION:${icsText(`${course.name || course.code} · ${course.credits} credits · proposed plan only`)}`,
      `PRIORITY:${Math.min(9, index + 1)}`,
      "END:VTODO",
    ].join("\r\n")));
    download("instantgpa-graduation-plan.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InstantGPA//Academic Journey Report//EN", ...tasks, "END:VCALENDAR"].join("\r\n"), "text/calendar;charset=utf-8");
  });
}

async function wireSharing(container, report) {
  const createButton = container.querySelector("#reportCreateShare");
  const status = container.querySelector("#reportShareStatus");
  const list = container.querySelector("#reportShareList");

  async function refreshList() {
    const result = await CloudSync.listReportShares();
    if (!result.ok) {
      list.innerHTML = result.reason === "signed_out"
        ? '<p class="result-note result-note--muted">Sign in to create and revoke report links.</p>'
        : "";
      return;
    }
    list.innerHTML = result.data.shares.length ? `<div class="share-list"><h4>Active and recent links</h4>${result.data.shares.map((share) => `<p><span><strong>${escapeHtml(share.title)}</strong><small>${escapeHtml(share.scope)} · expires ${new Date(share.expiresAt).toLocaleString()} · ${share.viewCount} views${share.revokedAt ? " · revoked" : ""}</small></span>${share.revokedAt ? "" : `<button class="btn btn--text" type="button" data-revoke-share="${share.id}">Revoke</button>`}</p>`).join("")}</div>` : "";
    list.querySelectorAll("[data-revoke-share]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      const revoke = await CloudSync.revokeReportShare(button.dataset.revokeShare);
      status.innerHTML = revoke.ok
        ? '<p class="setup-status__text">The link was revoked.</p>'
        : `<p class="setup-status__text setup-status__text--warn">${escapeHtml(revoke.error || "The link could not be revoked.")}</p>`;
      await refreshList();
    }));
  }

  createButton.addEventListener("click", async () => {
    const scope = container.querySelector("#reportShareScope").value;
    const expiresInDays = Number(container.querySelector("#reportShareExpiry").value);
    const password = container.querySelector("#reportSharePassword").value;
    if (password && password.length < 6) {
      status.innerHTML = '<p class="setup-status__text setup-status__text--warn">Use at least 6 password characters or leave it empty.</p>';
      return;
    }
    createButton.disabled = true;
    status.innerHTML = '<p class="setup-status__text">Creating protected link…</p>';
    const result = await CloudSync.createReportShare({
      title: `${report.profile.university || "Academic"} report`,
      scope,
      expiresInDays,
      password,
      payload: sharePayload(report, scope),
    });
    createButton.disabled = false;
    if (!result.ok) {
      const message = result.reason === "signed_out" ? "Sign in before creating a link." : result.error || "The link could not be created.";
      status.innerHTML = `<p class="setup-status__text setup-status__text--warn">${escapeHtml(message)}</p>`;
      return;
    }
    status.innerHTML = `<div class="share-created"><p class="setup-status__text">Read-only link created${result.data.passwordProtected ? " with password protection" : ""}.</p><label class="field"><span>Copy this link now</span><div class="copy-link-row"><input id="createdShareUrl" readonly value="${escapeHtml(result.data.url)}"><button class="btn btn--ghost" type="button" id="copyShareUrl">Copy</button></div></label></div>`;
    status.querySelector("#copyShareUrl").addEventListener("click", async () => {
      await navigator.clipboard.writeText(result.data.url);
      status.querySelector("#copyShareUrl").textContent = "Copied";
    });
    await refreshList();
  });

  await refreshList();
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
