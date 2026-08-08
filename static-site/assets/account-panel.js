import { CloudSync } from "./cloud-sync.js";
import { AcademicProfile } from "./academic-profile.js";
import { AcademicState } from "./academic-state.js";
import { GradingEngine } from "./grading-engine.js";
import { Storage } from "./storage.js";
import { currentLanguage } from "./localization.js";
import { track } from "./analytics.js";

const COPY = {
  en: {
    premiumAccess: "Premium access", createTitle: "Create your paid Premium account", signInTitle: "Premium sign in",
    createIntro: "Create a Firebase account, verify its email, then approve the paid subscription through PayPal or an eligible bank card.",
    signInIntro: "Sign in to an existing paid Premium or Owner account.", email: "Email", password: "Password", passwordPlaceholder: "Your password",
    signIn: "Sign in", create: "Create checkout account", google: "Continue with Google", reset: "Reset password",
    enterCredentials: "Enter your email and password.", signInFailed: "Sign-in failed. Check the account and try again.",
    createFailed: "Account creation failed. Check the details and try again.",
    created: "Account created. Firebase has sent the verification email. Open it, then return here and sign in to continue to payment.",
    googleFailed: "Google sign-in could not be completed.", enterEmail: "Enter your account email first.", resetSent: "Password-reset email sent by Firebase.", resetFailed: "The reset email could not be sent.",
    loading: "Loading account…", account: "Account", academicProfile: "Academic profile", countryUnset: "Country not set", collegeUnset: "College not set",
    academicCase: "Your Academic Case", currentGpa: "Current GPA", of: "of", credits: "Credit hours", gpaCourses: "GPA courses", semesters: "Semesters", allCourses: "All courses", storage: "Storage",
    syncRetrying: "Sync retrying", localPending: "Local + pending", signedInAs: "Signed in as", firebaseUser: "Firebase user",
    paymentConfirmed: "PayPal confirmed the subscription. Premium is active.", approvalPending: "Payment approval was received. Activation is waiting for PayPal confirmation.", confirmFailed: "Payment approval could not be confirmed yet.",
    premium: "InstantGPA Premium", paymentInactive: "Payment not active", status: "Status", active: "Active", pending: "Pending checkout", monthlyPages: "Monthly pages", remaining: "Remaining",
    verifyTitle: "Verify your email before payment.", verifyBody: "Firebase sends this message to prove that the address belongs to you.",
    stepsTitle: "Activation steps", stepIdentity: "1 · Firebase identity", stepVerify: "2 · Firebase email verification", stepPayment: "3 · PayPal or eligible card payment", stepWelcome: "4 · Resend welcome message",
    complete: "Complete", waiting: "Waiting", delivered: "Delivered", queued: "Queued after activation",
    subscriberTools: "Subscriber tools", twin: "Academic Twin Premium", toolsBody: "Syllabus targets, GPA/time/cost scenarios, transfer matching, document consistency review, saved workspace, and adviser links.",
    openPremium: "Open Premium workspace", subscribe: "Pay with PayPal or card", resend: "Resend Firebase verification email",
    ownerAccess: "Verified owner access", paidActive: "Paid Premium is active", completePayment: "Complete the paid subscription",
    ownerBody: "Only this verified owner account can open administration tools.", activeBody: "Your account, subscription, academic record, usage, email delivery, and Premium workspace are stored together in Firebase.",
    payBody: "Premium starts only after PayPal reports the paid subscription as active. PayPal may offer eligible debit or credit-card checkout without requiring a PayPal account.",
    reviewPrice: "Review price", openCenter: "Open Academic Command Center", openOwner: "Open owner dashboard", cancel: "Cancel paid subscription", signOut: "Sign out",
    opening: "Opening secure PayPal/card approval…", checkoutMissing: "Live checkout is not configured yet.", verificationSent: "Firebase verification email sent. Open it, then refresh this page.", verificationFailed: "Verification email could not be sent.",
    cancelConfirm: "Cancel the paid subscription? Premium access will stop when PayPal confirms cancellation.", cancelFailed: "The subscription could not be cancelled.", monthly: "monthly", annual: "annual",
    exportData: "Export my data", deleteData: "Delete my data", localData: "Free data controls", premiumData: "Premium data controls",
    deleteFreeConfirm: "Delete the synchronized Free record and all InstantGPA data in this browser? This cannot be undone.",
    deletePremiumConfirm: "Cancel the subscription and permanently delete the Premium academic record, workspace, reports, usage, and Firebase account? This cannot be undone.",
    exported: "Your data export was downloaded.", deleted: "Your InstantGPA data was deleted.", dataFailed: "The data request could not be completed.",
  },
  ar: {
    premiumAccess: "دخول Premium", createTitle: "أنشئ حساب Premium المدفوع", signInTitle: "تسجيل دخول Premium",
    createIntro: "أنشئ حساب Firebase وأكد بريده، ثم وافق على الاشتراك المدفوع عبر PayPal أو بطاقة بنكية مؤهلة.",
    signInIntro: "سجل الدخول إلى حساب Premium مدفوع أو حساب المالك.", email: "البريد الإلكتروني", password: "كلمة المرور", passwordPlaceholder: "كلمة المرور",
    signIn: "تسجيل الدخول", create: "إنشاء حساب للدفع", google: "المتابعة باستخدام Google", reset: "إعادة تعيين كلمة المرور",
    enterCredentials: "أدخل البريد الإلكتروني وكلمة المرور.", signInFailed: "فشل تسجيل الدخول. راجع بيانات الحساب وحاول مجددًا.",
    createFailed: "تعذر إنشاء الحساب. راجع البيانات وحاول مجددًا.",
    created: "تم إنشاء الحساب وأرسل Firebase رسالة التأكيد. افتحها ثم عد وسجل الدخول لإكمال الدفع.",
    googleFailed: "تعذر إكمال تسجيل الدخول باستخدام Google.", enterEmail: "أدخل بريد الحساب أولًا.", resetSent: "أرسل Firebase رسالة إعادة تعيين كلمة المرور.", resetFailed: "تعذر إرسال رسالة إعادة التعيين.",
    loading: "جارٍ تحميل الحساب…", account: "الحساب", academicProfile: "الملف الأكاديمي", countryUnset: "لم تُحدد الدولة", collegeUnset: "لم تُحدد الكلية",
    academicCase: "حالتك الأكاديمية", currentGpa: "GPA الحالي", of: "من", credits: "الساعات", gpaCourses: "مواد GPA", semesters: "الفصول", allCourses: "كل المواد", storage: "التخزين",
    syncRetrying: "إعادة محاولة المزامنة", localPending: "محلي وفي انتظار المزامنة", signedInAs: "مسجل باسم", firebaseUser: "مستخدم Firebase",
    paymentConfirmed: "أكد PayPal الاشتراك وأصبح Premium فعالًا.", approvalPending: "وصلت موافقة الدفع وما زال التفعيل في انتظار تأكيد PayPal.", confirmFailed: "تعذر تأكيد موافقة الدفع حتى الآن.",
    premium: "InstantGPA Premium", paymentInactive: "الدفع غير فعال", status: "الحالة", active: "فعال", pending: "في انتظار الدفع", monthlyPages: "صفحات الشهر", remaining: "المتبقي",
    verifyTitle: "أكد بريدك قبل الدفع.", verifyBody: "يرسل Firebase هذه الرسالة للتأكد أن البريد ملكك.",
    stepsTitle: "خطوات التفعيل", stepIdentity: "1 · هوية Firebase", stepVerify: "2 · تأكيد البريد من Firebase", stepPayment: "3 · الدفع عبر PayPal أو بطاقة مؤهلة", stepWelcome: "4 · رسالة الترحيب من Resend",
    complete: "مكتمل", waiting: "في الانتظار", delivered: "تم الإرسال", queued: "تُرسل بعد التفعيل",
    subscriberTools: "أدوات المشترك", twin: "Academic Twin Premium", toolsBody: "أهداف السيلابس ومحاكاة GPA والوقت والتكلفة ومطابقة التحويل ومراجعة المستندات ومساحة محفوظة وروابط للمرشد.",
    openPremium: "فتح مساحة Premium", subscribe: "الدفع عبر PayPal أو البطاقة", resend: "إعادة إرسال تأكيد Firebase",
    ownerAccess: "دخول المالك المؤكد", paidActive: "Premium المدفوع فعال", completePayment: "أكمل الاشتراك المدفوع",
    ownerBody: "هذا الحساب المؤكد وحده يستطيع فتح أدوات الإدارة.", activeBody: "يُحفظ حسابك واشتراكك وسجلك الأكاديمي واستهلاكك وسجل الرسائل ومساحة Premium معًا في Firebase.",
    payBody: "يبدأ Premium بعد أن يؤكد PayPal أن الاشتراك المدفوع فعال. وقد يتيح PayPal الدفع ببطاقة خصم أو ائتمان مؤهلة دون حساب PayPal.",
    reviewPrice: "مراجعة السعر", openCenter: "فتح مركز القيادة الأكاديمي", openOwner: "فتح لوحة المالك", cancel: "إلغاء الاشتراك المدفوع", signOut: "تسجيل الخروج",
    opening: "جارٍ فتح دفع PayPal/البطاقة الآمن…", checkoutMissing: "الدفع الحقيقي غير مُعد حتى الآن.", verificationSent: "أرسل Firebase رسالة التأكيد. افتحها ثم حدّث الصفحة.", verificationFailed: "تعذر إرسال رسالة التأكيد.",
    cancelConfirm: "هل تريد إلغاء الاشتراك المدفوع؟ تتوقف صلاحية Premium بعد أن يؤكد PayPal الإلغاء.", cancelFailed: "تعذر إلغاء الاشتراك.", monthly: "شهري", annual: "سنوي",
    exportData: "تصدير بياناتي", deleteData: "حذف بياناتي", localData: "التحكم في بيانات المجاني", premiumData: "التحكم في بيانات Premium",
    deleteFreeConfirm: "هل تريد حذف سجل المجاني المتزامن وكل بيانات InstantGPA من هذا المتصفح؟ لا يمكن التراجع.",
    deletePremiumConfirm: "هل تريد إلغاء الاشتراك وحذف السجل الأكاديمي ومساحة Premium والتقارير والاستهلاك وحساب Firebase نهائيًا؟ لا يمكن التراجع.",
    exported: "تم تنزيل نسخة بياناتك.", deleted: "تم حذف بيانات InstantGPA.", dataFailed: "تعذر إكمال طلب البيانات.",
  },
};

