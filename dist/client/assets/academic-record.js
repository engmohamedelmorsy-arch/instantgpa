// One shared, attempt-aware academic record for every InstantGPA surface.

import { Storage } from "./storage.js";
import { GradingEngine } from "./grading-engine.js";
import {
  courseIdentityKey,
  evaluateCourse,
  normalizeGradeLabel,
  normalizeCourseCode,
  selectAttemptsForGpa,
} from "./academic-policy.js";
import { flattenedPrerequisites, parsePrerequisiteGroups } from "./prerequisite-policy.js";

const RECORD_KEY = "academicRecord:v2";
const HISTORY_KEY = "transcriptHistory:v2";
const PROGRAM_REQUIREMENTS_KEY = "programRequirements:v1";
const LEGACY_RECORD_KEYS = ["academicRecord:v1", "transcriptImport"];
const LEGACY_HISTORY_KEYS = ["transcriptHistory:v1"];

const clean = (value) => String(value ?? "").normalize("NFKC").trim();

function nullableNumber(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function createId(course, index = 0) {
  const entropy = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `attempt-${clean(course.code || course.name || "course").replace(/\s+/g, "-")}-${index}-${entropy}`;
}

export function normalizeCourse(course, index = 0) {
  const code = clean(course.code);
  const name = clean(course.name || course.title);
  const grade = clean(course.grade);
  const attemptId = clean(course.attemptId || course.id) || createId(course, index);
  const normalizedGrade = normalizeGradeLabel(grade);
  const explicitStatus = clean(course.status).toLocaleLowerCase("en").replace(/[\s-]+/g, "_");
  const status = explicitStatus
    || (!normalizedGrade || normalizedGrade === "--" ? "planned" : "graded");
  const rawPrerequisites = course.prerequisiteGroups
    || course.prerequisites
    || course.prerequisite
    || course.prereqCode;
  const prerequisiteGroups = parsePrerequisiteGroups(rawPrerequisites);
  return {
    id: attemptId,
    attemptId,
    term: clean(course.term || course.semester) || "Semester 1",
    code,
    name: name || code || `Course ${index + 1}`,
    credits: nullableNumber(course.credits),
    percentage: nullableNumber(course.percentage),
    grade,
    type: clean(course.type || course.coreType) || "Core",
    status,
    prerequisites: flattenedPrerequisites(prerequisiteGroups),
    prerequisiteGroups,
    source: clean(course.source) || "manual",
    sourcePage: nullableNumber(course.sourcePage),
    sourceBounds: course.sourceBounds && typeof course.sourceBounds === "object" ? course.sourceBounds : null,
    fieldConfidence: course.fieldConfidence && typeof course.fieldConfidence === "object"
      ? Object.fromEntries(Object.entries(course.fieldConfidence).map(([key, value]) => [key, Math.max(0, Math.min(100, Number(value) || 0))]))
      : null,
    isRetake: Boolean(course.isRetake || course.importAction === "retake"),
  };
}

function migrateLegacy() {
  const existing = Storage.get(RECORD_KEY, null);
  if (existing?.courses) return existing;
  let legacyCourses = [];
  let updatedAt = null;
  for (const key of LEGACY_RECORD_KEYS) {
    const legacy = Storage.get(key, null);
    if (legacy?.courses?.length) {
      legacyCourses = legacy.courses;
      updatedAt = legacy.updatedAt;
      break;
    }
    if (legacy?.records?.length) {
      legacyCourses = legacy.records;
      updatedAt = legacy.importedAt;
      break;
    }
  }
  const record = {
    version: 2,
    courses: legacyCourses.map((course, index) => normalizeCourse(course, index)),
    updatedAt: updatedAt || null,
  };
  Storage.set(RECORD_KEY, record);
  return record;
}

function cleanHistoryEntry(entry) {
  const safe = { ...(entry || {}) };
  delete safe.rawText;
  return safe;
}

function migrateHistory() {
  const current = Storage.get(HISTORY_KEY, null);
  if (Array.isArray(current)) {
    const cleaned = current.map(cleanHistoryEntry);
    Storage.set(HISTORY_KEY, cleaned);
    return cleaned;
  }
  const legacy = LEGACY_HISTORY_KEYS.flatMap((key) => Storage.get(key, []) || []).map(cleanHistoryEntry);
  Storage.set(HISTORY_KEY, legacy);
  LEGACY_HISTORY_KEYS.forEach((key) => Storage.remove(key));
  return legacy;
}

function emitChange(record) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("instantgpa:academic-record-changed", { detail: record }));
  }
}

