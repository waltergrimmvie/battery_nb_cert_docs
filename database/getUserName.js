// Workers KV users table.
// There is no CREATE TABLE. The whole table is one JSON document at
// key "table:users", shaped exactly like setup/create-database.json.
// This file is the write path: getUserName() stores the user.

const TABLE_KEY = "table:users";

function emptyTable() {
  return { table: "users", updatedAt: null, rows: [] };
}

export async function loadUsers(kv) {
  if (!kv) return [];
  const stored = await kv.get(TABLE_KEY, "json");
  if (!stored || !Array.isArray(stored.rows)) return [];
  return stored.rows;
}

export async function saveUsers(kv, rows) {
  if (!kv) return;
  await kv.put(
    TABLE_KEY,
    JSON.stringify({
      table: "users",
      updatedAt: new Date().toISOString(),
      rows,
    }),
  );
}

export async function readUserName(kv, id) {
  const rows = await loadUsers(kv);
  return rows.find((row) => row.id === id) ?? null;
}

/**
 * Write one user into the users table (insert or replace by id).
 * Returns the stored row. No-ops when the KV binding is missing,
 * so a local room can still run before the namespace exists.
 */
export async function getUserName(kv, user) {
  if (!user || typeof user.id !== "string" || typeof user.name !== "string") {
    throw new Error("users table requires id and name");
  }
  if (!kv) return user;
  const rows = await loadUsers(kv);
  const index = rows.findIndex((row) => row.id === user.id);
  if (index === -1) rows.push(user);
  else rows[index] = user;
  await saveUsers(kv, rows);
  return user;
}
