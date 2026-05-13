# Positioning (Phase 1, 2026-05-13, LOCK)

Phase 1 PROC-18 lock. Internal positioning, NOT marketing copy (per CONTEXT D-32).

This doc is the **internal** positioning anchor used to keep design + feature
decisions aligned across phases. Phase 7 / Phase 8 distill this into the
public-facing copy (itch.io description, GitHub Pages landing copy, Steam Next Fest
short text — whichever launch surface wins at Phase 8). Do NOT lift sentences from
this doc verbatim into public copy.

## Elevator pitch (<=60 words)

> **Cap: 60 words.** References `.planning/PROJECT.md` Core Value "just one more
> run" loop. One paragraph; one breath.

{elevator-pitch-placeholder — <=60 words; describes the game in one breath a friend
can repeat to a third party; cites the "just one more run" loop without
brand-marketing language.}

## Top-3 competitors

3 closest-feel competitors. Each entry is 2 lines: (1) what audience overlaps with
ours, (2) what THIS game's distinct angle is vs the competitor. Vampire Survivors
and Hades are fixed; the third slot is a developer discretion call between Nuclear
Throne and Risk of Rain 2 (pick the closer feel-match).

1. **Vampire Survivors** — {2-line positioning placeholder: line 1 = audience
   overlap with VS players; line 2 = THIS game's distinct angle vs VS.}
2. **Hades** — {2-line positioning placeholder: line 1 = audience overlap with
   Hades players; line 2 = THIS game's distinct angle vs Hades.}
3. **{Nuclear Throne OR Risk of Rain 2 — developer picks closest feel-match per
   Discretion clause}** — {2-line positioning placeholder: line 1 = audience
   overlap; line 2 = THIS game's distinct angle vs the pick.}

## Distinctive promise (1-2 sentences)

{What this delivers that the top-3 do not. 1-2 sentences max. Should answer: if a
player asked "I already play VS / Hades / [third pick] — why play this?", what is
the honest one-liner answer?}

## Audience profile (1 paragraph)

{audience-paragraph-placeholder — expanded from `.planning/PROJECT.md` target
audience row ("Hades / Vampire Survivors player; modern indie roguelite
enthusiast"). One paragraph covering: who they are, what they already play, what
they expect from a roguelite, where they hang out (Steam / itch / TikTok /
Reddit / Discord), and what would make them recommend the game unprompted.}

## Distribution surface

> Surface recorded here per CONTEXT D-24 (revised 2026-05-13), NOT in
> `.planning/PROJECT.md` (URLs aren't permanent decisions).

**Active surface (dev + closed beta):**
GitHub Pages — `https://fgferre.github.io/ASTEROIDS_ROGUEFIELD/`
(existing deploy via `.github/workflows/deploy.yml`).

**Closed-beta distribution:**
Private link sharing of the same GitHub Pages URL with the PROC-16 trusted circle
(named members captured in `docs/trusted-circle.md` at Phase 7). No separate
distribution channel — the closed-beta surface IS the dev surface, gated by
who-has-the-link.

**Public launch surface:** **TBD at Phase 8.** Candidates under consideration:

- Keep GitHub Pages and flip the URL public (PROC-07 launch flip).
- Switch to itch.io (Restricted → Public flow via `butler` upload).
- Steam Next Fest (festival visibility window).
- Hybrid (e.g., GitHub Pages mirror + itch.io storefront).

PROC-02 (itch.io page draft) and PROC-06 (`build:itch` npm packaging script) are
**deferred to Phase 8** per CONTEXT D-24 revised 2026-05-13 — those packaging
artifacts are surface-specific and don't get built until the launch surface is
chosen. The Phase 8 deliverable lives in `docs/launch-surface-decision-{date}.md`
per ROADMAP Phase 8 Success Criterion 5.

---

*Internal. Phase 7/8 distill into public copy. See PROC-18 in .planning/REQUIREMENTS.md.*
