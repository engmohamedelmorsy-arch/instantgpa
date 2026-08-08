import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("public academic tools have unique crawlable metadata and structured data", async () => {
  const source = await read("app/site-html.ts");

  assert.match(source, /GPA Calculator, Transcript Import & Graduation Planner \| InstantGPA/);
  assert.match(source, /Free College GPA Calculator with Credits \| InstantGPA/);
  assert.match(source, /Cumulative GPA & CGPA Calculator \| InstantGPA/);
  assert.match(source, /Transcript GPA Calculator & Course Import \| InstantGPA/);
  assert.match(source, /Target GPA Calculator: What GPA Do I Need\? \| InstantGPA/);
  assert.match(source, /GPA Retake & Grade Replacement Calculator \| InstantGPA/);
  assert.match(source, /Degree Audit & Graduation Planner \| InstantGPA/);
  assert.match(source, /International GPA & Grading Scale Converter \| InstantGPA/);
  assert.match(source, /Graduation Planner from Transcript & Degree Requirements/);
  assert.match(source, /Academic Journey Report: GPA, Degree Audit & Plan/);
  assert.match(source, /From Transcript to GPA, Degree Audit & Graduation Plan/);
  assert.match(source, /Editorial, Source & Academic Review Policy/);
  assert.match(source, /universities\/universiti-malaya\/gpa-calculator/);
  assert.match(source, /"@type": "WebSite"/);
  assert.match(source, /"@type": "WebApplication"/);
  assert.match(source, /applicationCategory: "EducationalApplication"/);
  assert.match(source, /"@type": "BreadcrumbList"/);
  assert.match(source, /status: isNotFound \? 404 : 200/);
  assert.match(source, /"x-robots-tag": "noindex, nofollow"/);
});

