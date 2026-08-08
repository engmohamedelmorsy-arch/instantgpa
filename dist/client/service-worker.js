const CACHE_NAME = "instantgpa-shell-v67-calendar-widget";
const REMINDER_REQUEST = "/__instantgpa-pro-reminder-state";
const PUBLIC_SHELL = [
  "/",
  "/assets/app-bundle.css",
  "/assets/icons/favicon.svg",
  "/assets/app.js",
  "/assets/academic-command-center.js",
  "/assets/localization.js",
  "/assets/pwa.js",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PUBLIC_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === REMINDER_REQUEST
  ) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/");
        return cached || new Response(
          "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width\"><title>InstantGPA offline</title></head><body><main><h1>InstantGPA is offline</h1><p>Reconnect to open private academic data. Previously loaded public assets remain available.</p></main></body></html>",
          { headers: { "content-type": "text/html;charset=utf-8" } },
        );
      }),
    );
    return;
  }
  if (/\.(?:css|js|webmanifest|mjs)$/i.test(url.pathname)) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      }).catch(() => caches.match(request)),
    );
    return;
  }
  if (/\.(?:svg|png|webp|jpg|jpeg|gif|ico)$/i.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    })));
  }
});

async function reminderState() {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(REMINDER_REQUEST);
  return response ? response.json().catch(() => null) : null;
}

async function showReminder(state) {
  if (!state?.dueCount) return;
  const arabic = state.language === "ar";
  const next = Array.isArray(state.deadlines) ? state.deadlines[0] : null;
  const nextLabel = next ? `${next.course ? `${next.course} · ` : ""}${next.title}` : "";
  try {
    await self.registration.showNotification(arabic ? "تذكير InstantGPA Premium" : "InstantGPA Premium reminder", {
      body: arabic
        ? `${state.dueCount} تقييمات قادمة.${nextLabel ? ` التالي: ${nextLabel}` : ""}`
        : `${state.dueCount} upcoming assessment${state.dueCount === 1 ? "" : "s"}.${nextLabel ? ` Next: ${nextLabel}` : ""}`,
      icon: "/assets/icons/favicon.svg",
      badge: "/assets/icons/favicon.svg",
      tag: "instantgpa-pro-deadlines",
      renotify: false,
      data: { url: "/pro-workspace?tab=semester" },
      actions: [{ action: "open", title: arabic ? "فتح اللوحة" : "Open dashboard" }],
    });
  } catch {
    /* Permission can be revoked after reminders were configured. */
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SYNC_PRO_DUE_COUNT") return;
  const state = {
    dueCount: Math.max(0, Math.min(99, Number(event.data.dueCount) || 0)),
    deadlines: Array.isArray(event.data.deadlines) ? event.data.deadlines.slice(0, 25) : [],
    language: event.data.language === "ar" ? "ar" : "en",
    updatedAt: new Date().toISOString(),
  };
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.put(
        REMINDER_REQUEST,
        new Response(JSON.stringify(state), { headers: { "content-type": "application/json" } }),
      ))
      .then(() => event.data.notifyNow ? showReminder(state) : undefined),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json?.() || {}; } catch { payload = {}; }
  const arabic = payload.language === "ar";
  event.waitUntil(self.registration.showNotification(
    String(payload.title || (arabic ? "تحديث أكاديمي من InstantGPA" : "InstantGPA academic update")).slice(0, 120),
    {
      body: String(payload.body || (arabic ? "افتح لوحة الفصل لمراجعة الموعد." : "Open the semester dashboard to review the deadline.")).slice(0, 240),
      icon: "/assets/icons/icon-192.png", badge: "/assets/icons/favicon.svg",
      tag: String(payload.tag || "instantgpa-academic-update").slice(0, 80),
      data: { url: String(payload.url || "/pro-workspace?tab=semester") },
    },
  ));
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "instantgpa-pro-deadlines") {
    event.waitUntil(reminderState().then(showReminder));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/pro-workspace?tab=semester";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          await client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
