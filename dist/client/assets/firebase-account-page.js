import { CloudSync } from "./cloud-sync.js";

let accountLanguage = "en";
try { accountLanguage = JSON.parse(localStorage.getItem("instantgpa:language") || '"en"') === "ar" ? "ar" : "en"; } catch { accountLanguage = "en"; }
const L = (english, arabic) => accountLanguage === "ar" ? arabic : english;
function applyAccountLanguage(language) {
  accountLanguage = language === "ar" ? "ar" : "en";
  document.documentElement.lang = accountLanguage;
  document.documentElement.dir = accountLanguage === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-en][data-ar]").forEach((element) => { element.textContent = element.dataset[accountLanguage]; });
  document.querySelectorAll("[data-account-language]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.accountLanguage === accountLanguage)));
  try { localStorage.setItem("instantgpa:language", JSON.stringify(accountLanguage)); } catch {}
}
document.querySelectorAll("[data-account-language]").forEach((button) => button.addEventListener("click", async () => {
  applyAccountLanguage(button.dataset.accountLanguage);
  await refreshAccount();
}));
applyAccountLanguage(accountLanguage);

const card = document.querySelector("#firebaseAccountCard");
const signedOut = document.querySelector("#firebaseSignedOut");
const signedIn = document.querySelector("#firebaseSignedIn");
const feedback = document.querySelector("#firebaseAuthFeedback");
const ownerEmail = document.querySelector(".auth-page")?.dataset.ownerEmail?.trim().toLowerCase() || "";
const emailInput = document.querySelector("#firebaseEmail");
const passwordInput = document.querySelector("#firebasePassword");
const googleButton = document.querySelector("#firebaseGoogleSignIn");
const emailForm = document.querySelector("#firebaseEmailForm");
const createButton = document.querySelector("#firebaseCreateAccount");
const resetButton = document.querySelector("#firebaseResetPassword");
const signOutButton = document.querySelector("#firebaseSignOut");
const checkoutButton = document.querySelector("#firebaseStartCheckout");
const accountParams = new URLSearchParams(location.search);
const subscribeMode = accountParams.get("subscribe") === "1";
const billingPeriod = accountParams.get("billing") === "annual" ? "annual" : "monthly";
if (googleButton) googleButton.hidden = false;
if (createButton) createButton.hidden = !subscribeMode;
let ownerRedirectStarted = false;

