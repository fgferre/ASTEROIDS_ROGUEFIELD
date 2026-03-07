# Agent Policy

## Principles (always on)
- Minimal change that solves the issue. Find root cause, no hacks.
- Touch only necessary code. Fix bugs end-to-end.
- Before creating any file, folder, or module: search for existing equivalents and name what you found. Create only if nothing fits, stating why.
- Never rename, move, or reorganize files unless explicitly requested.
- Never rewrite working code when a local edit solves the task.

## Mode (auto-detected via .claude/runtime/mode.json)
- Re-evaluated on each prompt. Override with `[FAST]`, `[PLAN]`, `[SAFE]`, or `[RECOVERY]`.
- If mode file is missing or stale, run `node .claude/helpers/mode-router.cjs`.
- Scope: mode detection uses `git diff HEAD` (uncommitted changes), not full working tree. Commit often to keep detection accurate.

### FAST (default)
- Implement directly. Targeted verification only.
- No mandatory task files.

### PLAN (3+ files, architecture, refactor)
- Write checkable plan before coding. Use `tasks/todo.md`.
- Subagents only if they reduce total time.
- One clear task per subagent.

### SAFE (auth, payments, secrets, DB, deploy, public API)
- All PLAN rules apply.
- Never complete without evidence (tests, logs, behavior diff).
- No skipping tests. Show proof bundle: what changed + how validated + residual risk.

### RECOVERY (repeated failure, regression)
- Stop pushing changes. Identify root cause first.
- Re-plan minimal fix path before new edits.
- Exit only after root cause confirmed + regression test passes.
- Log failure pattern in `tasks/lessons.md`.

## Verification
- Never mark done without proof.
- Compare with main when relevant.
- "Would a staff engineer approve this?"
- Record checks as you go: `node .claude/helpers/verification-record.cjs --set=plan,tests,diff-relevant`
- Stop hook reads those checks automatically via `verify-by-mode.cjs`.

## Guardrails
- `PreToolUse` guard covers `Bash|Write|Edit|MultiEdit|NotebookEdit` (not Task — subagent spawning is unguarded).
- `Stop` hook runs advisory verification.
- Hooks consume JSON via stdin (fallback argv for manual runs).
- Debug: `MODE_ROUTER_DEBUG=1` / `MODE_GUARD_DEBUG=1` → check `.claude/runtime/`.
- Inspect hook payload: `node .claude/helpers/hook-env-probe.cjs`

## Subagent Orchestration (advisory — not enforced by hooks)

### When to decompose
- **Inline (no subagents):** single file, clear scope, FAST mode.
- **Spawn subagents:** 3+ independent files, codebase-wide search, or PLAN/SAFE with separable subtasks.
- **Never spawn in RECOVERY** — linear work until root cause confirmed.

### Decomposition by mode
| Mode     | Threshold                          | Max parallel |
|----------|------------------------------------|--------------|
| FAST     | avoid; prefer inline                | 1            |
| PLAN     | 3+ files or unknown scope          | 3            |
| SAFE     | always for exploration; 1 per risk domain | 3     |
| RECOVERY | never                              | 0            |

### Agent type routing
- **Explore** — codebase search, pattern discovery, reading unfamiliar dirs. Cap: 3 parallel.
- **Plan** — architecture decisions, multi-file strategy. Use before edit agents.
- **Bash** — build, test, lint, deploy, CLI commands.
- **general-purpose** — complex multi-step tasks mixing reads + writes + decisions.

### Parallelization patterns
**Explore fan-out:** up to 3 Explore agents before writing anything.
Assign each a distinct directory or concern. Collect all results before any edit.

**Edit fan-out:** only when files have zero shared imports or state.
Safe: files in unrelated subsystems. Unsafe: files that import each other.

**Analysis fan-out:** parallel Bash agents for lint + test + log review.

### Fan-in before acting
After any fan-out, consolidate into a single summary in the main window before Write/Edit.
Check: conflicts between agent findings, contradicting assumptions, missing coverage.
Do not proceed if agents return contradictory facts — resolve first.

### Token efficiency
- Delegate heavy reads to Explore agents; main context for decisions and edits only.
- `max_turns`: Explore=5, Bash=3, Plan=8, general-purpose=15.
- Model: haiku for grep/search/lint, sonnet for edits/analysis, opus for architecture or risk assessment.
- Never pass full file contents between agents — use paths and targeted excerpts.

### Known limitations
- **Session scoping:** mode detection uses `git diff HEAD`, not true per-session tracking. Mitigation: commit often.
- **Subagent guard:** hooks cannot intercept Task tool — orchestration rules are advisory only.
