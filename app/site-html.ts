import indexHtml from "../static-site/index.html?raw";
import approvedTemplateHtml from "../static-site/approved-template.html?raw";
import arRaw from "../static-site/data/translations/ar.json?raw";
import enRaw from "../static-site/data/translations/en.json?raw";

const ORIGIN = "https://instantgpa.com";

type TranslationDictionary = Record<string, string>;

const LANGUAGES: Record<string, {
  dir: "ltr" | "rtl";
  ogLocale: string;
  dictionary: TranslationDictionary;
}> = {
  en: { dir: "ltr", ogLocale: "en_US", dictionary: JSON.parse(enRaw) },
  ar: { dir: "rtl", ogLocale: "ar_AR", dictionary: JSON.parse(arRaw) },
};

const RETIRED_LANGUAGE_CODES = new Set(["zh", "hi", "es", "fr", "pt", "id", "ru", "tr"]);

type RouteMeta = {
  title: string;
  description: string;
  h1?: string;
  index?: boolean;
  localized?: boolean;
  article?: boolean;
  // English-only for now, regardless of the page's own locale — translating
  // FAQ copy into every supported language is tracked separately.
  faqs?: Array<{ q: string; a: string }>;
};

const ROUTES: Record<string, RouteMeta> = {
  "/": {
    title: "GPA Calculator, Transcript Import & Graduation Planner | InstantGPA",
    description: "Calculate GPA and CGPA with credits and custom scales, import your transcript, audit degree requirements, test retakes, and plan graduation in one connected academic workspace.",
    h1: "GPA Calculator, Transcript Import and Graduation Planning",
    faqs: [
      { q: "What is a good GPA?", a: "It depends on your institution and program, but as a general benchmark, 3.0+ (on a 4.0 scale) is often considered good and 3.5+ strong. Always check your own institution's published standards, since scales (4.0, 5.0, 10-point, percentage) vary." },
      { q: "How is GPA calculated?", a: "Each course earns quality points equal to its grade points multiplied by its credit hours. GPA is the sum of quality points across all GPA-counted courses, divided by the sum of those courses' credits." },
      { q: "Do I need to create an account to use InstantGPA?", a: "No. The Free workflow uses a random browser installation key instead of an account. Calculations run in your browser, while an approved structured academic record synchronizes securely so the service can preserve the workflow and improve parsing and academic coverage." },
      { q: "Does InstantGPA support grading systems outside the United States?", a: "Yes. Set your country, university, and grading system in the Academic Profile step, and every calculator uses that scale instead of assuming a 4.0 system." },
    ],
  },
  "/college-gpa-calculator/": {
    title: "Free College GPA Calculator with Credits | InstantGPA",
    description: "Enter course grades, credit hours, and a 4.0, 5.0, 10.0, or custom scale to calculate weighted semester and college GPA with quality points.",
    h1: "College GPA Calculator with Credits",
    faqs: [
      { q: "What's the difference between semester GPA and cumulative GPA?", a: "Semester GPA reflects only the courses taken in one term. Cumulative GPA (CGPA) blends every term you've completed, weighted by each course's credits." },
      { q: "Do all courses count toward GPA?", a: "Usually not. Pass/Fail, Withdraw, and Incomplete grades are commonly excluded from GPA by policy, even though they may still count toward credits earned. Only graded, GPA-eligible courses factor into the average." },
      { q: "What if my school doesn't use a 4.0 scale?", a: "Change the grading system in your Academic Profile. InstantGPA supports 5.0 and 10-point scales, percentage-based systems, and custom scales, not just 4.0." },
    ],
  },
  "/cgpa-calculator/": {
    title: "Cumulative GPA & CGPA Calculator | InstantGPA",
    description: "Enter your previous cumulative GPA and completed credits, then add current course grades and credits to calculate an updated CGPA.",
    h1: "Cumulative GPA and CGPA Calculator",
    faqs: [
      { q: "How do I calculate CGPA if I already have a previous GPA?", a: "CGPA = (previous GPA × previous credits + new quality points) ÷ total credits. Enter your existing GPA and credits, then add this term's courses." },
      { q: "Why is my CGPA different from my semester GPA?", a: "CGPA averages across every term you've completed, weighted by credits, so one strong or weak term has less effect on it than it does on that term's own semester GPA." },
      { q: "Can retaking a course change my CGPA?", a: "Yes, but how much depends on your university's retake policy — replacement, highest-attempt, average-of-attempts, or both-count. Use the Retake Calculator to model your specific policy before recalculating CGPA." },
    ],
  },
  "/international-gpa-converter/": {
    title: "International GPA & Grading Scale Converter | InstantGPA",
    description: "Select source and target grading systems, then enter a grade or percentage to estimate the equivalent result across international grading scales.",
    h1: "International GPA and Grading Scale Converter",
    faqs: [
      { q: "Is international GPA conversion exact?", a: "No — it's an estimate. Official conversion for admissions or credential purposes should be confirmed by the receiving institution's registrar or a credential evaluation service." },
      { q: "Why do two universities give a different GPA for the same grades?", a: "Each institution sets its own grade-to-point conversion table, so identical letter grades or percentages can map to different GPA values depending on which school's scale is applied." },
      { q: "Which countries and grading systems are supported?", a: "The country list in Academic Profile covers a growing set of national and university-specific scales; check the International Systems directory for verification status on a specific institution." },
    ],
  },
  "/weighted-grade/": { title: "Weighted Grade Calculator for One Course | InstantGPA", description: "Calculate your final course grade from weighted assignments, quizzes, midterms, projects, and final exams." },
  "/gpa-retake-calculator/": {
    title: "GPA Retake & Grade Replacement Calculator | InstantGPA",
    description: "Enter current CGPA, credits, old and new grades, and a retake policy to estimate your updated cumulative GPA after repeating a course.",
    h1: "GPA Retake and Grade Replacement Calculator",
    faqs: [
      { q: "What retake policies does this calculator support?", a: "Six common policies: highest attempt counts, latest attempt counts, average of attempts, replacement, both attempts count, and no change — matching the most common university rules." },
      { q: "Which retake policy does my university use?", a: "It varies by institution and sometimes by program. Check your official registrar policy, or use the International Systems directory to confirm a verified policy before relying on the result." },
      { q: "Does retaking a failed course always improve my GPA?", a: "Usually, but not always by as much as you'd expect. Under a replacement or highest-attempt policy the old grade drops out entirely, but under an average or both-count policy the original grade still partly counts." },
    ],
  },
  "/target-gpa-calculator/": {
    title: "Target GPA Calculator: What GPA Do I Need? | InstantGPA",
    description: "Enter current GPA, completed credits, remaining credits, and a target GPA to calculate the average GPA needed and whether the target is reachable.",
    h1: "Target GPA Calculator",
    faqs: [
      { q: "How is the required GPA calculated?", a: "Required GPA = [target GPA × (completed + remaining credits) − current GPA × completed credits] ÷ remaining credits." },
      { q: "What happens if the required GPA is impossible on my scale?", a: "The calculator tells you the target isn't reachable in your remaining credits rather than showing a number above your grading scale's maximum — you'd need more remaining credits or a lower target." },
      { q: "Does this account for retaking courses?", a: "No, it models only new remaining credits. Use the Retake Calculator first to see how a retake changes your current CGPA, then re-run this calculator with the updated number." },
    ],
  },
  "/scenario-lab/": { title: "GPA What-If Scenario Calculator | InstantGPA", description: "Compare hypothetical grades, course loads, retakes, and GPA targets before changing your academic plan." },
  "/international-systems/": { title: "International GPA Calculator by Country & University | InstantGPA", description: "Explore source-backed grading scales by country and university, see verification status, and confirm the official policy before calculating GPA." },
  "/transcript-gpa-calculator/": {
    title: "Transcript GPA Calculator & Course Import | InstantGPA",
    description: "Import XLSX, PDF, image, CSV, TSV, or pasted course data, review detected grades and credits, then calculate transcript GPA from approved rows.",
    h1: "Transcript GPA Calculator and Course Import",
    faqs: [
      { q: "What file formats can I import?", a: "PDF, scanned or photographed images, Excel (XLSX), and CSV/TSV or pasted text, all read directly in your browser first." },
      { q: "Is my transcript data sent to a server?", a: "The file is parsed locally first and is sent to secure cloud OCR only with the required consent and access. After you approve the review, the structured courses, grades, credits, semesters, and attempts synchronize securely; the original file, its name, and raw OCR text are not retained in the academic record." },
      { q: "What happens if a grade or credit value is unclear?", a: "It's flagged for your manual review before anything is counted toward GPA — InstantGPA never silently guesses a grade or credit value." },
    ],
  },
  "/degree-audit-graduation-planner/": {
    title: "Degree Audit & Graduation Planner | InstantGPA",
    description: "Use reviewed transcript courses and degree requirements to track completed, in-progress, unassigned, and remaining credits before planning graduation.",
    h1: "Degree Audit and Graduation Planner",
  },
  "/planning/": { title: "Graduation Planner from Transcript & Degree Requirements | InstantGPA", description: "Build a semester-by-semester graduation plan from transcript courses, prerequisites, remaining requirements, and credit limits." },
  "/academic-report/": { title: "Academic Journey Report: GPA, Degree Audit & Plan | InstantGPA", description: "Create one reproducible academic report with GPA calculations, included and excluded courses, degree-audit progress, graduation plan, sources, and confidence notes." },
  "/pricing/": {
    title: "InstantGPA Plans: Free Tools & PayPal Premium",
    description: "Compare anonymous Free tools with paid InstantGPA Premium and subscribe securely through PayPal.",
    h1: "InstantGPA Plans",
  },
  "/instantgpa-pro/": {
    title: "InstantGPA Pro: Academic Twin, Syllabus Chat & Decision Simulator",
    description: "Explore subscriber tools for live semester tracking, cited syllabus chat, Academic Undo scenarios, policy sources, transfer, credit conversion, and adviser review.",
    article: true,
  },
  "/pro-workspace/": {
    title: "InstantGPA Pro Academic Operating System",
    description: "Private subscriber workspace for live semester tracking, syllabus evidence, Academic Twin and Undo scenarios, policy sources, transfer, translation, institutional tools, and adviser sharing.",
    index: false,
  },
  "/trust/": { title: "GPA Calculation Methodology, Sources & Privacy | InstantGPA", description: "Review calculation formulas, rounding, course-status rules, OCR confidence, university-source levels, privacy practices, limitations, and method changes." },
  "/transcript-to-graduation-plan/": {
    title: "From Transcript to GPA, Degree Audit & Graduation Plan | InstantGPA",
    description: "A complete, source-backed workflow for turning a reviewed transcript into GPA, CGPA, a degree audit, a graduation plan, and an adviser-ready report.",
    localized: false,
    article: true,
  },
  "/guides/gpa-calculation-example/": {
    title: "How to Calculate GPA: Formula & Worked Example | InstantGPA",
    description: "Calculate quality points and GPA step by step with a four-course worked example, excluded-course rules, rounding guidance, and common mistakes.",
    localized: false,
    article: true,
  },
  "/guides/retake-policy-example/": {
    title: "Retake GPA Policies: Replacement, Highest, Average & Both | InstantGPA",
    description: "See how common course-retake policies change GPA using one reproducible example, formulas, and a university-policy verification checklist.",
    localized: false,
    article: true,
  },
  "/guides/international-gpa-conversion/": {
    title: "International GPA Conversion: Country & University Guide | InstantGPA",
    description: "Understand why international GPA conversion is an estimate, how institutional scales differ, and how to verify ECTS, UK, US, Indian, and university rules.",
    localized: false,
    article: true,
  },
  "/guides/3-0-gpa/": {
    title: "How to Get a 3.0 GPA: What It Means & How to Reach It | InstantGPA",
    description: "See what a 3.0 GPA means for grad school and honors eligibility, the grades needed to reach it, and a worked example using the required-GPA formula.",
    h1: "How to Get a 3.0 GPA",
    localized: false,
    article: true,
    faqs: [
      { q: "What is a 3.0 GPA equivalent to?", a: "A 3.0 on a 4.0 scale is a B average — roughly 83-86% depending on your institution's percentage-to-GPA scale." },
      { q: "Is a 3.0 GPA good enough for graduate school?", a: "Many graduate programs set 3.0 as a minimum eligibility threshold, though competitive programs often expect higher. Always confirm the specific program's published requirement." },
      { q: "How many credits at what grade do I need to raise my GPA to 3.0?", a: "Use the required-GPA formula: [target × (completed + remaining) − current × completed] ÷ remaining. The Target GPA Calculator computes this for your exact numbers." },
    ],
  },
  "/guides/3-5-gpa/": {
    title: "How to Get a 3.5 GPA: Requirements & Worked Example | InstantGPA",
    description: "Understand what a 3.5 GPA represents, common scholarship and honors thresholds it unlocks, and calculate the grades you need with a worked example.",
    h1: "How to Get a 3.5 GPA",
    localized: false,
    article: true,
    faqs: [
      { q: "What is a 3.5 GPA equivalent to?", a: "A B+/A- average on a 4.0 scale - commonly the minimum for cum laude honors and many scholarship renewal requirements, though thresholds vary by institution." },
      { q: "Is 3.5 a competitive GPA for graduate school?", a: "It's competitive for many master's programs; more selective or professional programs (law, medicine, top MBA) often expect higher. Check each program's published range." },
      { q: "What grades do I need this term to reach a 3.5?", a: "It depends on your current GPA, completed credits, and remaining credits this term — use the Target GPA Calculator for your exact numbers." },
    ],
  },
  "/guides/3-7-gpa/": {
    title: "How to Get a 3.7 GPA: Requirements & Worked Example | InstantGPA",
    description: "See what a 3.7 GPA typically unlocks academically, how much one lower grade can cost you, and calculate your path with a worked example.",
    h1: "How to Get a 3.7 GPA",
    localized: false,
    article: true,
    faqs: [
      { q: "What is a 3.7 GPA equivalent to?", a: "An A-/A average on a 4.0 scale - often the range associated with magna cum laude honors and competitive for top graduate and professional programs, though exact cutoffs are set by each institution." },
      { q: "How much does one lower grade affect a 3.7 target?", a: "Significantly, especially with fewer remaining credits — a single B in a heavy-credit course can require near-perfect grades elsewhere to recover. Model it with the Retake or Target GPA calculators before assuming it's out of reach." },
      { q: "Can I still reach 3.7 after a rough semester?", a: "Often yes, if you have enough remaining credits at strong grades — enter your numbers into the Target GPA Calculator to see whether it's mathematically reachable." },
    ],
  },
  "/guides/4-0-gpa/": {
    title: "How to Get and Keep a 4.0 GPA | InstantGPA",
    description: "Understand how fragile a 4.0 GPA is as credits accumulate, what a single lower grade costs, and calculate whether a perfect GPA is still reachable.",
    h1: "How to Get and Keep a 4.0 GPA",
    localized: false,
    article: true,
    faqs: [
      { q: "Can one B ruin a 4.0 GPA?", a: "It can make a literal 4.0 mathematically impossible for that term or cumulatively, since 4.0 is the scale's maximum and there's no higher grade to offset it. How much it affects your overall standing depends on your total credit count." },
      { q: "Does a 4.0 GPA get harder to keep over time?", a: "Yes — each additional credit at a lower grade needs proportionally more perfect-grade credits to fully offset it as your total credit count grows." },
      { q: "I already have a B on my record — is a 4.0 cumulative still possible?", a: "If retakes are allowed and your institution's policy replaces the old grade, a retake can restore eligibility; otherwise a literal 4.0 cumulative typically isn't recoverable once a lower grade is permanently recorded. Check your Retake Calculator scenario and official policy." },
    ],
  },
  "/about/": {
    title: "About InstantGPA & Its Academic Purpose",
    description: "Learn who created InstantGPA, why the platform connects transcript review to academic planning, and where its responsibility begins and ends.",
    localized: false,
    article: true,
  },
  "/editorial-policy/": {
    title: "Editorial, Source & Academic Review Policy | InstantGPA",
    description: "See how InstantGPA selects official sources, labels verification status, reviews calculations, dates content, handles conflicts, and avoids unsupported claims.",
    localized: false,
    article: true,
  },
  "/corrections/": {
    title: "Corrections & University Policy Updates | InstantGPA",
    description: "Report a grading-policy error with an official source and see how InstantGPA reviews, corrects, dates, and documents academic-policy changes.",
    localized: false,
    article: true,
  },
  "/resources/academic-adviser-report/": {
    title: "Academic Adviser Report Template: GPA to Graduation | InstantGPA",
    description: "See the fields, evidence labels, calculation details, privacy controls, and adviser handoff included in an InstantGPA Academic Journey Report.",
    localized: false,
    article: true,
  },
  "/resources/university-gpa-policy-directory/": {
    title: "Verified University GPA Policy Sources & Dataset | InstantGPA",
    description: "Browse a dated, source-backed directory of university GPA scales, formulas, retake notes, policy scope, and official Registrar or regulations links.",
    localized: false,
    article: true,
  },
  "/universities/ucla/gpa-calculator/": {
    title: "UCLA GPA Calculator & Official Grade Points | InstantGPA",
    description: "Calculate with UCLA grade points and review official Registrar guidance for A+ through F, Passed grades, repetitions, and the non-official planning disclaimer.",
    localized: false,
    article: true,
  },
  "/universities/university-of-texas-at-austin/gpa-calculator/": {
    title: "UT Austin GPA Calculator & Official Grade Policy | InstantGPA",
    description: "Use the UT Austin grading scale with a source-backed explanation of authorized grades, quality points, exclusions, and official-calculator limits.",
    localized: false,
    article: true,
  },
  "/universities/universiti-malaya/gpa-calculator/": {
    title: "Universiti Malaya GPA Calculator & Grading Scheme | InstantGPA",
    description: "Use Universiti Malaya grade points with official 2025/2026 source links, pass thresholds, GPA and CGPA formulas, and faculty-level verification notes.",
    localized: false,
    article: true,
  },
  "/universities/aastmt/gpa-calculator/": {
    title: "AASTMT GPA Calculator & College Grading Policies | InstantGPA",
    description: "Calculate AASTMT GPA while checking the applicable college regulations, grade points, course pass rules, and official source date.",
    localized: false,
    article: true,
  },
  "/universities/king-saud-university/gpa-calculator/": {
    title: "King Saud University GPA Calculator on a 5.0 Scale | InstantGPA",
    description: "Calculate KSU GPA on its 5.0 scale and review official grade weights, GPA formula, incomplete-course rules, and policy-source notes.",
    localized: false,
    article: true,
  },
  "/universities/united-arab-emirates-university/gpa-calculator/": {
    title: "UAEU GPA Calculator & Official 4.0 Grade Policy | InstantGPA",
    description: "Calculate UAEU GPA on the official 4.0 quality-point scale with credit weighting, two-decimal reporting, degree-completion notes, and source links.",
    localized: false,
    article: true,
  },
  "/shared-report/": { title: "Shared Academic Journey Report | InstantGPA", description: "Open a private, read-only academic report shared through InstantGPA.", index: false, localized: false },
  "/dashboard/": { title: "Dashboard | InstantGPA", description: "Your private academic workspace.", index: false },
  "/account/": { title: "Account | InstantGPA", description: "Manage local data and optional cloud backups.", index: false },
  "/admin/": { title: "Owner Dashboard | InstantGPA", description: "Private InstantGPA management workspace.", index: false },
};

