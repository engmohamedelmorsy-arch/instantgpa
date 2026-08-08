export const MEASUREMENT_ID = "G-BD4VXE20R6";
const CONSENT_KEY = "instantgpa:analyticsConsent";
const INSTALL_KEY = "instantgpa:analyticsInstallId";
const SESSION_KEY = "instantgpa:analyticsSessionId";
const SESSION_STARTED_AT = Date.now();

const ALLOWED_EVENTS = new Set([
  "page_viewed", "journey_exit", "onboarding_started", "academic_context_confirmed",
  "academic_workspace_configured", "academic_profile_contributed",
  "academic_profile_contribution_failed", "university_changed", "calculator_opened",
  "tool_opened", "gpa_calculated", "cgpa_calculated", "grade_converted",
  "transcript_upload_started", "transcript_import_started", "transcript_review_started",
  "transcript_field_corrected", "transcript_import_completed", "degree_audit_started",
  "degree_audit_completed", "pricing_viewed", "checkout_account_started",
  "checkout_started", "checkout_returned", "checkout_completed", "premium_activated",
  "premium_tool_opened", "integration_started", "integration_completed",
  "ocr_consent_shown", "ocr_consent_granted", "ocr_completed", "ocr_failed",
]);

const SAFE_PARAM_KEYS = new Set([
  "billing_period", "confidence_bucket", "country", "duration_bucket", "file_type",
  "integration", "page_bucket", "processor", "quality", "reason", "result_type",
  "row_count_bucket", "scale_type", "size_bucket", "source", "stage", "status", "tool",
]);

let queue = [];
let flushTimer = null;
let lastPageEvent = "";

function randomId() {
  return crypto.randomUUID().replaceAll("-", "");
}

function storageValue(storage, key) {
  try {
    let value = storage.getItem(key) || "";
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(value)) {
      value = randomId();
      storage.setItem(key, value);
    }
    return value;
  } catch {
    return randomId();
  }
}

export function getAnalyticsSessionId() {
  return storageValue(window.sessionStorage, SESSION_KEY);
}

function getInstallId() {
  return storageValue(window.localStorage, INSTALL_KEY);
}

export function analyticsConsent() {
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

function initializeAnalytics() {
  if (analyticsConsent() !== "granted" || document.querySelector("script[data-instantgpa-analytics]")) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  script.dataset.instantgpaAnalytics = "true";
  document.head.appendChild(script);
}

export function setAnalyticsConsent(granted) {
  try {
    window.localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch {
    return false;
  }
  if (granted) initializeAnalytics();
  return true;
}

function durationBucket(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  if (seconds < 10) return "0-9s";
  if (seconds < 30) return "10-29s";
  if (seconds < 60) return "30-59s";
  if (seconds < 180) return "1-2m";
  if (seconds < 600) return "3-9m";
  return "10m+";
}

function rowCountBucket(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 15) return "6-15";
  if (count <= 40) return "16-40";
  return "41+";
}

function safeParams(params = {}) {
  const safe = Object.fromEntries(Object.entries(params).filter(([key, value]) => (
    SAFE_PARAM_KEYS.has(key) && ["string", "number", "boolean"].includes(typeof value)
  )));
  if (params.rows != null && safe.row_count_bucket == null) safe.row_count_bucket = rowCountBucket(params.rows);
  return safe;
}

function flush(useBeacon = false) {
  if (!queue.length || analyticsConsent() !== "granted") return;
  const events = queue.splice(0, 20);
  const body = JSON.stringify({ sessionId: getAnalyticsSessionId(), installId: getInstallId(), events });
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/analytics/events", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(false), 800);
}

export function track(eventName, params = {}) {
  if (!ALLOWED_EVENTS.has(eventName) || analyticsConsent() !== "granted") return;
  const safe = safeParams(params);
  const path = location.pathname;
  if (eventName === "page_viewed") {
    const fingerprint = `${path}|${safe.tool || ""}|${document.documentElement.lang}`;
    if (fingerprint === lastPageEvent) return;
    lastPageEvent = fingerprint;
  }
  const event = {
    name: eventName,
    path,
    tool: safe.tool || "",
    language: document.documentElement.lang === "ar" ? "ar" : "en",
    country: safe.country || "",
    metadata: Object.fromEntries(Object.entries(safe).filter(([key]) => !["tool", "country"].includes(key))),
    occurredAt: new Date().toISOString(),
  };
  queue.push(event);
  if (typeof window.gtag === "function") window.gtag("event", eventName, safe);
  if (queue.length >= 10) flush(false);
  else scheduleFlush();
}

function sanitizedErrorMessage(value) {
  return String(value || "Unexpected browser error")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{7,}\b/g, "[number]")
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .slice(0, 320);
}

export function trackError(error, context = {}) {
  const message = sanitizedErrorMessage(error?.message || error);
  const source = (() => {
    try { return new URL(context.source || "", location.origin).pathname; } catch { return "/"; }
  })();
  fetch("/api/analytics/errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message,
      category: context.category || "runtime",
      path: location.pathname,
      source,
      line: context.line || 0,
      column: context.column || 0,
      metadata: { stage: context.stage || "browser" },
    }),
    keepalive: true,
  }).catch(() => {});
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("error", (event) => {
    if (event.target !== window) return;
    trackError(event.error || event.message, { source: event.filename, line: event.lineno, column: event.colno });
  });
  window.addEventListener("unhandledrejection", (event) => trackError(event.reason, { category: "unhandled_rejection" }));
  window.addEventListener("pagehide", () => {
    track("journey_exit", { duration_bucket: durationBucket(Date.now() - SESSION_STARTED_AT) });
    flush(true);
  });
  initializeAnalytics();
}
