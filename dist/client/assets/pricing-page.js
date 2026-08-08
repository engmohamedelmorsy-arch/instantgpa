import { currentLanguage } from "./localization.js";
import { track } from "./analytics.js";

const COPY = {
  en: {
    free: [
      "Country, university, college, department, and grading-system setup",
      "Transcript import and review up to 3 pages",
      "Semester GPA calculated from U/in-progress transcript courses",
      "Cumulative GPA calculated from the reviewed transcript",
      "No account required",
    ],
    premium: [
      "Transcript import and secure OCR up to 30 pages",
      "Automatic grade conversion across every supported grading system",
      "Academic Twin: live semester tracking across cost, time, and risk",
      "Academic Undo: bounded what-if scenarios with evidence",
      "Source-grounded syllabus chat and weighted-grade tracking",
      "Transfer matching using codes, titles, credits, descriptions, outcomes, and level",
      "Private account, academic record, subscription, and workspace storage in Firebase",
    ],
    unavailable: "Premium checkout",
    temporarilyUnavailable: "Temporarily unavailable",
    configuring: "The PayPal plan is being configured.",
    economic: "Economic",
    high: "High-income",
    standard: "Standard",
    pay: "Pay with PayPal or card",
    liveSoon: "Live checkout coming soon",
    sandboxTitle: "PayPal Sandbox test mode.",
    sandboxBody: "No real money moves and no real Premium subscription is created on the live site.",
    regional: "regional price",
    month: "per month",
    year: "per year",
    monthly: "monthly",
    annual: "annual",
    save: "Save",
    cardNote: "PayPal may offer PayPal login or eligible debit/credit-card checkout. Guest-card availability is decided by PayPal for each transaction.",
    kicker: "Simple, transparent pricing",
    title: "Free calculators for everyone. Premium for the connected academic workspace.",
    subtitle: "Free completes transcript → GPA → CGPA without an account. Premium adds private Firebase sync and every advanced student tool.",
    loading: "Loading PayPal plan…",
    freeTitle: "Free · no account",
    premiumTitle: "Premium · paid account",
    tierNote: "There is no registered-free account type. Creating an account here starts the paid subscription flow.",
    loadError: "Pricing could not be loaded. Try again shortly.",
  },
  ar: {
    free: [
      "إعداد الدولة والجامعة والكلية والقسم ونظام التقييم",
      "رفع الترانسكريبت ومراجعته حتى 3 صفحات",
      "حساب GPA الفصلي من مواد U أو المواد الجارية في الترانسكريبت",
      "حساب CGPA تلقائيًا من الترانسكريبت الذي تمت مراجعته",
      "لا يحتاج إلى حساب",
    ],
    premium: [
      "رفع الترانسكريبت وOCR آمن حتى 30 صفحة",
      "تحويل الدرجات تلقائيًا بين كل أنظمة التقييم المدعومة",
      "Academic Twin لمتابعة الفصل من حيث التكلفة والوقت والمخاطر",
      "Academic Undo لمحاكاة القرارات في نطاق واضح ومدعوم بالأدلة",
      "محادثة سيلابس مرتبطة بالمصدر ومتابعة الدرجة الموزونة",
      "مطابقة التحويل باستخدام الكود والاسم والساعات والوصف والنواتج والمستوى",
      "حفظ الحساب والسجل الأكاديمي والاشتراك ومساحة العمل بصورة خاصة في Firebase",
    ],
    unavailable: "دفع Premium",
    temporarilyUnavailable: "غير متاح مؤقتًا",
    configuring: "يجري إعداد خطة PayPal.",
    economic: "اقتصادي",
    high: "دخل مرتفع",
    standard: "قياسي",
    pay: "الدفع عبر PayPal أو البطاقة",
    liveSoon: "الدفع الحقيقي سيتاح قريبًا",
    sandboxTitle: "وضع اختبار PayPal Sandbox.",
    sandboxBody: "لا تنتقل أموال حقيقية ولا يُنشأ اشتراك Premium حقيقي على الموقع المنشور.",
    regional: "السعر الإقليمي",
    month: "شهريًا",
    year: "سنويًا",
    monthly: "شهري",
    annual: "سنوي",
    save: "وفّر",
    cardNote: "قد يعرض PayPal تسجيل الدخول أو الدفع ببطاقة خصم/ائتمان مؤهلة. يحدد PayPal إتاحة الدفع بالبطاقة دون حساب لكل عملية.",
    kicker: "أسعار بسيطة وواضحة",
    title: "حسابات مجانية للجميع، وPremium لمساحة أكاديمية مترابطة.",
    subtitle: "ينجز المجاني رحلة الترانسكريبت ← GPA ← CGPA دون حساب. ويضيف Premium مزامنة Firebase الخاصة وجميع أدوات الطالب المتقدمة.",
    loading: "جارٍ تحميل خطة PayPal…",
    freeTitle: "مجاني · دون حساب",
    premiumTitle: "Premium · حساب مدفوع",
    tierNote: "لا يوجد نوع حساب مجاني مسجل. إنشاء حساب هنا يبدأ رحلة الاشتراك المدفوع.",
    loadError: "تعذر تحميل الأسعار. حاول مرة أخرى بعد قليل.",
  },
};

