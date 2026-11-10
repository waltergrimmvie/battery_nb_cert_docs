import { PresenceRoom } from "./room.js";
import { browserFiles } from "./browser-files.js";
import { downloadRichTextEditor, versionNumber, VIEWER_PREFIX } from "../server/refresh_editor.mjs";
import { downloadSpreadsheet, SHEET_PREFIX } from "../server/refresh_spreadsheet.mjs";
import { downloadPowerpoint, PPT_PREFIX } from "../server/refresh_powerpoint.mjs";
import { downloadPdf, PDF_PREFIX } from "../server/refresh_pdf.mjs";
import { downloadGantt, GANTT_PREFIX } from "../server/refresh_gantt.mjs";

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
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".csv": "text/csv",
  ".xml": "application/xml",
  ".xls": "application/vnd.ms-excel",
};

let editorFiles = new Map();
let sheetFiles = new Map();
let savedEditorVersion = 0;
let savedSheetVersion = 0;
let editorReady = false;
let sheetReady = false;
let pptReady = false;
let installingEditor = null;
let installingSheet = null;
let installingPpt = null;
let pptFiles = new Map();
let savedPptVersion = 0;
let pdfFiles = new Map();
let savedPdfVersion = 0;
let pdfReady = false;
let installingPdf = null;
let ganttFiles = new Map();
let savedGanttVersion = 0;
let ganttReady = false;
let installingGantt = null;

function editorFile(pathname) {
  if (!pathname.startsWith(VIEWER_PREFIX + "/")) return null;
  return editorFiles.get(pathname.slice(VIEWER_PREFIX.length + 1)) || null;
}

function sheetFile(pathname) {
  if (!pathname.startsWith(SHEET_PREFIX + "/")) return null;
  return sheetFiles.get(pathname.slice(SHEET_PREFIX.length + 1)) || null;
}

function pptFile(pathname) {
  if (!pathname.startsWith(PPT_PREFIX + "/")) return null;
  return pptFiles.get(pathname.slice(PPT_PREFIX.length + 1)) || null;
}

function pdfFile(pathname) {
  if (!pathname.startsWith(PDF_PREFIX + "/")) return null;
  return pdfFiles.get(pathname.slice(PDF_PREFIX.length + 1)) || null;
}

