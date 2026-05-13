# Local Claude Notes

This repository does not version assistant runtime state, planning scratchpads,
or other local-only orchestration files.

Shared sources of truth:

- `AGENTS.md` for repo-wide agent policy.
- `package.json` for supported scripts.
- `docs/repo-health-audit-2026-03-10.md` for the current cleanup summary.
- `docs/archive/2026-health-cleanup/README.md` for the material moved out of
  the live tree.

If your local tooling recreates private working directories, keep them ignored
and uncommitted.

---

## GSD Local Practices (Phase 0 learnings — 2026-05-13)

These are operational mitigations learned the hard way during Phase 0 execution.
They persist here because relying on "Claude remembering" between sessions is
unreliable — `/clear` wipes that knowledge. Read this every session.

Some entries are **confirmed bugs**; others are **observed symptoms without
diagnosed root cause** — labeled accordingly. Don't promote uncertain
observations into asserted bugs in downstream reasoning.

### SDK quirks (confirmed — work around silently)

- **`init.execute-phase.agents_installed: false` is a false-negative on this
  setup.** Verify against `ls .claude/agents/` directly before assuming agents
  are missing. The SDK's `missing_agents` list is also unreliable here.
  *Status: confirmed false-negative empirically; root cause not identified
  (possibly Windows path normalization, OneDrive paths, or case sensitivity).*

- **`phase-plan-index` silently mis-groups waves when `depends_on` uses
  slash-format.** The SDK accepts canonical forms only:
  - `00.01` (canonical prefix), or
  - `00.01-fix-02-brake-bug` (full plan stem)
  
  The format `00-m1-stabilization-new/01` (phase-name + slash) is **silently
  ignored** as an external dep, collapsing the whole phase into wave 1.
  
  Before trusting `waves` from `phase-plan-index`, always cross-check:
  ```
  grep -E "^(wave|depends_on):" .planning/phases/*/0?.0?-*-PLAN.md
  ```
  
  If a planner outputs slash-format `depends_on`, fix it before dispatch.
  *Status: confirmed SDK behavior (read `sdk/dist/query/phase.js:191+`).*

- **`gsd-sdk query config-get <missing-key>` returns Exit 1 with
  "Key not found".** This is design, not failure. Handle with:
  ```
  KEY=$(gsd-sdk query config-get foo.bar 2>/dev/null || echo "default")
  ```

### Worktree EEXIST + lock issues (cause not confirmed)

**Observed symptoms** on this machine (Windows + OneDrive path + Git Bash):
- `EEXIST: file already exists, mkdir '.claude/worktrees'` when Claude Code
  tries to spawn `Agent(isolation="worktree")`.
- `fatal: cannot remove a locked working tree, lock reason: claude agent <id>`
  when running `git worktree remove` after the agent returns.

**Root cause:** not confirmed. Plausible candidates (in order of likelihood):
- GSD's cleanup loop removes the `agent-XXX` worktree but not the parent
  `.claude/worktrees/` directory; next spawn fails to recreate it.
- Claude Code's worktree-spawn implementation uses non-recursive `mkdir`.
- OneDrive sync holding a handle on the directory.
- Windows path normalization on OneDrive-rooted paths.

**Mitigation that works regardless of cause:**

Before spawning a worktree agent:
```bash
rmdir .claude/worktrees 2>/dev/null || true
```

After the agent returns (this is the protocol GSD's own workflow expects —
it's not a workaround, it's the documented path):
```bash
git worktree unlock "$WT" 2>/dev/null || true
git worktree remove "$WT" -f -f
git branch -D "$WT_BRANCH"
git worktree prune
rmdir .claude/worktrees 2>/dev/null || true
```

**Recommended config for this project until cause is confirmed:**
```bash
gsd-sdk query config-set workflow.use_worktrees false
```
This forces sequential execution on the main working tree, eliminating the
entire worktree-lifecycle category. Acceptable trade-off when most waves
were already running serial due to BLOCKING checkpoints anyway.

To confirm root cause: reproduce on Linux/macOS or a non-OneDrive path.

### Calibration plans need human-in-the-loop

**Canonical incident:** Phase 0 Plan 03 (FIX-03 progression retune,
2026-05-13). Harness reported `appliedUpgrades.size = 6` (in target band),
all automated gates passed, executor self-check passed, merge clean, full
suite green. Live playtest yielded ~18 distinct upgrades — game made
**worse** than baseline. Executor had inverted CONTEXT.md D-12's prescribed
direction because the harness lacked combo/perfect-wave/quick-kill bonus
events, systematically under-counting live throughput.

**The class of error:** when the test harness is a proxy for live behavior
(game balance, perf tuning, UX feel, AI evaluation, anything where the
metric is not the goal), passing the harness does not prove correctness.
An autonomous executor can produce a calibration that satisfies the
harness while making the live system worse.

**Operational rule:** if a PLAN.md mentions "harness", "stub", "scripted",
"proxy", "simulated", or "synthetic" alongside numerical calibration goals,
run that plan in **`--interactive` mode**, not autonomous worktree mode:
```
/gsd:execute-phase <N> --wave <M> --interactive
```

Interactive mode runs the plan inline in the orchestrator conversation
(no subagent, no worktree). Every task is visible before commit. The
human-on-loop check is the only structural defense against this class
of error.

If the planner adds a `checkpoint:human-verify` with `gate="blocking"`,
**take it seriously even when every other gate is green.** That gate
exists specifically because automated tests cannot validate that decision.

### Executor policy (non-negotiable)

- **Never `git add --force` files under `.planning/`.** This repo gitignores
  `.planning/` by policy (see top of this file). One Phase 0 executor
  violated this (Plan 02 force-added its SUMMARY.md). The Plan 01 executor
  followed the policy correctly. The right behavior is: SUMMARY.md goes to
  the gitignored path and `git status` not showing it is the expected state.
- If you find yourself reaching for `--force` on a `.planning/` path,
  **stop** and check this file.

### When to use GSD vs not (Phase 0 lesson)

- **Mechanical fixes with objective acceptance criteria** (passing tests,
  specific symbols/strings, file structure): GSD autonomous mode works
  well. Phase 0 Plans 01 and 02 are examples.
- **Calibration / feel / trade-off decisions** (numerical tuning,
  UX evaluation, "is this fun?"): use GSD only for the PLAN.md structure
  and regression-lock benefits. Execute in `--interactive` mode. Phase 0
  Plans 03 and 04 are this category.
- **Quick fixes (< 2h)**: skip GSD entirely. Overhead exceeds the gain.

### Things that look like bugs but aren't

- `git status` not showing `.planning/phases/*/SUMMARY.md` files →
  expected; that directory is gitignored.
- `gsd-sdk query config-get <missing-key>` exiting 1 with
  "Key not found" → expected; means "use default".
- `phase-plan-index` returning `waves: { "1": [<every plan>] }` when
  frontmatter clearly says different waves → **not** expected; it means
  `depends_on` format is wrong. Fix the planner output, don't trust SDK.