const copy = () => COPY[currentLanguage()] || COPY.en;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

function formatPrice(price, currency) {
  try {
    return new Intl.NumberFormat(currentLanguage() === "ar" ? "ar-EG" : "en", { style: "currency", currency }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

function priceBox(data) {
  const c = copy();
  if (!data?.configured) {
    // Server diagnostics are intentionally not rendered verbatim: besides
    // leaking implementation details, they are English-only and would break
    // the selected interface language. The API can still log the precise
    // reason while students get a stable localized message.
    const unavailableMessage = data?.error ? c.loadError : c.configuring;
    return `<div class="pricing-price-box pricing-price-box--soon"><span class="pricing-price-eyebrow">${c.unavailable}</span><strong class="pricing-price-value">${c.temporarilyUnavailable}</strong><p>${escapeHtml(unavailableMessage)}</p></div>`;
  }
  const tierLabel = data.tier === "economic" ? c.economic : data.tier === "high" ? c.high : c.standard;
  const annualSaving = Math.max(0, Number(data.monthly?.price || 0) * 12 - Number(data.annual?.price || 0));
  const testMode = data.paymentMode === "sandbox";
  const checkoutLabel = data.paymentAvailable ? c.pay : c.liveSoon;
  return `<div class="pricing-price-box">
    ${testMode ? `<p class="result-note result-note--warn"><strong>${c.sandboxTitle}</strong> ${c.sandboxBody}</p>` : ""}
    <span class="pricing-price-eyebrow">${escapeHtml(data.plan || "InstantGPA Premium")} · ${escapeHtml(tierLabel)} ${c.regional}</span>
    <div class="pricing-period-grid">
      <section class="pricing-period-option">
        <strong class="pricing-price-value">${escapeHtml(formatPrice(data.monthly.price, data.monthly.currency))}</strong>
        <p>${c.month}</p>
        <a class="btn btn--primary" ${data.paymentAvailable ? 'href="/account?subscribe=1&amp;billing=monthly"' : 'aria-disabled="true"'}>${checkoutLabel} · ${c.monthly}</a>
      </section>
      <section class="pricing-period-option pricing-period-option--best">
        <span class="pricing-saving">${c.save} ${escapeHtml(formatPrice(annualSaving, data.annual.currency))}</span>
        <strong class="pricing-price-value">${escapeHtml(formatPrice(data.annual.price, data.annual.currency))}</strong>
        <p>${c.year}</p>
        <a class="btn btn--primary" ${data.paymentAvailable ? 'href="/account?subscribe=1&amp;billing=annual"' : 'aria-disabled="true"'}>${checkoutLabel} · ${c.annual}</a>
      </section>
    </div>
    <small>${c.cardNote}</small>
  </div>`;
}

export async function mount(container) {
  const c = copy();
  track("pricing_viewed", { tool: "pricing" });
  container.innerHTML = `
    <article class="pricing-page">
      <header class="pricing-hero">
        <span class="section-kicker">${c.kicker}</span>
        <h2>${c.title}</h2>
        <p class="tool-sub">${c.subtitle}</p>
        <div id="pricingBox"><div class="pricing-price-box"><strong class="pricing-price-value">${c.loading}</strong></div></div>
      </header>
      <section class="pricing-columns">
        <article class="pricing-column"><h3>${c.freeTitle}</h3><ul class="pricing-feature-list">${c.free.map((item) => `<li>${item}</li>`).join("")}</ul></article>
        <article class="pricing-column pricing-column--premium"><h3>${c.premiumTitle}</h3><ul class="pricing-feature-list">${c.premium.map((item) => `<li>${item}</li>`).join("")}</ul><p class="field-note">${c.tierNote}</p></article>
      </section>
    </article>`;
  try {
    const response = await fetch("/api/pricing", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    container.querySelector("#pricingBox").innerHTML = priceBox(response.ok ? data : { configured: false, error: data.error });
  } catch {
    container.querySelector("#pricingBox").innerHTML = priceBox({ configured: false, error: c.loadError });
  }
}
