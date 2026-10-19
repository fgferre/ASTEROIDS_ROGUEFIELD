# CONTENT.md

Content is data, behavior is a small library, `src/content/registry.js` links them. A new item is one file; no engine file lists content by hand. Copy the nearest real file and change it.

## The rule

- One file per item: `src/content/<kind>/<id>.js`, `export default { id, ... }`, `id` = file name. Kinds: `enemies`, `weapons`, `cards`, `hulls`, `stages`, `biomes`, `bosses`. A file in a subfolder is not an item (`hulls/lib/`).
- `order`: a unique number per kind, where order decides a draw (cards, enemies). A new item takes the next free number. The lowest weapon `order` is the starting cannon.
- Import only `src/data/constants/`, `src/utils/deepFreeze.js`, `src/data/layerParts.js` and other content files. Never `GameConstants` or a module that reads the registry (import cycle).
- A new behavior, fire pattern or movement strategy is an engine change, not content.
- Numbers are proposals: comment them `// proposta DD/MM`; the owner's play decides.

## Enemy: `src/content/enemies/<id>.js`

- Required: `roles` (jobs it fills, below); `config` `{ key, displayName, radius, health, contactDamage }`; `components` `{ movement: { strategy, ... }, collision, health }`, plus `weapon: { pattern, ... }` if it shoots; `rewards` `{ baseOrbs, totalXP, healthHeartChance }` (or `baseOrbsMin`/`baseOrbsMax`); `pool` `{ initial, max }`; `tags` (with `'enemy'`); `affixes` (Elite rolls it may get: `shielded swift volatile splitter warded`); `seeded` (true = own random stream; a behavior marked `*` needs it); `behaviors` `{ name: params }`.
- Optional: `weight` (default 1), `fromLayer` (default 1), `projectileColor`, `explodesOnDeath`; `effects` `{ fire, death }` (`fire`: `muzzle-flash` default, `burst-flash`, `null` for none; `death`: `spark-burst shock-burst blast debris`); `explosion` (`small medium large`, default `medium`, `null` none); `cues` `{ fired, telegraph, destroyed }` (an `SFXBus` method name each); `codex` `{ lore, hint, glyph }`; `sighting` (line at first sight, 90 characters at most).
- Movement `strategy`: `linear tracking orbit proximity seeking parasite volatile`. Weapon `pattern`: `single burst spread volley proximity`. Copy the numbers of an enemy that uses the same.
- Copy: `src/content/enemies/drone.js` (movement and weapon), `caster.js` (several behaviors). Smallest that passes the tests, `tests/__fixtures__/enemies/gnat.js`:

```js
export default {
  id: 'gnat',
  order: 11,
  roles: ['skirmisher'],
  fromLayer: 9,
  config: {
    key: 'gnat',
    displayName: 'Gnat',
    radius: 10,
    health: 20,
    contactDamage: 8,
  },
  components: {
    movement: {
      strategy: 'tracking',
      acceleration: 300,
      maxSpeed: 220,
      targetingRange: 460,
    },
    collision: {
      shape: 'circle',
      radius: 10,
      response: 'damage',
      contactDamage: 8,
    },
    health: { base: 20, armor: 0, scaling: 1.0 },
  },
  rewards: { baseOrbs: 1, totalXP: 20, healthHeartChance: 0 },
  pool: { initial: 4, max: 20 },
  tags: ['enemy', 'hostile'],
  affixes: ['swift'],
  seeded: true,
  behaviors: { 'spawn-on-field': { margin: 100, spread: 100 } },
};
```

- Roles: `skirmisher hazard sniper carrier charger minelayer tank artillery flanker scavenger`. An enemy in a role a stage already asks for shares that role's spawns from its `fromLayer`: one candidate is no draw, several are drawn by `weight`, per spawn. A role no stage asks for needs a `roster` or `surges` line in `src/content/stages/layer-NN.js` too. Never `'asteroid'`.

## Behaviors: `src/modules/enemies/behaviors/`

A recipe passes exactly a behavior's params (the test compares the key sets). Params are numbers unless named as strings; `*` = draws random. Event names: reuse the donor's (a new name plays no sound).

