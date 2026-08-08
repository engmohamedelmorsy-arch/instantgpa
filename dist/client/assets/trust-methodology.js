import { AcademicProfile } from "./academic-profile.js";
import { GradingEngine } from "./grading-engine.js";
import { AcademicRecord } from "./academic-record.js";
import { t } from "./localization.js";
import { routeHref } from "./app.js";

const METHOD_VERSION = "2026.07.29";

export function mount(container) {
  const profile = AcademicProfile.get();
  const system = GradingEngine.getActive();
  const summary = AcademicRecord.summary(system);

  container.innerHTML = `
    <article class="methodology-page">
      <header class="methodology-hero">
        <span class="section-kicker">Transparent by design</span>
        <h2>${t("trust.title")}</h2>
        <p>${t("trust.subtitle")}</p>
        <div class="methodology-meta">
          <span><strong>Method version</strong>${METHOD_VERSION}</span>
          <span><strong>Last reviewed</strong>July 29, 2026</span>
          <span><strong>Review status</strong>Owner-reviewed; independent Registrar reviewer not yet appointed</span>
        </div>
      </header>

      <section class="methodology-section">
        <span class="section-kicker">01 · Reproducible formulas</span>
        <h3>Every result can be recalculated independently</h3>
        <div class="formula-grid">
          <article><strong>Course quality points</strong><p>Course credits × grade points</p></article>
          <article><strong>Semester GPA</strong><p>Total quality points ÷ total GPA-counted credits</p></article>
          <article><strong>Cumulative GPA</strong><p>(Previous GPA × previous credits + new quality points) ÷ total credits</p></article>
          <article><strong>Target GPA</strong><p>[Target × (completed + remaining) − current GPA × completed] ÷ remaining</p></article>
        </div>
        <p>Calculators keep full precision internally and normally display three decimals. University-issued results can use a different published precision or rounding rule.</p>
        <a href="${routeHref("guides/gpa-calculation-example")}">Open the four-course worked example</a>
      </section>

      <section class="methodology-section">
        <span class="section-kicker">02 · Course-status rules</span>
        <h3>Included, excluded, and unresolved are different states</h3>
        <div class="record-table-wrap">
          <table class="intl-table table--wide">
            <thead><tr><th>Status</th><th>Default planning treatment</th><th>Why it may change</th></tr></thead>
            <tbody>
              <tr><td>Letter or numeric grade</td><td>Included when recognised and course credits are valid</td><td>University scale and retake policy</td></tr>
              <tr><td>P / Pass</td><td>May earn credit without GPA quality points</td><td>Institutional pass/fail policy</td></tr>
              <tr><td>W / Withdraw</td><td>Excluded from GPA</td><td>Academic or financial record rules</td></tr>
              <tr><td>I / Incomplete</td><td>Unresolved; not guessed</td><td>Deadline and automatic-conversion policy</td></tr>
              <tr><td>U / currently registered</td><td>In progress; never treated as zero</td><td>Final grade when issued</td></tr>
              <tr><td>Unknown grade</td><td>Blocks the affected calculation</td><td>User or source confirmation</td></tr>
              <tr><td>Missing course credits</td><td>Blocks a weighted contribution</td><td>Confirmed course-level credits</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="methodology-section">
        <span class="section-kicker">03 · Retake policies</span>
        <h3>The policy is an input, not an assumption</h3>
        <p>InstantGPA supports highest attempt, latest attempt, full replacement, average attempts, both attempts, and no-change scenarios. A report records the selected policy so another person can reproduce the result.</p>
        <a href="${routeHref("guides/retake-policy-example")}">Compare the same retake under four policies</a>
      </section>

      <section class="methodology-section">
        <span class="section-kicker">04 · OCR and transcript confidence</span>
        <h3>Extraction never becomes truth without review</h3>
        <ol class="process-list">
          <li><strong>Local structured read.</strong><span>XLSX, CSV, TSV, and searchable PDF content is read on the device when possible.</span></li>
          <li><strong>Secure OCR fallback.</strong><span>Scanned documents can be sent to the configured EU document reader only after local detection fails and the user agrees.</span></li>
          <li><strong>Editable review.</strong><span>Every detected row, header mapping, course credit, grade, and status remains editable.</span></li>
          <li><strong>Explicit confirmation.</strong><span>No row joins the shared academic record before approval.</span></li>
        </ol>
        <p>Raw OCR text and the original file are not stored in the academic report. Confidence labels describe extraction method, not academic-policy authority.</p>
      </section>

      <section class="methodology-section">
        <span class="section-kicker">05 · University evidence levels</span>
        <h3>Policy confidence is visible beside the rule</h3>
        <ul class="trust-list">
          <li><strong>Official verified:</strong> current Registrar, catalog, regulation, government, or official university source.</li>
          <li><strong>University-provided:</strong> official material whose programme scope or update date needs confirmation.</li>
          <li><strong>Independently reviewed:</strong> checked by a named qualified reviewer against primary evidence.</li>
          <li><strong>User-customized:</strong> a personal scale created for planning.</li>
          <li><strong>Unverified estimate:</strong> a fallback that must not be described as official.</li>
        </ul>
        <div class="methodology-context">
          <span><strong>${t("setup.country.label")}</strong>${escapeHtml(profile?.countryName || t("common.optional"))}</span>
          <span><strong>${t("setup.university.label")}</strong>${escapeHtml(profile?.university || t("common.optional"))}</span>
          <span><strong>${t("profile.gradingSystem")}</strong>${escapeHtml(system?.label || t("common.optional"))}</span>
          <span><strong>Current record</strong>${summary.totalCourses} courses · ${summary.gpa == null ? "GPA unresolved" : `${summary.gpa.toFixed(3)} GPA`}</span>
        </div>
        <div class="row-actions">
          <a class="btn btn--ghost" href="${routeHref("home")}">${t("trust.editGrading")}</a>
          <a class="btn btn--ghost" href="${routeHref("international-systems")}">Review sources</a>
        </div>
      </section>

      <section class="methodology-section">
        <span class="section-kicker">06 · Privacy and sharing</span>
        <h3>Privacy policy</h3>
        <a class="btn btn--ghost" href="/privacy.html">Read the Privacy Policy</a>
      </section>

      <section class="methodology-section">
        <span class="section-kicker">07 · Known limitations</span>
        <h3>What InstantGPA does not certify</h3>
        <ul>
          <li>It does not issue an official GPA, transcript, credential evaluation, or graduation clearance.</li>
          <li>International conversion has no single universal authoritative formula.</li>
          <li>Degree audit is only as complete as the user-confirmed requirement groups and course assignments.</li>
          <li>Graduation planning does not know future course availability, timetable conflicts, seat limits, adviser exceptions, or unpublished prerequisites.</li>
          <li>University policies can differ by faculty, programme, level, catalog year, and student cohort.</li>
        </ul>
      </section>

      <section class="methodology-section">
        <span class="section-kicker">08 · Test case and change log</span>
        <h3>A published result you can reproduce</h3>
        <p>Biology 4 credits at 4.0, Chemistry 3 at 3.3, Mathematics 3 at 3.7, and English 2 at 3.0 produce 43.0 quality points across 12 credits: <strong>43 ÷ 12 = 3.583</strong>.</p>
        <div class="change-log">
          <p><strong>2026.07.29</strong><span>Added versioned Academic Journey Reports, selective protected sharing, row-level calculations, source levels, editorial policy, university pages, and worked examples.</span></p>
          <p><strong>2026.07.28</strong><span>Separated programme-total credits from course-level credits and prevented U from being interpreted as zero.</span></p>
        </div>
        <div class="row-actions">
          <a class="btn btn--primary" href="${routeHref("academic-report")}">Create report</a>
          <a class="btn btn--ghost" href="${routeHref("corrections")}">Corrections process</a>
          <a class="btn btn--text" href="${routeHref("editorial-policy")}">Editorial policy</a>
        </div>
      </section>

      <section class="methodology-section methodology-sources">
        <span class="section-kicker">Primary reference framework</span>
        <h3>External sources</h3>
        <ul>
          <li><a href="https://education.ec.europa.eu/education-levels/higher-education/inclusive-and-connected-higher-education/european-credit-transfer-and-accumulation-system">European Commission — ECTS</a></li>
          <li><a href="https://www.ugc.gov.in/e-book/EVALUATION%20ENGLISH.pdf">India University Grants Commission — Evaluation Reforms</a></li>
          <li><a href="https://www.qaa.ac.uk/docs/qaa/quality-code/higher-education-credit-framework-for-england.pdf">UK QAA — Higher Education Credit Framework</a></li>
          <li><a href="${routeHref("universities/ucla/gpa-calculator")}">University-specific source pages</a></li>
        </ul>
      </section>
    </article>`;
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
