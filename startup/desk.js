export function connectDesk({ clientId, name, onUsers, onStatus }) {
  let socket = null;
  let retry = 0;
  let stopped = false;
  let timer = 0;
  let currentName = name;

  function send(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  function connect() {
    if (stopped) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${proto}//${location.host}/ws`);
    onStatus("Connecting", "");

    socket.addEventListener("open", () => {
      retry = 0;
      onStatus("Live", "live");
      send({ type: "hello" });
      if (currentName) send({ type: "addUser", clientId, name: currentName });
    });

    socket.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "error") {
        onStatus(data.error || "Could not join", "down");
        return;
      }
      if (Array.isArray(data.users)) onUsers(data.users);
    });

    socket.addEventListener("close", () => {
      if (stopped) return;
      onStatus("Reconnecting", "down");
      const wait = Math.min(8000, 500 * 2 ** retry);
      retry += 1;
      timer = setTimeout(connect, wait);
    });
  }

  const ping = setInterval(() => send({ type: "ping" }), 25000);
  connect();

  return {
    send,
    setName(next) {
      currentName = next;
      send({ type: "addUser", clientId, name: next });
    },
    close() {
      stopped = true;
      clearInterval(ping);
      clearTimeout(timer);
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    },
  };
}
