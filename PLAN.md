The campaign's ending as a three-act cinematic (owner's item 49), 24/11/2026. BUILD AUTHORISED by the coordinator on 24/11 (11h40); branch `historia/final`, fast-forwarded to `teste/nave-e-camera` d422eb19 (hold-to-skip built; the opening scene stays built). One self-standing commit per step, `npm run done` on each, push the branch after each.

Chosen by the owner (his words in the notes file below): the truth is "A, um de nós" (24/11, 00h58) and the staging is the single combined ending, "Serve: é este" (24/11, card `final-do-jogo-4`). He also approved the wording of the five new lines as written on that card ("Serve assim", 24/11); the exact texts are in the notes file below and in the card's "falas-novas" section. Nothing is pending with him on this subject.

Where everything is (outside git, read first):
- Notes and his words: /Users/fgferre/Library/Application Support/Claude/side-session-notes/local_9d07932b-48e8-46ae-8de5-d2d16c8eadac/final-do-jogo-notas.md
- The script, beat by beat, with places, lines and timings: .../final-ferramentas/corte-epico.md
- The logic test of the story against every line of the game (five passes): .../final-ferramentas/furos.md
- The rough cuts he approved: src/exported-assets/quadro/cartoes/final-do-jogo-4/final-severance.mp4 and final-stewardship.mp4 (main checkout); capture scripts that pose each shot in the running game: .../final-ferramentas/e1.mjs, e2.mjs, e3.mjs, a-casa.mjs (they are the reference for camera poses, lights and what each shot shows).

