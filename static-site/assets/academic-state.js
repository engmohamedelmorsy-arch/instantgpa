// Canonical academic state shared by every calculator and planning surface.
// It merges the reviewed transcript with the current-term GPA draft exactly
// once, then optionally adds a user-confirmed aggregate from an older record.

import { AcademicRecord } from "./academic-record.js";
import { courseIdentityKey, evaluateCourse, selectAttemptsForGpa } from "./academic-policy.js";
import { GradingEngine } from "./grading-engine.js";
import { Storage } from "./storage.js";

const CURRENT_TERM_KEY = "currentTermGpa:v1";
const PREVIOUS_RECORD_KEY = "previousAcademicRecord";
const LATEST_CGPA_KEY = "latestCgpa:v1";

const clean = (value) => String(value ?? "").normalize("NFKC").trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function sourceKeys(course) {
  const term = clean(course.term || course.semester).toLocaleLowerCase("en");
  const identity = clean(course.code || course.name).replace(/\s+/g, "").toLocaleLowerCase("en");
  return new Set([
    clean(course.attemptId),
    clean(course.id),
    clean(course.sourceAttemptId),
    term && identity ? `${term}|${identity}` : "",
  ].filter(Boolean));
}

function matchesSource(draft, course) {
  const left = sourceKeys(draft);
  return [...sourceKeys(course)].some((key) => left.has(key));
}

function summarize(courses, system) {
  const evaluated = (courses || []).map((course) => evaluateCourse(course, system));
  const policy = system?.retakePolicy || "all";
  const attempts = selectAttemptsForGpa(evaluated, policy);
  const included = attempts.filter((course) => course.includeInGpa);
  const gpaCredits = included.reduce((sum, course) => sum + finite(course.credits), 0);
  const qualityPoints = included.reduce((sum, course) => sum + finite(course.qualityPoints), 0);
  const earnedByCourse = new Map();
  evaluated.filter((course) => course.earnsCredit).forEach((course) => {
    const key = courseIdentityKey(course) || course.attemptId;
    earnedByCourse.set(key, Math.max(earnedByCourse.get(key) || 0, finite(course.credits)));
  });
  const issues = evaluated
    .filter((course) => course.issue)
    .map((course) => ({ attemptId: course.attemptId, code: course.code, issue: course.issue }));
  return {
    courses: evaluated.map((course) => ({ ...course, included: attempts.some((attempt) => attempt.attemptId === course.attemptId && attempt.includeInGpa) })),
    totalCourses: evaluated.length,
    gradedCourses: included.length,
    inProgressCourses: evaluated.filter((course) => course.outcome === "inProgress").length,
    plannedCourses: evaluated.filter((course) => course.outcome === "planned").length,
    registeredCredits: evaluated.reduce((sum, course) => sum + finite(course.credits), 0),
    gpaCredits,
    earnedCredits: [...earnedByCourse.values()].reduce((sum, credits) => sum + credits, 0),
    qualityPoints,
    gpa: gpaCredits > 0 && !issues.some((issue) => issue.issue === "unknown_grade") ? qualityPoints / gpaCredits : null,
    maxGpa: system?.maxGpa || 4,
    issues,
    retakePolicy: policy,
  };
}

function currentDraftCourses() {
  const stored = Storage.get(CURRENT_TERM_KEY, null);
  return Array.isArray(stored?.courses) ? stored.courses : [];
}

function mergedCourses() {
  const reviewed = AcademicRecord.courses().map((course) => ({ ...course, academicSource: "transcript" }));
  const drafts = currentDraftCourses();
  const merged = [...reviewed];

  drafts.forEach((draft, index) => {
    const existingIndex = merged.findIndex((course) => matchesSource(draft, course));
    const hasResult = Boolean(clean(draft.grade)) && !["U", "IP", "--"].includes(clean(draft.grade).toLocaleUpperCase("en"));
    if (existingIndex >= 0) {
      if (!hasResult) return;
      const existing = merged[existingIndex];
      merged[existingIndex] = {
        ...existing,
        ...draft,
        id: existing.id,
        attemptId: existing.attemptId,
        status: "graded",
        academicSource: "current-term",
        replacesTranscriptAttempt: true,
      };
      return;
    }
    if (!hasResult) return;
    merged.push({
      ...draft,
      id: draft.id || `current-draft-${index}`,
      attemptId: draft.attemptId || draft.id || `current-draft-${index}`,
      status: "graded",
      academicSource: "current-term",
    });
  });
  return merged;
}

function previousRecord() {
  const stored = Storage.get(PREVIOUS_RECORD_KEY, null) || {};
  const credits = Math.max(0, finite(stored.credits));
  const gpa = Math.max(0, finite(stored.gpa));
  return {
    credits,
    gpa,
    qualityPoints: credits * gpa,
    updatedAt: stored.updatedAt || null,
  };
}

export const AcademicState = {
  reviewedSummary(system = GradingEngine.getActive()) {
    return AcademicRecord.summary(system);
  },

  currentTermSummary(system = GradingEngine.getActive()) {
    return summarize(currentDraftCourses(), system);
  },

  mergedCourses,

  recordSummary(system = GradingEngine.getActive()) {
    return summarize(mergedCourses(), system);
  },

  semesterSummaries(system = GradingEngine.getActive()) {
    const groups = new Map();
    mergedCourses().forEach((course) => {
      const term = clean(course.term) || "Current term";
      if (!groups.has(term)) groups.set(term, []);
      groups.get(term).push(course);
    });
    return [...groups.entries()]
      .map(([name, courses]) => {
        const summary = summarize(courses, system);
        return {
          name,
          courses: summary.courses,
          credits: summary.gpaCredits,
          qualityPoints: summary.qualityPoints,
          gpa: summary.gpa,
          issues: summary.issues,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  },

  cumulativeSummary(system = GradingEngine.getActive()) {
    const record = this.recordSummary(system);
    const previous = previousRecord();
    const totalCredits = record.gpaCredits + previous.credits;
    const qualityPoints = record.qualityPoints + previous.qualityPoints;
    const gpa = record.gpaCredits > 0
      ? (record.gpa === null ? null : qualityPoints / totalCredits)
      : (previous.credits ? previous.gpa : null);
    return {
      ...record,
      gpa,
      gpaCredits: totalCredits,
      qualityPoints,
      sourceBreakdown: {
        previous,
        transcript: this.reviewedSummary(system),
        currentTerm: this.currentTermSummary(system),
      },
      includesCurrentTermProjection: mergedCourses().some((course) => course.academicSource === "current-term"),
    };
  },

  previousRecord,

  savePreviousRecord({ gpa, credits }) {
    const value = {
      gpa: Math.max(0, finite(gpa)),
      credits: Math.max(0, finite(credits)),
      updatedAt: new Date().toISOString(),
      meaning: "credits_not_in_reviewed_transcript",
    };
    Storage.set(PREVIOUS_RECORD_KEY, value);
    return value;
  },

  saveLatestCgpa(summary) {
    const value = { ...summary, updatedAt: new Date().toISOString() };
    Storage.set(LATEST_CGPA_KEY, value);
    return value;
  },

  latestCgpa() {
    return Storage.get(LATEST_CGPA_KEY, null);
  },

  programProgress(system = GradingEngine.getActive()) {
    const summary = this.recordSummary(system);
    const requirements = AcademicRecord.programRequirements();
    const remainingCredits = requirements
      ? Math.max(0, finite(requirements.totalCreditsRequired) - summary.earnedCredits)
      : null;
    return { summary, requirements, remainingCredits };
  },
};
