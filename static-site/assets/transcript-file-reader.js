import { parseAcademicPlanLayout } from "./academic-plan-parser.js";
import { CloudSync } from "./cloud-sync.js";
import {
  headerScore,
  matrixToParsed,
  parseTranscriptText,
} from "./transcript-parser-core.js";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const FREE_MAX_PDF_PAGES = 3;
export const PREMIUM_MAX_PDF_PAGES = 30;
const MAX_PDF_TEXT_ITEMS = 120_000;
const LOCAL_OCR_LANGUAGES = ["eng", "ara"];
const LOCAL_OCR_OPTIONS = Object.freeze({
  workerPath: "/vendor/tesseract-worker.min.js",
  langPath: "/vendor/tesseract-lang",
  corePath: "/vendor/tesseract-core",
});

function errorWithCode(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-instantgpa-src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window[globalName]), { once: true });
      existing.addEventListener("error", () => reject(errorWithCode("READER_LOAD_FAILED", "The local reader could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.dataset.instantgpaSrc = src;
    script.onload = () => resolve(window[globalName]);
    script.onerror = () => reject(errorWithCode("READER_LOAD_FAILED", "The local reader could not be loaded."));
    document.head.appendChild(script);
  });
}

function createLocalOcrWorker(Tesseract) {
  return Tesseract.createWorker(LOCAL_OCR_LANGUAGES, 1, LOCAL_OCR_OPTIONS);
}

