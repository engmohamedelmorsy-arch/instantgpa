// Firebase is loaded only when account or subscriber features are opened.
// Authentication verifies identity; Firestore stores each paid subscriber's
// academic record and private Pro workspace under that Firebase uid.

const SDK_VERSION = "11.10.0";
let servicesPromise = null;

function notifyAuthChanged() {
  window.dispatchEvent(new CustomEvent("instantgpa:auth-changed"));
}

export function isConfigured() {
  const config = window.INSTANTGPA_FIREBASE;
  return Boolean(config?.apiKey && config?.projectId && config?.authDomain);
}

async function services() {
  if (!isConfigured()) throw new Error("Firebase is not configured.");
  if (!servicesPromise) {
    servicesPromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`),
      window.INSTANTGPA_FIREBASE.appCheckSiteKey
        ? import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-check.js`)
        : Promise.resolve(null),
    ]).then(async ([appSdk, authSdk, firestoreSdk, appCheckSdk]) => {
      const app = appSdk.getApps().length
        ? appSdk.getApp()
        : appSdk.initializeApp(window.INSTANTGPA_FIREBASE);
      const auth = authSdk.getAuth(app);
      const firestore = firestoreSdk.getFirestore(app);
      auth.languageCode = document.documentElement.lang || "en";
      await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
      let appCheck = null;
      if (appCheckSdk && window.INSTANTGPA_FIREBASE.appCheckSiteKey) {
        appCheck = appCheckSdk.initializeAppCheck(app, {
          provider: new appCheckSdk.ReCaptchaEnterpriseProvider(
            window.INSTANTGPA_FIREBASE.appCheckSiteKey,
          ),
          isTokenAutoRefreshEnabled: true,
        });
      }
      return { app, auth, authSdk, firestore, firestoreSdk, appCheck, appCheckSdk };
    });
  }
  return servicesPromise;
}

async function currentUser() {
  const { auth } = await services();
  await auth.authStateReady();
  return auth.currentUser;
}

