import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWN_NAMES } from "../setup/login_user.js";
import { browserFiles } from "../src/browser-files.js";
import { setOnlineUsers, getOnlineUsers, watchOnlineUsers } from "../menu_bar/online_users.js";
import { docxToParagraphs } from "../main_page/read_docx.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("document directories are the tree and each Word file is a child", async () => {
  const index = JSON.parse(readFileSync(join(root, "documents/index.json"), "utf8"));
  assert.equal(index[0].name, "General Documents");
  assert.deepEqual(index[0].files, [
    "EU Battery Line Checklist.docx",
    "EU_Battery_17065_Detailed_Checklist_v5_Compressed.xlsx",
  ]);
  assert.deepEqual(index.slice(1).map((directory) => directory.name), [
    "01_Legal_Contractual_Matters",
    "02_Impartiality_Supply_Chain_Risks",
    "03_Financial_Liability_Resources",
    "04_Structural_Impartiality_Mechanism",
    "05_Personnel_Competence_Training",
    "06_Technical_Evaluation_Process",
    "07_Surveillance_Changes_Withdrawal",
    "08_Management_System_Improvement",
  ]);
  for (const directory of index) {
    assert.ok(directory.files.length > 0, directory.name);
    assert.ok(directory.files.every((file) => /\.(docx|xlsx|xls)$/i.test(file)));
    const published = readFileSync(join(root, "public/documents", directory.name, directory.files[0]));
    assert.ok(published.length > 1000);
  }
  const legal = index.find((directory) => directory.name === "01_Legal_Contractual_Matters");
  const bytes = readFileSync(join(root, "documents", legal.name, legal.files[0]));
  const paragraphs = await docxToParagraphs(bytes);
  assert.match(paragraphs.join("\n"), /Verification Point 001/);
  assert.match(paragraphs.join("\n"), /Legal & Contractual Matters/);
  const checklist = await docxToParagraphs(readFileSync(join(root, "documents", index[0].name, index[0].files[0])));
  assert.match(checklist.join("\n"), /CLIENT REQUIREMENTS CHECKLIST/);
});

test("login offers the desk names and no typed name", () => {
  assert.deepEqual(KNOWN_NAMES, ["Judy", "Marcus", "Wei", "Walter"]);
  const login = readFileSync(join(root, "setup/login_user.js"), "utf8");
  assert.equal(login.includes("createElement(\"input\")"), false);
  assert.match(login, /Choose your name and press Enter/);
});

test("online array replaces when someone logs on or off", () => {
  const seen = [];
  const stop = watchOnlineUsers((users) => seen.push(users.length));
  assert.equal(setOnlineUsers([{ id: "a", name: "Walter" }, { id: "b", name: "Judy" }]), 2);
  assert.deepEqual(getOnlineUsers().map((user) => user.name), ["Walter", "Judy"]);
  assert.equal(setOnlineUsers([{ id: "a", name: "Walter" }]), 1);
  assert.deepEqual(seen.slice(-2), [2, 1]);
  setOnlineUsers([]);
  stop();
});

test("worker serves the same modules startup calls", () => {
  const expected = [
    "/startup/startup.js",
    "/startup/desk.js",
    "/setup/login_user.js",
    "/main_page/construct_main_page.js",
    "/main_page/read_docx.js",
    "/menu_bar/construct_design/construct_design.js",
    "/menu_bar/online_users.js",
    "/menu_bar/populate/populate.js",
  ];
  for (const path of expected) {
    assert.equal(browserFiles[path], readFileSync(join(root, path.slice(1)), "utf8"), path);
  }
});
