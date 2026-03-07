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
const RUNTIME_DIR = path.join(PROJECT_ROOT, ".claude", "runtime");
const MODE_FILE = path.join(RUNTIME_DIR, "mode.json");
const STRICT = process.env.MODE_GUARD_STRICT === "1";

const RISKY_RULES = [
  { id: "rm-rf", re: /(^|\s)rm\s+-[^\s]*r[^\s]*f\b/i },
  { id: "git-reset-hard", re: /\bgit\s+reset\s+--hard\b/i },
  { id: "git-clean-fdx", re: /\bgit\s+clean\s+-fdx\b/i },
  { id: "drop-truncate-table", re: /\b(drop|truncate)\s+table\b/i },
  { id: "pipe-shell", re: /\b(curl|wget)\b[^\n|]*\|\s*(bash|sh)\b/i },
  { id: "chmod-777", re: /\bchmod\s+777\b/i },
  { id: "windows-del", re: /\bdel\s+\/s\s+\/q\b/i },
  { id: "format-drive", re: /\bformat\s+[a-z]:\b/i }
];

const HEAVY_RULES = [
  { id: "subagent", re: /\b(subagent|spawn\s+agent|swarm)\b/i },
  { id: "heavy-tests", re: /\b(test:all|full\s+test|e2e)\b/i },
  { id: "benchmark", re: /\b(benchmark|deep\s+audit)\b/i }
];

// Two-layer risk detection:
// 1) Path-segment rule for file_path — avoids "authenticate.dart" matching "auth".
// 2) Content rule for code body — catches "auth_token", "api_key", etc. in new_string/command.
const HIGH_RISK_PATH_RULE = /(^|[\\/])(migrations?|schema|supabase|prisma|terraform|infra|k8s|docker|auth|secrets?|credentials?|payments?|billing)([\\/.]|$)/i;
const HIGH_RISK_CONTENT_RULE = /\b(api[_-]?key|secret[_-]?token|auth[_-]?token|access[_-]?token|refresh[_-]?token|bearer[_-]?token|session[_-]?token|credentials?|password|private[_-]?key)\b/i;
/* eslint-disable-next-line no-control-regex -- pattern must match literal flag text */
const SKIP_TEST_RULE = /(\x2d-no-verify|\x2d-skip(?:-|\s)?tests?|skip\s+tests?|no\s+tests?)/i;

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

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function flattenStrings(input, sink, depth = 0) {
  if (depth > 3 || sink.length > 40) return;

  if (typeof input === "string") {
    const text = input.trim();
    if (text) sink.push(text);
    return;
  }

  if (Array.isArray(input)) {
    for (const item of input) flattenStrings(item, sink, depth + 1);
    return;
  }

  if (input && typeof input === "object") {
    const keys = [
      "command",
      "input",
      "arguments",
      "text",
      "content",
      "description",
      "file_path",
      "path",
      "new_string",
      "old_string"
    ];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        flattenStrings(input[key], sink, depth + 1);
      }
    }
  }
}

