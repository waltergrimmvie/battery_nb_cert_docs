// Runs before startup. Creates the indexed database the desk reads files from.
import { openFiles } from "../database/indexed/files.js";

const stamp = new URL(import.meta.url).search;

export async function createIndexed() {
  const db = await openFiles();
  if (!db.objectStoreNames.contains("files")) {
    throw new Error("The files table was not created.");
  }
  db.close();
  return true;
}

await createIndexed();
await import(`../startup/startup.js${stamp}`);
