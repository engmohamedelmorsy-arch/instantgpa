import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const workerPath = new URL("../dist/server/index.js", import.meta.url);
let viteServer;
let renderSite;

test("build includes development preview metadata", async () => {
  const bundle = await readFile(workerPath, "utf8");
  assert.match(bundle, /codex-preview/);
  assert.match(bundle, /development/);
});

async function serverRenderer() {
  if (!viteServer) {
    viteServer = await createServer({
      appType: "custom",
      configFile: false,
      root: fileURLToPath(new URL("..", import.meta.url)),
      server: { middlewareMode: true },
    });
    ({ siteResponse: renderSite } = await viteServer.ssrLoadModule("/app/site-html.ts"));
  }
  return { fetch: (request) => renderSite(request) };
}

after(async () => {
  await viteServer?.close();
});

function occurrences(html, pattern) {
  return [...html.matchAll(pattern)].length;
}

test("initial HTML contains one complete metadata set for every priority route", async () => {
  const worker = await serverRenderer();
  const routes = [
    ["/", "GPA Calculator, Transcript Import & Graduation Planner | InstantGPA", "https://instantgpa.com/"],
    ["/college-gpa-calculator", "Free College GPA Calculator with Credits | InstantGPA", "https://instantgpa.com/college-gpa-calculator"],
    ["/cgpa-calculator", "Cumulative GPA & CGPA Calculator | InstantGPA", "https://instantgpa.com/cgpa-calculator"],
    ["/transcript-gpa-calculator", "Transcript GPA Calculator & Course Import | InstantGPA", "https://instantgpa.com/transcript-gpa-calculator"],
    ["/target-gpa-calculator", "Target GPA Calculator: What GPA Do I Need? | InstantGPA", "https://instantgpa.com/target-gpa-calculator"],
    ["/gpa-retake-calculator", "GPA Retake & Grade Replacement Calculator | InstantGPA", "https://instantgpa.com/gpa-retake-calculator"],
    ["/degree-audit-graduation-planner", "Degree Audit & Graduation Planner | InstantGPA", "https://instantgpa.com/degree-audit-graduation-planner"],
    ["/international-gpa-converter", "International GPA & Grading Scale Converter | InstantGPA", "https://instantgpa.com/international-gpa-converter"],
    ["/pricing", "InstantGPA Plans: Free Tools & PayPal Premium", "https://instantgpa.com/pricing"],
  ];

  for (const [pathname, title, canonical] of routes) {
    const response = await worker.fetch(new Request(`https://instantgpa.com${pathname}`), {}, {});
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    assert.equal(occurrences(html, /<title>/g), 1, `${pathname} title count`);
    assert.equal(occurrences(html, /<meta name="description"/g), 1, `${pathname} description count`);
    assert.equal(occurrences(html, /<link rel="canonical"/g), 1, `${pathname} canonical count`);
    assert.match(html, new RegExp(`<title>${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/title>`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">`));
    assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">/);
    assert.match(html, /<h1(?:\s[^>]*)?>[^<]+<\/h1>/);
    if (pathname !== "/") assert.match(html, /class="seo-breadcrumbs"/);
    const jsonLd = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(jsonLd, `${pathname} JSON-LD`);
    const graph = JSON.parse(jsonLd)["@graph"];
    assert.ok(graph.some((node) => node["@type"] === "Organization"));
    assert.ok(graph.some((node) => node["@type"] === "WebSite"));
    assert.ok(graph.some((node) => node["@type"] === "WebApplication"));
    if (pathname !== "/") assert.ok(graph.some((node) => node["@type"] === "BreadcrumbList"));
  }
});

test("home route renders and packages the supplied Modernist visual template", async () => {
  const worker = await serverRenderer();
  const response = await worker.fetch(new Request("https://instantgpa.com/"), {}, {});
  const html = await response.text();
  const packagedCss = await readFile(
    new URL("../dist/client/assets/modernist-v85.css", import.meta.url),
    "utf8",
  );

  assert.equal(response.status, 200);
  assert.match(html, /Don’t guess your GPA\. Own it\./);
  assert.match(html, /Four free tools, ready now/);
  assert.match(html, /Enter it once\. Reuse it everywhere\./);
  assert.match(html, /ACTIVE ACADEMIC WORKSPACE/);
  assert.match(html, /href="\/account\/" id="accountButton"/);
  assert.match(html, /\/assets\/modernist-v85\.css/);
  assert.doesNotMatch(html, /\/assets\/approved-v84\.css/);
  assert.doesNotMatch(html, /id="calcRoot"|class="app-workspace/);
  assert.ok(packagedCss.length > 20_000, "Modernist stylesheet must be packaged");
  assert.match(packagedCss, /\.modern-hero\s*\{/);
  assert.match(packagedCss, /\.gpa-calculator-grid\s*\{/);
  assert.match(packagedCss, /--ig-gold:\s*#ad7d1e/);
  assert.match(packagedCss, /border-radius:\s*0\s*!important/);
  assert.doesNotMatch(html, /temporarily-frozen-control" id="accountButton"/);
});

test("legacy, alternate-host, private, and missing routes have correct indexing behavior", async () => {
  const worker = await serverRenderer();
  const legacy = await worker.fetch(new Request("https://instantgpa.com/gpa-calculator"), {}, {});
  assert.equal(legacy.status, 301);
  assert.equal(legacy.headers.get("location"), "https://instantgpa.com/college-gpa-calculator");

  const retiredLanguage = await worker.fetch(new Request("https://instantgpa.com/fr/college-gpa-calculator?source=old"), {}, {});
  assert.equal(retiredLanguage.status, 301);
  assert.equal(retiredLanguage.headers.get("location"), "https://instantgpa.com/college-gpa-calculator?source=old");

  const arabic = await worker.fetch(new Request("https://instantgpa.com/ar"), {}, {});
  const arabicHtml = await arabic.text();
  assert.equal(arabic.status, 200);
  assert.match(arabicHtml, /<html lang="ar" dir="rtl">/);
  assert.match(arabicHtml, /hreflang="ar"/);
  assert.doesNotMatch(arabicHtml, /hreflang="(?:zh|hi|es|fr|pt|id|ru|tr)"/);

  const www = await worker.fetch(new Request("https://www.instantgpa.com/cgpa-calculator"), {}, {});
  assert.equal(www.status, 301);
  assert.equal(www.headers.get("location"), "https://instantgpa.com/cgpa-calculator");

  for (const pathname of ["/account", "/dashboard", "/admin", "/pro-workspace"]) {
    const response = await worker.fetch(new Request(`https://instantgpa.com${pathname}`), {}, {});
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  }

  const missing = await worker.fetch(new Request("https://instantgpa.com/not-a-real-page"), {}, {});
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("country hint implementation uses edge country only and never forwards an IP address", async () => {
  const source = await readFile(new URL("../app/api/location/route.ts", import.meta.url), "utf8");
  assert.match(source, /cf-ipcountry/);
  assert.match(source, /approximate-ip/);
  assert.doesNotMatch(source, /x-forwarded-for|cf-connecting-ip|request\.ip/i);
});
