import { PresenceRoom } from "./room.js";
import { browserFiles } from "./browser-files.js";

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
