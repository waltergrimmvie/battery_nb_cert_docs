import test from "node:test";
import assert from "node:assert/strict";
import { addUser } from "../WebSockets/addUser.js";
import { online } from "../WebSockets/online.js";
import { connected } from "../WebSockets/connected.js";
import { disconnected } from "../WebSockets/disconnected.js";
import { toggleUser } from "../Functions/toggleUser.js";
import { getUserName, loadUsers, readUserName } from "../database/getUserName.js";

function memoryKv() {
  const store = new Map();
  return {
    async get(key, type) {
      const value = store.get(key);
      if (value == null) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

test("addUser stores a green online user and keeps color on return", () => {
  const users = new Map();
  const first = addUser(users, { id: "a", name: "  Walter  " });
  assert.equal(first.name, "Walter");
  assert.equal(first.color, "green");
  assert.equal(first.online, true);
  toggleUser(users, { id: "a" });
  const again = addUser(users, { id: "a", name: "Walter Grimm" });
  assert.equal(again.color, "red");
  assert.equal(again.name, "Walter Grimm");
  assert.equal(addUser(users, { id: "a", name: "   " }), null);
});

test("toggle flips only while online and online() hides the rest", () => {
  const users = new Map();
  addUser(users, { id: "b", name: "Bea" });
  addUser(users, { id: "a", name: "Ada" });
  assert.deepEqual(online(users).map((user) => user.name), ["Ada", "Bea"]);
  assert.equal(toggleUser(users, { id: "b" }).color, "red");
  assert.equal(toggleUser(users, { id: "b" }).color, "green");
  disconnected(users, { id: "b", stillConnected: false });
  assert.equal(toggleUser(users, { id: "b" }), null);
  assert.deepEqual(online(users).map((user) => user.id), ["a"]);
  disconnected(users, { id: "a", stillConnected: true });
  assert.equal(users.get("a").online, true);
  connected(users, { id: "b" });
  assert.equal(users.get("b").online, true);
});

test("getUserName writes and replaces a row in the users table", async () => {
  const kv = memoryKv();
  await getUserName(kv, {
    id: "a",
    name: "Ada",
    color: "green",
    online: true,
    connectedAt: "t",
    updatedAt: "t",
  });
  await getUserName(kv, {
    id: "a",
    name: "Ada",
    color: "red",
    online: false,
    connectedAt: "t",
    updatedAt: "t2",
  });
  const rows = await loadUsers(kv);
  assert.equal(rows.length, 1);
  assert.equal((await readUserName(kv, "a")).color, "red");
  const stored = await kv.get("table:users", "json");
  assert.equal(stored.table, "users");
});
