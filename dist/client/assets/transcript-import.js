import { AcademicRecord } from "./academic-record.js";
import { GradingEngine } from "./grading-engine.js";
import { normalizeGradeLabel } from "./academic-policy.js";
import { currentLanguage } from "./localization.js";
import { track } from "./analytics.js";
import { navigateTo, routeHref } from "./app.js";
import { studyPlanStatus } from "./academic-plan-parser.js";
import { applyBulkValue, bulkTargetSummary } from "./transcript-bulk-tools.js";
import { FreeWorkflow } from "./free-workflow.js";
import { Storage } from "./storage.js";
import {
  COLUMN_GUESSES,
  applyMapping,
  guessColumnMapping,
  normalizedCell,
  parseNumeric,
  parseTranscriptText,
} from "./transcript-parser-core.js";
import {
  FREE_MAX_PDF_PAGES,
  PREMIUM_MAX_PDF_PAGES,
  parseUploadedFile,
  sha256File,
} from "./transcript-file-reader.js";

export { applyMapping, guessColumnMapping, parseTranscriptText } from "./transcript-parser-core.js";

const AUTO_REDIRECT_SECONDS = 5;
const SPECIAL_STATUS_GRADES = [
  { label: "P", hint: "Pass" },
  { label: "U", hint: "Ungraded / in progress" },
  { label: "IP", hint: "In progress" },
  { label: "W", hint: "Withdrawn" },
  { label: "I", hint: "Incomplete" },
];

const SAMPLE_TRANSCRIPT = [
  "Semester\tCode\tCourse Title\tCredits\tGrade",
  "Fall 2025\tENG101\tAcademic Writing\t3\tA-",
  "Fall 2025\tMAT121\tCalculus I\t4\tB+",
  "Fall 2025\tCSC110\tIntroduction to Programming\t3\tA",
  "Spring 2026\tPHY101\tGeneral Physics\t4\tB",
  "Spring 2026\tCSC120\tData Structures\t3\tU",
].join("\n");
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

export function getSavedImport() {
  const record = AcademicRecord.get();
  return record.courses.length ? { records: record.courses, importedAt: record.updatedAt } : null;
}

export function saveImport(records) {
  return AcademicRecord.import(records, { mode: "merge", source: "transcript" });
}