export const AcademicRecord = {
  get() {
    return migrateLegacy();
  },

  courses() {
    return this.get().courses || [];
  },

  save(courses, meta = {}) {
    const record = {
      version: 2,
      courses: (courses || []).map((course, index) => normalizeCourse(course, index)),
      updatedAt: new Date().toISOString(),
      ...meta,
    };
    if (!Storage.set(RECORD_KEY, record)) return null;
    emitChange(record);
    return record;
  },

  import(courses, { mode = "merge", source = "transcript", programCreditsRequired = null } = {}) {
    const incoming = (courses || []).map((course, index) => normalizeCourse({ ...course, source }, index));
    const before = this.courses();
    const beforeProgramRequirements = this.programRequirements();
    const byAttempt = new Map();
    if (mode !== "replace") before.forEach((course) => byAttempt.set(this.attemptKey(course), course));
    incoming.forEach((course) => {
      const key = this.attemptKey(course);
      const previous = byAttempt.get(key);
      byAttempt.set(key, previous ? { ...course, id: previous.id, attemptId: previous.attemptId } : course);
    });
    const importedAt = new Date().toISOString();
    const saved = this.save([...byAttempt.values()], { lastImportAt: importedAt });
    if (!saved) return null;
    if (programCreditsRequired != null) {
      const requirementsSaved = this.setProgramRequirements({
        totalCreditsRequired: programCreditsRequired,
        source: "user_confirmed",
      });
      if (!requirementsSaved) {
        this.save(before);
        if (beforeProgramRequirements) Storage.set(PROGRAM_REQUIREMENTS_KEY, beforeProgramRequirements);
        else Storage.remove(PROGRAM_REQUIREMENTS_KEY);
        return null;
      }
    }
    const history = this.history();
    history.unshift({
      id: `import-${Date.now()}`,
      importedAt,
      count: incoming.length,
      semesters: new Set(incoming.map((course) => course.term)).size,
      before,
      beforeProgramRequirements,
      source,
    });
    if (!Storage.set(HISTORY_KEY, history.slice(0, 20))) {
      this.save(before);
      if (beforeProgramRequirements) Storage.set(PROGRAM_REQUIREMENTS_KEY, beforeProgramRequirements);
      else Storage.remove(PROGRAM_REQUIREMENTS_KEY);
      return null;
    }
    return saved;
  },

  history() {
    return migrateHistory();
  },

  undoImport(id) {
    const history = this.history();
    const item = history.find((entry) => entry.id === id);
    if (!item) return false;
    this.save(item.before || []);
    if (item.beforeProgramRequirements) {
      Storage.set(PROGRAM_REQUIREMENTS_KEY, item.beforeProgramRequirements);
    } else {
      Storage.remove(PROGRAM_REQUIREMENTS_KEY);
    }
    Storage.set(HISTORY_KEY, history.filter((entry) => entry.id !== id));
    return true;
  },

  deleteHistory(id) {
    Storage.set(HISTORY_KEY, this.history().filter((entry) => entry.id !== id));
  },

  removeCourse(attemptId) {
    const target = clean(attemptId);
    if (!target) return false;
    const courses = this.courses();
    const remaining = courses.filter((course) => clean(course.attemptId || course.id) !== target);
    if (remaining.length === courses.length) return false;
    return Boolean(this.save(remaining));
  },

  attemptKey(course) {
    const term = clean(course.term).toLocaleLowerCase();
    const code = normalizeCourseCode(course.code);
    const identity = code || clean(course.name).toLocaleLowerCase();
    const base = `${term}|${identity}`;
    return course.isRetake ? `${base}|retake:${clean(course.attemptId || course.id)}` : base;
  },

  courseKey(course) {
    return this.attemptKey(course);
  },

  courseIdentityKey,

  programRequirements() {
    return Storage.get(PROGRAM_REQUIREMENTS_KEY, null);
  },

  setProgramRequirements(requirements = {}) {
    const totalCreditsRequired = Number(requirements.totalCreditsRequired);
    if (!Number.isFinite(totalCreditsRequired) || totalCreditsRequired <= 0 || totalCreditsRequired > 1000) return false;
    const stored = Storage.set(PROGRAM_REQUIREMENTS_KEY, {
      version: 1,
      totalCreditsRequired,
      source: clean(requirements.source) || "manual",
      updatedAt: new Date().toISOString(),
    });
    if (!stored) return false;
    emitChange(this.get());
    return true;
  },

  semesters() {
    const groups = new Map();
    this.courses().forEach((course) => {
      if (!groups.has(course.term)) groups.set(course.term, []);
      groups.get(course.term).push(course);
    });
    return [...groups.entries()]
      .map(([name, courses]) => ({ name, courses }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  },

  summary(system = GradingEngine.getActive()) {
    const evaluated = this.courses().map((course) => evaluateCourse(course, system));
    const policy = system?.retakePolicy || "all";
    const gpaAttempts = selectAttemptsForGpa(evaluated, policy);
    const gpaCredits = gpaAttempts.reduce((sum, course) => sum + (course.includeInGpa ? Number(course.credits) : 0), 0);
    const qualityPoints = gpaAttempts.reduce((sum, course) => sum + Number(course.qualityPoints || 0), 0);
    const earnedByCourse = new Map();
    evaluated.filter((course) => course.earnsCredit).forEach((course) => {
      const key = courseIdentityKey(course) || course.attemptId;
      earnedByCourse.set(key, Math.max(earnedByCourse.get(key) || 0, Number(course.credits) || 0));
    });
    const registeredCredits = evaluated.reduce((sum, course) => sum + (Number.isFinite(course.credits) ? course.credits : 0), 0);
    const issues = evaluated
      .filter((course) => course.issue)
      .map((course) => ({ attemptId: course.attemptId, code: course.code, issue: course.issue }));
    return {
      courses: evaluated.map((course) => ({ ...course, included: course.includeInGpa })),
      totalCourses: evaluated.length,
      gradedCourses: gpaAttempts.filter((course) => course.includeInGpa).length,
      inProgressCourses: evaluated.filter((course) => course.outcome === "inProgress").length,
      plannedCourses: evaluated.filter((course) => course.outcome === "planned").length,
      registeredCredits,
      gpaCredits,
      earnedCredits: [...earnedByCourse.values()].reduce((sum, credits) => sum + credits, 0),
      qualityPoints,
      gpa: gpaCredits > 0 && !issues.some((issue) => issue.issue === "unknown_grade") ? qualityPoints / gpaCredits : null,
      maxGpa: system?.maxGpa || 4,
      semesterCount: this.semesters().length,
      issues,
      retakePolicy: policy,
    };
  },

  semesterSummaries(system = GradingEngine.getActive()) {
    return this.semesters().map((semester) => {
      const evaluated = semester.courses.map((course) => evaluateCourse(course, system));
      const attempts = selectAttemptsForGpa(evaluated, system?.retakePolicy || "all");
      const credits = attempts.reduce((sum, course) => sum + (course.includeInGpa ? Number(course.credits) : 0), 0);
      const qualityPoints = attempts.reduce((sum, course) => sum + Number(course.qualityPoints || 0), 0);
      const issues = evaluated.filter((course) => course.issue);
      return {
        ...semester,
        courses: evaluated,
        credits,
        qualityPoints,
        gpa: credits && !issues.some((course) => course.issue === "unknown_grade") ? qualityPoints / credits : null,
        issues,
      };
    });
  },

  clear() {
    Storage.remove(RECORD_KEY);
    Storage.remove(PROGRAM_REQUIREMENTS_KEY);
    LEGACY_RECORD_KEYS.forEach((key) => Storage.remove(key));
    emitChange({ version: 2, courses: [], updatedAt: new Date().toISOString() });
  },
};
