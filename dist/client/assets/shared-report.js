const token = () => new URLSearchParams(location.hash.replace(/^#/, "")).get("token") || "";

export function mount(container) {
  const shareToken = token();
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(shareToken)) {
    container.innerHTML = unavailable("This report link is invalid.");
    return;
  }
  openReport(container, shareToken, "");
}

async function openReport(container, shareToken, password) {
  container.innerHTML = '<section class="tool-card tool-card--wide" aria-busy="true"><p>Opening protected report…</p></section>';
  try {
    const response = await fetch(`/api/report-shares/${encodeURIComponent(shareToken)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-instantgpa-request": "shared-report" },
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && ["PASSWORD_REQUIRED", "PASSWORD_INCORRECT"].includes(data.code)) {
      renderPassword(container, shareToken, data.error);
      return;
    }
    if (!response.ok || !data.report) {
      container.innerHTML = unavailable(data.error || "This report link is unavailable.");
      return;
    }
    renderReport(container, data);
  } catch {
    container.innerHTML = unavailable("The report could not be opened. Check your connection and try again.");
  }
}

function renderPassword(container, shareToken, message) {
  container.innerHTML = `
    <section class="tool-card shared-report-password">
      <span class="section-kicker">Protected academic report</span>
      <h2>Enter the report password</h2>
      <p class="tool-sub">${escapeHtml(message || "This report is password protected.")}</p>
      <label class="field"><span>Password</span><input id="sharedPassword" type="password" maxlength="72" autocomplete="current-password"></label>
      <div class="row-actions"><button class="btn btn--primary" type="button" id="openSharedReport">Open report</button></div>
      <div id="sharedPasswordStatus" class="setup-status" aria-live="polite"></div>
    </section>`;
  const input = container.querySelector("#sharedPassword");
  const submit = () => {
    if (!input.value) {
      container.querySelector("#sharedPasswordStatus").innerHTML = '<p class="setup-status__text setup-status__text--warn">Enter the password.</p>';
      return;
    }
    openReport(container, shareToken, input.value);
  };
  container.querySelector("#openSharedReport").addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submit();
  });
  input.focus();
}

function renderReport(container, data) {
  const report = data.report;
  container.innerHTML = `
    <article class="academic-report shared-academic-report">
      <header class="report-header">
        <div>
          <span class="section-kicker">Read-only Academic Journey Report</span>
          <h2>${escapeHtml(data.title || report.reportType || "Academic report")}</h2>
          <p>${escapeHtml([report.profile?.university, report.profile?.country, report.profile?.college].filter(Boolean).join(" · ") || "Shared academic planning result")}</p>
        </div>
        <div class="report-version"><span>Method</span><strong>${escapeHtml(report.methodVersion || "—")}</strong><small>Expires ${new Date(data.expiresAt).toLocaleString()}</small></div>
      </header>
      <p class="report-assurance"><a href="/privacy.html" data-i18n="footer.privacy">Privacy Policy</a></p>
      ${report.summary ? renderSummary(report) : ""}
      ${report.courses ? `<section class="report-section"><div class="report-section__head"><div><span>01</span><h3>Reviewed courses and calculations</h3></div></div>${renderCourses(report.courses)}</section>` : ""}
      ${report.degreeAudit ? `<section class="report-section"><div class="report-section__head"><div><span>02</span><h3>Degree audit</h3></div></div>${renderAudit(report.degreeAudit)}</section>` : ""}
      ${report.graduationPlan ? `<section class="report-section"><div class="report-section__head"><div><span>03</span><h3>Graduation plan</h3></div></div>${renderPlan(report.graduationPlan)}</section>` : ""}
      ${report.academicTwin ? `<section class="report-section"><div class="report-section__head"><div><span>PRO</span><h3>Academic Twin scenarios</h3></div></div>${renderAcademicTwin(report.academicTwin)}</section>` : ""}
      ${report.syllabusTargets?.length ? `<section class="report-section"><div class="report-section__head"><div><span>PRO</span><h3>Syllabus targets</h3></div></div>${renderSyllabusTargets(report.syllabusTargets)}</section>` : ""}
      ${report.transferReview ? `<section class="report-section"><div class="report-section__head"><div><span>PRO</span><h3>Transfer comparison</h3></div></div>${renderTransfer(report.transferReview)}</section>` : ""}
      ${report.integrityReview ? `<section class="report-section"><div class="report-section__head"><div><span>PRO</span><h3>Document consistency review</h3></div></div>${renderIntegrity(report.integrityReview)}</section>` : ""}
      <section class="report-section">
        <div class="report-section__head"><div><span>04</span><h3>Evidence and responsibility</h3></div></div>
        <p>${escapeHtml(report.disclaimer || "Planning report only. The institution remains authoritative.")}</p>
        <p>Methodology: <a href="https://instantgpa.com/trust">instantgpa.com/trust</a></p>
      </section>
      <div class="row-actions report-shared-actions"><button class="btn btn--primary" id="printSharedReport" type="button">Print / Save PDF</button></div>
    </article>`;
  container.querySelector("#printSharedReport").addEventListener("click", () => window.print());
}

function renderSummary(report) {
  return `<section class="report-summary">
    <div><span>Current GPA</span><strong>${number(report.summary.gpa)}</strong><small>of ${report.summary.maximumGpa}</small></div>
    <div><span>GPA credits</span><strong>${report.summary.gpaCredits ?? "—"}</strong><small>${report.summary.gradedCourses ?? 0} counted courses</small></div>
    <div><span>Earned credits</span><strong>${report.summary.earnedCredits ?? "—"}</strong><small>${report.summary.inProgressCourses ?? 0} in progress</small></div>
    <div><span>Semesters</span><strong>${report.summary.semesterCount ?? "—"}</strong><small>${report.summary.plannedCourses ?? 0} planned courses</small></div>
  </section>`;
}

function renderCourses(courses) {
  return `<div class="record-table-wrap"><table class="intl-table table--wide"><thead><tr><th>Term</th><th>Course</th><th>Credits</th><th>Grade</th><th>Included</th><th>Quality points</th></tr></thead><tbody>
    ${courses.map((course) => `<tr><td>${escapeHtml(course.term)}</td><td>${escapeHtml([course.code, course.name].filter(Boolean).join(" — "))}</td><td>${course.credits ?? "Needs review"}</td><td>${escapeHtml(course.grade || course.outcome || "—")}</td><td>${course.includedInGpa ? "Yes" : "No"}</td><td>${course.includedInGpa ? number(course.qualityPoints, 2) : "—"}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function renderAudit(audit) {
  return `<div class="report-inline-stats"><span><strong>${audit.overallPct == null ? "Unknown" : `${audit.overallPct}%`}</strong> progress</span><span><strong>${audit.totalCompleted}</strong> completed</span><span><strong>${audit.totalRequired}</strong> required</span></div>
  <div class="record-table-wrap"><table class="intl-table table--standard"><thead><tr><th>Requirement</th><th>Completed</th><th>Required</th><th>Remaining</th></tr></thead><tbody>${audit.groups.map((group) => `<tr><td>${escapeHtml(group.name)}</td><td>${group.creditsCompleted}</td><td>${group.creditsRequired}</td><td>${group.remaining == null ? "Unknown" : group.remaining}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderPlan(plan) {
  if (!plan.terms?.length) return '<p class="result-note result-note--muted">No schedulable planned courses were included.</p>';
  return plan.terms.map((term) => `<details open class="report-term"><summary><strong>${escapeHtml(term.name)}</strong><span>${term.credits} credits</span></summary><ul>${term.courses.map((course) => `<li><span>${escapeHtml([course.code, course.name].filter(Boolean).join(" — "))}</span><strong>${course.credits} credits</strong></li>`).join("")}</ul></details>`).join("");
}

function renderAcademicTwin(twin) {
  return `<p class="result-note"><strong>${twin.achievable ? "Target is mathematically reachable." : "Target exceeds the configured GPA ceiling."}</strong> Required average across remaining credits: ${number(twin.requiredAverage)}.</p>
    <div class="pro-scenario-grid">${(twin.scenarios || []).map((scenario) => `<article class="pro-scenario pro-scenario--${escapeHtml(scenario.id)}">
      <span>${escapeHtml(scenario.label)}</span><strong>${scenario.achievable ? `${number(scenario.requiredAverage, 2)} GPA avg` : "Not achievable"}</strong>
      <dl><div><dt>Terms</dt><dd>${scenario.terms}</dd></div><div><dt>Credits / term</dt><dd>${scenario.creditsPerTerm}</dd></div><div><dt>Study / week</dt><dd>${scenario.weeklyStudyHours} h</dd></div><div><dt>Risk</dt><dd>${escapeHtml(scenario.risk)}</dd></div></dl>
    </article>`).join("")}</div>`;
}

function renderSyllabusTargets(syllabi) {
  return syllabi.map((syllabus) => `<details open class="report-term"><summary><strong>${escapeHtml(syllabus.courseName)}</strong><span>Target ${syllabus.targetScore}%</span></summary>
    <ul>${(syllabus.assessments || []).map((assessment) => `<li><span>${escapeHtml(assessment.label)}${assessment.dueDate ? ` · ${escapeHtml(assessment.dueDate)}` : ""}</span><strong>${assessment.weight ?? "—"}% · score ${assessment.score ?? "pending"}</strong></li>`).join("")}</ul>
  </details>`).join("");
}

function renderTransfer(transfer) {
  return `<p class="result-note result-note--muted">${escapeHtml(transfer.disclaimer || "Only the receiving institution can award transfer credit.")}</p>
    <div class="record-table-wrap"><table class="intl-table table--wide"><thead><tr><th>Source</th><th>Best target</th><th>Confidence</th><th>Decision</th></tr></thead><tbody>
    ${(transfer.matches || []).map((row) => `<tr><td>${escapeHtml([row.source?.code, row.source?.name].filter(Boolean).join(" — "))}</td><td>${row.target ? escapeHtml([row.target.code, row.target.name].filter(Boolean).join(" — ")) : "No match"}</td><td>${row.confidence ?? 0}%</td><td>${escapeHtml(String(row.decision || "").replaceAll("_", " "))}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function renderIntegrity(integrity) {
  return `<p class="result-note"><strong>Review readiness: ${integrity.score ?? "—"}/100.</strong> ${escapeHtml(integrity.statement || "This is not an authenticity or fraud verdict.")}</p>
    <ul>${(integrity.issues || []).map((issue) => `<li><strong>${escapeHtml(issue.label)}:</strong> ${escapeHtml(issue.detail)}</li>`).join("") || "<li>No listed consistency check was triggered.</li>"}</ul>`;
}

function unavailable(message) {
  return `<section class="tool-card shared-report-password"><span class="section-kicker">Shared academic report</span><h2>Report unavailable</h2><p class="result-note result-note--warn">${escapeHtml(message)}</p><a class="btn btn--ghost" href="/">Go to InstantGPA</a></section>`;
}

function number(value, digits = 3) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
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