export function mount(container) {
  let stage = 1;
  let rawText = "";
  let parsed = { headers: [], rows: [] };
  let mapping = [];
  let review = { records: [], invalidRows: [] };
  let uploadedSource = "";
  let sourceConfidence = "";
  let sourceMeasuredConfidence = null;
  let documentMode = "transcript";
  let programCreditsDraft = "";
  let programCreditsConfirmed = false;
  let pendingCloudFile = null;
  let activeController = null;
  let statusMessage = "";
  let statusKind = "";
  let importError = "";
  let bulkField = "credits";
  let bulkMode = "missing";
  let bulkScope = "all";
  let bulkStatus = "";
  let reviewFilter = "all";
  let openCourseId = "";
  let selectedSourceReviewId = "";
  let sourceObjectUrl = "";
  let sourceMimeType = "";
  let sourceFileName = "";
  let sourceFingerprint = null;
  let previewRotation = 0;
  let previewZoom = 1;
  let maxPdfPages = FREE_MAX_PDF_PAGES;
  let pagePlanLabel = "Free";
  const confirmedMappingIndexes = new Set();
  let successCountdownTimer = null;
  let successRedirectCancelled = false;
  let correctionTracked = false;
  const removedReviewIds = new Set();
  const bulkValues = {
    term: "",
    credits: "3",
    grade: "",
  };

  async function refreshPageAllowance({ rerender = false } = {}) {
    try {
      const status = await CloudSync.getAccountStatus();
      const premium = Boolean(status.ok && (status.data?.isOwner || status.data?.entitlement?.status === "active"));
      maxPdfPages = premium ? PREMIUM_MAX_PDF_PAGES : FREE_MAX_PDF_PAGES;
      pagePlanLabel = premium ? (status.data?.isOwner ? "Owner" : "Premium") : "Free";
    } catch {
      maxPdfPages = FREE_MAX_PDF_PAGES;
      pagePlanLabel = "Free";
    }
    if (rerender && stage === 1) renderPaste();
    return maxPdfPages;
  }

  function replaceSourcePreview(file) {
    if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
    sourceObjectUrl = "";
    sourceMimeType = file?.type || "";
    sourceFileName = file?.name || "";
    previewRotation = 0;
    previewZoom = 1;
    if (file && (file.type === "application/pdf" || file.type.startsWith("image/"))) {
      sourceObjectUrl = URL.createObjectURL(file);
    }
  }

  function mappingConfidence(role) {
    const index = mapping.indexOf(role);
    if (index < 0) return 0;
    if (confirmedMappingIndexes.has(index)) return 100;
    const header = normalizedCell(parsed.headers[index]);
    const exact = (COLUMN_GUESSES[role] || []).some((guess) => header === normalizedCell(guess));
    return exact ? 97 : 68;
  }

  function applyReviewConfidence() {
    // Prefer the OCR/cloud engine's own measured confidence for this document
    // over a flat per-source-type guess — it reflects how legible this
    // specific scan actually was, not every scan of that type.
    const sourceBase = Number.isFinite(sourceMeasuredConfidence) ? Math.round(sourceMeasuredConfidence)
      : /manual|sample/.test(sourceConfidence || "manual") ? 100
        : /local-structured/.test(sourceConfidence) ? 96
          : /cloud/.test(sourceConfidence) ? 88
            : /ocr/.test(sourceConfidence) ? 76
              : 90;
    review.records.forEach((course) => {
      const nameMap = Math.max(mappingConfidence("name"), mappingConfidence("code"));
      const fieldConfidence = {
        name: Math.min(sourceBase, nameMap || sourceBase, course.name || course.code ? 100 : 20),
        credits: Math.min(sourceBase, mappingConfidence("credits") || sourceBase, Number.isFinite(Number(course.credits)) ? 100 : 30),
        grade: Math.min(sourceBase, mappingConfidence("grade") || sourceBase, course.grade ? 100 : documentMode === "study-plan" ? 95 : 35),
        term: Math.min(sourceBase, mappingConfidence("term") || sourceBase),
      };
      course.fieldConfidence = Object.fromEntries(Object.entries(fieldConfidence).map(([key, value]) => [key, Math.round(value)]));
    });
  }

  function confidenceChip(value, label) {
    const score = Math.max(0, Math.min(100, Number(value) || 0));
    const level = score >= 90 ? "high" : score >= 70 ? "medium" : "low";
    return `<span class="field-confidence"><span class="confidence-chip confidence-${level}">${score}%</span>${esc(label)}</span>`;
  }

  function sourcePreviewHtml() {
    const selected = review.records.find((course) => course.reviewId === selectedSourceReviewId);
    let content;
    if (sourceObjectUrl && sourceMimeType === "application/pdf") {
      content = `<iframe title="Original transcript PDF" src="${esc(sourceObjectUrl)}#page=${selected?.sourcePage || 1}&zoom=page-width"></iframe>`;
    } else if (sourceObjectUrl && sourceMimeType.startsWith("image/")) {
      content = `<img src="${esc(sourceObjectUrl)}" alt="Original transcript page" style="--preview-rotation:${previewRotation}deg;--preview-zoom:${previewZoom}">`;
    } else {
      content = `<pre dir="auto">${esc(rawText || "The original source preview is available for PDF and image uploads. Pasted rows appear here after detection.")}</pre>`;
    }
    return `<aside class="transcript-source-pane" aria-label="Original transcript">
      <header><div><strong>Original source</strong><small>${esc(sourceFileName || uploadedSource || "Pasted table")}</small></div><div>${sourceMimeType.startsWith("image/") ? '<button type="button" id="sourceRotate" aria-label="Rotate source">↻</button><button type="button" id="sourceZoomOut" aria-label="Zoom out">−</button><button type="button" id="sourceZoomIn" aria-label="Zoom in">+</button>' : ""}</div></header>
      <div class="source-selection">${selected ? `Selected: <strong>${esc(selected.code || selected.name)}</strong>${selected.sourcePage ? ` · page ${selected.sourcePage}` : ""}` : "Select a course on the right to connect it to the source."}</div>
      <div class="transcript-source-frame">${content}</div>
      <p class="field-note">Exact line highlighting appears when the OCR provider returns page coordinates. Otherwise the selected course and source page remain linked for manual verification.</p>
    </aside>`;
  }

  function stepper() {
    return `<div class="record-stepper" aria-label="Import progress">
      ${[["Paste", 1], ["Review", 2], ["Preview", 3]].map(([label, number]) => `
        <span class="${stage === number ? "is-active" : stage > number ? "is-done" : ""}" ${stage === number ? 'aria-current="step"' : ""}>
          <b>${stage > number ? "✓" : number}</b>${label}
        </span>`).join("<i aria-hidden=\"true\">·</i>")}
    </div>`;
  }

  function render() {
    clearSuccessCountdown();
    if (stage === 1) renderPaste();
    else if (stage === 2) renderReview();
    else renderPreview();
    requestAnimationFrame(() => container.querySelector("[data-stage-heading]")?.focus({ preventScroll: true }));
  }

  function clearSuccessCountdown() {
    if (successCountdownTimer !== null) {
      window.clearInterval(successCountdownTimer);
      successCountdownTimer = null;
    }
  }

  function pauseSuccessRedirect() {
    successRedirectCancelled = true;
    clearSuccessCountdown();
    const status = container.querySelector("#tiAutoRedirect");
    if (status) status.innerHTML = "Automatic navigation paused. You can continue when you are ready.";
  }

  function statusHtml() {
    if (!statusMessage) return "";
    return `<p class="setup-status__text ${statusKind === "warn" ? "setup-status__text--warn" : statusKind === "ok" ? "transcript-file-ready" : ""}">${esc(statusMessage)}</p>`;
  }

  function consentHtml() {
    if (!pendingCloudFile) return "";
    return `<div class="ocr-consent" role="group" aria-labelledby="ocrConsentTitle">
      <h3 id="ocrConsentTitle">Secure OCR is needed to read this file</h3>
      <p>Local reading could not identify a reliable transcript table. An active OCR subscription can send this file to Google Document AI in the EU.</p>
      <ul>
        <li>The file is used only to extract transcript text and table structure.</li>
        <li>Transcript content is not sent to Analytics or used for advertising.</li>
        <li>You will review every detected row before anything is imported. <a href="${routeHref("account")}">Check sign-in and plan</a>.</li>
      </ul>
      <label class="consent-check"><input type="checkbox" id="ocrConsent"> I understand and want to use secure cloud OCR for this file.</label>
      <div class="row-actions">
        <button type="button" class="btn btn--primary" id="useCloudOcr" disabled>Use secure OCR</button>
        <button type="button" class="btn btn--ghost" id="useLocalOcr">Keep processing local</button>
        <button type="button" class="btn btn--text" id="cancelOcr">Cancel</button>
      </div>
    </div>`;
  }

  function renderPaste() {
    container.innerHTML = `
      <div class="record-page">
        <h2 data-stage-heading tabindex="-1">Transcript Import</h2>
        <p class="tool-sub">Upload an Excel or PDF transcript, or paste a table. ${pagePlanLabel} access accepts up to ${maxPdfPages} transcript pages. No course is saved before review and confirmation.</p>
        ${stepper()}
        <section class="tool-card tool-card--wide">
          <div class="record-card-title"><strong>▣ Transcript source</strong><span dir="auto">${uploadedSource ? esc(uploadedSource) : "Excel, PDF, CSV, TSV, or pasted table"}</span><button class="btn btn--text" id="tiClear">Clear</button></div>
          <label class="transcript-dropzone" id="tiDropzone" for="tiFile">
            <span class="transcript-upload-icon" aria-hidden="true">⇧</span>
            <strong>Choose a transcript file</strong>
            <span>XLSX, PDF, CSV, TSV, JPG, PNG, TIFF, BMP, or WebP · maximum 20 MB</span>
            <input class="transcript-file-input" type="file" id="tiFile" accept=".xlsx,.xlsm,.pdf,.csv,.tsv,.txt,.jpg,.jpeg,.png,.tif,.tiff,.bmp,.webp,application/pdf,image/*">
          </label>
          <label class="mobile-scan-launch" for="tiMobileScan"><span aria-hidden="true">▣</span><strong>Mobile Scan Mode</strong><small>Photograph several transcript pages in sequence.</small><input class="transcript-file-input" type="file" id="tiMobileScan" accept="image/*" capture="environment" multiple></label>
          ${consentHtml()}
          <div class="transcript-or"><span>or paste a table</span></div>
          <label class="field" for="tiText"><span>Transcript table</span></label>
          <textarea id="tiText" class="tf-textarea bidi-token" rows="10" placeholder="Semester&#9;Code&#9;Course Title&#9;Credits&#9;Grade&#10;1&#9;CS101&#9;Introduction to Programming&#9;3&#9;A-">${esc(rawText)}</textarea>
          <div class="row-actions record-actions record-actions--inline">
            ${activeController ? '<button class="btn btn--ghost" id="tiCancelRead">Cancel reading</button>' : ""}
            <button class="btn btn--ghost" id="tiLoadSample">Try a sample transcript</button>
            <button class="btn btn--primary" id="tiDetect">Detect columns</button>
          </div>
          <div id="tiStatus" class="setup-status" aria-live="polite">${statusHtml()}</div>
        </section>
        ${savedTranscriptHtml(AcademicRecord.semesters())}
        ${historyHtml()}
      </div>`;
    wirePaste();
    wireSavedTranscript(() => renderPaste());
    wireHistory(() => renderPaste());
  }

  function setStatus(message, kind = "") {
    statusMessage = message;
    statusKind = kind;
    const status = container.querySelector("#tiStatus");
    if (status) status.innerHTML = statusHtml();
  }

  async function processFile(file, mode = "local") {
    if (!file) return;
    track("transcript_upload_started", { file_type: file.type || "unknown", size_bucket: file.size < 1_000_000 ? "under_1mb" : file.size < 5_000_000 ? "1-5mb" : "5mb_plus" });
    await refreshPageAllowance();
    replaceSourcePreview(file);
    importError = "";
    activeController?.abort();
    activeController = new AbortController();
    pendingCloudFile = null;
    setStatus(`Reading ${file.name}…`);
    try {
      const fingerprintPromise = sha256File(file);
      const result = await parseUploadedFile(file, {
        cloud: mode === "cloud",
        localOcr: mode === "local-ocr",
        signal: activeController.signal,
        onProgress: (message) => setStatus(message),
        maxPages: maxPdfPages,
        planLabel: pagePlanLabel,
      });
      parsed = result.parsed;
      rawText = result.rawText;
      uploadedSource = `${result.sourceLabel} · ${file.name}`;
      sourceConfidence = result.confidence || "";
      sourceMeasuredConfidence = Number.isFinite(result.measuredConfidence) ? result.measuredConfidence : null;
      sourceFingerprint = { sha256: await fingerprintPromise, bytes: file.size, mimeType: file.type || "application/octet-stream", pageCount: result.pageCount || 1 };
      documentMode = result.documentMode || "transcript";
      programCreditsDraft = result.suggestedProgramCredits == null ? "" : String(result.suggestedProgramCredits);
      programCreditsConfirmed = false;
      statusMessage = `✓ ${file.name} read successfully · ${parsed.rows.length} possible course rows found.${result.warning ? ` ${result.warning}` : ""}`;
      statusKind = result.warning ? "warn" : "ok";
      activeController = null;
      renderPaste();
    } catch (error) {
      activeController = null;
      if (error.name === "AbortError") {
        setStatus("Reading cancelled.", "warn");
        return;
      }
      if (error.code === "CLOUD_OCR_CONSENT_REQUIRED") {
        pendingCloudFile = file;
        statusMessage = "";
        renderPaste();
        return;
      }
      setStatus(error.message || "This file could not be read.", "warn");
    }
  }

  async function processMobileFiles(files) {
    const pages = [...(files || [])];
    if (!pages.length) return;
    track("transcript_upload_started", { file_type: "mobile_images", page_bucket: pages.length <= 3 ? "1-3" : pages.length <= 10 ? "4-10" : "11+" });
    await refreshPageAllowance();
    if (pages.length > maxPdfPages) {
      setStatus(`You selected ${pages.length} pages. ${pagePlanLabel} transcript review accepts a maximum of ${maxPdfPages} pages. Please upload ${maxPdfPages} pages or fewer.`, "warn");
      return;
    }
    replaceSourcePreview(pages[0]);
    activeController?.abort();
    activeController = new AbortController();
    setStatus(`Reading ${pages.length} photographed page(s)…`);
    try {
      const results = [];
      const pageHashes = [];
      for (let index = 0; index < pages.length; index += 1) {
        setStatus(`Reading photographed page ${index + 1} of ${pages.length}…`);
        results.push(await parseUploadedFile(pages[index], {
          localOcr: true,
          signal: activeController.signal,
          onProgress: (message) => setStatus(`Page ${index + 1}: ${message}`),
          maxPages: maxPdfPages,
          planLabel: pagePlanLabel,
        }));
        pageHashes.push(await sha256File(pages[index]));
      }
      const first = results[0]?.parsed || { headers: [], rows: [] };
      parsed = { headers: first.headers || [], rows: results.flatMap((result) => result.parsed?.rows || []) };
      rawText = results.map((result) => result.rawText || "").join("\n");
      uploadedSource = `Mobile Scan · ${pages.length} pages`;
      sourceConfidence = "local-ocr-review";
      const pageConfidences = results.map((result) => result.measuredConfidence).filter((value) => Number.isFinite(value));
      sourceMeasuredConfidence = pageConfidences.length ? pageConfidences.reduce((sum, value) => sum + value, 0) / pageConfidences.length : null;
      sourceFileName = `${pages.length} photographed pages`;
      const combined = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pageHashes.join(":")));
      sourceFingerprint = { sha256: [...new Uint8Array(combined)].map((byte) => byte.toString(16).padStart(2, "0")).join(""), bytes: pages.reduce((sum, page) => sum + page.size, 0), mimeType: "multipart/image", pageCount: pages.length };
      statusMessage = `✓ ${pages.length} pages read · ${parsed.rows.length} possible course rows found. Review every field.`;
      statusKind = "warn";
      activeController = null;
      renderPaste();
    } catch (error) {
      activeController = null;
      setStatus(error.name === "AbortError" ? "Reading cancelled." : error.message || "The photographed pages could not be read.", "warn");
    }
  }

  function wirePaste() {
    container.querySelector("#tiClear")?.addEventListener("click", () => {
      activeController?.abort();
      rawText = "";
      parsed = { headers: [], rows: [] };
      uploadedSource = "";
      sourceConfidence = "";
      sourceMeasuredConfidence = null;
      sourceFingerprint = null;
      replaceSourcePreview(null);
      documentMode = "transcript";
      programCreditsDraft = "";
      programCreditsConfirmed = false;
      pendingCloudFile = null;
      statusMessage = "";
      importError = "";
      removedReviewIds.clear();
      renderPaste();
    });
    container.querySelector("#tiFile")?.addEventListener("change", (event) => processFile(event.target.files[0]));
    container.querySelector("#tiMobileScan")?.addEventListener("change", (event) => processMobileFiles(event.target.files));
    const dropzone = container.querySelector("#tiDropzone");
    ["dragenter", "dragover"].forEach((name) => dropzone?.addEventListener(name, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach((name) => dropzone?.addEventListener(name, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragging");
    }));
    dropzone?.addEventListener("drop", (event) => processFile(event.dataTransfer.files[0]));
    container.querySelector("#tiCancelRead")?.addEventListener("click", () => activeController?.abort());
    container.querySelector("#tiLoadSample")?.addEventListener("click", () => {
      rawText = SAMPLE_TRANSCRIPT;
      parsed = parseTranscriptText(rawText);
      uploadedSource = "Sample transcript · local preview";
      sourceConfidence = "sample";
      sourceMeasuredConfidence = null;
      sourceFingerprint = null;
      documentMode = "transcript";
      statusMessage = `✓ Sample loaded · ${parsed.rows.length} course rows ready to review.`;
      statusKind = "ok";
      pendingCloudFile = null;
      renderPaste();
      requestAnimationFrame(() => container.querySelector("#tiDetect")?.focus({ preventScroll: true }));
    });
    container.querySelector("#ocrConsent")?.addEventListener("change", (event) => {
      container.querySelector("#useCloudOcr").disabled = !event.target.checked;
    });
    container.querySelector("#useCloudOcr")?.addEventListener("click", () => processFile(pendingCloudFile, "cloud"));
    container.querySelector("#useLocalOcr")?.addEventListener("click", () => processFile(pendingCloudFile, "local-ocr"));
    container.querySelector("#cancelOcr")?.addEventListener("click", () => {
      pendingCloudFile = null;
      setStatus("Cloud OCR cancelled. You can paste the table manually.", "warn");
      renderPaste();
    });
    container.querySelector("#tiDetect")?.addEventListener("click", () => {
      rawText = container.querySelector("#tiText").value;
      if (!uploadedSource || !parsed.headers.length) parsed = parseTranscriptText(rawText);
      if (!parsed.headers.length) {
        setStatus("Paste a header row and at least one course.", "warn");
        return;
      }
      mapping = guessColumnMapping(parsed.headers);
      if (
        documentMode === "transcript"
        && mapping.includes("prerequisite")
        && !mapping.includes("credits")
        && parsed.rows.length >= 5
      ) {
        documentMode = "study-plan";
      }
      removedReviewIds.clear();
      review = applyMapping(parsed.rows, mapping, { documentMode });
      applyReviewConfidence();
      track("transcript_import_started", { source: sourceConfidence || "pasted" });
      track("transcript_review_started", { source: sourceConfidence || "pasted", rows: review.records.length });
      stage = 2;
      render();
    });
  }

  function knownGrades() {
    const scaleGrades = (GradingEngine.getActive()?.grades || []).map((grade) => normalizeGradeLabel(grade.label));
    const specialGrades = SPECIAL_STATUS_GRADES.map((grade) => normalizeGradeLabel(grade.label));
    return new Set([...scaleGrades, ...specialGrades]);
  }

  function duplicateFor(course) {
    return AcademicRecord.courses().some((existing) => AcademicRecord.courseKey(existing) === AcademicRecord.courseKey(course));
  }

  function rowIssue(course) {
    if (!course.include || course.importAction === "ignore") return "";
    if (!course.name && !course.code) return "Missing course";
    if (documentMode !== "study-plan" && (!Number.isFinite(Number(course.credits)) || Number(course.credits) < 0)) return "Credits required";
    if (course.status === "graded" && !knownGrades().has(normalizeGradeLabel(course.grade))) return "Unknown grade";
    if (duplicateFor(course) && !course.importAction) return "Choose duplicate action";
    if (Object.values(course.fieldConfidence || {}).some((value) => Number(value) < 50)) return "Low-confidence field";
    return "";
  }

  function unresolvedCount() {
    return review.records.filter((course) => rowIssue(course)).length;
  }

  function mappingIssueCount() {
    return mapping.filter((role, index) => {
      if (!role || confirmedMappingIndexes.has(index)) return false;
      const header = normalizedCell(parsed.headers[index]);
      return !(COLUMN_GUESSES[role] || []).some((guess) => header === normalizedCell(guess));
    }).length;
  }

  function issueSummary() {
    const duplicates = review.records.filter((course) => course.include && duplicateFor(course) && !course.importAction).length;
    const unknownGrades = review.records.filter((course) => course.include && course.status === "graded" && !knownGrades().has(normalizeGradeLabel(course.grade))).length;
    const rowProblems = review.records.filter((course) => {
      const issue = rowIssue(course);
      return issue && issue !== "Choose duplicate action" && issue !== "Unknown grade";
    }).length;
    const columns = mappingIssueCount();
    const lowConfidence = review.records.reduce((count, course) => count + Object.values(course.fieldConfidence || {}).filter((value) => Number(value) < 70).length, 0);
    return { duplicates, unknownGrades, rowProblems, columns, lowConfidence, total: duplicates + unknownGrades + rowProblems + columns + lowConfidence };
  }

  function semesterSummary(courses) {
    const scale = GradingEngine.getActive();
    const byGrade = new Map((scale?.grades || []).map((grade) => [normalizeGradeLabel(grade.label), Number(grade.points)]));
    let credits = 0;
    let qualityPoints = 0;
    courses.forEach((course) => {
      const courseCredits = Number(course.credits);
      const points = byGrade.get(normalizeGradeLabel(course.grade));
      if (!course.include || rowIssue(course) || !Number.isFinite(courseCredits) || !Number.isFinite(points)) return;
      credits += courseCredits;
      qualityPoints += courseCredits * points;
    });
    return {
      gpa: credits ? qualityPoints / credits : null,
      credits,
      courses: courses.length,
      issues: courses.filter((course) => rowIssue(course)).length,
    };
  }

  function missingCourseCreditsCount() {
    return review.records.filter((course) =>
      course.include
      && course.importAction !== "ignore"
      && (!Number.isFinite(Number(course.credits)) || Number(course.credits) <= 0)
    ).length;
  }

  function programCreditsRequired() {
    return documentMode === "study-plan" && missingCourseCreditsCount() > 0;
  }

  function validProgramCredits() {
    const value = Number(programCreditsDraft);
    return Number.isFinite(value) && value > 0 && value <= 1000;
  }

  function bulkValueControl(gradeOptions) {
    if (bulkField === "grade") {
      return `<select id="tiBulkValue" aria-label="Value to apply">
        <option value="">Choose grade</option>
        ${gradeOptions.map((grade) => `<option value="${esc(grade.label)}" ${normalizeGradeLabel(bulkValues.grade) === normalizeGradeLabel(grade.label) ? "selected" : ""}>${esc(grade.label)}</option>`).join("")}
        <option value="U" ${normalizeGradeLabel(bulkValues.grade) === "U" ? "selected" : ""}>U · Ungraded / currently registered</option>
      </select>`;
    }
    if (bulkField === "credits") {
      return `<input id="tiBulkValue" type="number" min="0.5" max="60" step="0.5" inputmode="decimal" value="${esc(bulkValues.credits)}" aria-label="Credit value to apply">`;
    }
    return `<input id="tiBulkValue" class="bidi-token" value="${esc(bulkValues.term)}" placeholder="e.g. Semester 1" aria-label="Semester value to apply">`;
  }

  function bulkFillPanel(gradeOptions) {
    const semesterNames = [...new Set(review.records.map((course) => course.term || "Semester 1"))];
    const scopedRecords = bulkScope === "problems"
      ? review.records.filter((course) => rowIssue(course))
      : bulkScope.startsWith("semester:")
        ? review.records.filter((course) => (course.term || "Semester 1") === bulkScope.slice(9))
        : review.records;
    const summary = bulkTargetSummary(scopedRecords, {
      field: bulkField,
      rawValue: bulkValues[bulkField],
      mode: bulkMode,
    });
    const buttonLabel = summary.valid && summary.targets
      ? `Apply to ${summary.targets} ${summary.targets === 1 ? "course" : "courses"}`
      : "Apply value";
    return `<section class="bulk-fill-panel" aria-labelledby="tiBulkTitle">
      <div class="bulk-fill-heading">
        <div>
          <strong id="tiBulkTitle">Apply one value to multiple courses</strong>
          <span>Fill missing cells by default. Course names and codes always stay row-specific.</span>
        </div>
        <div class="bulk-row-toggles" aria-label="Row selection">
          <button type="button" class="btn btn--text" id="tiIncludeAll">Include all</button>
          <button type="button" class="btn btn--text" id="tiExcludeAll">Exclude all</button>
        </div>
      </div>
      <div class="bulk-fill-controls">
        <label class="field"><span>FIELD</span>
          <select id="tiBulkField">
            <option value="credits" ${bulkField === "credits" ? "selected" : ""}>Credits</option>
            <option value="term" ${bulkField === "term" ? "selected" : ""}>Semester</option>
            <option value="grade" ${bulkField === "grade" ? "selected" : ""}>Grade</option>
          </select>
        </label>
        <label class="field"><span>VALUE</span>${bulkValueControl(gradeOptions)}</label>
        <label class="field"><span>APPLY TO</span>
          <select id="tiBulkMode">
            <option value="missing" ${bulkMode === "missing" ? "selected" : ""}>Empty cells only</option>
            <option value="all" ${bulkMode === "all" ? "selected" : ""}>All included courses</option>
          </select>
        </label>
        <label class="field"><span>SCOPE</span>
          <select id="tiBulkScope">
            <option value="all" ${bulkScope === "all" ? "selected" : ""}>All included courses</option>
            <option value="problems" ${bulkScope === "problems" ? "selected" : ""}>Courses needing review</option>
            ${semesterNames.map((semester) => `<option value="semester:${esc(semester)}" ${bulkScope === `semester:${semester}` ? "selected" : ""}>${esc(semester)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="btn btn--primary bulk-apply-button" id="tiApplyBulk" ${summary.valid && summary.targets ? "" : "disabled"}>${buttonLabel}</button>
      </div>
      <p class="bulk-fill-status" id="tiBulkStatus" aria-live="polite">${esc(bulkStatus || (summary.valid
        ? `${summary.targets} ${summary.targets === 1 ? "course matches" : "courses match"} this action.`
        : "Enter a valid value before applying."))}</p>
    </section>`;
  }

  function courseDrawer(course) {
    if (!course) return "";
    const issue = rowIssue(course);
    const duplicate = duplicateFor(course);
    return `<aside class="course-detail-drawer is-open" id="tiCourseDrawer" role="dialog" aria-modal="true" aria-labelledby="tiDrawerTitle" data-drawer-row="${esc(course.reviewId)}">
      <button class="course-drawer-backdrop" type="button" data-close-course-drawer aria-label="Close course details"></button>
      <section class="course-drawer-panel">
        <header><div><span>Course details</span><h3 id="tiDrawerTitle">${esc(course.code || course.name || "Detected course")}</h3></div><button type="button" data-close-course-drawer aria-label="Close">×</button></header>
        ${issue ? `<p class="result-note result-note--warn">${esc(issue)}</p>` : '<p class="result-note"><strong>Ready for import</strong></p>'}
        <div class="field-grid">
          <label class="field"><span>Include</span><input data-edit="include" type="checkbox" ${course.include ? "checked" : ""}></label>
          <label class="field"><span>Semester</span><input data-edit="term" value="${esc(course.term)}"></label>
          <label class="field"><span>Course code</span><input data-edit="code" value="${esc(course.code)}"></label>
          <label class="field field--wide"><span>Course name</span><input data-edit="name" value="${esc(course.name)}"></label>
          <label class="field"><span>Type</span><input data-edit="type" value="${esc(course.type)}"></label>
          <label class="field"><span>Prerequisite</span><input data-edit="prerequisite" value="${esc(course.prerequisite)}"></label>
          ${duplicate ? `<label class="field field--wide"><span>Duplicate action</span><select data-edit="importAction"><option value="">Choose action</option><option value="update" ${course.importAction === "update" ? "selected" : ""}>Update same attempt</option><option value="retake" ${course.importAction === "retake" ? "selected" : ""}>Add as retake</option><option value="ignore" ${course.importAction === "ignore" ? "selected" : ""}>Ignore row</option></select></label>` : ""}
        </div>
        <button type="button" class="btn btn--primary" data-close-course-drawer>Done</button>
      </section>
    </aside>`;
  }

  function reviewRow(course, gradeOptions) {
    const issue = rowIssue(course);
    return `<tr data-review-row="${esc(course.reviewId)}" class="${issue ? "has-error" : ""}">
      <td data-label="Use"><input type="checkbox" data-edit="include" ${course.include ? "checked" : ""} aria-label="Include row"></td>
      <td data-label="Course" class="review-course-cell" data-select-source="${esc(course.reviewId)}"><strong dir="auto">${esc(course.name || "Unnamed course")}</strong><small class="bidi-token">${esc(course.code || "No code")}</small>${confidenceChip(course.fieldConfidence?.name, "name")}</td>
      <td data-label="Credits"><input class="bidi-token" data-edit="credits" type="number" min="0" max="60" step="0.5" value="${course.credits ?? ""}" aria-invalid="${course.credits == null}">${confidenceChip(course.fieldConfidence?.credits, "credits")}</td>
      <td data-label="Grade"><select class="bidi-token" data-edit="grade"><option value="">—</option>${gradeOptions.map((grade) => `<option value="${esc(grade.label)}" ${normalizeGradeLabel(course.grade) === normalizeGradeLabel(grade.label) ? "selected" : ""}>${esc(grade.label)}</option>`).join("")}${SPECIAL_STATUS_GRADES.map((grade) => `<option value="${esc(grade.label)}" ${normalizeGradeLabel(course.grade) === normalizeGradeLabel(grade.label) ? "selected" : ""}>${esc(grade.label)} · ${esc(grade.hint)}</option>`).join("")}${course.grade && !knownGrades().has(normalizeGradeLabel(course.grade)) ? `<option value="${esc(course.grade)}" selected>${esc(course.grade)} · unknown</option>` : ""}</select>${confidenceChip(course.fieldConfidence?.grade, "grade")}</td>
      <td data-label="Status">${issue ? `<span class="record-badge record-badge--warn">${esc(issue)}</span>` : '<span class="record-badge record-badge--ok">Ready</span>'}</td>
      <td data-label="Details"><button type="button" class="btn btn--text course-details-button" data-open-course-details="${esc(course.reviewId)}">Details</button><button type="button" class="course-delete-button" data-remove-review="${esc(course.reviewId)}" aria-label="Delete ${esc(course.code || course.name)} from this import">Delete</button></td>
    </tr>`;
  }

  function semesterReviewGroups(gradeOptions) {
    const groups = new Map();
    review.records.forEach((course) => {
      const term = course.term || "Semester 1";
      if (!groups.has(term)) groups.set(term, []);
      groups.get(term).push(course);
    });
    return [...groups.entries()].map(([term, courses], semesterIndex) => {
      const filtered = reviewFilter === "problems" ? courses.filter((course) => rowIssue(course)) : courses;
      const summary = semesterSummary(courses);
      if (!filtered.length) return "";
      return `<details class="semester-review-card" ${summary.issues || semesterIndex === 0 ? "open" : ""}>
        <summary><div><strong dir="auto">${esc(term)}</strong><span>${summary.courses} courses · ${summary.credits} ready credits</span></div><div><span>GPA <b>${summary.gpa == null ? "—" : summary.gpa.toFixed(3)}</b></span><span class="${summary.issues ? "has-issues" : ""}">${summary.issues} issues</span></div></summary>
        <div class="record-table-wrap semester-table-wrap"><table class="intl-table record-table responsive-table table--wide transcript-review-table"><caption class="visually-hidden">Editable courses for ${esc(term)}</caption><thead><tr><th>Use</th><th>Course</th><th>Credits</th><th>Grade</th><th>Status</th><th>Details</th></tr></thead><tbody>${filtered.map((course) => reviewRow(course, gradeOptions)).join("")}</tbody></table></div>
      </details>`;
    }).join("");
  }

  function renderReview() {
    const gradeOptions = GradingEngine.getActive()?.grades || [];
    const unresolved = unresolvedCount();
    const missingCredits = missingCourseCreditsCount();
    const programCreditsMissing = programCreditsRequired() && (!validProgramCredits() || !programCreditsConfirmed);
    const issues = issueSummary();
    container.innerHTML = `
      <div class="record-page">
        <h2 data-stage-heading tabindex="-1">Review transcript</h2>
        <p class="tool-sub">Edit detected values, exclude unwanted rows, and resolve every warning before import.</p>
        ${stepper()}
        <section class="tool-card tool-card--wide">
          <h3>Detected columns</h3>
          <div class="planner-settings import-mode-settings">
            <label><span>File type</span><select id="tiDocumentMode">
              <option value="transcript" ${documentMode === "transcript" ? "selected" : ""}>Transcript with course grades</option>
              <option value="study-plan" ${documentMode === "study-plan" ? "selected" : ""}>Study plan / core & elective list</option>
            </select></label>
          </div>
          <div class="mapping-grid">
            ${parsed.headers.map((header, index) => `<label><span dir="auto">${esc(header)}</span><select data-map="${index}">
              <option value="">Ignore</option>
              ${Object.keys(COLUMN_GUESSES).map((role) => `<option value="${role}" ${mapping[index] === role ? "selected" : ""}>${role}</option>`).join("")}
            </select></label>`).join("")}
          </div>
        </section>
        <div class="transcript-split-view">
        ${sourcePreviewHtml()}
        <div class="transcript-review-pane">
        ${documentMode === "study-plan" && missingCredits ? `<section class="tool-card tool-card--wide program-credit-prompt">
          <h3>Total program credits required for graduation</h3>
          <p class="tool-sub">This file has no credit hours for each course. Enter the official total for the whole program so Degree Audit and Planning can show the requirement.</p>
          <label class="field" for="tiProgramCredits"><span>Total program credits</span>
            <input id="tiProgramCredits" type="number" min="1" max="1000" step="1" inputmode="numeric" value="${esc(programCreditsDraft)}" aria-required="true" aria-invalid="${programCreditsMissing}">
          </label>
          ${programCreditsDraft === "180" ? '<p class="result-note result-note--muted">Suggested for the matched Construction and Building Engineering plan: 180 credits. Confirm it against the official curriculum.</p>' : ""}
          <label class="consent-check"><input type="checkbox" id="tiProgramCreditsConfirm" ${programCreditsConfirmed ? "checked" : ""}> I confirm this is the official total credit requirement for my program.</label>
          <p class="result-note result-note--warn"><strong>This total is not divided between courses and is never used to calculate GPA.</strong> GPA remains unavailable for any course whose own credit hours are missing.</p>
        </section>` : ""}
        <section class="tool-card tool-card--wide">
          <div class="record-card-title"><strong>Review courses by semester</strong><span>${review.records.length} remaining · ${unresolved} need attention</span></div>
          <section class="transcript-issue-center" aria-labelledby="tiIssuesTitle">
            <div><span class="section-kicker">ISSUE CENTER</span><h3 id="tiIssuesTitle">${issues.total} items need review</h3><p>Correct problems without searching through every course.</p></div>
            <div class="issue-count-grid"><span><b>${issues.rowProblems}</b> course fields</span><span><b>${issues.duplicates}</b> duplicates</span><span><b>${issues.unknownGrades}</b> unknown grades</span><span><b>${issues.columns}</b> uncertain columns</span><span><b>${issues.lowConfidence}</b> low-confidence fields</span></div>
            <div class="row-actions"><button type="button" class="btn btn--primary" id="tiReviewProblems" ${issues.total ? "" : "disabled"}>Review problems</button><label class="review-filter"><span>Show</span><select id="tiReviewFilter"><option value="all" ${reviewFilter === "all" ? "selected" : ""}>All courses</option><option value="problems" ${reviewFilter === "problems" ? "selected" : ""}>Needs review only</option></select></label></div>
          </section>
          ${bulkFillPanel(gradeOptions)}
          <div class="semester-review-list">${semesterReviewGroups(gradeOptions)}</div>
          ${review.invalidRows.length ? `<p class="result-note result-note--warn">${review.invalidRows.length} empty rows were excluded.</p>` : ""}
          ${unresolved ? `<p class="result-note result-note--warn">${unresolved} included rows must be corrected before preview.</p>` : ""}
          ${programCreditsMissing ? '<p class="result-note result-note--warn">Enter and confirm the official total program credits before continuing.</p>' : ""}
          ${importError ? `<p class="result-note result-note--warn" role="alert">${esc(importError)}</p>` : ""}
          <div class="row-actions record-actions">
            <button class="btn btn--ghost" id="tiBack">Back</button>
            <button class="btn btn--primary" id="tiPreview" ${unresolved || programCreditsMissing ? "disabled" : ""}>Continue to preview</button>
          </div>
        </section>
        </div>
        </div>
      </div>`;
    container.insertAdjacentHTML("beforeend", courseDrawer(review.records.find((course) => course.reviewId === openCourseId)));
    wireReview();
  }

  function wireReview() {
    container.querySelector("#tiDocumentMode")?.addEventListener("change", (event) => {
      documentMode = event.target.value;
      review.records.forEach((course) => {
        course.status = studyPlanStatus(course.grade, documentMode);
      });
      applyReviewConfidence();
      renderReview();
    });
    container.querySelector("#tiProgramCredits")?.addEventListener("change", (event) => {
      programCreditsDraft = event.target.value;
      programCreditsConfirmed = false;
      renderReview();
    });
    container.querySelector("#tiProgramCreditsConfirm")?.addEventListener("change", (event) => {
      programCreditsConfirmed = event.target.checked;
      renderReview();
    });
    container.querySelectorAll("[data-map]").forEach((select) => select.addEventListener("change", (event) => {
      const mappingIndex = Number(event.target.dataset.map);
      mapping[mappingIndex] = event.target.value || null;
      confirmedMappingIndexes.add(mappingIndex);
      review = applyMapping(parsed.rows, mapping, { documentMode });
      applyReviewConfidence();
      review.records = review.records.filter((course) => !removedReviewIds.has(course.reviewId));
      bulkStatus = "";
      renderReview();
    }));
    container.querySelector("#tiBulkField")?.addEventListener("change", (event) => {
      bulkField = event.target.value;
      bulkStatus = "";
      renderReview();
    });
    container.querySelector("#tiBulkValue")?.addEventListener("change", (event) => {
      bulkValues[bulkField] = event.target.value;
      bulkStatus = "";
      renderReview();
    });
    container.querySelector("#tiBulkMode")?.addEventListener("change", (event) => {
      bulkMode = event.target.value;
      bulkStatus = "";
      renderReview();
    });
    container.querySelector("#tiBulkScope")?.addEventListener("change", (event) => {
      bulkScope = event.target.value;
      bulkStatus = "";
      renderReview();
    });
    container.querySelector("#tiApplyBulk")?.addEventListener("click", () => {
      const scopedRecords = bulkScope === "problems"
        ? review.records.filter((course) => rowIssue(course))
        : bulkScope.startsWith("semester:")
          ? review.records.filter((course) => (course.term || "Semester 1") === bulkScope.slice(9))
          : review.records;
      const summary = bulkTargetSummary(scopedRecords, {
        field: bulkField,
        rawValue: bulkValues[bulkField],
        mode: bulkMode,
      });
      if (!summary.valid || !summary.targets) return;
      if (
        bulkMode === "all"
        && summary.replacements
        && !window.confirm(`Replace ${summary.replacements} existing ${bulkField} ${summary.replacements === 1 ? "value" : "values"}?`)
      ) return;
      const result = applyBulkValue(scopedRecords, {
        field: bulkField,
        rawValue: bulkValues[bulkField],
        mode: bulkMode,
      });
      review.records.forEach((course) => {
        course.status = studyPlanStatus(course.grade, documentMode);
      });
      bulkStatus = `${result.changed} ${result.changed === 1 ? "course was" : "courses were"} updated.`;
      renderReview();
    });
    container.querySelector("#tiReviewFilter")?.addEventListener("change", (event) => {
      reviewFilter = event.target.value;
      renderReview();
    });
    container.querySelector("#tiReviewProblems")?.addEventListener("click", () => {
      reviewFilter = "problems";
      renderReview();
      requestAnimationFrame(() => {
        const firstIssue = container.querySelector(".has-error [data-edit], .mapping-grid select");
        firstIssue?.focus({ preventScroll: false });
        firstIssue?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    container.querySelector("#tiIncludeAll")?.addEventListener("click", () => {
      review.records.forEach((course) => { course.include = true; });
      bulkStatus = "All detected courses are included.";
      renderReview();
    });
    container.querySelector("#tiExcludeAll")?.addEventListener("click", () => {
      review.records.forEach((course) => { course.include = false; });
      bulkStatus = "All detected courses are excluded. Include the rows you want to import.";
      renderReview();
    });
    container.querySelectorAll("[data-review-row], [data-drawer-row]").forEach((row) => {
      const reviewId = row.dataset.reviewRow || row.dataset.drawerRow;
      const course = review.records.find((record) => record.reviewId === reviewId);
      row.querySelectorAll("[data-edit]").forEach((control) => control.addEventListener("change", (event) => {
        const key = event.target.dataset.edit;
        if (key === "include") course.include = event.target.checked;
        else if (key === "credits") course.credits = parseNumeric(event.target.value);
        else course[key] = event.target.value;
        if (key !== "include" && key !== "importAction") {
          if (!correctionTracked) {
            correctionTracked = true;
            track("transcript_field_corrected", { stage: "review" });
          }
          if (!course.fieldConfidence) course.fieldConfidence = {};
          const confidenceKey = ["code", "name"].includes(key) ? "name" : key;
          course.fieldConfidence[confidenceKey] = 100;
        }
        course.status = studyPlanStatus(course.grade, documentMode);
        renderReview();
      }));
    });
    container.querySelectorAll("[data-select-source]").forEach((cell) => cell.addEventListener("click", (event) => {
      if (event.target.closest("input,select,button,a")) return;
      selectedSourceReviewId = cell.dataset.selectSource;
      renderReview();
    }));
    container.querySelector("#sourceRotate")?.addEventListener("click", () => { previewRotation = (previewRotation + 90) % 360; renderReview(); });
    container.querySelector("#sourceZoomOut")?.addEventListener("click", () => { previewZoom = Math.max(.6, previewZoom - .15); renderReview(); });
    container.querySelector("#sourceZoomIn")?.addEventListener("click", () => { previewZoom = Math.min(2.5, previewZoom + .15); renderReview(); });
    container.querySelectorAll("[data-open-course-details]").forEach((button) => button.addEventListener("click", () => {
      openCourseId = button.dataset.openCourseDetails;
      renderReview();
      requestAnimationFrame(() => container.querySelector("#tiCourseDrawer [data-close-course-drawer]")?.focus());
    }));
    container.querySelectorAll("[data-close-course-drawer]").forEach((button) => button.addEventListener("click", () => {
      const returnId = openCourseId;
      openCourseId = "";
      renderReview();
      requestAnimationFrame(() => container.querySelector(`[data-open-course-details="${returnId}"]`)?.focus());
    }));
    container.querySelectorAll("[data-remove-review]").forEach((button) => button.addEventListener("click", () => {
      const course = review.records.find((record) => record.reviewId === button.dataset.removeReview);
      if (!course) return;
      const label = course.code || course.name || "this course";
      if (!window.confirm(`Delete ${label} from this import?`)) return;
      removedReviewIds.add(course.reviewId);
      review.records = review.records.filter((record) => record.reviewId !== course.reviewId);
      bulkStatus = `${label} was deleted from this import.`;
      renderReview();
    }));
    container.querySelector("#tiBack")?.addEventListener("click", () => {
      stage = 1;
      render();
    });
    container.querySelector("#tiPreview")?.addEventListener("click", () => {
      if (unresolvedCount() || (programCreditsRequired() && (!validProgramCredits() || !programCreditsConfirmed))) return;
      stage = 3;
      render();
    });
  }

  function recordsToImport() {
    return review.records
      .filter((course) => course.include && course.importAction !== "ignore")
      .map((course) => ({
        ...course,
        isRetake: course.importAction === "retake",
      }));
  }

  function importChangeSummary(ready) {
    const existing = AcademicRecord.courses();
    const existingByKey = new Map(existing.map((course) => [AcademicRecord.courseKey(course), course]));
    const incomingKeys = new Set(ready.map((course) => AcademicRecord.courseKey(course)));
    const incomingByIdentity = new Map(ready.map((course) => [AcademicRecord.courseIdentityKey(course), course]));
    const added = ready.filter((course) => !existingByKey.has(AcademicRecord.courseKey(course))).length;
    const duplicates = ready.filter((course) => existingByKey.has(AcademicRecord.courseKey(course))).length;
    const gradeChanges = ready.filter((course) => {
      const previous = existingByKey.get(AcademicRecord.courseKey(course));
      return previous && normalizeGradeLabel(previous.grade) !== normalizeGradeLabel(course.grade);
    }).length;
    const renamedTerms = existing.filter((course) => {
      const incoming = incomingByIdentity.get(AcademicRecord.courseIdentityKey(course));
      return incoming && incoming.term !== course.term;
    }).length;
    const missingFromFile = existing.filter((course) => !incomingKeys.has(AcademicRecord.courseKey(course))).length;
    return { added, duplicates, gradeChanges, renamedTerms, missingFromFile };
  }

  function renderPreview() {
    const ready = recordsToImport();
    const changes = importChangeSummary(ready);
    const inProgress = ready.filter((course) => course.status === "in_progress").length;
    const missingCredits = ready.filter((course) => course.credits == null).length;
    container.innerHTML = `
      <div class="record-page">
        <h2 data-stage-heading tabindex="-1">Import Preview</h2>
        <p class="tool-sub">Confirm once to update every connected academic tool.</p>
        ${stepper()}
        <section class="tool-card tool-card--wide">
          <div class="preview-metrics">
            <div><span>New courses</span><strong class="good">${changes.added}</strong></div>
            <div><span>Grades changed</span><strong>${changes.gradeChanges}</strong></div>
            <div><span>Possible duplicates</span><strong>${changes.duplicates}</strong></div>
            <div><span>Semester names changed</span><strong>${changes.renamedTerms}</strong></div>
            <div><span>Existing courses absent from this file</span><strong>${changes.missingFromFile}</strong></div>
            <div><span>Ready to merge</span><strong class="good">${ready.length}</strong></div>
            ${documentMode === "study-plan" ? `<div><span>Currently registered (U)</span><strong>${inProgress}</strong></div>
            <div><span>Program credits required</span><strong>${esc(programCreditsDraft)}</strong></div>
            <div><span>Courses missing own credits</span><strong>${missingCredits}</strong></div>` : ""}
          </div>
          <p class="result-note"><span>Source confidence:</span> <strong>${esc(sourceConfidence || "manual review")}</strong>. Review every changed or uncertain row before merging.</p>
          ${documentMode === "study-plan" && missingCredits ? '<p class="result-note result-note--warn">This study plan will support course tracking and prerequisites. Missing per-course credits will not be guessed, so GPA and completed-credit totals stay unavailable until those credits are added.</p>' : ""}
        </section>
        <div class="row-actions record-actions">
          <button class="btn btn--ghost" id="tiBackReview">Back to review</button>
          <button class="btn btn--ghost" id="tiIgnoreDuplicates" ${changes.duplicates ? "" : "disabled"}>Ignore duplicates</button>
          <button class="btn btn--text" id="tiReviewChanges">Review changes</button>
          <button class="btn btn--primary" id="tiConfirm" ${ready.length ? "" : "disabled"}>Accept all and merge →</button>
        </div>
      </div>`;
    container.querySelector("#tiBackReview")?.addEventListener("click", () => {
      stage = 2;
      render();
    });
    container.querySelector("#tiReviewChanges")?.addEventListener("click", () => {
      reviewFilter = "all";
      stage = 2;
      render();
    });
    container.querySelector("#tiIgnoreDuplicates")?.addEventListener("click", () => {
      review.records.forEach((course) => {
        if (duplicateFor(course)) course.importAction = "ignore";
      });
      renderPreview();
    });
    container.querySelector("#tiConfirm")?.addEventListener("click", () => {
      const saved = AcademicRecord.import(ready, {
        mode: "merge",
        source: documentMode,
        programCreditsRequired: documentMode === "study-plan" && validProgramCredits() && programCreditsConfirmed ? Number(programCreditsDraft) : null,
      });
      if (!saved) {
        importError = "Nothing was saved. Browser storage may be blocked or full. Free space or allow local storage, then try Confirm again.";
        stage = 2;
        renderReview();
        return;
      }
      if (sourceFingerprint) Storage.set("transcriptFingerprint:v1", { ...sourceFingerprint, recordedAt: new Date().toISOString() });
      rawText = "";
      replaceSourcePreview(null);
      parsed = { headers: [], rows: [] };
      track("transcript_import_completed", { rows: ready.length, source: documentMode });
      FreeWorkflow.markTranscriptReviewed();
      successRedirectCancelled = false;
      renderSuccess();
    });
  }

  function renderSuccess() {
    clearSuccessCountdown();
    const totalCourses = AcademicRecord.courses().length;
    container.innerHTML = `
      <div class="tool-card tool-card--wide import-success">
        <span class="success-mark">✓</span>
        <h2 data-stage-heading tabindex="-1">Your transcript is approved and ready</h2>
        <p>${totalCourses} reviewed courses are ready. GPA and CGPA will reuse them automatically, so you will not enter them again.</p>
        <p class="import-countdown" id="tiAutoRedirect" aria-live="polite">${successRedirectCancelled
          ? "Automatic navigation paused. You can continue when you are ready."
          : `Everything is ready. We’ll take you to GPA in <strong id="tiCountdown">${AUTO_REDIRECT_SECONDS}</strong> seconds.`}</p>
        <div class="row-actions">
          <a class="btn btn--primary" href="${routeHref("gpa-calculator")}">Continue to GPA</a>
          <button class="btn btn--ghost" id="tiAgain">Import another transcript</button>
        </div>
        <aside class="post-value-actions"><div><strong>Your academic record is connected.</strong><p>Advanced analysis can compare targets, retakes, timing, and risk using this reviewed record.</p></div><a class="btn btn--text" href="${routeHref("instantgpa-pro")}">Explore advanced analysis</a></aside>
      </div>
      ${savedTranscriptHtml(AcademicRecord.semesters())}
      ${historyHtml()}`;
    container.querySelector("#tiAgain")?.addEventListener("click", () => {
      stage = 1;
      uploadedSource = "";
      sourceConfidence = "";
      documentMode = "transcript";
      programCreditsDraft = "";
      programCreditsConfirmed = false;
      review = { records: [], invalidRows: [] };
      removedReviewIds.clear();
      importError = "";
      render();
    });
    wireSavedTranscript(() => {
      pauseSuccessRedirect();
      renderSuccess();
    });
    wireHistory(() => {
      pauseSuccessRedirect();
      renderSuccess();
    });
    startSuccessCountdown();
  }

  function startSuccessCountdown() {
    if (successRedirectCancelled) return;
    let remaining = AUTO_REDIRECT_SECONDS;
    container.querySelectorAll("a, button").forEach((control) => {
      control.addEventListener("click", pauseSuccessRedirect, { once: true, capture: true });
    });
    successCountdownTimer = window.setInterval(() => {
      if (!container.isConnected || !container.querySelector(".import-success")) {
        clearSuccessCountdown();
        return;
      }
      remaining -= 1;
      const countdown = container.querySelector("#tiCountdown");
      if (countdown) countdown.textContent = String(Math.max(remaining, 0));
      if (remaining <= 0) {
        clearSuccessCountdown();
        navigateTo("gpa-calculator");
      }
    }, 1000);
  }

  function savedTranscriptHtml(semesters) {
    if (!semesters.length) return "";
    return `<section class="tool-card tool-card--wide saved-transcript">
      <h3>▤ Saved Transcript <small>(${semesters.length} semesters)</small></h3>
      ${semesters.map((semester) => `<details>
        <summary><strong dir="auto">${esc(semester.name)}</strong><span>${semester.courses.length} courses <b>${semester.courses.some((course) => course.status === "in_progress") ? "in progress" : semester.courses.some((course) => course.grade && course.grade !== "--") ? "graded" : "planned"}</b></span></summary>
        <div class="saved-course-list">${semester.courses.map((course) => `<p>
          <span dir="auto">${esc(course.code || course.name)}</span>
          <span class="saved-course-meta bidi-token">${course.status === "in_progress" ? "U · currently registered" : esc(course.grade || "--")} · ${course.credits ?? "course credits needed"}${course.credits == null ? "" : " credits"}</span>
          <button type="button" class="course-delete-button" data-delete-course="${esc(course.attemptId || course.id)}" aria-label="Delete ${esc(course.code || course.name)}">Delete</button>
        </p>`).join("")}</div>
      </details>`).join("")}
    </section>`;
  }

  function wireSavedTranscript(onDeleted = () => render()) {
    container.querySelectorAll("[data-delete-course]").forEach((button) => button.addEventListener("click", () => {
      const course = AcademicRecord.courses().find((record) => (record.attemptId || record.id) === button.dataset.deleteCourse);
      if (!course) return;
      const label = course.code || course.name || "this course";
      if (!window.confirm(`Delete ${label} from your saved transcript? This updates every connected calculator and planning tool.`)) return;
      if (AcademicRecord.removeCourse(course.attemptId || course.id)) onDeleted();
    }));
  }

  function historyHtml() {
    const history = AcademicRecord.history();
    if (!history.length) return "";
    const formatter = new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "medium", timeStyle: "short" });
    return `<section class="tool-card tool-card--wide import-history">
      <h3>◴ Transcript Version History</h3>
      <p class="tool-sub">Every approved merge keeps a reversible snapshot. Original files and raw OCR text are not stored.</p>
      ${history.map((item) => `<div class="history-row">
        <div><strong>${formatter.format(new Date(item.importedAt))}</strong><small>${item.count} courses · ${item.semesters} semesters</small></div>
        <div><button class="btn btn--text" data-undo="${esc(item.id)}">↶ Restore previous version</button><button class="btn btn--text danger-text" data-delete-history="${esc(item.id)}">Delete history entry</button></div>
      </div>`).join("")}
    </section>`;
  }

  function wireHistory(onChanged = () => render()) {
    container.querySelectorAll("[data-undo]").forEach((button) => button.addEventListener("click", () => {
      AcademicRecord.undoImport(button.dataset.undo);
      onChanged();
    }));
    container.querySelectorAll("[data-delete-history]").forEach((button) => button.addEventListener("click", () => {
      AcademicRecord.deleteHistory(button.dataset.deleteHistory);
      onChanged();
    }));
  }

  render();
  refreshPageAllowance({ rerender: true });
}
