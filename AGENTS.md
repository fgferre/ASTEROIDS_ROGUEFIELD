# AGENTS.md
Asteroid Roguefield: a browser asteroid-arena roguelite — Canvas 2D gameplay, a Three.js menu, vanilla JS ES modules, Vite, Vitest. Built for its owner, who does not program and judges by playing and by screenshots; published on GitHub Pages (`/ASTEROIDS_ROGUEFIELD/`).
Keep this file under 50 lines; every agent reads every line, every session. Add a line only after the same mistake happens twice; when a line can become a check (lint rule, test, hook), do that and delete the line.

Commands

* Setup: `npm ci`. Dev server: `npm run dev` (port 5500). Headless Chromium + Playwright is the screenshot tool; a visual change ends with a capture, not a description.
* Done means: `npm run done` (lint + format check + tests + build — the same gates as CI) passes. Run it once, at the end, before you say a task is finished.
* While working, run only the tests for what you touched: `npm run test:tocados` picks them from the files you changed (`npm run gate` = lint + tocados). Only commands with non-obvious arguments go here; the rest is in package.json.

How to work

* Before starting: if the request seems mistaken, has a simpler path, or misses something (existing code, an edge case, a trap below), say so in one or two sentences. Then do what was asked, unless it's on the ask list. State any assumption.
* Do what was asked, no more. If you spot a bug or an improvement nearby, leave it and add one line to `BACKLOG.md`.
* Before writing a helper, system, or util, look for an existing one and extend it. One way to do each thing (this repo already has three ways to resolve a service and four ways to detect dev mode — don't add a fifth).
* Do the simplest thing that works. No abstractions, options, or config for needs that don't exist yet. No defensive `typeof x === 'function'` around a dependency the manifest guarantees.
* Change as little as possible: targeted edits, not whole-file rewrites. Match the patterns already in the file; formatting is Prettier's job.
* When you replace something, delete the old version. No commented-out code, unused functions, legacy flags, or leftover files.
* Create new files (docs, tests, scripts, notes) only when the task needs them. Delete scratch files before you finish.
* Tests live under `tests/`, mirroring `src/` by domain. One focused test per behavior, sized like the neighbors; prefer a behavior test over a snapshot.
* If you can delegate (main session only): keep judgment (plan, decide, hard bugs, review) and hand execution (search, reading many files, tests, mechanical edits) to workers on a cheaper model, so your own context stays small. Each worker gets one task, the files, and what not to do; workers return a summary and never ask.
* When done, say plainly what changed and what you did not do. If something failed, show the output.
* One commit per task; the message says why, not what. Never push `main` (it publishes): push a work branch by its own name (`git push -u origin <branch>`) or back up with `git push origin main:backup`; the hook enforces this.

When to ask
Go ahead on your own with anything local and easy to undo. Stop and ask only when:

* the action is hard to undo or touches shared things: deleting files or data, force-push, publishing (pushing `main`), secrets, renaming or moving files, adding a dependency, regenerating assets;
* the change is numeric balance or feel tuning (XP curve, boss scalars, spawn rates, shake/flash intensities): the test harness is a proxy, the owner's play is the judge — show the numbers and the measurement, then let him play before locking;
* the request needs a second way of doing something the project already does one way;
* two readings of the request would lead to clearly different work.

Otherwise pick a sensible option, say what you assumed, and keep going. If nobody is watching (unattended run), don't ask: write the assumption, or "BLOCKED: <reason>", and stop.

Traps (not obvious from the code, caused a mistake before; one line each, with the reason; max 5)

* The game canvas is 800×600 logical pixels stretched by CSS (`UISystem` resize), nothing is DPR-aware: blur is systemic, not one sprite's fault — fix it in the resize path (PLAN.md step), never per sprite.
* Dev mode is one switch: `IS_DEV` from `src/core/env.js`. Never test `process.env.NODE_ENV` (Vite only replaces it in dev builds) or add a second helper.
* Debug logging is on by default in dev and prints every EventBus emit (dozens per frame): profile with `?debugLogging=0`, or the DevTools trace measures `console.log`, not the game.
* `mobileGuard` blocks any browser with `maxTouchPoints > 0`, which includes many Windows laptops and headless Chromium; `?desktop=force` bypasses it.
* `.planning/` and `.claude/settings.local.json` are gitignored on purpose; never `git add -f` them (the hook blocks force-add).

Memory

* The repo is the memory: code, git history, and the files below. Don't create other notes, summaries, or docs on your own. The old GSD process notes live in git history (`git log --all -- CLAUDE.md`).
* `PLAN.md` (root, optional): for a task that spans sessions or is handed to another model. First line: task and date; then steps in order, files involved, decisions already made, and what's out of scope. Mark steps done as you go. If you find one you didn't write, read it first. Delete when done.
* `BACKLOG.md` (root, max 30 lines): things noticed but not done, one line each. When it's full, triage before adding. The owner's own list is `docs/PENDENCIAS.md`: read only its first section (O BASTÃO) before starting, and write there only what he reports, in his words.
* Don't edit this file during normal work; if a rule seems missing, say so in your final message. Anything that must always happen (formatting, blocked commands) lives in hooks, linters, or CI, not here.
