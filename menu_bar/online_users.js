// The live array of everyone currently on the desk.
// Login and logout replace this array. The three-heads icon reads its length.

const onlineUsers = [];
const listeners = new Set();

export function getOnlineUsers() {
  return onlineUsers;
}

export function setOnlineUsers(next) {
  const incoming = Array.isArray(next) ? next : [];
  onlineUsers.splice(0, onlineUsers.length, ...incoming);
  const snapshot = onlineUsers.slice();
  for (const listener of listeners) listener(snapshot);
  return onlineUsers.length;
}

export function watchOnlineUsers(listener) {
  listeners.add(listener);
  listener(onlineUsers.slice());
  return () => listeners.delete(listener);
}
