import { CloudSync } from "./cloud-sync.js";
import { extractAcademicDocument } from "./document-reader.js";

const state = { data: null, activeTab: "overview", query: "", universityQuery: "", catalogStatus: "pending_review" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(document.documentElement.lang || "en", { dateStyle: "medium" }).format(date);
}

function badge(value) {
  const safe = String(value || "none").toLowerCase();
  return `<span class="admin-badge admin-badge--${esc(safe.replace(/[^a-z]/g, ""))}">${esc(value || "None")}</span>`;
}

export async function mount(container) {
  container.innerHTML = '<div class="admin-loading" aria-busy="true">Opening your owner dashboard…</div>';
  const [result, analytics, catalogs] = await Promise.all([
    CloudSync.getAdminOverview(),
    CloudSync.getProductAnalytics(),
    CloudSync.getAdminCatalogs(),
  ]);
  if (!result.ok) {
    container.innerHTML = `
      <section class="admin-access-card">
        <span class="admin-access-lock">◆</span>
        <h2>Owner access required</h2>
        <p>${esc(typeof result.error === "string" ? result.error : "Sign in with the verified owner account to manage InstantGPA.")}</p>
        <a class="btn btn--primary" href="/account">Go to account</a>
      </section>`;
    return;
  }
  state.data = { ...result.data, analytics: analytics.ok ? analytics.data : null, catalogs: catalogs.ok ? catalogs.data : { sources: [] } };
  render(container);
}

function render(container) {
  const data = state.data;
  container.innerHTML = `
    <section class="admin-shell">
      <header class="admin-hero">
        <div>
          <span class="admin-kicker">INSTANTGPA CONTROL CENTER</span>
          <h2>${esc(data.owner.name)} <em>· Owner</em></h2>
          <p>Manage accounts, verified PayPal access, university profiles, site controls, and accountability from one private workspace.</p>
        </div>
        <div class="admin-owner-card">
          <span>${esc(data.owner.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2))}</span>
          <div><strong>Verified owner</strong><small>${esc(data.owner.email)}</small></div>
        </div>
      </header>
      <nav class="admin-tabs" aria-label="Owner dashboard sections">
        ${tabButton("overview", "Overview")}
        ${tabButton("users", "Users")}
        ${tabButton("universities", "Universities")}
        ${tabButton("catalogs", "Catalog review")}
        ${tabButton("analytics", "Funnel & errors")}
        ${tabButton("settings", "Site controls")}
        ${tabButton("audit", "Audit log")}
      </nav>
      <div id="adminContent">${sectionHtml()}</div>
    </section>`;

  container.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.adminTab;
      render(container);
    });
  });
  wireSection(container);
}

function tabButton(id, label) {
  return `<button type="button" data-admin-tab="${id}" class="${state.activeTab === id ? "is-active" : ""}" ${state.activeTab === id ? 'aria-current="page"' : ""}>${label}</button>`;
}

function sectionHtml() {
  if (state.activeTab === "users") return usersHtml();
  if (state.activeTab === "universities") return universitiesHtml();
  if (state.activeTab === "catalogs") return catalogsHtml();
  if (state.activeTab === "analytics") return analyticsHtml();
  if (state.activeTab === "settings") return settingsHtml();
  if (state.activeTab === "audit") return auditHtml();
  return overviewHtml();
}

