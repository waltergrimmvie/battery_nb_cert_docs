/** Mark a known user online again. Returns null if they were never added. */
export function connected(users, { id }) {
  const user = users.get(id);
  if (!user) return null;
  user.online = true;
  user.updatedAt = new Date().toISOString();
  return user;
}
