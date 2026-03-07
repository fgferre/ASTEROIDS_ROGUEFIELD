#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function findProjectRoot() {
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, ".claude")) || fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd(); // fallback
    dir = parent;
  }
}

const PROJECT_ROOT = findProjectRoot();
const RUNTIME_DIR = path.join(PROJECT_ROOT, ".claude", "runtime");
const MODE_FILE = path.join(RUNTIME_DIR, "mode.json");
const MODE_TTL_MS = Number(process.env.MODE_TTL_MS || 45 * 60 * 1000);
const MAX_TEXT_LEN = 5000;

const SAFE_RULES = [
  { id: "auth", re: /\b(auth|authentication|authorization|login|senha|oauth|jwt)\b/i },
  { id: "secrets", re: /\b(secret|api[\s_-]?key|credentials?|access[\s_-]?token|refresh[\s_-]?token|bearer[\s_-]?token|secret[\s_-]?token|auth[\s_-]?token|session[\s_-]?token)\b/i },
  { id: "payments", re: /\b(payment|pagamento|pix|stripe|billing|invoice|charge)\b/i },
  { id: "database", re: /\b(database|db|schema|migration|migracao|sql|supabase|prisma|rls|row\s*level)\b/i },
  { id: "deploy", re: /\b(deploy|infra|infrastructure|terraform|k8s|kubernetes|docker|prod(uction)?)\b/i },
  { id: "api-contract", re: /\b(public\s*api|api\s*contract|breaking\s*change)\b/i },
  { id: "compliance", re: /\b(gdpr|lgpd|compliance|pii)\b/i }
];

const PLAN_RULES = [
  { id: "architecture", re: /\b(architecture|arquitetura|design\s*decision|ddd|bounded\s*context)\b/i },
  { id: "refactor", re: /\b(refactor|refator|rewrite|restructure)\b/i },
  { id: "feature", re: /\b(new\s*feature|nova\s*feature|novo\s*modulo|new\s*module|new\s*component)\b/i },
  { id: "dependency", re: /\b(new\s*dependency|upgrade\s*dependency|dependency\s*upgrade)\b/i },
  { id: "multi-step", re: /\b(multi[-\s]?step|several\s*files|varios\s*arquivos|large\s*change)\b/i }
];

const RECOVERY_RULES = [
  { id: "regression", re: /\b(regression|regressao|reintroduziu)\b/i },
  { id: "rollback", re: /\b(rollback|roll\s*back|revert)\b/i },
  { id: "repeated-failure", re: /\b(erro\s*repetido|failing\s*ci|keeps\s*failing)\b/i },
  { id: "incident", re: /\b(outage|incident|hotfix|sev[0-9])\b/i }
];

// Path-segment-aware rules: match directory names or file prefixes, not substrings.
// Uses (^|[\\/]) to anchor on path separators so "authenticate.dart" won't match "auth".
const RISKY_PATH_RULES = [
  /(^|[\\/])migrations?([\\/]|$)/i,
  /(^|[\\/])schema([\\/.])/i,
  /(^|[\\/])supabase([\\/]|$)/i,
  /(^|[\\/])prisma([\\/]|$)/i,
  /(^|[\\/])terraform([\\/]|$)/i,
  /(^|[\\/])(k8s|kubernetes)([\\/]|$)/i,
  /(^|[\\/])(docker|Dockerfile)/i,
  /(^|[\\/])auth([\\/]|$)/i,
  /(^|[\\/])secrets?([\\/]|$)/i,
  /(^|[\\/])(payments?|billing)([\\/]|$)/i
];

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

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

function collectPrompt(stdin) {
  if (stdin && typeof stdin.prompt === "string" && stdin.prompt.trim()) {
    return {
      text: stdin.prompt.trim().slice(0, MAX_TEXT_LEN),
      source: "stdin"
    };
  }

  const argPrompt = process.argv.slice(2).join(" ").trim();
  if (argPrompt) {
    return {
      text: argPrompt.slice(0, MAX_TEXT_LEN),
      source: "argv"
    };
  }

  // Optional env fallback for non-standard wrappers.
  const envPrompt = [
    process.env.CLAUDE_USER_PROMPT,
    process.env.CLAUDE_PROMPT,
    process.env.PROMPT,
    process.env.USER_PROMPT
  ].find((v) => v && v.trim());
  if (envPrompt) {
    return { text: envPrompt.trim().slice(0, MAX_TEXT_LEN), source: "env" };
  }

  return { text: "", source: "none" };
}

function hashInput(input) {
  return crypto.createHash("sha256").update(input || "").digest("hex");
}

