import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { UI_PHRASEBOOKS } from "../static-site/assets/ui-phrases.js";

const root = new URL("../", import.meta.url);
const languages = ["en", "ar"];

test("all supported languages have complete interface phrasebooks", () => {
  assert.deepEqual(Object.keys(UI_PHRASEBOOKS).sort(), [...languages].sort());
  const expectedLength = UI_PHRASEBOOKS.en.length;
  assert.ok(expectedLength >= 279);
  for (const language of languages) {
    assert.equal(UI_PHRASEBOOKS[language].length, expectedLength, language);
    assert.ok(UI_PHRASEBOOKS[language].every((value) => String(value).trim()), language);
  }
});

test("Arabic translates redesigned, dynamic, and OCR interface text", () => {
  const index = UI_PHRASEBOOKS.en.indexOf("Uploading to secure Google Document AI processing in the EU…");
  assert.ok(index >= 0);
  assert.notEqual(
    UI_PHRASEBOOKS.ar[index],
    UI_PHRASEBOOKS.en[index],
  );
  assert.notEqual(
    UI_PHRASEBOOKS.ar[UI_PHRASEBOOKS.en.indexOf("Turn one transcript into")],
    "Turn one transcript into",
  );
  assert.notEqual(
    UI_PHRASEBOOKS.ar[UI_PHRASEBOOKS.en.indexOf("{count} courses · {credits} credits")],
    "{count} courses · {credits} credits",
  );
});

test("the public language selector exposes English and Arabic only", async () => {
  const html = await readFile(new URL("static-site/approved-template.html", root), "utf8");
  const optionCodes = [...html.matchAll(/<option value="([a-z]{2})"/g)].map((match) => match[1]);
  assert.deepEqual(optionCodes, languages);
  assert.doesNotMatch(html, /value="(?:zh|hi|es|fr|pt|id|ru|tr)"/);
});

test("translation JSON dictionaries have identical non-empty key sets", async () => {
  const dictionaries = Object.fromEntries(await Promise.all(languages.map(async (language) => {
    const url = new URL(`static-site/data/translations/${language}.json`, root);
    return [language, JSON.parse(await readFile(url, "utf8"))];
  })));
  const englishKeys = Object.keys(dictionaries.en).sort();
  assert.ok(englishKeys.length >= 240);
  for (const language of languages) {
    assert.deepEqual(Object.keys(dictionaries[language]).sort(), englishKeys, language);
    assert.ok(Object.values(dictionaries[language]).every((value) => String(value).trim()), language);
  }
});

test("automatic localization covers app rerenders while legal pages keep the current approved policy", async () => {
  const localization = await readFile(new URL("static-site/assets/localization.js", root), "utf8");
  assert.match(localization, /new MutationObserver/);
  assert.match(localization, /translateInterface\(root\)/);
  assert.match(localization, /document\.documentElement\.dir = language\.dir/);

  for (const page of ["privacy", "terms", "disclaimer"]) {
    const html = await readFile(new URL(`static-site/${page}.html`, root), "utf8");
    assert.doesNotMatch(html, /\/assets\/legal-page\.js/);
  }
  const privacy = await readFile(new URL("static-site/privacy.html", root), "utf8");
  const terms = await readFile(new URL("static-site/terms.html", root), "utf8");
  assert.match(privacy, /synchronize pseudonymously to Cloudflare D1/);
  assert.match(privacy, /Firebase Authentication and Firestore are the single subscriber-data store/);
  assert.match(privacy, /Resend sends transactional welcome/);
  assert.match(privacy, /المستخدم المجاني/);
  assert.match(privacy, /المشترك Premium/);
  assert.match(privacy, /PayPal/);
  assert.match(terms, /Plan status is checked by the server against PayPal/);
});
