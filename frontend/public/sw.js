// Minimaler Service Worker: macht die App installierbar (PWA-Kriterium) und cacht das
// statische App-Shell (HTML/JS/CSS/Icons) fürs schnellere Laden bzw. bei kurzzeitig
// fehlendem Netz. API-Aufrufe (/api/...) werden NIE gecacht - die App braucht dafür
// immer aktuelle Daten vom Server, ein Offline-Modus mit Datenspeicherung ist bewusst
// nicht Teil dieser Version.
const CACHE_NAME = "rechnung-shell-v1";
const APP_SHELL = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
