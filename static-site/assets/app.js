// app.js — the main controller. Wires together academic-profile, the
// grading engine, localization, and every tool module, but contains no
// calculation or storage logic itself.
//
// ROUTING: real paths via the History API — /gpa-calculator,
// /dashboard, etc. — so each tool has a real, shareable, crawlable URL
// with its own <title>/meta (see setPageMeta below). Internal links use
// routeHref(id) to produce the real path, and a single delegated click
// handler upgrades a plain left-click on any of them into pushState
// navigation (no full reload) while leaving modifier-key clicks,
// middle-click, and external/non-app links to behave normally.
//
// PERFORMANCE: every tool module (including the original four) is loaded
// with a dynamic import() only when its route is actually visited, not
// listed as a static top-of-file import. That means visiting the setup
// screen, or any single tool, only ever downloads and parses that one
// tool's JS — not all twelve. The account/cloud-sync code and the
// Firebase Auth SDK it can load follows the same rule (see cloud-sync.js).

import { SUPPORTED_LANGUAGES, loadLanguage, getSavedLanguage, currentLanguage, t, applyStaticTranslations } from "./localization.js";
import { AcademicProfile, mountSetup } from "./academic-profile.js?v=20260731-v57-focus-safe-scale";
import { GradingEngine } from "./grading-engine.js";
import { analyticsConsent, setAnalyticsConsent, track } from "./analytics.js";
import { checkEntitlement, paywall } from "./entitlement.js";
import { AcademicRecord } from "./academic-record.js";
import { FreeWorkflow } from "./free-workflow.js";
import { installAcademicCloudRecordSync } from "./academic-cloud-record.js";
import { Storage } from "./storage.js";

const SITE_ORIGIN = "https://instantgpa.com";
const LANGUAGE_CODES = new Set(SUPPORTED_LANGUAGES.map((language) => language.code));
const LAST_TOOL_KEY = "lastTool";
let setupReturnRoute = "transcript-import";

installAcademicCloudRecordSync();
let tableEnhancerObserver = null;
let commandPaletteKeyboardInstalled = false;

const STUDENT_COPY = {
  en: {
    brand: "GPA made simple",
    choose: "Your academic path",
    chooseLead: "Import once. Calculate accurately. Audit progress. Plan what’s next.",
    setup: "First, tell us where you study",
    setupNote: "This helps us use the right GPA scale. You can change it later.",
    easy: "3 easy steps",
    add: "Add your details",
    check: "See the result",
    decide: "Try another plan",
    workspace: "Your study tools",
    workspaceNote: "Choose one task at a time. Your courses stay connected across every tool.",
    start: "Start",
    flowTitle: "Import → Calculate → Audit → Plan",
    flowNote: "One academic record. Four connected steps.",
    goalGpa: "Calculate",
    goalTranscript: "Import",
    goalAudit: "Audit",
    goalTarget: "Target GPA",
    goalPlanner: "Plan",
    reassurance: "Set up once · Import once · Keep every calculation connected",
  },
  ar: {
    brand: "معدلك ببساطة",
    choose: "مسارك الأكاديمي",
    chooseLead: "استورد مرة، احسب بدقة، راجع التقدم، ثم خطط للخطوة التالية.",
    setup: "أولًا، أخبرنا أين تدرس",
    setupNote: "يساعدنا هذا على استخدام سلم المعدل الصحيح، ويمكنك تغييره لاحقًا.",
    easy: "3 خطوات بسيطة",
    add: "أدخل بياناتك",
    check: "شاهد النتيجة",
    decide: "جرّب خطة أخرى",
    workspace: "أدواتك الدراسية",
    workspaceNote: "اختر مهمة واحدة في كل مرة. تظل مقرراتك متصلة بكل الأدوات.",
    start: "ابدأ من هنا",
    flowTitle: "استيراد ← حساب ← مراجعة ← تخطيط",
    flowNote: "سجل أكاديمي واحد وأربع خطوات مترابطة.",
    goalGpa: "احسب",
    goalTranscript: "استورد",
    goalAudit: "راجع",
    goalPlanner: "خطّط",
    reassurance: "إعداد مرة واحدة · استيراد مرة واحدة · كل الحسابات مترابطة",
  },
};

function studentCopy() {
  return STUDENT_COPY[currentLanguage()] || STUDENT_COPY.en;
}

function rememberLastTool(toolId) {
  Storage.set(LAST_TOOL_KEY, toolId);
}

function lastTool() {
  const toolId = Storage.get(LAST_TOOL_KEY, "");
  return toolId && TOOLS[toolId] ? toolId : "";
}

// Route id -> { titleKey, blurbKey, group, load }
// `load` returns the tool module; it's only ever called once the route is
// actually visited (see mountTool below), which is what makes this lazy.
const TOOLS = {
  "gpa-calculator": { titleKey: "tools.gpa.title", blurbKey: "tools.gpa.blurb", group: "core", load: () => import("./gpa-calculator.js?v=20260730-navy-gold-table-workspace") },
  "cgpa-calculator": { titleKey: "tools.cgpa.title", blurbKey: "tools.cgpa.blurb", group: "core", load: () => import("./cgpa-calculator.js") },
  "grade-converter": { titleKey: "tools.converter.title", blurbKey: "tools.converter.blurb", group: "core", proOnly: true, load: () => import("./grade-converter.js") },
  "weighted-grade": { titleKey: "tools.weighted.title", blurbKey: "tools.weighted.blurb", group: "advanced", proOnly: true, load: () => import("./weighted-grade-calculator.js") },
  "retake-calculator": { titleKey: "tools.retake.title", blurbKey: "tools.retake.blurb", group: "advanced", proOnly: true, load: () => import("./retake-calculator.js") },
  "graduation-predictor": { titleKey: "tools.graduation.title", blurbKey: "tools.graduation.blurb", group: "advanced", proOnly: true, load: () => import("./graduation-predictor.js") },
  "scenario-lab": { titleKey: "tools.scenario.title", blurbKey: "tools.scenario.blurb", group: "advanced", proOnly: true, load: () => import("./scenario-lab.js") },
  "trust": { titleKey: "tools.trust.title", blurbKey: "tools.trust.blurb", group: "info", load: () => import("./trust-methodology.js") },
  "international-systems": { titleKey: "tools.international.title", blurbKey: "tools.international.blurb", group: "info", load: () => import("./international-systems.js") },
  "transcript-import": { titleKey: "tools.transcript.title", blurbKey: "tools.transcript.blurb", group: "records", load: () => import("./transcript-import.js") },
  "degree-audit": { titleKey: "tools.degreeAudit.title", blurbKey: "tools.degreeAudit.blurb", group: "records", proOnly: true, load: () => import("./degree-audit.js") },
  "planning": { titleKey: "tools.planning.title", blurbKey: "tools.planning.blurb", group: "records", proOnly: true, load: () => import("./planning.js") },
  "academic-report": { titleKey: "tools.academicReport.title", blurbKey: "tools.academicReport.blurb", group: "records", proOnly: true, load: () => import("./academic-report.js") },
  "pro-workspace": {
    title: "InstantGPA Pro",
    blurb: "Subscriber-only semester, syllabus evidence, Academic Twin, Undo, policy, transfer, institutional, and adviser workflows.",
    group: "pro",
    load: () => import("./pro-workspace.js"),
  },
};

