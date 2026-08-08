import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("homepage uses the supplied Modernist gateway and starts the connected academic workflow", async () => {
  const [app, gradingEngine, approvedTemplate, homePortal, serviceWorker] = await Promise.all([
    read("static-site/assets/app.js"),
    read("static-site/assets/grading-engine.js"),
    read("static-site/approved-template.html"),
    read("static-site/assets/home-portal.js"),
    read("static-site/service-worker.js"),
  ]);

  assert.match(app, /class="home-stage home-stage--portal"/);
  assert.match(app, /Complete academic setup and review your transcript before calculating/);
  assert.match(app, /class="home-setup-panel"/);
  assert.match(app, /onConfirmed: \(\) => routePath\("transcript-import"\)/);
  assert.doesNotMatch(gradingEngine, /GENERIC_SCALES|Generic 5\.0|Generic 10\.0/);
  assert.doesNotMatch(serviceWorker, /quick-gpa\.js/);
  assert.match(app, /class="home-tool-card" data-tool-search=/);
  assert.match(app, /homeToolSearchEmpty/);
  assert.match(app, /visibleCount \+= 1/);
  assert.match(app, /firstVisible\.click\(\)/);
  assert.match(app, /flowTitle: "Import → Calculate → Audit → Plan"/);
  assert.match(app, /href="\$\{routeHref\("degree-audit"\)\}"/);
  assert.match(app, /class="resume-tool-link"/);
  assert.match(approvedTemplate, /home-portal\.js\?v=20260807-bilingual/);
  assert.match(approvedTemplate, /modernist-v85\.css/);
  assert.match(approvedTemplate, /Four free tools, ready now/);
  assert.doesNotMatch(approvedTemplate, /id="calcRoot"|class="app-workspace/);
  assert.doesNotMatch(approvedTemplate, /approved-v84(?:-academic-setup)?\.js/);
  assert.match(homePortal, /AcademicProfile\.get\(\)/);
  assert.match(homePortal, /migrateLegacyDrafts/);
  assert.doesNotMatch(homePortal, /import \{ AcademicRecord \}|renderPortalSummary|globalToolSelect/);
  assert.doesNotMatch(homePortal, /renderGPA|renderCGPA|renderConvert/);
});

test("homepage navigation stays physically right-aligned in Arabic", async () => {
  const css = await read("static-site/assets/modernist-v85.css");
  assert.match(css, /\[dir="rtl"\] \.modern-nav\s*\{\s*direction:\s*ltr;/);
  assert.match(css, /\[dir="rtl"\] \.modern-nav-links\s*\{\s*margin-left:\s*auto;\s*margin-right:\s*0;/);
});

test("student-first workspace adds simple guidance and responsive table labels", async () => {
  const [app, html, css, navyGoldCss, gpa] = await Promise.all([
    read("static-site/assets/app.js"),
    read("static-site/index.html"),
    read("static-site/assets/student-ui-v43.css"),
    read("static-site/assets/navy-gold-v50.css"),
    read("static-site/assets/gpa-calculator.js"),
  ]);

  assert.match(html, /app-bundle\.css/);
  assert.match(app, /class="student-tool-guide"/);
  assert.match(app, /installStudentTableEnhancer/);
  assert.match(app, /cell\.dataset\.label = headings\[index\]/);
  assert.match(css, /\.student-table tbody td::before/);
  assert.match(css, /content: attr\(data-label\)/);
  assert.match(css, /\.student-cell__label/);
  assert.match(gpa, /tool-host--gpa-entry/);
  assert.match(gpa, /gpa-entry-workspace/);
  assert.match(css, /\.tool-host\.tool-host--gpa-entry/);
  assert.match(css, /width: 92vw/);
  assert.match(navyGoldCss, /\.tool-host\.tool-host--gpa-entry/);
  assert.match(navyGoldCss, /width: 88vw/);
  assert.match(navyGoldCss, /\.gpa-calculator-grid/);
  assert.match(gpa, /class="gpa-result-rail"/);
});

test("first-run academic setup gives the table space and uses a compact two-row field layout", async () => {
  const css = await read("static-site/assets/home-compact-v51.css");

  assert.match(
    css,
    /\.home-stage\.home-stage--portal[\s\S]*grid-template-columns: minmax\(210px, \.32fr\) minmax\(760px, 1\.68fr\)/,
  );
  assert.match(
    css,
    /\.home-stage--portal \.context-grid[\s\S]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    css,
    /\.context-grid \.field:nth-child\(1\)[\s\S]*grid-column: span 1/,
  );
});

test("homepage removes the duplicated connected workflow and keeps tight vertical spacing", async () => {
  const [app, css] = await Promise.all([
    read("static-site/assets/app.js"),
    read("static-site/assets/home-compact-v51.css"),
  ]);

  assert.doesNotMatch(app, /class="home-section workflow-section"/);
  assert.match(css, /\.home-section\s*\{\s*margin-top: 20px;/);
  assert.match(css, /\.student-goal-grid[\s\S]*gap: 6px/);
});

test("new visitors keep their deep-link destination through academic setup", async () => {
  const app = await read("static-site/assets/app.js");

  assert.match(app, /renderSetupOnly\(TOOLS\[r\] \? r : null\)/);
  assert.match(app, /setupReturnRoute = r/);
  assert.match(app, /t\("setup\.continueTo", \{ tool: requestedToolTitle \}\)/);
  assert.match(app, /routePath\(setupReturnRoute \|\| "transcript-import"\)/);
});

test("academic setup keeps college, department, and scale editing visible", async () => {
  const profile = await read("static-site/assets/academic-profile.js");
  const css = await read("static-site/assets/workspace-compact-v53.css");

  assert.doesNotMatch(profile, /<details class="advanced-setup">/);
  assert.match(profile, /id="setupCollege"/);
  assert.match(profile, /id="setupDepartment"/);
  assert.match(profile, /COLLEGE \/ FACULTY <b/);
  assert.match(profile, /DEPARTMENT \/ PROGRAM <b/);
  assert.match(profile, /Saving academic profile/);
  assert.match(profile, /class="grading-scale-inline"/);
  assert.doesNotMatch(profile, /advanced-setup--always-open/);
  assert.match(css, /\.grading-scale-inline/);
  assert.match(profile, /async function selectSuggestedSystem\(\)/);
  assert.match(profile, /await selectSuggestedSystem\(\)/);
  assert.match(profile, /continueLabel = "Confirm and continue"/);
  assert.match(profile, /id="toggleScaleEdit"/);
  assert.match(profile, /readonly aria-readonly/);
  assert.match(profile, /restoreFocusId/);
  assert.match(profile, /focus\(\{ preventScroll: true \}\)/);
});

test("transcript review groups semesters, separates issue counts, and provides bulk scopes plus a mobile drawer", async () => {
  const [transcript, css] = await Promise.all([
    read("static-site/assets/transcript-import.js"),
    read("static-site/assets/product-flow-v60.css"),
  ]);

  assert.match(transcript, /class="transcript-issue-center"/);
  assert.match(transcript, /unknownGrades/);
  assert.match(transcript, /uncertain columns/);
  assert.match(transcript, /class="semester-review-card"/);
  assert.match(transcript, /id="tiBulkScope"/);
  assert.match(transcript, /Courses needing review/);
  assert.match(transcript, /class="course-detail-drawer/);
  assert.match(css, /\.transcript-review-table thead th[\s\S]*position: sticky/);
  assert.match(css, /\.transcript-review-table \.review-course-cell[\s\S]*position: sticky/);
  assert.match(css, /\.workspace-nav[\s\S]*position: fixed !important/);
  assert.match(css, /grid-template-columns: repeat\(4, 1fr\) !important/);
});

test("the free workflow proceeds from transcript to GPA and ends at CGPA", async () => {
  const [app, gpa, transcript, transcriptReader, scenario] = await Promise.all([
    read("static-site/assets/app.js"),
    read("static-site/assets/gpa-calculator.js"),
    read("static-site/assets/transcript-import.js"),
    read("static-site/assets/transcript-file-reader.js"),
    read("static-site/assets/scenario-lab.js"),
  ]);

  assert.doesNotMatch(app, /class="pro-header-link"/);
  assert.doesNotMatch(app, /Meet your Academic Twin/);
  assert.match(app, /Your Academic Command Center/);
  assert.match(gpa, /Continue to CGPA/);
  assert.match(gpa, /Array\.from\(\{ length: 6 \}/);
  assert.match(transcript, /Continue to GPA/);
  assert.match(transcriptReader, /FREE_MAX_PDF_PAGES = 3/);
  assert.match(transcriptReader, /PREMIUM_MAX_PDF_PAGES = 30/);
  assert.match(gpa, /registered\.length[\s\S]*\? imported\.filter[\s\S]*: imported/);
  assert.match(scenario, /scenarioLabScenarios:v2/);
  assert.match(scenario, /Saved comparisons/);
});

test("workspace strips align to the tool table and the header uses the four-step workflow", async () => {
  const [app, html, css, verifiedCss, experienceCss] = await Promise.all([
    read("static-site/assets/app.js"),
    read("static-site/index.html"),
    read("static-site/assets/workspace-compact-v53.css"),
    read("static-site/assets/verified-layout-v54.css"),
    read("static-site/assets/experience-v57.css"),
  ]);

  assert.match(app, /class="header-flow-nav"/);
  assert.doesNotMatch(app, /<nav class="header-nav"/);
  assert.match(app, /class="\$\{isOverview \? "workspace-overview-shell" : `workspace-tool-frame/);
  assert.match(css, /\.workspace-tool-frame > \.student-workspace-head/);
  assert.match(css, /\.workspace-tool-frame \.student-tool-guide/);
  assert.match(css, /\.workspace-tool-frame \.tool-host/);
  assert.match(html, /app-bundle\.css/);
  assert.match(app, /alignWorkspaceStripsToContent/);
  assert.match(app, /--workspace-strip-width/);
  assert.match(verifiedCss, /var\(--workspace-strip-width, 100%\)/);
  assert.match(html, /app-bundle\.css/);
  assert.match(experienceCss, /\.workspace-tool-frame > \.student-workspace-head,[\s\S]*display: none/);
});

test("all data-entry controls stay compact without clipping the selected label", async () => {
  const [html, css, sizing] = await Promise.all([
    read("static-site/index.html"),
    read("static-site/assets/fit-controls-v55.css"),
    read("static-site/assets/fit-controls-v55.js"),
  ]);

  assert.match(html, /app-bundle\.css/);
  assert.match(html, /fit-controls-v55\.js/);
  assert.match(css, /width: var\(--fit-control-width\) !important/);
  assert.match(css, /max-width: 100% !important/);
  assert.match(sizing, /Array\.from\(control\.options\)/);
  assert.match(sizing, /option\.label \|\| option\.textContent/);
  assert.doesNotMatch(sizing, /control\.selectedOptions\[0\]/);
  assert.doesNotMatch(sizing, /labels\.flatMap/);
  assert.match(sizing, /return labels\.length \? labels/);
  assert.match(sizing, /control\.readOnly/);
  assert.match(sizing, /SELECT_ARROW_GUTTER = 38/);
  assert.match(sizing, /context\.measureText\(value\)\.width/);
  assert.match(sizing, /new MutationObserver/);
  assert.doesNotMatch(sizing, /document\.addEventListener\("input"/);
});

test("the four-step header and account remain reachable on mobile without a hamburger menu", async () => {
  const [app, css, html] = await Promise.all([
    read("static-site/assets/app.js"),
    read("static-site/assets/experience-v57.css"),
    read("static-site/index.html"),
  ]);

  assert.doesNotMatch(app, /aria-hidden="true">☰<\/span>/);
  assert.match(app, /class="header-flow-nav"/);
  assert.match(app, /class="icon-link"/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.header-flow-nav/);
  assert.match(css, /\.student-table \.fit-control-width/);
  assert.match(html, /app-bundle\.css/);
});

test("account keeps the compact overview, paid checkout identity, owner gate, and command-center entry", async () => {
  const [app, account, dashboard, commandCenter, css] = await Promise.all([
    read("static-site/assets/app.js"),
    read("static-site/assets/account-panel.js"),
    read("static-site/assets/dashboard.js"),
    read("static-site/assets/academic-command-center.js"),
    read("static-site/assets/overview-journey-v52.css"),
  ]);

  assert.match(app, /const isOverview = showAccount \|\| showDashboard/);
  assert.match(app, /student-workspace-head--overview/);
  assert.match(app, /workspace-overview-frame/);
  assert.match(account, /renderAccountSignIn\(accountHost, container, subscribeMode, c\)/);
  assert.match(account, /ownerGoogleSignIn/);
  assert.match(account, /Continue with Google/);
  assert.match(account, /ownerEmailSignIn/);
  assert.match(account, /Create your paid Premium account/);
  assert.match(account, /Pay with PayPal or card/);
  assert.match(account, /Premium starts only after PayPal/);
  assert.match(account, /accountEmailSignUp/);
  assert.doesNotMatch(account, /mountBackupSection\(backupHost\)/);
  assert.match(css, /\.student-workspace-head--overview/);
  assert.match(css, /\.workspace-overview-frame \.account-summary \.dash-grid/);
  assert.match(dashboard, /academic-command-center\.js/);
  assert.match(commandCenter, /ACADEMIC COMMAND CENTER/);
  assert.match(commandCenter, /class="command-status-banner/);
  assert.match(account, /Open Academic Command Center/);
});

test("transcript onboarding includes a local sample with no upload or sign-up", async () => {
  const transcript = await read("static-site/assets/transcript-import.js");

  assert.match(transcript, /const SAMPLE_TRANSCRIPT/);
  assert.match(transcript, /id="tiLoadSample"/);
  assert.match(transcript, /Sample transcript · local preview/);
  assert.match(transcript, /parseTranscriptText\(rawText\)/);
});

test("the final experience layer uses one calm token system and keeps tool actions above repeated guidance", async () => {
  const css = await read("static-site/assets/experience-v57.css");

  assert.match(css, /--ig57-navy:/);
  assert.match(css, /--ig57-canvas:/);
  assert.match(css, /\.workspace-tool-frame > \.student-workspace-head,[\s\S]*display: none/);
  assert.match(css, /font-size: 12px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("transcript journey starts with the decision example and renders a five-node workflow graph", async () => {
  const [editorial, css] = await Promise.all([
    read("static-site/assets/editorial-content.js"),
    read("static-site/assets/overview-journey-v52.css"),
  ]);

  const journeyStart = editorial.indexOf('"transcript-to-graduation-plan":');
  const journeyEnd = editorial.indexOf('"guides/gpa-calculation-example":', journeyStart);
  const journey = editorial.slice(journeyStart, journeyEnd);

  assert.ok(journey.indexOf("Example decision path") < journey.indexOf("The complete five-stage workflow"));
  assert.match(journey, /class="journey-flow"/);
  assert.equal((journey.match(/class="journey-node"/g) || []).length, 5);
  assert.match(journey, /showByline: false/);
  assert.match(journey, /showAside: false/);
  assert.match(css, /\.journey-flow/);
  assert.match(css, /\.journey-guardrails/);
});

test("account and Premium entry do not force academic setup before sign-in", async () => {
  const app = await read("static-site/assets/app.js");
  const accountGate = app.indexOf('if (r === "account")');
  const freeJourney = app.indexOf("// The free journey");
  const genericProfileGate = app.indexOf("if (!profile)", freeJourney);

  assert.ok(accountGate > -1 && genericProfileGate > -1 && accountGate < genericProfileGate);
  assert.match(app, /paywall\("signed_out"\)/);
});

test("localized pricing never exposes a raw server error", async () => {
  const pricing = await read("static-site/assets/pricing-page.js");

  assert.doesNotMatch(pricing, /data\?\.error \|\| c\.configuring/);
  assert.match(pricing, /data\?\.error \? c\.loadError : c\.configuring/);
});
