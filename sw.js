// Cipher service worker: offline app shell + fast updates.
// Bump VERSION whenever you want every device to refresh its cache.
const VERSION = "v1";
const SHELL_CACHE = "cipher-shell-" + VERSION;
const LIB_CACHE = "cipher-lib-v1"; // versioned Firebase SDK files, safe to keep
const SHELL = [
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

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) =>
      Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k !== SHELL_CACHE && k !== LIB_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Firebase SDK files (version in the URL): cache-first so the app can start offline
  if (url.hostname === "www.gstatic.com" && url.pathname.indexOf("/firebasejs/") === 0) {
    e.respondWith(
      caches.open(LIB_CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // Anything else on another origin (Firestore, Auth, Google sign-in, photos): never touch it
  if (url.origin !== self.location.origin) return;

  // Opening the app: network first so updates show up, cached copy when offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("index.html", copy));
        }
        return res;
      }).catch(() =>
        caches.match("index.html").then((r) => r || caches.match("./"))
      )
    );
    return;
  }

  // Other same-origin files (icons, manifest): serve cached, refresh in background
  e.respondWith(
    caches.open(SHELL_CACHE).then((c) =>
      c.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    )
  );
});

// Tapping a notification opens or focuses the app
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow("./");
    })
  );
});
