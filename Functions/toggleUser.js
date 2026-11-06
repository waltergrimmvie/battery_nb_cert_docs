/** Flip a live user's name color between red and green. */
export function toggleUser(users, { id }) {
  const user = users.get(id);
  if (!user || !user.online) return null;
  user.color = user.color === "red" ? "green" : "red";
  user.updatedAt = new Date().toISOString();
  return user;
}
