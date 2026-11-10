// Keeps a downloaded viewer gzip in the colo cache.
// A later request checks the remote version only. If it has not changed,
// the gzip is read from this cache instead of being downloaded again.

import { versionNumber } from "./refresh_editor.mjs";

const CACHE_NAME = "battery-nb-viewers";

function versionKey(kind) {
  return new Request("https://desk.local/viewers/" + kind + "/version");
}

function gzipKey(kind) {
  return new Request("https://desk.local/viewers/" + kind + "/gzip");
}

export async function readCachedGzip(kind) {
  const cache = await caches.open(CACHE_NAME);
  const versionRes = await cache.match(versionKey(kind));
  const gzipRes = await cache.match(gzipKey(kind));
  if (!versionRes || !gzipRes) return null;
  const version = versionNumber(await versionRes.text());
  const bytes = new Uint8Array(await gzipRes.arrayBuffer());
  if (!version || bytes.length < 10 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return null;
  return { version, bytes };
}

export async function writeCachedGzip(kind, version, bytes) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(
    versionKey(kind),
    new Response(String(version) + "\n", { headers: { "content-type": "text/plain; charset=utf-8" } }),
  );
  await cache.put(
    gzipKey(kind),
    new Response(bytes, { headers: { "content-type": "application/gzip" } }),
  );
}

const BROWSER = {
  "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
  accept: "text/plain,*/*",
};

export async function fetchRemoteVersion(url, label) {
  const response = await fetch(url, { cache: "no-store", headers: BROWSER });
  if (!response.ok) throw new Error("The " + label + " version was not available (" + response.status + ").");
  const version = versionNumber(await response.text());
  if (!version) throw new Error("The " + label + " version file is empty.");
  return version;
}

export async function fetchGzip(url, label) {
  const response = await fetch(url, { cache: "no-store", headers: BROWSER });
  if (!response.ok) throw new Error("The " + label + " download was not available (" + response.status + ").");
  const packed = new Uint8Array(await response.arrayBuffer());
  if (packed.length < 10 || packed[0] !== 0x1f || packed[1] !== 0x8b) {
    throw new Error("The " + label + " download is not a gzip file.");
  }
  return packed;
}

export async function unpackGzip(packed) {
  return new Uint8Array(
    await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer(),
  );
}
