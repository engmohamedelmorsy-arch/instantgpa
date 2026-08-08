import { AcademicProfile } from "./academic-profile.js";
import {
  SUPPORTED_LANGUAGES,
  getSavedLanguage,
  loadLanguage,
  t,
} from "./localization.js";
import { Storage } from "./storage.js";
import { track } from "./analytics.js";

const OTHER_COUNTRY = "OTHER";
const OTHER_UNIVERSITY = "__other__";
const LEGACY_PROFILE_KEY = "instantgpa-academic-profile-v5";
const LEGACY_STATE_KEYS = ["instantgpa_state_v1", "gradepath_state_v1"];

const byId = (id) => document.getElementById(id);
const clean = (value) => String(value ?? "").trim();

function readLegacyJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function migrateLegacyDrafts() {
  if (!Storage.get("academicProfileDraft", null)) {
    const legacyProfile = readLegacyJson(LEGACY_PROFILE_KEY);
    if (legacyProfile?.country && legacyProfile?.university) {
      Storage.set("academicProfileDraft", {
        countryCode: clean(legacyProfile.country),
        countryName: clean(legacyProfile.countryName),
        university: clean(legacyProfile.university),
      });
    }
  }

  const legacyStateKey = LEGACY_STATE_KEYS.find((key) => readLegacyJson(key));
  const legacyState = legacyStateKey ? readLegacyJson(legacyStateKey) : null;
  if (legacyState) {
    const legacyCourses = Array.isArray(legacyState.subjects)
      ? legacyState.subjects.filter((course) => clean(course?.name) || clean(course?.grade) || clean(course?.credits))
      : [];
    if (!Storage.get("currentTermGpa:v1", null) && legacyCourses.length) {
      const term = clean(legacyState.setup?.period) || "Current term";
      Storage.set("currentTermGpa:v1", {
        migratedFrom: "approved-home-v84",
        migratedAt: new Date().toISOString(),
        courses: legacyCourses.map((course, index) => ({
          id: `legacy-home-${index + 1}`,
          term,
          code: "",
          name: clean(course.name),
          credits: clean(course.credits),
          grade: clean(course.grade),
          type: "Core",
          source: "legacy-home-migration",
        })),
      });
    }
    if (!Storage.get("previousAcademicRecord", null)) {
      const gpa = Number(legacyState.setup?.priorCgpa ?? legacyState.cgpa?.prior);
      const credits = Number(legacyState.setup?.priorCredits ?? legacyState.cgpa?.priorCredits);
      if (Number.isFinite(gpa) && gpa >= 0 && Number.isFinite(credits) && credits >= 0) {
        Storage.set("previousAcademicRecord", { gpa, credits });
      }
    }
  }

  if (Storage.available) {
    localStorage.removeItem(LEGACY_PROFILE_KEY);
    LEGACY_STATE_KEYS.forEach((key) => localStorage.removeItem(key));
  }
}

function browserLanguage() {
  const code = clean(navigator.language).split("-")[0].toLowerCase();
  return SUPPORTED_LANGUAGES.some((language) => language.code === code) ? code : "en";
}

function supportedLanguage(code) {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code) ? code : "";
}

function localizedPath(pathname, language) {
  const normalized = `/${clean(pathname).replace(/^\/+|\/+$/g, "")}`;
  const englishPath = normalized.replace(/^\/(?:en|ar)(?=\/|$)/, "") || "/";
  const isEnglishOnly = /\.html$/i.test(englishPath) || ["/pricing", "/instantgpa-pro"].includes(englishPath);
  if (language !== "ar" || isEnglishOnly) return englishPath;
  return englishPath === "/" ? "/ar" : `/ar${englishPath}`;
}

function localizeHomeLinks(language) {
  document.querySelectorAll('a[href^="/"]').forEach((link) => {
    const url = new URL(link.getAttribute("href"), window.location.origin);
    link.setAttribute("href", `${localizedPath(url.pathname, language)}${url.search}${url.hash}`);
  });
}

async function initializeLanguage() {
  const select = byId("languageSelect");
  const routeLanguage = supportedLanguage(window.INSTANTGPA_SEO_CONTEXT?.lang);
  const savedLanguage = supportedLanguage(getSavedLanguage());
  const initial = routeLanguage || savedLanguage || browserLanguage();
  if (select) {
    select.value = initial;
    select.disabled = true;
    select.setAttribute("aria-busy", "true");
  }
  const changeLanguage = async (event) => {
    const language = supportedLanguage(event.target.value) || "en";
    await loadLanguage(language).catch(() => loadLanguage("en"));
    localizeHomeLinks(language);
    const nextPath = localizedPath("/", language);
    if (window.location.pathname !== nextPath) {
      window.location.assign(`${nextPath}${window.location.search}${window.location.hash}`);
    }
  };
  select?.addEventListener("change", changeLanguage);
  await loadLanguage(initial).catch(() => loadLanguage("en"));
  localizeHomeLinks(initial);
  if (select) {
    select.disabled = false;
    select.removeAttribute("aria-busy");
  }
}

function setOptions(select, items, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  items.forEach((item) => select.add(new Option(item.label, item.value)));
}

