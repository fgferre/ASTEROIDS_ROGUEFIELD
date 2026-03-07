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
const OUTPUT_FILE = path.join(PROJECT_ROOT, ".claude", "runtime", "hook-env-probe.json");

function readStdinJson() {
  if (process.stdin.isTTY) return {};
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_error) {
    return {};
  }
}

function main() {
  const stdin = readStdinJson();
  const keys = Object.keys(process.env)
    .filter(
      (key) =>
        key.includes("CLAUDE") ||
        key.includes("TOOL") ||
        key.includes("PROMPT")
    )
    .sort();

  const payload = {
    capturedAt: new Date().toISOString(),
    stdinKeys: Object.keys(stdin),
    stdinPreview: JSON.stringify(stdin).slice(0, 800),
    envKeyCount: keys.length,
    envKeys: keys.map((key) => ({
      key,
      length: String(process.env[key] || "").length
    }))
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`[hook-env-probe] wrote ${OUTPUT_FILE}\n`);
}

main();
