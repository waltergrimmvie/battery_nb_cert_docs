import { PresenceRoom } from "./room.js";
import { browserFiles } from "./browser-files.js";
import { downloadRichTextEditor, versionNumber, VIEWER_PREFIX } from "../server/refresh_editor.mjs";
import { downloadSpreadsheet, SHEET_PREFIX } from "../server/refresh_spreadsheet.mjs";

export { PresenceRoom };

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0",
};

const MODULE_HEADER = {
  "content-type": "text/javascript; charset=utf-8",
  ...NO_STORE,
};

const FILE_TYPE = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff": "font/woff",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
};

let editorFiles = new Map();
let sheetFiles = new Map();
let savedEditorVersion = 0;
let savedSheetVersion = 0;
let editorReady = false;
let sheetReady = false;
let installingEditor = null;
let installingSheet = null;

function editorFile(pathname) {
  if (!pathname.startsWith(VIEWER_PREFIX + "/")) return null;
  return editorFiles.get(pathname.slice(VIEWER_PREFIX.length + 1)) || null;
}

function sheetFile(pathname) {
  if (!pathname.startsWith(SHEET_PREFIX + "/")) return null;
  return sheetFiles.get(pathname.slice(SHEET_PREFIX.length + 1)) || null;
}

async function localEditorVersion(env) {
  if (savedEditorVersion) return savedEditorVersion;
  try {
    const stored = await env.ASSETS.fetch(new Request("https://desk.local/version_text_editor.txt"));
    if (stored.ok) savedEditorVersion = versionNumber(await stored.text());
  } catch {
    savedEditorVersion = 0;
  }
  return savedEditorVersion;
}

async function localSheetVersion(env) {
  if (savedSheetVersion) return savedSheetVersion;
  try {
    const stored = await env.ASSETS.fetch(new Request("https://desk.local/version_spreadsheet.txt"));
    if (stored.ok) savedSheetVersion = versionNumber(await stored.text());
  } catch {
    savedSheetVersion = 0;
  }
  return savedSheetVersion;
}

// Compare version_text_editor.txt with the text editor site. A newer gzip
// replaces the viewer in this worker before any page is returned.
async function ensureEditor(env) {
  if (!installingEditor) {
    const job = (async () => {
      const pack = await downloadRichTextEditor(await localEditorVersion(env));
      if (!pack.report.skipped && pack.files) {
        editorFiles = pack.files;
        savedEditorVersion = versionNumber(pack.report.version);
      }
      editorReady = true;
      return pack.report;
    })();
    installingEditor = job;
    job.finally(() => {
      if (installingEditor === job) installingEditor = null;
    });
  }
  return installingEditor;
}

// Compare version_spreadsheet.txt with spreadsheet.dev-q-prox.com. A newer
// gzip replaces the spreadsheet viewer the same way as the rich text editor.
async function ensureSheet(env) {
  if (!installingSheet) {
    const job = (async () => {
      const pack = await downloadSpreadsheet(await localSheetVersion(env));
      if (!pack.report.skipped && pack.files) {
        sheetFiles = pack.files;
        savedSheetVersion = versionNumber(pack.report.version);
      }
      sheetReady = true;
      return pack.report;
    })();
    installingSheet = job;
    job.finally(() => {
      if (installingSheet === job) installingSheet = null;
    });
  }
  return installingSheet;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }
      const id = env.PRESENCE.idFromName("battery-nb-cert-desk");
      return env.PRESENCE.get(id).fetch(request);
    }

    const isPage = url.pathname === "/" || url.pathname === "/index.html";
    const isRefresh = url.pathname === "/editor/refresh";
    const isSheetRefresh = url.pathname === "/spreadsheet/refresh";
    const isViewer = url.pathname.startsWith(VIEWER_PREFIX + "/");
    const isSheetViewer = url.pathname.startsWith(SHEET_PREFIX + "/");
    if (isPage || isRefresh || isSheetRefresh || (isViewer && !editorReady) || (isSheetViewer && !sheetReady)) {
      try {
        if (isSheetRefresh) {
          const report = await ensureSheet(env);
          return Response.json(report, { headers: NO_STORE });
        }
        if (isRefresh) {
          const report = await ensureEditor(env);
          return Response.json(report, { headers: NO_STORE });
        }
        if (isPage) {
          await Promise.all([ensureEditor(env), ensureSheet(env)]);
        } else if (isViewer && !editorReady) {
          await ensureEditor(env);
        } else if (isSheetViewer && !sheetReady) {
          await ensureSheet(env);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Download failed.";
        if (isRefresh || isSheetRefresh) {
          return Response.json({ ok: false, error: message }, { status: 502, headers: NO_STORE });
        }
        return new Response(message, {
          status: 502,
          headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE },
        });
      }
    }

    const fresh = editorFile(url.pathname) || sheetFile(url.pathname);
    if (fresh) {
      const type = FILE_TYPE[url.pathname.slice(url.pathname.lastIndexOf(".")).toLowerCase()] || "application/octet-stream";
      return new Response(fresh, { headers: { "content-type": type, ...NO_STORE } });
    }

    const moduleSource = browserFiles[url.pathname];
    if (typeof moduleSource === "string") {
      return new Response(moduleSource, { headers: MODULE_HEADER });
    }

    return env.ASSETS.fetch(request).then((response) => {
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(NO_STORE)) headers.set(key, value);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    });
  },
};