async function initializeQuickSetup() {
  const country = byId("countrySetupSelect");
  const university = byId("universitySetupSelect");
  const manual = byId("universitySetupInput");
  const manualField = byId("manualUniversityField");
  const hint = byId("universitySetupHint");
  const confirm = byId("academicEntryButton");
  if (!country || !university || !manual || !confirm) return;
  track("page_viewed", { tool: "home" });
  track("onboarding_started", { stage: "quick_setup" });

  const existingProfile = AcademicProfile.get();
  if (existingProfile) {
    showConnectedWorkspace(existingProfile);
    return;
  }

  const draft = Storage.get("academicProfileDraft", {}) || {};
  let countries = [];
  let universities = [];
  let countryTouched = false;

  const selectedUniversity = () => university.value === OTHER_UNIVERSITY
    ? clean(manual.value)
    : clean(university.value);

  const showManual = (visible) => {
    if (manualField) manualField.hidden = !visible;
    manual.required = visible;
    if (!visible && university.value !== OTHER_UNIVERSITY) manual.value = "";
  };

  const syncConfirm = () => {
    const ready = Boolean(country.value && selectedUniversity().length >= 2);
    confirm.disabled = !ready;
    confirm.setAttribute("aria-disabled", String(!ready));
  };

  const loadUniversities = async (countryCode, selected = "") => {
    if (!countryCode || countryCode === OTHER_COUNTRY) {
      universities = [];
    } else {
      if (hint) hint.textContent = t("setup.loading");
      universities = await AcademicProfile.fetchUniversities(countryCode).catch(() => []);
    }
    const options = universities.map((item) => ({ value: item.name, label: item.name }));
    options.push({ value: OTHER_UNIVERSITY, label: t("setup.university.notListed") });
    setOptions(university, options, t("setup.university.placeholder.ready"));
    university.disabled = false;
    if (selected && universities.some((item) => item.name === selected)) {
      university.value = selected;
      showManual(false);
    } else if (selected) {
      university.value = OTHER_UNIVERSITY;
      manual.value = selected;
      showManual(true);
    } else if (!universities.length) {
      university.value = OTHER_UNIVERSITY;
      showManual(true);
    } else {
      showManual(false);
    }
    if (hint) {
      hint.textContent = universities.length
        ? t("home.modern.system.universityCount", { count: universities.length })
        : t("setup.empty");
    }
    syncConfirm();
  };

  countries = await AcademicProfile.loadCountries().catch(() => []);
  setOptions(country, [
    ...countries.map((item) => ({ value: item.code, label: item.name })),
    { value: OTHER_COUNTRY, label: t("home.modern.country.other") },
  ], t("setup.country.placeholder"));

  if (draft.countryCode) {
    country.value = draft.countryCode;
    await loadUniversities(draft.countryCode, draft.university);
  } else {
    university.disabled = true;
    setOptions(university, [], t("setup.university.placeholder"));
    showManual(false);
  }

  country.addEventListener("change", async () => {
    countryTouched = true;
    manual.value = "";
    await loadUniversities(country.value);
  });
  university.addEventListener("change", () => {
    showManual(university.value === OTHER_UNIVERSITY);
    syncConfirm();
  });
  manual.addEventListener("input", syncConfirm);

  confirm.addEventListener("click", () => {
    const universityName = selectedUniversity();
    if (!country.value || universityName.length < 2) return;
    const countryName = country.options[country.selectedIndex]?.text || country.value;
    const saved = Storage.set("academicProfileDraft", {
      countryCode: country.value,
      countryName,
      university: universityName,
      updatedAt: new Date().toISOString(),
    });
    if (!saved) {
      if (hint) hint.textContent = t("setup.storageBlocked");
      return;
    }
    window.location.assign(localizedPath("/transcript-gpa-calculator/", supportedLanguage(window.INSTANTGPA_SEO_CONTEXT?.lang) || "en"));
  });

  try {
    const response = await fetch("/api/location", { headers: { accept: "application/json" } });
    const location = response.ok ? await response.json() : null;
    if (!countryTouched && !country.value && location?.countryCode) {
      country.value = location.countryCode;
      if (country.value) await loadUniversities(country.value);
    }
  } catch {
    // Location is a suggestion only; manual country selection remains available.
  }
}

function showConnectedWorkspace(profile) {
  const entry = byId("academicEntry");
  const active = byId("activeAcademicProfile");
  if (entry) entry.hidden = true;
  if (active) active.hidden = false;
  if (byId("activeProfileUniversity")) byId("activeProfileUniversity").textContent = profile.university;
  if (byId("activeProfileDetails")) {
    byId("activeProfileDetails").textContent = [profile.countryName, profile.college, profile.department]
      .filter(Boolean)
      .join(" · ");
  }
}

function wirePortalNavigation() {
  byId("editAcademicProfile")?.addEventListener("click", () => {
    const language = supportedLanguage(window.INSTANTGPA_SEO_CONTEXT?.lang) || "en";
    window.location.assign(`${localizedPath("/transcript-gpa-calculator/", language)}?edit-academic-profile=1`);
  });
}

async function updateAccountSummary() {
  try {
    const { CloudSync } = await import("./cloud-sync.js");
    const session = await CloudSync.getSession();
    if (!session.ok || !session.session) return;
    const status = await CloudSync.getAccountStatus();
    const premium = Boolean(status.ok && (status.data?.isOwner || status.data?.entitlement?.status === "active"));
    if (byId("accountButtonTitle")) byId("accountButtonTitle").textContent = session.session.email || "Account";
    if (byId("accountButtonPlan")) byId("accountButtonPlan").textContent = status.data?.isOwner ? "Owner" : premium ? "Premium" : "Account";
    if (byId("accountHeaderPro")) byId("accountHeaderPro").hidden = !premium;
  } catch {
    // The account page remains the authoritative sign-in surface.
  }
}

async function boot() {
  migrateLegacyDrafts();
  await initializeLanguage();
  wirePortalNavigation();
  await initializeQuickSetup();
  updateAccountSummary();
}

boot();
