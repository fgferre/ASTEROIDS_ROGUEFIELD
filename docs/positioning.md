# Positioning (Phase 1, 2026-05-13, LOCK)

Phase 1 PROC-18 lock. Internal positioning, NOT marketing copy (per CONTEXT D-32).

This doc is the **internal** positioning anchor used to keep design + feature decisions aligned across phases. Phase 7 / Phase 8 distill this into the public-facing copy (itch.io description, GitHub Pages landing copy, Steam Next Fest short text — whichever launch surface wins at Phase 8). Do NOT lift sentences from this doc verbatim into public copy.

## Elevator pitch (≤60 words)

Asteroid Roguefield is a top-down asteroid-arena roguelite where every run combines upgrades from five tag families — fire, cryo, chain, tech, kinetic — into a build that triggers synergies the moment three upgrades share a tag. Boss difficulty scales with your build. Runs last 8-12 minutes. You die, you pick differently, you roll again.

(58 words. Cites the "just one more run" loop without using brand-marketing language.)

## Top-3 competitors

Three closest-feel competitors. The visual references the developer named (Chorus, House of the Dying Sun, Everspace, Nova Drift, lone.AI, Metori) live in `docs/visual-direction.md` as visual mood anchors — the three below are the **mechanic / audience** competitors.

1. **Vampire Survivors** — *Audience overlap:* players who love watching a build escalate, dying in chaos, and immediately starting over with a tweaked combination. They tolerate sparse narrative if the loop feels addictive. *Distinct angle:* Asteroid Roguefield has explicit player control (aim, dodge, manage shield) instead of VS's auto-attack; the 5-tag synergy taxonomy gives more directed build-crafting than VS's mostly-passive evolution path; runs are shorter (8-12 min vs 20-30 min) so the "one more" cadence hits faster.

2. **Hades** — *Audience overlap:* players who expect a roguelite to have polish, weighty hitstop, satisfying impact feedback, and a clear meta-progression curve. They reward craft. *Distinct angle:* Asteroid Roguefield trades Hades's narrative density and isometric-action genre for a top-down asteroid-arena shooter; meta-power is capped at ≤15% of run ceiling (per PROJECT.md decision) so unlocks stay flavor over necessity; no voice acting, no story-mode pretension — content scope is VS+, not Hades-AAA.

3. **Nova Drift** — *Audience overlap:* this is the closest genre-mate. Players who already love Asteroids-style arena combat with deep build evolution. *Distinct angle:* Nova Drift's modifiers are mostly self-contained per-build; Asteroid Roguefield's 5-tag synergy taxonomy is explicit and combinatorial — 3-of-a-tag triggers a named bonus, so the player can SEE the build forming. The status × status interaction matrix (16 cells, all explicit per GAME-07) adds layer Nova Drift doesn't pursue.

## Distinctive promise (1-2 sentences)

Asteroid Roguefield is the only roguelite where the asteroid-belt classic meets a fully-mapped synergy taxonomy — five tag families plus a 16-cell status × status interaction matrix authored before any feature ships, so every build choice composes deterministically into the next. The result: the "just one more run" loop, built on a foundation the player can actually reason about.

## Audience profile

The target audience is the **modern indie roguelite enthusiast** who has 200+ hours in Vampire Survivors / Hades / Brotato / Dead Cells, treats roguelites as their primary game genre, and is comfortable buying $5-15 indie titles from itch.io or Steam after watching a 90-second devlog or a friend's recommendation. They expect: tight controls, satisfying impact feedback, build-crafting depth, meta-progression that respects their time, and a developer who ships honestly (no "early access forever", no battle-pass monetization, no padding). They hang out on r/roguelites, Twitter/Bluesky game-dev circles, indie-Discord servers, and itch.io community pages — discovery happens via word-of-mouth and indie-game curator posts. They would recommend the game unprompted IF the loop genuinely makes them lose 90 minutes when they sat down for 15, AND IF the visuals + sound feel intentional rather than asset-flipped. They will NOT recommend it for narrative, voice acting, or production-value bullet points — they're roguelite players, not roguelite-game-as-a-service consumers.

## Distribution surface

> Surface recorded here per CONTEXT D-24 (revised 2026-05-13), NOT in `.planning/PROJECT.md` (URLs aren't permanent decisions).

**Active surface (dev + closed beta):**
GitHub Pages — `https://fgferre.github.io/ASTEROIDS_ROGUEFIELD/`
(existing deploy via `.github/workflows/deploy.yml`).

**Closed-beta distribution:**
Private link sharing of the same GitHub Pages URL with the PROC-16 trusted circle (named members captured in `docs/trusted-circle.md` at Phase 7). No separate distribution channel — the closed-beta surface IS the dev surface, gated by who-has-the-link.

**Public launch surface:** **TBD at Phase 8.** Candidates under consideration:

- Keep GitHub Pages and flip the URL public (PROC-07 launch flip).
- Switch to itch.io (Restricted → Public flow via `butler` upload).
- Steam Next Fest (festival visibility window).
- Hybrid (e.g., GitHub Pages mirror + itch.io storefront).

PROC-02 (itch.io page draft) and PROC-06 (`build:itch` npm packaging script) are **deferred to Phase 8** per CONTEXT D-24 revised 2026-05-13 — those packaging artifacts are surface-specific and don't get built until the launch surface is chosen. The Phase 8 deliverable lives in `docs/launch-surface-decision-{date}.md` per ROADMAP Phase 8 Success Criterion 5.

---

*Internal. Phase 7/8 distill into public copy. See PROC-18 in .planning/REQUIREMENTS.md.*
