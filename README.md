# battery_nb_cert_docs

Live desk for the battery notified-body floor. A person opens the HTML page, types a name, presses Enter, and every other open page sees them. Each row has a button that flips that name between red and green for everyone at once.

The page is static. The real-time room is one Cloudflare Durable Object. The `users` table is Workers KV.

## How a name moves

1. The browser keeps a stable id and the name in `localStorage`.
2. On Enter it opens `wss://<your-domain>/ws` (or reuses the socket it opened on load).
3. The Worker in [src/index.js](src/index.js) accepts only the `/ws` upgrade and forwards it to a single Durable Object named `battery-nb-cert-desk`.
4. [WebSockets/addUser.js](WebSockets/addUser.js) puts the person in the in-memory online array.
5. [database/getUserName.js](database/getUserName.js) writes that row into the KV document `table:users`.
6. [WebSockets/connected.js](WebSockets/connected.js) marks them online. The object then sends the full online list to every socket.
7. A toggle click calls [Functions/toggleUser.js](Functions/toggleUser.js), writes the new color through `getUserName`, and broadcasts again.
8. When the last socket for that id closes, [WebSockets/disconnected.js](WebSockets/disconnected.js) sets `online` to false and the row leaves the table. The KV row stays, so the color is still there next time.

Workers cannot hold a WebSocket fan-out by themselves. Each request can land on a different isolate. The Durable Object is the one place that owns every socket for this desk. KV is the durable copy of the table. The object is the only writer, so the lack of KV transactions does not race.

## Layout

| Path | Role |
| --- | --- |
| [public/index.html](public/index.html) | Name field, Enter, live table |
| [public/client.js](public/client.js) | localStorage, WebSocket, redraw |
| [setup/create-database.json](setup/create-database.json) | Schema that creates the `users` table contract |
| [database/getUserName.js](database/getUserName.js) | Read and write the users table in KV |
| [WebSockets/addUser.js](WebSockets/addUser.js) | Add or update a user on the desk |
| [WebSockets/online.js](WebSockets/online.js) | The array of users who are online |
| [WebSockets/connected.js](WebSockets/connected.js) | Mark a user connected |
| [WebSockets/disconnected.js](WebSockets/disconnected.js) | Mark a user disconnected |
| [Functions/toggleUser.js](Functions/toggleUser.js) | Flip red / green |
| [src/room.js](src/room.js) | WebSocket server (Durable Object) |
| [wrangler.jsonc](wrangler.jsonc) | Assets, KV binding, Durable Object |

## The users table

KV is a key-value store, not SQL. [setup/create-database.json](setup/create-database.json) is the create step: it names the namespace `battery-nb-cert-users` and the table `users`. The first write stores this document at key `table:users`:

```json
{
  "table": "users",
  "updatedAt": "2026-11-06T16:00:00.000Z",
  "rows": [
    {
      "id": "browser-uuid",
      "name": "Ada",
      "color": "green",
      "online": true,
      "connectedAt": "2026-11-06T16:00:00.000Z",
      "updatedAt": "2026-11-06T16:00:00.000Z"
    }
  ]
}
```

Columns: `id`, `name`, `color` (`red` or `green`), `online`, `connectedAt`, `updatedAt`.

## Messages

Browser to server:

```json
{ "type": "hello" }
{ "type": "addUser", "clientId": "...", "name": "Ada" }
{ "type": "toggleUser", "clientId": "...", "targetId": "..." }
{ "type": "ping" }
```

Server to every browser:

```json
{ "type": "connected", "user": {}, "users": [] }
{ "type": "disconnected", "user": {}, "users": [] }
{ "type": "toggled", "user": {}, "users": [] }
{ "type": "online", "users": [] }
```

`users` is always the current online array. The page replaces the table from that array. Names are rendered as text, never as HTML.

## Deploy from GitHub (no local Wrangler)

1. In the Cloudflare dashboard open **Workers & Pages** → **Create** → **Import a repository**.
2. Choose `waltergrimmvie/battery_nb_cert_docs`, production branch `main`.
3. Build command: leave empty. Deploy command: `npx wrangler deploy`.
4. After the first deploy, open the Worker → **Domains** and add your domain.

`wrangler.jsonc` asks Wrangler to create the `USERS_DB` KV namespace on deploy. If the Git build stops because the namespace id is missing, create a KV namespace called `battery-nb-cert-users`, put its id on the binding, and push:

```jsonc
"kv_namespaces": [{ "binding": "USERS_DB", "id": "PASTE_ID_HERE" }]
```

The Durable Object migration `v1` in `wrangler.jsonc` is applied by the same deploy.

Optional local check, from this folder:

```sh
npm install
npm test
npx wrangler dev
```

Then open the printed URL in two browsers, enter two names, and toggle a color.
