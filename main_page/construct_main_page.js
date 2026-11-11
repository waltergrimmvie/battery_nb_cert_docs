import { guidFor, getFile, putFile } from "../database/indexed/files.js";

export function constructMainPage(root) {
  root.replaceChildren();

  const app = document.createElement("div");
  app.className = "app";

  const menuBar = document.createElement("header");
  menuBar.className = "menu-bar";

  const workspace = document.createElement("div");
  workspace.className = "workspace";

  const tree = document.createElement("aside");
  tree.className = "tree-container";
  tree.setAttribute("aria-label", "Document tree");

  const slider = document.createElement("div");
  slider.className = "slider";
  slider.tabIndex = 0;
  slider.setAttribute("role", "separator");
  slider.setAttribute("aria-orientation", "vertical");
  slider.setAttribute("aria-label", "Resize tree and content");
  slider.setAttribute("aria-valuemin", "180");
  slider.setAttribute("aria-valuemax", "560");
  slider.setAttribute("aria-valuenow", "300");

  const content = document.createElement("section");
  content.className = "content-container";
  content.setAttribute("aria-live", "polite");

  workspace.append(tree, slider, content);
  app.append(menuBar, workspace);
  root.append(app);

  renderTree(tree, content);
  showIntro(content);
  attachSlider(slider, tree, workspace);

  return {
    app,
    menuBar,
    tree,
    content,
    slider,
    workspace,
    bindTree(button) {
      button.addEventListener("click", () => {
        const open = !workspace.classList.contains("show-tree");
        workspace.classList.toggle("show-tree", open);
        button.setAttribute("aria-pressed", open ? "true" : "false");
      });
    },
  };
}

function renderTree(tree, content) {
  const label = document.createElement("p");
  label.className = "tree-label";
  label.textContent = "Tree";

  const status = document.createElement("p");
  status.className = "tree-status";
  status.textContent = "Reading the documents…";

  const nav = document.createElement("nav");
  tree.append(label, status, nav);
  showIntro(content);

  fetch("/documents/index.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("The document list could not be read.");
      return response.json();
    })
    .then((directories) => {
      status.remove();
      fillTree(nav, tree, content, directories);
    })
    .catch(() => {
      status.textContent = "The document folders could not be read.";
    });
}

const FILE_LABELS = {
  "EU Battery Line Checklist.docx": "EU Battery Line Checklist",
  "EU_Battery_17065_Detailed_Checklist_v5_Compressed.xlsx": "EU Battery 17065 Detailed Checklist (Excel)",
  "Qauditors_EU_Vehicle_Certification_Company_CN.pptx": "EU Vehicle Certification Brief (PowerPoint)",
  "EU_Battery_Regulation_with_Client_Index_Framed.pdf": "EU Battery Regulation (PDF)",
  "Harbor_Studio_fit-out.json": "Harbor Studio fit-out (Gantt)",
};

function fillTree(nav, tree, content, directories) {
  for (const directory of directories) {
    const group = document.createElement("div");
    group.className = "tree-group";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-root";
    const openFirst = directory.name === "General Documents";
    toggle.setAttribute("aria-expanded", openFirst ? "true" : "false");
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = directory.name;
    toggle.append(chev, text);

    const kids = document.createElement("div");
    kids.className = "tree-children";
    kids.hidden = !openFirst;
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      kids.hidden = !open;
    });

    for (const file of directory.files) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tree-child";
      button.textContent = fileLabel(file);
      button.addEventListener("click", () => {
        for (const current of tree.querySelectorAll(".tree-child[aria-current='true']")) {
          current.removeAttribute("aria-current");
        }
        button.setAttribute("aria-current", "true");
        showDocument(content, directory.name, file);
        showContentPane();
      });
      kids.append(button);
    }

    group.append(toggle, kids);
    nav.append(group);
  }
}

function fileLabel(file) {
  if (FILE_LABELS[file]) return FILE_LABELS[file];
  return file.replace(/\.(docx|xlsx|xls|pptx|pdf|json|csv|xml)$/i, "");
}

function showIntro(content) {
  content.replaceChildren();
  const article = document.createElement("article");
  article.className = "note";
  const kicker = document.createElement("p");
  kicker.className = "kicker";
  kicker.textContent = "Content";
  const heading = document.createElement("h1");
  heading.textContent = "Choose a document";
  const copy = document.createElement("p");
  copy.textContent = "The folders in the tree are the document directories. Open one and choose a document.";
  article.append(kicker, heading, copy);
  content.append(article);
}

