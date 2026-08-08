import { normalizeGradeLabel } from "./academic-policy.js";

const COURSE_CODE_PATTERN = /^[A-Z]{1,8}\s*\d{2,5}[A-Z]*$/i;

function cleanPrerequisite(value) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return /^(none|--|—)$/i.test(cleaned) ? "" : cleaned;
}

function isPrerequisiteContinuation(value) {
  return /[A-Z]{1,8}\s*\d{1,5}/i.test(value) && !/\d+\.\d+/.test(value);
}

export function studyPlanStatus(grade, documentMode = "transcript") {
  const normalized = normalizeGradeLabel(grade);
  if (!normalized || normalized === "--") return "planned";
  if (documentMode === "study-plan" && normalized === "U") return "in_progress";
  return "graded";
}

const FALLBACK_COLUMNS = [
  ["code", 0],
  ["name", 0.105],
  ["term", 0.565],
  ["prerequisite", 0.68],
  ["type", 0.86],
  ["grade", 0.94],
];

function headerRole(value) {
  const normalized = String(value || "").toLowerCase().replace(/[._/()-]+/g, " ").replace(/\s+/g, " ").trim();
  if (/^(course\s*)?code$|^module\s*code$|^subject\s*code$/.test(normalized)) return "code";
  if (/course\s*(title|name)|module\s*(title|name)|subject\s*(title|name)/.test(normalized)) return "name";
  if (/^(semester|sem|term|period)$/.test(normalized)) return "term";
  if (/credit|hours|units/.test(normalized)) return "credits";
  if (/preq|prereq|prerequisite/.test(normalized)) return "prerequisite";
  if (/core|elective|^type$|^cl$/.test(normalized)) return "type";
  if (/^gr$|grade|result|mark/.test(normalized)) return "grade";
  return "";
}

function deriveColumns(headerCells, baseX, columnWidth) {
  const anchors = headerCells
    .map((cell) => ({ role: headerRole(cell.value), x: Number(cell.x) - baseX }))
    .filter((entry) => entry.role && entry.x >= -2 && entry.x <= columnWidth + 2)
    .sort((left, right) => left.x - right.x)
    .filter((entry, index, list) => index === list.findIndex((candidate) => candidate.role === entry.role));
  const source = anchors.length >= 3
    ? anchors
    : FALLBACK_COLUMNS.map(([role, ratio]) => ({ role, x: ratio * columnWidth }));
  return source.map((entry, index) => ({
    ...entry,
    // Course names often begin well before their centred "Course Title"
    // heading. Keep the narrow code column close to its own anchor; use
    // midpoints for the remaining columns.
    end: index === source.length - 1
      ? Infinity
      : entry.role === "code"
        ? entry.x + (source[index + 1].x - entry.x) * 0.25
        : (entry.x + source[index + 1].x) / 2,
  }));
}

function parsePlanHalf(cells, baseX, halfWidth, columns) {
  const values = { code: [], name: [], term: [], credits: [], prerequisite: [], type: [], grade: [] };
  const layout = columns?.length ? columns : deriveColumns([], baseX, halfWidth);
  cells.sort((a, b) => a.x - b.x).forEach((cell) => {
    const relativeX = cell.x - baseX;
    const value = String(cell.value || "").trim();
    if (!value) return;
    const column = layout.find((entry) => relativeX < entry.end) || layout.at(-1);
    if (column && values[column.role]) values[column.role].push(value);
  });
  return Object.fromEntries(Object.entries(values).map(([key, parts]) => [
    key,
    parts.join(" ").replace(/\s+/g, " ").trim(),
  ]));
}

function suggestedProgramCredits(rawText) {
  const text = String(rawText || "").replace(/\s+/g, " ");
  const patterns = [
    /(?:total|program|programme|degree)[^\d]{0,40}(\d{2,3}(?:\.\d+)?)\s*(?:credit(?:\s*hours?)?|credits|units)/i,
    /(\d{2,3}(?:\.\d+)?)\s*(?:total\s*)?(?:credit(?:\s*hours?)?|credits|units)\s*(?:required|program|programme|degree)?/i,
  ];
  for (const pattern of patterns) {
    const value = Number(text.match(pattern)?.[1]);
    if (Number.isFinite(value) && value >= 60 && value <= 1000) return value;
  }
  return null;
}

