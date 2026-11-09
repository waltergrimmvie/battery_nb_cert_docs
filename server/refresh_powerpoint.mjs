// Checks the PowerPoint viewer version first. The gzip is downloaded only when
// the remote number is higher than the one saved in the root.

import { versionNumber } from "./refresh_editor.mjs";

export { versionNumber };

export const PPT_VERSION_URL = "https://presentation.dev-q-prox.com/version.txt";
export const PPT_GZIP_URL = "https://presentation.dev-q-prox.com/Download/powerpoint_viewer.gzip";
export const PPT_PREFIX = "/viewer/powerpoint/powerpoint_viewer";

const TEXT_EXT = new Set([".html", ".js", ".svg", ".txt", ".json", ".css", ".mjs"]);

export async function downloadPowerpoint(localVersion = 0) {
  const remote = await remotePptVersion();
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

  const response = await fetch(PPT_GZIP_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("The PowerPoint download was not available (" + response.status + ").");
  const packed = new Uint8Array(await response.arrayBuffer());
  if (packed.length < 10 || packed[0] !== 0x1f || packed[1] !== 0x8b) {
    throw new Error("The PowerPoint download is not a gzip file.");
  }
  const tarBytes = new Uint8Array(
    await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer(),
  );
  return preparePowerpoint(readTar(tarBytes));
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
    if (rel === "index.html") text = installPresentationHooks(text, version);
    text = rewriteLocalPaths(text, version);
    files.set(rel, new TextEncoder().encode(text));
  }
  const required = [
    "index.html",
    "version.txt",
    "js/app.js",
  ];
  const missing = required.filter((name) => !files.has(name));
  if (missing.length) throw new Error("The PowerPoint gzip is incomplete: " + missing.join(", "));
  const index = new TextDecoder().decode(files.get("index.html"));
  if (!index.includes("js/app.js")) throw new Error("The PowerPoint page does not load its own script.");
  if (!index.includes("window.populate")) throw new Error("The PowerPoint viewer cannot replace an open deck.");

  return {
    files,
    report: {
      ok: true,
      version,
      files: files.size,
      script: "js/app.js",
      external: [],
    },
  };
}

function installPresentationHooks(html, version) {
  const v = encodeURIComponent(String(version || "0"));
  const hook = [
    "<script>",
    "window.PPT=window.PPT||{};",
    "if(new URLSearchParams(location.search).get(\"src\"))window.PPT.holdSample=true;",
    "window.editorReady=new Promise(function(resolve){window.__editorReady=resolve;});",
    "window.populate=async function(src){",
    "  const response=await fetch(src,{cache:\"no-store\"});",
    "  if(!response.ok)throw new Error(\"Could not open the presentation\");",
    "  const buffer=await response.arrayBuffer();",
    "  const name=decodeURIComponent((String(src).split(\"/\").pop()||\"deck\").replace(/\\.pptx$/i,\"\"))+\".pptx\";",
    "  const result=await PPT.importPptx(buffer,name);",
    "  if(PPT.populate)PPT.populate(result.deck,result.report);",
    "  if(window.__editorReady)window.__editorReady();",
    "  return true;",
    "};",
    "const passed=new URLSearchParams(location.search).get(\"src\");",
    "if(passed){window.PPT.holdSample=true;window.addEventListener(\"load\",function(){window.populate(passed).catch(function(err){if(PPT.showImportError)PPT.showImportError(err.message);});});}",
    "</script>",
  ].join("");
  if (html.includes("</body>")) return html.replace("</body>", hook + "</body>");
  return html + hook;
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
