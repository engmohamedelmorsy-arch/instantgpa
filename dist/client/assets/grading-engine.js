// grading-engine.js — the ONE place grading-scale logic lives.
// GPA, CGPA and the converter all read the active system from here.
// No calculator may define its own copy of grade rules.

import { Storage } from "./storage.js";

const STORAGE_KEY = "gradingSystem";
let presetsCache = null;

async function loadPresets() {
  if (presetsCache) return presetsCache;
  const res = await fetch("/data/grading-presets.json");
  if (!res.ok) throw new Error(`Failed to load grading presets (${res.status})`);
  presetsCache = await res.json();
  return presetsCache;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => b.min - a.min);
}

// A row is valid if it has a non-empty label, 0<=min<=100, and points>=0.
function validateRows(rows, maxGpa = Infinity) {
  const errors = [];
  if (!rows.length) {
    errors.push("empty");
    return errors;
  }
  for (const r of rows) {
    const minOk = typeof r.min === "number" && r.min >= 0 && r.min <= 100;
    const labelOk = typeof r.label === "string" && r.label.trim().length > 0;
    const pointsOk = typeof r.points === "number" && r.points >= 0 && r.points <= maxGpa;
    if (!minOk || !labelOk || !pointsOk) errors.push("invalid");
  }
  // Overlap check: after sorting descending by min, each row's min must be
  // strictly greater than the next row's min (no two rows share a boundary).
  const sorted = sortRows(rows);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].min <= sorted[i + 1].min) {
      errors.push("overlap");
      break;
    }
  }
  return [...new Set(errors)];
}

export const GradingEngine = {
  loadPresets,

  async getPreset(presetId) {
    const presets = await loadPresets();
    return presets[presetId] || null;
  },

  async listPresets() {
    return loadPresets();
  },

  getActive() {
    return Storage.get(STORAGE_KEY, null);
  },

  async setActiveFromPreset(presetId) {
    const preset = await this.getPreset(presetId);
    if (!preset) throw new Error(`Unknown preset: ${presetId}`);
    const system = {
      presetId,
      label: preset.label,
      maxGpa: preset.maxGpa,
      scaleType: preset.scaleType,
      retakePolicy: preset.retakePolicy || "all",
      grades: sortRows(preset.grades),
    };
    Storage.set(STORAGE_KEY, system);
    return system;
  },

  setActive(system) {
    const maxGpa = Number(system.maxGpa);
    const errors = Number.isFinite(maxGpa) && maxGpa > 0 ? validateRows(system.grades, maxGpa) : ["invalidMax"];
    const labels = (system.grades || []).map((grade) => String(grade.label || "").trim().toLocaleUpperCase("en"));
    if (new Set(labels).size !== labels.length) errors.push("duplicateLabel");
    if (errors.length) return { ok: false, errors };
    const clean = {
      ...system,
      maxGpa,
      retakePolicy: system.retakePolicy || "all",
      grades: sortRows(system.grades).map((grade) => ({
        ...grade,
        label: String(grade.label).trim(),
        points: Number(grade.points),
        min: Number(grade.min),
      })),
    };
    Storage.set(STORAGE_KEY, clean);
    return { ok: true, system: clean };
  },

  validateRows,

  // Given a percentage, find the matching grade row under the active system.
  gradeForPercentage(pct) {
    const active = this.getActive();
    if (!active) return null;
    const sorted = sortRows(active.grades);
    return sorted.find((r) => pct >= r.min) || sorted[sorted.length - 1] || null;
  },

  gradeForLabel(label) {
    const active = this.getActive();
    if (!active) return null;
    return active.grades.find((r) => r.label === label) || null;
  },
};
