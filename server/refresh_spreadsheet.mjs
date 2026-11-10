// Checks the spreadsheet version first. The gzip is downloaded only when the
// remote number is higher than the one saved in the root.

import { versionNumber } from "./refresh_editor.mjs";

export { versionNumber };

export const SHEET_VERSION_URL = "https://spreadsheet.dev-q-prox.com/version.txt";
export const SHEET_GZIP_URL = "https://spreadsheet.dev-q-prox.com/Download/spreadsheet.gzip";
export const SHEET_PREFIX = "/viewer/spreadsheet/spreadsheet_viewer";

const TEXT_EXT = new Set([".html", ".js", ".svg", ".txt", ".json", ".css", ".mjs"]);

export async function downloadSpreadsheet(localVersion = 0) {
  const { readCachedGzip, writeCachedGzip, fetchRemoteVersion, fetchGzip, unpackGzip } = await import("./viewer_cache.mjs");
  const remote = await fetchRemoteVersion(SHEET_VERSION_URL, "spreadsheet");
  const cached = await readCachedGzip("sheet");
  if (cached && cached.version >= remote) {
    const pack = prepareSpreadsheet(readTar(await unpackGzip(cached.bytes)));
    pack.report.cached = true;
    return pack;
  }
  const packed = await fetchGzip(SHEET_GZIP_URL, "spreadsheet");
  await writeCachedGzip("sheet", remote, packed);
  return prepareSpreadsheet(readTar(await unpackGzip(packed)));
}

async function remoteSheetVersion() {
  const response = await fetch(SHEET_VERSION_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("The spreadsheet version was not available (" + response.status + ").");
  const version = versionNumber(await response.text());
  if (!version) throw new Error("The spreadsheet version file is empty.");
  return version;
}

export function prepareSpreadsheet(rawFiles) {
  const files = new Map();
  for (const [name, bytes] of rawFiles) {
    const rel = safeName(name);
    if (!rel || !bytes) continue;
    files.set(rel, bytes);
  }

  const bootPath = "public/sheet/boot.js";
  const boot = files.get(bootPath);
  if (!boot) throw new Error("The spreadsheet gzip has no public/sheet/boot.js.");

  for (const [rel, bytes] of [...files]) {
    const ext = extension(rel);
    if (!TEXT_EXT.has(ext)) continue;
    let text = new TextDecoder().decode(bytes);
    if (rel.endsWith(".html")) {
      text = text.replaceAll('src="/public/sheet/boot.js', 'src="./public/sheet/boot.js');
    }
    text = rewriteLocalPaths(text);
    files.set(rel, new TextEncoder().encode(text));
  }

  const version = new TextDecoder().decode(files.get("version.txt") || new Uint8Array()).trim();
  const fonts = [...files.keys()].filter((name) => name.startsWith("public/fonts/") && name.endsWith(".woff"));
  const required = [
    "index.html",
    "version.txt",
    "public/sheet/boot.js",
    "public/fonts/carlito-400-normal.woff",
  ];
  const missing = required.filter((name) => !files.has(name));
  if (missing.length) throw new Error("The spreadsheet gzip is incomplete: " + missing.join(", "));
  if (!version) throw new Error("The spreadsheet gzip has no version.");

  const index = new TextDecoder().decode(files.get("index.html"));
  const ready = new TextDecoder().decode(files.get(bootPath));
  if (!index.includes("./public/sheet/boot.js")) throw new Error("The spreadsheet page does not load its own script.");
  if (!ready.includes("window.populate")) throw new Error("The spreadsheet cannot replace an open workbook.");
  const external = runtimeExternalUrls(index + "\n" + ready);
  if (external.length) throw new Error("The spreadsheet still calls outside this site: " + external.join(", "));

  return {
    files,
    report: {
      ok: true,
      version,
      files: files.size,
      fonts: fonts.length,
      script: "./public/sheet/boot.js",
      external: [],
    },
  };
}

function rewriteLocalPaths(text) {
  return text
    .replaceAll("/public/fonts/", SHEET_PREFIX + "/public/fonts/")
    .replaceAll("/public/Files/", "@@SHEET_PUBLIC_FILES@@")
    .replaceAll("/Files/", SHEET_PREFIX + "/Files/")
    .replaceAll("@@SHEET_PUBLIC_FILES@@", SHEET_PREFIX + "/public/Files/");
}

function runtimeExternalUrls(text) {
  const found = new Set();
  const pattern = /(?:src|href)\s*=\s*["']https?:\/\/[^"']+|fetch\(\s*[`"']https?:\/\/[^`"']+|url\(\s*["']?https?:\/\/[^"')]+/gi;
  for (const hit of text.match(pattern) || []) found.add(hit.slice(0, 160));
  return [...found];
}

function safeName(name) {
  const parts = String(name).split("/").filter(Boolean);
  if (parts[0] === "spreadsheet") parts.shift();
  if (!parts.length || parts.some((part) => part === ".." || part === ".")) return "";
  return parts.join("/");
}

function extension(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function readTar(bytes) {
  const files = new Map();
  const decoder = new TextDecoder();
  let offset = 0;
  const field = (start, length) => {
    let end = start + length;
    while (end > start && (bytes[end - 1] === 0 || bytes[end - 1] === 32)) end -= 1;
    return decoder.decode(bytes.subarray(start, end));
  };
  while (offset + 512 <= bytes.length) {
    let empty = true;
    for (let i = 0; i < 512; i += 1) {
      if (bytes[offset + i] !== 0) {
        empty = false;
        break;
      }
    }
    if (empty) break;
    const name = field(offset, 100);
    const prefix = field(offset + 345, 155);
    const size = Number.parseInt(field(offset + 124, 12).trim(), 8) || 0;
    const type = bytes[offset + 156];
    offset += 512;
    const data = bytes.slice(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (type !== 48 && type !== 0) continue;
    const full = prefix ? prefix + "/" + name : name;
    if (full) files.set(full, data);
  }
  return files;
}
