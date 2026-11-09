
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
  return file.replace(/\.(docx|xlsx|xls)$/i, "");
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

let viewerFrame = null;
let viewerKindOpen = "";
let viewerReady = Promise.resolve();
let workspaceEl = null;

const VIEWERS = {
  doc: "/viewer/rich_text/rich_text_viewer/index.html",
  sheet: "/viewer/spreadsheet/spreadsheet_viewer/index.html",
};

function viewerKind(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "sheet";
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
  if (!viewerFrame || !viewerFrame.isConnected || viewerKindOpen !== kind) {
    content.replaceChildren();
    const viewer = document.createElement("div");
    viewer.className = "rich-text-viewer";
    viewerFrame = document.createElement("iframe");
    viewerFrame.className = "rich-text-frame";
    viewerFrame.title = title;
    viewer.append(viewerFrame);
    content.append(viewer);
    viewerKindOpen = kind;
    viewerFrame.dataset.src = src;
    viewerReady = new Promise((resolve) => {
      viewerFrame.addEventListener("load", () => {
        const ready = viewerFrame.contentWindow && viewerFrame.contentWindow.editorReady;
        if (ready && typeof ready.then === "function") ready.then(resolve);
        else resolve();
      }, { once: true });
    });
    fetch("/version.txt", { cache: "no-store" })
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => {
        viewerFrame.src = page + "?v=" + encodeURIComponent(text.trim()) + "&src=" + encodeURIComponent(src);
      })
      .catch(() => {
        viewerFrame.src = page + "?src=" + encodeURIComponent(src);
      });
    return;
  }

  viewerFrame.title = title;
  if (viewerFrame.dataset.src === src) return;
  viewerFrame.dataset.src = src;
  viewerReady = viewerReady.then(() => viewerFrame.contentWindow.populate(src));
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
