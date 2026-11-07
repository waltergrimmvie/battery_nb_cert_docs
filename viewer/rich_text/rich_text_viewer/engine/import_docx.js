// @ts-nocheck
import JSZip from "jszip";

function parseXml(xml) {
  const safe = String(xml ?? "").replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g, "&" + "amp;");
  const dom = new DOMParser().parseFromString(safe, "application/xml");
  if (typeof dom.querySelector === "function" && dom.querySelector("parsererror")) throw new Error("Could not read the Word XML");
  normalize(dom.documentElement);
  return dom;
}

function normalize(node) {
  if (!node || node.nodeType !== 1) return;
  const raw = node.localName || "";
  if (raw.includes(":")) {
    try { node.localName = raw.slice(raw.indexOf(":") + 1); } catch { /* browser localName is read-only */ }
  }
  for (const child of node.children ?? []) normalize(child);
}

function all(node) {
  const out = [];
  const walk = (item) => {
    if (!item || item.nodeType !== 1) return;
    out.push(item);
    for (const child of item.children ?? []) walk(child);
  };
  walk(node?.documentElement ?? node);
  return out;
}
function children(node, name) {
  return node ? [...node.children].filter((el) => el.localName === name) : [];
}

function first(node, name) {
  return children(node, name)[0] ?? null;
}

