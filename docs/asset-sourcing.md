# Asset Sourcing — Hybrid Model (Phase 1, 2026-05-13, LOCK)

Phase 1 PROC-17 lock. Documents the hybrid model already locked in
`.planning/PROJECT.md` Key Decisions row "Asset sourcing model = hybrid".

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
  project per `.planning/codebase/INTEGRATIONS.md`.

### Music / SFX

- **Primary:** developer-made / mixed (final shipped tracks + SFX).
- **AI drafts (NOT shipped):** Suno for music drafts during composition iteration —
  drafts inform direction; final shipped tracks are human-authored / mixed.
- **Secondary (CC0 only):** NASA Audio Archive (public-domain agency recordings),
  freesound.org CC0 SFX pool. CC-BY freesound entries require attribution rows in
  the audit table; prefer CC0 entries to keep attribution surface narrow.

### Visual concepts (mood-board)

- **Reference-only.** Mixed-source references collected in `docs/visual-direction.md`
  and the (on-demand) `docs/visual-direction/` thumbnails directory. **No assets are
  imported from these references** — they inform direction, not implementation.
  The PROC-15 first-cut doc enforces this scope.

## Licensing audit table

Per CONTEXT D-30, the licensing audit table is the deliverable's hard core. Every
external source currently used in the project gets a row. The 4 seed rows below
correspond to the integrations already enumerated in
`.planning/codebase/INTEGRATIONS.md` (NASA imagery via `MenuBackgroundSystem.js`,
Google Fonts Orbitron + Rajdhani, Lucide icons). Phase 2-6b plans append rows for
any new sources.

| Source | License | Attribution required | Attribution target | Audit date |
|---|---|---|---|---|
| NASA imagery (via `MenuBackgroundSystem.js` fetch) | Public domain (NASA media usage guidelines) | No (credit recommended but not required by NASA policy) | docs/credits.md (Phase 7) | 2026-05-13 |
| Google Fonts — Orbitron | SIL Open Font License 1.1 (OFL) | No (when embedded as webfont; OFL bundle ships with font file regardless) | docs/credits.md (Phase 7) | 2026-05-13 |
| Google Fonts — Rajdhani | SIL Open Font License 1.1 (OFL) | No (when embedded as webfont; OFL bundle ships with font file regardless) | docs/credits.md (Phase 7) | 2026-05-13 |
| Lucide icons | ISC | No (ISC permits use without notice; credit recommended) | docs/credits.md (Phase 7) | 2026-05-13 |

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

**No AI in shipped assets** — deliberate constraint to keep licensing clean (AI
training-data provenance is contested) and the "developer-made + CC0" model intact.
Any future deviation from this policy requires a CONTEXT-level decision and a new
audit-table row category.

## Attribution file plan

`docs/credits.md` is deferred to Phase 7 (consolidated with the trusted-circle list
from PROC-16). When created, it will consolidate:

- Every row in this licensing audit table (the `Attribution target` column points to
  it for each row currently requiring or recommending attribution).
- PROC-16 trusted-circle members who provided closed-beta feedback (Phase 7
  deliverable).
- Any new Phase 2-6b asset sources added to the audit table during development.

**This table SEEDS that future doc.** The Phase 7 `docs/credits.md` plan reads the
audit table as its source of truth.

---

*LOCK. See PROC-17 in .planning/REQUIREMENTS.md.*
