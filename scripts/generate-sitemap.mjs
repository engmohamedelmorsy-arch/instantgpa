import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const origin = "https://instantgpa.com";
const locales = ["en", "ar"];
const localizedPaths = [
  "/",
  "/college-gpa-calculator/",
  "/cgpa-calculator/",
  "/international-gpa-converter/",
  "/transcript-gpa-calculator/",
  "/planning/",
  "/degree-audit-graduation-planner/",
  "/weighted-grade/",
  "/gpa-retake-calculator/",
  "/target-gpa-calculator/",
  "/scenario-lab/",
  "/international-systems/",
  "/academic-report/",
  "/trust/",
];
const englishOnlyPaths = [
  "/pricing/",
  "/instantgpa-pro/",
  "/transcript-to-graduation-plan/",
  "/guides/gpa-calculation-example/",
  "/guides/retake-policy-example/",
  "/guides/international-gpa-conversion/",
  "/guides/3-0-gpa/",
  "/guides/3-5-gpa/",
  "/guides/3-7-gpa/",
  "/guides/4-0-gpa/",
  "/about/",
  "/editorial-policy/",
  "/corrections/",
  "/resources/academic-adviser-report/",
  "/resources/university-gpa-policy-directory/",
  "/universities/ucla/gpa-calculator/",
  "/universities/university-of-texas-at-austin/gpa-calculator/",
  "/universities/universiti-malaya/gpa-calculator/",
  "/universities/aastmt/gpa-calculator/",
  "/universities/king-saud-university/gpa-calculator/",
  "/universities/united-arab-emirates-university/gpa-calculator/",
];
const legalPaths = ["/privacy.html", "/terms.html", "/disclaimer.html"];
const lastModified = "2026-07-31";

const canonicalPath = (pathname) =>
  pathname === "/" ? "/" : pathname.replace(/\/+$/g, "");

const localizedUrl = (pathname, locale) => {
  const canonical = canonicalPath(pathname);
  if (locale === "en") return `${origin}${canonical}`;
  return canonical === "/" ? `${origin}/${locale}` : `${origin}/${locale}${canonical}`;
};

const alternates = (pathname) => [
  ...locales.map((locale) =>
    `    <xhtml:link rel="alternate" hreflang="${locale}" href="${localizedUrl(pathname, locale)}"/>`),
  `    <xhtml:link rel="alternate" hreflang="x-default" href="${localizedUrl(pathname, "en")}"/>`,
].join("\n");

const entries = localizedPaths.flatMap((pathname) =>
  locales.map((locale) => `  <url>
    <loc>${localizedUrl(pathname, locale)}</loc>
    <lastmod>${lastModified}</lastmod>
${alternates(pathname)}
  </url>`));

entries.push(...englishOnlyPaths.map((pathname) => `  <url>
    <loc>${origin}${canonicalPath(pathname)}</loc>
    <lastmod>${lastModified}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${origin}${canonicalPath(pathname)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}${canonicalPath(pathname)}"/>
  </url>`));

entries.push(...legalPaths.map((pathname) => `  <url>
    <loc>${origin}${pathname}</loc>
    <lastmod>${lastModified}</lastmod>
  </url>`));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
await writeFile(path.join(scriptDirectory, "../static-site/sitemap.xml"), xml, "utf8");
console.log(`Generated sitemap with ${entries.length} canonical URLs.`);
