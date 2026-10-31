// Never put authenticated API responses or invitation URLs in Cache Storage.
const CACHE = "cho-em-v13-period-estimates";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
  ...["api", "cloud", "account", "connections"].map((n) => "./js/" + n + ".js"),
  ...["Cute", "OmTim", "Sleepy", "Cry", "Angry", "XauHo", "HoldPhone"].map(
    (n) => "./assets/" + n + ".png",
  ),
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/flower.png",
  "./assets/clover.png",
  "./assets/heart.png",
  "./assets/greeting-star.png",
  "./js/connection-code.js",
  "./js/qr-scanner.js",
  "./js/invite-dialog.js",
  "./js/shared-view.js",
  "./js/shared-details.js",
  "./js/cycle-model.js",
  "./js/cycle-analysis.js",
  "./js/cycle-analysis-view.js",
  "./js/period-records.js",
  "./js/period-drag.js",
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
