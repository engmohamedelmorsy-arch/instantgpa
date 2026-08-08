import { currentLanguage } from "./localization.js";

const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
const MAX_LOCAL_OCR_PAGES = 30;
const OCR_OPTIONS = Object.freeze({ workerPath: "/vendor/tesseract-worker.min.js", langPath: "/vendor/tesseract-lang", corePath: "/vendor/tesseract-core" });
const L = (english, arabic) => currentLanguage() === "ar" ? arabic : english;

const boundedConfidence = (value) => Math.max(0, Math.min(1, Number(value) / 100 || 0));

function loadScript(src, globalName) {
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    const script = existing || document.createElement("script");
    const done = () => globalThis[globalName] ? resolve(globalThis[globalName]) : reject(new Error(`${globalName} did not load.`));
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error(`${globalName} could not load.`)), { once: true });
    if (!existing) { script.src = src; script.defer = true; document.head.appendChild(script); }
  });
}

function pdfPageLines(items) {
  const groups = [];
  items.forEach((item) => {
    const value = String(item.str || "").trim(); if (!value) return;
    const x = Number(item.transform?.[4]) || 0; const y = Number(item.transform?.[5]) || 0;
    let group = groups.find((entry) => Math.abs(entry.y - y) < 3);
    if (!group) { group = { y, cells: [] }; groups.push(group); }
    group.cells.push({ x, value });
  });
  return groups.sort((a, b) => b.y - a.y).map((group) => group.cells.sort((a, b) => a.x - b.x).map((cell) => cell.value).join(" "));
}

async function worker() {
  const Tesseract = await loadScript("/vendor/tesseract.min.js", "Tesseract");
  return Tesseract.createWorker(["eng", "ara"], 1, OCR_OPTIONS);
}

async function ocrImage(source, onProgress) {
  onProgress(L("Reading the image locally with OCR…", "جارٍ قراءة الصورة محليًا باستخدام OCR…"));
  const reader = await worker();
  try {
    const result = await reader.recognize(source);
    return { text: `[[PAGE 1]]\n${String(result.data.text || "").trim()}`, evidence: { method: "local_ocr", confidence: boundedConfidence(result.data.confidence), pageCount: 1 } };
  } finally { await reader.terminate(); }
}

async function ocrPdf(pdf, onProgress) {
  if (pdf.numPages > MAX_LOCAL_OCR_PAGES) throw new Error(L(`Scanned PDFs are limited to ${MAX_LOCAL_OCR_PAGES} pages.`, `الحد الأقصى لملفات PDF المصورة هو ${MAX_LOCAL_OCR_PAGES} صفحة.`));
  const reader = await worker(); const pages = []; const confidence = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(L(`Running private OCR on page ${pageNumber} of ${pdf.numPages}…`, `جارٍ تشغيل OCR المحلي للصفحة ${pageNumber} من ${pdf.numPages}…`));
      const page = await pdf.getPage(pageNumber); const viewport = page.getViewport({ scale: 1.7 });
      const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const result = await reader.recognize(canvas); pages.push(`[[PAGE ${pageNumber}]]\n${String(result.data.text || "").trim()}`); confidence.push(boundedConfidence(result.data.confidence));
    }
  } finally { await reader.terminate(); }
  return { text: pages.join("\n"), evidence: { method: "local_ocr", confidence: confidence.reduce((sum, value) => sum + value, 0) / Math.max(1, confidence.length), pageCount: pdf.numPages } };
}

export async function extractAcademicDocument(file, onProgress = () => {}) {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error(L("The maximum document size is 12 MB.", "الحد الأقصى لحجم المستند هو 12 ميجابايت."));
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "application/pdf" || extension === "pdf") {
    onProgress(L("Reading document pages locally on this device…", "جارٍ قراءة صفحات المستند محليًا على هذا الجهاز…"));
    const pdfjs = await import("/vendor/pdf.mjs"); pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    if (pdf.numPages > 80) throw new Error(L("Split documents longer than 80 pages.", "قسّم المستندات التي تزيد على 80 صفحة."));
    const lines = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(L(`Reading document page ${pageNumber} of ${pdf.numPages}…`, `جارٍ قراءة صفحة المستند ${pageNumber} من ${pdf.numPages}…`));
      const page = await pdf.getPage(pageNumber); const content = await page.getTextContent();
      lines.push(`[[PAGE ${pageNumber}]]`, ...pdfPageLines(content.items));
    }
    const text = lines.join("\n").trim();
    return text.length >= Math.max(40, pdf.numPages * 20)
      ? { text, evidence: { method: "pdf_text_layer", confidence: 0.98, pageCount: pdf.numPages } }
      : ocrPdf(pdf, onProgress);
  }
  if (file.type.startsWith("text/") || ["txt", "csv", "md"].includes(extension)) return { text: await file.text(), evidence: { method: "structured_text", confidence: 1, pageCount: 1 } };
  if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"].includes(extension)) return ocrImage(file, onProgress);
  throw new Error(L("Use a PDF, image, or text document.", "استخدم ملف PDF أو صورة أو مستندًا نصيًا."));
}
