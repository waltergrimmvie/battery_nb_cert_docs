// Keeps the installed page usable without a network.
// The app shell is cached. A file opened once lives in IndexedDB
// and is served again from /indexed/<guid>.

const SHELL = "battery-nb-shell";
const RUNTIME = "battery-nb-runtime";
const DB_NAME = "battery NB worker";
const STORE = "files";

const SHELL_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/favicon.svg",
  "/setup/create_indexed.js",
  "/startup/startup.js",
  "/startup/desk.js",
  "/database/indexed/files.js",
  "/main_page/construct_main_page.js",
  "/main_page/read_docx.js",
  "/menu_bar/construct_design/construct_design.js",
  "/menu_bar/online_users.js",
  "/menu_bar/populate/populate.js",
  "/__grok/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/indexed/")) {
    event.respondWith(serveIndexed(decodeURIComponent(url.pathname.slice("/indexed/".length))));
    return;
  }
  if (url.pathname.startsWith("/viewer/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkThenCache(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request) || await caches.match(request.url.split("?")[0]);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkThenCache(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (response && response.ok && url.pathname !== "/version.txt") {
      const cache = await caches.open(url.pathname.startsWith("/viewer/") ? RUNTIME : SHELL);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request) || await caches.match(request.url.split("?")[0]);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const page = await caches.match("/index.html");
      if (page) return page;
    }
    throw error;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "guid" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function serveIndexed(guid) {
  const wantsJson = guid.endsWith(".json");
  const key = wantsJson ? guid.slice(0, -5) : guid;
  const db = await openDb();
  const record = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  if (wantsJson) {
    if (!record || !record.json) return new Response("JSON not stored", { status: 404 });
    return new Response(JSON.stringify(record.json), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  if (!record || !record.content) return new Response("Not stored", { status: 404 });
  return new Response(record.content, {
    headers: {
      "content-type": record.type || "application/octet-stream",
      "cache-control": "no-store",
    },
  });
}
