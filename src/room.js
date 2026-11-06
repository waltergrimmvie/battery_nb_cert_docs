import { DurableObject } from "cloudflare:workers";
import { getUserName, loadUsers } from "../database/getUserName.js";
import { addUser } from "../WebSockets/addUser.js";
import { online } from "../WebSockets/online.js";
import { connected } from "../WebSockets/connected.js";
import { disconnected } from "../WebSockets/disconnected.js";
import { toggleUser } from "../Functions/toggleUser.js";

export class PresenceRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.users = new Map();
    this.ready = ctx.blockConcurrencyWhile(() => this.load());
  }

  async load() {
    const rows = await loadUsers(this.env.USERS_DB);
    this.users = new Map(rows.map((row) => [row.id, row]));
    this.markSocketsOnline();
  }

  markSocketsOnline() {
    for (const user of this.users.values()) user.online = false;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment?.id && this.users.has(attachment.id)) {
        this.users.get(attachment.id).online = true;
      }
    }
  }

  otherSockets(id, except) {
    let count = 0;
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      if (socket.deserializeAttachment()?.id === id) count += 1;
    }
    return count;
  }

  async fetch(request) {
    await this.ready;
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this.ready;
    let data;
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      data = JSON.parse(text);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;

    if (data.type === "hello") {
      this.send(ws, { type: "online", users: online(this.users) });
      return;
    }
    if (data.type === "ping") {
      this.send(ws, { type: "pong" });
      return;
    }
    if (data.type === "addUser") {
      const user = addUser(this.users, { id: data.clientId, name: data.name });
      if (!user) {
        this.send(ws, { type: "error", error: "Enter a name first." });
        return;
      }
      ws.serializeAttachment({ id: user.id });
      connected(this.users, { id: user.id });
      await getUserName(this.env.USERS_DB, user);
      this.broadcast({ type: "connected", user, users: online(this.users) });
      return;
    }
    if (data.type === "toggleUser") {
      const targetId = data.targetId || ws.deserializeAttachment()?.id;
      const user = toggleUser(this.users, { id: targetId });
      if (!user) return;
      await getUserName(this.env.USERS_DB, user);
      this.broadcast({ type: "toggled", user, users: online(this.users) });
    }
  }

  async webSocketClose(ws) {
    await this.ready;
    const id = ws.deserializeAttachment()?.id;
    if (!id) return;
    const user = disconnected(this.users, {
      id,
      stillConnected: this.otherSockets(id, ws) > 0,
    });
    if (user) await getUserName(this.env.USERS_DB, user);
    this.broadcast({ type: "disconnected", user, users: online(this.users) });
  }

  send(ws, payload) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // The socket is already gone.
    }
  }

  broadcast(payload) {
    const text = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(text);
      } catch {
        // Skip a socket that closed between the snapshot and the send.
      }
    }
  }
}