function errorMessage(error) {
  const code = String(error?.code || "").replace(/^firebase\//, "");
  const messages = {
    "auth/invalid-credential": L("The email or password is incorrect.", "البريد أو كلمة المرور غير صحيحين."),
    "auth/invalid-email": L("Enter a valid email address.", "أدخل بريدًا إلكترونيًا صالحًا."),
    "auth/email-already-in-use": L("An account already exists for this email. Sign in or reset the password.", "يوجد حساب بهذا البريد. سجل الدخول أو أعد تعيين كلمة المرور."),
    "auth/weak-password": L("Use a stronger password with at least 6 characters.", "استخدم كلمة مرور أقوى من 6 أحرف على الأقل."),
    "auth/missing-password": L("Enter your password.", "أدخل كلمة المرور."),
    "auth/popup-closed-by-user": L("Google sign-in was closed before it finished.", "أُغلقت نافذة Google قبل اكتمال الدخول."),
    "auth/popup-blocked": L("Allow pop-ups and try Google sign-in again.", "اسمح بالنوافذ المنبثقة ثم حاول تسجيل Google مجددًا."),
    "auth/unauthorized-domain": L("This domain is not authorized in Firebase Authentication.", "هذا النطاق غير مصرح به في Firebase Authentication."),
    "auth/operation-not-allowed": L("This sign-in method is not enabled.", "طريقة تسجيل الدخول هذه غير مفعلة."),
    "auth/too-many-requests": L("Too many attempts. Wait, then try again.", "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا."),
    "auth/user-disabled": L("This account has been disabled.", "تم تعطيل هذا الحساب."),
    "auth/user-not-found": L("No InstantGPA account was found for this email.", "لا يوجد حساب InstantGPA بهذا البريد."),
    "auth/wrong-password": L("The email or password is incorrect.", "البريد أو كلمة المرور غير صحيحين."),
    "auth/web-storage-unsupported": L("Enable browser storage to use secure sign-in.", "فعّل تخزين المتصفح لاستخدام الدخول الآمن."),
    "auth/internal-error": L("Google could not finish sign-in. Try again.", "تعذر على Google إكمال الدخول. حاول مجددًا."),
  };
  return messages[error?.code] || messages[code] || error?.message || L("Sign-in could not be completed.", "تعذر إكمال تسجيل الدخول.");
}

function setBusy(busy, message = "") {
  card?.setAttribute("aria-busy", busy ? "true" : "false");
  [googleButton, createButton, resetButton, signOutButton, checkoutButton, ...(emailForm?.querySelectorAll("button, input") || [])]
    .filter(Boolean)
    .forEach((control) => { control.disabled = busy; });
  if (message) feedback.textContent = message;
}

function showFeedback(message, kind = "") {
  feedback.textContent = message;
  feedback.dataset.kind = kind;
}

async function refreshAccount() {
  const sessionResult = await CloudSync.getSession();
  const session = sessionResult.ok ? sessionResult.session : null;
  if (!session) {
    signedOut.hidden = false;
    signedIn.hidden = true;
    showFeedback(L("Secure sign-in is ready.", "تسجيل الدخول الآمن جاهز."));
    card.setAttribute("aria-busy", "false");
    return;
  }

  const params = new URLSearchParams(location.search);
  const returnedSubscriptionId = params.get("subscription_id");
  if (params.get("paypal") === "success" && returnedSubscriptionId) {
    const confirmed = await CloudSync.confirmPayPalSubscription(returnedSubscriptionId);
    showFeedback(confirmed.ok ? L("Payment approval received and subscription status checked.", "وصلت موافقة الدفع وتم فحص حالة الاشتراك.") : confirmed.error || L("PayPal approval is still pending.", "ما زالت موافقة PayPal معلقة."), confirmed.ok ? "success" : "warning");
    history.replaceState({}, "", "/account");
  }
  await CloudSync.refreshUser();
  const statusResult = await CloudSync.getAccountStatus();
  const email = String(session.user.email || "").trim().toLowerCase();
  const isOwner = Boolean(statusResult.ok && statusResult.data.isOwner && email === ownerEmail);
  const entitlementStatus = statusResult.ok ? statusResult.data.entitlement?.status : "";
  const hasPremium = isOwner || entitlementStatus === "active";
  signedOut.hidden = true;
  signedIn.hidden = false;
  document.querySelector("#firebaseAccountEmail").textContent = email || session.user.displayName || L("Firebase user", "مستخدم Firebase");
  document.querySelector("#firebasePremiumActions").hidden = !hasPremium;
  document.querySelector("#firebaseSubscribeActions").hidden = hasPremium;
  if (checkoutButton) checkoutButton.disabled = !session.user.emailVerified;
  document.querySelector("#firebaseAdminLink").hidden = !isOwner;
  document.querySelector("#firebaseNonOwnerNote").hidden = hasPremium;
  document.querySelector("#firebaseAccountStatus").textContent = hasPremium ? (isOwner ? L("Verified owner", "المالك مؤكد") : L("Premium active", "Premium فعال")) : L("No active subscription", "لا يوجد اشتراك فعال");
  document.querySelector("#firebaseAccountStatus").className = `auth-status ${hasPremium ? "auth-status--success" : "auth-status--warning"}`;
  document.querySelector("#firebaseAccountHeading").textContent = hasPremium ? L("Premium is unlocked", "تم فتح Premium") : L("No active subscription yet", "لا يوجد اشتراك فعال بعد");
  showFeedback(
    statusResult.ok
      ? hasPremium
        ? isOwner ? L("Firebase verified your administrator account.", "أكد Firebase حساب المالك.") : L("Your InstantGPA Premium subscription is active.", "اشتراك InstantGPA Premium فعال.")
        : session.user.emailVerified ? L("Signed in. Complete PayPal or card checkout to activate Premium.", "تم الدخول. أكمل الدفع عبر PayPal أو البطاقة لتفعيل Premium.") : L("Verify your Firebase email before opening checkout.", "أكد بريد Firebase قبل فتح الدفع.")
      : statusResult.error || L("Signed in, but access could not be verified.", "تم الدخول لكن تعذر التحقق من الصلاحية."),
    statusResult.ok && hasPremium ? "success" : "warning",
  );
  card.setAttribute("aria-busy", "false");
  if (isOwner && !ownerRedirectStarted) {
    ownerRedirectStarted = true;
    showFeedback(L("Administrator verified. Opening the owner dashboard…", "تم تأكيد المالك. جارٍ فتح لوحة الإدارة…"), "success");
    window.location.replace("/admin");
  }
}

googleButton?.addEventListener("click", async () => {
  setBusy(true, L("Opening Google sign-in…", "جارٍ فتح تسجيل Google…"));
  const result = await CloudSync.signInWithGoogle();
  if (!result.ok) {
    setBusy(false);
    showFeedback(errorMessage(result.error), "error");
    return;
  }
  if (!result.redirecting) await refreshAccount();
});

emailForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true, L("Checking your account…", "جارٍ فحص الحساب…"));
  const result = await CloudSync.signIn(emailInput.value.trim(), passwordInput.value);
  setBusy(false);
  if (!result.ok) {
    showFeedback(errorMessage(result.error), "error");
    return;
  }
  passwordInput.value = "";
  await refreshAccount();
});

