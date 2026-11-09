const stamp = new URL(import.meta.url).search;
const { KNOWN_NAMES, showLogin } = await import(`../setup/login_user.js${stamp}`);
const { constructMainPage } = await import(`../main_page/construct_main_page.js${stamp}`);
const { constructMenuDesign } = await import(`../menu_bar/construct_design/construct_design.js${stamp}`);
const { setOnlineUsers } = await import(`../menu_bar/online_users.js${stamp}`);
const { populateMenu } = await import(`../menu_bar/populate/populate.js${stamp}`);
const { connectDesk } = await import(`./desk.js${stamp}`);

// Procedures this desk calls, in order:
// 1. refreshEditor()        confirms the rich text gzip
// 2. refreshSpreadsheet()   confirms the spreadsheet gzip
// 3. refreshPowerpoint()    confirms the PowerPoint gzip
// 4. readIndexedName()      IndexedDB. Skip login when the name is already there.
// 4. showLogin()            setup/login_user.js. Dropdown only, then Enter.
// 5. saveIndexedName()
// 6. constructMainPage()    main_page/construct_main_page.js
// 7. constructMenuDesign()  menu bar icon and mega menu
// 8. connectDesk()          who is logged in
// 9. setOnlineUsers()       menu_bar/online_users.js keeps the online array
// 10. populateMenu()        fills the mega menu on every desk update

const DB_NAME = "battery_nb_cert_docs";
const STORE = "session";
const USER_KEY = "user";
const STORAGE_ID = "battery_nb_cert_docs.clientId";
const STORAGE_NAME = "user name";
const LEGACY_NAME = "battery_nb_cert_docs.userName";

const root = document.querySelector("#app");
const clientId = loadClientId();
let desk = null;
let dismissMenu = null;
let unwatchOnline = null;

start().catch((error) => {
  console.error(error);
  root.replaceChildren();
  const message = document.createElement("p");
  message.className = "boot-error";
  message.textContent = error instanceof Error && error.message ? error.message : "The desk could not start.";
  root.append(message);
});

async function start() {
  await refreshEditor();
  await refreshSpreadsheet();
  await refreshPowerpoint();
  const existing = await readIndexedName();
  if (existing) {
    await enterDesk(existing);
    return;
  }
  const name = await askForName();
  await enterDesk(name);
}

async function refreshEditor() {
  root.textContent = "Checking the editor…";
  const response = await fetch("/editor/refresh", { method: "POST", cache: "no-store" });
  const report = await response.json().catch(() => null);
  if (!response.ok || !report?.ok) {
    throw new Error(report?.error || "The rich text editor could not be downloaded.");
  }
}

async function refreshSpreadsheet() {
  root.textContent = "Checking the spreadsheet…";
  const response = await fetch("/spreadsheet/refresh", { method: "POST", cache: "no-store" });
  const report = await response.json().catch(() => null);
  if (!response.ok || !report?.ok) {
    throw new Error(report?.error || "The spreadsheet could not be downloaded.");
  }
}

async function refreshPowerpoint() {
  root.textContent = "Checking the PowerPoint viewer…";
  const response = await fetch("/powerpoint/refresh", { method: "POST", cache: "no-store" });
  const report = await response.json().catch(() => null);
  if (!response.ok || !report?.ok) {
    throw new Error(report?.error || "The PowerPoint viewer could not be downloaded.");
  }
}

async function enterDesk(name) {
  await saveIndexedName(name);
  rememberLocalName(name);
  if (desk) {
    desk.close();
    desk = null;
  }

  if (unwatchOnline) {
    unwatchOnline();
    unwatchOnline = null;
  }

  const page = constructMainPage(root);
  const menu = constructMenuDesign(page.menuBar, {
    name,
    onAnotherName: () => switchName(),
  });
  page.bindTree(menu.treeButton);
  unwatchOnline = menu.unwatchOnline;
  watchMenu(menu);

  desk = connectDesk({
    clientId,
    name,
    onStatus: menu.setStatus,
    onUsers(users) {
      setOnlineUsers(users);
      populateMenu(menu.list, users, {
        clientId,
        count: menu.count,
        onToggle(targetId) {
          desk.send({ type: "toggleUser", clientId, targetId });
        },
      });
    },
  });
}

async function switchName() {
  if (desk) {
    desk.close();
    desk = null;
  }
  if (dismissMenu) {
    dismissMenu();
    dismissMenu = null;
  }
  await clearIndexedName();
  forgetLocalName();
  const name = await askForName();
  await enterDesk(name);
}

function askForName() {
  return new Promise((resolve) => {
    showLogin(root, { onEnter: resolve });
  });
}

function watchMenu(menu) {
  if (dismissMenu) dismissMenu();
  const onPointer = (event) => {
    if (menu.panel.hidden) return;
    if (menu.panel.contains(event.target) || menu.button.contains(event.target)) return;
    menu.close();
  };
  const onKey = (event) => {
    if (event.key === "Escape") menu.close();
  };
  document.addEventListener("pointerdown", onPointer);
  document.addEventListener("keydown", onKey);
  dismissMenu = () => {
    document.removeEventListener("pointerdown", onPointer);
    document.removeEventListener("keydown", onKey);
  };
}

function loadClientId() {
  let id = localStorage.getItem(STORAGE_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_ID, id);
  }
  return id;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedName() {
  try {
    const db = await openDb();
    const name = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const get = tx.objectStore(STORE).get(USER_KEY);
      get.onsuccess = () => resolve(typeof get.result?.name === "string" ? get.result.name : "");
      get.onerror = () => reject(get.error);
    });
    db.close();
    return KNOWN_NAMES.includes(name) ? name : "";
  } catch {
    return "";
  }
}

async function saveIndexedName(name) {
  if (!KNOWN_NAMES.includes(name)) throw new Error("Choose a name from the list.");
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({ name, savedAt: new Date().toISOString() }, USER_KEY);
    });
    db.close();
  } catch {
    // The desk still opens for this visit. The next open asks again.
  }
}

async function clearIndexedName() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(USER_KEY);
    });
    db.close();
  } catch {
    // Login still shows if the store cannot be cleared.
  }
}

function rememberLocalName(name) {
  localStorage.setItem(STORAGE_NAME, name);
  localStorage.setItem(LEGACY_NAME, name);
}

function forgetLocalName() {
  localStorage.removeItem(STORAGE_NAME);
  localStorage.removeItem(LEGACY_NAME);
}
