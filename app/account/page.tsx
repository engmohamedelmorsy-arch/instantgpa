import type { Metadata } from "next";
import Link from "next/link";
import FirebaseAccountLoader from "./firebase-account-loader";

export const metadata: Metadata = {
  title: "Premium account | InstantGPA",
  description: "Sign in to paid InstantGPA Premium, start PayPal checkout, or open the private owner dashboard.",
  robots: { index: false, follow: false },
};

const OWNER_EMAIL = "eng.mohamedelmorsy@gmail.com";

export default function AccountPage() {
  return (
    <main className="auth-page" data-owner-email={OWNER_EMAIL}>
      <header className="auth-header">
        <Link className="auth-brand" href="/" aria-label="InstantGPA home">
          <span className="auth-brand-mark" aria-hidden="true">iG</span>
          <span>InstantGPA</span>
        </Link>
        <div className="auth-header-actions">
          <button className="auth-language" type="button" data-account-language="en" aria-pressed="true">English</button>
          <button className="auth-language" type="button" data-account-language="ar" aria-pressed="false">العربية</button>
          <Link className="auth-back" href="/"><span data-en="Back to calculator" data-ar="العودة إلى الحاسبة">Back to calculator</span></Link>
        </div>
      </header>

      <section className="auth-main" aria-labelledby="auth-title">
        <div className="auth-copy">
          <span className="auth-eyebrow" data-en="InstantGPA account" data-ar="حساب InstantGPA">InstantGPA account</span>
          <h1 id="auth-title" data-en="Sign in. Pick up where you left off." data-ar="سجل الدخول وتابع من حيث توقفت.">Sign in. Pick up where you left off.</h1>
          <p data-en="Sign in to paid Premium, or create a checkout identity before approving the subscription securely with PayPal or an eligible card." data-ar="سجل الدخول إلى Premium المدفوع، أو أنشئ هوية للدفع ثم وافق على الاشتراك بأمان عبر PayPal أو بطاقة مؤهلة.">
            Sign in to paid Premium, or create a checkout identity before
            approving the subscription securely with PayPal or an eligible card.
          </p>
          <ul className="auth-benefits" aria-label="Account benefits">
            <li><span aria-hidden="true">✓</span> <span data-en="Existing Premium and owner access" data-ar="دخول المشترك الحالي والمالك">Existing Premium and owner access</span></li>
            <li><span aria-hidden="true">✓</span> <span data-en="Identity and verification by Firebase" data-ar="الهوية ورسالة التحقق من Firebase">Identity and verification by Firebase</span></li>
            <li><span aria-hidden="true">✓</span> <span data-en="All identifiable Premium data stored privately in Firebase" data-ar="كل بيانات Premium المرتبطة بالهوية محفوظة بصورة خاصة في Firebase">All identifiable Premium data stored privately in Firebase</span></li>
          </ul>
        </div>

        <div className="auth-card" id="firebaseAccountCard" aria-busy="true">
          <div className="auth-card-icon" aria-hidden="true">iG</div>

          <div id="firebaseSignedOut">
            <span className="auth-status" data-en="Secure access" data-ar="دخول آمن">Secure access</span>
            <h2 data-en="Sign in to InstantGPA" data-ar="تسجيل الدخول إلى InstantGPA">Sign in to InstantGPA</h2>
            <p data-en="Sign in to an existing paid Premium or Owner account." data-ar="سجل الدخول إلى حساب Premium مدفوع أو حساب المالك.">Sign in to an existing paid Premium or Owner account.</p>

            <button className="auth-google" id="firebaseGoogleSignIn" type="button" hidden>
              <span className="auth-google-mark" aria-hidden="true">G</span>
              <span data-en="Continue with Google" data-ar="المتابعة باستخدام Google">Continue with Google</span>
            </button>

            <div className="auth-divider"><span data-en="or use email" data-ar="أو استخدم البريد">or use email</span></div>

            <form className="auth-form" id="firebaseEmailForm">
              <label htmlFor="firebaseEmail" data-en="Email" data-ar="البريد الإلكتروني">Email</label>
              <input
                id="firebaseEmail"
                name="email"
                type="email"
                autoComplete="username"
                required
              />
              <label htmlFor="firebasePassword" data-en="Password" data-ar="كلمة المرور">Password</label>
              <input
                id="firebasePassword"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              <button className="auth-primary" type="submit" data-en="Sign in" data-ar="تسجيل الدخول">Sign in</button>
              <button className="auth-secondary" id="firebaseCreateAccount" type="button" hidden data-en="Create checkout account" data-ar="إنشاء حساب للدفع">Create checkout account</button>
            </form>

            <button className="auth-text-button" id="firebaseResetPassword" type="button">
              <span data-en="Reset password" data-ar="إعادة تعيين كلمة المرور">Reset password</span>
            </button>
            <p className="auth-note" data-en="Account creation is offered only from the paid checkout path. Premium activates after PayPal confirmation." data-ar="يتاح إنشاء الحساب من مسار الدفع فقط، ويتفعّل Premium بعد تأكيد PayPal.">
              Account creation is offered only from the paid checkout path. Premium activates after PayPal confirmation.
            </p>
          </div>

          <div id="firebaseSignedIn" hidden>
            <span className="auth-status auth-status--success" id="firebaseAccountStatus">
              Verified owner
            </span>
            <h2 id="firebaseAccountHeading">Premium is unlocked</h2>
            <p className="auth-signed-email">
              Signed in as <strong id="firebaseAccountEmail"></strong>
            </p>
            <div className="auth-actions" id="firebasePremiumActions" hidden>
              <Link className="auth-primary" href="/pro-workspace"><span data-en="Open Premium workspace" data-ar="فتح مساحة Premium">Open Premium workspace</span></Link>
              <Link className="auth-secondary" id="firebaseAdminLink" href="/admin" hidden><span data-en="Open owner dashboard" data-ar="فتح لوحة المالك">Open owner dashboard</span></Link>
            </div>
            <p className="auth-note" id="firebaseNonOwnerNote" hidden>
              <span data-en="This account does not have an active InstantGPA Premium subscription yet." data-ar="لا يملك هذا الحساب اشتراك Premium فعالًا حتى الآن.">This account does not have an active InstantGPA Premium subscription yet.</span>
            </p>
            <div className="auth-actions" id="firebaseSubscribeActions" hidden>
              <button className="auth-primary" id="firebaseStartCheckout" type="button" data-en="Pay with PayPal or card" data-ar="الدفع عبر PayPal أو البطاقة">Pay with PayPal or card</button>
              <Link className="auth-secondary" href="/pricing"><span data-en="Review price" data-ar="مراجعة السعر">Review price</span></Link>
              <Link className="auth-secondary" href="/transcript-gpa-calculator"><span data-en="Continue with Free" data-ar="المتابعة مجانًا">Continue with Free</span></Link>
            </div>
            <button className="auth-text-button" id="firebaseSignOut" type="button" data-en="Sign out" data-ar="تسجيل الخروج">Sign out</button>
          </div>

          <div className="auth-feedback" id="firebaseAuthFeedback" role="status" aria-live="polite">
            <span data-en="Loading secure sign-in…" data-ar="جارٍ تحميل تسجيل الدخول الآمن…">Loading secure sign-in…</span>
          </div>
        </div>
      </section>

      <footer className="auth-footer">
        <span data-en="Calculations run in your browser; storage follows your Free or Premium tier." data-ar="تعمل الحسابات في متصفحك ويعتمد التخزين على نوع المجاني أو Premium.">Calculations run in your browser; storage follows your Free or Premium tier.</span>
        <nav aria-label="Account footer">
          <a href="/privacy.html"><span data-en="Privacy" data-ar="الخصوصية">Privacy</span></a>
          <a href="/terms.html"><span data-en="Terms" data-ar="الشروط">Terms</span></a>
          <Link href="/trust"><span data-en="Trust & methodology" data-ar="الثقة والمنهجية">Trust &amp; methodology</span></Link>
        </nav>
      </footer>

      <FirebaseAccountLoader />
    </main>
  );
}
