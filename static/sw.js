const CACHE_NAME = "the-ring-shell-v3";
const SHELL_ASSETS = [
  "/",
  "/style.css?v=3",
  "/app.js?v=3",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // "reload" skips the HTTP cache so a stale copy never lands in the new shell cache.
      cache.addAll(SHELL_ASSETS.map((url) => new Request(url, { cache: "reload" })))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) {
    return; // never cache API calls
  }
  // Network-first so new deploys show up immediately; cache is the offline fallback.
  // "no-cache" revalidates with the server instead of trusting the browser's HTTP cache.
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok && event.request.method === "GET") {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
