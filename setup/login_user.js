export const KNOWN_NAMES = ["Judy", "Marcus", "Wei", "Walter"];

const STORAGE_NAME = "user name";
const LEGACY_NAME = "battery_nb_cert_docs.userName";

export function showLogin(root, { onEnter }) {
  root.replaceChildren();

  const gate = document.createElement("main");
  gate.className = "gate";

  const card = document.createElement("section");
  card.className = "panel gate-card";

  const kicker = document.createElement("p");
  kicker.className = "kicker";
  kicker.textContent = "Notified body floor";

  const title = document.createElement("h1");
  title.textContent = "Battery NB Cert Desk";

  const lede = document.createElement("p");
  lede.className = "lede";
  lede.textContent = "Choose your name and press Enter. This browser skips this step once that name is stored.";

  const form = document.createElement("form");
  form.id = "join";

  const label = document.createElement("label");
  label.htmlFor = "known-name";
  label.textContent = "Your name";

  const select = document.createElement("select");
  select.id = "known-name";
  select.name = "name";
  select.required = true;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a name";
  select.append(placeholder);
  for (const name of KNOWN_NAMES) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  }

  const remembered = readRememberedName();
  if (KNOWN_NAMES.includes(remembered)) select.value = remembered;

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Enter";
  button.disabled = !KNOWN_NAMES.includes(select.value);

  select.addEventListener("change", () => {
    button.disabled = !KNOWN_NAMES.includes(select.value);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!KNOWN_NAMES.includes(select.value)) return;
    onEnter(select.value);
  });

  form.append(label, select, button);
  card.append(kicker, title, lede, form);
  gate.append(card);
  root.append(gate);
  select.focus();
}

function readRememberedName() {
  try {
    return localStorage.getItem(STORAGE_NAME) || localStorage.getItem(LEGACY_NAME) || "";
  } catch {
    return "";
  }
}
