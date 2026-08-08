import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every interface language applies its correct writing direction", async () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
      key: (index) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    },
  };
  globalThis.document = {
    documentElement: { lang: "", dir: "" },
    body: { dir: "" },
  };
  globalThis.fetch = async (url) => {
    const code = String(url).match(/\/([^/]+)\.json$/)?.[1];
    if (!code) return new Response("", { status: 404 });
    const body = await readFile(
      new URL(`../static-site/data/translations/${code}.json`, import.meta.url),
      "utf8",
    );
    return new Response(body, { status: 200 });
  };

  const localization = await import(
    new URL(`../static-site/assets/localization.js?direction-test=${Date.now()}`, import.meta.url)
  );

  assert.deepEqual(
    localization.SUPPORTED_LANGUAGES.map((language) => language.code),
    ["en", "ar"],
  );

  for (const language of localization.SUPPORTED_LANGUAGES) {
    await localization.loadLanguage(language.code);
    const expected = language.code === "ar" ? "rtl" : "ltr";
    assert.equal(language.dir, expected, `${language.code} metadata direction`);
    assert.equal(document.documentElement.lang, language.code);
    assert.equal(document.documentElement.dir, expected);
    assert.equal(document.body.dir, expected);
  }
});

test("desktop homepage keeps the approved v76 two-column portal while command-center features stay scoped", async () => {
  const [baseCss, studentCss, navyGoldCss, experienceCss, productCss] = await Promise.all([
    readFile(new URL("../static-site/assets/app.css", import.meta.url), "utf8"),
    readFile(new URL("../static-site/assets/student-ui-v43.css", import.meta.url), "utf8"),
    readFile(new URL("../static-site/assets/navy-gold-v50.css", import.meta.url), "utf8"),
    readFile(new URL("../static-site/assets/experience-v57.css", import.meta.url), "utf8"),
    readFile(new URL("../static-site/assets/product-flow-v60.css", import.meta.url), "utf8"),
  ]);
  const html = await readFile(
    new URL("../static-site/index.html", import.meta.url),
    "utf8",
  );

  assert.match(baseCss, /\.home-stage > \.setup-host\s*\{\s*grid-column:\s*1;/);
  assert.match(studentCss, /\.home-stage\.home-stage--portal\s*\{[\s\S]*grid-template-columns:/);
  assert.match(studentCss, /\.student-goal-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/);
  assert.match(navyGoldCss, /\.home-stage\.home-stage--portal\s*\{[\s\S]*grid-template-columns:/);
  assert.match(navyGoldCss, /width: min\(1280px, 88vw\)/);
  assert.match(experienceCss, /\.home-stage\.home-stage--portal\s*\{[\s\S]*grid-template-columns:/);
  assert.match(experienceCss, /--ig57-content: 1280px/);
  assert.match(productCss, /\.academic-command-center\{/);
  assert.match(productCss, /\.profile-gate-shell[\s\S]*grid-template-columns:/);
  assert.match(html, /app-bundle\.css\?v=20260808-consolidated/);
  assert.equal((html.match(/<link rel="stylesheet" href="\/assets\/[^\"]+\.css/g) || []).length, 1);
  assert.match(html, /app\.js\?v=20260804-command-center-v63/);
});
