// Checks the editor version first. The gzip is downloaded only when the
// remote number is higher than the one saved in the root.

export const EDITOR_VERSION_URL = "https://texteditor.dev-q-prox.com/version.txt";
export const EDITOR_GZIP_URL = "https://texteditor.dev-q-prox.com/Download/rich_text_editor.gzip";
export const VIEWER_PREFIX = "/viewer/rich_text/rich_text_viewer";

const TEXT_EXT = new Set([".html", ".js", ".svg", ".txt", ".json", ".css"]);

export function versionNumber(value) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export async function downloadRichTextEditor(localVersion = 0) {
  const { readCachedGzip, writeCachedGzip, fetchRemoteVersion, fetchGzip, unpackGzip } = await import("./viewer_cache.mjs");
  const remote = await fetchRemoteVersion(EDITOR_VERSION_URL, "editor");
  const cached = await readCachedGzip("editor");
  if (cached && cached.version >= remote) {
    const pack = prepareEditor(readTar(await unpackGzip(cached.bytes)));
    pack.report.cached = true;
    return pack;
  }
  const packed = await fetchGzip(EDITOR_GZIP_URL, "editor");
  await writeCachedGzip("editor", remote, packed);
  return prepareEditor(readTar(await unpackGzip(packed)));
}

async function remoteEditorVersion() {
  const response = await fetch(EDITOR_VERSION_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("The editor version was not available (" + response.status + ").");
  const version = versionNumber(await response.text());
  if (!version) throw new Error("The editor version file is empty.");
  return version;
}

export function prepareEditor(rawFiles) {
  const files = new Map();
  for (const [name, bytes] of rawFiles) {
    const rel = safeName(name);
    if (!rel || !bytes) continue;
    files.set(rel, bytes);
  }

  const bootPath = "public/paint/boot.js";
  const boot = files.get(bootPath);
  if (!boot) throw new Error("The editor gzip has no public/paint/boot.js.");
  let source = new TextDecoder().decode(boot);
  source = installViewerHooks(source);
  source = rewriteLocalPaths(source);
  files.set(bootPath, new TextEncoder().encode(source));

  for (const [rel, bytes] of [...files]) {
    if (rel === bootPath) continue;
    const ext = extension(rel);
    if (!TEXT_EXT.has(ext)) continue;
    let text = new TextDecoder().decode(bytes);
    if (rel.endsWith(".html")) text = text.replaceAll('src="/public/paint/', 'src="./public/paint/');
    text = rewriteLocalPaths(text);
    files.set(rel, new TextEncoder().encode(text));
  }

  for (const [rel, bytes] of [...files]) {
    if (rel.startsWith("public/assets/")) files.set("assets/" + rel.slice("public/assets/".length), bytes);
  }

  const version = new TextDecoder().decode(files.get("version.txt") || new Uint8Array()).trim();
  const fonts = [...files.keys()].filter((name) => name.startsWith("fonts/") && name.endsWith(".woff"));
  const required = [
    "index.html",
    "version.txt",
    "public/paint/boot.js",
    "wwwroot/js/modules/document-loader.js",
    "fonts/Calibri-Regular.woff",
    "fonts/Cambria-Regular.woff",
  ];
  const missing = required.filter((name) => !files.has(name));
  if (missing.length) throw new Error("The editor gzip is incomplete: " + missing.join(", "));
  if (!version) throw new Error("The editor gzip has no version.");

  const index = new TextDecoder().decode(files.get("index.html"));
  const ready = new TextDecoder().decode(files.get(bootPath));
  if (!index.includes("./public/paint/boot.js")) throw new Error("The editor page does not load its own script.");
  if (!ready.includes("window.populate=")) throw new Error("The editor cannot replace an open document.");
  if (ready.includes(".unregister(")) throw new Error("The editor still removes the install option.");
  const external = runtimeExternalUrls(index + "\n" + ready);
  if (external.length) throw new Error("The editor still calls outside this site: " + external.join(", "));

  return {
    files,
    report: {
      ok: true,
      version,
      files: files.size,
      fonts: fonts.length,
      script: "./public/paint/boot.js",
      external: [],
    },
  };
}

function installViewerHooks(source) {
  // The viewer already exposes the same object the spreadsheet uses.
  if (source.includes("window.populate") && source.includes("editorReady")) {
    return source.replace(
      /navigator\.serviceWorker\?\.getRegistrations&&navigator\.serviceWorker\.getRegistrations\(\)\.then\(e=>e\.forEach\(e=>e\.unregister\(\)\)\)\.catch\(\(\)=>\{\}\)/,
      "0",
    );
  }

  const loader = /async function ([A-Za-z0-9_]+)\(\)\{for\(let e of\[[^\]]*\]\)try\{let t=await fetch\(e,\{cache:`no-store`\}\);if\(!t\.ok\)continue;let n=await t\.arrayBuffer\(\);if\(n\.byteLength<100\)continue;let\{importDocx:r\}=await ([A-Za-z0-9_]+)\(async\(\)=>\{let\{importDocx:e\}=await Promise\.resolve\(\)\.then\(\(\)=>\(([A-Za-z0-9_]+)\(\),([A-Za-z0-9_]+)\)\);return\{importDocx:e\}\},void 0\),i=await r\(n,`[^`]*`\);if\(U\.opened\)return!0;if\(i\?\.sections\?\.length\)return ([A-Za-z0-9_]+)\(`log`,`startup: imported `\+e\),([A-Za-z0-9_]+)\(i,`[^`]*`\),!0\}catch/;
  const found = source.match(loader);
  if (!found) throw new Error("The editor gzip has no document loader.");
  source = source.replace(
    loader,
    "async function $1(){const passed=new URLSearchParams(location.search).get(`src`);if(!passed)return!1;for(let e of[passed])try{let t=await fetch(e,{cache:`no-store`});if(!t.ok)continue;let n=await t.arrayBuffer();if(n.byteLength<100)continue;let{importDocx:r}=await $2(async()=>{let{importDocx:e}=await Promise.resolve().then(()=>($3(),$4));return{importDocx:e}},void 0),stem=decodeURIComponent((e.split(`/`).pop()||`document`).replace(/\\.docx$/i,``)),i=await r(n,stem);if(U.opened)return!0;if(i?.sections?.length)return $5(`log`,`startup: converted docx to JSON `+e),$6(i,stem+`.docx`),!0}catch",
  );

  source = source.replace(
    /navigator\.serviceWorker\?\.getRegistrations&&navigator\.serviceWorker\.getRegistrations\(\)\.then\(e=>e\.forEach\(e=>e\.unregister\(\)\)\)\.catch\(\(\)=>\{\}\)/,
    "0",
  );
  const closed = source.replace(
    /finally\{([A-Za-z0-9_]+)\(`log`,`startup: end`\),([A-Za-z0-9_]+)\(\)\}/,
    "finally{$1(`log`,`startup: end`),$2(),window.__editorReady?.()}",
  );
  if (closed === source) throw new Error("The editor gzip has no startup end.");
  source = closed;

  source +=
    "\nwindow.editorReady=new Promise((resolve)=>{window.__editorReady=resolve});" +
    "window.populate=async function(src){const response=await fetch(src,{cache:`no-store`});if(!response.ok)throw Error(`Could not open the document`);" +
    "const buffer=await response.arrayBuffer();const stem=decodeURIComponent((String(src).split(`/`).pop()||`document`).replace(/\\.docx$/i,``));" +
    "const {importDocx}=await " + found[2] + "(async()=>{const {importDocx:load}=await Promise.resolve().then(()=>(" +
    found[3] + "()," + found[4] + "));return{importDocx:load}},void 0);" +
    "const doc=await importDocx(buffer,stem);if(!doc?.sections?.length)throw Error(`The import returned no sections`);" +
    "U.opened=!0;" + found[6] + "(doc,stem+`.docx`)};\n";
  return source;
}

function rewriteLocalPaths(text) {
  return text
    .replaceAll("/public/documents/", "@@PUBLIC_DOC@@")
    .replaceAll("/documents/", VIEWER_PREFIX + "/documents/")
    .replaceAll("@@PUBLIC_DOC@@", VIEWER_PREFIX + "/documents/")
    .replaceAll("/fonts/", VIEWER_PREFIX + "/fonts/")
    .replaceAll("/assets/", VIEWER_PREFIX + "/assets/")
    .replaceAll("/version.txt", VIEWER_PREFIX + "/version.txt");
}

function runtimeExternalUrls(text) {
  const found = new Set();
  const pattern = /(?:src|href)\s*=\s*["']https?:\/\/[^"']+|fetch\(\s*[`"']https?:\/\/[^`"']+|url\(\s*["']?https?:\/\/[^"')]+/gi;
  for (const hit of text.match(pattern) || []) found.add(hit.slice(0, 160));
  return [...found];
}

function safeName(name) {
  const parts = String(name).split("/").filter(Boolean);
  if (parts[0] === "rich_text_editor") parts.shift();
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