const toolTitle = (tool) => tool.title || t(tool.titleKey);
const toolBlurb = (tool) => tool.blurb || t(tool.blurbKey);

const CANONICAL_TOOL_ROUTES = {
  "gpa-calculator": "college-gpa-calculator",
  "grade-converter": "international-gpa-converter",
  "retake-calculator": "gpa-retake-calculator",
  "graduation-predictor": "target-gpa-calculator",
  "transcript-import": "transcript-gpa-calculator",
  "degree-audit": "degree-audit-graduation-planner",
};
const TOOL_ROUTE_ALIASES = Object.fromEntries(
  Object.entries(CANONICAL_TOOL_ROUTES).map(([toolId, routeId]) => [routeId, toolId]),
);
const resolveToolRoute = (routeId) => TOOL_ROUTE_ALIASES[routeId] || routeId;

const PUBLIC_CONTENT = {
  "instantgpa-pro": {
    title: "InstantGPA Pro: Academic Twin, Syllabus Chat & Decision Simulator",
    description: "Compare InstantGPA Pro tools for live semester tracking, cited syllabus chat, Academic Undo scenarios, policy sources, transfer, credit conversion, and adviser review.",
  },
  "transcript-to-graduation-plan": {
    title: "From Transcript to GPA, Degree Audit & Graduation Plan",
    description: "A complete, source-backed workflow from transcript review to an adviser-ready academic report.",
  },
  "guides/gpa-calculation-example": {
    title: "How to Calculate GPA: Formula & Worked Example",
    description: "Quality points, excluded-course rules, rounding, and a reproducible four-course example.",
  },
  "guides/retake-policy-example": {
    title: "Retake GPA Policies: Replacement, Highest, Average & Both",
    description: "One worked example showing why the official university retake policy changes the result.",
  },
  "guides/international-gpa-conversion": {
    title: "International GPA Conversion: Country & University Guide",
    description: "How to use institutional grading sources without pretending that one universal conversion exists.",
  },
  "guides/3-0-gpa": {
    title: "How to Get a 3.0 GPA",
    description: "What a 3.0 GPA means for grad school and honors eligibility, and the grades needed to reach it.",
  },
  "guides/3-5-gpa": {
    title: "How to Get a 3.5 GPA",
    description: "What a 3.5 GPA unlocks and how to calculate the grades you need with a worked example.",
  },
  "guides/3-7-gpa": {
    title: "How to Get a 3.7 GPA",
    description: "What a 3.7 GPA typically unlocks and how much one lower grade can cost you.",
  },
  "guides/4-0-gpa": {
    title: "How to Get and Keep a 4.0 GPA",
    description: "How fragile a 4.0 GPA is as credits accumulate, and whether a perfect GPA is still reachable.",
  },
  "about": {
    title: "About InstantGPA & Its Academic Purpose",
    description: "The people, purpose, responsibility, and limits behind InstantGPA.",
  },
  "editorial-policy": {
    title: "Editorial, Source & Academic Review Policy",
    description: "How official sources are selected, verified, dated, reviewed, and corrected.",
  },
  "corrections": {
    title: "Corrections & University Policy Updates",
    description: "How to report a source-backed policy correction and how changes are documented.",
  },
  "resources/academic-adviser-report": {
    title: "Academic Adviser Report Template: GPA to Graduation",
    description: "The evidence, calculations, privacy controls, and handoff fields in an Academic Journey Report.",
  },
  "resources/university-gpa-policy-directory": {
    title: "Verified University GPA Policy Sources & Dataset",
    description: "A dated directory of university GPA scales, formulas, scope notes, and official primary sources.",
  },
  "universities/ucla/gpa-calculator": {
    title: "UCLA GPA Calculator & Official Grade Points",
    description: "A source-backed university grading page using UCLA Registrar policies.",
  },
  "universities/university-of-texas-at-austin/gpa-calculator": {
    title: "UT Austin GPA Calculator & Official Grade Policy",
    description: "A source-backed university grading page using UT Austin Registrar policies.",
  },
  "universities/universiti-malaya/gpa-calculator": {
    title: "Universiti Malaya GPA Calculator & Grading Scheme",
    description: "A source-backed university grading page using the 2025/2026 official regulations.",
  },
  "universities/aastmt/gpa-calculator": {
    title: "AASTMT GPA Calculator & College Grading Policies",
    description: "A source-backed grading page that preserves college and programme differences.",
  },
  "universities/king-saud-university/gpa-calculator": {
    title: "King Saud University GPA Calculator on a 5.0 Scale",
    description: "A source-backed university grading page using official KSU regulations.",
  },
  "universities/united-arab-emirates-university/gpa-calculator": {
    title: "UAEU GPA Calculator & Official 4.0 Grade Policy",
    description: "A source-backed university grading page using UAEU policy documents.",
  },
};
const ENGLISH_ONLY_ROUTE_IDS = new Set([...Object.keys(PUBLIC_CONTENT), "shared-report"]);

