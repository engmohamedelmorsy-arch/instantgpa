import { routeHref } from "./app.js";

const REVIEW_DATE = "July 29, 2026";

const sourceLink = (href, label) =>
  `<a href="${href}" rel="noopener">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;

const pageShell = ({
  eyebrow,
  title,
  dek,
  body,
  sources = [],
  related = [],
  className = "",
  showByline = true,
  showAside = true,
}) => `
  <article class="editorial-page ${escapeHtml(className)}">
    <header class="editorial-hero">
      <span class="section-kicker">${escapeHtml(eyebrow)}</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(dek)}</p>
      ${showByline ? `<div class="editorial-byline">
        <span>Written and reviewed by <a href="${routeHref("about")}">Mohamed Elmorsy</a></span>
        <span>Last reviewed ${REVIEW_DATE}</span>
        <span>Method version 2026.07.29</span>
      </div>` : ""}
    </header>
    <div class="editorial-layout ${showAside ? "" : "editorial-layout--single"}">
      <div class="editorial-body">${body}</div>
      ${showAside ? `<aside class="editorial-aside">
        <section>
          <h3>Evidence label</h3>
          <p><strong>Source-backed guidance.</strong> Official policy is linked beside the claim. InstantGPA remains a planning tool, not an official credential evaluation.</p>
        </section>
        ${sources.length ? `<section><h3>Primary sources</h3><ul>${sources.map((source) => `<li>${sourceLink(source.url, source.label)}</li>`).join("")}</ul></section>` : ""}
        <section>
          <h3>Related next steps</h3>
          <ul>${related.map(([id, label]) => `<li><a href="${routeHref(id)}">${escapeHtml(label)}</a></li>`).join("")}</ul>
        </section>
      </aside>` : ""}
    </div>
  </article>`;

const standardRelated = [
  ["transcript-import", "Import and review a transcript"],
  ["gpa-calculator", "Calculate GPA with credits"],
  ["degree-audit", "Audit degree progress"],
  ["planning", "Build a graduation plan"],
  ["academic-report", "Create an Academic Journey Report"],
];

const PAGES = {
  "instantgpa-pro": {
    eyebrow: "Subscriber workspace",
    title: "InstantGPA Pro and the Academic Twin",
    dek: "A private academic operating system that connects the live semester, cited syllabi, official-source policies, decision probabilities, transfer, cost, risk, and adviser review.",
    body: `
      <section class="pro-editorial-hero">
        <div>
          <span class="pro-editorial-badge">PRO</span>
          <h3>Ask a bigger question than “What is my GPA?”</h3>
          <p>InstantGPA Pro answers both: <strong>What is the best path to my target?</strong> and <strong>What changes if I withdraw, retake, reduce my load, transfer, or change major?</strong></p>
        </div>
        <a class="btn btn--primary" href="${routeHref("pro-workspace")}">Open subscriber workspace</a>
      </section>
      <section>
        <h3>What subscribers can do</h3>
        <div class="evidence-grid pro-feature-grid">
          <article><strong>Live semester and PWA</strong><p>Track course pulse, next deadlines, at-risk targets, install the app, enable privacy-preserving reminders, and export an ICS calendar.</p></article>
          <article><strong>Chat with Syllabus</strong><p>Ask about dates, weights, attendance, exams, and named policies. Every supported answer cites the saved syllabus lines; unsupported answers are refused.</p></article>
          <article><strong>Academic Twin scenarios</strong><p>Compare fastest, balanced, and safest plans using GPA feasibility, remaining credits, term load, tuition estimate, weekly effort, and risk.</p></article>
          <article><strong>Academic Undo Button™</strong><p>Run 5,000 before-and-after scenarios for a difficult decision and compare target probability, GPA range, scholarship, cost, delay, prerequisites, deadline, and cited policy.</p></article>
          <article><strong>Official policy registry</strong><p>Search a first-phase source registry covering major universities in Egypt and the Gulf plus selected U.S. and international institutions.</p></article>
          <article><strong>Transfer matching</strong><p>Compare completed and target courses using codes, titles, and credits. Every result carries confidence, a reason, and an official-review boundary.</p></article>
          <article><strong>Translation and credit systems</strong><p>Review academic terminology side by side and compare ECTS, UK CATS, and US semester credits without inventing a universal exact equivalency.</p></article>
          <article><strong>Document consistency review</strong><p>Create a local SHA-256 fingerprint and check approved course rows for review-readiness signals—without presenting a fraud verdict.</p></article>
          <article><strong>Adviser review links</strong><p>Create a read-only, expiring, optionally password-protected link containing results and the latest plan, never the original source documents.</p></article>
          <article><strong>Private Pro workspace</strong><p>Save structured Pro decisions to your account with server-side subscription checks and version-conflict protection.</p></article>
        </div>
      </section>
      <section>
        <h3>Free calculators stay focused; Pro connects decisions</h3>
        <div class="record-table-wrap">
          <table class="intl-table table--wide">
            <thead><tr><th>Capability</th><th>Free tools</th><th>InstantGPA Pro</th></tr></thead>
            <tbody>
              <tr><td>Manual GPA and CGPA calculation</td><td>Included</td><td>Included</td></tr>
              <tr><td>Local transcript review</td><td>Included</td><td>Connected to Pro decisions</td></tr>
              <tr><td>Syllabus extraction and live grade targets</td><td>—</td><td>Included</td></tr>
              <tr><td>Syllabus chat with line citations and reminders</td><td>—</td><td>Included</td></tr>
              <tr><td>Academic Twin plans with cost and risk</td><td>—</td><td>Included</td></tr>
              <tr><td>Academic Undo probability simulation</td><td>—</td><td>Included</td></tr>
              <tr><td>Official-source policy registry</td><td>—</td><td>Included</td></tr>
              <tr><td>Transfer-course confidence matching</td><td>—</td><td>Included</td></tr>
              <tr><td>ECTS/CATS/US comparison and terminology aid</td><td>—</td><td>Included</td></tr>
              <tr><td>Document consistency review</td><td>—</td><td>Included</td></tr>
              <tr><td>Saved Pro workspace and adviser links</td><td>—</td><td>Included</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>Why the recommendations remain explainable</h3>
        <ul>
          <li>Every Academic Twin plan shows the assumptions used in the calculation.</li>
          <li>Academic Undo probability is based on user-entered averages and uncertainty, not a prediction disguised as certainty.</li>
          <li>Syllabus chat answers are limited to stored lines and expose the cited excerpt.</li>
          <li>Transfer matches never claim that a university has awarded credit.</li>
          <li>Document integrity results describe consistency signals, not guilt or authenticity.</li>
          <li>Missing policy evidence lowers confidence instead of being silently invented.</li>
          <li>Raw transcript and syllabus files are not included in adviser links.</li>
        </ul>
      </section>
      <section class="editorial-cta">
        <div><h3>Use an active paid subscription</h3><p>Sign in first. Paid subscriber access is checked by the server before a Premium workflow runs.</p></div>
        <a class="btn btn--primary" href="${routeHref("account")}">Check my access</a>
      </section>`,
    related: [
      ["pro-workspace", "Open Academic Twin Pro"],
      ["transcript-import", "Review a transcript"],
      ["academic-report", "Create an Academic Journey Report"],
      ["trust", "Read the methodology"],
    ],
  },
  "transcript-to-graduation-plan": {
    eyebrow: "Connected academic workflow",
    title: "From transcript to a graduation plan",
    dek: "The strongest InstantGPA workflow uses one reviewed academic record across calculation, audit, planning, and reporting—without silently inventing missing credits or university rules.",
    className: "editorial-page--journey",
    showByline: false,
    showAside: false,
    body: `
      <section class="journey-example">
        <h3>Example decision path</h3>
        <p>A student imports 42 courses. Two have missing credit hours and one is marked U (currently registered). InstantGPA calculates GPA from the valid graded courses, excludes U from GPA, marks the two credit totals as unknown, carries the U course into “in progress,” and refuses to present a precise remaining-credit figure until the missing credits are confirmed.</p>
      </section>
      <section class="editorial-cta journey-start">
        <div><h3>Start with the source of truth</h3><p>Review the transcript once, then reuse the approved record throughout the academic workflow.</p></div>
        <a class="btn btn--primary" href="${routeHref("transcript-import")}">Import transcript</a>
      </section>
      <section class="journey-graph-section" aria-labelledby="journeyGraphTitle">
        <div class="journey-graph-heading">
          <span>One approved record · five connected decisions</span>
          <h3 id="journeyGraphTitle">The complete five-stage workflow</h3>
        </div>
        <div class="journey-flow" role="list" aria-label="Five-stage academic workflow">
          <article class="journey-node" role="listitem">
            <span class="journey-node__number">01</span>
            <span class="journey-node__icon" aria-hidden="true">▤</span>
            <strong>Import</strong>
            <p>Review every detected field.</p>
          </article>
          <article class="journey-node" role="listitem">
            <span class="journey-node__number">02</span>
            <span class="journey-node__icon" aria-hidden="true">∑</span>
            <strong>Calculate</strong>
            <p>Credits × grade points.</p>
          </article>
          <article class="journey-node" role="listitem">
            <span class="journey-node__number">03</span>
            <span class="journey-node__icon" aria-hidden="true">✓</span>
            <strong>Audit</strong>
            <p>Map progress and gaps.</p>
          </article>
          <article class="journey-node" role="listitem">
            <span class="journey-node__number">04</span>
            <span class="journey-node__icon" aria-hidden="true">◇</span>
            <strong>Plan</strong>
            <p>Check credits and prerequisites.</p>
          </article>
          <article class="journey-node" role="listitem">
            <span class="journey-node__number">05</span>
            <span class="journey-node__icon" aria-hidden="true">↗</span>
            <strong>Share</strong>
            <p>Create a versioned report.</p>
          </article>
        </div>
        <div class="journey-guardrails" aria-labelledby="journeyGuardrailsTitle">
          <div class="journey-guardrails__title">
            <span aria-hidden="true">◆</span>
            <div><strong id="journeyGuardrailsTitle">What is never guessed</strong><small>Unknown inputs stay visible instead of becoming false certainty.</small></div>
          </div>
          <div class="journey-guardrails__grid">
            <article><strong>Missing credits</strong><span>No substitution</span></article>
            <article><strong>Unknown symbols</strong><span>Calculation pauses</span></article>
            <article><strong>Retake policy</strong><span>Never assumed</span></article>
            <article><strong>Degree completion</strong><span>Registrar decides</span></article>
          </div>
        </div>
      </section>`,
    related: standardRelated,
  },
  "guides/gpa-calculation-example": {
    eyebrow: "Formula and worked example",
    title: "How to calculate GPA with credits",
    dek: "A reproducible GPA calculation uses course credits as weights and shows every quality-point contribution before dividing the total.",
    body: `
      <section>
        <h3>The formula</h3>
        <div class="formula-card">
          <p><strong>Quality points for one course</strong> = course credits × grade points</p>
          <p><strong>Semester GPA</strong> = total quality points ÷ total GPA-counted credits</p>
        </div>
      </section>
      <section>
        <h3>Four-course example</h3>
        <div class="record-table-wrap">
          <table class="intl-table table--wide">
            <thead><tr><th>Course</th><th>Credits</th><th>Grade</th><th>Points</th><th>Calculation</th></tr></thead>
            <tbody>
              <tr><td>Biology</td><td>4</td><td>A</td><td>4.0</td><td>4 × 4.0 = 16.0</td></tr>
              <tr><td>Chemistry</td><td>3</td><td>B+</td><td>3.3</td><td>3 × 3.3 = 9.9</td></tr>
              <tr><td>Mathematics</td><td>3</td><td>A−</td><td>3.7</td><td>3 × 3.7 = 11.1</td></tr>
              <tr><td>English</td><td>2</td><td>B</td><td>3.0</td><td>2 × 3.0 = 6.0</td></tr>
            </tbody>
          </table>
        </div>
        <p>Total credits = 12. Total quality points = 43.0. GPA = 43.0 ÷ 12 = <strong>3.583</strong>, displayed to three decimal places by the calculator.</p>
      </section>
      <section>
        <h3>Excluded and unresolved rows</h3>
        <ul>
          <li><strong>W:</strong> normally excluded from GPA, subject to the official institutional policy.</li>
          <li><strong>P / Pass:</strong> may earn credit without contributing grade points.</li>
          <li><strong>I / Incomplete:</strong> unresolved until the institution converts it under its rules.</li>
          <li><strong>U / currently registered:</strong> not treated as zero and not included in GPA.</li>
          <li><strong>Missing credits:</strong> never converted to a default value.</li>
        </ul>
      </section>
      <section>
        <h3>Common mistakes</h3>
        <p>Do not average letter grades without credits, convert an unknown symbol to zero, use rounded semester GPAs to rebuild a cumulative GPA, or apply one university’s retake rule to another university.</p>
      </section>
      <section class="editorial-cta">
        <div><h3>Reproduce the example</h3><p>Enter the four courses and expand “Show calculation” under the result.</p></div>
        <a class="btn btn--primary" href="${routeHref("gpa-calculator")}">Open GPA calculator</a>
      </section>`,
    related: [
      ["gpa-calculator", "GPA calculator"],
      ["cgpa-calculator", "CGPA calculator"],
      ["guides/retake-policy-example", "Retake-policy example"],
      ["trust", "Calculation methodology"],
    ],
  },
  "guides/3-0-gpa": {
    eyebrow: "GPA benchmark",
    title: "How to get a 3.0 GPA",
    dek: "A 3.0 is a B average on a 4.0 scale — a common minimum for graduate-school eligibility and academic good standing. Here's what it takes to reach it.",
    body: `
      <section>
        <h3>What a 3.0 GPA represents</h3>
        <p>On a standard 4.0 scale, a 3.0 corresponds to a straight B average — roughly 83-86% depending on your institution's own percentage-to-GPA table. It's a common minimum threshold for graduate-school eligibility, financial-aid good standing, and some scholarship renewals, though every institution and program sets its own exact cutoff.</p>
      </section>
      <section>
        <h3>The required-GPA formula</h3>
        <div class="formula-card">
          <p><strong>Required GPA</strong> = [target × (completed + remaining credits) − current GPA × completed credits] ÷ remaining credits</p>
        </div>
      </section>
      <section>
        <h3>Worked example</h3>
        <p>A student has a <strong>2.70</strong> cumulative GPA across <strong>45 completed credits</strong> and has <strong>45 credits remaining</strong>. Target: 3.0.</p>
        <div class="record-table-wrap">
          <table class="intl-table table--wide">
            <thead><tr><th>Step</th><th>Calculation</th></tr></thead>
            <tbody>
              <tr><td>Current quality points</td><td>2.70 × 45 = 121.5</td></tr>
              <tr><td>Target total quality points</td><td>3.0 × 90 = 270</td></tr>
              <tr><td>Points still needed</td><td>270 − 121.5 = 148.5</td></tr>
              <tr><td>Required average over remaining credits</td><td>148.5 ÷ 45 = <strong>3.30</strong></td></tr>
            </tbody>
          </table>
        </div>
        <p>This student needs roughly a B+/A− average (3.30) across their remaining 45 credits — a realistic, reachable target with consistent effort.</p>
      </section>
      <section class="editorial-cta">
        <div><h3>Calculate your own numbers</h3><p>Enter your current GPA, completed credits, and remaining credits to see the exact average you need.</p></div>
        <a class="btn btn--primary" href="${routeHref("graduation-predictor")}">Open Target GPA Calculator</a>
      </section>`,
    related: [
      ["graduation-predictor", "Target GPA calculator"],
      ["guides/3-5-gpa", "How to get a 3.5 GPA"],
      ["gpa-calculator", "GPA calculator"],
      ["guides/gpa-calculation-example", "Worked GPA example"],
    ],
  },
  "guides/3-5-gpa": {
    eyebrow: "GPA benchmark",
    title: "How to get a 3.5 GPA",
    dek: "A 3.5 is a B+/A− average — commonly the threshold for cum laude honors and scholarship renewal. Here's the math behind reaching it.",
    body: `
      <section>
        <h3>What a 3.5 GPA represents</h3>
        <p>A 3.5 on a 4.0 scale sits between a B+ and an A− average. It's a common minimum for cum laude honors at graduation and for renewing many merit scholarships, and it's competitive for most master's programs — though selective professional programs (law, medicine, top MBA) often expect higher. Confirm the specific published threshold for your program.</p>
      </section>
      <section>
        <h3>Worked example</h3>
        <p>A student has a <strong>3.00</strong> cumulative GPA across <strong>30 completed credits</strong>, with <strong>90 credits remaining</strong>. Target: 3.5.</p>
        <div class="record-table-wrap">
          <table class="intl-table table--wide">
            <thead><tr><th>Step</th><th>Calculation</th></tr></thead>
            <tbody>
              <tr><td>Current quality points</td><td>3.00 × 30 = 90</td></tr>
              <tr><td>Target total quality points</td><td>3.5 × 120 = 420</td></tr>
              <tr><td>Points still needed</td><td>420 − 90 = 330</td></tr>
              <tr><td>Required average over remaining credits</td><td>330 ÷ 90 = <strong>3.67</strong></td></tr>
            </tbody>
          </table>
        </div>
        <p>Because this student has a large number of remaining credits (90), an A−/A average from here on is enough to pull a 3.00 start up to a 3.5 cumulative — the more credits remaining, the more a lower start can be offset.</p>
      </section>
      <section>
        <h3>When 3.5 stops being reachable</h3>
        <p>The same formula can return a required average above your grading scale's maximum — meaning the target isn't reachable in your remaining credits. In that case the only paths are adding more remaining credits (an extra term) or retaking a past low grade under your university's retake policy.</p>
      </section>
      <section class="editorial-cta">
        <div><h3>Calculate your own numbers</h3><p>Enter your current GPA, completed credits, and remaining credits to see the exact average you need — or whether it's mathematically reachable yet.</p></div>
        <a class="btn btn--primary" href="${routeHref("graduation-predictor")}">Open Target GPA Calculator</a>
      </section>`,
    related: [
      ["graduation-predictor", "Target GPA calculator"],
      ["guides/3-7-gpa", "How to get a 3.7 GPA"],
      ["retake-calculator", "Retake GPA calculator"],
      ["guides/3-0-gpa", "How to get a 3.0 GPA"],
    ],
  },
  "guides/3-7-gpa": {
    eyebrow: "GPA benchmark",
    title: "How to get a 3.7 GPA",
    dek: "A 3.7 sits in A−/A territory — often the range for magna cum laude honors. Here's how much one lower grade can cost you, and how to recover.",
    body: `
      <section>
        <h3>What a 3.7 GPA represents</h3>
        <p>A 3.7 on a 4.0 scale is an A−/A average. It's often associated with magna cum laude honors and is competitive for top graduate and professional programs — though exact honors cutoffs and admissions expectations are set independently by each institution.</p>
      </section>
      <section>
        <h3>How much one lower grade costs you</h3>
        <p>A student is at a <strong>3.700</strong> cumulative GPA across <strong>90 credits</strong> (333 quality points). They take one more 3-credit course and earn a B (3.0) instead of an A.</p>
        <div class="record-table-wrap">
          <table class="intl-table table--wide">
            <thead><tr><th>Step</th><th>Calculation</th></tr></thead>
            <tbody>
              <tr><td>New course contribution</td><td>3.0 × 3 = 9.0 quality points</td></tr>
              <tr><td>New total</td><td>(333 + 9) ÷ (90 + 3) = 342 ÷ 93</td></tr>
              <tr><td>New cumulative GPA</td><td><strong>3.677</strong> (down from 3.700)</td></tr>
            </tbody>
          </table>
        </div>
        <p>One B on a large existing credit base costs about 0.023 — noticeable but recoverable. To climb back to 3.7 over the next 15 credits at straight A's: (342 + 15 × 4) ÷ 108 = 402 ÷ 108 = <strong>3.722</strong> — fully recovered and slightly above target.</p>
      </section>
      <section class="editorial-cta">
        <div><h3>Model your own scenario</h3><p>See exactly how a specific grade change affects your cumulative GPA, or what average you need going forward.</p></div>
        <a class="btn btn--primary" href="${routeHref("scenario-lab")}">Open GPA What-If Scenario Lab</a>
      </section>`,
    related: [
      ["scenario-lab", "GPA what-if scenario calculator"],
      ["graduation-predictor", "Target GPA calculator"],
      ["guides/4-0-gpa", "How to get a 4.0 GPA"],
      ["guides/3-5-gpa", "How to get a 3.5 GPA"],
    ],
  },
  "guides/4-0-gpa": {
    eyebrow: "GPA benchmark",
    title: "How to get and keep a 4.0 GPA",
    dek: "A 4.0 is the scale's ceiling, which makes it mathematically unforgiving. Here's what one lower grade actually costs, and why only a retake can fully undo it.",
    body: `
      <section>
        <h3>Why a 4.0 GPA is fragile</h3>
        <p>A 4.0 is the maximum on a standard 4.0 scale, so there's no higher grade available to offset a lower one. Every additional credit below a 4.0 pulls the cumulative average down, and the effect compounds as your total credit count grows.</p>
      </section>
      <section>
        <h3>What one B+ costs, with the numbers</h3>
        <p>A student has a perfect <strong>4.000</strong> GPA across <strong>30 credits</strong> (120 quality points, all A's). They take a 3-credit course and earn a B+ (3.3) instead of an A.</p>
        <div class="record-table-wrap">
          <table class="intl-table table--wide">
            <thead><tr><th>Step</th><th>Calculation</th></tr></thead>
            <tbody>
              <tr><td>New course contribution</td><td>3.3 × 3 = 9.9 quality points</td></tr>
              <tr><td>New total</td><td>(120 + 9.9) ÷ (30 + 3) = 129.9 ÷ 33</td></tr>
              <tr><td>New cumulative GPA</td><td><strong>3.936</strong> (down from 4.000)</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>The part most students don't realize</h3>
        <p>Once a cumulative GPA drops below 4.0, no amount of <em>additional</em> straight-A coursework can bring it back to exactly 4.0. Adding <em>n</em> more credits at a perfect 4.0 gives (129.9 + 4<em>n</em>) ÷ (33 + <em>n</em>) — and solving that equation for a result of exactly 4.0 has no valid solution for any positive <em>n</em>. The average approaches 4.0 but can never reach it again through new courses alone. The only way back to a literal 4.0 cumulative is a retake policy that fully replaces the old grade on the transcript, if your institution allows one.</p>
      </section>
      <section class="editorial-cta">
        <div><h3>Check your retake options</h3><p>See how your specific university's retake policy — replacement, highest-attempt, average, or both-count — would affect your cumulative GPA.</p></div>
        <a class="btn btn--primary" href="${routeHref("retake-calculator")}">Open Retake Calculator</a>
      </section>`,
    related: [
      ["retake-calculator", "Retake GPA calculator"],
      ["scenario-lab", "GPA what-if scenario calculator"],
      ["guides/3-7-gpa", "How to get a 3.7 GPA"],
      ["trust", "Calculation methodology"],
    ],
  },
  "guides/retake-policy-example": {
    eyebrow: "Policy-sensitive example",
    title: "How retake policies change GPA",
    dek: "The same old grade, new grade, and course credits can produce different cumulative GPAs because universities treat repeated attempts differently.",
    body: `
      <section>
        <h3>Example inputs</h3>
        <p>Current cumulative GPA: <strong>2.80</strong> across <strong>60 credits</strong>. A 3-credit course changes from D (1.0) to A (4.0). Current quality points are 2.80 × 60 = 168.</p>
      </section>
      <section>
        <h3>Four common policies</h3>
        <div class="record-table-wrap">
          <table class="intl-table table--wide">
            <thead><tr><th>Policy</th><th>Calculation concept</th><th>Estimated GPA</th></tr></thead>
            <tbody>
              <tr><td>Replace old grade</td><td>(168 − 3 + 12) ÷ 60</td><td>2.950</td></tr>
              <tr><td>Highest attempt</td><td>Same result here because A is higher than D</td><td>2.950</td></tr>
              <tr><td>Average attempts</td><td>(168 − 3 + 7.5) ÷ 60</td><td>2.875</td></tr>
              <tr><td>Count both attempts</td><td>(168 + 12) ÷ 63</td><td>2.857</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>Verification checklist</h3>
        <ol>
          <li>Open the current Registrar, catalog, or academic-regulations page.</li>
          <li>Confirm whether the old grade remains on the transcript and whether it remains in GPA.</li>
          <li>Check unit, attempt, programme, and catalog-year limits.</li>
          <li>Record the source URL and review date in the report.</li>
        </ol>
      </section>
      <section class="editorial-cta">
        <div><h3>Compare the policies</h3><p>InstantGPA calculates replacement, latest, highest, average, both-attempt, and no-change scenarios.</p></div>
        <a class="btn btn--primary" href="${routeHref("retake-calculator")}">Open retake calculator</a>
      </section>`,
    related: [
      ["retake-calculator", "Retake GPA calculator"],
      ["guides/gpa-calculation-example", "Worked GPA example"],
      ["international-systems", "University grading systems"],
      ["editorial-policy", "Source policy"],
    ],
  },
  "guides/international-gpa-conversion": {
    eyebrow: "International grading evidence",
    title: "International GPA conversion without false precision",
    dek: "There is no single authoritative global formula that turns every grade into a US GPA. Institution, programme, level, year, purpose, and evaluator can all matter.",
    body: `
      <section>
        <h3>What a responsible conversion does</h3>
        <ul>
          <li>Preserves the original grade, scale, credits, and institution.</li>
          <li>Identifies the official source and the policy scope.</li>
          <li>Separates direct calculation from an estimated cross-system comparison.</li>
          <li>Labels uncertainty instead of presenting an estimate as an official evaluation.</li>
        </ul>
      </section>
      <section>
        <h3>Credit systems are not grade conversions</h3>
        <p>ECTS supports credit accumulation, transfer, mobility, and recognition. It does not by itself define one grade-to-GPA conversion. The European Commission’s ECTS guidance should be used for credit context, while grading and recognition decisions still require the relevant institution.</p>
      </section>
      <section>
        <h3>India, the UK, and university variation</h3>
        <p>India’s UGC guidance explains credit-weighted grade-point calculation, but universities can implement variations. UK frameworks describe qualification and credit levels, not a universal US-GPA conversion. InstantGPA therefore stores university-specific evidence separately from country defaults.</p>
      </section>
      <section class="editorial-cta">
        <div><h3>Choose the exact context</h3><p>Start with country and university, then confirm the official policy before calculating.</p></div>
        <a class="btn btn--primary" href="${routeHref("international-systems")}">Browse verified systems</a>
      </section>`,
    sources: [
      { label: "European Commission — ECTS", url: "https://education.ec.europa.eu/education-levels/higher-education/inclusive-and-connected-higher-education/european-credit-transfer-and-accumulation-system" },
      { label: "European Commission — ECTS Users' Guide", url: "https://education.ec.europa.eu/sites/default/files/document-library-docs/ects-users-guide_en.pdf" },
      { label: "India UGC — Evaluation Reforms", url: "https://www.ugc.gov.in/e-book/EVALUATION%20ENGLISH.pdf" },
      { label: "UK QAA — Higher Education Credit Framework", url: "https://www.qaa.ac.uk/docs/qaa/quality-code/higher-education-credit-framework-for-england.pdf" },
    ],
    related: [
      ["international-systems", "International systems"],
      ["grade-converter", "Grade converter"],
      ["editorial-policy", "Source and review policy"],
      ["trust", "Known limitations"],
    ],
  },
  about: {
    eyebrow: "Purpose and ownership",
    title: "About InstantGPA",
    dek: "InstantGPA was created to turn fragmented academic calculations into one understandable, auditable student workflow.",
    body: `
      <section>
        <h3>Founder</h3>
        <p><strong>Mohamed Elmorsy</strong> is an Assistant Lecturer and PhD candidate with an academic background in construction engineering and research. He leads the product, calculation-governance, source-review, and correction process for InstantGPA.</p>
      </section>
      <section>
        <h3>Why the platform exists</h3>
        <p>Students often calculate GPA in one tool, track graduation requirements elsewhere, and manually rebuild the same information for an adviser. InstantGPA connects transcript review, GPA, degree audit, term planning, and reporting around one user-approved academic record.</p>
      </section>
      <section>
        <h3>Responsibility boundary</h3>
        <p>InstantGPA provides planning estimates. It does not issue transcripts, award credit, certify degree completion, or replace a Registrar, academic adviser, admissions office, or credential evaluator.</p>
      </section>
      <section>
        <h3>Review status</h3>
        <p>Calculations and policy pages are currently owner-reviewed against cited primary sources. An independent Registrar or credential-evaluation reviewer has not yet been appointed; the site states this openly rather than implying third-party approval.</p>
      </section>`,
    related: [
      ["editorial-policy", "Editorial and review policy"],
      ["corrections", "Corrections process"],
      ["trust", "Methodology and privacy"],
      ["transcript-to-graduation-plan", "Complete workflow"],
    ],
  },
  "editorial-policy": {
    eyebrow: "Evidence governance",
    title: "Editorial, source, and academic review policy",
    dek: "Every university-policy claim must be traceable to a source, scoped to the correct institution and programme, dated, and labelled by verification status.",
    body: `
      <section>
        <h3>Source hierarchy</h3>
        <ol>
          <li><strong>Official verified:</strong> current Registrar, academic regulations, catalog, government, or university policy.</li>
          <li><strong>University-provided:</strong> an official page whose scope or update date needs confirmation.</li>
          <li><strong>Independently reviewed:</strong> checked by a named qualified reviewer against primary evidence.</li>
          <li><strong>User-customized:</strong> a scale entered by the user for personal planning.</li>
          <li><strong>Unverified estimate:</strong> a fallback that must not be presented as official.</li>
        </ol>
      </section>
      <section>
        <h3>Publication gate</h3>
        <p>A university page is indexable only when it has distinct policy content, at least one official source, a scope statement, a review date, a scale or formula, and a limitation. Thin pages generated from a university name alone are not published.</p>
      </section>
      <section>
        <h3>Conflict handling</h3>
        <p>When sources disagree, the page does not silently choose one. It identifies the programme, degree level, faculty, catalog year, or later effective date that explains the difference. If that cannot be resolved, the status becomes “needs verification.”</p>
      </section>
      <section>
        <h3>Calculation review</h3>
        <p>Pure calculation functions are tested separately from interface code. Worked examples include inputs, intermediate quality points, denominator credits, result precision, excluded statuses, and the method version used.</p>
      </section>
      <section>
        <h3>AI and OCR</h3>
        <p>OCR may extract text and table structure, but it does not make an academic policy authoritative. Every detected transcript row remains editable and requires user confirmation before it joins the shared academic record.</p>
      </section>`,
    related: [
      ["corrections", "Submit a correction"],
      ["trust", "Calculation methodology"],
      ["about", "Ownership and review status"],
      ["guides/international-gpa-conversion", "International conversion guide"],
    ],
  },
  corrections: {
    eyebrow: "Transparent change control",
    title: "Corrections and university-policy updates",
    dek: "InstantGPA accepts source-backed corrections and records what changed, why it changed, and when the revised method becomes effective.",
    body: `
      <section>
        <h3>What a useful correction includes</h3>
        <ul>
          <li>University, faculty, programme, degree level, and catalog year.</li>
          <li>The exact statement that appears wrong or incomplete.</li>
          <li>A current official URL or policy document and page number.</li>
          <li>The corrected grade boundary, point value, course-status rule, retake rule, or rounding instruction.</li>
        </ul>
      </section>
      <section>
        <h3>Review process</h3>
        <ol>
          <li>The source is checked for official ownership, scope, and effective date.</li>
          <li>The reported rule is reproduced independently against a test case.</li>
          <li>Affected presets, examples, pages, and tests are updated together.</li>
          <li>The page review date and method change log are updated.</li>
        </ol>
      </section>
      <section>
        <h3>Current change log</h3>
        <div class="change-log">
          <p><strong>2026.07.29</strong><span>Added source levels, university-policy pages, reproducible report metadata, worked examples, and a corrections policy.</span></p>
          <p><strong>2026.07.28</strong><span>Separated programme-total credits from missing course-level credits and clarified U as currently registered.</span></p>
        </div>
      </section>
      <section class="editorial-cta">
        <div><h3>Prepare a correction</h3><p>Copy the checklist above and include the official source. No unsourced scale change is accepted.</p></div>
        <a class="btn btn--ghost" href="${routeHref("editorial-policy")}">Read publication policy</a>
      </section>`,
    related: [
      ["editorial-policy", "Editorial policy"],
      ["trust", "Method change log"],
      ["international-systems", "University systems"],
      ["about", "Who reviews InstantGPA"],
    ],
  },
  "resources/academic-adviser-report": {
    eyebrow: "Linkable academic resource",
    title: "Academic Adviser Report template",
    dek: "A useful adviser handoff shows the result, the evidence behind it, unresolved data, and the proposed next steps—without exposing the original transcript file.",
    body: `
      <section>
        <h3>Report sections</h3>
        <div class="evidence-grid">
          <article><strong>Academic context</strong><p>University, country, programme context, grading scale, source status, and catalog year.</p></article>
          <article><strong>GPA evidence</strong><p>Counted credits, quality points, GPA, semester breakdowns, excluded courses, and row-level calculations.</p></article>
          <article><strong>Degree audit</strong><p>Completed, in-progress, remaining, unassigned, and unknown requirement credits.</p></article>
          <article><strong>Graduation plan</strong><p>Proposed terms, credit load, prerequisites, and blocked courses that need adviser action.</p></article>
        </div>
      </section>
      <section>
        <h3>Privacy controls</h3>
        <p>The original uploaded file is never included automatically. A student can export locally or create a time-limited, read-only link containing results only, the plan only, or the full reviewed report. Password protection and revocation are available for shared links.</p>
      </section>
      <section>
        <h3>Reproducibility fields</h3>
        <ul>
          <li>Method version and report creation time.</li>
          <li>Grading-system label, maximum GPA, and retake policy.</li>
          <li>Source URLs and last-reviewed date.</li>
          <li>Confidence notes and unresolved issues.</li>
          <li>Planning disclaimer and responsibility boundary.</li>
        </ul>
      </section>
      <section class="editorial-cta">
        <div><h3>Create the live report</h3><p>Your local academic record becomes the report; no raw transcript text is included.</p></div>
        <a class="btn btn--primary" href="${routeHref("academic-report")}">Open Academic Journey Report</a>
      </section>`,
    related: standardRelated,
  },
};

async function renderPolicyDirectory() {
  const response = await fetch("/data/university-policies.json");
  if (!response.ok) throw new Error("University policy data is unavailable.");
  const data = await response.json();
  const policies = Object.entries(data.policies || {});
  const countries = new Set(policies.map(([, policy]) => policy.country));
  return pageShell({
    eyebrow: "Citable academic data resource",
    title: "Verified university GPA policy sources",
    dek: "A versioned directory of distinct university GPA scales, formulas, scope limits, review dates, and official primary sources. It is intentionally small: a university is added only after its policy is verified.",
    body: `
      <section class="policy-summary">
        <div><span>Published policies</span><strong>${policies.length}</strong></div>
        <div><span>Countries covered</span><strong>${countries.size}</strong></div>
        <div><span>Review date</span><strong>${escapeHtml(data.reviewedAt)}</strong></div>
        <div><span>Method version</span><strong>2026.07.29</strong></div>
      </section>
      <section>
        <h3>Source directory</h3>
        <div class="record-table-wrap">
          <table class="intl-table table--wide">
            <thead><tr><th>Institution</th><th>Country</th><th>Scale</th><th>Status</th><th>Official sources</th></tr></thead>
            <tbody>${policies.map(([routeId, policy]) => `
              <tr>
                <td><a href="${policy.pageUrl ? escapeHtml(policy.pageUrl) : routeHref(routeId)}" ${policy.pageUrl ? 'target="_blank" rel="noopener noreferrer"' : ""}><strong>${escapeHtml(policy.name)}</strong></a><br><small>${escapeHtml(policy.catalogYear)}</small></td>
                <td>${escapeHtml(policy.country)}</td>
                <td>${escapeHtml(policy.maxGpa)}</td>
                <td>${escapeHtml(policy.verification)}</td>
                <td>${policy.sources.map((source) => sourceLink(source.url, source.label)).join("<br>")}</td>
              </tr>`).join("")}</tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>Machine-readable dataset</h3>
        <p>The same reviewed fields are available as a public JSON file for reproducible checking: institution, country, catalog scope, maximum GPA, formula, grade points, policy notes, verification label, and source URLs.</p>
        <p><a class="btn btn--ghost" href="/data/university-policies.json" download>Download university policy JSON</a></p>
      </section>
      <section>
        <h3>Open GPA formula validation pack</h3>
        <p>Developers, advisers, and reviewers can reproduce the published GPA, CGPA, retake, weighted-grade, and excluded-course examples with versioned expected outputs.</p>
        <p class="button-row">
          <a class="btn btn--ghost" href="/data/gpa-formula-validation-pack.json" download>Download validation JSON</a>
          <a class="btn btn--ghost" href="/data/gpa-formula-validation-pack.csv" download>Download validation CSV</a>
        </p>
        <p><small>Version 2026.07.30 · CC BY 4.0 · cite InstantGPA for the validation transcription and the applicable institution for its official policy.</small></p>
      </section>
      <section>
        <h3>How to cite this resource</h3>
        <p><strong>InstantGPA. “Verified University GPA Policy Sources.” Method version 2026.07.29, reviewed ${escapeHtml(data.reviewedAt)}. https://instantgpa.com/resources/university-gpa-policy-directory</strong></p>
        <p>Cite the university’s official policy as the primary authority. Cite this directory only for InstantGPA’s transcription, comparison, review date, or methodology.</p>
      </section>
      <section>
        <h3>Coverage and quality limits</h3>
        <ul>
          <li>Coverage is not a claim that these policies apply to every faculty, programme, degree level, or catalog year.</li>
          <li>No page is generated from a university name alone; every published entry has distinct policy content and an official source.</li>
          <li>International conversion remains an estimate unless the receiving institution or credential evaluator states otherwise.</li>
          <li>Corrections require a current official source and are documented with a new review date.</li>
        </ul>
      </section>`,
    related: [
      ["international-systems", "Browse international grading systems"],
      ["editorial-policy", "Read the publication gate"],
      ["corrections", "Submit a source-backed correction"],
      ["guides/international-gpa-conversion", "Understand conversion limits"],
    ],
  });
}

async function renderUniversity(routeId) {
  const response = await fetch("/data/university-policies.json");
  if (!response.ok) throw new Error("University policy data is unavailable.");
  const data = await response.json();
  const policy = data.policies?.[routeId];
  if (!policy) throw new Error("This university policy has not been published.");
  return pageShell({
    eyebrow: `${policy.country} · ${policy.verification}`,
    title: `${policy.name} GPA calculator and grading policy`,
    dek: `${policy.scope} Always confirm the current official record before making an academic decision.`,
    body: `
      <section class="policy-summary">
        <div><span>Maximum GPA</span><strong>${policy.maxGpa}</strong></div>
        <div><span>Verification</span><strong>${escapeHtml(policy.verification)}</strong></div>
        <div><span>Policy scope</span><strong>${escapeHtml(policy.catalogYear)}</strong></div>
        <div><span>Last reviewed</span><strong>${REVIEW_DATE}</strong></div>
      </section>
      <section>
        <h3>Calculation basis</h3>
        <div class="formula-card"><p><strong>${escapeHtml(policy.formula)}</strong></p></div>
        <p>${escapeHtml(policy.scope)}</p>
      </section>
      <section>
        <h3>Published grade points</h3>
        <div class="record-table-wrap">
          <table class="intl-table table--standard">
            <thead><tr><th>Grade</th><th>Grade points</th></tr></thead>
            <tbody>${policy.grades.map(([grade, points]) => `<tr><td>${escapeHtml(grade)}</td><td>${escapeHtml(points)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>Policy notes and limitations</h3>
        <ul>${policy.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
      </section>
      <section class="editorial-cta">
        <div><h3>Calculate with your exact record</h3><p>Select the closest verified preset, then adjust it only when the cited university policy requires a different value.</p></div>
        <a class="btn btn--primary" href="${routeHref("home")}">Review GPA settings</a>
      </section>`,
    sources: policy.sources,
    related: [
      ["international-systems", "Browse international systems"],
      ["gpa-calculator", "GPA calculator"],
      ["guides/international-gpa-conversion", "International conversion guide"],
      ["editorial-policy", "Source policy"],
    ],
  });
}

export async function mount(container, routeId) {
  try {
    if (routeId === "resources/university-gpa-policy-directory") {
      container.innerHTML = await renderPolicyDirectory();
      return;
    }
    if (routeId.startsWith("universities/")) {
      container.innerHTML = await renderUniversity(routeId);
      return;
    }
    const page = PAGES[routeId];
    if (!page) throw new Error("This guide has not been published.");
    container.innerHTML = pageShell(page);
  } catch (error) {
    container.innerHTML = `<section class="tool-card"><h2>Guide unavailable</h2><p class="result-note result-note--warn">${escapeHtml(error.message)}</p></section>`;
  }
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
