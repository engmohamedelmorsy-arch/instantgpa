// trial-banner.js
// Optional, dismissible plan notice. Actual Pro authorization is enforced by
// server-side entitlement checks; this component never grants access.

import { Storage } from "./storage.js";
import { t } from "./localization.js";

const DISMISS_KEY = "trialBannerDismissed";

export const PRO_TOOL_NAMES_KEY = "tools.trial.proToolNames"; // translation key, see below

export function mount(host) {
  if (Storage.get(DISMISS_KEY, false)) return;

  host.innerHTML = `
    <div class="trial-banner" role="status">
      <p>${t("trial.message")}</p>
      <button type="button" class="trial-banner__close" aria-label="${t("common.close")}">✕</button>
    </div>`;

  host.querySelector(".trial-banner__close").addEventListener("click", () => {
    Storage.set(DISMISS_KEY, true);
    host.innerHTML = "";
  });
}