The sequence (13 beats; five new lines, the rest exist and are voiced):
- Act 1, before the choice (about 39 s from Sovereign's fall): Sovereign, beaten, opens its shells (its existing "…Operator: you. Choose."); slow orbit, the Ring's count (new); pull-back over the Crucible (new Wake line); cut to the Null Boundary's rupture (new); cut to the Quarantine Grid (existing voiced line `stage:quarantine-grid:3`, replayed); cut to the Crucible's star and arcs (new); the pilot's ship before the open Sovereign (new). Then the choice screen, text unchanged.
- Act 2, after the choice (about 34 s): the Crucible answers (existing first ending line); the opening's first shot of the Wake, same camera; the opening's reactor shot, all engines steady (existing second ending line); Severance only: the interceptor comes home into the hangar (the opening's launch reversed), then the Ring goes dark and the Wake turns away; Stewardship: no hangar shot ("Nobody goes home"), the Wake faces the lit Ring.
- Coda: at the Crucible, on a rebuilt arc out of the fight's view, a slip holding a Wake identical to ours: finished, empty, silent, one window lit. Nobody watches, no line. Severance: everything goes dark, the window last, and it goes out before the black. Stewardship: the arcs light and the window stays. Black, then the credits as today.

Steps, in order:
1. Check first, before any design: what Sovereign's body does when it is defeated today (the cinematic needs it whole and still, then opening past the fight's `plateOpen`), and whether the place sets of other sectors can be shown from a Crucible run (act 1 cuts to two other places).
2. Agree the hand-over with the cutscenes work: act 1 replaces the 4 s epilogue pull-back for the ending sector only (`src/modules/ui/runCinematics.js` `startEpilogue`, `EPILOGUE_MS`), the stretch the branch `historia/pular-e-repetir` is editing; skip is theirs (hold to skip: before the choice it jumps to the choice, after it to the credits).
3. Text: the five approved new lines in `src/data/story.js` and their transmissions (`src/modules/ui/transmissions.js`); each stays under 90 characters; lines without a recording already play as text.
4. Act 1 and the coda in the game's own scene: Sovereign's cinematic opening (`render3d/enemies/sentinels/sovereign.js`), camera paths (`src/core/cinematics.js`), the cuts to the two places, the twin Wake and its slip in the Crucible set (`render3d/places/theCrucible.js`, the Wake model `render3d/travel/wake.js`), and the Crucible's Stewardship answer made visible (today it does not show in frame).
5. Act 2 in the opening's scene (`render3d/storyScene.js`: it is disposed once told, so it must build again): the two mirrored shots, the launch reversed, the Wake turning and moving, the Ring going fully dark on the horizon.
6. Sequencing and screens: the choice opens after act 1 (`src/modules/ui/RunEndScreens.js`, `UISystem.js` 'run-won'); act 2 replaces today's held shot under the ending's lines (`playEnding`); a renderer that refuses cinematics (2D, reduced motion, `?camera=0`) must still say the lines before the choice.
7. Sound: the ending-choice music has to start with act 1 (today it starts with the choice overlay, `AudioSystem.js`); a cue per shot (`src/data/audio/eventCues.js`); voices for the five lines belong to the voices work.
8. Tests under `tests/` for the new order of screens and the new transmissions; `NEXT` in `src/data/changelog.js` with `// not confirmed`; item (49) in `docs/PENDENCIAS.md` in his words; `npm run done` once at the end; a before/after capture and a film of each ending from the built game.

Out of scope: changing any existing line, the two endings' stakes or epitaphs, the credits, a third ending, new Settings options, generating voices, re-recording replays, and the three contradictions already in today's text (Choir three or six, where the foundry is, Null's old Codex text): the coordinator holds those.

What step 1 found (24/11), and the design that follows:
- Sovereign today: at zero health it leaves the active list at once (EnemyBossSystem.handleBossDefeated) and its view breaks into pieces in 1.1 s (enemyMirror.die/breakOf, BOSS_PIECES). The ending needs it whole, still, then opening: for Sovereign only the defeat keeps the model (flash and bursts stay, no break) and the cinematic drives a husk. ASKED the coordinator (it removes "boss in pieces" from this one boss); default: go ahead.
- Other places can show during a Crucible run: all ten sets are built at start; `PlaceSets.setFlight(id, share, x, z, slot)` shows any set (the journeys use it). The opening scene is never disposed.
- Today's win flow: 'run-won' → 4 s epilogue (not skippable) while runEnd waits 6 s of spoils (XP pull; the ship guarded 9 s) → the choice → `playEnding` (lines over the held shot) → credits. Music: VICTORY_FINAL from 'run-won', ENDING_CHOICE while the choice is open (stops at the pick), END_CREDITS at the credits.
- Sequencing (ui/runCinematics.js): two beat lists in core/cinematics.js. Act 1, kind 'revelation', replaces the epilogue for an ending-sector win that will open the choice (never on a replay): beats `opens` (Sovereign's own defeated line), `count`, `recoil`, `rupture`, `fences` (the existing `stage:quarantine-grid:3`, same key so its voice plays), `lock`, `known`. Act 2, kind 'ending': `answer` (first ending line), `home`, `steady` (second ending line), then Severance `return`, `depart` or Stewardship `watch`, then `twin` (the coda). A beat lasts as long as its line needs (typing + hold, voice-aware) or its own minimum. The renderer draws a beat through one call, `Renderer3D.playEndingBeat(id, ms, ending)`; when it refuses (2D, reduced motion, `?camera=0`) the lines still play in order before the choice. Hold skips (act 1 → the choice; act 2 → the credits), a tap goes to the next beat. The ship cannot be hurt and nothing on the field moves it while either act plays.
- Rendering: `render3d/endingScene.js` owns the beats; act 1 and the coda are drawn in the game's scene (Sovereign's husk, camera, `setFlight` cuts, the twin Wake's slip in the Crucible set), act 2's `home`…`watch` in the opening's scene with its own shots. Dev freeze `?cinematic=ending&beat=<id>&t=` for captures.
- Music: ENDING_CHOICE keeps playing through act 2 and gives way to END_CREDITS.

Progress:
- [x] 0. Branch fast-forwarded to d422eb19.
- [x] 1. Checked Sovereign's defeat and the place sets (above).
- [ ] 2. Text + sequencing + screens + fallback + tests (no new pictures yet).
- [ ] 3. Act 1 pictures and Sovereign's husk.
- [ ] 4. Act 2 pictures and the coda.
- [ ] 5. Sound cues, music hand-over, NEXT, item (49), done.
- [ ] 6. Films of both endings from the built game, conference card.
