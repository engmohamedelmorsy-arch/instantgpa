let installPrompt = null;
let registrationPromise = null;

if ("serviceWorker" in navigator) {
  registrationPromise = navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
    .then((registration) => {
      // Browsers only re-check the service worker file periodically (up to
      // ~24h). Force an eager check on every load so a new deploy reaches
      // returning visitors immediately instead of waiting on that timer.
      registration?.update().catch(() => {});
      return registration;
    })
    .catch(() => null);

  // A new service worker takes control only after activating. When that
  // happens, reload once so the visitor gets the fresh assets automatically
  // instead of silently keeping the stale cached page open.
  const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // The first installed worker also fires controllerchange. Reloading in
    // that case can erase an in-progress transcript review, so only refresh
    // pages that were already controlled by an older worker at load time.
    if (!hadControllerAtLoad || reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  window.dispatchEvent(new CustomEvent("instantgpa:pwa-installable"));
});

async function install() {
  if (!installPrompt) return { ok: false, reason: "not_available" };
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  installPrompt = null;
  return { ok: choice.outcome === "accepted", outcome: choice.outcome };
}

function upcomingCount(items) {
  const now = Date.now();
  const horizon = now + 7 * 24 * 60 * 60 * 1_000;
  return (Array.isArray(items) ? items : []).filter((item) => {
    const due = new Date(item?.dueDate || "").getTime();
    return Number.isFinite(due) && due >= now && due <= horizon && (item?.score === "" || item?.score == null);
  }).length;
}

function upcomingItems(items) {
  const now = Date.now();
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const due = new Date(item?.dueDate || "");
    if (Number.isNaN(due.getTime()) || due.getTime() < now || (item?.score !== "" && item?.score != null)) return [];
    return [{
      title: String(item?.label || "Assessment").slice(0, 100),
      course: String(item?.courseName || "").slice(0, 100),
      dueAt: due.toISOString(),
    }];
  }).sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt)).slice(0, 25);
}

async function enableReminders(items, notifyNow = false) {
  if (!registrationPromise || !("Notification" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission };
  const registration = await registrationPromise;
  if (!registration) return { ok: false, reason: "registration_failed" };
  const dueCount = upcomingCount(items);
  const deadlines = upcomingItems(items);
  (registration.active || registration.waiting || registration.installing)?.postMessage({
    type: "SYNC_PRO_DUE_COUNT",
    dueCount,
    deadlines,
    language: document.documentElement.lang === "ar" ? "ar" : "en",
    notifyNow,
  });
  if ("setAppBadge" in navigator) {
    try {
      if (dueCount) await navigator.setAppBadge(dueCount);
      else await navigator.clearAppBadge();
    } catch { /* device policy */ }
  }
  if ("periodicSync" in registration) {
    try {
      await registration.periodicSync.register("instantgpa-pro-deadlines", {
        minInterval: 12 * 60 * 60 * 1_000,
      });
    } catch {
      /* Browser support and permission vary. Visit-time checks remain active. */
    }
  }
  return { ok: true, dueCount, deadlines, background: "periodicSync" in registration };
}

window.InstantGPAPWA = {
  install,
  enableReminders,
  isInstallable: () => Boolean(installPrompt),
  isInstalled: () => window.matchMedia("(display-mode: standalone)").matches,
};

window.dispatchEvent(new CustomEvent("instantgpa:pwa-ready"));