const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  "/gpa-calculator/": "/college-gpa-calculator/",
  "/grade-converter/": "/international-gpa-converter/",
  "/retake-calculator/": "/gpa-retake-calculator/",
  "/graduation-predictor/": "/target-gpa-calculator/",
  "/transcript-import/": "/transcript-gpa-calculator/",
  "/degree-audit/": "/degree-audit-graduation-planner/",
};

const CRAWLABLE_ROUTES = [
  ["/pricing/", "InstantGPA pricing"],
  ["/transcript-to-graduation-plan/", "transcript-to-graduation planning workflow"],
  ["/college-gpa-calculator/", "GPA calculator"],
  ["/cgpa-calculator/", "CGPA calculator"],
  ["/transcript-gpa-calculator/", "Transcript GPA calculator"],
  ["/degree-audit-graduation-planner/", "Degree audit"],
  ["/planning/", "Graduation planner"],
  ["/academic-report/", "academic journey report"],
  ["/instantgpa-pro/", "InstantGPA Pro Academic Twin"],
  ["/international-gpa-converter/", "Grade converter"],
  ["/weighted-grade/", "Weighted grade calculator"],
  ["/gpa-retake-calculator/", "Retake GPA calculator"],
  ["/target-gpa-calculator/", "Target GPA calculator"],
  ["/scenario-lab/", "GPA scenario calculator"],
  ["/guides/gpa-calculation-example/", "worked GPA example"],
  ["/guides/retake-policy-example/", "retake policy examples"],
  ["/guides/international-gpa-conversion/", "international GPA conversion guide"],
  ["/guides/3-0-gpa/", "how to get a 3.0 GPA"],
  ["/guides/3-5-gpa/", "how to get a 3.5 GPA"],
  ["/guides/3-7-gpa/", "how to get a 3.7 GPA"],
  ["/guides/4-0-gpa/", "how to get a 4.0 GPA"],
  ["/resources/university-gpa-policy-directory/", "verified university GPA policy sources"],
  ["/editorial-policy/", "editorial and source policy"],
];

