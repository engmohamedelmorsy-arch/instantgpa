import { getAnalyticsSessionId } from "./analytics.js";

const L = (english, arabic) => document.documentElement.lang === "ar" ? arabic : english;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

function toolName() {
  return location.pathname.replace(/^\/(?:ar\/)?|\/$/g, "").slice(0, 60) || "home";
}

async function submit(widget, answer, note = "") {
  widget.querySelectorAll("button, textarea").forEach((control) => { control.disabled = true; });
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: getAnalyticsSessionId(),
      path: location.pathname,
      tool: toolName(),
      answer,
      note,
    }),
  }).catch(() => null);
  if (!response?.ok) {
    widget.innerHTML = `<p class="result-note result-note--warn">${L("Feedback was not saved. Please try again.", "لم تُحفظ الملاحظة. حاول مرة أخرى.")}</p>`;
    return;
  }
  widget.innerHTML = `<p class="result-feedback__thanks">${L("Thank you — this helps us improve the reader and calculation.", "شكرًا — هذا يساعدنا على تحسين القراءة والحساب.")}</p>`;
}

function attach(target) {
  if (target.dataset.feedbackAttached || !target.querySelector(".result-value, .result-headline") && !target.classList.contains("import-success")) return;
  target.dataset.feedbackAttached = "true";
  const widget = document.createElement("section");
  widget.className = "result-feedback";
  widget.setAttribute("aria-label", L("Result feedback", "تقييم النتيجة"));
  widget.innerHTML = `<strong>${L("Is this reading or calculation correct?", "هل القراءة أو الحساب صحيح؟")}</strong>
    <div class="row-actions"><button type="button" class="btn btn--ghost" data-feedback="yes">${L("Yes", "نعم")}</button><button type="button" class="btn btn--ghost" data-feedback="no">${L("No", "لا")}</button></div>`;
  widget.querySelector('[data-feedback="yes"]').addEventListener("click", () => submit(widget, "yes"));
  widget.querySelector('[data-feedback="no"]').addEventListener("click", () => {
    widget.innerHTML = `<strong>${L("What should we correct?", "ما الذي يجب تصحيحه؟")}</strong>
      <textarea rows="3" maxlength="500" placeholder="${esc(L("Do not include names, email, student ID, or transcript text.", "لا تكتب اسمًا أو بريدًا أو رقمًا جامعيًا أو نص الترانسكريبت."))}"></textarea>
      <div class="row-actions"><button type="button" class="btn btn--primary">${L("Send", "إرسال")}</button></div>`;
    widget.querySelector("button").addEventListener("click", () => submit(widget, "no", widget.querySelector("textarea").value));
  });
  target.appendChild(widget);
}

function scan(root = document) {
  root.querySelectorAll?.(".result-box, .import-success").forEach(attach);
}

new MutationObserver((mutations) => mutations.forEach((mutation) => {
  if (mutation.target instanceof Element) {
    if (mutation.target.matches(".result-box, .import-success")) attach(mutation.target);
    scan(mutation.target);
  }
})).observe(document.documentElement, { childList: true, subtree: true });
scan();
