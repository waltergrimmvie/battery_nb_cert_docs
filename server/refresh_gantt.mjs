// Checks the Gantt viewer version first. The gzip is downloaded only when
// the remote number is higher than the one saved in the root.

import { versionNumber } from "./refresh_editor.mjs";
import { acceptStoredJson } from "./json_populate.mjs";

export { versionNumber };

export const GANTT_VERSION_URL = "https://gantt.dev-q-prox.com/version.txt";
export const GANTT_GZIP_URL = "https://gantt.dev-q-prox.com/Download/gantt_viewer.gzip";
export const GANTT_PREFIX = "/viewer/gantt/gantt_viewer";

const TEXT_EXT = new Set([".html", ".js", ".svg", ".txt", ".json", ".css", ".mjs"]);

export async function downloadGantt(localVersion = 0) {
  const { loadViewerGzip } = await import("./viewer_cache.mjs");
  return loadViewerGzip({
    kind: "gantt",
    versionUrl: GANTT_VERSION_URL,
    gzipUrl: GANTT_GZIP_URL,
    label: "Gantt",
    prepare: prepareGantt,
    readTar,
  });
}

async function remoteGanttVersion() {
  const response = await fetch(GANTT_VERSION_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("The Gantt version was not available (" + response.status + ").");
  const version = versionNumber(await response.text());
  if (!version) throw new Error("The Gantt version file is empty.");
  return version;
}

export function prepareGantt(rawFiles) {
  const files = new Map();
  for (const [name, bytes] of rawFiles) {
    const rel = safeName(name);
    if (!rel || !bytes) continue;
    files.set(rel, bytes);
  }

  const version = new TextDecoder().decode(files.get("version.txt") || new Uint8Array()).trim();
  if (!version) throw new Error("The Gantt gzip has no version.");

  // The page on gantt.dev-q-prox.com derives its base from the script URL.
  // Inside the desk that base must be the viewer prefix, or the scripts 404.
  const populateBytes = files.get("design/populate.js");
  if (populateBytes) {
    files.set("design/populate.js", new TextEncoder().encode(acceptStoredJson(new TextDecoder().decode(populateBytes))));
  }
  const indexBytes = files.get("index.html");
  if (indexBytes) {
    let html = new TextDecoder().decode(indexBytes);
    html = html.replace('src="js/boot.js', 'src="' + GANTT_PREFIX + "/js/boot.js");
    files.set("index.html", new TextEncoder().encode(html));
  }
  const bootBytes = files.get("js/boot.js");
  if (bootBytes) {
    let boot = new TextDecoder().decode(bootBytes);
    boot = boot.replace(
      'var me = document.currentScript && document.currentScript.src;\n  var base = me ? me.replace(/js\\/boot\\.js(?:\\?.*)?$/, "") : "gantt/";',
      'var base = "' + GANTT_PREFIX + '/";',
    );
    files.set("js/boot.js", new TextEncoder().encode(boot));
  }

  const required = ["index.html", "version.txt", "js/boot.js", "engine/import.js", "design/populate.js"];
  const missing = required.filter((name) => !files.has(name));
  if (missing.length) throw new Error("The Gantt gzip is incomplete: " + missing.join(", "));

  const index = new TextDecoder().decode(files.get("index.html"));
  const boot = new TextDecoder().decode(files.get("js/boot.js"));
  if (!index.includes("js/boot.js")) throw new Error("The Gantt page does not load its own script.");
  const populate = new TextDecoder().decode(files.get("design/populate.js"));
  if (!populate.includes("root.populate") && !boot.includes("window.populate")) {
    throw new Error("The Gantt viewer cannot replace an open document.");
  }
  if (!boot.includes("editorReady")) throw new Error("The Gantt viewer has no ready signal.");

  return {
    files,
    report: {
      ok: true,
      version,
      files: files.size,
      script: "js/boot.js",
    },
  };
}

function rewriteBootPaths(text) {
  const prefix = GANTT_PREFIX + "/";
  const roots = ["css/", "src/", "json/", "fonts/", "engine/", "js/"];
  for (const root of roots) {
    text = text.replaceAll('"' + root, '"' + prefix + root);
  }
  return text;
}

function rewriteLocalPaths(text, version) {
  const v = encodeURIComponent(String(version || "0"));
  const prefix = GANTT_PREFIX + "/";
  text = text
    .replaceAll('href="css/', 'href="' + prefix + "css/")
    .replaceAll('src="js/', 'src="' + prefix + "js/")
    .replaceAll('src="src/', 'src="' + prefix + "src/")
    .replaceAll('src="engine/', 'src="' + prefix + "engine/")
    .replaceAll('src="fonts/', 'src="' + prefix + "fonts/")
    .replaceAll('src="json/', 'src="' + prefix + "json/");
  text = text.replaceAll('.js"', ".js?v=" + v + '"').replaceAll('.css"', ".css?v=" + v + '"');
  return text;
}

function safeName(name) {
  const parts = String(name).split("/").filter(Boolean);
  if (parts[0] === "gantt_viewer") parts.shift();
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
    for (let i = 0; i < 512; i += 1) if (bytes[offset + i] !== 0) { empty = false; break; }
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
