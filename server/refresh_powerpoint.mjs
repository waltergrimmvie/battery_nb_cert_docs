// Checks the PowerPoint viewer version first. The gzip is downloaded only when
// the remote number is higher than the one saved in the root.

import { versionNumber } from "./refresh_editor.mjs";
import { acceptStoredJson } from "./json_populate.mjs";

export { versionNumber };

export const PPT_VERSION_URL = "https://presentation.dev-q-prox.com/version.txt";
export const PPT_GZIP_URL = "https://presentation.dev-q-prox.com/Download/powerpoint_viewer.gzip";
export const PPT_PREFIX = "/viewer/powerpoint/powerpoint_viewer";

const TEXT_EXT = new Set([".html", ".js", ".svg", ".txt", ".json", ".css", ".mjs"]);

export async function downloadPowerpoint(localVersion = 0) {
  const { readCachedGzip, writeCachedGzip, fetchRemoteVersion, fetchGzip, unpackGzip } = await import("./viewer_cache.mjs");
  const remote = await fetchRemoteVersion(PPT_VERSION_URL, "PowerPoint");
  const cached = await readCachedGzip("ppt");
  if (cached && cached.version >= remote) {
    const pack = preparePowerpoint(readTar(await unpackGzip(cached.bytes)));
    pack.report.cached = true;
    return pack;
  }
  const packed = await fetchGzip(PPT_GZIP_URL, "PowerPoint");
  await writeCachedGzip("ppt", remote, packed);
  return preparePowerpoint(readTar(await unpackGzip(packed)));
}

async function remotePptVersion() {
  const response = await fetch(PPT_VERSION_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("The PowerPoint version was not available (" + response.status + ").");
  const version = versionNumber(await response.text());
  if (!version) throw new Error("The PowerPoint version file is empty.");
  return version;
}

export function preparePowerpoint(rawFiles) {
  const files = new Map();
  for (const [name, bytes] of rawFiles) {
    const rel = safeName(name);
    if (!rel || !bytes) continue;
    files.set(rel, bytes);
  }

  const version = new TextDecoder().decode(files.get("version.txt") || new Uint8Array()).trim();
  if (!version) throw new Error("The PowerPoint gzip has no version.");

  for (const [rel, bytes] of [...files]) {
    const ext = extension(rel);
    if (!TEXT_EXT.has(ext)) continue;
    let text = new TextDecoder().decode(bytes);
    if (rel === "index.html") text = installPresentationHooks(text);
    if (rel === "js/boot.js") text = acceptStoredJson(patchBoot(rewriteBootPaths(text)));
    if (rel === "js/app.js") text = patchApp(text);
    if (rel !== "js/boot.js") text = rewriteLocalPaths(text, version);
    files.set(rel, new TextEncoder().encode(text));
  }
  const required = [
    "index.html",
    "version.txt",
    "js/boot.js",
    "js/app.js",
    "engine/import-pptx.js",
  ];
  const missing = required.filter((name) => !files.has(name));
  if (missing.length) throw new Error("The PowerPoint gzip is incomplete: " + missing.join(", "));
  const index = new TextDecoder().decode(files.get("index.html"));
  if (!index.includes("js/boot.js")) throw new Error("The PowerPoint page does not load its own script.");
  if (!index.includes("window.populate")) throw new Error("The PowerPoint viewer cannot replace an open deck.");

  return {
    files,
    report: {
      ok: true,
      version,
      files: files.size,
      script: "js/boot.js",
      external: [],
    },
  };
}

function installPresentationHooks(html) {
  const hook = [
    "<script>",
    "window.PPT=window.PPT||{};",
    "if(new URLSearchParams(location.search).get('src'))window.PPT.holdSample=true;",
    "window.editorReady=new Promise(function(resolve){window.__editorReady=resolve;});",
    "window.populate=async function(src){",
    "  await window.editorReady;",
    "  const response=await fetch(src,{cache:'no-store'});",
    "  if(!response.ok)throw new Error('Could not open the presentation');",
    "  const buffer=await response.arrayBuffer();",
    "  const name=decodeURIComponent((String(src).split('/').pop()||'deck').split('?')[0]);",
    "  const result=await PPT.importPptx(buffer,name);",
    "  if(!result||!result.deck||!result.deck.slides)throw new Error('The file did not become a QPP deck.');",
    "  (PPT.populate)(result.deck,result.report);",
    "  return true;",
    "};",
    "window.__scriptsReady=function(){",
    "  if(window.__editorReady)window.__editorReady();",
    "  const passed=new URLSearchParams(location.search).get('src');",
    "  if(passed)window.populate(passed).catch(function(err){if(PPT.showImportError)PPT.showImportError(err.message);});",
    "};",
    "</script>",
  ].join("");
  if (html.includes("</body>")) return html.replace("</body>", hook + "</body>");
  return html + hook;
}

function patchApp(text) {
  // Same scheme as the spreadsheet: import in the browser, then populate.
  // Do not store the file on an API that this desk does not have.
  text = text.replace(
    "function storePptx(buffer, name) {",
    "function storePptx(buffer, name) { return Promise.resolve(); }\n  function storePptxUnused(buffer, name) {",
  );
  text = text.replace(
    'fetch(apiUrl(), { cache: "no-store" })',
    'fetch(new URLSearchParams(location.search).get("src") ? "about:blank" : apiUrl(), { cache: "no-store" })',
  );
  return text;
}

function patchBoot(text) {
  const ready = ".then(function(){if(window.__scriptsReady)window.__scriptsReady();})";
  if (!text.includes("window.__scriptsReady")) {
    text = text.replace(
      "}, Promise.resolve());",
      "}, Promise.resolve())" + ready + ";",
    );
  }
  return text;
}

function rewriteBootPaths(text) {
  const prefix = PPT_PREFIX + "/";
  const roots = ["css/", "design/", "js/", "engine/", "events/", "process/", "fonts/"];
  for (const root of roots) {
    text = text.replaceAll('"' + root, '"' + prefix + root);
  }
  return text;
}

function rewriteLocalPaths(text, version) {
  const v = encodeURIComponent(String(version || "0"));
  const prefix = PPT_PREFIX + "/";
  text = text
    .replaceAll('href="css/', 'href="' + prefix + "css/")
    .replaceAll('href="design/', 'href="' + prefix + "design/")
    .replaceAll('src="js/', 'src="' + prefix + "js/")
    .replaceAll('src="engine/', 'src="' + prefix + "engine/")
    .replaceAll('src="events/', 'src="' + prefix + "events/")
    .replaceAll('src="process/', 'src="' + prefix + "process/")
    .replaceAll('src="design/', 'src="' + prefix + "design/")
    .replaceAll('src="fonts/', 'src="' + prefix + "fonts/");
  text = text.replaceAll('.js"', ".js?v=" + v + '"').replaceAll('.css"', ".css?v=" + v + '"');
  return text;
}

function safeName(name) {
  const parts = String(name).split("/").filter(Boolean);
  if (parts[0] === "powerpoint_viewer") parts.shift();
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