function attr(node, name) {
  return node?.getAttribute("w:" + name) ?? node?.getAttribute(name) ?? "";
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textOf(node) {
  return all(node).filter((el) => el.localName === "t").map((el) => el.textContent ?? "").join("");
}

function readLayout(frame) {
  if (!frame) return { wrap: "inline", w: 0, h: 0, x: 0, y: 0, xFrom: "page", yFrom: "paragraph" };
  const extent = first(frame, "extent");
  const names = [...frame.children].map((el) => el.localName);
  const wrap = names.includes("wrapNone") ? "none" : names.includes("wrapTopAndBottom") ? "topAndBottom" : names.includes("wrapSquare") ? "square" : frame.localName === "inline" ? "inline" : "square";
  const posH = first(frame, "positionH");
  const posV = first(frame, "positionV");
  return {
    wrap,
    w: Math.round(num(extent?.getAttribute("cx"), 0) / 635),
    h: Math.round(num(extent?.getAttribute("cy"), 0) / 635),
    x: Math.round(num(textOf(posH) || first(posH, "posOffset")?.textContent, 0) / 635),
    y: Math.round(num(textOf(posV) || first(posV, "posOffset")?.textContent, 0) / 635),
    xFrom: "page",
    yFrom: posV?.getAttribute("relativeFrom") === "page" ? "page" : "paragraph",
  };
}

function readRels(xml) {
  if (!xml) return {};
  const dom = parseXml(xml);
  const map = {};
  for (const rel of all(dom).filter((el) => el.localName === "Relationship")) {
    map[rel.getAttribute("Id")] = rel.getAttribute("Target") ?? "";
  }
  return map;
}

async function readPart(zip, target) {
  if (!target) return "";
  const path = target.startsWith("/") ? target.slice(1) : target.startsWith("word/") ? target : "word/" + target.replace(/^\.\//, "");
  return (await zip.file(path)?.async("string")) ?? "";
}

async function readBinary(zip, target) {
  if (!target) return "";
  const path = target.startsWith("/") ? target.slice(1) : target.startsWith("word/") ? target : "word/" + target.replace(/^\.\//, "");
  const file = zip.file(path);
  if (!file) return "";
  const bytes = await file.async("uint8array");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Convert a Word .docx into qdoc. Existing fields stay. Missing Word parts are added beside them. */
export async function importDocx(buffer, fileName = "document") {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("This file has no word/document.xml");
  const rels = readRels(await zip.file("word/_rels/document.xml.rels")?.async("string"));
  const stylesXml = await zip.file("word/styles.xml")?.async("string");
  const numberingXml = await zip.file("word/numbering.xml")?.async("string");
  const themeXml = await readPart(zip, "word/theme/theme1.xml");
  const fontTable = await readPart(zip, "word/fontTable.xml");
  const settings = await readPart(zip, "word/settings.xml");
  let n = 1;
  const take = (prefix) => prefix + String(n++).padStart(6, "0");
  const assets = {};
  const ridToAsset = {};
  for (const [rid, target] of Object.entries(rels)) {
    if (!/media\/|\.(png|jpe?g|gif|emf|wmf|svg)$/i.test(target)) continue;
    const href = "data:application/octet-stream;base64," + await readBinary(zip, target);
    const id = take("a");
    assets[id] = { id, href, mime: "application/octet-stream", w: 800, h: 600, name: target.split("/").pop(), rid };
    ridToAsset[rid] = id;
  }
  const styled = readStyles(stylesXml);
  const lists = readLists(numberingXml);
  Object.assign(lists, styled.lists);
  const notes = await readStoryPart(zip, "word/footnotes.xml", "footnote", take);
  const endnotes = await readStoryPart(zip, "word/endnotes.xml", "endnote", take);
  const comments = readComments(await zip.file("word/comments.xml")?.async("string"));
  const bookmarks = [];
  const packageParts = {};
  for (const path of Object.keys(zip.files)) {
    if (zip.files[path].dir) continue;
    if (/^word\/(document|styles|numbering|fontTable|settings)\.xml$/.test(path)) continue;
    if (/^word\/(header|footer|footnotes|endnotes|comments)/.test(path)) continue;
    if (/^word\/media\//.test(path)) continue;
    packageParts[path] = await readBinary(zip, path);
  }
  if (themeXml) packageParts["word/theme/theme1.xml"] = btoa(unescape(encodeURIComponent(themeXml)));
  if (fontTable) packageParts["word/fontTable.xml"] = btoa(unescape(encodeURIComponent(fontTable)));
  if (settings) packageParts["word/settings.xml"] = btoa(unescape(encodeURIComponent(settings)));

  const dom = parseXml(xml);
  const body = all(dom).find((el) => el.localName === "body");
  const sections = [];
  let blocks = [];
  let pending = null;
  const pushSection = async (sect) => {
    const page = readSection(sect);
    sections.push({
      id: take("s"),
      breakType: attr(first(sect, "type"), "val") === "continuous" ? "continuous" : "nextPage",
      page,
      header: await storyFrom(zip, rels, sect, "headerReference", "", "header", take),
      headerFirst: await storyFrom(zip, rels, sect, "headerReference", "first", "header", take),
      headerEven: await storyFrom(zip, rels, sect, "headerReference", "even", "header", take),
      footer: await storyFrom(zip, rels, sect, "footerReference", "", "footer", take),
      footerFirst: await storyFrom(zip, rels, sect, "footerReference", "first", "footer", take),
      footerEven: await storyFrom(zip, rels, sect, "footerReference", "even", "footer", take),
      blocks,
    });
    blocks = [];
  };
  for (const child of body ? [...body.children] : []) {
    if (child.localName === "sectPr") {
      pending = child;
      continue;
    }
    absorb(child, blocks, { take, ridToAsset, assets, notes, endnotes, comments, bookmarks, lists, styles: styled });
    if (child.localName !== "p") continue;
    const sect = first(first(child, "pPr"), "sectPr");
    if (sect && attr(first(sect, "type"), "val") !== "continuous") {
      pending = sect;
      await pushSection(sect);
    }
  }
  if (blocks.length || sections.length === 0) await pushSection(pending);

  const doc = {
    format: "qdoc",
    version: 1,
    id: take("d"),
    meta: { title: fileName.replace(/\.docx$/i, ""), author: "", created: new Date().toISOString(), nextId: n },
    theme: { body: styled.defaults?.font || styled.styles.Normal?.font || "Calibri", heading: styled.styles.Heading1?.font || styled.defaults?.font || "Calibri" },
    styles: styled.styles,
    lists,
    assets: Object.fromEntries(Object.values(assets).map(({ rid, ...asset }) => [asset.id, asset])),
    sections,
    pages: [],
    footnotes: Object.values(notes),
    endnotes: Object.values(endnotes),
    comments: Object.values(comments),
    bookmarks,
    packageParts,
  };
  createTableOfContents(doc);
  return doc;
}

function absorb(child, into, ctx) {
  if (child.localName === "sdt") {
    const content = first(child, "sdtContent");
    for (const inner of content ? [...content.children] : []) absorb(inner, into, ctx);
    return;
  }
  if (child.localName === "tbl") {
    into.push(readTable(child, ctx));
    return;
  }
  if (child.localName !== "p") return;
  into.push(...readParagraph(child, ctx));
}

function readParagraph(node, ctx) {
  const { take } = ctx;
  const pPr = first(node, "pPr");
  const props = readParagraphProps(pPr);
  const numPr = first(pPr, "numPr") || ctx.styles?.lists?.[attr(first(pPr, "pStyle"), "val")];
  if (numPr?.localName === "numPr" || numPr?.id) {
    const listId = numPr.id || attr(first(numPr, "numId"), "val") || "1";
    const level = numPr.level ?? num(attr(first(numPr, "ilvl"), "val"), 0);
    props.list = { id: listId, level };
    if (!ctx.lists[listId]) ctx.lists[listId] = { levels: [{ format: "bullet", text: "●", indent: 720, hanging: 360 }] };
    const listLevel = ctx.lists[listId]?.levels?.[level];
    if (listLevel && !props.indent) props.indent = { left: listLevel.indent || 720, first: -(listLevel.hanging || 360) };
    if (listLevel) props.marker = listLevel.text || (listLevel.format === "bullet" ? "☐" : "");
  }
  const outline = first(pPr, "outlineLvl");
  if (outline) props.outline = num(attr(outline, "val"), 0);
  const mark = first(node, "bookmarkStart");
  const runs = [];
  const extras = [];
  let pageBreak = false;
  for (const child of node.children) {
    if (child.localName === "bookmarkStart" && attr(child, "name") && attr(child, "name") !== "_GoBack") {
      ctx.bookmarks.push({ id: take("m"), name: attr(child, "name"), anchor: "" });
    }
    if (child.localName === "hyperlink") {
      for (const inner of child.children) readRun(inner, runs, extras, ctx, child.getAttribute("r:id") ?? "");
      continue;
    }
    if (child.localName === "ins" || child.localName === "del") {
      for (const inner of child.children) readRun(inner, runs, extras, ctx, "", { type: child.localName, author: attr(child, "author"), date: attr(child, "date") });
      continue;
    }
    if (child.localName === "r") readRun(child, runs, extras, ctx);
  }
  for (const run of runs) if (run.type === "break" && run.text === "page") pageBreak = true;
  const breakBeforeEl = first(pPr, "pageBreakBefore");
  const breakBefore = Boolean(breakBeforeEl) && !["0", "false", "off"].includes(attr(breakBeforeEl, "val"));
  const visible = runs.filter((run) => run.type !== "break" || run.text !== "page");
  const paragraph = { id: take("p"), type: "paragraph", style: attr(first(pPr, "pStyle"), "val") || "Normal", props, runs: visible };
  for (const mark of ctx.bookmarks) if (!mark.anchor) mark.anchor = paragraph.id;
  const out = [];
  if (pageBreak || breakBefore) out.push({ id: take("k"), type: "pageBreak" });
  if (visible.length || !(pageBreak || breakBefore)) out.push(paragraph, ...extras);
  else out.push(...extras);
  return out;
}

function readRun(child, runs, extras, ctx, href = "", revision) {
  if (!child || child.localName !== "r") return;
  const { take } = ctx;
  const look = readRunProps(child);
  if (revision) look.revision = revision;
  if (href) look.href = href;
  const br = first(child, "br");
  if (attr(br, "type") === "page") {
    runs.push({ id: take("r"), type: "break", text: "page" });
    return;
  }
  const instr = children(child, "instrText").map((el) => el.textContent ?? "").join(" ").trim()
    || all(child).filter((el) => el.localName === "instrText").map((el) => el.textContent ?? "").join(" ").trim();
  if (instr) runs.push({ id: take("r"), type: "field", field: instr.split(/\s+/)[0]?.replace(/\\/g, "").toUpperCase() || "FIELD", text: instr, ...look });
  const note = first(child, "footnoteReference");
  if (note && ctx.notes[attr(note, "id")]) runs.push({ id: take("r"), type: "field", field: "FOOTNOTE", footnote: ctx.notes[attr(note, "id")].id, text: "*", ...look });
  const end = first(child, "endnoteReference");
  if (end && ctx.endnotes[attr(end, "id")]) runs.push({ id: take("r"), type: "field", field: "ENDNOTE", footnote: ctx.endnotes[attr(end, "id")].id, text: "†", ...look });
  const comment = first(child, "commentReference");
  if (comment && ctx.comments[attr(comment, "id")]) runs.push({ id: take("r"), type: "field", field: "COMMENT", text: ctx.comments[attr(comment, "id")].text, ...look });
  const text = children(child, "t").map((el) => el.textContent ?? "").join("");
  if (text) runs.push({ id: take("r"), type: "text", text, ...look });
  const frame = all(child).find((el) => el.localName === "anchor" || el.localName === "inline");
  const layout = readLayout(frame);
  const blip = all(child).find((el) => el.localName === "blip");
  const imageId = blip?.getAttribute("r:embed");
  if (imageId && ctx.ridToAsset[imageId]) {
    if (frame?.localName === "anchor") extras.push({ id: take("x"), type: "drawing", wrap: layout.wrap === "inline" ? "square" : layout.wrap, asset: ctx.ridToAsset[imageId], size: { w: layout.w, h: layout.h }, position: { x: layout.x, y: layout.y, xFrom: "page", yFrom: layout.yFrom } });
    else runs.push({ id: take("r"), type: "image", asset: ctx.ridToAsset[imageId], w: layout.w, h: layout.h });
  }
  const included = readIncluded(child, frame, take, layout);
  if (included) extras.push(included);
  const box = all(child).find((el) => el.localName === "txbxContent");
  if (box) extras.push({ id: take("b"), type: "shape", kind: "box", text: textOf(box), w: layout.w, h: layout.h, layout });
  const math = all(child).find((el) => el.localName === "oMath" || el.localName === "oMathPara");
  if (math) extras.push({ id: take("o"), type: "object", kind: "equation", text: textOf(math), ref: math.outerHTML ?? "", w: layout.w, h: layout.h, layout });
}

function readIncluded(node, frame, take, layout) {
  const chart = all(node).find((el) => el.localName === "chart");
  if (chart) return { id: take("o"), type: "object", kind: "chart", ref: chart.getAttribute("r:id") ?? "", text: chart.outerHTML ?? "", w: layout.w, h: layout.h, layout };
  const smart = all(node).find((el) => el.localName === "relIds");
  if (smart) return { id: take("o"), type: "object", kind: "smartArt", ref: "", text: smart.outerHTML ?? "", w: layout.w, h: layout.h, layout };
  const ole = all(node).find((el) => el.localName === "OLEObject");
  if (ole) return { id: take("o"), type: "object", kind: "ole", ref: ole.getAttribute("ProgID") ?? ole.getAttribute("r:id") ?? "", text: ole.outerHTML ?? "", w: layout.w, h: layout.h, layout };
  return null;
}

function readParagraphProps(pPr) {
  const props = {};
  const align = attr(first(pPr, "jc"), "val");
  if (align === "center" || align === "right" || align === "both" || align === "left") props.align = align === "both" ? "justify" : align;
  const spacing = first(pPr, "spacing");
  if (spacing) {
    const space = {};
    if (num(attr(spacing, "before")) > 0) space.before = num(attr(spacing, "before"));
    if (num(attr(spacing, "after")) > 0) space.after = num(attr(spacing, "after"));
    if (Object.keys(space).length) props.space = space;
    const lineVal = num(attr(spacing, "line"));
    const rule = attr(spacing, "lineRule") || "auto";
    if (lineVal > 0) {
      if (rule === "exact" || rule === "atLeast") {
        props.line = lineVal / 20;
        props.lineRule = rule;
      } else props.line = lineVal / 240;
    }
  }
  const ind = first(pPr, "ind");
  if (ind) {
    const indent = {};
    if (num(attr(ind, "left")) > 0) indent.left = num(attr(ind, "left"));
    if (num(attr(ind, "right")) > 0) indent.right = num(attr(ind, "right"));
    if (num(attr(ind, "firstLine")) > 0) indent.first = num(attr(ind, "firstLine"));
    if (Object.keys(indent).length) props.indent = indent;
  }
  return props;
}

function readRunProps(node) {
  const rPr = first(node, "rPr");
  const extra = {};
  if (first(rPr, "b")) extra.bold = true;
  if (first(rPr, "i")) extra.italic = true;
  if (first(rPr, "u")) extra.underline = true;
  const color = attr(first(rPr, "color"), "val");
  if (/^[0-9A-Fa-f]{6}$/.test(color)) extra.color = "#" + color;
  const fonts = first(rPr, "rFonts");
  const face = fonts?.getAttribute("w:ascii") || fonts?.getAttribute("w:hAnsi");
  if (face) extra.font = face;
  const size = num(attr(first(rPr, "sz"), "val"));
  if (size) extra.size = size / 2;
  return extra;
}

function readTable(node, ctx) {
  const grid = all(node).filter((el) => el.parentElement?.localName === "tblGrid" && el.localName === "gridCol").map((el) => num(attr(el, "w"), 2000));
  const rows = children(node, "tr").map((tr, rowIndex) => ({
    id: ctx.take("w"),
    header: rowIndex === 0,
    cells: children(tr, "tc").map((tc) => {
      const span = num(attr(first(first(tc, "tcPr"), "gridSpan"), "val"), 1);
      const shading = attr(first(first(tc, "tcPr"), "shd"), "fill");
      const borders = first(first(tc, "tcPr"), "tcBorders") ? "yes" : "";
      const blocks = [];
      for (const child of tc.children) if (child.localName === "p") blocks.push(...readParagraph(child, ctx).filter((block) => block.type === "paragraph"));
      return { id: ctx.take("c"), span: span > 1 ? span : undefined, shading: shading && shading !== "auto" ? "#" + shading : undefined, borders, blocks };
    }),
  }));
  return { id: ctx.take("t"), type: "table", grid, rows };
}

function readSection(sect) {
  const sz = first(sect, "pgSz");
  const mar = first(sect, "pgMar");
  const w = num(attr(sz, "w"), 11906);
  const h = num(attr(sz, "h"), 16838);
  return {
    w, h,
    orient: attr(sz, "orient") === "landscape" || w > h ? "landscape" : "portrait",
    margin: {
      top: num(attr(mar, "top"), 1440),
      right: num(attr(mar, "right"), 1440),
      bottom: num(attr(mar, "bottom"), 1440),
      left: num(attr(mar, "left"), 1440),
      header: num(attr(mar, "header"), 720),
      footer: num(attr(mar, "footer"), 720),
    },
  };
}

function readStyles(xml) {
  if (!xml) return { styles: { Normal: { font: "Calibri", size: 11 } }, lists: {}, defaults: { font: "Calibri", size: 11 } };
  const dom = parseXml(xml);
  const defaults = all(dom).find((el) => el.localName === "rPrDefault");
  const dPr = first(defaults, "rPr");
  const dFont = first(dPr, "rFonts")?.getAttribute("w:ascii") || first(dPr, "rFonts")?.getAttribute("w:hAnsi") || "Calibri";
  const dSize = num(attr(first(dPr, "sz"), "val"), 22) / 2 || 11;
  const styles = {};
  const lists = {};
  for (const style of all(dom).filter((el) => el.localName === "style")) {
    const name = attr(style, "styleId") || "Normal";
    const rPr = first(style, "rPr");
    const pPr = first(style, "pPr");
    const numPr = first(pPr, "numPr");
    const spacing = first(pPr, "spacing");
    const sizeHalf = num(attr(first(rPr, "sz"), "val"), 0) / 2;
    const face = first(rPr, "rFonts")?.getAttribute("w:ascii") || first(rPr, "rFonts")?.getAttribute("w:hAnsi") || "";
    const lineVal = num(attr(spacing, "line"));
    const rule = attr(spacing, "lineRule") || "auto";
    const prev = styles[name] || {};
    styles[name] = {
      font: face || prev.font || dFont,
      size: sizeHalf > 0 ? sizeHalf : prev.size,
      bold: first(rPr, "b") ? true : prev.bold,
      italic: first(rPr, "i") ? true : prev.italic,
      color: /^[0-9A-Fa-f]{6}$/.test(attr(first(rPr, "color"), "val")) ? "#" + attr(first(rPr, "color"), "val") : prev.color,
      spaceBefore: num(attr(spacing, "before"), 0) || prev.spaceBefore,
      spaceAfter: num(attr(spacing, "after"), 0) || prev.spaceAfter,
      line: lineVal > 0 ? (rule === "exact" || rule === "atLeast" ? lineVal / 20 : lineVal / 240) : prev.line,
      lineRule: lineVal > 0 && rule !== "auto" ? rule : prev.lineRule,
    };
    if (numPr) lists[name] = { id: attr(first(numPr, "numId"), "val") || "1", level: num(attr(first(numPr, "ilvl"), "val"), 0) };
  }
  if (!styles.Normal) styles.Normal = { font: dFont, size: dSize };
  else {
    if (!styles.Normal.font) styles.Normal.font = dFont;
    if (!(styles.Normal.size > 0)) styles.Normal.size = dSize;
  }
  return { styles, lists, defaults: { font: styles.Normal.font || dFont, size: styles.Normal.size || dSize } };
}

function headingLevel(paragraph) {
  const style = String(paragraph.style || "");
  if (/^heading\s*1$/i.test(style) || paragraph.props?.outline === 0) return 1;
  if (/^heading\s*2$/i.test(style) || paragraph.props?.outline === 1) return 2;
  return 0;
}

/** Build the table of contents from Heading 1 and Heading 2. The TOC field stays. */
export function createTableOfContents(doc) {
  let next = doc.meta?.nextId || 1;
  const take = (prefix) => prefix + String(next++).padStart(6, "0");
  const headings = [];
  for (const section of doc.sections ?? []) {
    for (const block of section.blocks ?? []) {
      if (block.type !== "paragraph") continue;
      const level = headingLevel(block);
      if (!level) continue;
      const text = (block.runs ?? []).map((run) => run.text || "").join("").trim();
      if (text) headings.push({ level, text, anchor: block.id });
    }
  }
  for (const section of doc.sections ?? []) {
    const index = (section.blocks ?? []).findIndex((block) => block.type === "paragraph" && (block.runs ?? []).some((run) => run.type === "field" && String(run.field || run.text || "").toUpperCase().startsWith("TOC")));
    if (index < 0) continue;
    while (section.blocks[index + 1] && (section.blocks[index + 1].style === "TOC1" || section.blocks[index + 1].style === "TOC2")) section.blocks.splice(index + 1, 1);
    const lines = headings.map((heading) => ({
      id: take("p"),
      type: "paragraph",
      style: heading.level === 1 ? "TOC1" : "TOC2",
      props: { indent: { left: heading.level === 2 ? 220 : 0 }, tocPage: "" },
      runs: [{ id: take("r"), type: "text", text: heading.text, href: heading.anchor }],
    }));
    section.blocks.splice(index + 1, 0, ...lines);
  }
  const body = doc.theme?.body || doc.styles?.Normal?.font || "Arial";
  if (!doc.styles.TOC1) doc.styles.TOC1 = { font: body, size: 11, spaceBefore: 40, spaceAfter: 100 };
  if (!doc.styles.TOC2) doc.styles.TOC2 = { font: body, size: 11, spaceBefore: 20, spaceAfter: 80 };
  if (doc.meta) doc.meta.nextId = next;
  return doc;
}

/** Page numbers for the table of contents, from the pages already calculated. */
export function assignTocPages(doc) {
  const pageOf = new Map();
  for (const page of doc.pages ?? []) for (const id of page.blockIds ?? []) pageOf.set(id, page.number);
  for (const section of doc.sections ?? []) {
    for (const block of section.blocks ?? []) {
      if (block.type !== "paragraph" || !String(block.style || "").startsWith("TOC")) continue;
      const href = (block.runs ?? []).find((run) => run.href)?.href;
      block.props = block.props || {};
      block.props.tocPage = href ? pageOf.get(href) || "" : "";
    }
  }
  return doc;
}

function readLists(xml) {
  if (!xml) return {};
  const dom = parseXml(xml);
  const abstracts = {};
  for (const abs of all(dom).filter((el) => el.localName === "abstractNum")) {
    abstracts[attr(abs, "abstractNumId")] = {
      levels: children(abs, "lvl").map((lvl) => ({
        format: attr(first(lvl, "numFmt"), "val") === "bullet" ? "bullet" : "decimal",
        text: attr(first(lvl, "lvlText"), "val"),
        indent: num(attr(all(lvl).find((el) => el.localName === "ind"), "left"), 720),
        hanging: num(attr(all(lvl).find((el) => el.localName === "ind"), "hanging"), 360),
        restart: num(attr(first(lvl, "start"), "val"), 1),
        legal: attr(first(lvl, "isLgl"), "val") === "1" || Boolean(first(lvl, "isLgl")),
      })),
    };
  }
  const lists = {};
  for (const item of all(dom).filter((el) => el.localName === "num" && el.parentElement?.localName === "numbering")) {
    lists[attr(item, "numId")] = abstracts[attr(first(item, "abstractNumId"), "val")] ?? { levels: [{ format: "decimal", text: "%1.", indent: 720, hanging: 360 }] };
  }
  return lists;
}

async function readStoryPart(zip, path, tag, take) {
  const xml = await zip.file(path)?.async("string");
  if (!xml) return {};
  const dom = parseXml(xml);
  const out = {};
  for (const item of all(dom).filter((el) => el.localName === tag)) {
    if (attr(item, "type")) continue;
    const blocks = [];
    for (const child of item.children) if (child.localName === "p") blocks.push({ id: take("p"), type: "paragraph", style: "Normal", props: {}, runs: [{ id: take("r"), type: "text", text: textOf(child) }] });
    out[attr(item, "id")] = { id: take("n"), anchor: "", blocks };
  }
  return out;
}

function readComments(xml) {
  if (!xml) return {};
  const dom = parseXml(xml);
  const out = {};
  for (const item of all(dom).filter((el) => el.localName === "comment")) {
    out[attr(item, "id")] = { id: attr(item, "id"), author: attr(item, "author"), text: textOf(item), anchor: "" };
  }
  return out;
}

async function storyFrom(zip, rels, sect, referenceName, type, kind, take) {
  const ref = children(sect, referenceName).find((el) => (attr(el, "type") || "default") === (type || "default"));
  const empty = () => ({ id: take("y"), kind, blocks: [{ id: take("p"), type: "paragraph", style: kind === "header" ? "Header" : "Footer", props: {}, runs: [{ id: take("r"), type: "text", text: "" }] }] });
  if (!ref) return type ? undefined : empty();
  const xml = await readPart(zip, rels[ref.getAttribute("r:id")]);
  if (!xml) return type ? undefined : empty();
  const dom = parseXml(xml);
  const root = all(dom).find((el) => el.localName === "hdr" || el.localName === "ftr");
  const blocks = [];
  const ctx = { take, lists: {}, bookmarks: [], styles: { lists: {} }, assets: {}, notes: {}, endnotes: {}, comments: {} };
  for (const child of root ? [...root.children] : []) {
    if (child.localName === "p") blocks.push(...readParagraph(child, ctx).filter((block) => block.type === "paragraph"));
  }
  return { id: take("y"), kind, blocks: blocks.length ? blocks : empty().blocks };
}
