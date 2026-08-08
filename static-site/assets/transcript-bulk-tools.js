const SUPPORTED_FIELDS = new Set(["term", "credits", "grade"]);

function hasValue(field, value) {
  if (field === "credits") {
    const credits = Number(value);
    return Number.isFinite(credits) && credits > 0;
  }
  return String(value ?? "").trim().length > 0;
}

export function normalizeBulkValue(field, rawValue) {
  if (!SUPPORTED_FIELDS.has(field)) return { ok: false, value: null };
  if (field === "credits") {
    const value = Number(String(rawValue ?? "").trim().replace(",", "."));
    return Number.isFinite(value) && value > 0 && value <= 60
      ? { ok: true, value }
      : { ok: false, value: null };
  }
  const value = String(rawValue ?? "").trim();
  return value ? { ok: true, value } : { ok: false, value: "" };
}

export function bulkTargetSummary(records, { field, rawValue, mode = "missing" }) {
  const normalized = normalizeBulkValue(field, rawValue);
  if (!normalized.ok) return { valid: false, targets: 0, replacements: 0 };

  let targets = 0;
  let replacements = 0;
  for (const record of records) {
    if (!record.include || record.importAction === "ignore") continue;
    const existing = hasValue(field, record[field]);
    if (mode === "missing" && existing) continue;
    targets += 1;
    if (existing && record[field] !== normalized.value) replacements += 1;
  }
  return { valid: true, targets, replacements };
}

export function applyBulkValue(records, { field, rawValue, mode = "missing" }) {
  const summary = bulkTargetSummary(records, { field, rawValue, mode });
  if (!summary.valid) return { ...summary, changed: 0 };

  const normalized = normalizeBulkValue(field, rawValue);
  let changed = 0;
  for (const record of records) {
    if (!record.include || record.importAction === "ignore") continue;
    if (mode === "missing" && hasValue(field, record[field])) continue;
    if (record[field] === normalized.value) continue;
    record[field] = normalized.value;
    changed += 1;
  }
  return { ...summary, changed };
}
