// The single controller for the confirmed academic context. Form changes are
// drafts only; nothing becomes active until the user presses Confirm.

import { Storage } from "./storage.js";
import { GradingEngine } from "./grading-engine.js";
import { track } from "./analytics.js";
import { t } from "./localization.js";

const PROFILE_KEY = "academicProfile";
const DRAFT_KEY = "academicProfileDraft";
const PROFILE_SCHEMA_VERSION = 4;
const INSTALL_ID_KEY = "academicProfileInstallId";
const CACHE_KEY_PREFIX = "universityCache:xlsx-v3:";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OTHER_COUNTRY = { code: "OTHER", name: "Other" };
const CUSTOM_SYSTEM_ID = "custom";
const PRIVACY_POLICY_VERSION = "2026-08-08";

let countriesCache = null;
let fallbackDirectory = null;

async function loadFallbackDirectory() {
  if (fallbackDirectory) return fallbackDirectory;
  const response = await fetch("/data/academic-directory.json");
  if (!response.ok) throw new Error(`Failed to load academic directory (${response.status})`);
  fallbackDirectory = await response.json();
  return fallbackDirectory;
}

async function loadCountries() {
  if (countriesCache) return countriesCache;
  const directory = await loadFallbackDirectory();
  countriesCache = directory.countries || [];
  return countriesCache;
}

async function fetchUniversities(countryCode) {
  if (!countryCode || countryCode === OTHER_COUNTRY.code) return [];
  const cacheKey = CACHE_KEY_PREFIX + countryCode;
  const cached = Storage.get(cacheKey, null);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.list;
  const directory = await loadFallbackDirectory();
  const list = directory.universitiesByCountry?.[countryCode] || [];
  Storage.set(cacheKey, { savedAt: Date.now(), list });
  return list;
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

export const AcademicProfile = {
  loadCountries,
  fetchUniversities,

  get() {
    const profile = Storage.get(PROFILE_KEY, null);
    if (!profile) {
      // A grading scale is only valid as part of an explicitly confirmed
      // academic profile. Clear any orphaned value left by an older build.
      Storage.remove("gradingSystem");
      return null;
    }
    if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION || !profile.confirmedAt) {
      // Older builds could retain a complete university context and make it
      // look like a default. Invalidate it once so only the IP-suggested
      // country remains and every other field starts empty.
      Storage.remove(PROFILE_KEY);
      Storage.remove("gradingSystem");
      return null;
    }
    return profile;
  },

  isConfirmed() {
    return Boolean(this.get());
  },

  confirm(profile, gradingSystem) {
    if (!profile.countryCode || !profile.university || !profile.college || !profile.department || !profile.presetId || !gradingSystem) {
      return { ok: false, error: "incomplete" };
    }
    const activeResult = GradingEngine.setActive(gradingSystem);
    if (!activeResult.ok) {
      return { ok: false, error: "invalid-grading-system", details: activeResult.errors };
    }
    const confirmedProfile = {
      ...profile,
      schemaVersion: PROFILE_SCHEMA_VERSION,
      confirmedAt: new Date().toISOString(),
    };
    const saved = Storage.set(PROFILE_KEY, confirmedProfile);
    track("academic_context_confirmed", { country: profile.countryCode, scale_type: gradingSystem.scaleType || "letter" });
    return {
      ok: true,
      profile: confirmedProfile,
      gradingSystem: activeResult.system,
      storageWarning: !saved,
    };
  },

  clear() {
    Storage.remove(PROFILE_KEY);
  },

  installId() {
    let id = Storage.get(INSTALL_ID_KEY, "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      Storage.set(INSTALL_ID_KEY, id);
    }
    return id;
  },

  async submitContribution(profile) {
    // Premium and owner profiles belong only in their Firebase account. If a
    // signed-in account cannot be verified, fail closed instead of leaking a
    // subscriber profile into the pseudonymous Free directory.
    try {
      const { CloudSync } = await import("./cloud-sync.js");
      const session = await Promise.race([
        CloudSync.getSession(),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, timedOut: true }), 1_500)),
      ]);
      if (!session.ok) {
        return { ok: false, error: "Account storage status could not be verified." };
      }
      if (session.ok && session.session) {
        const status = await CloudSync.getAccountStatus();
        if (!status.ok) return { ok: false, error: "Premium account status could not be verified." };
        if (status.data?.isOwner || status.data?.entitlement?.status === "active") {
          return { ok: true, data: { qualityStatus: "private_firebase", destination: "firebase" } };
        }
      }
    } catch {
      return { ok: false, error: "Account storage status could not be verified." };
    }
    const headers = { "content-type": "application/json" };
    // Directory contributions are pseudonymous and deduplicated by the random
    // browser install id. A paid subscriber's private profile is stored with
    // the full academic snapshot in their own Firebase document instead.
    const response = await fetch("/api/academic-profile", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...profile, installId: this.installId() }),
    });
    const data = await response.json().catch(() => ({}));
    return response.ok
      ? { ok: true, data }
      : { ok: false, error: data.error || "Your academic profile could not be saved to the university directory." };
  },
};