const copy = () => COPY[currentLanguage()] || COPY.en;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export async function mount(container) {
  const c = copy();
  container.innerHTML = renderAcademicSummary(c);
  const sessionResult = await CloudSync.getSession();
  const session = sessionResult.ok ? sessionResult.session : null;
  const params = new URLSearchParams(location.search);
  const subscribeMode = params.get("subscribe") === "1";
  const accountHost = document.createElement("div");
  accountHost.className = "tool-card account-session-card";
  container.appendChild(accountHost);
  wireFreeDataControls(container, c);
  if (!session) return renderAccountSignIn(accountHost, container, subscribeMode, c);
  accountHost.setAttribute("aria-busy", "true");
  accountHost.textContent = c.loading;
  await renderSignedIn(accountHost, session, c);
}

function renderAccountSignIn(container, mountHost, subscribeMode, c) {
  if (subscribeMode) track("checkout_account_started", { stage: "account" });
  container.innerHTML = `<span class="section-kicker">${c.premiumAccess}</span><h2>${subscribeMode ? c.createTitle : c.signInTitle}</h2><p class="tool-sub">${subscribeMode ? c.createIntro : c.signInIntro}</p>
    <div class="owner-signin-form"><label><span>${c.email}</span><input id="ownerEmail" type="email" autocomplete="username" placeholder="name@example.com"></label><label><span>${c.password}</span><input id="ownerPassword" type="password" autocomplete="current-password" placeholder="${c.passwordPlaceholder}"></label>
    <div class="row-actions"><button type="button" class="btn btn--primary" id="ownerEmailSignIn">${c.signIn}</button>${subscribeMode ? `<button type="button" class="btn btn--ghost" id="accountEmailSignUp">${c.create}</button><button type="button" class="btn btn--ghost" id="ownerGoogleSignIn">${c.google}</button>` : ""}<button type="button" class="btn btn--text" id="ownerResetPassword">${c.reset}</button></div><div id="ownerSignInStatus" class="setup-status" aria-live="polite"></div></div>`;
  const email = container.querySelector("#ownerEmail"); const password = container.querySelector("#ownerPassword"); const status = container.querySelector("#ownerSignInStatus");
  const setBusy = (busy) => container.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  const showError = (message) => { status.innerHTML = `<p class="setup-status__text setup-status__text--warn">${escapeHtml(message)}</p>`; };
  container.querySelector("#ownerEmailSignIn").addEventListener("click", async () => { if (!email.value.trim() || !password.value) return showError(c.enterCredentials); setBusy(true); const result = await CloudSync.signIn(email.value.trim(), password.value); setBusy(false); if (!result.ok) return showError(result.error?.message || c.signInFailed); await mount(mountHost); });
  container.querySelector("#accountEmailSignUp")?.addEventListener("click", async () => { if (!email.value.trim() || !password.value) return showError(c.enterCredentials); setBusy(true); const result = await CloudSync.signUp(email.value.trim(), password.value, { purpose: "premium_checkout" }); setBusy(false); if (!result.ok) return showError(result.error?.message || c.createFailed); status.innerHTML = `<p class="setup-status__text">${c.created}</p>`; });
  container.querySelector("#ownerGoogleSignIn")?.addEventListener("click", async () => { setBusy(true); const result = await CloudSync.signInWithGoogle(); setBusy(false); if (!result.ok) return showError(result.error?.message || c.googleFailed); if (!result.redirecting) await mount(mountHost); });
  container.querySelector("#ownerResetPassword").addEventListener("click", async () => { if (!email.value.trim()) { showError(c.enterEmail); email.focus(); return; } setBusy(true); const result = await CloudSync.resetPassword(email.value.trim()); setBusy(false); status.innerHTML = result.ok ? `<p class="setup-status__text">${c.resetSent}</p>` : `<p class="setup-status__text setup-status__text--warn">${escapeHtml(result.error?.message || c.resetFailed)}</p>`; });
}

