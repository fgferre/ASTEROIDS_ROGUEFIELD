# Brand — Name Chosen, Direction First Cut (Phase 1, 2026-05-13)

Phase 1 PROC-13 first cut. Launch name decided this phase; final brand assets (capsule art, logo, attorney trademark clearance) lock at Phase 7.

## Codename vs Launch name

- **Internal codename:** `ASTEROIDS_ROGUEFIELD` (preserves M1 git history, repo URL `github.com/fgferre/ASTEROIDS_ROGUEFIELD`).
- **Public launch name:** **Asteroid Roguefield** (singular; chosen 2026-05-13).

The two coexist intentionally — the repo / GitHub Pages path stays on the codename to preserve M1 commit references; player-facing surfaces (title screen, itch.io / Steam Next Fest / etc. page if pursued, social posts, devlog) use the launch name.

## Launch name: Asteroid Roguefield (singular)

**Rationale (developer decision 2026-05-13):**

The original PROJECT.md row "Project codename ≠ launch title — Atari trademark risk on 'Asteroids' word" assumed the only path was a fully different name. The developer's call here is **lighter**: drop the plural ("Asteroids") and the genre word "field" stays — `Asteroid Roguefield` (singular) is the launch title because trademark law does not let anyone monopolize common nouns (you can't trademark "pedra" or "water" or "asteroid" as standalone descriptors; Atari's mark is on the specific brand "Asteroids" applied to video games / entertainment, not the noun itself).

The risk surface is therefore narrower than the original 3-candidate exercise implied. The developer accepts:
- The name is descriptive (asteroid + roguelike + field), not invented.
- Atari's mark would only become a concern if a launch surface (itch.io / Steam) flagged it; in that case the fallback is to add a distinguishing prefix or stylization (`AR: Roguefield`, `Roguefield`, etc.).
- Phase 7 attorney clearance pass remains the safety net — it confirms the chosen name doesn't conflict and produces the final lockup.

**No 3-candidate audit done.** That exercise (USPTO TESS + EUIPO eSearch table) was framed for the original assumption that "Asteroids" had to be replaced wholesale. With the lighter framing, the audit becomes a Phase 7 step. If the developer changes their mind before Phase 7 and wants candidates again, the original 3-candidate methodology is preserved in `.planning/phases/01-profiling-baseline-pre-flight-deliverables/01-CONTEXT.md` decisions D-25/D-26.

## Tagline (first cut)

**Working tagline:** *Can you beat the field?*

One-liner that invites the loop without overselling. Direction kept short / kinetic / asking-the-player. Phase 7 trusted-circle pass may refine, but this carries through closed beta as-is.

## Capsule art direction notes (NOT final art — Phase 7)

Anchored by the developer's existing menu-background animation (`src/modules/MenuBackgroundSystem.js` — procedural asteroid field with the Suno-composed score the developer authored). The capsule should feel like a continuation of that menu, not a separate marketing piece.

- **Visual motif:** ship silhouette against an asteroid field, scale and solitude over action. The asteroids dwarf the ship — the player is small in a vast field. This is the "oblivious vastness" the developer described: not heroic, not desperate, just present in the field.
- **Mood:** emptiness + solitude + technological precision. The capsule is more "exploration moment" than "combat moment"; the gameplay panels can carry the action.
- **Continuity with the menu:** reuse the menu's procedural-asteroid look (lit volumes, dust haze, scale cues). The Three.js menu render is already the project's strongest visual asset — the capsule extends it rather than competing with it.
- **Anti-direction:** NOT a hero-with-laser explosion shot; NOT a multi-character ensemble; NOT a busy collage of upgrades / status icons. Single ship, single field, one breath.

## Logo lockup direction notes

Direction (Claude-recommended per developer request "sugestao sua relevante e criativa"). Phase 7 lock.

- **Wordmark:** "Asteroid Roguefield" set in an angular wide-set sans-serif (e.g., the existing Orbitron display face already loaded — `Orbitron` weight 700-900 is the natural starting point since it's already a project dependency per `src/index.html` Google Fonts preconnect). All caps OR small-caps to lean into the "field"/"ROGUEFIELD" syllabic emphasis. Letter-spacing wide enough that "ROGUEFIELD" reads as a single uninterrupted form.
- **Symbol option (favicon / icon use):** abstract mark formed from a stylized asteroid-belt arc that doubles as a targeting reticle — single-stroke, evokes both "the field" and "can you beat it?". Cyan (`#00F2FF` per the visual-direction palette) on the near-black background (`#020408`) for thruster-glow continuity. Works at 16×16 favicon scale because it's a single shape.
- **Lockup:** wordmark on one line; tagline ("Can you beat the field?") in a much smaller weight directly underneath, centered. Symbol-mark to the left or above the wordmark depending on context (badge mark for icon use; full lockup with tagline for marketing surfaces). Phase 7 finalizes the exact proportions and weights.

---

*Name chosen Phase 1; final brand assets (capsule art + logo + attorney clearance) lock Phase 7. See .planning/REQUIREMENTS.md PROC-13.*
