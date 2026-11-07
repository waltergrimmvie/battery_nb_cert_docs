import { PresenceRoom } from "./room.js";
import { browserFiles } from "./browser-files.js";
import { downloadRichTextEditor, VIEWER_PREFIX } from "../server/refresh_editor.mjs";

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
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff": "font/woff",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

let editorFiles = new Map();

function editorFile(pathname) {
  if (!pathname.startsWith(VIEWER_PREFIX + "/")) return null;
  return editorFiles.get(pathname.slice(VIEWER_PREFIX.length + 1)) || null;
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

    if (url.pathname === "/editor/refresh") {
      try {
        const pack = await downloadRichTextEditor();
        editorFiles = pack.files;
        return Response.json(pack.report, { headers: NO_STORE });
      } catch (error) {
        return Response.json(
          { ok: false, error: error instanceof Error ? error.message : "Download failed." },
          { status: 502, headers: NO_STORE },
        );
      }
    }

    const fresh = editorFile(url.pathname);
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