function renderAcademicSummary(c) {
  const profile = AcademicProfile.get(); const system = GradingEngine.getActive(); const summary = AcademicState.cumulativeSummary(system); const semesterCount = AcademicState.semesterSummaries(system).length; const score = summary.gpa == null ? "—" : summary.gpa.toFixed(2); const sync = Storage.get("academicCloudSyncStatus:v1", null);
  const storageLabel = sync?.status === "synced" ? (sync.destination === "firebase" ? "Firebase" : "D1") : sync?.status === "failed" ? c.syncRetrying : c.localPending;
  return `<div class="tool-card tool-card--wide account-summary"><h2>${c.account}</h2><div class="account-profile-line"><span class="account-avatar">${escapeHtml(String(profile?.university || "A").slice(0, 1))}</span><div><strong>${escapeHtml(profile?.university || c.academicProfile)}</strong><small>${escapeHtml(profile?.countryName || c.countryUnset)} · ${escapeHtml(profile?.college || c.collegeUnset)}</small></div></div><h3>${c.academicCase}</h3><div class="dash-grid"><div class="dash-stat"><span class="dash-stat__label">${c.currentGpa}</span><strong class="dash-stat__value">${score}</strong><small>${c.of} ${summary.maxGpa}</small></div><div class="dash-stat"><span class="dash-stat__label">${c.credits}</span><strong class="dash-stat__value">${summary.gpaCredits}</strong></div><div class="dash-stat"><span class="dash-stat__label">${c.gpaCourses}</span><strong class="dash-stat__value">${summary.gradedCourses}</strong></div><div class="dash-stat"><span class="dash-stat__label">${c.semesters}</span><strong class="dash-stat__value">${semesterCount}</strong></div><div class="dash-stat"><span class="dash-stat__label">${c.allCourses}</span><strong class="dash-stat__value">${summary.totalCourses}</strong></div><div class="dash-stat"><span class="dash-stat__label">${c.storage}</span><strong class="dash-stat__value">${storageLabel}</strong></div></div><details class="account-data-controls"><summary>${c.localData}</summary><div class="row-actions"><button class="btn btn--ghost" id="exportFreeData" type="button">${c.exportData}</button><button class="btn btn--text danger-text" id="deleteFreeData" type="button">${c.deleteData}</button></div><div id="freeDataStatus" class="setup-status" aria-live="polite"></div></details></div>`;
}

