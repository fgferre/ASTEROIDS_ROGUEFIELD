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
const MODE_FILE = path.join(PROJECT_ROOT, ".claude", "runtime", "mode.json");
const CHECKS_FILE = path.join(PROJECT_ROOT, ".claude", "runtime", "verification-checks.json");
const STRICT = process.env.VERIFY_STRICT === "1";

const REQUIRED_BY_MODE = {
  FAST: ["targeted-check"],
  PLAN: ["plan", "tests-or-lint", "diff-relevant"],
  SAFE: ["plan", "tests", "logs-reviewed", "security-check", "diff-relevant"],
  RECOVERY: ["root-cause", "replan", "regression-test"]
};

function readMode() {
  try {
    const raw = fs.readFileSync(MODE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.mode || "FAST";
  } catch (_error) {
    return "FAST";
  }
}

function getChecks() {
  const arg = process.argv.find((item) => item.startsWith("--checks="));
  const fromArg = arg ? arg.slice("--checks=".length) : "";
  const raw = fromArg.trim();
  const checks = new Set();

  if (raw) {
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => checks.add(item));
  }

  // Optional file-based checks to allow external tooling integration.
  try {
    if (fs.existsSync(CHECKS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CHECKS_FILE, "utf8"));
      if (Array.isArray(parsed.checks)) {
        parsed.checks
          .map((item) => String(item).trim())
          .filter(Boolean)
          .forEach((item) => checks.add(item));
      }
    }
  } catch (_error) {
    // Ignore malformed check file in advisory mode.
  }

  return checks;
}

function main() {
  const mode = readMode();
  const required = REQUIRED_BY_MODE[mode] || REQUIRED_BY_MODE.FAST;
  const checks = getChecks();

  if (checks.size === 0) {
    const advisory = `[verify-by-mode] advisory-only: no checks provided for mode=${mode}. required=${required.join(",")}`;
    if (STRICT) {
      process.stderr.write(`${advisory}\n`);
      process.exit(2);
    }
    process.stdout.write(`${advisory}\n`);
    process.exit(0);
  }

  const missing = required.filter((item) => !checks.has(item));

  if (missing.length === 0) {
    process.stdout.write(`[verify-by-mode] mode=${mode} verification=ok\n`);
    process.exit(0);
  }

  const message = `[verify-by-mode] mode=${mode} missing_checks=${missing.join(",")}`;
  if (STRICT) {
    process.stderr.write(`${message} (blocked)\n`);
    process.exit(2);
  }

  process.stdout.write(`${message} (soft warning)\n`);
}

main();
