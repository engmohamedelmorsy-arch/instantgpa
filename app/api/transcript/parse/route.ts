import {
  assertSameOrigin,
  errorResponse,
  requireActiveSubscriber,
} from "../../_shared/admin-data";
import { PDFDocument, ParseSpeeds } from "pdf-lib";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const PREMIUM_MAX_PAGES = 30;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/bmp",
  "image/webp",
]);

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function hasExpectedFileSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const startsWith = (...signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);

  switch (file.type) {
    case "application/pdf":
      return startsWith(0x25, 0x50, 0x44, 0x46, 0x2d);
    case "image/jpeg":
      return startsWith(0xff, 0xd8, 0xff);
    case "image/png":
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/tiff":
      return startsWith(0x49, 0x49, 0x2a, 0x00)
        || startsWith(0x4d, 0x4d, 0x00, 0x2a);
    case "image/bmp":
      return startsWith(0x42, 0x4d);
    case "image/webp":
      return startsWith(0x52, 0x49, 0x46, 0x46)
        && bytes[8] === 0x57
        && bytes[9] === 0x45
        && bytes[10] === 0x42
        && bytes[11] === 0x50;
    default:
      return false;
  }
}

async function pdfPageCount(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (
    bytes.length < 5
    || bytes[0] !== 0x25
    || bytes[1] !== 0x50
    || bytes[2] !== 0x44
    || bytes[3] !== 0x46
    || bytes[4] !== 0x2d
  ) {
    throw new Error("INVALID_PDF");
  }
  const pdf = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    parseSpeed: ParseSpeeds.Fast,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  return pdf.getPageCount();
}

export async function POST(request: Request) {
  const serviceUrl = process.env.TRANSCRIPT_SERVICE_URL?.replace(/\/+$/, "");
  const backendKey = process.env.INSTANTGPA_BACKEND_KEY;

  if (!serviceUrl) {
    return json({
      error: "The secure scanned-document reader is not configured yet.",
      code: "SCANNER_NOT_CONFIGURED",
    }, 503);
  }

  try {
    if (request.headers.get("x-instantgpa-request") !== "transcript-import") {
      return json({ error: "Invalid transcript request.", code: "INVALID_REQUEST" }, 400);
    }
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
      return json({ error: "Cross-site transcript uploads are not allowed.", code: "CROSS_SITE_REQUEST" }, 403);
    }
    assertSameOrigin(request);
    try {
      await requireActiveSubscriber(request);
    } catch (error) {
      return errorResponse(error);
    }
    const authorization = request.headers.get("authorization")!;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return json({ error: "Choose one transcript file.", code: "FILE_REQUIRED" }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return json({ error: "The maximum scan size is 20 MB.", code: "FILE_TOO_LARGE" }, 413);
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return json({
        error: "Secure scanning supports PDF, JPG, PNG, TIFF, BMP, and WebP.",
        code: "UNSUPPORTED_FILE",
      }, 415);
    }
    if (!(await hasExpectedFileSignature(file))) {
      return json({
        error: "The file contents do not match the selected PDF or image format.",
        code: "INVALID_FILE_SIGNATURE",
      }, 415);
    }
    if (file.type === "application/pdf") {
      let pages: number;
      try {
        pages = await pdfPageCount(file);
      } catch {
        return json({ error: "The uploaded file is not a readable PDF.", code: "INVALID_PDF" }, 400);
      }
      if (pages > PREMIUM_MAX_PAGES) {
        return json({
          error: `Premium transcript review accepts a maximum of ${PREMIUM_MAX_PAGES} pages. This PDF has ${pages} pages.`,
          code: "PDF_PAGE_LIMIT",
        }, 413);
      }
    }

    const upstreamForm = new FormData();
    upstreamForm.set("file", file, file.name);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 285_000);
    let upstream: Response;
    try {
      upstream = await fetch(`${serviceUrl}/v1/transcripts:parse`, {
        method: "POST",
        headers: {
          ...(backendKey ? { "x-instantgpa-backend-key": backendKey } : {}),
          "x-instantgpa-client": "sites",
          "x-idempotency-key": crypto.randomUUID(),
          authorization,
          ...(request.headers.get("x-firebase-appcheck")
            ? { "x-firebase-appcheck": request.headers.get("x-firebase-appcheck")! }
            : {}),
        },
        body: upstreamForm,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const upstreamBody: unknown = await upstream.json().catch(() => ({
      error: "The secure reader returned an invalid response.",
      code: "INVALID_SCANNER_RESPONSE",
    }));
    const body = objectRecord(upstreamBody) || {
      error: "The secure reader returned an invalid response.",
      code: "INVALID_SCANNER_RESPONSE",
    };
    const fileMetadata = objectRecord(body.file);
    const parsedPages = Number(fileMetadata?.pages || 0);
    if (upstream.ok && parsedPages > PREMIUM_MAX_PAGES) {
      return json({
        error: `Premium transcript review accepts a maximum of ${PREMIUM_MAX_PAGES} pages.`,
        code: "PDF_PAGE_LIMIT",
      }, 413);
    }
    if (body && typeof body === "object" && "rawText" in body) delete body.rawText;
    return json(body, upstream.status);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json({
      error: timedOut
        ? "The secure scan took too long. Try a smaller file."
        : "The secure reader is temporarily unavailable.",
      code: timedOut ? "SCANNER_TIMEOUT" : "SCANNER_UNAVAILABLE",
    }, timedOut ? 504 : 502);
  }
}
