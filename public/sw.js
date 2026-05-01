/* StitchMint service worker — light offline shell */
const CACHE = "stitchmint-v2";
const OFFLINE = ["/offline", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  /* Do not wrap auth or API — avoids odd FetchEvent / cache behavior on login */
  if (url.pathname.startsWith("/login") || url.pathname.startsWith("/auth") || url.pathname.startsWith("/api")) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const offlinePage = await cache.match("/offline");
          if (offlinePage) return offlinePage;
        }
        return Response.error();
      }),
  );
});
