import { courseIdentityKey } from "./academic-policy.js";

// Build the safest useful audit starting point from reviewed data. It never
// invents an official requirement split: a published program total wins when
// course-level evidence is incomplete; otherwise reviewed course types seed
// editable groups and assignments.
export function inferAuditSetup(records = [], programRequirements = null) {
  const courses = Array.isArray(records) ? records : [];
  if (!courses.length) return { groups: [], assignments: {}, source: "empty" };
  const totalProgramCredits = Number(programRequirements?.totalCreditsRequired);
  const hasProgramTotal = Number.isFinite(totalProgramCredits) && totalProgramCredits > 0;
  const byIdentity = new Map();
  courses.forEach((course) => {
    const identity = courseIdentityKey(course) || course.attemptId || course.id;
    const existing = byIdentity.get(identity);
    const credits = Number(course.credits);
    if (!existing || (Number.isFinite(credits) && credits > Number(existing.credits || 0))) byIdentity.set(identity, course);
  });
  const uniqueCourses = [...byIdentity.values()];
  const hasFutureCourses = uniqueCourses.some((course) => (
    ["planned", "in_progress", "inProgress"].includes(course.status)
    || ["U", "IP", "--"].includes(String(course.grade || "").trim().toUpperCase())
  ));
  const missingPlanCredits = uniqueCourses.some((course) => !Number.isFinite(Number(course.credits)) || Number(course.credits) <= 0);

  if (hasProgramTotal && (!hasFutureCourses || missingPlanCredits)) {
    const group = { id: 1, name: "Program requirements", creditsRequired: totalProgramCredits, inferred: true };
    return {
      groups: [group],
      assignments: Object.fromEntries(courses.map((course) => [course.attemptId || course.id, group.id])),
      source: "program-total",
    };
  }

  const typeNames = [...new Set(uniqueCourses.map((course) => String(course.type || "Core").trim() || "Core"))];
  const groups = typeNames.map((type, index) => {
    const creditsRequired = hasFutureCourses
      ? uniqueCourses
        .filter((course) => String(course.type || "Core").trim() === type)
        .reduce((sum, course) => sum + (Number(course.credits) || 0), 0)
      : 0;
    return { id: index + 1, name: `${type} courses`, creditsRequired, inferred: true };
  });
  const groupByType = new Map(typeNames.map((type, index) => [type, index + 1]));
  const assignments = Object.fromEntries(courses.map((course) => [
    course.attemptId || course.id,
    groupByType.get(String(course.type || "Core").trim() || "Core"),
  ]));
  const inferredCredits = groups.reduce((sum, group) => sum + group.creditsRequired, 0);
  if (hasProgramTotal && totalProgramCredits > inferredCredits) {
    groups.push({ id: groups.length + 1, name: "Other program requirements", creditsRequired: totalProgramCredits - inferredCredits, inferred: true });
  }
  return { groups, assignments, source: hasFutureCourses ? "study-plan-types" : "transcript-types" };
}
