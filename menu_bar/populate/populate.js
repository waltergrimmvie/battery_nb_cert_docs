export function populateMenu(list, users, { clientId, onToggle, count }) {
  list.replaceChildren();
  const online = Array.isArray(users) ? users : [];
  if (count) count.textContent = online.length === 1 ? "1 online" : `${online.length} online`;

  if (online.length === 0) {
    const empty = document.createElement("p");
    empty.className = "mega-empty";
    empty.textContent = "Nobody is on the desk yet.";
    list.append(empty);
    return;
  }

  for (const user of online) {
    const card = document.createElement("article");
    card.className = "person";
    if (user.id === clientId) card.classList.add("mine");

    const tone = user.color === "red" ? "red" : "green";

    const avatar = document.createElement("span");
    avatar.className = `avatar ${tone}`;
    avatar.textContent = initials(user.name);

    const body = document.createElement("div");
    body.className = "person-body";

    const name = document.createElement("p");
    name.className = `person-name ${tone}`;
    name.textContent = user.name;
    if (user.id === clientId) {
      const you = document.createElement("span");
      you.className = "you-tag";
      you.textContent = "you";
      name.append(you);
    }

    const meta = document.createElement("p");
    meta.className = "person-meta";
    meta.textContent = tone === "red" ? "Red · online" : "Green · online";
    body.append(name, meta);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "toggle";
    button.textContent = "Toggle";
    button.addEventListener("click", () => onToggle(user.id));

    card.append(avatar, body, button);
    list.append(card);
  }
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0] || "").join("").toUpperCase();
  return letters || "?";
}