const ENGLISH_SEO_META = {
  home: {
    title: "GPA Calculator, Transcript Import & Graduation Planner | InstantGPA",
    description: "Calculate GPA and CGPA with credits and custom scales, import your transcript, audit degree requirements, test retakes, and plan graduation in one connected academic workspace.",
    h1: "GPA Calculator, Transcript Import and Graduation Planning",
    path: "/",
  },
  "college-gpa-calculator": {
    title: "Free College GPA Calculator with Credits | InstantGPA",
    description: "Enter course grades, credit hours, and a 4.0, 5.0, 10.0, or custom scale to calculate weighted semester and college GPA with quality points.",
    h1: "College GPA Calculator with Credits",
    path: "/college-gpa-calculator",
  },
  "cgpa-calculator": {
    title: "Cumulative GPA & CGPA Calculator | InstantGPA",
    description: "Enter your previous cumulative GPA and completed credits, then add current course grades and credits to calculate an updated CGPA.",
    h1: "Cumulative GPA and CGPA Calculator",
    path: "/cgpa-calculator",
  },
  "transcript-gpa-calculator": {
    title: "Transcript GPA Calculator & Course Import | InstantGPA",
    description: "Import XLSX, PDF, image, CSV, TSV, or pasted course data, review detected grades and credits, then calculate transcript GPA from approved rows.",
    h1: "Transcript GPA Calculator and Course Import",
    path: "/transcript-gpa-calculator",
  },
  "degree-audit-graduation-planner": {
    title: "Degree Audit & Graduation Planner | InstantGPA",
    description: "Use reviewed transcript courses and degree requirements to track completed, in-progress, unassigned, and remaining credits before planning graduation.",
    h1: "Degree Audit and Graduation Planner",
    path: "/degree-audit-graduation-planner",
  },
  "target-gpa-calculator": {
    title: "Target GPA Calculator: What GPA Do I Need? | InstantGPA",
    description: "Enter current GPA, completed credits, remaining credits, and a target GPA to calculate the average GPA needed and whether the target is reachable.",
    h1: "Target GPA Calculator",
    path: "/target-gpa-calculator",
  },
  "gpa-retake-calculator": {
    title: "GPA Retake & Grade Replacement Calculator | InstantGPA",
    description: "Enter current CGPA, credits, old and new grades, and a retake policy to estimate your updated cumulative GPA after repeating a course.",
    h1: "GPA Retake and Grade Replacement Calculator",
    path: "/gpa-retake-calculator",
  },
  "international-gpa-converter": {
    title: "International GPA & Grading Scale Converter | InstantGPA",
    description: "Select source and target grading systems, then enter a grade or percentage to estimate the equivalent result across international grading scales.",
    h1: "International GPA and Grading Scale Converter",
    path: "/international-gpa-converter",
  },
  planning: {
    title: "Graduation Planner from Transcript & Degree Requirements | InstantGPA",
    description: "Build a semester-by-semester graduation plan from transcript courses, prerequisites, remaining requirements, and credit limits.",
    path: "/planning",
  },
  "academic-report": {
    title: "Academic Journey Report: GPA, Degree Audit & Plan | InstantGPA",
    description: "Create one reproducible academic report with GPA calculations, degree-audit progress, graduation plan, sources, and confidence notes.",
    path: "/academic-report",
  },
  "international-systems": {
    title: "International GPA Calculator by Country & University | InstantGPA",
    description: "Explore source-backed grading scales by country and university, see verification status, and confirm the official policy before calculating GPA.",
    path: "/international-systems",
  },
  trust: {
    title: "GPA Calculation Methodology, Sources & Privacy | InstantGPA",
    description: "Review formulas, rounding, course-status rules, OCR confidence, university-source levels, privacy, limitations, and method changes.",
    path: "/trust",
  },
  "pro-workspace": {
    title: "InstantGPA Pro Academic Operating System",
    description: "Private subscriber workspace for live semester tracking, syllabus evidence, Academic Twin and Undo scenarios, policy sources, transfer, translation, institutional tools, and adviser sharing.",
    path: "/pro-workspace",
  },
  pricing: {
    title: "InstantGPA Plans: Free Tools & PayPal Premium",
    description: "Compare anonymous Free tools with paid InstantGPA Premium and subscribe securely through PayPal.",
    h1: "InstantGPA Plans",
    path: "/pricing",
  },
};

const HOME_POPULAR_TOOLS = [
  "transcript-import",
  "gpa-calculator",
  "cgpa-calculator",
  "grade-converter",
  "weighted-grade",
  "retake-calculator",
  "graduation-predictor",
  "planning",
  "academic-report",
];

const els = {};

function cacheEls() {
  els.app = document.getElementById("app");
}

// ---------- Routing (see file-top comment) ----------
//
// This always uses real paths via the History API. There's no local-file
// fallback: this app is ES modules throughout, and Chrome (like every
// major browser) refuses to load ES modules from a file:// origin at
// all, regardless of routing style — confirmed directly, not assumed.
// That means running this app already requires a real http(s)// server
// no matter what, so a hash-routing fallback for file:// would be dead
// code that can never actually execute in any working scenario. Local
// testing during development used `python -m http.server` (or an
// SPA-fallback-aware equivalent) for exactly this reason.

function routeParts(pathname = location.pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const locale = LANGUAGE_CODES.has(parts[0]) ? parts.shift() : null;
  return { locale, id: parts.join("/") || "home" };
}

function currentRoute() {
  return routeParts().id;
}

function localizedRoutePath(id, language = currentLanguage()) {
  const canonicalId = CANONICAL_TOOL_ROUTES[id] || id;
  const route = canonicalId === "home" ? "" : canonicalId;
  const prefix = language && language !== "en" && !ENGLISH_ONLY_ROUTE_IDS.has(canonicalId) ? `/${language}` : "";
  if (!route) return prefix || "/";
  return `${prefix}/${route}`;
}