export const CloudSync = {
  isConfigured,

  async getSession() {
    try {
      const user = await currentUser();
      return { ok: true, session: user ? { user } : null };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async getSiteConfig() {
    try {
      const response = await fetch("/api/site-config", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      return response.ok ? { ok: true, data } : { ok: false, reason: data.code || "config_error", error: data.error };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async signUp(email, password, { purpose = "" } = {}) {
    try {
      const config = await this.getSiteConfig();
      if (config.ok && (config.data.registration === "closed" || (config.data.registration === "checkout_only" && purpose !== "premium_checkout"))) {
        return { ok: false, reason: "registration_closed", error: { code: "registration-closed", message: "New registration is temporarily paused." } };
      }
      const { auth, authSdk } = await services();
      const result = await authSdk.createUserWithEmailAndPassword(auth, email, password);
      await authSdk.sendEmailVerification(result.user, { url: `${location.origin}/account?subscribe=1` });
      notifyAuthChanged();
      return { ok: true, user: result.user, needsVerification: true };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async signIn(email, password) {
    try {
      const { auth, authSdk } = await services();
      const result = await authSdk.signInWithEmailAndPassword(auth, email, password);
      notifyAuthChanged();
      return { ok: true, session: { user: result.user } };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async signInWithGoogle() {
    try {
      const { auth, authSdk } = await services();
      const provider = new authSdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await authSdk.signInWithPopup(auth, provider);
      notifyAuthChanged();
      return { ok: true, session: { user: result.user } };
    } catch (error) {
      const redirectCodes = new Set([
        "auth/internal-error",
        "auth/operation-not-supported-in-this-environment",
        "auth/popup-blocked",
        "auth/web-storage-unsupported",
      ]);
      if (redirectCodes.has(error?.code) && window.top === window.self) {
        try {
          const { auth, authSdk } = await services();
          const provider = new authSdk.GoogleAuthProvider();
          provider.setCustomParameters({ prompt: "select_account" });
          await authSdk.signInWithRedirect(auth, provider);
          return { ok: true, redirecting: true };
        } catch (redirectError) {
          return { ok: false, reason: "error", error: redirectError };
        }
      }
      return { ok: false, reason: "error", error };
    }
  },

  async completeRedirectSignIn() {
    try {
      const { auth, authSdk } = await services();
      const result = await authSdk.getRedirectResult(auth);
      if (result?.user) notifyAuthChanged();
      return { ok: true, session: result?.user ? { user: result.user } : null };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async resetPassword(email) {
    try {
      const { auth, authSdk } = await services();
      await authSdk.sendPasswordResetEmail(auth, email);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async resendVerificationEmail() {
    try {
      const { authSdk } = await services();
      const user = await currentUser();
      if (!user) return { ok: false, reason: "signed_out", error: { message: "Sign in first." } };
      await authSdk.sendEmailVerification(user, { url: `${location.origin}/account?subscribe=1` });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async refreshUser() {
    try {
      const user = await currentUser();
      if (!user) return { ok: false, reason: "signed_out" };
      await user.reload();
      return { ok: true, user };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async signOut() {
    try {
      const { auth, authSdk } = await services();
      await authSdk.signOut(auth);
      notifyAuthChanged();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async getRequestCredentials() {
    const { appCheck, appCheckSdk } = await services();
    const user = await currentUser();
    if (!user) return { ok: false, reason: "signed_out" };
    const idToken = await user.getIdToken();
    let appCheckToken = "";
    if (appCheck && appCheckSdk) {
      const result = await appCheckSdk.getToken(appCheck, false);
      appCheckToken = result.token;
    }
    return { ok: true, idToken, appCheckToken };
  },

  async getAccountStatus() {
    try {
      const credentials = await this.getRequestCredentials();
      if (!credentials.ok) return credentials;
      const headers = { authorization: `Bearer ${credentials.idToken}` };
      if (credentials.appCheckToken) {
        headers["x-firebase-appcheck"] = credentials.appCheckToken;
      }
      const response = await fetch("/api/account/status", {
        headers,
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      return response.ok
        ? { ok: true, data }
        : { ok: false, reason: data.code || "status_error", error: data.error };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async authenticatedRequest(path, options = {}) {
    try {
      const credentials = await this.getRequestCredentials();
      if (!credentials.ok) return credentials;
      const headers = {
        ...(options.headers || {}),
        authorization: `Bearer ${credentials.idToken}`,
        "x-instantgpa-request": "account-management",
      };
      if (credentials.appCheckToken) headers["x-firebase-appcheck"] = credentials.appCheckToken;
      const response = await fetch(path, { ...options, headers, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      return response.ok
        ? { ok: true, data }
        : { ok: false, reason: data.code || "request_error", error: data.error || "Request failed." };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  },

  async getAdminOverview() {
    return this.authenticatedRequest("/api/admin");
  },

  async getProductAnalytics() {
    return this.authenticatedRequest("/api/admin/analytics");
  },

  async getAdminCatalogs(status = "pending_review") {
    return this.authenticatedRequest(`/api/admin/catalogs?status=${encodeURIComponent(status)}`);
  },

  async importOfficialCatalog(payload) {
    return this.authenticatedRequest("/api/admin/catalogs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "import", ...payload }),
    });
  },

  async reviewOfficialCatalog(sourceId, decision) {
    return this.authenticatedRequest("/api/admin/catalogs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "review", sourceId, decision }),
    });
  },

  async adminAction(payload) {
    return this.authenticatedRequest("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async startPremiumCheckout(billingPeriod = "monthly") {
    return this.authenticatedRequest("/api/subscription/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locale: document.documentElement.lang || "en-US",
        billingPeriod: billingPeriod === "annual" ? "annual" : "monthly",
      }),
    });
  },

  async confirmPayPalSubscription(subscriptionId) {
    return this.authenticatedRequest("/api/subscription/paypal/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscriptionId }),
    });
  },

  async cancelPayPalSubscription() {
    return this.authenticatedRequest("/api/subscription/paypal/cancel", { method: "POST" });
  },

  async exportPremiumData() {
    return this.authenticatedRequest("/api/account/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "export_premium" }) });
  },

  async deletePremiumData() {
    return this.authenticatedRequest("/api/account/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete_premium", confirmation: "DELETE" }) });
  },

  async freeDataAction(action, installId) {
    try {
      const response = await fetch("/api/account/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, installId, confirmation: action === "delete_free" ? "DELETE" : undefined }) });
      const data = await response.json().catch(() => ({}));
      return response.ok ? { ok: true, data } : { ok: false, reason: data.code || "request_error", error: data.error || "Request failed." };
    } catch (error) { return { ok: false, reason: "error", error }; }
  },

  async deleteCurrentFirebaseUser() {
    try {
      const user = await currentUser();
      if (!user) return { ok: false, reason: "signed_out" };
      const { authSdk } = await services();
      await authSdk.deleteUser(user);
      notifyAuthChanged();
      return { ok: true };
    } catch (error) { return { ok: false, reason: error?.code || "error", error }; }
  },

  async createReportShare(payload) {
    return this.authenticatedRequest("/api/report-shares", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async listReportShares() {
    return this.authenticatedRequest("/api/report-shares");
  },

  async revokeReportShare(id) {
    return this.authenticatedRequest("/api/report-shares", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  },

  async loadProWorkspace() {
    try {
      const status = await this.getAccountStatus();
      if (!status.ok || !(status.data?.isOwner || status.data?.entitlement?.status === "active")) {
        return { ok: false, reason: status.reason || "SUBSCRIPTION_REQUIRED", error: "A paid Premium subscription is required." };
      }
      const user = await currentUser();
      const { firestore, firestoreSdk } = await services();
      const reference = firestoreSdk.doc(firestore, "premiumUsers", user.uid, "workspace", "current");
      const stored = await firestoreSdk.getDoc(reference);
      const data = stored.exists() ? stored.data() : {};
      return { ok: true, data: { workspace: data.workspace || {}, version: Number(data.version) || 0 } };
    } catch (error) {
      return { ok: false, reason: "FIRESTORE_UNAVAILABLE", error: error?.message || "The Firebase workspace is unavailable." };
    }
  },

  async saveProWorkspace(workspace, expectedVersion = null) {
    try {
      const status = await this.getAccountStatus();
      if (!status.ok || !(status.data?.isOwner || status.data?.entitlement?.status === "active")) {
        return { ok: false, reason: status.reason || "SUBSCRIPTION_REQUIRED", error: "A paid Premium subscription is required." };
      }
      const user = await currentUser();
      const { firestore, firestoreSdk } = await services();
      const reference = firestoreSdk.doc(firestore, "premiumUsers", user.uid, "workspace", "current");
      const version = await firestoreSdk.runTransaction(firestore, async (transaction) => {
        const existing = await transaction.get(reference);
        const currentVersion = existing.exists() ? Number(existing.data().version) || 0 : 0;
        if (expectedVersion != null && Number(expectedVersion) !== currentVersion) {
          const conflict = new Error("This workspace changed in another session. Refresh before saving again.");
          conflict.code = "WORKSPACE_VERSION_CONFLICT";
          throw conflict;
        }
        const nextVersion = currentVersion + 1;
        transaction.set(reference, {
          workspace,
          version: nextVersion,
          updatedAt: firestoreSdk.serverTimestamp(),
        });
        return nextVersion;
      });
      return { ok: true, data: { version } };
    } catch (error) {
      if (error?.code === "WORKSPACE_VERSION_CONFLICT") {
        return { ok: false, reason: error.code, error: error.message };
      }
      return { ok: false, reason: "FIRESTORE_UNAVAILABLE", error: error?.message || "The Firebase workspace could not be saved." };
    }
  },

  async savePremiumAcademicRecord(snapshot) {
    try {
      const status = await this.getAccountStatus();
      if (!status.ok || !(status.data?.isOwner || status.data?.entitlement?.status === "active")) {
        return { ok: false, reason: status.reason || "SUBSCRIPTION_REQUIRED", error: "A paid Premium subscription is required." };
      }
      const user = await currentUser();
      const { firestore, firestoreSdk } = await services();
      const reference = firestoreSdk.doc(firestore, "premiumUsers", user.uid, "academic", "current");
      await firestoreSdk.setDoc(reference, {
        snapshot,
        updatedAt: firestoreSdk.serverTimestamp(),
      });
      return { ok: true, data: { owner: "firebase", courseCount: snapshot?.record?.courses?.length || 0 } };
    } catch (error) {
      return { ok: false, reason: "FIRESTORE_UNAVAILABLE", error: error?.message || "The Firebase academic record could not be saved." };
    }
  },

  async loadPremiumAcademicRecord() {
    try {
      const status = await this.getAccountStatus();
      if (!status.ok || !(status.data?.isOwner || status.data?.entitlement?.status === "active")) {
        return { ok: false, reason: status.reason || "SUBSCRIPTION_REQUIRED", error: "A paid Premium subscription is required." };
      }
      const user = await currentUser();
      const { firestore, firestoreSdk } = await services();
      const reference = firestoreSdk.doc(firestore, "premiumUsers", user.uid, "academic", "current");
      const stored = await firestoreSdk.getDoc(reference);
      return { ok: true, data: { snapshot: stored.exists() ? stored.data()?.snapshot || null : null } };
    } catch (error) {
      return { ok: false, reason: "FIRESTORE_UNAVAILABLE", error: error?.message || "The Firebase academic record could not be loaded." };
    }
  },

  async runProAnalysis(action, payload = {}) {
    return this.authenticatedRequest("/api/pro/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
  },

  async getProPolicies(query = "") {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    return this.authenticatedRequest(`/api/pro/policies${params.size ? `?${params}` : ""}`);
  },

  async getApprovedCatalog(context = {}) {
    const params = new URLSearchParams();
    for (const key of ["institution", "countryCode", "college", "department", "program", "catalogYear"]) {
      if (context[key]) params.set(key, context[key]);
    }
    return this.authenticatedRequest(`/api/pro/catalogs?${params}`);
  },

  async listInstitutionKeys() {
    return this.authenticatedRequest("/api/pro/institution/keys");
  },

  async createInstitutionKey(name) {
    return this.authenticatedRequest("/api/pro/institution/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  },

  async revokeInstitutionKey(id) {
    return this.authenticatedRequest("/api/pro/institution/keys", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  },

  async runInstitutionBatch(action, records) {
    return this.authenticatedRequest("/api/pro/institution/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, records }),
    });
  },
};
