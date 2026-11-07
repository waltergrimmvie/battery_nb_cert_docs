export async function readDocx(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The document could not be opened.");
  return docxToParagraphs(new Uint8Array(await response.arrayBuffer()));
}

export async function docxToParagraphs(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const xml = new TextDecoder().decode(await zipEntry(data, "word/document.xml"));
  return paragraphsFromXml(xml);
}

function paragraphsFromXml(xml) {
  const paragraphs = [];
  const blocks = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
  for (const block of blocks) {
    const parts = [];
    for (const match of block.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) {
      parts.push(decodeXml(match[1]));
    }
    const text = parts.join("").replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

function decodeXml(value) {
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = current
      .replaceAll("&" + "amp;", "&")
      .replaceAll("&" + "lt;", "<")
      .replaceAll("&" + "gt;", ">")
      .replaceAll("&" + "quot;", '"')
      .replaceAll("&" + "apos;", "'");
    if (next === current) return current;
    current = next;
  }
  return current;
}

async function zipEntry(bytes, name) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes);
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Not a Word document.");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const entryName = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (entryName === name) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(start, start + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflate(compressed);
      throw new Error("This Word file uses an unsupported compression.");
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("The Word file has no document body.");
}

function findEocd(bytes) {
  const start = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      return i;
    }
  }
  throw new Error("Not a Word document.");
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
