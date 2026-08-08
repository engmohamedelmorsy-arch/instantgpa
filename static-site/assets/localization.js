// localization.js
// InstantGPA intentionally supports two interface languages: English and
// Arabic (RTL). Academic data entered by a student remains in its source
// language; only the product interface is translated.
//
// NOT YET DONE: translated tables/results (e.g. course names a student
// types in) obviously stay in whatever language the student typed them —
// only the app's own interface strings are translated here, which matches
// what "translatable UI strings" means. Country/university terminology
// adaptation (e.g. "Module" vs "Course" per region) is not implemented;
// every language currently uses the same academic vocabulary translated
// literally.

import { Storage } from "./storage.js";
import { UI_PHRASEBOOKS } from "./ui-phrases.js";

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
];

let dict = {};
let englishDict = {};
let currentLang = "en";
let phraseMap = new Map();
let phrasePatterns = [];
let translationObserver = null;

export function currentLanguage() {
  return currentLang;
}

export function t(key, params = {}) {
  return interpolate(dict[key] ?? englishDict[key] ?? key, params);
}

export async function loadLanguage(code) {
  const language = SUPPORTED_LANGUAGES.find((item) => item.code === code)
    || SUPPORTED_LANGUAGES[0];
  const supported = language.code;
  const [englishResponse, languageResponse] = await Promise.all([
    fetch("/data/translations/en.json"),
    fetch(`/data/translations/${supported}.json`),
  ]);
  if (!englishResponse.ok || !languageResponse.ok) {
    throw new Error(`Failed to load language: ${supported}`);
  }
  englishDict = await englishResponse.json();
  dict = await languageResponse.json();
  currentLang = supported;
  buildPhraseMap(supported);
  document.documentElement.lang = supported;
  document.documentElement.dir = language.dir;
  document.body.dir = language.dir;
  Storage.set("language", supported);
  startAutomaticTranslation();
  applyStaticTranslations(document);
  return dict;
}

export function getSavedLanguage() {
  return Storage.get("language", null);
}

// Re-applies every [data-i18n] text node and [data-i18n-placeholder] attribute
// in the current document. Call after loadLanguage() and after re-rendering
// any static chrome (header/footer) that isn't rebuilt by a tool module.
export function applyStaticTranslations(root = document) {
  const query = typeof root?.querySelectorAll === "function"
    ? root.querySelectorAll.bind(root)
    : () => [];
  query("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  query("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
  query("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  });
  translateInterface(root);
}

function interpolate(value, params = {}) {
  return Object.entries(params).reduce(
    (result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)),
    String(value),
  );
}

function normalized(value) {
  return String(value)
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[.:!?→]+$/u, "")
    .replace(/\s+/gu, " ");
}

function buildPhraseMap(languageCode) {
  phraseMap = new Map();
  const normalizedMap = new Map();
  Object.entries(englishDict).forEach(([key, english]) => {
    const translated = dict[key] ?? english;
    phraseMap.set(String(english), String(translated));
    normalizedMap.set(normalized(english), String(translated));
  });

  const englishPhrases = UI_PHRASEBOOKS.en;
  const localizedPhrases = UI_PHRASEBOOKS[languageCode] || englishPhrases;
  englishPhrases.forEach((english, index) => {
    const translated = localizedPhrases[index] || english;
    phraseMap.set(english, translated);
    normalizedMap.set(normalized(english), translated);
  });

  phraseMap.normalized = normalizedMap;
  phrasePatterns = [...phraseMap.entries()]
    .filter(([english]) => /\{[a-z][a-z0-9]*\}/i.test(english))
    .map(([english, translated]) => {
      const names = [...english.matchAll(/\{([a-z][a-z0-9]*)\}/gi)].map((match) => match[1]);
      const source = english
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\{[a-z][a-z0-9]*\\\}/gi, "(.+?)");
      return { regex: new RegExp(`^${source}$`, "u"), names, translated };
    });
}

export function translateInterface(root = document) {
  if (currentLang === "en" || !root || typeof Node === "undefined") return;
  const nodes = [];
  if (root.nodeType === Node.TEXT_NODE) nodes.push(root);
  else if (root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_NODE) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest("[data-no-i18n], script, style, textarea")) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
  }

  nodes.forEach((node) => {
    const original = node.nodeValue;
    const trimmed = original.trim();
    const translated = translatePhrase(trimmed);
    if (translated === trimmed) return;
    node.nodeValue = original.replace(trimmed, translated);
  });

  const elements = root.nodeType === Node.ELEMENT_NODE
    ? [root, ...root.querySelectorAll("*")]
    : [...root.querySelectorAll?.("*") || []];
  elements.forEach((element) => {
    if (element.closest("[data-no-i18n]")) return;
    ["placeholder", "aria-label", "title"].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      const translated = translatePhrase(value);
      if (translated !== value) element.setAttribute(attribute, translated);
    });
  });
}

function translatePhrase(value) {
  if (!value || currentLang === "en") return value;
  const exact = phraseMap.get(value);
  if (exact) return exact;
  const normalizedMatch = phraseMap.normalized?.get(normalized(value));
  if (normalizedMatch) return normalizedMatch;
  for (const pattern of phrasePatterns) {
    const match = value.match(pattern.regex);
    if (!match) continue;
    const params = Object.fromEntries(pattern.names.map((name, index) => [name, match[index + 1]]));
    return interpolate(pattern.translated, params);
  }
  return value;
}

function startAutomaticTranslation() {
  translationObserver?.disconnect();
  if (currentLang === "en" || !document.body || typeof MutationObserver !== "function") return;
  translationObserver = new MutationObserver((mutations) => {
    translationObserver.disconnect();
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") translateInterface(mutation.target);
      mutation.addedNodes.forEach((node) => translateInterface(node));
      if (mutation.type === "attributes") translateInterface(mutation.target);
    });
    translationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "title"],
    });
  });
  translationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["placeholder", "aria-label", "title"],
  });
}