export function mountSetup(container, { onConfirmed, onCancel, continueLabel = "Confirm and continue" } = {}) {
  const originalProfile = AcademicProfile.get();
  let scaleEditable = originalProfile?.presetId === CUSTOM_SYSTEM_ID;
  let countries = [];
  let universities = [];
  let presets = {};
  let message = "";
  let countryTouched = false;
  let draft = {
    countryCode: "",
    countryName: "",
    university: "",
    college: "",
    department: "",
    presetId: "",
    gradingSystemId: "",
    gradingSystemLabel: "",
  };
  let draftSystem = null;

  async function init() {
    [countries, presets] = await Promise.all([loadCountries(), GradingEngine.listPresets()]);
    await loadFallbackDirectory();
    if (originalProfile) {
      draft = { ...draft, ...deepClone(originalProfile) };
      universities = await fetchUniversities(draft.countryCode);
      draftSystem = deepClone(GradingEngine.getActive())
        || (draft.presetId ? await loadPreset(draft.presetId) : null);
    } else {
      const pendingDraft = consumePendingDraft();
      if (pendingDraft) {
        draft = { ...draft, ...pendingDraft };
        countryTouched = Boolean(draft.countryCode);
        universities = await fetchUniversities(draft.countryCode);
      } else {
        await suggestCountryFromIp();
      }
    }
    render();
  }

  // Picks up the country/university a user already entered in a lighter-weight
  // entry point (e.g. the homepage quick setup) so this full setup form does
  // not ask for them again. Consumed once so a later manual change here is
  // never overwritten by a stale hint on a repeat visit.
  function consumePendingDraft() {
    const pending = Storage.get(DRAFT_KEY, null);
    if (!pending || !pending.countryCode) return null;
    Storage.remove(DRAFT_KEY);
    return {
      countryCode: pending.countryCode,
      countryName: pending.countryName || "",
      university: pending.university || "",
    };
  }

  async function suggestCountryFromIp() {
    try {
      const response = await fetch("/api/location", {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok || countryTouched || draft.countryCode) return;
      const result = await response.json();
      const country = countries.find((candidate) => candidate.code === result.countryCode);
      if (!country) return;
      draft.countryCode = country.code;
      draft.countryName = country.name;
      universities = await fetchUniversities(country.code);
    } catch {
      // Location is a convenience only. The setup remains fully usable when
      // the edge cannot provide a country.
    }
  }

  function countryRecord() {
    return draft.countryCode === OTHER_COUNTRY.code
      ? OTHER_COUNTRY
      : countries.find((country) => country.code === draft.countryCode) || null;
  }

  function universityRecord() {
    return universities.find((university) => university.name.toLocaleLowerCase() === draft.university.toLocaleLowerCase()) || null;
  }

  function availableColleges() {
    return fallbackDirectory?.collegesByUniversity?.[draft.university] || [];
  }

  function availableDepartments() {
    return availableColleges().find((college) => college.name.toLocaleLowerCase() === draft.college.toLocaleLowerCase())?.departments || [];
  }

  function contributionProfile() {
    const directoryUniversity = Boolean(universityRecord());
    const directoryCollege = availableColleges().some((college) => college.name.toLocaleLowerCase() === draft.college.toLocaleLowerCase());
    const directoryDepartment = availableDepartments().some((department) => department.toLocaleLowerCase() === draft.department.toLocaleLowerCase());
    return {
      ...deepClone(draft),
      university: String(draft.university || "").trim(),
      college: String(draft.college || "").trim(),
      department: String(draft.department || "").trim(),
      directoryUniversity,
      directoryCollege,
      directoryDepartment,
    };
  }

  function availableSystems() {
    const options = [];
    const university = universityRecord();
    if (university?.gradingSystem) {
      options.push({
        id: "recommended",
        label: `${university.gradingSystem} · suggested`,
        presetId: university.presetId || countryRecord()?.defaultPreset || "us-4.0",
      });
    }
    for (const system of fallbackDirectory?.systemsByCountry?.[draft.countryCode] || []) {
      if (!options.some((option) => option.label.toLowerCase() === system.label.toLowerCase())) {
        options.push(system);
      }
    }
    for (const [id, preset] of Object.entries(presets)) {
      if (!options.some((option) => option.presetId === id)) {
        options.push({ id, label: preset.label, presetId: id });
      }
    }
    options.push({
      id: CUSTOM_SYSTEM_ID,
      label: t("setup.grading.customOption"),
      presetId: CUSTOM_SYSTEM_ID,
      isCustom: true,
    });
    return options;
  }

  async function selectSuggestedSystem() {
    const option = availableSystems().find((candidate) => candidate.id === "recommended")
      || availableSystems().find((candidate) => !candidate.isCustom);
    if (!option) {
      draft.presetId = "";
      draft.gradingSystemId = "";
      draft.gradingSystemLabel = "";
      draftSystem = null;
      return;
    }
    draft.gradingSystemId = option.id;
    draft.gradingSystemLabel = option.label || "";
    draft.presetId = option.presetId || option.id;
    draftSystem = option.isCustom ? makeCustomSystem() : await loadPreset(draft.presetId);
  }

  async function loadPreset(presetId) {
    const preset = await GradingEngine.getPreset(presetId);
    return deepClone(preset);
  }

  function makeCustomSystem() {
    return {
      presetId: CUSTOM_SYSTEM_ID,
      label: t("setup.grading.customName"),
      maxGpa: 4,
      scaleType: "letter",
      retakePolicy: "all",
      grades: [
        { label: "A", points: 4, min: 90 },
        { label: "B", points: 3, min: 80 },
        { label: "C", points: 2, min: 70 },
        { label: "D", points: 1, min: 60 },
        { label: "F", points: 0, min: 0 },
      ],
    };
  }

  function sortDraftGrades() {
    if (!draftSystem) return;
    draftSystem.grades = sortGradeRowsByPoints(draftSystem.grades);
  }

  function addDraftGrade() {
    if (!draftSystem) return;
    sortDraftGrades();
    const grades = draftSystem.grades;
    let insertAt = grades.length;
    let minimum = 0;
    let points = 0;
    let widestGap = 0;

    for (let index = 0; index < grades.length - 1; index += 1) {
      const upperPoints = Number(grades[index].points);
      const lowerPoints = Number(grades[index + 1].points);
      const gap = upperPoints - lowerPoints;
      if (Number.isFinite(gap) && gap > widestGap) {
        widestGap = gap;
        insertAt = index + 1;
        minimum = Number(((Number(grades[index].min) + Number(grades[index + 1].min)) / 2).toFixed(2));
        points = Number(((upperPoints + lowerPoints) / 2).toFixed(2));
      }
    }

    const newGrade = {
      label: `${t("setup.grading.newGrade")} ${grades.length + 1}`,
      points,
      min: minimum,
    };
    grades.splice(insertAt, 0, newGrade);
    sortDraftGrades();
    const sortedIndex = draftSystem.grades.indexOf(newGrade);
    render();
    requestAnimationFrame(() => {
      const input = container.querySelector(
        `[data-grade-field][data-index="${sortedIndex}"][data-key="label"]`,
      );
      input?.focus();
      input?.select();
    });
  }

  function validateDraft() {
    const errors = [];
    if (!draft.countryCode) errors.push({ field: "setupCountry", code: "country" });
    if (!draft.university) errors.push({ field: "setupUniversity", code: "university" });
    if (!draft.college) errors.push({ field: "setupCollege", code: "college" });
    if (!draft.department) errors.push({ field: "setupDepartment", code: "department" });
    if (!draft.presetId || !draftSystem) errors.push({ field: "setupPreset", code: "system" });
    if (draftSystem) {
      const maxGpa = Number(draftSystem.maxGpa);
      const labels = draftSystem.grades.map((grade) => String(grade.label || "").trim().toLocaleUpperCase());
      const duplicateLabels = new Set(labels).size !== labels.length;
      const invalidRows = !draftSystem.grades.length || draftSystem.grades.some((grade) => (
        !String(grade.label || "").trim()
        || !Number.isFinite(Number(grade.points))
        || Number(grade.points) < 0
        || Number(grade.points) > maxGpa
        || !Number.isFinite(Number(grade.min))
        || Number(grade.min) < 0
        || Number(grade.min) > 100
      ));
      if (!Number.isFinite(maxGpa) || maxGpa <= 0 || duplicateLabels || invalidRows) {
        errors.push({ field: "systemLabel", code: "grades" });
      }
      const mins = draftSystem.grades.map((grade) => Number(grade.min));
      if (mins.some((minimum, index) => index > 0 && mins[index - 1] <= minimum)) {
        errors.push({ field: "systemLabel", code: "order" });
      }
    }
    return errors;
  }

  function render({ restoreFocusId = "" } = {}) {
    sortDraftGrades();
    const colleges = availableColleges();
    const departments = availableDepartments();
    const systemOptions = availableSystems();
    container.innerHTML = `
      <section class="setup-card" aria-labelledby="mainHeading">
        <div class="context-title">
          <span aria-hidden="true">◉</span>
          <div><strong>Set up your academic system</strong><span>Required once for the full academic workspace.</span></div>
        </div>
        <p class="setup-intro">Complete these five fields once. InstantGPA will reuse them across every calculator and planning tool.</p>
        <div class="field-grid context-grid">
          <label class="field">
            <span>COUNTRY <b aria-hidden="true">*</b></span>
            <select id="setupCountry" required>
              <option value="" ${draft.countryCode ? "" : "selected"} disabled>Choose country</option>
              ${countries.map((country) => `<option value="${country.code}" ${draft.countryCode === country.code ? "selected" : ""}>${escapeHtml(country.name)}</option>`).join("")}
              <option value="${OTHER_COUNTRY.code}" ${draft.countryCode === OTHER_COUNTRY.code ? "selected" : ""}>Other</option>
            </select>
          </label>
          <label class="field">
            <span>UNIVERSITY <b aria-hidden="true">*</b></span>
            <input id="setupUniversity" list="setupUniversityOptions" required autocomplete="organization" value="${escapeHtml(draft.university)}" placeholder="Choose or type university" ${draft.countryCode ? "" : "disabled"}>
            <datalist id="setupUniversityOptions">${universities.map((university) => `<option value="${escapeHtml(university.name)}"></option>`).join("")}</datalist>
          </label>
          <label class="field">
            <span>COLLEGE / FACULTY <b aria-hidden="true">*</b></span>
            <input id="setupCollege" list="setupCollegeOptions" required value="${escapeHtml(draft.college)}" placeholder="Choose or type college" ${draft.university ? "" : "disabled"}>
            <datalist id="setupCollegeOptions">${colleges.map((college) => `<option value="${escapeHtml(college.name)}"></option>`).join("")}</datalist>
          </label>
          <label class="field">
            <span>DEPARTMENT / PROGRAM <b aria-hidden="true">*</b></span>
            <input id="setupDepartment" list="setupDepartmentOptions" required value="${escapeHtml(draft.department)}" placeholder="Choose or type department" ${draft.college ? "" : "disabled"}>
            <datalist id="setupDepartmentOptions">${departments.map((department) => `<option value="${escapeHtml(department)}"></option>`).join("")}</datalist>
          </label>
          <label class="field">
            <span>GRADING SYSTEM <b aria-hidden="true">*</b></span>
            <select id="setupPreset" required ${draft.department ? "" : "disabled"}>
              <option value="" ${draft.gradingSystemId ? "" : "selected"} disabled>Choose grading system</option>
              ${systemOptions.map((option) => `<option value="${escapeHtml(option.id)}" ${draft.gradingSystemId === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
            </select>
          </label>
        </div>
        <section class="grading-scale-inline" aria-labelledby="gradingScaleTitle">
          <div class="grading-scale-inline__heading">
            <span id="gradingScaleTitle">${t("setup.scale.title")}</span>
            <div class="grading-scale-inline__actions">
              <small>${draftSystem
                ? `${escapeHtml(draftSystem.label)} · ${Number(draftSystem.maxGpa)} max · ${draftSystem.grades.length} grades`
                : "Complete the four academic fields above to load the suggested grade table."}</small>
              ${draftSystem ? `<button type="button" id="toggleScaleEdit" class="btn btn--text" aria-pressed="${scaleEditable}">
                ${scaleEditable ? "Finish editing" : "Customize scale"}
              </button>` : ""}
            </div>
          </div>
          ${draftSystem ? `
            <section class="grading-editor" aria-labelledby="gradingEditorTitle">
              <div class="grading-editor__heading">
                <strong id="gradingEditorTitle">${t("setup.scale.details")}</strong>
                <span>${scaleEditable
                  ? "Edit only when your university publishes different values."
                  : "Visible by default. Editing is off to prevent accidental changes."}</span>
              </div>
              <div class="editor-meta">
                <input id="systemLabel" aria-label="Grading system name" value="${escapeHtml(draftSystem.label)}" ${scaleEditable ? "" : "readonly aria-readonly=\"true\""}>
                <input id="systemMax" aria-label="Maximum GPA" type="number" min="0.1" step="0.1" value="${Number(draftSystem.maxGpa)}" ${scaleEditable ? "" : "readonly aria-readonly=\"true\""}>
              </div>
              <div class="grade-table" role="table" aria-label="Grading scale">
                <div class="grade-head" role="row"><span role="columnheader">GRADE NAME</span><span role="columnheader">POINTS</span><span role="columnheader">MIN %</span><span role="columnheader"><span class="visually-hidden">Action</span></span></div>
                <div id="gradeRows" class="grade-scroll" role="rowgroup">
                  ${draftSystem.grades.map(renderGradeRow).join("")}
                </div>
              </div>
              ${scaleEditable ? '<button type="button" id="addGrade" class="add-grade">＋ Add grade</button>' : ""}
            </section>` : `
            <div class="grading-scale-inline__empty" role="status">
              <strong>Grade table</strong>
              <span>${t("setup.required.hint")}</span>
            </div>`}
        </section>
        <div id="setupFormStatus" class="setup-status" aria-live="polite">
          ${message ? `<p class="setup-status__text setup-status__text--warn">${escapeHtml(message)}</p>` : ""}
        </div>
        <div class="setup-confirm-row">
          <div>
            <strong>Review before saving</strong>
            <span>Check the grade table, then continue. You can edit this setup later.</span>
          </div>
          ${originalProfile ? `<button type="button" id="cancelAcademicContext" class="btn btn--ghost">Cancel</button>` : ""}
          <button type="button" id="confirmAcademicContext" class="btn btn--primary">
            ${escapeHtml(continueLabel)} →
          </button>
        </div>
      </section>`;
    wire();
    if (restoreFocusId) {
      requestAnimationFrame(() => container.querySelector(`#${restoreFocusId}`)?.focus({ preventScroll: true }));
    }
  }

  function renderGradeRow(row, index) {
    const gradeName = String(row.label || `Grade ${index + 1}`);
    const readonly = scaleEditable ? "" : 'readonly aria-readonly="true"';
    return `<div class="grade-row" role="row">
      <span role="cell"><input data-grade-field data-index="${index}" data-key="label" aria-label="${escapeHtml(gradeName)} — grade name" value="${escapeHtml(row.label)}" ${readonly}></span>
      <span role="cell"><input data-grade-field data-index="${index}" data-key="points" aria-label="${escapeHtml(gradeName)} — grade points" type="number" min="0" max="${Number(draftSystem.maxGpa)}" step="0.1" value="${Number(row.points)}" ${readonly}></span>
      <span role="cell"><input data-grade-field data-index="${index}" data-key="min" aria-label="${escapeHtml(gradeName)} — minimum percentage" type="number" min="0" max="100" step="1" value="${Number(row.min)}" ${readonly}></span>
      <span role="cell">${scaleEditable ? `<button type="button" data-remove-grade="${index}" aria-label="Remove ${escapeHtml(gradeName)}">×</button>` : ""}</span>
    </div>`;
  }

  function wire() {
    container.querySelector("#setupCountry")?.addEventListener("change", async (event) => {
      countryTouched = true;
      draft.countryCode = event.target.value;
      draft.countryName = countryRecord()?.name || "";
      universities = await fetchUniversities(draft.countryCode);
      Object.assign(draft, {
        university: "",
        college: "",
        department: "",
        presetId: "",
        gradingSystemId: "",
        gradingSystemLabel: "",
      });
      draftSystem = null;
      scaleEditable = false;
      message = "";
      render({ restoreFocusId: "setupCountry" });
    });
    container.querySelector("#setupUniversity")?.addEventListener("change", async (event) => {
      Object.assign(draft, {
        university: event.target.value.trim(),
        college: "",
        department: "",
        presetId: "",
        gradingSystemId: "",
        gradingSystemLabel: "",
      });
      draftSystem = null;
      scaleEditable = false;
      message = "";
      render({ restoreFocusId: "setupUniversity" });
    });
    container.querySelector("#setupCollege")?.addEventListener("change", (event) => {
      draft.college = event.target.value.trim();
      draft.department = "";
      render({ restoreFocusId: "setupCollege" });
    });
    container.querySelector("#setupDepartment")?.addEventListener("change", async (event) => {
      draft.department = event.target.value.trim();
      if (draft.department && !draft.gradingSystemId) await selectSuggestedSystem();
      render({ restoreFocusId: "setupDepartment" });
    });
    container.querySelector("#setupPreset")?.addEventListener("change", async (event) => {
      const option = availableSystems().find((candidate) => candidate.id === event.target.value);
      draft.gradingSystemId = event.target.value;
      draft.gradingSystemLabel = option?.label || "";
      draft.presetId = option?.presetId || event.target.value;
      draftSystem = option?.isCustom ? makeCustomSystem() : await loadPreset(draft.presetId);
      scaleEditable = Boolean(option?.isCustom);
      message = "";
      render({ restoreFocusId: "setupPreset" });
    });
    container.querySelector("#toggleScaleEdit")?.addEventListener("click", () => {
      scaleEditable = !scaleEditable;
      render({ restoreFocusId: "toggleScaleEdit" });
    });
    container.querySelector("#systemLabel")?.addEventListener("input", saveEditor);
    container.querySelector("#systemMax")?.addEventListener("input", saveEditor);
    container.querySelectorAll("[data-grade-field]").forEach((input) => {
      input.addEventListener("input", saveEditor);
      if (input.dataset.key === "points") {
        input.addEventListener("blur", (event) => {
          if (event.relatedTarget && container.contains(event.relatedTarget)) return;
          sortDraftGrades();
          render();
        });
      }
    });
    container.querySelectorAll("[data-remove-grade]").forEach((button) => button.addEventListener("click", () => {
      draftSystem.grades.splice(Number(button.dataset.removeGrade), 1);
      render();
    }));
    container.querySelector("#addGrade")?.addEventListener("click", addDraftGrade);
    container.querySelector("#cancelAcademicContext")?.addEventListener("click", () => onCancel?.());
    container.querySelector("#confirmAcademicContext")?.addEventListener("click", async () => {
      sortDraftGrades();
      const errors = validateDraft();
      if (errors.length) {
        message = "Complete the required fields and fix the grade scale before confirming.";
        render();
        const first = container.querySelector(`#${errors[0].field}`);
        first?.setAttribute("aria-invalid", "true");
        first?.focus();
        return;
      }
      const button = container.querySelector("#confirmAcademicContext");
      const finalProfile = {
        ...contributionProfile(),
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        dataUseAcknowledgedAt: new Date().toISOString(),
      };
      button.disabled = true;
      button.textContent = "Saving academic profile…";
      const result = AcademicProfile.confirm(finalProfile, {
        ...deepClone(draftSystem),
        presetId: draft.presetId,
        label: String(draftSystem.label || "").trim(),
        maxGpa: Number(draftSystem.maxGpa),
        grades: draftSystem.grades.map((grade) => ({
          ...grade,
          label: String(grade.label || "").trim(),
          points: Number(grade.points),
          min: Number(grade.min),
        })),
      });
      if (!result.ok) {
        message = "The grading scale could not be saved. Review its rows and try again.";
        render();
        return;
      }

      // The student's journey must not be blocked by a slow or temporarily
      // unavailable network. Save the canonical local profile first, then
      // contribute the pseudonymous directory record in the background.
      AcademicProfile.submitContribution({
        ...finalProfile,
        gradingSystemId: finalProfile.gradingSystemId || finalProfile.presetId,
        gradingSystemLabel: finalProfile.gradingSystemLabel || draftSystem.label,
      }).then((contribution) => {
        if (contribution.ok) {
          track("academic_profile_contributed", { quality: contribution.data.qualityStatus });
        } else {
          track("academic_profile_contribution_failed", { reason: "network_or_service" });
        }
      }).catch(() => track("academic_profile_contribution_failed", { reason: "network_or_service" }));
      import("./academic-cloud-record.js")
        .then(({ scheduleAcademicCloudRecordSync }) => scheduleAcademicCloudRecordSync())
        .catch(() => {});
      window.dispatchEvent(new CustomEvent("instantgpa:academic-profile-confirmed", { detail: result.profile }));
      onConfirmed?.(result.profile);
    });
  }

  function saveEditor(event) {
    if (!draftSystem) return;
    if (event.target.id === "systemLabel") draftSystem.label = event.target.value;
    if (event.target.id === "systemMax") draftSystem.maxGpa = event.target.value;
    if (event.target.dataset.gradeField !== undefined) {
      const row = draftSystem.grades[Number(event.target.dataset.index)];
      const key = event.target.dataset.key;
      row[key] = event.target.value;
    }
  }

  init();
}

export function sortGradeRowsByPoints(rows = []) {
  return rows
    .map((grade, originalIndex) => ({ grade, originalIndex }))
    .sort((left, right) => {
      const leftPoints = Number(left.grade.points);
      const rightPoints = Number(right.grade.points);
      const pointDifference = (Number.isFinite(rightPoints) ? rightPoints : -Infinity)
        - (Number.isFinite(leftPoints) ? leftPoints : -Infinity);
      if (pointDifference !== 0) return pointDifference;

      const leftMinimum = Number(left.grade.min);
      const rightMinimum = Number(right.grade.min);
      const minimumDifference = (Number.isFinite(rightMinimum) ? rightMinimum : -Infinity)
        - (Number.isFinite(leftMinimum) ? leftMinimum : -Infinity);
      return minimumDifference || left.originalIndex - right.originalIndex;
    })
    .map(({ grade }) => grade);
}