let workspaceEl = null;
const viewerSlots = {};

const VIEWERS = {
  doc: "/viewer/rich_text/rich_text_viewer/index.html",
  sheet: "/viewer/spreadsheet/spreadsheet_viewer/index.html",
  ppt: "/viewer/powerpoint/powerpoint_viewer/index.html",
  pdf: "/viewer/pdf/pdf_viewer/index.html",
  gantt: "/viewer/gantt/gantt_viewer/index.html",
};

const VERSION_FILES = {
  doc: "/version_text_editor.txt",
  sheet: "/version_spreadsheet.txt",
  ppt: "/version_powerpoint.txt",
  pdf: "/version_pdf.txt",
  gantt: "/version_gantt.txt",
};

function viewerKind(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "sheet";
  if (lower.endsWith(".pptx")) return "ppt";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".json") || lower.endsWith(".csv") || lower.endsWith(".xml")) return "gantt";
  return "doc";
}

function showContentPane() {
  if (!workspaceEl || !workspaceEl.classList.contains("narrow")) return;
  workspaceEl.classList.remove("show-tree");
  const button = document.querySelector(".tree-toggle");
  if (button) button.setAttribute("aria-pressed", "false");
}

function showDocument(content, directory, file) {
  const src = documentUrl(directory, file);
  const title = fileLabel(file);
  const kind = viewerKind(file);
  const page = VIEWERS[kind];

  const intro = content.querySelector(".note");
  if (intro) intro.remove();

  for (const [name, slot] of Object.entries(viewerSlots)) {
    slot.wrap.hidden = name !== kind;
  }

  let slot = viewerSlots[kind];
  if (!slot) {
    slot = buildViewer(kind, title);
    viewerSlots[kind] = slot;
    content.append(slot.wrap);
  } else {
    slot.frame.title = title;
    slot.wrap.hidden = false;
  }

  openStored(slot, page, directory, file, src).catch((error) => {
    slot.frame.insertAdjacentHTML("afterend", "<p class=\"note\">" + (error && error.message ? error.message : "The file could not be opened.") + "</p>");
  });
}

function reuseOrOpen(slot, page, src) {
  if (!slot.frame.src) {
    openViewer(slot, page, src);
    return;
  }
  if (slot.frame.dataset.src === src) return;
  slot.frame.dataset.src = src;
  slot.ready = slot.ready.then(() => slot.frame.contentWindow.populate(src));
}

async function openStored(slot, page, directory, file, src) {
  const path = directory + "/" + file;
  const guid = await guidFor(path);
  const record = await getFile(guid);
  const stored = record && record.json;

  // General Documents, and every other file: JSON in the database means
  // no file download and no import. Populate gets the stored string.
  if (stored) {
    const viewer = await viewerObject(slot, page);
    await viewer.populate(typeof stored === "string" ? stored : JSON.stringify(stored));
    return;
  }

  const response = await fetch(src, { cache: "no-store" });
  if (!response.ok) throw new Error("The file could not be downloaded.");
  const next = {
    guid,
    path,
    directory,
    name: file,
    route: src,
    type: response.headers.get("content-type") || "",
    content: await response.arrayBuffer(),
    savedAt: Date.now(),
  };
  await putFile(next);

  const viewer = await viewerObject(slot, page);
  const json = await viewer.import(next.content, file);
  next.json = JSON.stringify(json);
  next.savedAt = Date.now();
  await putFile(next);
  await viewer.populate(next.json);
}

async function viewerObject(slot, page) {
  const packed = Object.keys(GZIP_PAGE).find((kind) => VIEWERS[kind] === page);
  if (packed && packed !== "doc" && packed !== "sheet") {
    await openPacked(slot, packed);
  } else {
    await openShell(slot, page);
  }
  const win = slot.frame.contentWindow;
  if (!win || !win.Viewer || typeof win.Viewer.import !== "function" || typeof win.Viewer.populate !== "function") {
    throw new Error("The viewer object is not ready.");
  }
  return win.Viewer;
}


