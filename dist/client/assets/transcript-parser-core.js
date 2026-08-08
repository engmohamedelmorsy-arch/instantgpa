import { studyPlanStatus } from "./academic-plan-parser.js";

// Pure transcript table parsing and semantic row reconciliation. File IO and
// OCR live in transcript-import.js; every input format converges on this one
// tested parser before the review screen.
export const COLUMN_GUESSES = {
  term: ["semester", "term", "period", "الفصل", "الترم"],
  code: ["code", "course code", "module code", "subject code", "كود", "رمز المقرر"],
  name: ["course title", "course name", "module", "subject", "title", "course", "اسم المقرر", "المادة"],
  credits: ["credits", "credit hours", "credit", "hours", "units", "الساعات", "ساعات معتمدة"],
  grade: ["grade", "course grade", "gr", "grd", "result", "mark", "التقدير", "الدرجة"],
  percentage: ["percentage", "percent", "score", "mark %", "النسبة", "الدرجة المئوية"],
  type: ["core/elective", "type", "status", "نوع المقرر", "الحالة"],
  prerequisite: ["preq", "preq code", "prereq", "prereq code", "prerequisite", "prerequisite code", "متطلب سابق"],
};

const GRADE_LIKE_VALUES = new Set([
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F",
  "P", "PASS", "U", "IP", "I", "W", "S", "US", "CR", "NC", "--",
]);

const TYPE_VALUE_ALIASES = new Map([
  ["core", "Core"],
  ["required", "Core"],
  ["mandatory", "Core"],
  ["compulsory", "Core"],
  ["elect", "Elective"],
  ["elective", "Elective"],
  ["optional", "Elective"],
]);

const SEMESTER_ORDINALS = new Set([
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth",
  "nineteenth", "twentieth",
]);

