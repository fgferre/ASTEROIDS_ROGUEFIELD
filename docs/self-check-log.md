# Monthly Self-Check Log

## PROC-12 Trigger Rule

**Rule (PROC-12):** 3 consecutive months with any rating <5 → mandatory scope review.

Entries added monthly by the developer. **No automation** — the doc IS the
system (per CONTEXT D-43). A gap in the table is itself a signal — if a month
is missing, that's the same loud-skip semantic as the scope-freeze test's
`console.warn`.

Reviewed during `/gsd:complete-milestone` or any time the developer notices
the trend (per CONTEXT D-44).

## Log

| Month   | Date       | Energy (1-10)        | Motivation (1-10)    | Fun (1-10)           | Notes                |
| ------- | ---------- | -------------------- | -------------------- | -------------------- | -------------------- |
| Month 1 | 2026-05-20 | — (declined)         | — (declined)         | — (declined)         | Abbreviated sign-off: developer reported overall "tudo ok" after live playtest sessions (2026-05-16→20) but declined numeric 1-10 ratings this month. No <5 distress signal reported. Per the loud-skip semantic above, this partial row IS the signal — resume full numeric ratings in Month 2 (backlog entry filed). |

---

*PROC-12 trigger: if Energy, Motivation, OR Fun rates <5 for 3 consecutive months, schedule a mandatory scope review. See .planning/REQUIREMENTS.md PROC-12.*