function analyticsHtml() {
  const analytics = state.data.analytics;
  if (!analytics) return `<section class="admin-section">${empty("Product analytics are not available yet.")}</section>`;
  const yes = Number(analytics.feedback?.yes || 0);
  const no = Number(analytics.feedback?.no || 0);
  const totalFeedback = yes + no;
  return `
    <section class="admin-section">
      <div class="admin-section-head"><div><span>LAST ${analytics.periodDays} DAYS</span><h3>Journey funnel and operational errors</h3><p>Session counts are pseudonymous. Academic values, course names, transcript text, and email addresses are never collected here.</p></div></div>
      <div class="admin-metrics">
        ${metric("Positive feedback", yes, totalFeedback ? `${Math.round((yes / totalFeedback) * 100)}% of responses` : "No responses yet")}
        ${metric("Needs correction", no, "Open the affected result before changing rules")}
        ${metric("Error groups", analytics.errors?.length || 0, "Grouped by sanitized fingerprint")}
        ${metric("Active days", analytics.daily?.length || 0, "Days with consented activity")}
      </div>
      <article class="admin-card">
        <div class="admin-card__head"><div><span>FUNNEL</span><h3>Where students continue or leave</h3></div></div>
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Step</th><th>Sessions</th><th>From previous</th><th>Drop-off</th></tr></thead><tbody>
          ${(analytics.funnel || []).map((step) => `<tr><td><strong>${esc(step.label)}</strong></td><td>${step.sessions}</td><td>${step.conversionFromPrevious == null ? "—" : `${step.conversionFromPrevious}%`}</td><td>${step.dropOffFromPrevious || 0}</td></tr>`).join("")}
        </tbody></table></div>
      </article>
      <article class="admin-card">
        <div class="admin-card__head"><div><span>ERROR MONITORING</span><h3>Most frequent browser failures</h3></div></div>
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Category</th><th>Path</th><th>Sanitized message</th><th>Count</th><th>Last seen</th></tr></thead><tbody>
          ${(analytics.errors || []).map((entry) => `<tr><td>${badge(entry.category)}</td><td>${esc(entry.path)}</td><td>${esc(entry.message)}</td><td>${entry.occurrences}</td><td>${dateLabel(entry.lastSeenAt)}</td></tr>`).join("") || `<tr><td colspan="5">${empty("No browser errors recorded in this period.")}</td></tr>`}
        </tbody></table></div>
      </article>
    </section>`;
}

function overviewHtml() {
  const m = state.data.metrics || {};
  const recent = state.data.users.slice(0, 5);
  return `
    <section class="admin-section">
      <div class="admin-metrics">
        ${metric("Registered users", m.totalUsers || 0, "Known accounts")}
        ${metric("Active · 30 days", m.active30d || 0, "Recently seen")}
        ${metric("Active plans", m.activePlans || 0, "Paid subscriptions only")}
        ${metric("University profiles", m.universities || 0, `${m.academicProfiles || 0} student profiles`)}
      </div>
      <div class="admin-overview-grid">
        <article class="admin-card">
          <div class="admin-card__head"><div><span>RECENT ACCOUNTS</span><h3>Latest users</h3></div><button type="button" data-jump="users">View all</button></div>
          <div class="admin-compact-list">
            ${recent.length ? recent.map((user) => `<div><span class="admin-user-dot">${esc((user.displayName || user.email)[0].toUpperCase())}</span><p><strong>${esc(user.displayName || user.email)}</strong><small>${esc(user.email)}</small></p>${badge(user.planStatus || "Free")}</div>`).join("") : empty("No user has signed in yet.")}
          </div>
        </article>
        <article class="admin-card">
          <div class="admin-card__head"><div><span>PAYMENT AUTHORITY</span><h3>PayPal-controlled access</h3></div><button type="button" data-jump="users">Review subscribers</button></div>
          <p class="admin-card__copy">Premium access is granted only to an active PayPal subscription or the single verified Owner identity.</p>
        </article>
      </div>
    </section>`;
}

function universitiesHtml() {
  const query = state.universityQuery.toLowerCase();
  const universities = (state.data.universityProfiles || []).filter((university) => (
    !query || `${university.universityName} ${university.countryName} ${university.countryCode}`.toLowerCase().includes(query)
  ));
  const units = state.data.academicUnits || [];
  return `
    <section class="admin-section">
      <div class="admin-section-head">
        <div><span>ACADEMIC DIRECTORY GROWTH</span><h3>University profiles</h3><p>Each contributor counts once. Directory matches are separated from user-submitted entries that still need source verification.</p></div>
        <label class="admin-search"><span>⌕</span><input id="adminUniversitySearch" type="search" value="${esc(state.universityQuery)}" placeholder="Search university or country"></label>
      </div>
      <div class="admin-university-grid">
        ${universities.map((university) => {
          const universityUnits = units.filter((unit) => unit.universityProfileId === university.id);
          return `<details class="admin-card admin-university-card">
            <summary>
              <div><span>${esc(university.countryCode)} · ${esc(university.countryName)}</span><strong>${esc(university.universityName)}</strong></div>
              <div class="admin-university-counts"><b>${university.contributorCount}</b><small>profiles</small>${badge(university.sourceStatus)}</div>
            </summary>
            <div class="admin-university-metrics">
              ${metric("Contributors", university.contributorCount, "Deduplicated")}
              ${metric("Colleges", university.collegeCount, "Collected")}
              ${metric("Departments", university.departmentCount, "Collected")}
            </div>
            <div class="admin-table-wrap">
              <table class="admin-table"><thead><tr><th>College</th><th>Department</th><th>Profiles</th><th>Quality</th><th>Last seen</th></tr></thead>
              <tbody>${universityUnits.map((unit) => `<tr><td><strong>${esc(unit.collegeName)}</strong></td><td>${esc(unit.departmentName)}</td><td>${unit.contributorCount}</td><td>${badge(unit.qualityStatus)}</td><td>${dateLabel(unit.lastContributedAt)}</td></tr>`).join("") || `<tr><td colspan="5">${empty("No academic units collected yet.")}</td></tr>`}</tbody></table>
            </div>
          </details>`;
        }).join("") || empty("No university profile matches this search.")}
      </div>
    </section>`;
}

