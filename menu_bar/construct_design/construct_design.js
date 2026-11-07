import { watchOnlineUsers } from "../online_users.js";

const HEADS_SVG = `<svg class="heads-svg" viewBox="0 0 48 32" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="4.2" opacity="0.45"/>
    <path d="M4.2 27.5c.7-5 3.4-7.6 6.8-7.6s6.1 2.6 6.8 7.6" opacity="0.45"/>
    <circle cx="37" cy="11" r="4.2" opacity="0.45"/>
    <path d="M30.2 27.5c.7-5 3.4-7.6 6.8-7.6s6.1 2.6 6.8 7.6" opacity="0.45"/>
    <circle cx="24" cy="12.2" r="5.1"/>
    <path d="M14.2 29.2c1.1-6.4 4.7-9.4 9.8-9.4s8.7 3 9.8 9.4"/>
  </g>
</svg>`;

export function constructMenuDesign(menuBar, { name, onAnotherName }) {
  menuBar.replaceChildren();

  const bar = document.createElement("div");
  bar.className = "menu-bar-inner";

  const brand = document.createElement("div");
  brand.className = "brand";
  const kicker = document.createElement("p");
  kicker.className = "brand-kicker";
  kicker.textContent = "Notified body";
  const title = document.createElement("p");
  title.className = "brand-title";
  title.textContent = "Battery NB";
  brand.append(kicker, title);

  const status = document.createElement("p");
  status.className = "status";
  status.textContent = "Connecting";

  const field = document.createElement("div");
  field.className = "signed-field";
  const fieldLabel = document.createElement("span");
  fieldLabel.textContent = "Signed in";
  const fieldName = document.createElement("strong");
  fieldName.textContent = name;
  field.append(fieldLabel, fieldName);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "heads";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "desk-menu");

  const face = document.createElement("span");
  face.className = "heads-face";
  face.innerHTML = HEADS_SVG;
  const onlineCount = document.createElement("span");
  onlineCount.className = "heads-count";
  onlineCount.setAttribute("aria-hidden", "true");
  onlineCount.textContent = "0";
  face.append(onlineCount);
  button.append(face);

  const anchor = document.createElement("div");
  anchor.className = "menu-anchor";

  const panel = document.createElement("div");
  panel.className = "mega";
  panel.id = "desk-menu";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "People on the desk");

  const head = document.createElement("div");
  head.className = "mega-head";
  const heading = document.createElement("h2");
  heading.textContent = "On the desk";
  const count = document.createElement("p");
  count.className = "mega-count";
  count.textContent = "0 online";
  head.append(heading, count);

  const list = document.createElement("div");
  list.className = "mega-grid";

  const foot = document.createElement("div");
  foot.className = "mega-foot";
  const another = document.createElement("button");
  another.type = "button";
  another.className = "text-btn";
  another.textContent = "Use another name";
  another.addEventListener("click", () => onAnotherName());
  foot.append(another);

  panel.append(head, list, foot);
  anchor.append(button, panel);

  const cluster = document.createElement("div");
  cluster.className = "menu-cluster";
  cluster.append(field, anchor);

  bar.append(brand, status, cluster);
  menuBar.append(bar);

  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function showCount(total) {
    onlineCount.textContent = String(total);
    button.setAttribute("aria-label", `Who is on the desk, ${total} online`);
  }

  button.addEventListener("click", () => setOpen(panel.hidden));
  const unwatchOnline = watchOnlineUsers((users) => showCount(users.length));

  return {
    button,
    panel,
    list,
    count,
    unwatchOnline,
    close() {
      setOpen(false);
    },
    setStatus(text, kind) {
      status.textContent = text;
      status.className = `status${kind ? ` ${kind}` : ""}`;
    },
    setName(next) {
      fieldName.textContent = next;
    },
  };
}