| Behavior             | Does                                                                            | Params                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `hold-range`         | Keeps `min`-`max` px from the ship, never off the field                         | `min max margin`                                                                                                                              |
| `charge`             | Closes in, winds up behind a lane telegraph, charges, recovers                  | `engage windup charge recover drag`; string `chargeEvent`                                                                                     |
| `lob-shell`          | Marks a point ahead of the ship, lobs a shell that blasts there                 | `interval telegraph lead flight radius damage`; strings `cause telegraphEvent fireEvent landEvent`                                            |
| `phase` `*`          | Cycle visible, fading, phased (intangible), flanking the ship                   | `fade visible phased flank flankMin still margin`; strings `outEvent inEvent`                                                                 |
| `fan-shot`           | One fan of shots in each visible window of `phase`                              | `delay shots arc speed damage lifetime`; string `pattern`                                                                                     |
| `forage`             | Eats XP orbs and pickups, grows, flees when full, gives it all back on death    | `sense bite hunt drift flee growth maxGrowth healthPerOrb maxHealthGain pickupOrbs fullXP digest bonus margin`; strings `ateEvent burstEvent` |
| `spawn-on-death` `*` | Releases `count` enemies of `type` on death                                     | string `type`; `count speed`                                                                                                                  |
| `lay-mines` `*`      | Lays an enemy of `type` every `interval`, up to `max` alive                     | string `type`; `interval max glow`; string `event`                                                                                            |
| `frontal-shield`     | A shield plate in front that hits drain first                                   | `health halfArc`                                                                                                                              |
| `proximity-fuse`     | Arms, then blows near the ship or when its life ends                            | `armTime lifetime proximityRadius explosionRadius explosionDamage`                                                                            |
| `weapon-telegraph`   | Its lens lights before its weapon component fires                               | `telegraph`                                                                                                                                   |
| `orbit-side` `*`     | Picks the side it circles (read by the `orbit` strategy)                        | string `stream` (`random` or a fork such as `maneuverRandom`)                                                                                 |
| `spin` `*`           | Turns its arms (read by the view)                                               | `speed`                                                                                                                                       |
| `fork-streams` `*`   | Forks the aim and maneuver streams the movement and weapon components draw from | none                                                                                                                                          |
| `spawn-on-field` `*` | Spawned off the field, it restarts near the centre                              | `margin spread`                                                                                                                               |

## Weapon: `src/content/weapons/<id>.js`

- Fields: `name`, `chip` (HUD label), `description`, `fire`, `projectile`, `colors`, `card`. The header of `lance.js` explains each.
- `fire`: patterns in order; the first due fires, one with `every: n` on every nth shot, the last has no `every`. Patterns: `stream` (no params); `beam`: `every length width duration damageMultiplier extraFragments cooldownPenalty kick flashRadius`; `fan`: `bolts maxBolts fan` (degrees) `cooldownMultiplier`.
- `projectile` (exactly these): `look` (`lance` or `flak`), `speedMultiplier`, `damageMultiplier`, `range` (px, or `null`), `pierce`, `trailPoints` (or `null`), `burst` (`{ radius, damageMultiplier, duration }` or `null`).
- `colors`: `glow mid core` for a `beam`; `tracer core` for `flak`; `burst core` for a `burst`.
- `card` (the card fields below, but no top-level `levels`): enters the level-up catalog with one rank and excludes every other weapon card. Without a `card` a weapon can only be the starting cannon.
- Copy: `lance.js` (stream), `harmonic.js` (beam), `scatter.js` (fan and flak), `tests/__fixtures__/weapons/needle.js` (smallest card).

## Card: `src/content/cards/<id>.js`

- Fields: `category` (`offense defense mobility utility`), `family` (`kinetic thermal arc field salvage maneuver` or `null`; three of a family switch its bonus on), `rarity` (`common rare epic`), `icon`, `themeColor`, `unlockLevel` (pilot level), `tags`, `text` `{ name, summary, lore, levels: [{ title, description, highlights }] }`, `levels` `[{ rank, effects }]`; optional `cursed: true`, `prerequisites` `[{ type: 'upgrade', id, level, text }]`.
- An effect is `{ type: 'event', event: 'upgrade-...', payload }` (an event the engine already handles: copy a card that does the same) or `{ type: 'progression', property, operation, value }` (`operation`: `add multiply set`; `property`: `xpGainMultiplier comboTimeout comboMultiplierStep comboMultiplierCap orbMagnetismRadius magnetismForce`).
- `order` is unique across cards and weapon cards together; it sets the catalog order, so what a level-up offers first.
- Copy: `glass_cannon.js` (one rank), `shield.js` (three ranks), `rcs_system.js` (prerequisite).

