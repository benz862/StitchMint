/* StitchMint service worker — light offline shell.
 * v3 (2026-05): bypass non-http(s) requests (blob:, data:, file:) so the cropper's
 * URL.createObjectURL(file) blob URLs don't get intercepted, fail to fetch, and produce
 * an ERR_TIMED_OUT against a UUID-named resource (the blob URL's path component is
 * a UUID, which is exactly what was happening on /admin and /create when picking an image).
 */
const CACHE = "stitchmint-v3";
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

  /* Only handle http(s) requests. blob:, data:, file:, chrome-extension:, etc. must pass straight
   * through to the browser — wrapping them in fetch() inside the SW can hang indefinitely (notably
   * blob: URLs from URL.createObjectURL, which the editor uses for picked image files). */
  if (!request.url.startsWith("http://") && !request.url.startsWith("https://")) return;

  const url = new URL(request.url);

  /* Do not wrap auth or API — avoids odd FetchEvent / cache behavior on login */
  if (url.pathname.startsWith("/login") || url.pathname.startsWith("/auth") || url.pathname.startsWith("/api")) {
    event.respondWith(fetch(request));
    return;
  }

  /* Same-origin only for the cache-everything-else branch. Cross-origin (Supabase Storage signed URLs,
   * Stripe scripts, etc.) should hit the network directly so opaque-response edge cases and
   * short-lived signed tokens don't get stuck in cache. */
  if (url.origin !== self.location.origin) {
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