export function normalizedCell(value) {
  return String(value ?? "").toLowerCase().replace(/[_./()-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function headerScore(row) {
  const cells = row.map(normalizedCell);
  return Object.values(COLUMN_GUESSES).reduce((score, guesses) => {
    const matched = cells.some((cell) => guesses.some((guess) => cell === guess || cell.includes(guess)));
    return score + (matched ? 1 : 0);
  }, 0);
}

function findHeaderIndex(matrix) {
  let bestIndex = 0;
  let bestScore = 0;
  matrix.slice(0, 30).forEach((row, index) => {
    const score = headerScore(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function matrixToParsed(matrix) {
  const cleaned = matrix
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some(Boolean));
  if (cleaned.length < 2) return { headers: [], rows: [] };
  const headerIndex = findHeaderIndex(cleaned);
  return {
    headers: cleaned[headerIndex],
    rows: cleaned.slice(headerIndex + 1).filter((row) => row.some(Boolean) && headerScore(row) < 2),
  };
}

export function parseTranscriptText(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const initialMatrix = lines.map((line) => line.split(line.includes("\t") ? "\t" : line.includes(";") ? ";" : ","));
  const headerIndex = findHeaderIndex(initialMatrix);
  const relevantLines = lines.slice(headerIndex);
  const delimiter = relevantLines[0].includes("\t") ? "\t" : relevantLines[0].includes(";") ? ";" : ",";
  const splitLine = (line) => {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === delimiter && !quoted) {
        cells.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }
    cells.push(current.trim());
    return cells;
  };
  return matrixToParsed(relevantLines.map(splitLine));
}

function normalizedValue(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizedGradeValue(value) {
  return normalizedValue(value).toUpperCase().replace(/\s*([+-])\s*/g, "$1");
}

function normalizedTypeValue(value) {
  return TYPE_VALUE_ALIASES.get(normalizedCell(value)) || "";
}

function isGradeValue(value) {
  return GRADE_LIKE_VALUES.has(normalizedGradeValue(value));
}

function isSemesterValue(value) {
  const normalized = normalizedCell(value);
  if (!normalized) return false;
  if (SEMESTER_ORDINALS.has(normalized)) return true;
  if (/^(?:sem|semester|term)\s*\d{1,2}$/i.test(normalized)) return true;
  if (/^(?:fall|spring|summer|winter)(?:\s+\d{2,4})?$/i.test(normalized)) return true;
  return /^\d{1,2}$/.test(normalized) && Number(normalized) >= 1 && Number(normalized) <= 20;
}

function isCourseCodeValue(value) {
  const normalized = normalizedValue(value);
  if (!normalized || normalized.length > 28 || /[&,;|+]/.test(normalized)) return false;
  if (normalized.split(/\s+/).length > 2) return false;
  const compact = normalized.replace(/[\s._/-]+/g, "");
  return compact.length >= 3
    && compact.length <= 20
    && /[A-Za-z]/.test(compact)
    && /\d/.test(compact)
    && /^[A-Za-z0-9]+$/.test(compact);
}

function prerequisiteCodes(value) {
  const normalized = normalizedValue(value);
  if (!normalized || normalized === "--" || isGradeValue(normalized) || normalizedTypeValue(normalized)) return [];
  const parts = normalized.split(/\s*(?:,|;|\||&|\+)\s*/).filter(Boolean);
  return parts.length && parts.every(isCourseCodeValue) ? parts : [];
}

function isCreditValue(value) {
  const normalized = normalizedValue(value).replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return false;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 30;
}

function isCourseNameValue(value) {
  const normalized = normalizedValue(value);
  if (normalized.length < 3 || normalized.length > 180) return false;
  if (isCourseCodeValue(normalized) || isGradeValue(normalized) || normalizedTypeValue(normalized)) return false;
  if (isSemesterValue(normalized) || isCreditValue(normalized) || prerequisiteCodes(normalized).length) return false;
  return /[A-Za-zÀ-ɏ؀-ۿ]/.test(normalized);
}

function chooseCell(entries, predicate, used, preferredIndex = -1, reverse = false) {
  const candidates = entries.filter((entry) => !used.has(entry.index) && predicate(entry.value));
  if (!candidates.length) return null;
  if (preferredIndex >= 0) {
    candidates.sort((left, right) => Math.abs(left.index - preferredIndex) - Math.abs(right.index - preferredIndex));
    return candidates[0];
  }
  return reverse ? candidates[candidates.length - 1] : candidates[0];
}

function mappedCell(entries, mapping, role) {
  const index = mapping.indexOf(role);
  return index >= 0 ? entries.find((entry) => entry.index === index) || null : null;
}

function reconcileRowByValue(row, mapping) {
  const entries = row.map((value, index) => ({ index, value: normalizedValue(value) }));
  const used = new Set();
  const takeMappedOrDetected = (role, predicate, options = {}) => {
    const mapped = mappedCell(entries, mapping, role);
    const selected = mapped && !used.has(mapped.index) && predicate(mapped.value)
      ? mapped
      : chooseCell(entries, predicate, used, mapping.indexOf(role), options.reverse);
    if (selected) used.add(selected.index);
    return selected;
  };

  const termCell = takeMappedOrDetected("term", isSemesterValue);
  const codeCell = takeMappedOrDetected("code", isCourseCodeValue);
  const typeCell = takeMappedOrDetected("type", (value) => Boolean(normalizedTypeValue(value)));
  const gradeCell = takeMappedOrDetected("grade", isGradeValue, { reverse: true });
  const creditsCell = takeMappedOrDetected("credits", isCreditValue);
  const primaryCode = normalizedValue(codeCell?.value).replace(/\s+/g, "").toUpperCase();
  const prerequisiteCell = takeMappedOrDetected("prerequisite", (value) => {
    const codes = prerequisiteCodes(value);
    return codes.length > 0 && codes.some((code) => normalizedValue(code).replace(/\s+/g, "").toUpperCase() !== primaryCode);
  });
  const nameCell = takeMappedOrDetected("name", isCourseNameValue);
  const percentageCell = takeMappedOrDetected("percentage", (value) => {
    const normalized = normalizedValue(value).replace(/%$/, "").replace(",", ".");
    const numeric = Number(normalized);
    return /%$/.test(normalizedValue(value)) && Number.isFinite(numeric) && numeric >= 0 && numeric <= 100;
  });
  const mappedGrade = mappedCell(entries, mapping, "grade")?.value || "";
  const safeUnknownGrade = mappedGrade
    && !normalizedTypeValue(mappedGrade)
    && !isCreditValue(mappedGrade)
    && !isCourseCodeValue(mappedGrade)
    && !prerequisiteCodes(mappedGrade).length
    ? mappedGrade
    : "";

  return {
    term: termCell?.value || "Semester 1",
    code: codeCell?.value || "",
    name: nameCell?.value || "",
    credits: creditsCell ? parseNumeric(creditsCell.value) : null,
    percentage: percentageCell ? parseNumeric(percentageCell.value.replace(/%$/, "")) : null,
    grade: gradeCell?.value || safeUnknownGrade,
    type: normalizedTypeValue(typeCell?.value) || "Core",
    prerequisite: prerequisiteCell?.value || "",
  };
}

export function guessColumnMapping(headers) {
  return headers.map((header) => {
    const value = normalizedCell(header);
    const candidates = [];
    for (const [role, patterns] of Object.entries(COLUMN_GUESSES)) {
      for (const pattern of patterns) {
        const normalizedPattern = normalizedCell(pattern);
        if (value === normalizedPattern) return role;
        if (normalizedPattern && value.includes(normalizedPattern)) candidates.push({ role, specificity: normalizedPattern.length });
      }
    }
    candidates.sort((left, right) => right.specificity - left.specificity);
    return candidates[0]?.role ?? null;
  });
}

function repairMissingPrerequisiteCell(row, mapping) {
  const prerequisiteIndex = mapping.indexOf("prerequisite");
  const gradeIndex = mapping.indexOf("grade");
  const gradeIsMissing = gradeIndex >= 0 && String(row[gradeIndex] ?? "").trim() === "";
  const shiftedValue = prerequisiteIndex >= 0 ? String(row[prerequisiteIndex] ?? "").trim().toUpperCase() : "";
  const exactlyOneCellShort = row.length === mapping.length - 1;
  const adjacentColumns = gradeIndex === prerequisiteIndex + 1;
  if (!gradeIsMissing || !exactlyOneCellShort || !adjacentColumns || !GRADE_LIKE_VALUES.has(shiftedValue)) return row;
  const repaired = [...row];
  repaired[prerequisiteIndex] = "";
  repaired[gradeIndex] = row[prerequisiteIndex];
  return repaired;
}

export function parseNumeric(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function applyMapping(rows, mapping, options = {}) {
  const records = [];
  const invalidRows = [];
  rows.forEach((originalRow, index) => {
    const row = repairMissingPrerequisiteCell(originalRow, mapping);
    const reconciled = reconcileRowByValue(row, mapping);
    if (!reconciled.name && !reconciled.code) {
      invalidRows.push({ index, raw: row, message: "Missing course name and code" });
      return;
    }
    records.push({
      reviewId: `review-${index}`,
      ...reconciled,
      status: studyPlanStatus(reconciled.grade, options.documentMode),
      include: true,
      importAction: "",
    });
  });
  return { records, invalidRows };
}
