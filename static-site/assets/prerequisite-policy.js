import { normalizeCourseCode } from "./academic-policy.js";

function normalizedGroup(values) {
  return [...new Set((values || []).map(normalizeCourseCode).filter(Boolean))];
}

export function parsePrerequisiteGroups(value) {
  const inputs = Array.isArray(value) ? value : [value];
  const groups = [];

  inputs.forEach((input) => {
    if (Array.isArray(input)) {
      const alternatives = normalizedGroup(input);
      if (alternatives.length) groups.push(alternatives);
      return;
    }
    String(input ?? "")
      .replace(/(?:\s*[&|]\s*)+$/g, "")
      .split(/\s*&\s*/)
      .forEach((requiredPart) => {
        const alternatives = normalizedGroup(requiredPart.split(/\s*\|\s*/));
        if (alternatives.length) groups.push(alternatives);
      });
  });

  return groups;
}

export function prerequisitesSatisfied(course, completedCodes) {
  const groups = Array.isArray(course.prerequisiteGroups) && course.prerequisiteGroups.length
    ? parsePrerequisiteGroups(course.prerequisiteGroups)
    : parsePrerequisiteGroups(course.prerequisites || course.prerequisite || course.prereqCode);
  return groups.every((alternatives) =>
    alternatives.some((code) => completedCodes.has(normalizeCourseCode(code))));
}

export function flattenedPrerequisites(value) {
  return [...new Set(parsePrerequisiteGroups(value).flat())];
}
