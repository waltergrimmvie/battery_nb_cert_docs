const STORAGE_ID = "battery_nb_cert_docs.clientId";
const STORAGE_NAME = "battery_nb_cert_docs.userName";

const form = document.querySelector("#join");
const nameInput = document.querySelector("#name");
const you = document.querySelector("#you");
const rename = document.querySelector("#rename");
const statusEl = document.querySelector("#status");
const tbody = document.querySelector("#users");
const empty = document.querySelector("#empty");

const clientId = loadId();
let socket = null;
let users = [];
let retry = 0;
let joined = false;

nameInput.value = localStorage.getItem(STORAGE_NAME) || "";

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value;
  if (!name.trim()) return;
  localStorage.setItem(STORAGE_NAME, name.trim().slice(0, 64));
  joined = true;
  showYou();
  send({ type: "addUser", clientId, name });
});

rename.addEventListener("click", () => {
  joined = false;
  you.hidden = true;
  rename.hidden = true;
  nameInput.focus();
});

connect();

function loadId() {
  let id = localStorage.getItem(STORAGE_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_ID, id);
  }
  return id;
}

function showYou() {
  const name = localStorage.getItem(STORAGE_NAME);
  if (!name) return;
  you.hidden = false;
  you.textContent = `Signed on this browser as ${name}.`;
  rename.hidden = false;
}

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${proto}//${location.host}/ws`);
  setStatus("Connecting", "");

  socket.addEventListener("open", () => {
    retry = 0;
    setStatus("Live", "live");
    send({ type: "hello" });
    const name = localStorage.getItem(STORAGE_NAME);
    if (name) {
      joined = true;
      showYou();
      send({ type: "addUser", clientId, name });
    }
  });

  socket.addEventListener("message", (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === "error") {
      setStatus(data.error || "Could not join", "down");
      return;
    }
    if (Array.isArray(data.users)) render(data.users);
  });

  socket.addEventListener("close", () => {
    setStatus("Reconnecting", "down");
    const wait = Math.min(8000, 500 * 2 ** retry);
    retry += 1;
    setTimeout(connect, wait);
  });
}

setInterval(() => {
  if (socket && socket.readyState === WebSocket.OPEN) send({ type: "ping" });
}, 25000);

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function render(next) {
  users = next;
  tbody.replaceChildren();
  empty.hidden = users.length > 0;
  for (const user of users) {
    const tr = document.createElement("tr");
    if (user.id === clientId) tr.className = "mine";

    const nameCell = document.createElement("td");
    const name = document.createElement("span");
    name.className = `name ${user.color === "red" ? "red" : "green"}`;
    name.textContent = user.name;
    nameCell.append(name);
    if (user.id === clientId) {
      const mark = document.createElement("span");
      mark.textContent = " · you";
      mark.style.color = "var(--muted)";
      mark.style.fontWeight = "500";
      nameCell.append(mark);
    }

    const colorCell = document.createElement("td");
    const chip = document.createElement("span");
    chip.className = `chip ${user.color === "red" ? "red" : "green"}`;
    const dot = document.createElement("i");
    const label = document.createElement("span");
    label.textContent = user.color === "red" ? "Red" : "Green";
    chip.append(dot, label);
    colorCell.append(chip);

    const stateCell = document.createElement("td");
    stateCell.textContent = "Online";

    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toggle";
    button.textContent = "Toggle color";
    button.addEventListener("click", () => {
      send({ type: "toggleUser", clientId, targetId: user.id });
    });
    actionCell.append(button);

    tr.append(nameCell, colorCell, stateCell, actionCell);
    tbody.append(tr);
  }
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status${kind ? ` ${kind}` : ""}`;
}
