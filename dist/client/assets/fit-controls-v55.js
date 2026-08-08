// Content-fit every data-entry control, including controls mounted after route
// changes. Selects reserve the exact width of their longest complete option so
// labels never clip and the layout does not move when the selection changes.
// Inputs use a stable semantic hint rather than resizing on every keystroke.

const CONTROL_SELECTOR = [
  "select:not([data-fit-width='off'])",
  "input:not([data-fit-width='off']):not([type='hidden']):not([type='file'])",
  "input:not([data-fit-width='off']):not([type='checkbox']):not([type='radio'])",
].join(",");

const UNSIZED_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

const canvas = document.createElement("canvas");
const context = canvas.getContext("2d");
const SELECT_ARROW_GUTTER = 38;
let pendingFrame = 0;

function pixels(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fontFor(style) {
  return [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.fontSize,
    style.fontFamily,
  ].filter(Boolean).join(" ");
}

function renderedTextWidth(text, style) {
  if (!context) return String(text || "").length * pixels(style.fontSize) * 0.62;
  context.font = fontFor(style);
  const value = String(text || "").replace(/\s+/g, " ").trim() || "0";
  const base = context.measureText(value).width;
  const spacing = pixels(style.letterSpacing);
  return base + Math.max(0, value.length - 1) * spacing;
}

function selectText(control) {
  const labels = Array.from(control.options)
    .filter((option) => !option.hidden)
    .map((option) => (option.label || option.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return labels.length ? labels : [control.getAttribute("aria-label") || "Select"];
}

function inputText(control) {
  const type = (control.type || "text").toLowerCase();
  if (control.readOnly) {
    const readonlyValue = [control.value, control.placeholder, control.getAttribute("aria-label")]
      .find((value) => value != null && String(value).trim());
    return [readonlyValue || "Read-only value"];
  }
  if (type === "date") return ["00/00/0000"];
  if (type === "month") return ["September 0000"];
  if (type === "time") return ["00:00 AM"];
  if (type === "datetime-local") return ["00/00/0000, 00:00 AM"];
  if (type === "number") {
    const candidates = [control.placeholder, control.min, control.max, control.getAttribute("aria-label")]
      .filter((value) => value != null && String(value).trim());
    return candidates.length ? candidates : ["000.000"];
  }
  const stableHint = [
    control.placeholder,
    control.getAttribute("aria-label"),
    control.name,
  ].find((value) => value != null && String(value).trim());
  const sizeHint = Number(control.getAttribute("size"));
  if (Number.isFinite(sizeHint) && sizeHint > 0) {
    return ["M".repeat(Math.min(sizeHint, 48))];
  }
  return [stableHint || "Enter value"];
}

function chromeWidth(control, style) {
  let width =
    pixels(style.paddingInlineStart) +
    pixels(style.paddingInlineEnd) +
    pixels(style.borderInlineStartWidth) +
    pixels(style.borderInlineEndWidth);

  if (control instanceof HTMLSelectElement) width += SELECT_ARROW_GUTTER;
  if (control instanceof HTMLInputElement) {
    const type = (control.type || "text").toLowerCase();
    if (type === "number") width += 22;
    if (["date", "month", "time", "datetime-local"].includes(type)) width += 30;
    if (type === "search") width += 18;
  }
  return width;
}

function minimumWidth(control) {
  const explicit = Number(control.dataset.fitMin);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (control instanceof HTMLSelectElement) return 60;
  const type = (control.type || "text").toLowerCase();
  if (type === "number") return 62;
  if (["date", "month", "time", "datetime-local"].includes(type)) return 132;
  return 56;
}

function fitControl(control) {
  if (!(control instanceof HTMLSelectElement || control instanceof HTMLInputElement)) return;
  if (control instanceof HTMLInputElement && UNSIZED_INPUT_TYPES.has((control.type || "text").toLowerCase())) return;

  const style = getComputedStyle(control);
  const candidates = control instanceof HTMLSelectElement
    ? selectText(control)
    : inputText(control);
  const longest = Math.max(
    0,
    ...candidates.map((value) => renderedTextWidth(value, style)),
  );
  const exactWidth = Math.ceil(Math.max(
    minimumWidth(control),
    longest + chromeWidth(control, style) + 2,
  ));

  control.style.setProperty("--fit-control-width", `${exactWidth}px`);
  control.classList.add("fit-control-width");
}

function collectControls(root = document) {
  const controls = [];
  if (root instanceof Element && root.matches(CONTROL_SELECTOR)) controls.push(root);
  root.querySelectorAll?.(CONTROL_SELECTOR).forEach((control) => controls.push(control));
  return controls;
}

function fitAll(root = document) {
  collectControls(root).forEach(fitControl);
}

function scheduleFit(root = document) {
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0;
    fitAll(root);
  });
}

document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) {
    fitControl(event.target);
  }
});

const contentObserver = new MutationObserver((mutations) => {
  const roots = new Set();
  mutations.forEach((mutation) => {
    if (mutation.type === "characterData") {
      roots.add(mutation.target.parentElement || document);
      return;
    }
    mutation.addedNodes.forEach((node) => {
      if (node instanceof Element) roots.add(node);
    });
  });
  if (!roots.size) return;
  scheduleFit(document);
});

contentObserver.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

const languageObserver = new MutationObserver(() => scheduleFit(document));
languageObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang", "dir"],
});

fitAll(document);
document.fonts?.ready.then(() => fitAll(document));