const GZIP_PAGE = {
  doc: { url: "/gzip/editor", prefix: "/viewer/rich_text/rich_text_viewer/", version: "/version_text_editor.txt" },
  sheet: { url: "/gzip/sheet", prefix: "/viewer/spreadsheet/spreadsheet_viewer/", version: "/version_spreadsheet.txt" },
  ppt: { url: "/gzip/ppt", prefix: "/viewer/powerpoint/powerpoint_viewer/", version: "/version_powerpoint.txt" },
  pdf: { url: "/gzip/pdf", prefix: "/viewer/pdf/pdf_viewer/", version: "/version_pdf.txt" },
  gantt: { url: "/gzip/gantt", prefix: "/viewer/gantt/gantt_viewer/", version: "/version_gantt.txt" },
};
const FILE_CACHE = "battery-nb-viewer-files";
const GZIP_CACHE = "battery-nb-gzip";

async function remoteNumber(path) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    const text = response.ok ? (await response.text()).trim() : "";
    return /^[0-9]+$/.test(text) ? text : "0";
  } catch {
    return "0";
  }
}

async function storedVersion(kind) {
  const cache = await caches.open(GZIP_CACHE);
  const hit = await cache.match("/gzip/" + kind + "-version");
  return hit ? (await hit.text()).trim() : "";
}

async function oneGzip(kind, version) {
  const spec = GZIP_PAGE[kind];
  const cache = await caches.open(GZIP_CACHE);
  const stored = await storedVersion(kind);
  const hit = await cache.match("/gzip/" + kind);
  if (hit && stored === version && version !== "0") {
    return new Uint8Array(await hit.arrayBuffer());
  }
  const response = await fetch(spec.url, { cache: "no-store" });
  if (!response.ok) throw new Error("The " + kind + " gzip could not be downloaded.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  await cache.put("/gzip/" + kind, new Response(bytes, { headers: { "content-type": "application/gzip" } }));
  await cache.put("/gzip/" + kind + "-version", new Response(version));
  return bytes;
}

async function unpackTarGz(bytes) {
  const raw = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  const files = new Map();
  const dec = new TextDecoder();
  let offset = 0;
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = dec.decode(header.subarray(0, 100)).replace(/\0.*$/, "");
    const size = parseInt(dec.decode(header.subarray(124, 136)).replace(/\0.*$/, "").trim() || "0", 8) || 0;
    offset += 512;
    const data = raw.subarray(offset, offset + size);
    if (name && !name.endsWith("/")) files.set(name, data);
    offset += Math.ceil(size / 512) * 512;
  }
  const names = [...files.keys()];
  const first = names.map((name) => name.split("/")[0]);
  const wrapper = first.length && first.every((part) => part === first[0] && names.every((name) => name.includes("/")));
  if (wrapper) {
    const stripped = new Map();
    for (const [name, data] of files) stripped.set(name.split("/").slice(1).join("/"), data);
    return stripped;
  }
  return files;
}

