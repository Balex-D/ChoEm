// Never put authenticated API responses or invitation URLs in Cache Storage.
const CACHE = "cho-em-v17-analysis-tab";
const ASSETS = [
  "./",
  "./index.html",
  "./styles/app.css",
  "./js/app.js",
  "./manifest.json",
  "./icon.svg",
  "/js/core/api.js",
  "/js/core/cloud.js",
  "/js/features/account/account.js",
  "/js/features/connections/connections.js",
  ...["Cute", "OmTim", "Sleepy", "Cry", "Angry", "XauHo", "HoldPhone"].map(
    (n) => "./assets/" + n + ".png",
  ),
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/flower.png",
  "./assets/clover.png",
  "./assets/heart.png",
  "./assets/greeting-star.png",
  "/js/features/connections/connection-code.js",
  "/js/features/connections/qr-scanner.js",
  "/js/features/connections/invite-dialog.js",
  "/js/features/connections/shared-view.js",
  "/js/features/connections/shared-details.js",
  "/shared/cycle/cycle-model.js",
  "/shared/cycle/cycle-analysis.js",
  "/shared/cycle/history-analysis.js",
  "/js/features/cycle/history-analysis-view.js",
  "/js/features/cycle/analysis-page.js",
  "/js/features/cycle/cycle-analysis-view.js",
  "/shared/cycle/period-records.js",
  "/js/features/cycle/period-drag.js",
  "./vendor/jsqr.js",
];
const ALLOWED = new Set(
  ASSETS.map((path) => new URL(path, self.location).pathname),
);
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("cho-em-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (
    e.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    !ALLOWED.has(url.pathname) ||
    url.search
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          e.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(e.request, copy)),
          );
        }
        return response;
      })
      .catch(() =>
        caches
          .match(e.request)
          .then(
            (r) =>
              r ||
              (e.request.mode === "navigate"
                ? caches.match("./index.html")
                : Response.error()),
          ),
      ),
  );
});
