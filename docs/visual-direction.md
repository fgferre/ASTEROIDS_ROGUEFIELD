# Visual Direction — First Cut (Phase 1, 2026-05-13)

Phase 1 PROC-15 first cut. Lock = before Phase 6a kickoff.

This doc is the **taste anchor**, not the implementation spec. Per CONTEXT D-28, per-enemy palettes, per-weapon glow profiles, and post-FX intensity values are explicitly out of scope here — those are Phase 6b VIZ-02 sliders.

## Mood references

The three references below frame the visual ambition. They are *aesthetic concepts*, not specific imagery (the developer can drop local thumbnails into `docs/visual-direction/mood-NN-<descriptor>.png` later if Phase 6a wants concrete pulls).

1. **Brutalismo Tecnológico** — Massive, angular geometric structures that prioritize scale and industrial functionality over decorative aesthetic. Applied here: ship hulls and asteroids read as functional / weighty / mass-bearing, not ornamental. Surfaces have purpose; nothing is sculpted for prettiness alone.

2. **Vazio Etéreo** — Space rendered NOT as a black vacuum but as an environment filled by subtle nebulae and light distortions suggesting anomalous physical properties. Applied here: the background carries volume (cosmic mist, layered haze) so the field has depth — never an empty void.

3. **Contraste de Alta Fidelidade** — Opposition between matte metallic surfaces and highly saturated neon light sources, creating sharp focal points in low-luminosity environments. Applied here: ships and debris are matte / desaturated; thruster glow + danger alerts + status effects are intense saturated neon — the eye snaps to information.

Anchor game reference: **Chorus (2021)** — the developer specifically called out Chorus's interface, landscapes, and mysticism as the closest single-reference for what Asteroid Roguefield should feel like at peak immersion.

## Palette swatch (8 hex codes)

5 mandatory + 3 optional. NOT a per-enemy palette spec (that's Phase 6b VIZ-02).

- `#1A1C1E` — ship hull primary (deep matte anthracite gray)
- `#00F2FF` — thruster glow (high-intensity electric cyan)
- `#FF3131` — danger-state alert (neon warning red)
- `#020408` — background near-black (near-black navy simulating spatial density)
- `#64748B` — neutral mid-tone (slate; UI / debris base)
- `#BCFF00` — status-effect hue (lime green; active-system signaling)
- `#8A2BE2` — boss aura (deep violet; large-scale anomalies)
- `#FFD700` — XP-orb glow (metallic gold; energy collectibles)

## What this game looks like

A 2.5D top-down perspective with a dynamic camera offset; visual density is built through layered particles and volumetric lighting. The base environment avoids absolute emptiness — a subtle cosmic mist gives the scene depth and volume, while the HUD is designed with a curve that follows the player's peripheral field of view. The mood is solitude in vastness: the player is small inside a field that does not notice them.

During peak activity and combat, motion is defined by inertia and persistent light trails. Visual chaos is organized by sharp projectile vectors and explosion flashes with intense bloom, contrasting the matte industrial gray of the ships against the saturation of thruster flames. The screen maintains technical clarity even under stress — threat indicators stay legible and debris particles flow smoothly.

In low-activity moments or menu navigation, the aesthetic shifts toward functional minimalism. The palette cools, and ship surfaces reveal texture detail — material wear and specular reflections from nearby stars. Transitions between game states are softened by chromatic aberration at the edges, reinforcing an atmosphere of advanced technology operating at the limits of physical stability.

## "Feels like" reference pulls (3)

Three closest visual references. The developer's full reference set (Nova Drift, lone.AI, Everspace, Metori, Everspace 2, House of the Dying Sun) is broader than 3 slots — the 3 picked below are the closest visual matches. The mechanic-side references (Vampire Survivors / Brotato / Dead Cells per developer note "mecânica viciante") are documented in `docs/positioning.md` as competitors rather than visual references.

- **Chorus (2021)** — Developer-anchor reference. Take: the mysticism + landscape scale + interface curve language. Atmospheric heaviness combined with crisp technical UI; the void feels lived-in.
- **House of the Dying Sun** — Take: dark atmosphere of imperial collapse, fast tactical ship combat, weighted sound of metal-on-metal in vacuum. Mood-heavy reference for the "matte industrial" baseline.
- **Nova Drift** — Take: the modernized Asteroids-arena visual language, organic ship-evolution silhouettes during a run, neon mods reading at a glance against a dark field. Closest direct genre-mate.

## Anti-scope (D-28)

The following are EXPLICITLY OUT of this doc's scope:

- **NO per-enemy palettes.** Phase 6b VIZ-02 sliders own per-enemy palette overrides.
- **NO per-weapon glow profiles.** Phase 6b owns per-weapon glow intensity / color / trail-length parameters.
- **NO post-FX intensity values.** Bloom, chromatic aberration, vignette, and film-grain intensity are Phase 6b individual user sliders per VIZ-02.

Visual direction is the **taste anchor**, not the implementation spec. Phase 6b owns implementation.

---

*First cut. Lock = before Phase 6a kickoff. See PROC-15 in .planning/REQUIREMENTS.md.*