function readModeState() {
  try {
    const raw = fs.readFileSync(MODE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const mode = parsed.mode || "FAST";
    const updatedAtMs = Date.parse(parsed.updatedAt || "");
    const ttlMs = Number(parsed.ttlMs || 45 * 60 * 1000);
    const hasValidTimestamp = Number.isFinite(updatedAtMs);
    const stale = !hasValidTimestamp || Date.now() - updatedAtMs > ttlMs;
    return { mode, stale, updatedAt: parsed.updatedAt || null, ttlMs };
  } catch (_error) {
    return { mode: "FAST", stale: true, updatedAt: null, ttlMs: 45 * 60 * 1000 };
  }
}

function collectToolContext(stdin) {
  const toolName = String(stdin.tool_name || stdin.tool || "").trim();
  const parts = [];

  // Extract file_path separately for path-segment-aware risk check.
  let filePath = "";
  if (stdin.tool_input) {
    const fp = stdin.tool_input.file_path || stdin.tool_input.path || "";
    if (typeof fp === "string") filePath = fp.trim();
    flattenStrings(stdin.tool_input, parts);
  }

  if (stdin.prompt) {
    parts.push(String(stdin.prompt));
  }

  // Env fallback: only used for manual/non-standard invocations.
  // Claude Code hooks send data via stdin (handled above).
  const inputCandidates = [
    process.env.CLAUDE_TOOL_INPUT,
    process.env.TOOL_INPUT,
    process.env.TOOL_INPUT_command,
    process.env.TOOL_INPUT_arguments,
    process.env.COMMAND,
    process.env.PROMPT
  ];
  for (const raw of inputCandidates) {
    if (!raw || !raw.trim()) continue;
    const parsed = safeJsonParse(raw);
    if (parsed) {
      flattenStrings(parsed, parts);
    } else {
      parts.push(raw.trim());
    }
  }

  const argText = process.argv.slice(2).join(" ").trim();
  if (argText) parts.push(argText);

  const text = normalize(parts.join("\n").slice(0, 10000));
  return { toolName: toolName.toLowerCase(), text, filePath };
}

function findRuleHit(text, rules) {
  for (const rule of rules) {
    if (rule.re.test(text)) return rule.id;
  }
  return null;
}

function maybeDumpDebug(modeState, toolName, text, stdin) {
  if (process.env.MODE_GUARD_DEBUG !== "1") return;
  const debugFile = path.join(PROJECT_ROOT, ".claude", "runtime", "mode-guard-debug.json");
  const payload = {
    mode: modeState.mode,
    stale: modeState.stale,
    updatedAt: modeState.updatedAt,
    toolName,
    textLength: text.length,
    stdinKeys: Object.keys(stdin || {}),
    envKeys: Object.keys(process.env).filter(
      (key) =>
        key.includes("CLAUDE") ||
        key.includes("TOOL_INPUT") ||
        key.includes("TOOL_NAME")
    ),
    generatedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(debugFile), { recursive: true });
  fs.writeFileSync(debugFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function warn(message) {
  process.stdout.write(`${message}\n`);
}

function main() {
  const modeState = readModeState();
  const stdin = readStdinJson();
  const { toolName, text, filePath } = collectToolContext(stdin);

  maybeDumpDebug(modeState, toolName, text, stdin);

  const riskyHit = findRuleHit(text, RISKY_RULES);
  if (riskyHit) {
    block(`[mode-guard] blocked risky operation (${riskyHit})`);
  }

  const heavyHit = findRuleHit(text, HEAVY_RULES);
  const isEditTool = /(write|edit|multiedit|notebookedit)/i.test(toolName);

  if (modeState.mode === "SAFE" && SKIP_TEST_RULE.test(text)) {
    block("[mode-guard] SAFE mode forbids skipping tests/verification.");
  }

  if (modeState.mode === "FAST" && heavyHit) {
    const msg = `[mode-guard] FAST mode detected heavy action (${heavyHit}). Prefer PLAN.`;
    if (STRICT) block(`${msg} Blocked because MODE_GUARD_STRICT=1.`);
    warn(`${msg} Allowed in soft mode.`);
  }

  // Two-layer high-risk edit check:
  // 1) Path-segment rule on file_path (precise, no false positives).
  // 2) Content rule on full text (catches secrets/tokens in code body).
  if (modeState.mode === "FAST" && isEditTool) {
    const pathHit = filePath && HIGH_RISK_PATH_RULE.test(filePath);
    const contentHit = HIGH_RISK_CONTENT_RULE.test(text);
    if (pathHit || contentHit) {
      const detail = pathHit ? "risky path" : "sensitive content";
      const msg = `[mode-guard] FAST mode detected high-risk edit (${detail}). Prefer SAFE.`;
      if (STRICT) block(`${msg} Blocked because MODE_GUARD_STRICT=1.`);
      warn(`${msg} Allowed in soft mode.`);
    }
  }

  if (modeState.stale) {
    warn(
      `[mode-guard] mode state is stale (updatedAt=${modeState.updatedAt || "n/a"} ttlMs=${modeState.ttlMs}).`
    );
  }

  process.stdout.write(
    `[mode-guard] allow mode=${modeState.mode} tool=${toolName || "unknown"}\n`
  );
}

main();
