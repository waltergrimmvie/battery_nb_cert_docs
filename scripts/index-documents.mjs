import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const documents = join(root, "documents");
const lockFile = join(root, "documents-uploaded.txt");

const locked = existsSync(lockFile) && /locked/i.test(readFileSync(lockFile, "utf8"));

const directories = readdirSync(documents)
  .filter((name) => statSync(join(documents, name)).isDirectory())
  .sort((a, b) => {
    if (a === "General Documents") return -1;
    if (b === "General Documents") return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  })
  .map((name) => ({
    name,
    files: readdirSync(join(documents, name))
      .filter((file) => /\.(docx|xlsx|xls|pptx)$/i.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  }));

writeFileSync(join(documents, "index.json"), `${JSON.stringify(directories, null, 2)}\n`);

if (locked) {
  console.log("documents-uploaded.txt is locked — public/documents/ was not touched");
  console.log("index.json was refreshed only. Do not overwrite the Cloudflare document upload.");
  process.exit(0);
}

const published = join(root, "public", "documents");
rmSync(published, { recursive: true, force: true });
mkdirSync(join(root, "public"), { recursive: true });
cpSync(documents, published, { recursive: true });

const total = directories.reduce((sum, directory) => sum + directory.files.length, 0);
console.log(`indexed ${directories.length} directories, ${total} documents`);