export async function sha256File(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function parseExcelFile(file, onProgress) {
  onProgress?.("Loading the private Excel reader…");
  const readXlsxFile = await loadScript("/vendor/read-excel-file.min.js", "readXlsxFile");
  const sheets = await readXlsxFile(file);
  let best = { headers: [], rows: [] };
  let bestSheet = "";
  sheets.forEach(({ sheet, data }) => {
    const candidate = matrixToParsed(data);
    if (candidate.rows.length > best.rows.length) {
      best = candidate;
      bestSheet = sheet;
    }
  });
  if (!best.headers.length) throw errorWithCode("NO_TABLE", "No course table was found in this workbook.");
  return {
    parsed: best,
    sourceLabel: `Excel · ${bestSheet}`,
    rawText: [best.headers, ...best.rows].map((row) => row.join("\t")).join("\n"),
    confidence: "local-structured",
  };
}

async function loadPdf(file, onProgress) {
  onProgress?.("Reading the PDF locally…");
  const pdfjs = await import("/vendor/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";
  return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
}

async function extractPdfText(pdf, onProgress) {
  const lines = [];
  const pages = [];
  let totalTextItems = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.(`Reading page ${pageNumber} of ${pdf.numPages} locally…`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    totalTextItems += content.items.length;
    if (totalTextItems > MAX_PDF_TEXT_ITEMS) {
      throw errorWithCode("PDF_TOO_COMPLEX", "This PDF contains too many text elements to process safely. Upload a smaller transcript or split it into parts.");
    }
    const viewport = page.getViewport({ scale: 1 });
    const groups = [];
    content.items.forEach((item) => {
      const x = item.transform?.[4] ?? 0;
      const y = item.transform?.[5] ?? 0;
      let group = groups.find((entry) => Math.abs(entry.y - y) < 3);
      if (!group) {
        group = { y, cells: [] };
        groups.push(group);
      }
      group.cells.push({ x, value: String(item.str || "").trim() });
    });
    groups.sort((a, b) => b.y - a.y).forEach((group) => {
      const values = group.cells.sort((a, b) => a.x - b.x).map((cell) => cell.value).filter(Boolean);
      if (values.length) lines.push(values.join("\t"));
    });
    pages.push({ width: viewport.width, groups });
  }
  return { rawText: lines.join("\n"), pages };
}

async function localOcrPdf(pdf, onProgress) {
  const Tesseract = await loadScript("/vendor/tesseract.min.js", "Tesseract");
  const worker = await createLocalOcrWorker(Tesseract);
  const pageTexts = [];
  const pageConfidences = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress?.(`Running local OCR on page ${pageNumber} of ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const result = await worker.recognize(canvas);
      pageTexts.push(String(result.data.text || "").split("\n").map((line) => line.trim().replace(/\s{2,}/g, "\t")).filter(Boolean).join("\n"));
      if (Number.isFinite(result.data.confidence)) pageConfidences.push(result.data.confidence);
    }
  } finally {
    await worker.terminate();
  }
  return {
    text: pageTexts.join("\n"),
    confidence: pageConfidences.length ? pageConfidences.reduce((sum, value) => sum + value, 0) / pageConfidences.length : null,
  };
}

async function localOcrImage(file, onProgress) {
  const Tesseract = await loadScript("/vendor/tesseract.min.js", "Tesseract");
  onProgress?.("Running local OCR on the image…");
  const worker = await createLocalOcrWorker(Tesseract);
  try {
    const result = await worker.recognize(file);
    return {
      text: String(result.data.text || "").split("\n").map((line) => line.trim().replace(/\s{2,}/g, "\t")).filter(Boolean).join("\n"),
      confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : null,
    };
  } finally {
    await worker.terminate();
  }
}

async function parseCloudTranscript(file, signal, onProgress) {
  const credentials = await CloudSync.getRequestCredentials();
  if (!credentials.ok) throw errorWithCode("SIGN_IN_REQUIRED", "Sign in from the Account page before using paid secure OCR.");
  onProgress?.("Uploading to secure Google Document AI processing in the EU…");
  const form = new FormData();
  form.set("file", file, file.name);
  const headers = { "x-instantgpa-request": "transcript-import", authorization: `Bearer ${credentials.idToken}` };
  if (credentials.appCheckToken) headers["x-firebase-appcheck"] = credentials.appCheckToken;
  const response = await fetch("/api/transcript/parse", { method: "POST", body: form, headers, signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw errorWithCode(data.code || "SCANNER_FAILED", data.error || "The secure scanned-document reader is unavailable.");
  if (!data.parsed?.headers?.length) throw errorWithCode("NO_TABLE", "The scan completed, but no transcript table was detected.");
  return {
    parsed: data.parsed,
    rawText: [data.parsed.headers, ...data.parsed.rows].map((row) => row.join("\t")).join("\n"),
    sourceLabel: `Secure OCR · ${data.processor === "enterprise-ocr" ? "Document OCR" : "Form Parser"} · ${data.file?.pages || 1} page(s)`,
    warning: Array.isArray(data.warnings) ? data.warnings.join(" ") : "",
    confidence: "cloud-reviewed",
    measuredConfidence: Number.isFinite(data.confidence) ? data.confidence : null,
    documentMode: data.documentMode || "transcript",
    suggestedProgramCredits: data.suggestedProgramCredits ?? null,
  };
}

async function parsePdfFile(file, {
  cloud = false,
  localOcr = false,
  signal,
  onProgress,
  maxPages = FREE_MAX_PDF_PAGES,
  planLabel = "Free",
} = {}) {
  const pdf = await loadPdf(file, onProgress);
  if (pdf.numPages > maxPages) {
    throw errorWithCode("PDF_PAGE_LIMIT", `This PDF has ${pdf.numPages} pages. ${planLabel} transcript review accepts a maximum of ${maxPages} pages. Please upload ${maxPages} pages or fewer.`);
  }
  const extracted = await extractPdfText(pdf, onProgress);
  let rawText = extracted.rawText;
  const academicPlan = parseAcademicPlanLayout(extracted.pages, rawText);
  if (academicPlan) {
    return {
      parsed: { headers: academicPlan.headers, rows: academicPlan.rows }, rawText,
      sourceLabel: `PDF · academic plan · local · ${pdf.numPages} page(s)`, confidence: "local-structured-review",
      documentMode: academicPlan.documentMode, suggestedProgramCredits: academicPlan.suggestedProgramCredits,
    };
  }
  let parsed = parseTranscriptText(rawText);
  if (parsed.headers.length && headerScore(parsed.headers) >= 2) {
    return { parsed, rawText, sourceLabel: `PDF · local · ${pdf.numPages} page(s)`, confidence: "local-structured" };
  }
  if (cloud) return parseCloudTranscript(file, signal, onProgress);
  if (!localOcr) throw errorWithCode("CLOUD_OCR_CONSENT_REQUIRED", "Reliable local table detection was not possible.");
  const ocrResult = await localOcrPdf(pdf, onProgress);
  rawText = ocrResult.text;
  parsed = parseTranscriptText(rawText);
  if (!parsed.headers.length || headerScore(parsed.headers) < 2) throw errorWithCode("NO_TABLE", "Local OCR did not find a reliable course table. Paste the table manually or use secure OCR.");
  return { parsed, rawText, sourceLabel: `PDF · local OCR · ${pdf.numPages} page(s)`, warning: "Local OCR may be less accurate. Review every field.", confidence: "local-ocr-review", measuredConfidence: ocrResult.confidence };
}

export async function parseUploadedFile(file, options = {}) {
  if (!file) throw errorWithCode("FILE_REQUIRED", "Choose one transcript file.");
  if (file.size > MAX_FILE_BYTES) throw errorWithCode("FILE_TOO_LARGE", "The maximum file size is 20 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["xlsx", "xlsm"].includes(extension)) return parseExcelFile(file, options.onProgress);
  if (["xls", "xlsb"].includes(extension)) throw errorWithCode("LEGACY_EXCEL", "Save this legacy workbook as .xlsx, then upload it again.");
  if (extension === "pdf" || file.type === "application/pdf") return parsePdfFile(file, options);
  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "tif", "tiff", "bmp", "webp"].includes(extension)) {
    if (options.cloud) return parseCloudTranscript(file, options.signal, options.onProgress);
    if (!options.localOcr) throw errorWithCode("CLOUD_OCR_CONSENT_REQUIRED", "This image needs OCR.");
    const ocrResult = await localOcrImage(file, options.onProgress);
    const rawText = ocrResult.text;
    const parsed = parseTranscriptText(rawText);
    if (!parsed.headers.length) throw errorWithCode("NO_TABLE", "Local OCR did not find a reliable course table.");
    return { parsed, rawText, sourceLabel: "Image · local OCR", warning: "Review every field.", confidence: "local-ocr-review", measuredConfidence: ocrResult.confidence };
  }
  const rawText = await file.text();
  return { parsed: parseTranscriptText(rawText), sourceLabel: extension?.toUpperCase() || "Text", rawText, confidence: "local-structured" };
}
