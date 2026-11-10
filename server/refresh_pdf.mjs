// Checks the PDF viewer version first. The gzip is downloaded only when
// the remote number is higher than the one saved in the root.

import { versionNumber } from "./refresh_editor.mjs";

export { versionNumber };

export const PDF_VERSION_URL = "https://pdf.dev-q-prox.com/version.txt";
export const PDF_GZIP_URL = "https://pdf.dev-q-prox.com/Download/pdf_viewer.gzip";
export const PDF_PREFIX = "/viewer/pdf/pdf_viewer";

const TEXT_EXT = new Set([".html", ".js", ".svg", ".txt", ".json", ".css", ".mjs"]);

export async function downloadPdf(localVersion = 0) {
  const remote = await remotePdfVersion();
  const local = versionNumber(localVersion);
  if (remote <= local) {
    return {
      files: null,
      report: {
        ok: true,
        skipped: true,
        version: String(local),
        remote: String(remote),
      },
    };
  }

  const response = await fetch(PDF_GZIP_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("The PDF download was not available (" + response.status + ").");
  const packed = new Uint8Array(await response.arrayBuffer());
  if (packed.length < 10 || packed[0] !== 0x1f || packed[1] !== 0x8b) {
    throw new Error("The PDF download is not a gzip file.");
  }
  const tarBytes = new Uint8Array(
    await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer(),
  );
  return preparePdf(readTar(tarBytes));
}

async function remotePdfVersion() {
  const response = await fetch(PDF_VERSION_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("The PDF version was not available (" + response.status + ").");
  const version = versionNumber(await response.text());
  if (!version) throw new Error("The PDF version file is empty.");
  return version;
}

export function preparePdf(rawFiles) {
  const files = new Map();
  for (const [name, bytes] of rawFiles) {
    const rel = safeName(name);
    if (!rel || !bytes) continue;
    files.set(rel, bytes);
  }

  const version = new TextDecoder().decode(files.get("version.txt") || new Uint8Array()).trim();
  if (!version) throw new Error("The PDF gzip has no version.");

  for (const [rel, bytes] of [...files]) {
    const ext = extension(rel);
    if (!TEXT_EXT.has(ext)) continue;
    let text = new TextDecoder().decode(bytes);
    if (rel === "js/boot.js") text = rewriteBootPaths(text);
    text = rewriteLocalPaths(text, version);
    files.set(rel, new TextEncoder().encode(text));
  }

  const required = ["index.html", "version.txt", "js/boot.js", "engine/import-pdf.js"];
  const missing = required.filter((name) => !files.has(name));
  if (missing.length) throw new Error("The PDF gzip is incomplete: " + missing.join(", "));

  const index = new TextDecoder().decode(files.get("index.html"));
  const boot = new TextDecoder().decode(files.get("js/boot.js"));
  if (!index.includes("js/boot.js")) throw new Error("The PDF page does not load its own script.");
  if (!boot.includes("window.populate")) throw new Error("The PDF viewer cannot replace an open document.");
  if (!boot.includes("editorReady")) throw new Error("The PDF viewer has no ready signal.");

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
  const prefix = PDF_PREFIX + "/";
  const roots = ["css/", "src/", "json/", "fonts/", "engine/", "js/"];
  for (const root of roots) {
    text = text.replaceAll('"' + root, '"' + prefix + root);
  }
  return text;
}

function rewriteLocalPaths(text, version) {
  const v = encodeURIComponent(String(version || "0"));
  const prefix = PDF_PREFIX + "/";
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
  if (parts[0] === "pdf_viewer") parts.shift();
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
