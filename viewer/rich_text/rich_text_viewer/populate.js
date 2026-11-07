import { assignTocPages, createTableOfContents } from "../../engine/import_docx.js";
import { paginate } from "@/lib/qdoc/layout";
import { writeLogEntry } from "../../log/write_log_entries.js";
import { calibrateFonts, fontsIn } from "./fit-font.js";
import { emptyFocus, state } from "./state.js";
import { render } from "./render.js";

/** Same populate for every Word file: TOC from the heading scheme, then paint. */
export function populate(next, name = state.fileName) {
  createTableOfContents(next);
  state.measured = {};
  state.spill = [];
  state.focus = emptyFocus();
  state.doc = next;
  state.fileName = name;
  state.recentOpen = false;
  state.guides = false;
  state.passes = 0;
  writeLogEntry("log", "populate: " + name);
  const draw = async () => {
    await calibrateFonts(fontsIn(next));
    state.pages = paginate(next, {}, []);
    next.pages = state.pages;
    assignTocPages(next);
    state.currentPageId = state.pages[0]?.id ?? "";
    writeLogEntry("log", "populate: " + state.pages.length + " pages");
    render("full");
  };
  if (typeof document !== "undefined" && document.fonts?.ready) document.fonts.ready.then(draw);
  else void draw();
}