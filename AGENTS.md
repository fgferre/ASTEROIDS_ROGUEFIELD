# Agent Policy

## Principles (always on)
- Minimal change that solves the issue. Find root cause, no hacks.
- Touch only necessary code. Fix bugs end-to-end.
- Before creating any file, folder, or module: search for existing equivalents and name what you found. Create only if nothing fits, stating why.
- Never rename, move, or reorganize files unless explicitly requested.
- Never rewrite working code when a local edit solves the task.
- Before finishing a task, do a cleanup pass and remove temporary debug code, dead branches, redundant helpers, and any legacy/shim introduced by the change unless it is still required.