function ganttFile(pathname) {
  if (!pathname.startsWith(GANTT_PREFIX + "/")) return null;
  return ganttFiles.get(pathname.slice(GANTT_PREFIX.length + 1)) || null;
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

async function localPptVersion(env) {
  if (savedPptVersion) return savedPptVersion;
  try {
    const stored = await env.ASSETS.fetch(new Request("https://desk.local/version_powerpoint.txt"));
    if (stored.ok) savedPptVersion = versionNumber(await stored.text());
  } catch {
    savedPptVersion = 0;
  }
  return savedPptVersion;
}

async function localPdfVersion(env) {
  if (savedPdfVersion) return savedPdfVersion;
  try {
    const stored = await env.ASSETS.fetch(new Request("https://desk.local/version_pdf.txt"));
    if (stored.ok) savedPdfVersion = versionNumber(await stored.text());
  } catch {
    savedPdfVersion = 0;
  }
  return savedPdfVersion;
}

async function localGanttVersion(env) {
  if (savedGanttVersion) return savedGanttVersion;
  try {
    const stored = await env.ASSETS.fetch(new Request("https://desk.local/version_gantt.txt"));
    if (stored.ok) savedGanttVersion = versionNumber(await stored.text());
  } catch {
    savedGanttVersion = 0;
  }
  return savedGanttVersion;
}

// Compare version_text_editor.txt with the text editor site. A newer gzip
// replaces the viewer in this worker before any page is returned.
async function ensureEditor(env) {
  if (editorFiles.size && savedEditorVersion) return { ok: true, skipped: true, version: String(savedEditorVersion), memory: true };
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
  if (sheetFiles.size && savedSheetVersion) return { ok: true, skipped: true, version: String(savedSheetVersion), memory: true };
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

// Compare version_powerpoint.txt with presentation.dev-qprox.com. A newer
// gzip replaces the PowerPoint viewer the same way as the rich text editor.
async function ensurePpt(env) {
  if (pptFiles.size && savedPptVersion) return { ok: true, skipped: true, version: String(savedPptVersion), memory: true };
  if (!installingPpt) {
    const job = (async () => {
      const pack = await downloadPowerpoint(await localPptVersion(env));
      if (!pack.report.skipped && pack.files) {
        pptFiles = pack.files;
        savedPptVersion = versionNumber(pack.report.version);
      }
      pptReady = true;
      return pack.report;
    })();
    installingPpt = job;
    job.finally(() => {
      if (installingPpt === job) installingPpt = null;
    });
  }
  return installingPpt;
}

// Compare version_pdf.txt with pdf.dev-q-prox.com. A newer gzip replaces
// the PDF viewer the same way as the other three.
async function ensurePdf(env) {
  if (pdfFiles.size && savedPdfVersion) return { ok: true, skipped: true, version: String(savedPdfVersion), memory: true };
  if (!installingPdf) {
    const job = (async () => {
      const pack = await downloadPdf(await localPdfVersion(env));
      if (!pack.report.skipped && pack.files) {
        pdfFiles = pack.files;
        savedPdfVersion = versionNumber(pack.report.version);
      }
      pdfReady = true;
      return pack.report;
    })();
    installingPdf = job;
    job.finally(() => {
      if (installingPdf === job) installingPdf = null;
    });
  }
  return installingPdf;
}

async function ensureGantt(env) {
  if (ganttFiles.size && savedGanttVersion) return { ok: true, skipped: true, version: String(savedGanttVersion), memory: true };
  if (!installingGantt) {
    const job = (async () => {
      const pack = await downloadGantt(await localGanttVersion(env));
      if (!pack.report.skipped && pack.files) {
        ganttFiles = pack.files;
        savedGanttVersion = versionNumber(pack.report.version);
      }
      ganttReady = true;
      return pack.report;
    })();
    installingGantt = job;
    job.finally(() => {
      if (installingGantt === job) installingGantt = null;
    });
  }
  return installingGantt;
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
    const isPptRefresh = url.pathname === "/powerpoint/refresh";
    const isPdfRefresh = url.pathname === "/pdf/refresh";
    const isGanttRefresh = url.pathname === "/gantt/refresh";
    const isViewer = url.pathname.startsWith(VIEWER_PREFIX + "/");
    const isSheetViewer = url.pathname.startsWith(SHEET_PREFIX + "/");
    const isPptViewer = url.pathname.startsWith(PPT_PREFIX + "/");
    const isPdfViewer = url.pathname.startsWith(PDF_PREFIX + "/");
    const isGanttViewer = url.pathname.startsWith(GANTT_PREFIX + "/");
    if (isPage || isRefresh || isSheetRefresh || isPptRefresh || isPdfRefresh || isGanttRefresh || (isViewer && !editorReady) || (isSheetViewer && !sheetReady) || (isPptViewer && !pptReady) || (isPdfViewer && !pdfReady) || (isGanttViewer && !ganttReady)) {
      try {
        if (isGanttRefresh) {
          const report = await ensureGantt(env);
          return Response.json(report, { headers: NO_STORE });
        }
        if (isPdfRefresh) {
          const report = await ensurePdf(env);
          return Response.json(report, { headers: NO_STORE });
        }
        if (isPptRefresh) {
          const report = await ensurePpt(env);
          return Response.json(report, { headers: NO_STORE });
        }
        if (isSheetRefresh) {
          const report = await ensureSheet(env);
          return Response.json(report, { headers: NO_STORE });
        }
        if (isRefresh) {
          const report = await ensureEditor(env);
          return Response.json(report, { headers: NO_STORE });
        }
        if (isPage) {
          // The page itself does not wait. A viewer is prepared when it is
          // opened, and a matching version is read from the colo cache.
        } else if (isViewer && !editorReady) {
          await ensureEditor(env);
        } else if (isSheetViewer && !sheetReady) {
          await ensureSheet(env);
        } else if (isPptViewer && !pptReady) {
          await ensurePpt(env);
        } else if (isPdfViewer && !pdfReady) {
          await ensurePdf(env);
        } else if (isGanttViewer && !ganttReady) {
          await ensureGantt(env);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Download failed.";
        if (isRefresh || isSheetRefresh || isPptRefresh || isPdfRefresh || isGanttRefresh) {
          return Response.json({ ok: false, error: message }, { status: 502, headers: NO_STORE });
        }
        return new Response(message, {
          status: 502,
          headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE },
        });
      }
    }

    const versionFile = {
      "/version_text_editor.txt": savedEditorVersion,
      "/version_spreadsheet.txt": savedSheetVersion,
      "/version_powerpoint.txt": savedPptVersion,
      "/version_pdf.txt": savedPdfVersion,
      "/version_gantt.txt": savedGanttVersion,
    };
    if (Object.prototype.hasOwnProperty.call(versionFile, url.pathname)) {
      return new Response(String(versionFile[url.pathname] || "0") + "\n", {
        headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE },
      });
    }

    const fresh = editorFile(url.pathname) || sheetFile(url.pathname) || pptFile(url.pathname) || pdfFile(url.pathname) || ganttFile(url.pathname);
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