function catalogsHtml() {
  const sources = state.data.catalogs?.sources || [];
  return `
    <section class="admin-section">
      <div class="admin-section-head"><div><span>OFFICIAL-SOURCE PIPELINE</span><h3>Catalog import and approval</h3><p>Fetch an official HTML catalog or read a PDF/image locally with preserved page numbers. Nothing becomes authoritative until you approve it.</p></div>
        <label class="admin-search"><span>Status</span><select id="adminCatalogStatus"><option value="pending_review" ${state.catalogStatus === "pending_review" ? "selected" : ""}>Pending review</option><option value="approved" ${state.catalogStatus === "approved" ? "selected" : ""}>Approved</option><option value="rejected" ${state.catalogStatus === "rejected" ? "selected" : ""}>Rejected</option></select></label>
      </div>
      <article class="admin-card admin-settings-card">
        <div><span class="admin-kicker">ADD SOURCE</span><h3>Import an official catalog or regulation</h3><p>Choose an official PDF, image, or text file to extract on this device, or paste page-separated text. The original file is not stored.</p></div>
        <form id="adminCatalogForm" class="admin-form">
          <div class="field-grid"><label><span>Country code</span><input name="countryCode" maxlength="3" placeholder="EG"></label><label><span>Catalog year</span><input name="catalogYear" required maxlength="30" placeholder="2026–2027"></label></div>
          <label><span>University</span><input name="institution" required maxlength="180"></label>
          <div class="field-grid"><label><span>College</span><input name="college" maxlength="180"></label><label><span>Department / programme</span><input name="department" maxlength="180"></label></div>
          <label><span>Official source URL</span><input name="sourceUrl" required type="url" inputmode="url" placeholder="https://university.edu/catalog"></label>
          <label><span>Source title</span><input name="sourceTitle" maxlength="180" placeholder="Undergraduate catalog"></label>
          <label><span>Official document (optional)</span><input name="catalogFile" type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,image/*"><small>PDF text layers preserve page numbers; scanned pages use local English/Arabic OCR.</small></label>
          <label><span>Extracted page text (optional for HTML/file)</span><textarea name="pageText" rows="7" maxlength="1000000" placeholder="Separate pages with ---PAGE---"></textarea></label>
          <button class="btn btn--primary" type="submit">Import into review queue</button><div id="adminCatalogImportStatus" aria-live="polite"></div>
        </form>
      </article>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Institution</th><th>Year</th><th>Source</th><th>Facts</th><th>Status</th><th>Review</th></tr></thead><tbody>
        ${sources.map((source) => `<tr><td><strong>${esc(source.institution)}</strong><small>${esc([source.college, source.department, source.program].filter(Boolean).join(" · "))}</small></td><td>${esc(source.catalogYear)}</td><td><a href="${esc(source.sourceUrl)}" target="_blank" rel="noopener">${esc(source.sourceTitle)}</a><small>${source.pageCount} page(s)</small></td><td>${source.factCount}</td><td>${badge(source.status)}</td><td>${source.status === "pending_review" ? `<button type="button" class="admin-inline-action" data-catalog-review="approved" data-source-id="${esc(source.id)}">Approve</button> <button type="button" class="admin-inline-action" data-catalog-review="rejected" data-source-id="${esc(source.id)}">Reject</button>` : `<small>${esc(source.reviewedBy || "—")}<br>${dateLabel(source.reviewedAt)}</small>`}</td></tr>`).join("") || `<tr><td colspan="6">${empty("No sources in this queue.")}</td></tr>`}
      </tbody></table></div>
    </section>`;
}

