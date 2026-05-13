# Visual Direction — First Cut (Phase 1, 2026-05-XX)

Phase 1 PROC-15 first cut. Lock = before Phase 6a kickoff.

This doc is the **taste anchor**, not the implementation spec. Per CONTEXT D-28,
per-enemy palettes, per-weapon glow profiles, and post-FX intensity values are
explicitly out of scope here — those are Phase 6b VIZ-02 sliders.

## Mood references

3-5 references. Each entry is either an image link (preferred for rapid review) OR a
local thumbnail dropped into `docs/visual-direction/` (created on-demand at Task 5
fill-in time). If using local thumbnails, name files `mood-NN-<descriptor>.png` for
traceability.

1. **{mood-ref-1}** — {2-line description placeholder explaining what about this
   reference is being pulled (mood, palette, density, focal-subject treatment, etc.).}
2. **{mood-ref-2}** — {2-line description placeholder.}
3. **{mood-ref-3}** — {2-line description placeholder.}
4. **{mood-ref-4 — optional}** — {2-line description placeholder.}
5. **{mood-ref-5 — optional}** — {2-line description placeholder.}

## Palette swatch (5-8 hex codes)

5 mandatory swatches covering: ship hull primary, thruster glow, danger-state alert,
background near-black, neutral mid-tone. 3 optional swatches for accent / secondary
glow / status hues.

> **NOT a per-enemy palette spec** — that's Phase 6b VIZ-02 (per-enemy palette
> sliders + per-weapon glow profile + post-FX intensity values). The 5-8 hex codes
> below are the **direction-only** anchor.

- `#XXXXXX` — {role: e.g., "ship hull primary"}
- `#XXXXXX` — {role: e.g., "thruster glow / ion-cyan accent"}
- `#XXXXXX` — {role: e.g., "danger-state alert / damage flash"}
- `#XXXXXX` — {role: e.g., "background near-black / void"}
- `#XXXXXX` — {role: e.g., "neutral mid-tone / debris / UI base"}
- `#XXXXXX` — {role: optional accent — e.g., "XP-orb glow"}
- `#XXXXXX` — {role: optional accent — e.g., "boss aura"}
- `#XXXXXX` — {role: optional accent — e.g., "status-effect hue (fire / cryo / shock)"}

## What this game looks like (2-3 paragraphs)

{prose-paragraph-1 — covers camera perspective, density, and base mood. E.g., a
top-down view, dark background dominant, asteroids at mid-distance, ship pinned near
center, particles forming long-trail signatures of motion.}

{prose-paragraph-2 — covers feel of motion + combat + progression. E.g., during a
peak wave the screen becomes a near-overwhelming mosaic of projectiles + asteroid
chunks + XP orbs + impact flashes, with hitstop punctuating big hits and ion-cyan
trails reading at a glance.}

{prose-paragraph-3 — optional. Covers moments of stillness: menu, level-up screen,
between-wave breath beat. E.g., palette desaturates by ~20%, particles thin out,
ship idles with a slow thruster pulse — a deliberate exhale before the next inhale.}

## "Feels like" reference pulls (3)

3 reference games that capture the visual ambition. Suggested seed candidates
(developer picks the 3 closest matches): Hyper Light Drifter (neon edges + grit),
Vampire Survivors (chaos density), Nuclear Throne (bullet-clarity-against-chaos),
Risk of Rain 2 (peak-wave overwhelm), Hades (impact frame language).

- **{game-ref-1}** — {2-line description placeholder: what we take from this game's
  visual language.}
- **{game-ref-2}** — {2-line description placeholder.}
- **{game-ref-3}** — {2-line description placeholder.}

## Anti-scope (D-28)

The following are EXPLICITLY OUT of this doc's scope:

- **NO per-enemy palettes.** Phase 6b VIZ-02 sliders own per-enemy palette overrides.
- **NO per-weapon glow profiles.** Phase 6b owns per-weapon glow intensity / color /
  trail-length parameters.
- **NO post-FX intensity values.** Bloom, chromatic aberration, vignette, and
  film-grain intensity are Phase 6b individual user sliders per VIZ-02.

Visual direction is the **taste anchor**, not the implementation spec. Phase 6b owns
implementation.

---

*First cut. Lock = before Phase 6a kickoff. See PROC-15 in .planning/REQUIREMENTS.md.*
