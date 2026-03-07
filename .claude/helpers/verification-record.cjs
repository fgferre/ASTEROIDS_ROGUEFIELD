#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function findProjectRoot() {
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, ".claude")) || fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

const PROJECT_ROOT = findProjectRoot();
const FILE = path.join(PROJECT_ROOT, ".claude", "runtime", "verification-checks.json");

function readState() {
  try {
    if (!fs.existsSync(FILE)) return { checks: [] };
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (_error) {
    return { checks: [] };
  }
}

function writeState(checks) {
  const payload = {
    checks: [...new Set(checks.map((i) => String(i).trim()).filter(Boolean))],
    updatedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const argSet = args.find((a) => a.startsWith("--set="));
  const argAdd = args.find((a) => a.startsWith("--add="));
  const clear = args.includes("--clear");
  const list = args.includes("--list");

  if (clear) {
    writeState([]);
    process.stdout.write("[verification-record] cleared\n");
    return;
  }

  if (argSet) {
    writeState(parseList(argSet.slice("--set=".length)));
    process.stdout.write(`[verification-record] set -> ${FILE}\n`);
    return;
  }

  if (argAdd) {
    const state = readState();
    const merged = [...(state.checks || []), ...parseList(argAdd.slice("--add=".length))];
    writeState(merged);
    process.stdout.write(`[verification-record] add -> ${FILE}\n`);
    return;
  }

  if (list || args.length === 0) {
    const state = readState();
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    "usage: verification-record.cjs [--list] [--clear] [--set=a,b] [--add=a,b]\n"
  );
}

main();

