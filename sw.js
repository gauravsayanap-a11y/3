// Cipher service worker.
// Bump CACHE on every release (cipher-v3, v4, ...) so installed copies update.
const CACHE = "cipher-v2";

const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
  "favicon-32.png"
];

const NAV_TIMEOUT = 4000; // slow network: fall back to the cached page after 4 s

// Install: fetch fresh copies (bypassing the HTTP cache) and store each one separately,
// so a single missing file can't break the whole install.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        ASSETS.map((a) =>
          fetch(new Request(a, { cache: "reload" }))
            .then((res) => (res.ok ? cache.put(a, res) : null))
            .catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate: delete old caches and take control of open pages.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirstPage(request) {
  const network = fetch(request, { cache: "no-cache" }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put("index.html", copy)); // only good responses are stored
    }
    return res;
  });
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve(caches.match("index.html", { ignoreSearch: true })), NAV_TIMEOUT)
  );
  return Promise.race([network, timeout])
    .then((res) => res || network)
    .catch(() =>
      caches.match("index.html", { ignoreSearch: true }).then((r) => r || caches.match("./"))
    );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs. Firebase, gstatic and all online play go straight to the network.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Opening the game (including challenge links like ?c=ABC123): network first, cached page as backup.
  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
    return;
  }

  // Icons, manifest and other static files: cache first, then network.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});

// Tapping a notification (for example the daily reminder) opens or focuses the game.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow("./");
    })
  );
});