export function parseAcademicPlanLayout(pages, rawText = "") {
  const detectedText = [rawText, ...(pages || []).flatMap((page) => (
    (page.groups || []).map((group) => group.cells.map((item) => item.value).join(" "))
  ))].join("\n");
  if (!/\bcourse\s+(?:title|name)\b/i.test(detectedText)
    || !/\b(?:code|module\s+code|subject\s+code)\b/i.test(detectedText)
    || !/(?:pre(?:re)?q|prerequisite|core|elective|semester|term|study\s+plan|curriculum)/i.test(detectedText)) return null;

  const records = [];
  const lastBySide = { left: null, right: null };
  const semesterBySide = { left: null, right: null };
  const columnsBySide = { left: null, right: null };
  let splitX = null;

  (pages || []).forEach((page) => {
    const width = Number(page.width) || 595;
    const groups = [...(page.groups || [])].sort((a, b) => b.y - a.y);
    const headerGroup = groups.find((group) => {
      const text = group.cells.map((cell) => cell.value).join(" ");
      return /\bcourse\s+(?:title|name)\b/i.test(text) && /\bcode\b/i.test(text);
    });
    let twoColumns = false;
    if (headerGroup) {
      const codeCells = headerGroup.cells
        .filter((cell) => headerRole(cell.value) === "code")
        .sort((a, b) => a.x - b.x);
      if (codeCells.length > 1) {
        const rightCodeX = codeCells[1].x;
        const leftEdgeX = Math.max(...headerGroup.cells
          .filter((cell) => cell.x < rightCodeX && String(cell.value || "").trim())
          .map((cell) => cell.x));
        splitX = (leftEdgeX + rightCodeX) / 2;
        twoColumns = true;
      }
    }
    if (splitX && splitX < width - 20) twoColumns = true;
    const sideDefinitions = twoColumns
      ? [["left", 0, splitX], ["right", splitX, width - splitX]]
      : [["left", 0, width]];
    if (headerGroup) {
      sideDefinitions.forEach(([side, baseX, sideWidth]) => {
        const cells = headerGroup.cells.filter((cell) => cell.x >= baseX && cell.x < baseX + sideWidth);
        columnsBySide[side] = deriveColumns(cells, baseX, sideWidth);
      });
    }
    groups.forEach((group) => {
      const groupText = group.cells.map((cell) => cell.value).join(" ");
      if (/(?:semester|term)\s*(?:\(|:)?\s*\d+/i.test(groupText)) {
        group.cells.forEach((cell) => {
          const match = String(cell.value || "").match(/(?:semester|term)\s*(?:\(|:)?\s*(\d+)/i);
          if (!match) return;
          semesterBySide[twoColumns && cell.x >= splitX ? "right" : "left"] = `Semester ${match[1]}`;
        });
        return;
      }
      if (/\bcourse\s+(?:title|name)\b/i.test(groupText) && /\bcode\b/i.test(groupText)) return;

      sideDefinitions.forEach(([side, baseX, sideWidth]) => {
        const sideCells = group.cells.filter((cell) => cell.x >= baseX && cell.x < baseX + sideWidth);
        if (!sideCells.length) return;
        const row = parsePlanHalf(sideCells, baseX, sideWidth, columnsBySide[side]);
        const normalizedCode = row.code.replace(/\s+/g, "");
        if (!COURSE_CODE_PATTERN.test(normalizedCode)) {
          const continuation = cleanPrerequisite(row.prerequisite);
          if (continuation && isPrerequisiteContinuation(continuation) && lastBySide[side]) {
            lastBySide[side].prerequisite = [
              lastBySide[side].prerequisite,
              continuation,
            ].filter(Boolean).join(" ");
          }
          return;
        }
        if (!row.name || /^(code|course title)$/i.test(row.name)) return;
        const course = {
          term: semesterBySide[side] || row.term || "Semester 1",
          code: row.code,
          name: row.name,
          credits: /^\d+(?:[.,]\d+)?$/.test(row.credits) ? Number(row.credits.replace(",", ".")) : "",
          grade: row.grade || "--",
          type: row.type || "Core",
          prerequisite: cleanPrerequisite(row.prerequisite),
        };
        records.push(course);
        lastBySide[side] = course;
      });
    });
  });

  if (records.length < 3) return null;
  return {
    headers: ["Semester", "Code", "Course Title", "Credits", "Grade", "Core/Elective", "Prerequisite"],
    rows: records.map((course) => [
      course.term,
      course.code,
      course.name,
      course.credits,
      course.grade,
      course.type,
      course.prerequisite,
    ]),
    documentMode: "study-plan",
    suggestedProgramCredits: suggestedProgramCredits(detectedText),
  };
}
