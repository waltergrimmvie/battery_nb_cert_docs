/**
 * A socket closed. Stay online when another tab with the same id is
 * still connected; otherwise drop them from the live list.
 */
export function disconnected(users, { id, stillConnected }) {
  const user = users.get(id);
  if (!user) return null;
  user.online = Boolean(stillConnected);
  user.updatedAt = new Date().toISOString();
  return user;
}