const ROUTE_TRANSLATION_KEYS: Record<string, { title: string; description: string }> = {
  "/": { title: "hero.title", description: "hero.subtitle" },
  "/college-gpa-calculator/": { title: "tools.gpa.title", description: "tools.gpa.blurb" },
  "/cgpa-calculator/": { title: "tools.cgpa.title", description: "tools.cgpa.blurb" },
  "/international-gpa-converter/": { title: "tools.converter.title", description: "tools.converter.blurb" },
  "/weighted-grade/": { title: "tools.weighted.title", description: "tools.weighted.blurb" },
  "/gpa-retake-calculator/": { title: "tools.retake.title", description: "tools.retake.blurb" },
  "/target-gpa-calculator/": { title: "tools.graduation.title", description: "tools.graduation.blurb" },
  "/scenario-lab/": { title: "tools.scenario.title", description: "tools.scenario.blurb" },
  "/international-systems/": { title: "tools.international.title", description: "tools.international.blurb" },
  "/transcript-gpa-calculator/": { title: "tools.transcript.title", description: "tools.transcript.blurb" },
  "/degree-audit-graduation-planner/": { title: "tools.degreeAudit.title", description: "tools.degreeAudit.blurb" },
  "/planning/": { title: "tools.planning.title", description: "tools.planning.blurb" },
  "/academic-report/": { title: "tools.academicReport.title", description: "tools.academicReport.blurb" },
  "/trust/": { title: "tools.trust.title", description: "tools.trust.blurb" },
  "/dashboard/": { title: "dashboard.title", description: "dashboard.subtitle" },
  "/account/": { title: "account.title", description: "account.subtitle" },
  "/pricing/": { title: "pricing.meta.title", description: "pricing.meta.description" },
  "/instantgpa-pro/": { title: "pro.meta.title", description: "pro.meta.description" },
  "/pro-workspace/": { title: "pro.meta.title", description: "pro.meta.description" },
};

