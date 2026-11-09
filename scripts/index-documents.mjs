import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const documents = join(root, "documents");

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
      .filter((file) => /\.(docx|xlsx|xls)$/i.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  }));

writeFileSync(join(documents, "index.json"), `${JSON.stringify(directories, null, 2)}\n`);

const published = join(root, "public", "documents");
rmSync(published, { recursive: true, force: true });
mkdirSync(join(root, "public"), { recursive: true });
cpSync(documents, published, { recursive: true });

const total = directories.reduce((sum, directory) => sum + directory.files.length, 0);
console.log(`indexed ${directories.length} directories, ${total} documents`);
