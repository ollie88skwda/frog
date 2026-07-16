// SBL service worker — app-shell asset cache only. Deliberately NOT an offline
// data layer (v1 web is online-first): it caches the built shell so repeat
// loads are instant and survive flaky networks, and it relays web-push +
// local rest-timer notifications. Data always comes from the network.

const CACHE = "sbl-shell-v1";

self.addEventListener("install", (event) => {
  // Precache the entry document; hashed /assets/* are cached on first fetch.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/index.html"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never cache Supabase/API

  // Navigations: network-first, fall back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then((r) => r ?? Response.error()),
      ),
    );
    return;
  }

  // Hashed build assets are immutable — serve from cache, populate on miss.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
  }
});

// Web push: the send-rest-push Edge Function posts a JSON payload; show it.
self.addEventListener("push", (event) => {
  let data = { title: "SBL", body: "Rest timer done" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || "sbl-push",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    }),
  );
});