function normalizedPath(pathname: string) {
  if (pathname === "/") return "/";
  return `/${pathname.replace(/^\/+|\/+$/g, "")}/`;
}

function canonicalPath(pathname: string) {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/g, "");
}

function localizedPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const hadLocalePrefix = Boolean(parts[0] && LANGUAGES[parts[0]]);
  const hadRetiredLocalePrefix = Boolean(parts[0] && RETIRED_LANGUAGE_CODES.has(parts[0]));
  if (hadRetiredLocalePrefix) parts.shift();
  const requestedLocale = hadLocalePrefix ? parts.shift()! : "en";
  return {
    locale: requestedLocale,
    pathname: normalizedPath(`/${parts.join("/")}`),
    hadLocalePrefix,
    hadRetiredLocalePrefix,
  };
}

function localizedPathname(pathname: string, locale: string) {
  const canonical = canonicalPath(pathname);
  if (locale === "en") return canonical;
  return canonical === "/" ? `/${locale}` : `/${locale}${canonical}`;
}

function localizedUrl(pathname: string, locale: string) {
  return `${ORIGIN}${localizedPathname(pathname, locale)}`;
}

function translatedMeta(pathname: string, locale: string) {
  const englishMeta = ROUTES[pathname];
  if (!englishMeta || locale === "en") return englishMeta;
  const keys = ROUTE_TRANSLATION_KEYS[pathname];
  if (!keys) return englishMeta;
  const dictionary = LANGUAGES[locale].dictionary;
  const translatedTitle = dictionary[keys.title] || englishMeta.title.replace(/ \| InstantGPA/g, "");
  return {
    ...englishMeta,
    title: `${translatedTitle} | InstantGPA`,
    description: dictionary[keys.description] || englishMeta.description,
    h1: translatedTitle,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

export function siteResponse(request: Request) {
  const requestUrl = new URL(request.url);
  const localized = localizedPath(requestUrl.pathname);
  const pathname = localized.pathname;
  const locale = localized.locale;
  const isAgentPreview = ["terminal.local", "127.0.0.1", "localhost"].includes(requestUrl.hostname);
  if (localized.hadRetiredLocalePrefix) {
    const redirectOrigin = isAgentPreview ? requestUrl.origin : ORIGIN;
    const redirectUrl = new URL(localizedPathname(pathname, "en"), redirectOrigin);
    redirectUrl.search = requestUrl.search;
    return Response.redirect(redirectUrl.toString(), 301);
  }
  const legacyRedirect = LEGACY_ROUTE_REDIRECTS[pathname];
  if (legacyRedirect) {
    const redirectOrigin = isAgentPreview ? requestUrl.origin : ORIGIN;
    const redirectPath = localizedPathname(legacyRedirect, locale);
    const redirectUrl = new URL(redirectPath, redirectOrigin);
    redirectUrl.search = requestUrl.search;
    return Response.redirect(redirectUrl.toString(), 301);
  }
  if (pathname === "/grading-system/") {
    const redirectOrigin = isAgentPreview ? requestUrl.origin : ORIGIN;
    const redirectPath = localizedPathname("/", locale);
    return Response.redirect(new URL(redirectPath, redirectOrigin).toString(), 301);
  }
  const isNotFound = !ROUTES[pathname];
  const meta = translatedMeta(pathname, locale) || {
    title: "Page not found | InstantGPA",
    description: "The requested InstantGPA page could not be found.",
    index: false,
  };
  const canonicalLocale = meta.localized === false ? "en" : locale;
  const canonicalRequestPath = localizedPathname(pathname, canonicalLocale);
  const canonicalHost = new URL(ORIGIN).hostname;
  if (
    !isAgentPreview &&
    !isNotFound &&
    (
      requestUrl.hostname !== canonicalHost ||
      (localized.hadLocalePrefix && locale === "en") ||
      requestUrl.pathname !== canonicalRequestPath
    )
  ) {
    const redirectUrl = new URL(`${ORIGIN}${canonicalRequestPath}`);
    redirectUrl.search = requestUrl.search;
    return Response.redirect(redirectUrl.toString(), 301);
  }
  const canonical = isNotFound ? `${ORIGIN}/` : localizedUrl(pathname, canonicalLocale);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const usesApprovedTemplate = pathname === "/";
  const isPublicTool = !isNotFound && meta.index !== false;
  const seoLinks = CRAWLABLE_ROUTES
    .filter(([href]) => href !== pathname)
    .map(([href, label]) => {
      const hrefLocale = ROUTES[href]?.localized === false ? "en" : locale;
      return `<a href="${localizedPathname(href, hrefLocale)}">${escapeHtml(label)}</a>`;
    })
    .join("");
  const visibleBreadcrumb = pathname === "/" ? "" : `<nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="${localizedPathname("/", locale)}">InstantGPA</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(meta.h1 || meta.title.replace(/ \| InstantGPA/g, ""))}</span></nav>`;
  const showFaqs = locale === "en" && Boolean(meta.faqs?.length);
  const faqSection = showFaqs
    ? `<section class="seo-faq"><h2>Frequently asked questions</h2>${meta.faqs!.map((faq) => `<details><summary>${escapeHtml(faq.q)}</summary><p>${escapeHtml(faq.a)}</p></details>`).join("")}</section>`
    : "";
  const seoIntro = `<section class="seo-intro">${visibleBreadcrumb}<h1>${escapeHtml(meta.h1 || meta.title.replace(/ \| InstantGPA/g, ""))}</h1><p>${escapeHtml(meta.description)}</p>${isPublicTool ? `<nav aria-label="Related academic tools">${seoLinks}</nav>` : ""}${faqSection}</section>`;
  const alternateLinks = isNotFound ? "" : [
    ...(meta.localized === false ? [] : Object.keys(LANGUAGES).map((language) =>
      `<link rel="alternate" hreflang="${language}" href="${localizedUrl(pathname, language)}">`)),
    `<link rel="alternate" hreflang="x-default" href="${localizedUrl(pathname, "en")}">`,
  ].join("");
  const breadcrumb = pathname === "/" ? null : {
    "@type": "BreadcrumbList",
    "@id": `${canonical}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "InstantGPA", item: localizedUrl("/", locale) },
      { "@type": "ListItem", position: 2, name: meta.title.replace(/ \| InstantGPA/g, ""), item: canonical },
    ],
  };
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${ORIGIN}/#organization`,
        name: "InstantGPA",
        url: `${ORIGIN}/`,
        logo: `${ORIGIN}/assets/icons/favicon.svg`,
        founder: { "@id": `${ORIGIN}/about#mohamed-elmorsy` },
      },
      {
        "@type": "Person",
        "@id": `${ORIGIN}/about#mohamed-elmorsy`,
        name: "Mohamed Elmorsy",
        url: `${ORIGIN}/about`,
        jobTitle: "Assistant Lecturer and PhD Candidate",
      },
      {
        "@type": "WebSite",
        "@id": `${ORIGIN}/#website`,
        name: "InstantGPA",
        alternateName: "Instant GPA",
        url: `${ORIGIN}/`,
        inLanguage: locale,
        publisher: { "@id": `${ORIGIN}/#organization` },
      },
      {
        "@type": "WebApplication",
        "@id": `${ORIGIN}/#app`,
        name: "InstantGPA",
        url: `${ORIGIN}/`,
        description: ROUTES["/"].description,
        inLanguage: locale,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript and a modern web browser",
        isAccessibleForFree: true,
        publisher: { "@id": `${ORIGIN}/#organization` },
      },
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: meta.title,
        description: meta.description,
        inLanguage: locale,
        isPartOf: { "@id": `${ORIGIN}/#website` },
        about: { "@id": `${ORIGIN}/#app` },
        ...(breadcrumb ? { breadcrumb: { "@id": `${canonical}#breadcrumb` } } : {}),
      },
      ...(breadcrumb ? [breadcrumb] : []),
      ...(meta.article ? [{
        "@type": "Article",
        "@id": `${canonical}#article`,
        headline: meta.title.replace(/ \| InstantGPA/g, ""),
        description: meta.description,
        mainEntityOfPage: { "@id": `${canonical}#webpage` },
        author: { "@id": `${ORIGIN}/about#mohamed-elmorsy` },
        publisher: { "@id": `${ORIGIN}/#organization` },
        datePublished: "2026-07-29",
        dateModified: "2026-07-29",
        inLanguage: "en",
      }] : []),
      ...(pathname === "/resources/university-gpa-policy-directory/" ? [{
        "@type": "Dataset",
        "@id": `${canonical}#dataset`,
        name: "InstantGPA Verified University GPA Policy Sources",
        description: meta.description,
        url: canonical,
        creator: { "@id": `${ORIGIN}/#organization` },
        datePublished: "2026-07-29",
        dateModified: "2026-07-29",
        version: "2026.07.29",
        isAccessibleForFree: true,
        keywords: [
          "university GPA policies",
          "official grading scales",
          "GPA formulas",
          "grade points",
          "academic regulations",
        ],
        distribution: [
          {
            "@type": "DataDownload",
            encodingFormat: "application/json",
            contentUrl: `${ORIGIN}/data/university-policies.json`,
          },
          {
            "@type": "DataDownload",
            name: "GPA formula validation pack",
            encodingFormat: "application/json",
            contentUrl: `${ORIGIN}/data/gpa-formula-validation-pack.json`,
          },
          {
            "@type": "DataDownload",
            name: "GPA formula validation pack",
            encodingFormat: "text/csv",
            contentUrl: `${ORIGIN}/data/gpa-formula-validation-pack.csv`,
          },
        ],
      }] : []),
      ...(pathname === "/instantgpa-pro/" ? [{
        "@type": "SoftwareApplication",
        "@id": `${canonical}#pro`,
        name: "InstantGPA Pro",
        description: meta.description,
        url: canonical,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Any",
        isAccessibleForFree: false,
        featureList: [
          "Syllabus assessment and calendar extraction",
          "Academic Twin GPA, cost, load, time, and risk scenarios",
          "Transfer course matching with confidence",
          "Document consistency and review-readiness signals",
          "Expiring adviser review links",
        ],
        publisher: { "@id": `${ORIGIN}/#organization` },
      }] : []),
      ...(showFaqs ? [{
        "@type": "FAQPage",
        "@id": `${canonical}#faq`,
        mainEntity: meta.faqs!.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a },
        })),
      }] : []),
    ],
  };
  const templateHtml = usesApprovedTemplate ? approvedTemplateHtml : indexHtml;
  const htmlWithMeta = templateHtml
    .replace(/<html lang=".*?" dir=".*?">/, `<html lang="${locale}" dir="${LANGUAGES[locale].dir}">`)
    .replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`)
    .replace(/<meta name="description" content=".*?"\s*\/?>/, `<meta name="description" content="${escapeHtml(meta.description)}">`)
    .replace(/<meta name="robots" content=".*?"\s*\/?>/, `<meta name="robots" content="${meta.index === false || isNotFound ? "noindex,nofollow" : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"}">`)
    .replace(/<link rel="canonical" href=".*?"\s*\/?>/, `<link rel="canonical" href="${canonical}">${alternateLinks}`)
    .replace(/<meta property="og:locale" content=".*?"\s*\/?>/, `<meta property="og:locale" content="${LANGUAGES[locale].ogLocale}">`)
    .replace(/<meta property="og:title" content=".*?"\s*\/?>/, `<meta property="og:title" content="${escapeHtml(meta.title)}">`)
    .replace(/<meta property="og:description" content=".*?"\s*\/?>/, `<meta property="og:description" content="${escapeHtml(meta.description)}">`)
    .replace(/<meta property="og:url" content=".*?"\s*\/?>/, `<meta property="og:url" content="${canonical}">`)
    .replace(/<meta name="twitter:title" content=".*?"\s*\/?>/, `<meta name="twitter:title" content="${escapeHtml(meta.title)}">`)
    .replace(/<meta name="twitter:description" content=".*?"\s*\/?>/, `<meta name="twitter:description" content="${escapeHtml(meta.description)}">`)
    .replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(structuredData)}</script>`,
    )
    .replace("<noscript>", `${seoIntro}<noscript>`);
  const html = usesApprovedTemplate
    ? htmlWithMeta
      .replace(
        "</head>",
        `<script nonce="${nonce}">window.INSTANTGPA_SEO_CONTEXT=${JSON.stringify({ lang: locale })};</script></head>`,
      )
      .replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`)
    : htmlWithMeta;

  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.gstatic.com`,
    `style-src 'self' 'unsafe-inline'${usesApprovedTemplate ? " https://fonts.googleapis.com" : ""}`,
    "img-src 'self' data: blob:",
    `font-src 'self' data:${usesApprovedTemplate ? " https://fonts.gstatic.com" : ""}`,
    `connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com https://firebaseappcheck.googleapis.com https://firestore.googleapis.com https://www.googleapis.com${usesApprovedTemplate ? " https://universities.hipolabs.com" : ""}`,
    "frame-src https://accounts.google.com https://instantgpa.firebaseapp.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isAgentPreview ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  return new Response(html, {
    status: isNotFound ? 404 : 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": meta.index === false ? "private, no-cache" : "public, max-age=0, must-revalidate",
      "content-security-policy": contentSecurityPolicy,
      "cross-origin-opener-policy": "same-origin-allow-popups",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "referrer-policy": "strict-origin-when-cross-origin",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "content-language": locale,
      ...(isPublicTool ? { link: `<${canonical}>; rel="canonical"` } : {}),
      ...(meta.index === false || isNotFound ? { "x-robots-tag": "noindex, nofollow" } : {}),
    },
  });
}
