/** Snapshot of everyone whose HTML page is currently open. */
export function online(users) {
  return [...users.values()]
    .filter((user) => user.online)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