function metric(label, value, note) {
  return `<article><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}

function empty(message) {
  return `<p class="admin-empty">${esc(message)}</p>`;
}

function usersHtml() {
  const users = state.data.users.filter((user) => {
    const query = state.query.toLowerCase();
    return !query || `${user.email} ${user.displayName || ""} ${user.plan || ""}`.toLowerCase().includes(query);
  });
  return `
    <section class="admin-section">
      <div class="admin-section-head">
        <div><span>ACCOUNT DIRECTORY</span><h3>Users & access</h3><p>Accounts appear after Firebase sign-in. Premium becomes active only after payment is confirmed.</p></div>
        <label class="admin-search"><span>⌕</span><input id="adminUserSearch" type="search" value="${esc(state.query)}" placeholder="Search name, email, or plan"></label>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>User</th><th>Account</th><th>Plan</th><th>Ends</th><th>Last seen</th><th>Action</th></tr></thead>
          <tbody>${users.map((user) => `<tr>
            <td><strong>${esc(user.displayName || "—")}</strong><small>${esc(user.email)}</small></td>
            <td>${badge(user.status)}</td>
            <td><strong>${esc(user.plan || "Free")}</strong><small>${esc(user.source || "Core tools")}</small></td>
            <td>${dateLabel(user.endsAt)}</td>
            <td>${dateLabel(user.lastSeenAt)}</td>
            <td>${user.email === state.data.owner.email ? '<span class="admin-protected">Owner</span>' : `<button type="button" class="admin-inline-action" data-user-status="${user.status === "blocked" ? "active" : "blocked"}" data-user-id="${esc(user.id)}">${user.status === "blocked" ? "Unblock" : "Block"}</button>`}</td>
          </tr>`).join("") || `<tr><td colspan="6">${empty("No users match your search.")}</td></tr>`}</tbody>
        </table>
      </div>
    </section>`;
}

function settingsHtml() {
  const s = state.data.settings || {};
  return `
    <section class="admin-section">
      <article class="admin-card admin-settings-card">
        <div><span class="admin-kicker">SITE CONTROLS</span><h3>Operational settings</h3><p>These settings are recorded with your name and time in the audit log.</p></div>
        <form id="adminSettingsForm" class="admin-form">
          <div class="admin-switch-row"><div><strong>Premium checkout accounts</strong><small>Allow a visitor to create a Firebase identity only while starting paid PayPal checkout.</small></div><select name="registration"><option value="open" ${s.registration !== "closed" ? "selected" : ""}>Open</option><option value="closed" ${s.registration === "closed" ? "selected" : ""}>Closed</option></select></div>
          <div class="admin-switch-row"><div><strong>Trust stats in footer</strong><small>Show a small "X students" line site-wide. Keep hidden until the number is big enough to be convincing.</small></div><select name="trustStatsVisible"><option value="hidden" ${s.trustStatsVisible !== "visible" ? "selected" : ""}>Hidden</option><option value="visible" ${s.trustStatsVisible === "visible" ? "selected" : ""}>Visible</option></select></div>
          <label><span>Support email</span><input name="supportEmail" type="email" value="${esc(s.supportEmail || state.data.owner.email)}"></label>
          <label><span>Maintenance message</span><textarea name="maintenanceMessage" rows="3" maxlength="500">${esc(s.maintenanceMessage || "")}</textarea></label>
          <button class="btn btn--primary" type="submit">Save site controls</button>
          <div id="adminSettingsStatus" aria-live="polite"></div>
        </form>
      </article>
    </section>`;
}

function auditHtml() {
  return `
    <section class="admin-section">
      <div class="admin-section-head"><div><span>ACCOUNTABILITY</span><h3>Owner activity</h3><p>Every change to users and site controls is recorded here.</p></div></div>
      <div class="admin-audit-list">
        ${state.data.audit.map((entry) => `<article><span class="admin-audit-mark"></span><div><strong>${esc(entry.action.replaceAll(".", " · "))}</strong><p>${esc(entry.targetType)}${entry.targetId ? ` · ${esc(entry.targetId)}` : ""}</p><small>${esc(entry.actorEmail)} · ${dateLabel(entry.createdAt)}</small></div></article>`).join("") || empty("No management changes recorded yet.")}
      </div>
    </section>`;
}

function wireSection(container) {
  container.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => {
    state.activeTab = button.dataset.jump;
    render(container);
  }));
  container.querySelector("#adminUserSearch")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    container.querySelector("#adminContent").innerHTML = usersHtml();
    wireSection(container);
  });
  container.querySelector("#adminUniversitySearch")?.addEventListener("input", (event) => {
    state.universityQuery = event.target.value;
    container.querySelector("#adminContent").innerHTML = universitiesHtml();
    wireSection(container);
  });
  container.querySelector("#adminCatalogStatus")?.addEventListener("change", async (event) => {
    state.catalogStatus = event.target.value;
    const result = await CloudSync.getAdminCatalogs(state.catalogStatus);
    if (result.ok) state.data.catalogs = result.data;
    container.querySelector("#adminContent").innerHTML = catalogsHtml();
    wireSection(container);
  });
  container.querySelector("#adminCatalogForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = container.querySelector("#adminCatalogImportStatus");
    const formData = new FormData(form);
    const values = Object.fromEntries(formData);
    const file = formData.get("catalogFile");
    delete values.catalogFile;
    const pageText = String(values.pageText || "").trim();
    let pages = pageText ? pageText.split(/^---PAGE---$/m).map((text, index) => ({ page: index + 1, text })) : undefined;
    status.innerHTML = '<p class="admin-action-status">Importing and extracting facts…</p>';
    if (file instanceof File && file.size) {
      try {
        const extracted = await extractAcademicDocument(file, (message) => {
          status.innerHTML = `<p class="admin-action-status">${esc(message)}</p>`;
        });
        const matches = [...extracted.text.matchAll(/\[\[PAGE\s+(\d+)\]\]\s*([\s\S]*?)(?=\[\[PAGE\s+\d+\]\]|$)/gi)];
        pages = matches.length
          ? matches.map((match) => ({ page: Number(match[1]), text: match[2].trim() }))
          : [{ page: 1, text: extracted.text }];
      } catch (error) {
        status.innerHTML = `<p class="admin-action-status is-error">${esc(error?.message || "The official document could not be read.")}</p>`;
        return;
      }
    }
    const result = await CloudSync.importOfficialCatalog({ ...values, pages });
    if (!result.ok) {
      status.innerHTML = `<p class="admin-action-status is-error">${esc(typeof result.error === "string" ? result.error : "Catalog import failed.")}</p>`;
      return;
    }
    form.reset();
    state.catalogStatus = "pending_review";
    const refreshed = await CloudSync.getAdminCatalogs(state.catalogStatus);
    if (refreshed.ok) state.data.catalogs = refreshed.data;
    container.querySelector("#adminContent").innerHTML = catalogsHtml();
    wireSection(container);
  });
  container.querySelectorAll("[data-catalog-review]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    const result = await CloudSync.reviewOfficialCatalog(button.dataset.sourceId, button.dataset.catalogReview);
    if (!result.ok) { window.alert(typeof result.error === "string" ? result.error : "Review was not saved."); button.disabled = false; return; }
    const refreshed = await CloudSync.getAdminCatalogs(state.catalogStatus);
    if (refreshed.ok) state.data.catalogs = refreshed.data;
    container.querySelector("#adminContent").innerHTML = catalogsHtml();
    wireSection(container);
  }));
  container.querySelectorAll("[data-user-status]").forEach((button) => button.addEventListener("click", () =>
    runAction(container, { action: "set_user_status", userId: button.dataset.userId, status: button.dataset.userStatus })));
  container.querySelector("#adminSettingsForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const settings = Object.fromEntries(new FormData(event.currentTarget));
    runAction(container, { action: "save_settings", settings }, "#adminSettingsStatus");
  });
}

async function runAction(container, payload, statusSelector = "") {
  const status = statusSelector ? container.querySelector(statusSelector) : null;
  if (status) status.innerHTML = '<p class="admin-action-status">Saving…</p>';
  container.querySelectorAll("button, input, select, textarea").forEach((el) => { el.disabled = true; });
  const result = await CloudSync.adminAction(payload);
  if (!result.ok) {
    container.querySelectorAll("button, input, select, textarea").forEach((el) => { el.disabled = false; });
    const message = typeof result.error === "string" ? result.error : "The change was not saved.";
    if (status) status.innerHTML = `<p class="admin-action-status is-error">${esc(message)}</p>`;
    else window.alert(message);
    return;
  }
  const [refreshed, analytics] = await Promise.all([CloudSync.getAdminOverview(), CloudSync.getProductAnalytics()]);
  if (refreshed.ok) state.data = { ...refreshed.data, analytics: analytics.ok ? analytics.data : state.data.analytics };
  render(container);
}