function getChangedFiles() {
  // Primary signal: files changed since last commit (staged + unstaged).
  // This avoids polluting mode detection with long-lived untracked files.
  try {
    const diffOut = execSync("git diff --name-only HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const stagedOut = execSync("git diff --name-only --cached", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const files = [...diffOut.split("\n"), ...stagedOut.split("\n")]
      .map((line) => line.trim())
      .filter(Boolean);
    if (files.length > 0) return [...new Set(files)];
  } catch (_error) {
    // Falls through to full status (e.g., no commits yet).
  }

  // Fallback: full git status (new repos, detached HEAD, etc.).
  try {
    const out = execSync("git status --porcelain --untracked-files=normal", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3).split(" -> ").pop().trim())
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function findRuleMatches(text, rules) {
  return rules
    .filter((rule) => rule.re.test(text))
    .map((rule) => rule.id);
}

function findPathRisk(files) {
  return files.filter((file) => RISKY_PATH_RULES.some((rule) => rule.test(file)));
}

function parseModeOverride(text) {
  const patterns = [
    /\[(FAST|PLAN|SAFE|RECOVERY)\]/i,
    /\bmode\s*[:=]\s*(FAST|PLAN|SAFE|RECOVERY)\b/i,
    /--mode(?:=|\s+)(FAST|PLAN|SAFE|RECOVERY)\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function isAmbiguousPrompt(text) {
  if (!text) return true;
  return /\b(continue|next|seguir|prossiga|same task|mesma tarefa|as discussed)\b/i.test(
    text
  );
}

function writeModeFile(data) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(MODE_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  // Clear stale verification checks from previous task.
  const checksFile = path.join(RUNTIME_DIR, "verification-checks.json");
  try { fs.unlinkSync(checksFile); } catch (_) { /* no-op if absent */ }
}

function maybeDumpDebug(source, text, stdin) {
  if (process.env.MODE_ROUTER_DEBUG !== "1") return;
  const debugFile = path.join(RUNTIME_DIR, "mode-router-debug.json");
  const snapshot = {
    source,
    textLength: text.length,
    stdinKeys: Object.keys(stdin || {}),
    envKeys: Object.keys(process.env).filter(
      (key) =>
        key.includes("CLAUDE") ||
        key.includes("PROMPT") ||
        key.includes("TOOL_INPUT")
    ),
    updatedAt: new Date().toISOString()
  };
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(debugFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function main() {
  const stdin = readStdinJson();
  const { text: promptText, source } = collectPrompt(stdin);
  const normalizedPrompt = normalize(promptText);
  const changedFiles = getChangedFiles();
  const riskyPaths = findPathRisk(changedFiles);

  const override = parseModeOverride(promptText);
  const recoveryMatches = findRuleMatches(normalizedPrompt, RECOVERY_RULES);
  const safeMatches = findRuleMatches(normalizedPrompt, SAFE_RULES);
  const planMatches = findRuleMatches(normalizedPrompt, PLAN_RULES);

  let mode = "FAST";
  let reason = "default low-risk path";

  // Compute inferred mode first, then apply override with downgrade protection.
  let inferredMode = "FAST";
  let inferredReason = "default low-risk path";

  if (recoveryMatches.length > 0) {
    inferredMode = "RECOVERY";
    inferredReason = `recovery rules: ${recoveryMatches.join(", ")}`;
  } else if (safeMatches.length > 0 || riskyPaths.length > 0) {
    inferredMode = "SAFE";
    inferredReason =
      safeMatches.length > 0
        ? `safe rules: ${safeMatches.join(", ")}`
        : `safe paths changed: ${riskyPaths.slice(0, 3).join(", ")}`;
  } else if (planMatches.length > 0) {
    inferredMode = "PLAN";
    inferredReason = `plan rules: ${planMatches.join(", ")}`;
  } else if (changedFiles.length >= 3 && isAmbiguousPrompt(normalizedPrompt)) {
    inferredMode = "PLAN";
    inferredReason = `ambiguous prompt + changed files >= 3 (${changedFiles.length})`;
  }

  const MODE_RANK = { FAST: 0, PLAN: 1, SAFE: 2, RECOVERY: 3 };

  if (override) {
    const overrideRank = MODE_RANK[override] || 0;
    const inferredRank = MODE_RANK[inferredMode] || 0;
    if (overrideRank >= inferredRank) {
      mode = override;
      reason = `manual override: ${override}`;
    } else {
      // Downgrade blocked — use inferred mode but note the attempt.
      mode = inferredMode;
      reason = `${inferredReason} (downgrade to ${override} blocked)`;
    }
  } else {
    mode = inferredMode;
    reason = inferredReason;
  }

  const payload = {
    mode,
    reason,
    source,
    changedFiles: changedFiles.length,
    riskyPaths: riskyPaths.slice(0, 10),
    matches: {
      safe: safeMatches,
      plan: planMatches,
      recovery: recoveryMatches
    },
    inputHash: hashInput(promptText),
    updatedAt: new Date().toISOString(),
    ttlMs: MODE_TTL_MS,
    version: "router-v2"
  };

  writeModeFile(payload);
  maybeDumpDebug(source, promptText, stdin);

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    `[mode-router] mode=${mode} source=${source} changed_files=${changedFiles.length} reason="${reason}"\n`
  );
}

main();
