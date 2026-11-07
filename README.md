# battery_nb_cert_docs

Live desk for the battery notified-body floor. The browser asks for a name only when IndexedDB does not already have one. After that it opens the main page: a menu bar, a tree, and a content pane. The three-heads icon shows how many people are online and opens a mega menu of everyone currently on the desk. A toggle on a person flips that name between red and green for everyone at once.

The page shell is static modules. The real-time room is one Cloudflare Durable Object. The `users` table is Workers KV.

## How a name moves

1. [startup/startup.js](startup/startup.js) reads IndexedDB (`battery_nb_cert_docs` / `session` / `user`). A known name there skips login. Otherwise [setup/login_user.js](setup/login_user.js) shows a dropdown — Judy, Marcus, Wei, Walter — and Enter. There is no free-text name. The same module is the only place a name is chosen.
2. The browser keeps a stable id in `localStorage`. The chosen name is also mirrored under `user name` for the next prompt, but IndexedDB is what decides whether login shows.
3. [main_page/construct_main_page.js](main_page/construct_main_page.js) builds the shell. [menu_bar/construct_design/construct_design.js](menu_bar/construct_design/construct_design.js) adds the signed-in field and the three-heads icon. [menu_bar/online_users.js](menu_bar/online_users.js) keeps the array of people online and writes that count under the heads. [menu_bar/populate/populate.js](menu_bar/populate/populate.js) fills the mega menu.
4. On Enter the page opens `wss://<your-domain>/ws`.
5. The Worker in [src/index.js](src/index.js) accepts the `/ws` upgrade and forwards it to a single Durable Object named `battery-nb-cert-desk`. It also serves the page modules listed above. [scripts/embed-browser.mjs](scripts/embed-browser.mjs) copies those files into [src/browser-files.js](src/browser-files.js) so a deploy with no build step can still serve them. Run `node scripts/embed-browser.mjs` after editing a page module.
6. [WebSockets/addUser.js](WebSockets/addUser.js) puts the person in the in-memory online array.
7. [database/getUserName.js](database/getUserName.js) writes that row into the KV document `table:users`.
8. [WebSockets/connected.js](WebSockets/connected.js) marks them online. The object then sends the full online list to every socket.
9. A toggle in the mega menu calls [Functions/toggleUser.js](Functions/toggleUser.js), writes the new color through `getUserName`, and broadcasts again.
10. When the last socket for that id closes, [WebSockets/disconnected.js](WebSockets/disconnected.js) sets `online` to false and the row leaves the menu. The KV row stays, so the color is still there next time.

Workers cannot hold a WebSocket fan-out by themselves. Each request can land on a different isolate. The Durable Object is the one place that owns every socket for this desk. KV is the durable copy of the table. The object is the only writer, so the lack of KV transactions does not race.

The first design draft is [grok_rules.txt](grok_rules.txt).

## Layout

| Path | Role |
| --- | --- |
| [startup/startup.js](startup/startup.js) | Boot: IndexedDB, then login or main page |
| [setup/login_user.js](setup/login_user.js) | Name dropdown and Enter |
| [main_page/construct_main_page.js](main_page/construct_main_page.js) | Menu bar, tree, slider, content |
| [main_page/demo_tree.js](main_page/demo_tree.js) | Five demo roots |
| [menu_bar/construct_design/construct_design.js](menu_bar/construct_design/construct_design.js) | Three-heads icon, online count, and mega menu shell |
| [menu_bar/online_users.js](menu_bar/online_users.js) | Array of users currently online |
| [menu_bar/populate/populate.js](menu_bar/populate/populate.js) | People currently logged in |
| [grok_rules.txt](grok_rules.txt) | Design draft |
| [public/index.html](public/index.html) | Loads startup.js |
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
