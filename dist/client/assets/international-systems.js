// international-systems.js
// A browsable reference of every grading preset — separate from the
// "Grading System" tool, which edits the visitor's own active scale. This
// page is read-only: pick a preset from the dropdown to see its table:
// nothing here writes to storage or affects the visitor's own settings.

import { GradingEngine } from "./grading-engine.js";
import { navigateTo, routeHref } from "./app.js";
import { t } from "./localization.js";

export async function mount(container) {
  const [presets, policyResponse] = await Promise.all([
    GradingEngine.listPresets(),
    fetch("/data/university-policies.json"),
  ]);
  const policyData = policyResponse.ok ? await policyResponse.json() : { policies: {} };
  const policies = Object.entries(policyData.policies || {});
  const ids = Object.keys(presets);
  let selected = ids[0];

  function render() {
    const preset = presets[selected];
    const rows = [...preset.grades].sort((a, b) => b.min - a.min);

    container.innerHTML = `
      <div class="tool-card tool-card--wide">
        <h2>${t("international.title")}</h2>
        <p class="tool-sub">${t("international.subtitle")}</p>
        <p class="result-note result-note--muted"><strong>International conversion is an estimate, not a universal credential evaluation.</strong> Country defaults are starting points; university, programme, level, and catalog year can change the rule.</p>

        <label class="field">
          <span>${t("international.pick")}</span>
          <select id="intlPreset">
            ${ids.map((id) => `<option value="${id}" ${id === selected ? "selected" : ""}>${presets[id].label}</option>`).join("")}
          </select>
        </label>

        <table class="intl-table table--compact">
          <thead>
            <tr><th>${t("grading.table.grade")}</th><th>${t("grading.table.min")}</th><th>${t("grading.table.points")}</th></tr>
          </thead>
          <tbody>
            ${rows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${r.min}%</td><td>${r.points}</td></tr>`).join("")}
          </tbody>
        </table>
        <p class="field-note">${t("grading.maxGpa")}: <strong>${preset.maxGpa}</strong></p>
        <p class="tool-note">${t("grading.disclaimer")}</p>
        <a class="btn btn--primary" id="intlUseThis" href="#">${t("international.useThis")}</a>

        <section class="verified-policies">
          <div class="verified-policies__head">
            <div><span class="section-kicker">Official-source library</span><h3>Verified university policies</h3></div>
            <a href="${routeHref("editorial-policy")}">How sources are reviewed</a>
          </div>
          <div class="verified-policy-grid">
            ${policies.map(([route, policy]) => `<article>
              <span>${escapeHtml(policy.country)}</span>
              <h4>${escapeHtml(policy.name)}</h4>
              <p>${escapeHtml(policy.scope)}</p>
              <div><strong>${escapeHtml(policy.verification)}</strong><small>Reviewed ${escapeHtml(policyData.reviewedAt || "2026-07-29")}</small></div>
              <a href="${policy.pageUrl ? escapeHtml(policy.pageUrl) : routeHref(route)}" ${policy.pageUrl ? 'target="_blank" rel="noopener noreferrer"' : ""}>Open official policy${policy.pageUrl ? " ↗" : " and calculator context →"}</a>
            </article>`).join("")}
          </div>
        </section>

        <section class="international-reference-links">
          <h3>International reference framework</h3>
          <ul>
            <li><a href="https://education.ec.europa.eu/education-levels/higher-education/inclusive-and-connected-higher-education/european-credit-transfer-and-accumulation-system">European Commission — ECTS</a></li>
            <li><a href="https://www.ugc.gov.in/e-book/EVALUATION%20ENGLISH.pdf">India UGC — Evaluation Reforms</a></li>
            <li><a href="https://www.qaa.ac.uk/docs/qaa/quality-code/higher-education-credit-framework-for-england.pdf">UK QAA — Higher Education Credit Framework</a></li>
            <li><a href="${routeHref("guides/international-gpa-conversion")}">Read the international conversion guide</a></li>
          </ul>
        </section>
      </div>`;

    container.querySelector("#intlPreset").addEventListener("change", (e) => {
      selected = e.target.value;
      render();
    });
    container.querySelector("#intlUseThis").addEventListener("click", async (e) => {
      e.preventDefault();
      await GradingEngine.setActiveFromPreset(selected);
      navigateTo("home");
    });
  }

  render();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
