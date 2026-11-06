import { PresenceRoom } from "./room.js";

export { PresenceRoom };

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
    return new Response("Not found", { status: 404 });
  },
};
