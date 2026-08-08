// storage.js — a small localStorage wrapper.
// Centralized here so no other module talks to window.localStorage directly.
// This keeps "is storage blocked?" and "how do we namespace keys?" in one place.

const PREFIX = "instantgpa:";
const SAFE_BACKUP_KEYS = new Set([
  "academicProfile",
  "academicRecord:v2",
  "transcriptHistory:v2",
  "programRequirements:v1",
  "gradingSystem",
  "degreeAuditGroups",
  "degreeAuditAssignments",
  "lastCloudSync",
  "scenarioLabSaved:v1",
  "scenarioLabScenarios:v2",
  "weightedGrade:v1",
  "graduationGoal:v1",
  "latestCgpa:v1",
  "latestRetake:v1",
  "premiumSyllabi:v1",
  "transcriptFingerprint:v1",
  "adviserNotes:v1",
  "commandCenterSettings:v1",
  "freeWorkflow:v1",
  "currentTermGpa:v1",
  "previousAcademicRecord",
]);

function sanitizeBackupValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeBackupValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["rawText", "ocrText", "fileName", "studentId"].includes(key))
      .map(([key, nested]) => [key, sanitizeBackupValue(nested)])
  );
}

function isStorageAvailable() {
  try {
    const testKey = `${PREFIX}__test__`;
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export const Storage = {
  available: isStorageAvailable(),

  get(key, fallback = null) {
    if (!Storage.available) return fallback;
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    if (!Storage.available) return false;
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent("instantgpa:storage-changed", { detail: { key } }));
      }
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    if (!Storage.available) return;
    try {
      window.localStorage.removeItem(PREFIX + key);
      if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent("instantgpa:storage-changed", { detail: { key } }));
      }
    } catch {
      /* ignore */
    }
  },

  // Returns every stored value under our prefix, for the full-backup export.
  exportAll() {
    const out = {};
    if (!Storage.available) return out;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX) && SAFE_BACKUP_KEYS.has(key.slice(PREFIX.length))) {
        try {
          out[key.slice(PREFIX.length)] = sanitizeBackupValue(JSON.parse(window.localStorage.getItem(key)));
        } catch {
          /* skip unreadable entries */
        }
      }
    }
    return out;
  },

  importAll(data) {
    if (!Storage.available || !data || typeof data !== "object") return false;
    const safeEntries = Object.entries(data)
      .filter(([key]) => SAFE_BACKUP_KEYS.has(key));
    for (const key of SAFE_BACKUP_KEYS) Storage.remove(key);
    safeEntries.forEach(([key, value]) => Storage.set(key, sanitizeBackupValue(value)));
    return true;
  },

  clearAll() {
    if (!Storage.available) return;
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  },
};
