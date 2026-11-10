// Makes a viewer accept a stored JSON document and remember the one it imported.
// The desk saves that JSON and hands it back on the next populate.

export function rememberImported(source) {
  if (source.includes("window.__lastDocument")) return source;
  source = source.replace(
    "return t.opened=!0,await t.openDocument(o,r),!0",
    "return t.opened=!0,window.__lastDocument=o,await t.openDocument(o,r),!0",
  );
  source = source.replace(
    "await readyBook.openDocument(doc, name);",
    "window.__lastDocument = doc; await readyBook.openDocument(doc, name);",
  );
  source = source.replace(
    "return U.opened=!0,Si(a,r+`.docx`),!0",
    "return window.__lastDocument=a,U.opened=!0,Si(a,r+`.docx`),!0",
  );
  source = source.replace(
    "populate(doc, stem + \".docx\");",
    "window.__lastDocument = doc; populate(doc, stem + \".docx\");",
  );
  source = source.replace(
    "(PPT.populate)(result.deck, result.report);",
    "window.__lastDocument = result.deck; (PPT.populate)(result.deck, result.report);",
  );
  source = source.replace(
    "QP.adoptDocument(QP.page, doc);",
    "window.__lastDocument = doc; QP.adoptDocument(QP.page, doc);",
  );
  source = source.replace(
    "var api = Gantt.populate(data);",
    "window.__lastDocument = data; var api = Gantt.populate(data);",
  );
  return source;
}

export function acceptStoredJson(source) {
  source = rememberImported(source);
  if (source.includes("stored JSON")) return source;

  const editor = "let n=await t.arrayBuffer(),r=decodeURIComponent((String(e).split(`/`).pop()||`document`).split(`?`)[0].replace(/\\.docx$/i,``))";
  if (source.includes(editor)) {
    source = source.replace(
      editor,
      "let n=await t.arrayBuffer();let raw=new TextDecoder().decode(n).trim();if(raw.charAt(0)===`{`||raw.charAt(0)===`[`){let doc=JSON.parse(raw);if(!doc?.sections?.length)throw Error(`The stored JSON has no sections`);window.__lastDocument=doc;U.opened=!0;Si(doc,`document.docx`);return doc}let r=decodeURIComponent((String(e).split(`/`).pop()||`document`).split(`?`)[0].replace(/\\.docx$/i,``))",
    );
  }

  const ppt = `var result = await PPT.importPptx(buffer, name);
    if (!result || !result.deck || !result.deck.slides) throw new Error("The file did not become a QPP deck.");
    window.__lastDocument = result.deck; (PPT.populate)(result.deck, result.report);
    return true;`;
  if (source.includes("PPT.importPptx(buffer, name)")) {
    source = source.replace(
      `var buffer = await response.arrayBuffer();
    var name = decodeURIComponent((String(src).split("/").pop() || "deck").split("?")[0]);
    var result = await PPT.importPptx(buffer, name);`,
      `var buffer = await response.arrayBuffer();
    var name = decodeURIComponent((String(src).split("/").pop() || "deck").split("?")[0]);
    var raw = new TextDecoder().decode(buffer).trim();
    if (raw.charAt(0) === "{" || raw.charAt(0) === "[") {
      var stored = JSON.parse(raw);
      if (!stored || !stored.slides) throw new Error("The stored JSON has no slides.");
      window.__lastDocument = stored;
      (PPT.populate)(stored, { source: "json" });
      return stored;
    }
    var result = await PPT.importPptx(buffer, name);`,
    );
  }

  const pdf = `var buffer = await response.arrayBuffer();
    var name = decodeURIComponent((String(src).split("/").pop() || "document.pdf").split("?")[0]);
    var convert = QP.convertPdfToJson || QP.translatePdfToJson;`;
  if (source.includes(pdf)) {
    source = source.replace(
      pdf,
      `var buffer = await response.arrayBuffer();
    var name = decodeURIComponent((String(src).split("/").pop() || "document.pdf").split("?")[0]);
    var raw = new TextDecoder().decode(buffer).trim();
    if (raw.charAt(0) === "{" || raw.charAt(0) === "[") {
      var stored = JSON.parse(raw);
      window.__lastDocument = stored;
      QP.adoptDocument(QP.page, stored);
      return stored;
    }
    var convert = QP.convertPdfToJson || QP.translatePdfToJson;`,
    );
  }

  return source;
}