function routePath(id, search = "", hash = "") {
  const path = `${localizedRoutePath(id)}${search}${hash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== path) {
    history.pushState({}, "", path);
  }
  route();
}

export function routeHref(id) {
  return localizedRoutePath(id);
}

export function navigateTo(id) {
  routePath(id);
}

async function route() {
  const requestedRoute = currentRoute();
  const r = resolveToolRoute(requestedRoute);
  const profile = AcademicProfile.get();
  track("page_viewed", { tool: r || "home" });

  if (r === "grading-system") {
    routePath("home");
    return;
  }

  if (r === "home" || r === "") {
    renderHome();
    focusRouteHeading();
    return;
  }

  if (PUBLIC_CONTENT[r]) {
    renderPublicContent(r);
    focusRouteHeading();
    return;
  }

  if (r === "shared-report") {
    renderSharedReport();
    focusRouteHeading();
    return;
  }

  if (r === "account" && !profile) {
    renderShell('<section id="toolHost" class="tool-host"></section>');
    mountAccount(document.getElementById("toolHost"));
    focusRouteHeading();
    return;
  }

  if (r === "admin") {
    renderShell('<section id="adminHost" class="admin-host"></section>');
    mountAdmin(document.getElementById("adminHost"));
    focusRouteHeading();
    return;
  }

  if (r === "pro-workspace") {
    if (!profile) {
      // Show the useful signed-out actions immediately. Firebase can take a
      // moment to restore an existing browser session; an anonymous visitor
      // should not stare at a loader before seeing Sign in / Subscribe.
      renderShell(`<section id="toolHost" class="tool-host">${paywall("signed_out")}</section>`);
      const host = document.getElementById("toolHost");
      applyStaticTranslations(host);
      const { CloudSync } = await import("./cloud-sync.js");
      const entitlement = await checkEntitlement(CloudSync);
      if (currentRoute() !== "pro-workspace") return;
      if (!entitlement.ok) {
        host.innerHTML = paywall(entitlement.reason);
        applyStaticTranslations(host);
      } else {
        setupReturnRoute = r;
        renderSetupOnly(r);
      }
    } else {
      renderWorkspace(r);
    }
    focusRouteHeading();
    return;
  }

  if (r === "pricing") {
    renderPricingPage();
    focusRouteHeading();
    return;
  }

  if (new URLSearchParams(location.search).get("edit-academic-profile") === "1" && TOOLS[r]) {
    setupReturnRoute = r;
    renderSetupOnly(r);
    focusRouteHeading();
    return;
  }

  // Account creation, sign-in, verification, and subscription happen before
  // the academic profile for a new Premium visitor. Keeping this route ahead
  // of the generic profile gate removes an unnecessary setup detour.
  if (r === "account") {
    renderWorkspace(null, { showAccount: true });
    focusRouteHeading();
    return;
  }

  // The free journey is intentionally sequential. Data already reviewed in
  // the transcript is reused by GPA and CGPA instead of asking for it again.
  if (profile && ["gpa-calculator", "cgpa-calculator"].includes(r) && !AcademicRecord.courses().length) {
    routePath("transcript-import");
    return;
  }
  if (profile && r === "cgpa-calculator" && !FreeWorkflow.gpaCompleted()) {
    routePath("gpa-calculator");
    return;
  }

  if (!profile) {
    if (TOOLS[r]) setupReturnRoute = r;
    renderSetupOnly(TOOLS[r] ? r : null);
    focusRouteHeading();
    return;
  }

  if (r === "dashboard") {
    renderWorkspace(null, { showDashboard: true });
  } else if (TOOLS[r]) {
    renderWorkspace(r);
  } else {
    routePath("home");
  }
  focusRouteHeading();
}

// ---------- SEO: per-route <title>/meta/canonical ----------

function setPageMeta(title, description, path) {
  document.title = title;
  const englishOnly = ENGLISH_ONLY_ROUTE_IDS.has(currentRoute());
  const canonicalPath = path === "/" ? "/" : path.replace(/\/+$/g, "");
  const localizedPath = currentLanguage() === "en" || englishOnly
    ? canonicalPath
    : canonicalPath === "/"
      ? `/${currentLanguage()}`
      : `/${currentLanguage()}${canonicalPath}`;
  const canonicalUrl = SITE_ORIGIN + localizedPath;
  const setMeta = (selector, attr, value) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  };
  setMeta('meta[name="description"]', "content", description);
  setMeta('meta[property="og:title"]', "content", title);
  setMeta('meta[property="og:description"]', "content", description);
  setMeta('meta[property="og:url"]', "content", canonicalUrl);
  setMeta('meta[name="twitter:title"]', "content", title);
  setMeta('meta[name="twitter:description"]', "content", description);
  setMeta('link[rel="canonical"]', "href", canonicalUrl);
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((link) => {
    const language = link.getAttribute("hreflang");
    const alternateLanguage = language === "x-default" ? "en" : language;
    const alternatePath = alternateLanguage === "en" || englishOnly
      ? canonicalPath
      : canonicalPath === "/"
        ? `/${alternateLanguage}`
        : `/${alternateLanguage}${canonicalPath}`;
    link.setAttribute("href", SITE_ORIGIN + alternatePath);
  });
}

function updateMetaForRoute(routeId) {
  if (currentLanguage() === "en" && ENGLISH_SEO_META[routeId || "home"]) {
    const meta = ENGLISH_SEO_META[routeId || "home"];
    setPageMeta(meta.title, meta.description, meta.path);
    return;
  }
  if (currentLanguage() === "en" && PUBLIC_CONTENT[routeId]) {
    const meta = PUBLIC_CONTENT[routeId];
    setPageMeta(`${meta.title} | InstantGPA`, meta.description, `/${routeId}`);
    return;
  }
  if (routeId === "home" || !routeId) {
    setPageMeta(
      `InstantGPA — ${t("hero.title")}`,
      t("hero.subtitle"),
      "/"
    );
  } else if (routeId === "account") {
    setPageMeta(`${t("account.title")} — InstantGPA`, t("account.subtitle"), "/account");
  } else if (routeId === "dashboard") {
    setPageMeta(`${t("dashboard.title")} — InstantGPA`, t("dashboard.subtitle"), "/dashboard");
  } else if (routeId === "admin") {
    setPageMeta("Owner dashboard | InstantGPA", "Private InstantGPA management workspace.", "/admin/");
  } else if (routeId === "pricing") {
    const meta = ENGLISH_SEO_META.pricing;
    setPageMeta(meta.title, meta.description, meta.path);
  } else if (TOOLS[routeId]) {
    const tool = TOOLS[routeId];
    setPageMeta(`${toolTitle(tool)} | InstantGPA`, toolBlurb(tool), `/${routeId}/`);
  }
}

// ---------- Shell ----------

function renderShell(bodyHtml) {
  tableEnhancerObserver?.disconnect();
  tableEnhancerObserver = null;
  const requestedRoute = currentRoute();
  const routeId = resolveToolRoute(requestedRoute);
  const simple = studentCopy();
  const seoMeta = currentLanguage() === "en" ? ENGLISH_SEO_META[requestedRoute] : null;
  const heading = seoMeta?.h1 || (routeId === "home"
    ? t("hero.title")
    : routeId === "account"
      ? t("account.title")
      : routeId === "admin"
        ? "InstantGPA owner dashboard"
      : routeId === "dashboard"
        ? t("dashboard.title")
        : PUBLIC_CONTENT[routeId]
          ? PUBLIC_CONTENT[routeId].title
        : routeId === "shared-report"
          ? "Shared Academic Journey Report"
        : TOOLS[routeId]
          ? toolTitle(TOOLS[routeId])
          : "InstantGPA");
  const visibleHomeHeading = routeId === "home";
  const standaloneToolHeading = Boolean(TOOLS[routeId]) && routeId !== "pro-workspace";
  const breadcrumb = routeId === "home" ? "" : `
      <nav class="route-breadcrumbs" aria-label="Breadcrumb">
        <a href="${routeHref("home")}">InstantGPA</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">${escapeHtml(heading)}</span>
      </nav>`;
  els.app.innerHTML = `
    <a class="skip-link" href="#mainHeading">Skip to main content</a>
    <header class="site-header">
      <a href="${routeHref("home")}" class="brand">
        <span class="brand-mark" aria-hidden="true"><img src="/assets/icons/favicon.svg" alt=""></span>
        <span class="brand-text">
          <strong><span>Instant</span><em>GPA</em></strong>
          <small>${escapeHtml(simple.brand)}</small>
        </span>
      </a>
      <nav class="header-flow-nav" aria-label="${escapeHtml(simple.flowTitle || simple.workspace)}">
        <a href="${routeHref("transcript-import")}"><span aria-hidden="true">1</span>${escapeHtml(simple.goalTranscript || t("tools.transcript.title"))}</a>
        <a href="${routeHref("gpa-calculator")}"><span aria-hidden="true">2</span>${escapeHtml(simple.goalGpa || t("tools.gpa.title"))}</a>
        <a href="${routeHref("degree-audit")}"><span aria-hidden="true">3</span>${escapeHtml(simple.goalAudit || t("tools.degreeAudit.title"))}</a>
        <a href="${routeHref("planning")}"><span aria-hidden="true">4</span>${escapeHtml(simple.goalPlanner || t("tools.planning.title"))}</a>
      </nav>
      <div class="header-actions">
        <a class="icon-link" href="${routeHref("account")}" aria-label="${t("nav.account")}" title="${t("nav.account")}"><span>${t("nav.account")}</span></a>
        <label class="lang-switcher">
          <span class="visually-hidden">${t("nav.language")}</span>
          <select id="langSelect">
            ${SUPPORTED_LANGUAGES.map((l) => `<option value="${l.code}" ${l.code === currentLanguage() ? "selected" : ""}>${l.name}</option>`).join("")}
          </select>
        </label>
      </div>
    </header>
    ${analyticsConsent() == null ? `<aside class="consent-banner" aria-label="${t("consent.analytics.body")}">
      <p>${t("consent.analytics.body")} <a href="/privacy.html">${t("consent.analytics.details")}</a></p>
      <div><button type="button" class="btn btn--primary" id="analyticsAccept">${t("consent.analytics.allow")}</button><button type="button" class="btn btn--ghost" id="analyticsDecline">${t("consent.analytics.decline")}</button></div>
    </aside>` : ""}
    <main id="mainContent">
      ${breadcrumb}
      ${standaloneToolHeading ? `<h1 id="mainHeading" class="route-page-title" tabindex="-1">${escapeHtml(heading)}</h1>` : ""}
      ${visibleHomeHeading || standaloneToolHeading ? "" : `<h1 id="mainHeading" class="visually-hidden" tabindex="-1">${escapeHtml(heading)}</h1>`}
      ${bodyHtml}
    </main>
    <div class="command-palette" id="commandPalette" hidden>
      <button class="command-palette__backdrop" type="button" data-close-command-palette aria-label="Close command palette"></button>
      <section role="dialog" aria-modal="true" aria-labelledby="commandPaletteTitle">
        <header><div><span>QUICK NAVIGATION</span><h2 id="commandPaletteTitle">Find a course or tool</h2></div><kbd>Esc</kbd></header>
        <label><span aria-hidden="true">⌕</span><input id="commandPaletteSearch" type="search" placeholder="Type a tool or course code" autocomplete="off"></label>
        <div id="commandPaletteResults"></div>
      </section>
    </div>
    <footer class="site-footer">
      <nav class="footer-links">
        <a href="/privacy.html">${t("footer.privacy")}</a>
        <a href="/terms.html">${t("footer.terms")}</a>
        <a href="/disclaimer.html">${t("footer.disclaimer")}</a>
        <a href="${routeHref("trust")}">${t("tools.trust.title")}</a>
        <a href="${routeHref("resources/university-gpa-policy-directory")}">${t("footer.policyDirectory")}</a>
        <a href="${routeHref("guides/gpa-calculation-example")}">${t("footer.gpaExample")}</a>
        <a href="${routeHref("editorial-policy")}">${t("footer.editorial")}</a>
        <a href="${routeHref("corrections")}">${t("footer.corrections")}</a>
        <a href="${routeHref("about")}">${t("footer.about")}</a>
        <a href="${routeHref("instantgpa-pro")}">${t("footer.pro")}</a>
      </nav>
      <p class="footer-note">${t("footer.rights")}</p>
      <p class="footer-trust-stat" id="footerTrustStat" hidden></p>
    </footer>`;

  loadFooterTrustStat();
  installCommandPalette();

  document.getElementById("langSelect").addEventListener("change", async (e) => {
    await loadLanguage(e.target.value);
    history.replaceState({}, "", localizedRoutePath(currentRoute(), e.target.value));
    route();
  });
  document.getElementById("analyticsAccept")?.addEventListener("click", () => {
    setAnalyticsConsent(true);
    route();
  });
  document.getElementById("analyticsDecline")?.addEventListener("click", () => {
    setAnalyticsConsent(false);
    route();
  });

  applyStaticTranslations(document);
  updateMetaForRoute(currentRoute());
}

function commandPaletteItems() {
  const tools = [
    ["dashboard", "Academic Command Center", "GPA credits roadmap timeline goals"],
    ...Object.entries(TOOLS).filter(([id]) => id !== "pro-workspace").map(([id, tool]) => [id, toolTitle(tool), `${id} ${toolBlurb(tool)}`]),
  ];
  const courses = AcademicRecord.courses().slice(0, 200).map((course) => [
    "transcript-import",
    [course.code, course.name].filter(Boolean).join(" — "),
    `${course.term || ""} course transcript`,
  ]);
  return [...tools, ...courses];
}

function installCommandPalette() {
  const palette = document.getElementById("commandPalette");
  const input = document.getElementById("commandPaletteSearch");
  const results = document.getElementById("commandPaletteResults");
  if (!palette || !input || !results) return;
  const renderResults = () => {
    const query = input.value.trim().toLocaleLowerCase(currentLanguage());
    const matches = commandPaletteItems().filter(([, label, keywords]) => !query || `${label} ${keywords}`.toLocaleLowerCase(currentLanguage()).includes(query)).slice(0, 12);
    results.innerHTML = matches.length ? matches.map(([id, label, keywords]) => `<a href="${routeHref(id)}"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(String(keywords).split(" ").slice(0, 7).join(" "))}</small><span aria-hidden="true">→</span></a>`).join("") : '<p>No matching course or tool.</p>';
  };
  const close = () => { palette.hidden = true; };
  input.addEventListener("input", renderResults);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") results.querySelector("a")?.click();
  });
  palette.querySelectorAll("[data-close-command-palette]").forEach((button) => button.addEventListener("click", close));
  if (!commandPaletteKeyboardInstalled) {
    commandPaletteKeyboardInstalled = true;
    document.addEventListener("keydown", (event) => {
      const active = document.activeElement;
      const typing = active && /INPUT|TEXTAREA|SELECT/.test(active.tagName);
      if ((event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        const current = document.getElementById("commandPalette");
        if (!current) return;
        if (current.hidden) {
          current.hidden = false;
          const currentInput = document.getElementById("commandPaletteSearch");
          currentInput.value = "";
          currentInput.dispatchEvent(new Event("input"));
          requestAnimationFrame(() => currentInput.focus());
        } else current.hidden = true;
      } else if (event.key === "Escape") {
        const current = document.getElementById("commandPalette");
        if (current) current.hidden = true;
      } else if (event.altKey && event.key.toLowerCase() === "a") {
        document.getElementById("gpaAddCourse")?.click();
      }
    });
  }
}

function renderHome() {
  const simple = studentCopy();
  const resumeToolId = AcademicProfile.get() ? lastTool() : "";
  const resumeTool = resumeToolId ? TOOLS[resumeToolId] : null;
  renderShell(`
    <div class="home-stage home-stage--portal">
      <section class="hero setup-hero" aria-labelledby="mainHeading">
        <span class="hero-eyebrow"><i aria-hidden="true"></i> ${escapeHtml(simple.start)}</span>
        <h1 id="mainHeading" tabindex="-1">GPA Calculator, Transcript Import and Graduation Planning</h1>
        <p class="hero-lead">${escapeHtml(simple.chooseLead)}</p>
        <div class="student-goal-grid" aria-label="${escapeHtml(simple.choose)}">
          <a class="student-goal student-goal--violet" href="${routeHref("gpa-calculator")}">
            <span aria-hidden="true">∑</span><strong>${escapeHtml(simple.goalGpa || t("tools.gpa.title"))}</strong><small>Complete academic setup and review your transcript before calculating.</small>
          </a>
          <a class="student-goal student-goal--cyan" href="${routeHref("transcript-import")}">
            <span aria-hidden="true">▤</span><strong>${escapeHtml(simple.goalTranscript || t("tools.transcript.title"))}</strong><small>${t("tools.transcript.blurb")}</small>
          </a>
          <a class="student-goal student-goal--orange" data-compact-label="${escapeHtml(simple.goalAudit || t("tools.degreeAudit.title"))}" href="${routeHref("degree-audit")}">
            <span aria-hidden="true">✓</span><strong>${escapeHtml(simple.goalAudit || t("tools.degreeAudit.title"))}</strong><small>${t("tools.degreeAudit.blurb")}</small>
          </a>
          <a class="student-goal student-goal--green" href="${routeHref("planning")}">
            <span aria-hidden="true">◇</span><strong>${escapeHtml(simple.goalPlanner || t("tools.planning.title"))}</strong><small>${t("tools.planning.blurb")}</small>
          </a>
        </div>
        ${resumeTool ? `<a class="resume-tool-link" href="${routeHref(resumeToolId)}"><span aria-hidden="true">↗</span><small>Continue where you left off</small><strong>${escapeHtml(toolTitle(resumeTool))}</strong></a>` : ""}
        <p class="hero-reassurance"><span aria-hidden="true">✓</span> Academic setup first · Review every transcript result · Reuse your courses automatically</p>
      </section>
      <section class="home-setup-panel" aria-label="${t("setup.title")}">
        <header class="student-setup-head"><span>1</span><div><strong>${escapeHtml(simple.setup)}</strong><small>${escapeHtml(simple.setupNote)}</small></div></header>
        <section id="setupHost" class="setup-host" aria-label="Academic setup"></section>
      </section>
    </div>

    <section class="home-section pro-home-banner" aria-labelledby="proHomeTitle">
      <div><span class="section-kicker">After your first result</span><h2 id="proHomeTitle">Your Academic Command Center</h2><p>Connect GPA, credits, degree progress, prerequisite bottlenecks, scenarios, and graduation planning in one workspace.</p></div>
      <div class="row-actions"><a class="btn btn--primary" href="${routeHref("dashboard")}">Open Command Center</a><a class="btn btn--ghost" href="${routeHref("academic-report")}">Adviser-ready report</a></div>
    </section>

    <section class="home-section home-services" aria-labelledby="servicesTitle">
      <div class="home-section__head">
        <div><span class="section-kicker">${t("home.tools.eyebrow")}</span><h2 id="servicesTitle">${t("home.tools.title")}</h2></div>
        <label class="home-tool-search"><span class="visually-hidden">${t("home.tools.title")}</span><span aria-hidden="true">⌕</span><input id="homeToolSearch" type="search" placeholder="${t("home.tools.search")}" autocomplete="off"></label>
      </div>
      <div class="home-tools-grid">${HOME_POPULAR_TOOLS.map((id) => serviceCard(id)).join("")}</div>
      <p id="homeToolSearchEmpty" class="home-search-empty" role="status" aria-live="polite" hidden>${t("home.tools.empty")}</p>
    </section>

    <section class="home-section home-seo-copy" aria-labelledby="homePlanningTitle">
      <span class="section-kicker">One connected academic record</span>
      <h2 id="homePlanningTitle">From semester GPA to graduation planning</h2>
      <p>Confirm your country, university, college, department, and grading system once, then reuse that academic context throughout the workspace.</p>
      <p>Import a transcript, calculate GPA, audit degree requirements, test targets, and build a term-by-term roadmap without changing the approved visual template.</p>
    </section>

    <section class="home-section home-trust" aria-labelledby="trustTitle">
      <div class="home-section__head"><div><span class="section-kicker">Why students can trust the result</span><h2 id="trustTitle">${t("trust.title")}</h2></div><p>${t("trust.subtitle")}</p></div>
      <div class="home-trust-grid">
        <article><h3>${t("trust.principles.title")}</h3><p>${t("trust.principles.gpa")}</p></article>
        <article><h3>Reuse approved courses</h3><p>Enter or review a course once, then use it across GPA, CGPA, audit, and planning.</p></article>
        <article><h3>Review before saving</h3><p>Nothing from a transcript becomes final until you confirm it.</p></article>
        <article><h3>${t("trust.responsible.title")}</h3><p>${t("trust.responsible.body")}</p></article>
      </div>
    </section>`);
  mountSetup(document.getElementById("setupHost"), {
    continueLabel: t("setup.continueTo", { tool: t("tools.transcript.title") }),
    onConfirmed: () => routePath("transcript-import"),
    onCancel: () => routePath(resumeToolId || "home"),
  });
  wireHomeToolSearch();
}

function wireHomeToolSearch() {
  const search = document.getElementById("homeToolSearch");
  search?.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase(currentLanguage());
    let visibleCount = 0;
    document.querySelectorAll("[data-tool-search]").forEach((item) => {
      item.hidden = query && !item.dataset.toolSearch.toLocaleLowerCase(currentLanguage()).includes(query);
      if (!item.hidden) visibleCount += 1;
    });
    const empty = document.getElementById("homeToolSearchEmpty");
    if (empty) empty.hidden = visibleCount > 0;
  });
  search?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const firstVisible = [...document.querySelectorAll(".home-tool-card[data-tool-search]")].find((item) => !item.hidden);
    if (firstVisible) firstVisible.click();
  });
}

function renderSetupOnly(requestedToolId = "transcript-import") {
  const simple = studentCopy();
  const requestedTool = requestedToolId ? TOOLS[requestedToolId] : null;
  const requestedToolTitle = requestedTool ? toolTitle(requestedTool) : "";
  const eyebrow = requestedTool
    ? t("setup.preparing", { tool: requestedToolTitle })
    : t("home.task.eyebrow");
  const lead = requestedTool
    ? t("setup.returnSubtitle")
    : t("home.task.subtitle");
  const continueLabel = requestedTool
    ? t("setup.continueTo", { tool: requestedToolTitle })
    : t("setup.continueTo", { tool: t("tools.transcript.title") });
  renderShell(`
    <div class="profile-gate-shell">
      <section class="hero setup-hero profile-gate-intro" aria-labelledby="profileGateTitle">
        <span class="hero-eyebrow"><i aria-hidden="true"></i> ${escapeHtml(requestedTool ? eyebrow : simple.start)}</span>
        <h2 id="profileGateTitle">Complete your academic profile</h2>
        <p class="hero-lead">${escapeHtml(requestedTool ? `One required step before ${requestedToolTitle}. ${lead}` : simple.chooseLead)}</p>
        <ul class="profile-gate-benefits"><li>One university context across every tool</li><li>College and department improve policy matching</li><li>Your grading system is suggested and remains editable</li></ul>
      </section>
      <section class="home-setup-panel" aria-label="${t("setup.title")}">
        <header class="student-setup-head">
          <span>1</span>
          <div><strong>${escapeHtml(simple.setup)}</strong><small>${escapeHtml(simple.setupNote)}</small></div>
        </header>
        <section id="setupHost" class="setup-host" aria-label="Academic setup"></section>
      </section>
    </div>`);
  mountSetup(document.getElementById("setupHost"), {
    continueLabel,
    onConfirmed: () => {
      routePath(setupReturnRoute || "transcript-import");
    },
    onCancel: () => routePath(setupReturnRoute),
  });
}

function renderWorkspace(activeToolId, { showAccount = false, showDashboard = false } = {}) {
  const profile = AcademicProfile.get();
  const system = GradingEngine.getActive();
  const simple = studentCopy();
  const isOverview = showAccount || showDashboard;
  const current = showAccount ? "account" : showDashboard ? "dashboard" : activeToolId;
  const category = current === "transcript-import" ? "import"
    : current === "pro-workspace" ? ""
    : ["gpa-calculator", "cgpa-calculator", "weighted-grade", "grade-converter", "international-systems"].includes(current) ? "calculate"
    : ["degree-audit", "academic-report"].includes(current) ? "audit"
    : ["planning", "graduation-predictor", "retake-calculator", "scenario-lab"].includes(current) ? "plan"
    : "";
  const subnav = {
    calculate: [["gpa-calculator", "GPA"], ["cgpa-calculator", "CGPA"], ["weighted-grade", "Weighted"], ["grade-converter", "Convert"], ["international-systems", "Systems"]],
    audit: [["degree-audit", "Degree Audit"], ["academic-report", "Journey Report"]],
    plan: [["planning", "Auto-Scheduler"], ["graduation-predictor", "GPA Target"], ["retake-calculator", "Retakes"], ["scenario-lab", "Scenarios"]],
  }[category] || [];
  const profileContext = [profile.college, profile.department, system?.label]
    .filter(Boolean)
    .join(" · ");
  renderShell(`
    <div class="${isOverview ? "workspace-overview-shell" : `workspace-tool-frame ${activeToolId === "gpa-calculator" ? "workspace-tool-frame--gpa" : ""}`}">
    <section class="student-workspace-head ${isOverview ? "student-workspace-head--overview" : ""}">
      <div><span>${escapeHtml(simple.start)}</span><h2>${escapeHtml(isOverview ? simple.workspace : (simple.flowTitle || simple.workspace))}</h2><p>${escapeHtml(isOverview ? simple.workspaceNote : (simple.flowNote || simple.workspaceNote))}</p></div>
      ${isOverview ? "" : `<a href="${routeHref("home")}" class="btn btn--ghost">All tools</a>`}
    </section>
    <div class="${isOverview ? "workspace-overview-frame" : ""}">
    <section class="profile-bar">
      <div>
        <span class="profile-bar__label">${t("profile.summary")}</span>
        <strong class="profile-bar__uni">${escapeHtml(profile.university)}</strong>
        <span class="profile-bar__system">${escapeHtml(profileContext || `${t("profile.gradingSystem")}: ${system?.label || ""}`)}</span>
      </div>
      <div class="profile-bar__actions">
        <a class="btn btn--primary" href="${routeHref("dashboard")}">Command Center</a>
        <button type="button" class="btn btn--ghost" id="btnChooseUni">${t("profile.change")}</button>
        <button type="button" class="btn btn--text" id="btnEditProfile">${t("profile.edit")}</button>
      </div>
    </section>

    <nav class="workspace-nav" aria-label="Academic workspace">
      <a class="${category === "import" ? "is-active" : ""}" ${category === "import" ? 'aria-current="page"' : ""} href="${routeHref("transcript-import")}"><b aria-hidden="true">1</b><span>Import</span></a>
      <a class="${category === "calculate" ? "is-active" : ""}" ${category === "calculate" ? 'aria-current="page"' : ""} href="${routeHref("gpa-calculator")}"><b aria-hidden="true">2</b><span>Calculate</span></a>
      <a class="${category === "audit" ? "is-active" : ""}" ${category === "audit" ? 'aria-current="page"' : ""} href="${routeHref("degree-audit")}"><b aria-hidden="true">3</b><span>Audit</span><small class="tool-pro-badge">Pro</small></a>
      <a class="${category === "plan" ? "is-active" : ""}" ${category === "plan" ? 'aria-current="page"' : ""} href="${routeHref("planning")}"><b aria-hidden="true">4</b><span>Plan</span><small class="tool-pro-badge">Pro</small></a>
    </nav>
    ${subnav.length ? `<nav class="workspace-subnav workspace-tool-buttons" aria-label="${escapeHtml(category)} tools">
      ${subnav.map(([id, label]) => `<a class="${current === id ? "is-active" : ""}" ${current === id ? 'aria-current="page"' : ""} href="${routeHref(id)}">${label}${TOOLS[id]?.proOnly ? '<small class="tool-pro-badge">Pro</small>' : ""}</a>`).join("")}
    </nav>` : ""}

    ${activeToolId && activeToolId !== "pro-workspace" ? studentToolGuide(activeToolId) : ""}
    <section id="toolHost" class="tool-host"></section>
    </div>
    </div>
  `);

  document.getElementById("btnChooseUni").addEventListener("click", () => backToSetup());
  document.getElementById("btnEditProfile").addEventListener("click", () => backToSetup());

  const toolHost = document.getElementById("toolHost");
  if (showAccount) {
    mountAccount(toolHost);
    toolHost.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (showDashboard) {
    mountDashboard(toolHost);
    toolHost.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (activeToolId && TOOLS[activeToolId]) {
    mountTool(activeToolId, toolHost);
    toolHost.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    toolHost.innerHTML = "";
  }
}

function renderPublicContent(routeId) {
  renderShell('<section id="contentHost" class="content-host"></section>');
  const host = document.getElementById("contentHost");
  import("./editorial-content.js").then(({ mount }) => {
    if (currentRoute() !== routeId) return;
    mount(host, routeId);
  });
}

let trustStatCache = null;
function applyTrustStat(el, stats) {
  if (!stats?.visible || !stats.totalUsers) return;
  el.textContent = `Trusted by ${stats.totalUsers.toLocaleString()}+ students`;
  el.hidden = false;
}
async function loadFooterTrustStat() {
  const el = document.getElementById("footerTrustStat");
  if (!el) return;
  if (trustStatCache) {
    applyTrustStat(el, trustStatCache);
    return;
  }
  try {
    const response = await fetch("/api/site-config", { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!data?.trustStats) return;
    trustStatCache = data.trustStats;
    const current = document.getElementById("footerTrustStat");
    if (current) applyTrustStat(current, trustStatCache);
  } catch {
    // Stay hidden if the stat can't be loaded.
  }
}

function renderPricingPage() {
  renderShell('<section id="pricingHost" class="content-host"></section>');
  const host = document.getElementById("pricingHost");
  import("./pricing-page.js").then(({ mount }) => {
    if (currentRoute() !== "pricing") return;
    mount(host);
  });
}

function renderSharedReport() {
  renderShell('<section id="sharedReportHost" class="content-host"></section>');
  const host = document.getElementById("sharedReportHost");
  import("./shared-report.js").then(({ mount }) => {
    if (currentRoute() !== "shared-report") return;
    mount(host);
  });
}

function serviceCard(id) {
  const tool = TOOLS[id];
  const title = toolTitle(tool);
  const blurb = toolBlurb(tool);
  return `<a class="home-tool-card" data-tool-search="${escapeHtml(`${title} ${blurb} ${id.replaceAll("-", " ")}`)}" href="${routeHref(id)}">
    <span class="home-tool-card__icon" aria-hidden="true">${toolGlyph(id)}</span>
    <span><strong>${title}${tool.proOnly ? '<small class="tool-pro-badge">Pro</small>' : ""}</strong><small>${blurb}</small></span>
    <i aria-hidden="true">→</i>
  </a>`;
}

function studentToolGuide(id) {
  const tool = TOOLS[id];
  const simple = studentCopy();
  return `<section class="student-tool-guide" aria-label="${escapeHtml(simple.easy)}">
    <div class="student-tool-guide__title">
      <span aria-hidden="true">${toolGlyph(id)}</span>
      <div><small>${escapeHtml(simple.easy)}</small><strong>${escapeHtml(toolTitle(tool))}</strong><p>${escapeHtml(toolBlurb(tool))}</p></div>
    </div>
    <ol>
      <li><b>1</b><span>${escapeHtml(simple.add)}</span></li>
      <li><b>2</b><span>${escapeHtml(simple.check)}</span></li>
      <li><b>3</b><span>${escapeHtml(simple.decide)}</span></li>
    </ol>
  </section>`;
}

function toolGlyph(id) {
  const glyphs = {
    "transcript-import": "▤",
    "gpa-calculator": "∑",
    "cgpa-calculator": "◎",
    "grade-converter": "⇄",
    "weighted-grade": "%",
    "retake-calculator": "↻",
    "graduation-predictor": "⌁",
    planning: "◇",
    "academic-report": "▧",
    "degree-audit": "✓",
    "scenario-lab": "⌘",
    "international-systems": "◉",
    "pro-workspace": "✦",
  };
  return glyphs[id] || "•";
}

function installStudentTableEnhancer(root) {
  const alignWorkspaceStripsToContent = () => {
    const frame = root.closest(".workspace-tool-frame");
    if (!frame) return;
    const structured = [
      ...root.querySelectorAll("table, [role=\"table\"], .record-table-wrap, .transcript-dropzone"),
    ].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (!structured.length) {
      frame.style.removeProperty("--workspace-strip-width");
      return;
    }
    const contentWidth = Math.max(...structured.map((element) => element.getBoundingClientRect().width));
    const frameWidth = frame.getBoundingClientRect().width;
    frame.style.setProperty("--workspace-strip-width", `${Math.round(Math.min(contentWidth, frameWidth))}px`);
  };

  const decorate = () => {
    root.querySelectorAll("table:not([data-student-table])").forEach((table) => {
      table.dataset.studentTable = "true";
      table.classList.add("student-table");
      const headings = [...table.querySelectorAll("thead th")].map((cell, index) => {
        if (!cell.hasAttribute("scope")) cell.setAttribute("scope", "col");
        return cell.textContent.trim() || `Column ${index + 1}`;
      });
      table.querySelectorAll("tbody tr").forEach((row) => {
        [...row.children].forEach((cell, index) => {
          if (!cell.dataset.label) cell.dataset.label = headings[index] || `Column ${index + 1}`;
        });
      });
    });

    root.querySelectorAll('[role="table"]').forEach((grid) => {
      grid.dataset.studentGrid = "true";
      const header = grid.querySelector('[role="row"] [role="columnheader"]')?.parentElement;
      const headings = header
        ? [...header.children].map((cell, index) => cell.textContent.trim() || (index === header.children.length - 1 ? "Action" : `Field ${index + 1}`))
        : [];
      grid.querySelectorAll('[role="row"]').forEach((row) => {
        if (row === header) return;
        [...row.children].forEach((control, index) => {
          if (control.classList.contains("student-cell")) return;
          const wrapper = document.createElement("span");
          wrapper.className = "student-cell";
          wrapper.setAttribute("role", "cell");
          wrapper.dataset.label = headings[index] || control.getAttribute("aria-label") || `Field ${index + 1}`;
          const label = document.createElement("small");
          label.className = "student-cell__label";
          label.textContent = wrapper.dataset.label;
          control.before(wrapper);
          wrapper.append(label, control);
        });
      });
    });

    requestAnimationFrame(alignWorkspaceStripsToContent);
  };

  decorate();
  tableEnhancerObserver?.disconnect();
  tableEnhancerObserver = new MutationObserver(decorate);
  tableEnhancerObserver.observe(root, { childList: true, subtree: true });
}

async function mountTool(toolId, toolHost) {
  toolHost.innerHTML = `<div class="tool-card tool-card--loading" aria-busy="true">…</div>`;
  if (TOOLS[toolId].proOnly) {
    const { CloudSync } = await import("./cloud-sync.js");
    const entitlement = await checkEntitlement(CloudSync);
    if (resolveToolRoute(currentRoute()) !== toolId) return;
    if (!entitlement.ok) {
      toolHost.innerHTML = paywall(entitlement.reason, toolTitle(TOOLS[toolId]));
      applyStaticTranslations(toolHost);
      return;
    }
  }
  const mod = await TOOLS[toolId].load();
  // Guard against a fast route change while the module was still loading.
  if (resolveToolRoute(currentRoute()) !== toolId) return;
  rememberLastTool(toolId);
  track("calculator_opened", { tool: toolId });
  mod.mount(toolHost);
  applyStaticTranslations(toolHost);
  installStudentTableEnhancer(toolHost);
}

async function mountAccount(toolHost) {
  toolHost.innerHTML = `<div class="tool-card tool-card--loading" aria-busy="true">…</div>`;
  const { mount } = await import("./account-panel.js");
  if (currentRoute() !== "account") return;
  mount(toolHost);
  applyStaticTranslations(toolHost);
  installStudentTableEnhancer(toolHost);
}

async function mountDashboard(toolHost) {
  toolHost.innerHTML = `<div class="tool-card tool-card--loading" aria-busy="true">…</div>`;
  const { mount } = await import("./dashboard.js");
  if (currentRoute() !== "dashboard") return;
  mount(toolHost);
  applyStaticTranslations(toolHost);
  installStudentTableEnhancer(toolHost);
}

async function mountAdmin(host) {
  host.innerHTML = `<div class="admin-loading" aria-busy="true">…</div>`;
  const { mount } = await import("./admin-panel.js");
  if (currentRoute() !== "admin") return;
  mount(host);
}

function backToSetup() {
  setupReturnRoute = currentRoute() === "home" ? "transcript-import" : currentRoute();
  routePath("home");
}

function focusRouteHeading() {
  requestAnimationFrame(() => {
    document.getElementById("mainHeading")?.focus({ preventScroll: true });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Delegated click handler for same-origin internal links: intercept a
// plain left-click and turn it into pushState navigation (no full page
// reload). Modifier-key clicks and middle-click are deliberately left
// alone so "open in new tab/window" keeps working the normal way.
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest("a[href]");
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return;
  // Only intercept paths that are actually routes this app handles —
  // leave privacy.html/terms.html/disclaimer.html (real separate pages)
  // to navigate normally.
  const id = routeParts(url.pathname).id;
  const resolvedId = resolveToolRoute(id);
  if (resolvedId !== "home" && !TOOLS[resolvedId] && !PUBLIC_CONTENT[resolvedId] && resolvedId !== "shared-report" && resolvedId !== "account" && resolvedId !== "dashboard" && resolvedId !== "admin") return;
  e.preventDefault();
  routePath(resolvedId, url.search, url.hash);
});

async function boot() {
  cacheEls();
  const routeLocale = routeParts().locale;
  const savedLang = getSavedLanguage();
  const browserLanguage = String(navigator.language || "en").split("-")[0].toLowerCase();
  const initialLanguage = SUPPORTED_LANGUAGES.some((language) => language.code === browserLanguage)
    ? browserLanguage
    : "en";
  await loadLanguage(routeLocale || savedLang || initialLanguage);
  const canonicalClientPath = localizedRoutePath(currentRoute());
  if (location.pathname !== canonicalClientPath) {
    history.replaceState({}, "", canonicalClientPath);
  }
  window.addEventListener("popstate", route);
  window.addEventListener("instantgpa:academic-cloud-restored", route);
  route();
}

boot();