createButton?.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    showFeedback(L("Enter an email and a password to create your account.", "أدخل البريد وكلمة المرور لإنشاء الحساب."), "error");
    return;
  }
  setBusy(true, L("Creating your Firebase account…", "جارٍ إنشاء حساب Firebase…"));
  const result = await CloudSync.signUp(email, password, { purpose: "premium_checkout" });
  setBusy(false);
  if (!result.ok) {
    showFeedback(errorMessage(result.error), "error");
    return;
  }
  passwordInput.value = "";
  showFeedback(L("Account created. Firebase sent the verification email. Open it, then return to continue to payment.", "تم إنشاء الحساب وأرسل Firebase رسالة التأكيد. افتحها ثم عد لإكمال الدفع."), "success");
});

resetButton?.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) {
    showFeedback(L("Enter your account email first.", "أدخل بريد الحساب أولًا."), "error");
    emailInput.focus();
    return;
  }
  setBusy(true, L("Sending the Firebase password-reset email…", "جارٍ إرسال إعادة تعيين كلمة المرور من Firebase…"));
  const result = await CloudSync.resetPassword(email);
  setBusy(false);
  showFeedback(
    result.ok ? L("Firebase password-reset email sent.", "أرسل Firebase رسالة إعادة تعيين كلمة المرور.") : errorMessage(result.error),
    result.ok ? "success" : "error",
  );
});

signOutButton?.addEventListener("click", async () => {
  setBusy(true, L("Signing out…", "جارٍ تسجيل الخروج…"));
  const result = await CloudSync.signOut();
  setBusy(false);
  if (!result.ok) {
    showFeedback(errorMessage(result.error), "error");
    return;
  }
  await refreshAccount();
});

checkoutButton?.addEventListener("click", async () => {
  setBusy(true, L(`Opening secure PayPal/card ${billingPeriod} approval…`, `جارٍ فتح الدفع الآمن (${billingPeriod === "annual" ? "سنوي" : "شهري"})…`));
  const result = await CloudSync.startPremiumCheckout(billingPeriod);
  if (result.ok && result.data?.checkoutUrl) {
    location.assign(result.data.checkoutUrl);
    return;
  }
  setBusy(false);
  showFeedback(result.error || L("Live PayPal/card checkout is not configured yet.", "الدفع الحقيقي عبر PayPal/البطاقة غير مُعد بعد."), "error");
});

async function start() {
  if (!CloudSync.isConfigured()) {
    setBusy(false);
    showFeedback(L("Firebase sign-in is not configured.", "تسجيل Firebase غير مُعد."), "error");
    return;
  }
  const redirectResult = await CloudSync.completeRedirectSignIn();
  if (!redirectResult.ok) {
    setBusy(false);
    showFeedback(errorMessage(redirectResult.error), "error");
    return;
  }
  await refreshAccount();
}

start().catch((error) => {
  setBusy(false);
  showFeedback(errorMessage(error), "error");
});
