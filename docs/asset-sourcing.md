# Asset Sourcing — Hybrid Model (Phase 1, 2026-05-13, LOCK)

Phase 1 PROC-17 lock. Documents the hybrid model already locked in
the project's Key Decisions (asset sourcing model = hybrid).

This LOCK applies to the v1 / v2 development period. Any new sources added during
Phases 2-6b extend the licensing audit table below; the model itself does not change
without a CONTEXT-level decision.

## Source categories per asset type

The hybrid model splits asset categories by their realistic sourcing strategy. Per
CONTEXT D-29, each category prescribes a primary source + acceptable secondary
sources + an AI-draft policy where applicable.

### Sprites

- **Primary:** developer-made (Aseprite / pixel-pushed / vector-traced). Final
  shipped assets MUST be developer-authored or licensed CC0.
- **Secondary (CC0 only):** OpenGameArt CC0 collections, Kenney.nl CC0 packs.
  License must be CC0 (not CC-BY) to avoid attribution complexity during the v2
  iteration phase.
- **AI drafts (NOT shipped):** SDXL / Midjourney for prototyping only. AI-generated
  sprites NEVER appear in the shipped build. See the AI-draft policy below.

### UI elements

- **Primary:** developer-made (HUD layouts, panel chrome, slider widgets, dialog
  frames).
- **Secondary:** Lucide icons (ISC license) for action / state glyphs (settings gear,
  pause, mute, etc.). Lucide is the established icon source already integrated in the
  project.

### Music / SFX

- **SFX (owner's decision, 20/10/2026):** real samples chosen by the owner by ear —
  generated on his Mac by the local `/sfx-generator` skill (AudioLDM) or taken from
  Kenney CC0 packs. `SOUND.md` is the rule; this section's older lines are for music.
- **Primary:** developer-made / mixed (final shipped tracks + SFX).
- **AI drafts (NOT shipped):** Suno for music drafts during composition iteration —
  drafts inform direction; final shipped tracks are human-authored / mixed.
- **Secondary (CC0 only):** NASA Audio Archive (public-domain agency recordings),
  freesound.org CC0 SFX pool. CC-BY freesound entries require attribution rows in
  the audit table; prefer CC0 entries to keep attribution surface narrow.

### Visual concepts (mood-board)

- **Reference-only.** Mixed-source references collected in `docs/NORTE.md`
  and any on-demand thumbnails. **No assets are
  imported from these references** — they inform direction, not implementation.
  The PROC-15 first-cut doc enforces this scope.

## Licensing audit table

Per CONTEXT D-30, the licensing audit table is the deliverable's hard core. Every
external source currently used in the project gets a row. The 4 seed rows below
correspond to the integrations already enumerated in
the project integrations (NASA imagery via `MenuBackgroundSystem.js`,
Google Fonts Orbitron + Rajdhani, Lucide icons). Phase 2-6b plans append rows for
any new sources.

| Source                                              | License                                     | Attribution required                                                       | Attribution target | Audit date |
| --------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- | ------------------ | ---------- |
| NASA imagery (via `MenuBackgroundSystem.js` fetch)  | Public domain (NASA media usage guidelines) | No (credit recommended but not required by NASA policy)                    | in-game credits    | 2026-05-13 |
| Google Fonts — Orbitron                             | SIL Open Font License 1.1 (OFL)             | No (when embedded as webfont; OFL bundle ships with font file regardless)  | in-game credits    | 2026-05-13 |
| Google Fonts — Rajdhani                             | SIL Open Font License 1.1 (OFL)             | No (when embedded as webfont; OFL bundle ships with font file regardless)  | in-game credits    | 2026-05-13 |
| Lucide icons                                        | ISC                                         | No (ISC permits use without notice; credit recommended)                    | in-game credits    | 2026-05-13 |
| AudioLDM `cvssp/audioldm-s-full-v2` (generated SFX) | CC BY-NC-SA 4.0 (model weights)             | Yes; the generated files are shared under the same licence, non-commercial | in-game credits    | 2026-10-20 |
| Kenney Interface, Sci-Fi and Impact Sounds          | CC0 1.0                                     | No (credit recommended)                                                    | in-game credits    | 2026-10-20 |

**Audit cadence:** Phase 2-6b plans re-audit any row older than 6 months from the
plan's start date. Lucide / Orbitron / Rajdhani are all under permissive licenses
unlikely to revoke retroactively, but a license-version drift (e.g., Lucide bumping
ISC → MIT in a future major release) MUST be captured in a new audit row with the
date of the version-change observation.

## AI-draft policy

Per CONTEXT D-29, AI tooling participates ONLY as a prototyping aid. Two tools have
explicit roles:

- **Suno** — music drafts during composition iteration. Suno-generated drafts
  inform tempo, instrumentation density, and tonal direction, but the shipped final
  tracks are human-authored / mixed. Used Phase 2 (AudioSystem refactor) and Phase 6b
  (audio polish).
- **SDXL / Midjourney** — visual prototypes during sprite + mood-board iteration.
  Output is reference material only: composition study, palette exploration, capsule
  art draft. The shipped sprites are developer-authored or licensed CC0. Used Phase
  6a (visual direction lock) and Phase 6b (sprite polish).

**Exception: SFX.** Shipped sound effects are samples generated with AudioLDM (and
Kenney CC0), chosen by ear by the owner; see `SOUND.md` and the audit table. Music
and sprites follow the rule above: AI output is reference or draft only.

## Attribution

Attribution lives in the in-game credits. This audit table is its source of truth.

---