test("sitemap contains only public pages and robots protects private routes", async () => {
  const [sitemap, robots] = await Promise.all([
    read("static-site/sitemap.xml"),
    read("static-site/robots.txt"),
  ]);

  for (const path of [
    "/college-gpa-calculator",
    "/cgpa-calculator",
    "/transcript-gpa-calculator",
    "/degree-audit-graduation-planner",
    "/planning",
    "/target-gpa-calculator",
    "/gpa-retake-calculator",
    "/international-gpa-converter",
    "/academic-report",
    "/pricing",
    "/instantgpa-pro",
    "/transcript-to-graduation-plan",
    "/guides/gpa-calculation-example",
    "/resources/university-gpa-policy-directory",
    "/universities/ucla/gpa-calculator",
  ]) {
    assert.match(sitemap, new RegExp(`<loc>https://instantgpa\\.com${path}</loc>`));
  }

  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(locations.length, 52);
  assert.equal(new Set(locations).size, locations.length);
  assert.ok(locations.every((url) =>
    url === "https://instantgpa.com/" || !new URL(url).pathname.endsWith("/")));
  assert.ok(locations.every((url) => !/\/en(?:\/|$)/.test(new URL(url).pathname)));
  const alternateUrls = [...sitemap.matchAll(/<xhtml:link[^>]+href="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.ok(alternateUrls.every((url) =>
    url === "https://instantgpa.com/" || !new URL(url).pathname.endsWith("/")));

  assert.doesNotMatch(sitemap, /\/(?:admin|account|dashboard|pro-workspace)(?:\/|<)/);
  assert.doesNotMatch(sitemap, /\/grading-system(?:\/|<)/);
  assert.doesNotMatch(sitemap, /https:\/\/instantgpa\.com\/(?:[a-z]{2}\/)?(?:gpa-calculator|transcript-import|degree-audit|graduation-predictor|retake-calculator|grade-converter)(?:\/|<)/);
  assert.doesNotMatch(robots, /Disallow: \/(?:admin|account|dashboard)\//);
  assert.match(robots, /Disallow: \/api\//);
});

test("SEO content is visible and does not use hidden keyword stuffing", async () => {
  const [htmlSource, css, indexHtml] = await Promise.all([
    read("app/site-html.ts"),
    read("static-site/assets/app.css"),
    read("static-site/index.html"),
  ]);

  assert.match(htmlSource, /class="seo-intro"/);
  assert.match(htmlSource, /class="seo-breadcrumbs"/);
  assert.match(htmlSource, /aria-label="Related academic tools"/);
  assert.match(indexHtml, /index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1/);
  assert.doesNotMatch(indexHtml, /<meta\s+name=["']keywords["']/i);
  assert.doesNotMatch(css, /\.seo-intro[^{]*\{[^}]*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|rem|em|;|\s*!|\s*}))/is);
});

test("localized routes use language URLs, reciprocal hreflang, and matching direction", async () => {
  const [htmlSource, appSource, sitemap] = await Promise.all([
    read("app/site-html.ts"),
    read("static-site/assets/app.js"),
    read("static-site/sitemap.xml"),
  ]);

  assert.match(htmlSource, /hreflang="x-default"/);
  assert.match(htmlSource, /<html lang="\$\{locale\}" dir="\$\{LANGUAGES\[locale\]\.dir\}">/);
  assert.match(appSource, /localizedRoutePath/);
  assert.match(sitemap, /https:\/\/instantgpa\.com\/ar\/college-gpa-calculator/);
  assert.match(sitemap, /hreflang="ar"/);
  assert.doesNotMatch(sitemap, /hreflang="(?:zh|hi|es|fr|pt|id|ru|tr)"/);
  assert.match(sitemap, /hreflang="x-default"/);
});

test("canonical redirects and trust signals are explicit", async () => {
  const [source, appSource, editorial, methodology] = await Promise.all([
    read("app/site-html.ts"),
    read("static-site/assets/app.js"),
    read("static-site/assets/editorial-content.js"),
    read("static-site/assets/trust-methodology.js"),
  ]);

  assert.match(source, /function canonicalPath\(pathname: string\)/);
  assert.match(source, /requestUrl\.hostname !== canonicalHost/);
  assert.match(source, /requestUrl\.pathname !== canonicalRequestPath/);
  assert.match(source, /Response\.redirect\(redirectUrl\.toString\(\), 301\)/);
  assert.match(source, /LEGACY_ROUTE_REDIRECTS/);
  assert.doesNotMatch(source, /pathname\.endsWith\("\/"\)/);
  assert.match(appSource, /if \(!route\) return prefix \|\| "\/"/);
  assert.doesNotMatch(appSource, /return `\$\{prefix\}\/\$\{route\}\$\{route \? "\/" : ""\}`/);
  assert.match(source, /rel="canonical"/);
  assert.match(source, /Assistant Lecturer and PhD Candidate/);
  assert.match(source, /"@type": "Article"/);
  assert.match(editorial, /Official verified/);
  assert.match(editorial, /independent Registrar or credential-evaluation reviewer has not yet been appointed/i);
  assert.match(methodology, /METHOD_VERSION = "2026\.07\.29"/);
  assert.match(methodology, /Known limitations/);
});

test("linkable university policy directory is versioned and source backed", async () => {
  const [source, editorial, data, validationPack] = await Promise.all([
    read("app/site-html.ts"),
    read("static-site/assets/editorial-content.js"),
    read("static-site/data/university-policies.json"),
    read("static-site/data/gpa-formula-validation-pack.json"),
  ]);

  assert.match(source, /Verified University GPA Policy Sources & Dataset/);
  assert.match(source, /"@type": "Dataset"/);
  assert.match(source, /contentUrl: `\$\{ORIGIN\}\/data\/university-policies\.json`/);
  assert.match(editorial, /Citable academic data resource/);
  assert.match(editorial, /Download university policy JSON/);
  assert.match(editorial, /Download validation JSON/);
  assert.match(editorial, /Download validation CSV/);
  assert.match(editorial, /How to cite this resource/);
  const parsed = JSON.parse(data);
  assert.equal(parsed.reviewedAt, "2026-08-08");
  assert.equal(Object.keys(parsed.policies).length, 18);
  for (const policy of Object.values(parsed.policies)) {
    assert.match(policy.verification, /^Official verified/);
    assert.ok(policy.sources.length >= 1);
    assert.ok(policy.sources.every((source) => /^https:\/\//.test(source.url)));
  }
  const validation = JSON.parse(validationPack);
  assert.equal(validation.version, "2026.07.30");
  assert.equal(validation.cases.length, 6);
  assert.equal(validation.cases[0].expected.gpa, 3.5833333333);
  assert.match(source, /gpa-formula-validation-pack\.json/);
  assert.match(source, /gpa-formula-validation-pack\.csv/);
});

test("academic report exports and protected sharing are implemented", async () => {
  const [report, api, publicApi, schema] = await Promise.all([
    read("static-site/assets/academic-report.js"),
    read("app/api/report-shares/route.ts"),
    read("app/api/report-shares/[token]/route.ts"),
    read("db/schema.ts"),
  ]);

  assert.match(report, /Print \/ Save PDF/);
  assert.match(report, /Excel \/ CSV/);
  assert.match(report, /instantgpa-academic-report\.json/);
  assert.match(report, /text\/calendar/);
  assert.match(report, /Results only/);
  assert.match(report, /Full reviewed report/);
  assert.match(api, /requireActiveSubscriber/);
  assert.match(api, /expiresInDays/);
  assert.match(publicApi, /PASSWORD_REQUIRED/);
  assert.match(publicApi, /SHARE_UNAVAILABLE/);
  assert.match(schema, /academic_report_shares/);
});
