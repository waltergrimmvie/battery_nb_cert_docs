import { PresenceRoom } from "./room.js";
import { browserFiles } from "./browser-files.js";

export { PresenceRoom };

const MODULE_HEADER = {
  "content-type": "text/javascript; charset=utf-8",
  "cache-control": "no-cache",
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

    return env.ASSETS.fetch(request);
  },
};