## Hull: `src/content/hulls/<id>.js` (+ one entry in `src/data/hangar.js`)

- Fields: `name`, `outline` (collision points), `shieldPadding`, `thrusterPorts` `{ main aux left right }`, `stats` (multipliers: `acceleration maxSpeed maxHealth dashCooldown`), `visual` (panels from `./lib/panels.js`: `pt`, `panelPair`). Copy `default-hull.js`.
- To be flyable it needs a Hangar item with `unlocksHull: '<id>'` in `src/data/hangar.js` (`id name effect cost`).

## Stage and biome

- Stage `src/content/stages/layer-NN.js`: `order` = layer number; `rocks: rockCurve(n)`; `roster` `[{ role, count, from, every, elite }]` (`from` s into the layer, then every `every` s, `elite` chance); `surges` `[{ at, roles, count, label }]` (`ROCKFALL` in `layerParts.js`); `events` `[fieldEvent('sensor-jam', at)]` (`gravity-well solar-flare sensor-jam`); `warden` (boolean); optional `herald` (`dust heat silence`). The run has `RUN_FINAL_LAYER` layers (`src/data/constants/gameplay.js`): today a stage is edited, not added. Copy `layer-08.js`.
- Biome `src/content/biomes/<id>.js`: `title`, `layers: [first, last]`, sky, haze, vein, dust, light and `musicTheme` fields (`src/data/biomes.js` explains each). Ranges must tile layers 1 to `RUN_FINAL_LAYER`, and `tests/data/biomes.test.js` pins the three ids. Copy `dense-core.js`.

## Boss: `src/content/bosses/<id>.js`

Data only. A tweak edits numbers in the existing file: Wardens `prime`, `choir`, `null` (`config` and `components` live in `prime.js`), Heralds `dust`, `heat`, `silence` (flat fields). Their behavior is in classes (`src/modules/enemies/types/`) and the lists are imports in `src/data/enemies/boss.js` and `herald.js`: a new boss is not content-only.

## Visual

A new enemy writes no render code. Give it one of:

- `view: '<name>'`: one of the hand-made looks, `mote seeker tether husk ram weaver bulwark caster shade leech` (shared with that enemy).
- `visual: { scale, parts, lights, animate }`, built by `src/modules/render3d/enemies/recipes.js`. Units are the enemy's radius, +x is the nose. `parts`: `{ shape: sphere|box|octahedron|icosahedron|cone|cylinder|torus, size: n or [x, y, z], at: [x, y, z], rotate: [x, y, z] radians, material: hull|trim|glow, color: <PALETTE key> }` — hull and trim are matte; only `glow` parts and `lights` shine (neon only on information, `docs/NORTE.md`). `lights`: `{ at, size, color, pulse: <getter> }`. `animate`: `{ spin: [x, y, z] rad/s, bob, pulse: <getter> }`; a getter is one the enemy's behaviors provide (e.g. `telegraphRatio`). Unknown names throw. Copy `tests/__fixtures__/enemies/sentry.js`.
- Neither: a default matte pod with one red eye.

`view` and `visual` together is an error (tests/content checks it).

## Checking

- See it: `npm run dev`, then `/?content=<id>&desktop=force&debugLogging=0` (also `<kind>/<id>`; enemies, bosses, weapons, hulls, cards, stages, not biomes). `&count=N` (1 to 300) spawns N of an enemy; `&fire=1` lets the ship shoot enemies and bosses.
- Run: `npm run test:tocados` while working, `npm run done` at the end. `tests/content/` checks every item's fields (`registry`, `enemies`, `weapons`); `tests/data/` checks stages and biomes.
- `tests/integration/golden-trace.test.js` hashes full runs. It changes only when a change is meant to change play: a new enemy in an existing role (the spawns change), a new card or a boss tweak can change it. Then regenerate it in the same commit: `GOLDEN_UPDATE=1 npx vitest run tests/integration/golden-trace.test.js`.
