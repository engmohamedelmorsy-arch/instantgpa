// entitlement.js — shared subscriber-access check + upgrade prompt markup,
// used by both the Pro workspace and any route that requires an active
// subscription (grade converter, degree audit,
// planning, graduation predictor, retake calculator, scenario lab, academic
// report). Kept separate from pro-workspace.js so app.js's main bundle can
// import just this small module instead of pulling in the whole Pro
// workspace UI for a route that only needs the gate check.
import { routeHref } from "./app.js";
import { currentLanguage } from "./localization.js";

export function activeEntitlement(status) {
  const entitlement = status?.entitlement;
  return Boolean(entitlement && entitlement.status === "active");
}

export async function checkEntitlement(cloudSync) {
  const sessionResult = await cloudSync.getSession();
  if (!sessionResult.ok || !sessionResult.session) {
    return { ok: false, reason: "signed_out" };
  }
  const statusResult = await cloudSync.getAccountStatus();
  if (!statusResult.ok || !activeEntitlement(statusResult.data)) {
    return {
      ok: false,
      reason: statusResult.data?.premiumMode === "owner_only" || statusResult.reason === "PREMIUM_OWNER_ONLY"
        ? "owner_only"
        : statusResult.reason || "subscription",
    };
  }
  return { ok: true };
}

export function paywall(reason = "subscription", toolTitle = "") {
  const ar = currentLanguage() === "ar";
  const signedOut = reason === "signed_out";
  const ownerOnly = reason === "owner_only";
  const title = signedOut
    ? (ar ? "سجل الدخول أو أنشئ حساب Premium المدفوع" : "Sign in or create your paid Premium account")
    : ownerOnly
      ? (ar ? "Premium مغلق مؤقتًا" : "Premium is temporarily closed")
      : toolTitle
        ? (ar ? `${toolTitle} من أدوات Pro` : `${toolTitle} is a Pro feature`)
        : (ar ? "يلزم اشتراك مدفوع فعال" : "An active subscription is required");
  return `
    <section class="pro-paywall" aria-labelledby="proPaywallTitle">
      <div class="pro-paywall__visual" aria-hidden="true">
        <span>PRO</span><strong>${toolTitle || "InstantGPA Pro"}</strong><i>${ar ? "أكثر من GPA وCGPA" : "Beyond GPA and CGPA"}</i>
      </div>
      <div>
        <span class="section-kicker">InstantGPA Pro</span>
        <h2 id="proPaywallTitle">${title}</h2>
        <p>${ownerOnly ? (ar ? "الدخول متاح للمالك فقط أثناء تجهيز Premium للإطلاق." : "Owner access only while InstantGPA Premium is being prepared for launch.") : (ar ? "يشمل المجاني الإعداد الأكاديمي ومراجعة ترانسكريبت حتى 3 صفحات وGPA وCGPA. يمكن لأي شخص الاشتراك، ولا يتفعّل Premium إلا بعد تأكيد PayPal للدفع." : "Free access covers academic setup, transcript review up to 3 pages, GPA, and CGPA. Premium checkout is open to anyone and activates only after PayPal confirms payment.")}</p>
        <div class="row-actions">
          <a class="btn btn--primary" href="${routeHref("pricing")}">${ar ? "الدفع عبر PayPal أو البطاقة" : "Pay with PayPal or card"}</a>
          <a class="btn btn--ghost" href="${routeHref("account")}">${ar ? "لديك اشتراك؟ سجل الدخول" : "Existing access? Sign in"}</a>
          <a class="btn btn--ghost" href="${routeHref("instantgpa-pro")}">${ar ? "قارن أدوات Pro" : "Compare Pro features"}</a>
        </div>
        <p class="field-note">${ar ? "قد يتيح PayPal الدفع ببطاقة خصم أو ائتمان مؤهلة دون امتلاك حساب PayPal." : "PayPal may offer PayPal login or eligible debit/credit-card checkout."}</p>
      </div>
    </section>`;
}
