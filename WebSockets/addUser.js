const NAME_MAX = 64;

export function sanitizeName(name) {
  if (typeof name !== "string") return "";
  return name.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, NAME_MAX);
}

/**
 * Put a user into the live room map and mark them online.
 * Keeps an existing red/green color when the same browser returns.
 * Returns null when the id or name is unusable.
 */
export function addUser(users, { id, name }) {
  if (typeof id !== "string" || id.length === 0 || id.length > 80) return null;
  const clean = sanitizeName(name);
  if (!clean) return null;

  const existing = users.get(id);
  const now = new Date().toISOString();
  const color = existing?.color === "red" || existing?.color === "green" ? existing.color : "green";
  const user = {
    id,
    name: clean,
    color,
    online: true,
    connectedAt: existing?.connectedAt || now,
    updatedAt: now,
  };
  users.set(id, user);
  return user;
}
