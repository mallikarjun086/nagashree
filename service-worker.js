const CACHE_NAME = "salary-guide-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icon.svg"
];

// Install event: cache files
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .catch((err) => console.log("Cache storage failed to open (install):", err))
  );
  self.skipWaiting();
});

// Activate event: clear old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        );
      })
      .catch((err) => console.log("Cache storage failed to open (activate):", err))
  );
  self.clients.claim();
});

// Fetch event: network first, fallback to cache
self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("/api/")) {
    return; // Don't cache backend API calls
  }

  e.respondWith(
    fetch(e.request).catch(async () => {
      try {
        const response = await caches.match(e.request);
        return response || new Response("Offline Mode", { status: 503, statusText: "Service Unavailable" });
      } catch (err) {
        console.log("Cache match failed:", err);
        return new Response("Offline Mode", { status: 503, statusText: "Service Unavailable" });
      }
    })
  );
});