function downloadJson(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function wireFreeDataControls(container, c) {
  const status = container.querySelector("#freeDataStatus");
  container.querySelector("#exportFreeData")?.addEventListener("click", async () => {
    const result = await CloudSync.freeDataAction("export_free", AcademicProfile.installId());
    if (!result.ok) { status.innerHTML = `<p class="setup-status__text setup-status__text--warn">${escapeHtml(result.error || c.dataFailed)}</p>`; return; }
    downloadJson("instantgpa-free-data.json", { ...result.data, localBrowserData: Storage.exportAll() });
    status.innerHTML = `<p class="setup-status__text">${c.exported}</p>`;
  });
  container.querySelector("#deleteFreeData")?.addEventListener("click", async () => {
    if (!confirm(c.deleteFreeConfirm)) return;
    const result = await CloudSync.freeDataAction("delete_free", AcademicProfile.installId());
    if (!result.ok) { status.innerHTML = `<p class="setup-status__text setup-status__text--warn">${escapeHtml(result.error || c.dataFailed)}</p>`; return; }
    Storage.clearAll(); location.replace("/");
  });
}

async function renderSignedIn(container, session, c) {
  const params = new URLSearchParams(location.search); const billingPeriod = params.get("billing") === "annual" ? "annual" : "monthly"; const returnedSubscriptionId = params.get("subscription_id"); let returnMessage = "";
  if (params.get("paypal") === "success" && returnedSubscriptionId) { track("checkout_returned", { billing_period: billingPeriod, status: "approved" }); const confirmed = await CloudSync.confirmPayPalSubscription(returnedSubscriptionId); returnMessage = confirmed.ok ? (confirmed.data?.entitlement?.status === "active" ? c.paymentConfirmed : c.approvalPending) : confirmed.error || c.confirmFailed; if (confirmed.ok && confirmed.data?.entitlement?.status === "active") { track("checkout_completed", { billing_period: billingPeriod }); track("premium_activated", { source: "paypal" }); } history.replaceState({}, "", "/account"); }
  await CloudSync.refreshUser(); const statusResult = await CloudSync.getAccountStatus(); const entitlement = statusResult.ok ? statusResult.data.entitlement : null; const usage = statusResult.ok ? statusResult.data.usage : null; const emailDelivery = statusResult.ok ? statusResult.data.emailDelivery : null; const isOwner = Boolean(statusResult.ok && statusResult.data.isOwner); const planActive = entitlement?.status === "active"; const verified = Boolean(session.user.emailVerified); const welcomeDelivered = ["sent", "delivered"].includes(String(emailDelivery?.status || "").toLowerCase());
  container.removeAttribute("aria-busy");
  container.innerHTML = `<h2>${c.account}</h2><p class="tool-sub">${c.signedInAs} <strong>${escapeHtml(session.user.email || session.user.displayName || c.firebaseUser)}</strong></p>
    <section class="subscription-summary ${planActive ? "is-active" : ""}" aria-label="InstantGPA Premium"><div><span class="dash-stat__label">${c.premium}</span><strong>${escapeHtml(planActive ? entitlement.plan : c.paymentInactive)}</strong></div><div><span class="dash-stat__label">${c.status}</span><strong>${escapeHtml(planActive ? c.active : entitlement?.status || c.pending)}</strong></div><div><span class="dash-stat__label">${c.monthlyPages}</span><strong>${usage ? `${usage.pagesConsumed} / ${entitlement.monthlyPageLimit}` : "—"}</strong></div><div><span class="dash-stat__label">${c.remaining}</span><strong>${usage ? usage.pagesRemaining : "—"}</strong></div></section>
    ${returnMessage ? `<p class="result-note ${planActive ? "" : "result-note--muted"}">${escapeHtml(returnMessage)}</p>` : ""}${verified ? "" : `<p class="result-note result-note--warn"><strong>${c.verifyTitle}</strong> ${c.verifyBody}</p>`}
    <section class="tool-card account-activation-steps"><h3>${c.stepsTitle}</h3><ol><li>${c.stepIdentity} — <strong>${c.complete}</strong></li><li>${c.stepVerify} — <strong>${verified ? c.complete : c.waiting}</strong></li><li>${c.stepPayment} — <strong>${planActive ? c.complete : c.waiting}</strong></li><li>${c.stepWelcome} — <strong>${welcomeDelivered ? c.delivered : c.queued}</strong></li></ol></section>
    <section class="account-pro-summary"><div><span class="section-kicker">${c.subscriberTools}</span><h3>${c.twin}</h3><p>${c.toolsBody}</p></div>${planActive ? `<a class="btn btn--primary" href="/pro-workspace">${c.openPremium}</a>` : verified ? `<button class="btn btn--primary" type="button" id="startPayPalCheckout">${c.subscribe} · ${billingPeriod === "annual" ? c.annual : c.monthly}</button>` : `<button class="btn btn--ghost" type="button" id="resendVerification">${c.resend}</button>`}</section>
    <section class="account-offer-card"><div><h3>${isOwner ? c.ownerAccess : planActive ? c.paidActive : c.completePayment}</h3><p>${isOwner ? c.ownerBody : planActive ? c.activeBody : c.payBody}</p></div>${isOwner || planActive ? "" : `<a class="btn btn--ghost" href="/pricing">${c.reviewPrice}</a>`}</section>
    <details class="account-data-controls"><summary>${c.premiumData}</summary><div class="row-actions"><button class="btn btn--ghost" id="exportPremiumData" type="button">${c.exportData}</button><button class="btn btn--text danger-text" id="deletePremiumData" type="button">${c.deleteData}</button></div></details>
    <div class="row-actions"><a class="btn btn--primary" href="/dashboard">${c.openCenter}</a>${isOwner ? `<a class="btn btn--primary" href="/admin">${c.openOwner}</a>` : ""}${planActive && entitlement?.source === "paypal" ? `<button type="button" class="btn btn--text danger-text" id="cancelPayPalSubscription">${c.cancel}</button>` : ""}<button type="button" class="btn btn--text" id="acctSignOut">${c.signOut}</button></div><div id="acctStatus" class="setup-status" aria-live="polite"></div>`;
  container.querySelector("#acctSignOut").addEventListener("click", async () => { await CloudSync.signOut(); mount(container.parentElement); });
  container.querySelector("#startPayPalCheckout")?.addEventListener("click", async (event) => { const status = container.querySelector("#acctStatus"); event.currentTarget.disabled = true; track("checkout_started", { billing_period: billingPeriod, stage: "paypal_redirect" }); status.innerHTML = `<p class="setup-status__text">${c.opening}</p>`; const result = await CloudSync.startPremiumCheckout(billingPeriod); if (result.ok && result.data?.checkoutUrl) location.assign(result.data.checkoutUrl); else { event.currentTarget.disabled = false; status.innerHTML = `<p class="setup-status__text setup-status__text--warn">${escapeHtml(result.error || c.checkoutMissing)}</p>`; } });
  container.querySelector("#resendVerification")?.addEventListener("click", async (event) => { event.currentTarget.disabled = true; const result = await CloudSync.resendVerificationEmail(); event.currentTarget.disabled = false; container.querySelector("#acctStatus").innerHTML = result.ok ? `<p class="setup-status__text">${c.verificationSent}</p>` : `<p class="setup-status__text setup-status__text--warn">${escapeHtml(result.error?.message || c.verificationFailed)}</p>`; });
  container.querySelector("#cancelPayPalSubscription")?.addEventListener("click", async (event) => { if (!confirm(c.cancelConfirm)) return; event.currentTarget.disabled = true; const result = await CloudSync.cancelPayPalSubscription(); if (result.ok) await mount(container.parentElement); else { event.currentTarget.disabled = false; container.querySelector("#acctStatus").innerHTML = `<p class="setup-status__text setup-status__text--warn">${escapeHtml(result.error || c.cancelFailed)}</p>`; } });
  container.querySelector("#exportPremiumData")?.addEventListener("click", async () => { const result = await CloudSync.exportPremiumData(); if (result.ok) { downloadJson("instantgpa-premium-data.json", { ...result.data, localBrowserData: Storage.exportAll() }); container.querySelector("#acctStatus").innerHTML = `<p class="setup-status__text">${c.exported}</p>`; } else container.querySelector("#acctStatus").innerHTML = `<p class="setup-status__text setup-status__text--warn">${escapeHtml(result.error || c.dataFailed)}</p>`; });
  container.querySelector("#deletePremiumData")?.addEventListener("click", async () => { if (!confirm(c.deletePremiumConfirm)) return; const result = await CloudSync.deletePremiumData(); if (!result.ok) { container.querySelector("#acctStatus").innerHTML = `<p class="setup-status__text setup-status__text--warn">${escapeHtml(result.error || c.dataFailed)}</p>`; return; } const identity = await CloudSync.deleteCurrentFirebaseUser(); Storage.clearAll(); if (identity.ok) location.replace("/"); else container.querySelector("#acctStatus").innerHTML = `<p class="setup-status__text setup-status__text--warn">${escapeHtml(`${c.deleted} Sign in again recently to delete the remaining Firebase login identity.`)}</p>`; });
}
