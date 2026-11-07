import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_TREE, demoCopy } from "../main_page/demo_tree.js";
import { KNOWN_NAMES } from "../setup/login_user.js";
import { browserFiles } from "../src/browser-files.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("demo tree has five roots and six or seven children each", () => {
  assert.equal(DEMO_TREE.length, 5);
  for (const node of DEMO_TREE) {
    assert.ok(node.children.length === 6 || node.children.length === 7, node.label);
    const copy = demoCopy(node, node.children[0]);
    assert.match(copy, new RegExp(node.children[0].label));
    assert.match(copy, new RegExp(node.label.replace(/[()]/g, "\\$&")));
  }
});

test("login offers the desk names and no typed name", () => {
  assert.deepEqual(KNOWN_NAMES, ["Judy", "Marcus", "Wei", "Walter"]);
  const login = readFileSync(join(root, "setup/login_user.js"), "utf8");
  assert.equal(login.includes("createElement(\"input\")"), false);
  assert.match(login, /Choose your name and press Enter/);
});

test("worker serves the same modules startup calls", () => {
  const expected = [
    "/startup/startup.js",
    "/startup/desk.js",
    "/setup/login_user.js",
    "/main_page/construct_main_page.js",
    "/main_page/demo_tree.js",
    "/menu_bar/construct_design/construct_design.js",
    "/menu_bar/populate/populate.js",
  ];
  for (const path of expected) {
    assert.equal(browserFiles[path], readFileSync(join(root, path.slice(1)), "utf8"), path);
  }
});
