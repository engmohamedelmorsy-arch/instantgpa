"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    INSTANTGPA_FIREBASE?: Record<string, unknown>;
  }
}

export default function FirebaseAccountLoader() {
  useEffect(() => {
    let cancelled = false;
    let configScript: HTMLScriptElement | null = null;
    let accountScript: HTMLScriptElement | null = null;

    const loadAccount = () => {
      if (cancelled || document.querySelector('script[data-instantgpa-account="true"]')) return;
      accountScript = document.createElement("script");
      accountScript.type = "module";
      accountScript.src = "/assets/firebase-account-page.js";
      accountScript.dataset.instantgpaAccount = "true";
      document.body.appendChild(accountScript);
    };

    if (window.INSTANTGPA_FIREBASE) {
      loadAccount();
    } else {
      configScript = document.createElement("script");
      configScript.src = "/firebase-config.js";
      configScript.dataset.instantgpaFirebaseConfig = "true";
      configScript.addEventListener("load", loadAccount, { once: true });
      document.body.appendChild(configScript);
    }

    return () => {
      cancelled = true;
      configScript?.removeEventListener("load", loadAccount);
    };
  }, []);

  return null;
}