function typeFor(name) {
  if (name.endsWith(".js")) return "text/javascript";
  if (name.endsWith(".css")) return "text/css";
  if (name.endsWith(".html")) return "text/html";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function prepareForDesk(kind, files) {
  const prefix = GZIP_PAGE[kind].prefix;
  const out = new Map();
  for (const [name, bytes] of files) {
    if (!/\.(html|js|css|mjs)$/.test(name)) {
      out.set(name, bytes);
      continue;
    }
    let text = new TextDecoder().decode(bytes);
    if (name.endsWith(".html")) {
      text = text.replaceAll('src="/public/', 'src="./public/').replaceAll("src='/public/", "src='./public/");
    }
    if (name.endsWith("boot.js")) {
      text = text.replaceAll(
        "typeof caches<`u`&&caches.keys&&caches.keys().then(e=>e.forEach(e=>caches.delete(e))).catch(()=>{}),navigator.serviceWorker?.getRegistrations&&navigator.serviceWorker.getRegistrations().then(e=>e.forEach(e=>e.unregister())).catch(()=>{})",
        "0",
      );
      text = text.replace(
        "async function mo(){for(let e of[`/documents/EU_Battery_Regulation_Client_Checklist.docx`,`/public/documents/EU_Battery_Regulation_Client_Checklist.docx`])",
        "async function mo(){return!1;for(let e of[`/documents/EU_Battery_Regulation_Client_Checklist.docx`,`/public/documents/EU_Battery_Regulation_Client_Checklist.docx`])",
      );
    }
    text = text
      .replaceAll("/public/fonts/", prefix + "public/fonts/")
      .replaceAll("/public/Files/", prefix + "public/Files/")
      .replaceAll("/fonts/", prefix + "fonts/")
      .replaceAll("/assets/", prefix + "assets/")
      .replaceAll("/Files/", prefix + "Files/")
      .replaceAll("/version.txt", prefix + "version.txt");
    out.set(name, new TextEncoder().encode(text));
  }
  return out;
}

async function storeUnpacked(kind, files) {
  const spec = GZIP_PAGE[kind];
  const cache = await caches.open(FILE_CACHE);
  const prepared = prepareForDesk(kind, files);
  await Promise.all([...prepared.entries()].map(([name, bytes]) => cache.put(
    spec.prefix + name,
    new Response(bytes, { headers: { "content-type": typeFor(name) } }),
  )));
}

async function filesReady(kind, version) {
  const spec = GZIP_PAGE[kind];
  const cache = await caches.open(FILE_CACHE);
  const page = await cache.match(spec.prefix + "index.html");
  return Boolean(page) && (await storedVersion(kind)) === version && version !== "0";
}

async function localFilesReady(kind) {
  const spec = GZIP_PAGE[kind];
  const cache = await caches.open(FILE_CACHE);
  const page = await cache.match(spec.prefix + "index.html");
  if (!page) return false;
  if (kind === "doc") {
    const boot = await cache.match(spec.prefix + "public/paint/boot.js");
    if (!boot) return false;
    const source = await boot.text();
    if (source.includes("caches.delete")) return false;
  }
  return true;
}

async function openPacked(slot, kind) {
  if (slot.frame.dataset.shell === "1") return slot.ready;
  slot.frame.dataset.shell = "1";
  // A copy on the phone is used as it is. No version check, no gzip.
  if (!(await localFilesReady(kind))) {
    const version = await remoteNumber(GZIP_PAGE[kind].version);
    const files = await unpackTarGz(await oneGzip(kind, version === "0" ? "1" : version));
    await storeUnpacked(kind, files);
  }
  slot.ready = new Promise((resolve, reject) => {
    const wait = async () => {
      for (let i = 0; i < 60; i += 1) {
        const win = slot.frame.contentWindow;
        if (win && win.Viewer && typeof win.Viewer.populate === "function") {
          if (win.editorReady && typeof win.editorReady.then === "function") await win.editorReady;
          return;
        }
        await new Promise((pause) => setTimeout(pause, 100));
      }
      throw new Error("The viewer did not start.");
    };
    slot.frame.addEventListener("load", () => {
      wait().then(resolve).catch(reject);
    }, { once: true });
  });
  const version = await storedVersion(kind);
  slot.frame.src = VIEWERS[kind] + "?v=" + (version || "1") + "&hold=1";
  return slot.ready;
}

function openShell(slot, page) {
  if (slot.frame.dataset.shell === "1") return slot.ready;
  slot.frame.dataset.shell = "1";
  slot.ready = new Promise((resolve) => {
    slot.frame.addEventListener("load", () => {
      const ready = slot.frame.contentWindow && slot.frame.contentWindow.editorReady;
      if (ready && typeof ready.then === "function") ready.then(resolve);
      else resolve();
    }, { once: true });
  });
  const versionFile = VERSION_FILES[slot.wrap.dataset.viewer] || "/version_text_editor.txt";
  fetch(versionFile, { cache: "no-store" })
    .then((response) => (response.ok ? response.text() : ""))
    .then((text) => {
      const number = String(text || "").trim();
      const version = /^[0-9]+$/.test(number) ? number : "0";
      slot.frame.src = page + "?v=" + version + "&hold=1";
    })
    .catch(() => {
      slot.frame.src = page + "?v=0&hold=1";
    });
  return slot.ready;
}

function buildViewer(kind, title) {
  const wrap = document.createElement("div");
  wrap.className = "rich-text-viewer";
  wrap.dataset.viewer = kind;

  if (kind === "ppt") {
    const bar = document.createElement("div");
    bar.className = "ppt-bar";
    const versionLabel = document.createElement("span");
    versionLabel.className = "ppt-version";
    versionLabel.textContent = "Version —";
    const widthLabel = document.createElement("label");
    widthLabel.textContent = "Preview width";
    const widthSlider = document.createElement("input");
    widthSlider.type = "range";
    widthSlider.min = "180";
    widthSlider.max = "480";
    widthSlider.value = "260";
    widthSlider.setAttribute("aria-label", "Preview page width");
    widthSlider.addEventListener("input", () => {
      wrap.style.setProperty("--ppt-preview", widthSlider.value + "px");
    });
    widthLabel.append(widthSlider);
    bar.append(versionLabel, widthLabel);
    wrap.append(bar);
    fetch("/version_powerpoint.txt", { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => { versionLabel.textContent = "Version " + (t.trim() || "1"); })
      .catch(() => {});
  }

  const frame = document.createElement("iframe");
  frame.className = "rich-text-frame";
  frame.title = title;
  wrap.append(frame);

  if (kind === "ppt") {
    const nav = document.createElement("div");
    nav.className = "ppt-nav";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Previous";
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    prev.addEventListener("click", () => postSlide(frame, -1));
    next.addEventListener("click", () => postSlide(frame, 1));
    nav.append(prev, next);
    wrap.append(nav);
  }

  return { wrap, frame, ready: Promise.resolve() };
}

function openViewer(slot, page, src) {
  slot.frame.dataset.src = src;
  slot.ready = new Promise((resolve) => {
    slot.frame.addEventListener("load", () => {
      const ready = slot.frame.contentWindow && slot.frame.contentWindow.editorReady;
      if (ready && typeof ready.then === "function") ready.then(resolve);
      else resolve();
    }, { once: true });
  });
  const versionFile = VERSION_FILES[slot.wrap.dataset.viewer] || "/version_text_editor.txt";
  fetch(versionFile, { cache: "no-store" })
    .then((response) => (response.ok ? response.text() : ""))
    .then((text) => {
      slot.frame.src = page + "?v=" + encodeURIComponent(text.trim()) + "&src=" + encodeURIComponent(src);
    })
    .catch(() => {
      slot.frame.src = page + "?src=" + encodeURIComponent(src);
    });
}

function postSlide(frame, delta) {
  try {
    const win = frame.contentWindow;
    if (win && typeof win.postMessage === "function") {
      win.postMessage({ type: "ppt-slide", delta }, "*");
    }
  } catch {
    // The viewer page stays as it is. The host only signals.
  }
}

function documentUrl(directory, file) {
  return `/documents/${encodeURIComponent(directory)}/${encodeURIComponent(file)}`;
}

function attachSlider(slider, tree, workspace) {
  workspaceEl = workspace;
  const narrow = window.matchMedia("(max-width: 720px)");
  let dragging = false;

  function stacked() {
    return narrow.matches;
  }

  function applyMode() {
    const isNarrow = stacked();
    workspace.classList.toggle("narrow", isNarrow);
    if (isNarrow) {
      tree.style.width = "";
      tree.style.height = "";
      return;
    }
    workspace.classList.remove("show-tree");
    const button = document.querySelector(".tree-toggle");
    if (button) button.setAttribute("aria-pressed", "false");
    tree.style.height = "";
    if (!tree.style.width) tree.style.width = "300px";
  }

  function setSize(clientX) {
    if (stacked()) return;
    const rect = workspace.getBoundingClientRect();
    const next = Math.min(Math.max(clientX - rect.left, 180), Math.min(560, rect.width - 220));
    tree.style.width = `${next}px`;
    slider.setAttribute("aria-valuenow", String(Math.round(next)));
  }

  slider.addEventListener("pointerdown", (event) => {
    dragging = true;
    slider.setPointerCapture(event.pointerId);
    setSize(event.clientX);
  });
  slider.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    setSize(event.clientX);
  });
  slider.addEventListener("pointerup", () => {
    dragging = false;
  });
  slider.addEventListener("pointercancel", () => {
    dragging = false;
  });
  slider.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 48 : 16;
    const current = Number.parseFloat(tree.style.width) || tree.getBoundingClientRect().width;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const rect = workspace.getBoundingClientRect();
      setSize(rect.left + current - step);
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const rect = workspace.getBoundingClientRect();
      setSize(rect.left + current + step);
    }
  });

  narrow.addEventListener("change", applyMode);
  applyMode();
}
