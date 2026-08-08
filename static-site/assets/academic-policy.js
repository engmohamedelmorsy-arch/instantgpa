export function normalizeGradeLabel(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleUpperCase("en")
    .replace(/\s*([+-])\s*/g, "$1")
    .replace(/\s+/g, " ");
}

export function normalizeCourseCode(value) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en").replace(/\s+/g, "");
}

function specialOutcome(label) {
  const normalized = normalizeGradeLabel(label);
  if (["W", "WD", "WITHDRAWN"].includes(normalized)) {
    return { outcome: "withdrawn", includeInGpa: false, earnsCredit: false };
  }
  if (["I", "INC", "INCOMPLETE"].includes(normalized)) {
    return { outcome: "incomplete", includeInGpa: false, earnsCredit: false };
  }
  if (["IP", "IN PROGRESS", "IN-PROGRESS", "U", "UNGRADED", "REGISTERED"].includes(normalized)) {
    return { outcome: "inProgress", includeInGpa: false, earnsCredit: false };
  }
  if (["P", "PASS", "PASSED", "S", "SATISFACTORY"].includes(normalized)) {
    return { outcome: "passed", includeInGpa: false, earnsCredit: true };
  }
  return null;
}

function normalizedStatus(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en").replace(/[\s-]+/g, "_");
}

export function resolveGrade(system, label) {
  const normalized = normalizeGradeLabel(label);
  if (!normalized || normalized === "--") return { grade: null, issue: "missing_grade", outcome: "planned", includeInGpa: false, earnsCredit: false };
  const special = specialOutcome(normalized);
  const row = (system?.grades || []).find((grade) => normalizeGradeLabel(grade.label) === normalized);
  if (!row && special) return { grade: null, issue: null, ...special };
  if (!row) return { grade: null, issue: "unknown_grade", outcome: "unknown", includeInGpa: false, earnsCredit: false };
  const outcome = row.outcome || special?.outcome || (Number(row.points) === 0 ? "failed" : "passed");
  return {
    grade: row,
    issue: null,
    outcome,
    includeInGpa: row.includeInGpa ?? !["withdrawn", "incomplete", "inProgress"].includes(outcome),
    earnsCredit: row.earnsCredit ?? outcome === "passed",
  };
}

export function evaluateCourse(course, system) {
  const credits = course.credits === "" || course.credits == null ? null : Number(course.credits);
  const status = normalizedStatus(course.status);
  const missingCredits = credits == null || !Number.isFinite(credits) || credits < 0;
  const safeCredits = missingCredits ? null : credits;
  const statusIssue = missingCredits ? "missing_or_invalid_credits" : null;
  if (status === "planned") {
    return { ...course, credits: safeCredits, issue: statusIssue, outcome: "planned", includeInGpa: false, earnsCredit: false, gradePoints: null, qualityPoints: 0 };
  }
  if (["in_progress", "inprogress", "ungraded", "registered"].includes(status)) {
    return { ...course, credits: safeCredits, issue: statusIssue, outcome: "inProgress", includeInGpa: false, earnsCredit: false, gradePoints: null, qualityPoints: 0 };
  }
  if (status === "withdrawn") {
    return { ...course, credits: safeCredits, issue: statusIssue, outcome: "withdrawn", includeInGpa: false, earnsCredit: false, gradePoints: null, qualityPoints: 0 };
  }
  const resolved = resolveGrade(system, course.grade);
  if (missingCredits) {
    return {
      ...course,
      credits: null,
      issue: resolved.issue || "missing_or_invalid_credits",
      outcome: resolved.outcome,
      includeInGpa: false,
      earnsCredit: false,
      wouldEarnCredit: resolved.earnsCredit,
      gradePoints: resolved.grade ? Number(resolved.grade.points) : null,
      qualityPoints: 0,
    };
  }
  const includeInGpa = resolved.includeInGpa && credits > 0;
  const points = resolved.grade ? Number(resolved.grade.points) : null;
  return {
    ...course,
    credits,
    issue: resolved.issue,
    outcome: resolved.outcome,
    includeInGpa,
    earnsCredit: resolved.earnsCredit && credits > 0,
    gradePoints: points,
    qualityPoints: includeInGpa && Number.isFinite(points) ? credits * points : 0,
  };
}

export function courseIdentityKey(course) {
  const code = normalizeCourseCode(course.code);
  if (code) return code;
  return String(course.name || "").normalize("NFKC").trim().toLocaleLowerCase();
}

export function selectAttemptsForGpa(courses, policy = "all") {
  if (policy === "all") return courses;
  const groups = new Map();
  courses.forEach((course, index) => {
    const key = courseIdentityKey(course) || `__${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...course, __index: index });
  });
  const selected = [];
  groups.forEach((attempts) => {
    const included = attempts.filter((attempt) => attempt.includeInGpa);
    if (!included.length) return;
    if (policy === "highest") {
      selected.push(included.reduce((best, attempt) => Number(attempt.gradePoints) > Number(best.gradePoints) ? attempt : best));
    } else if (policy === "latest" || policy === "replace") {
      selected.push(included[included.length - 1]);
    } else if (policy === "average") {
      const latest = included[included.length - 1];
      const averagePoints = included.reduce((sum, attempt) => sum + Number(attempt.gradePoints), 0) / included.length;
      selected.push({ ...latest, gradePoints: averagePoints, qualityPoints: Number(latest.credits) * averagePoints });
    } else {
      selected.push(...included);
    }
  });
  return selected.sort((a, b) => a.__index - b.__index).map((course) => {
    const cleanCourse = { ...course };
    delete cleanCourse.__index;
    return cleanCourse;
  });
}
