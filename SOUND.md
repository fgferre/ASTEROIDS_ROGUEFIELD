# SOUND.md

Every sound effect is a real sample the owner chose by ear; code only plays, varies and mixes them. The ship engine is sample layers too (`src/public/audio/engine/`, driven by `src/modules/audio/shipEngine.js`), with the old synthesized loop kept only as the fallback when its files fail to load. Music and the other continuous hums stay procedural. Read this before adding or changing a sound.

## Palette (from `docs/NORTE.md`: dark stone, light inside)

| Family                                            | Sounds like                                                      | Never                         |
| ------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| Player energy (cyan): shots, dash, shield         | clean, tight, bright attack, short decay; a shot under 250 ms    | harsh, buzzy, long tails      |
| Matter: rocks, hulls, debris                      | heavy, dull, low-mid crunch; weight in the first 100 ms          | ringing, metallic shimmer     |
| Threat (red): enemy fire, telegraphs, ship damage | rough, gritty, buzzy; mid-high, told apart from the player's own | as loud as the player's shots |
| Wardens (violet): arrival, phases, death          | colossal, slow, ancient machine, metal and choir, long space     | short, cartoonish             |
| Reward (gold): XP, pickups, level-up, cards       | glassy, pitched, rising; a run of XP climbs in pitch             | dull, noisy                   |
| Interface                                         | soft, short, dry, quiet; the menu is calm                        | louder than play, reverb      |

## Sources and licence

- Generated on the owner's Mac by the local skill `/sfx-generator` (AudioLDM `cvssp/audioldm-s-full-v2`, weights CC BY-NC-SA 4.0: the game is free; every generated file is shared under the same licence, credited in the in-game credits). The model outputs 16 kHz mono; the pipeline below adds the missing air.
- Kenney packs (Interface, Sci-Fi, Impact Sounds), CC0, for what the model does badly (clicks, crisp lasers).
- Each file's origin (generator prompt and seed, or pack and file) is in `src/public/audio/sfx/manifest.json`; the sources are rows in `docs/asset-sourcing.md`.

## Pipeline (candidates never enter the repo)

1. Candidates per event: 3 generated (two prompts, two seeds) plus pack picks, in a scratch folder.
2. Post-process: trim silence, 2 ms fade-in and 40 ms fade-out, resample to 44.1 kHz, a light exciter on generated files (band 2.5–7.5 kHz saturated, high-passed at 7 kHz, −14 dB), loudness to one target (RMS of the active part −16 dBFS, peak −1 dBFS), mono mp3 112 kbps (Safari does not play ogg).
3. Audition page (served by the dev server from the git-ignored `src/exported-assets/`): the owner plays A/B/C and picks; only the pick is copied to `src/public/audio/sfx/<event>/`.
4. Level in the game: the per-event gain lives in the manifest; the owner judges the final mix by playing.

## Playback rules

- All files load at warm-up into decoded buffers; nothing loads during play. Budget: 3 MB of files in total.
- A frequent event (shot, hit, XP) has 3–5 variations, drawn without repeating the last; every play varies pitch ±4 % and gain ±1.5 dB.
- Voices: 24 at once in total; per event a cap and a minimum gap (shots 4 and 30 ms, hits 6 and 20 ms, explosions 4 and 40 ms). When full, the quietest older voice of a lower priority stops: Warden > player damage > player shot > explosion > hit > reward > interface.
- Routing stays: player feedback on the protected bus, world sounds on the ambient bus (pan by x, distance lowpass), the master limiter and the shared reverb. Wardens and explosions send to the reverb; interface never does.
