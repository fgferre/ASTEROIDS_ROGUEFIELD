# CONTENT.md

Content is data, behavior is a small library, `src/content/registry.js` links them. A new item is one file; no engine file lists content by hand. Copy the nearest real file and change it.

## The rule

- One file per item: `src/content/<kind>/<id>.js`, `export default { id, ... }`, `id` = file name. Kinds: `enemies`, `weapons`, `cards`, `hulls`, `stages`, `biomes`, `bosses`. A file in a subfolder is not an item (`hulls/lib/`).
- `order`: a unique number per kind, where order decides a draw (cards, enemies). A new item takes the next free number. The lowest weapon `order` is the starting cannon.
- Import only `src/data/constants/` (except `visual.js`, which reads the registry: importing it closes an import cycle that crashes every test at load), `src/utils/deepFreeze.js`, `src/data/layerParts.js` and other content files. Never `GameConstants` or a module that reads the registry. `tests/content/registry.test.js` checks every content file's imports and names the file and the import that breaks this.
- A new behavior, fire pattern or movement strategy is an engine change, not content.
- Numbers are proposals: comment them `// proposta DD/MM`; the owner's play decides.

## Enemy: `src/content/enemies/<id>.js`

- Required: `roles` (jobs it fills, below); `config` `{ key, displayName, radius, health, contactDamage }`; `components` `{ movement: { strategy, ... }, collision, health }`, plus `weapon: { pattern, ... }` if it shoots; `rewards` `{ baseOrbs, totalXP, healthHeartChance }` (or `baseOrbsMin`/`baseOrbsMax`); `pool` `{ initial, max }`; `tags` (with `'enemy'`); `affixes` (Elite rolls it may get: `shielded swift volatile splitter warded`); `seeded` (true = own random stream; a behavior marked `*` needs it); `behaviors` `{ name: params }`.
- Optional: `weight` (default 1), `fromLayer` (default 1), `projectileColor`, `explodesOnDeath`; `effects` `{ fire, death }` (`fire`: `muzzle-flash` default, `burst-flash`, `null` for none; `death`: `spark-burst shock-burst blast debris`); `explosion` (`small medium large`, default `medium`, `null` none); `cues` `{ fired, telegraph, destroyed }` (an `SFXBus` method name each); `codex` `{ lore, hint, glyph }`; `sighting` (line at first sight, 90 characters at most).
- Movement `strategy`: `linear tracking orbit proximity seeking parasite volatile`. Weapon `pattern`: `single burst spread volley proximity`. Copy the numbers of an enemy that uses the same.
- Copy: `src/content/enemies/drone.js` (movement and weapon), `caster.js` (several behaviors). Smallest that passes the tests, `tests/__fixtures__/enemies/gnat.js` (test fixtures use `order` 900+ so they never collide; a real file takes the next free number):

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

A recipe passes exactly a behavior's params (the test compares the key sets). Params are numbers unless named as strings; `shots` and `count` are whole numbers of at least 1 (a fan of one shot flies straight at the ship); `*` = draws random. Event names: reuse the donor's (a new name plays no sound).

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

- Fields: `name`, `outline` (collision points), `shieldPadding`, `thrusterPorts` `{ main aux left right }`, `stats` (multipliers: `acceleration maxSpeed maxHealth dashCooldown`), `visual` (panels from `./lib/panels.js`: `pt`, `panelPair`; its `form` shapes the 3D body, documented there). Copy `default-hull.js`.
- To be flyable it needs a Hangar item with `unlocksHull: '<id>'` in `src/data/hangar.js` (`id name effect cost`).

## Stage and biome

- Stage `src/content/stages/layer-NN.js`: `order` = layer number; `rocks: rockCurve(n)`; `roster` `[{ role, count, from, every, elite }]` (`from` s into the layer, then every `every` s, `elite` chance); `surges` `[{ at, roles, count, label }]` (`ROCKFALL` in `layerParts.js`); `events` `[fieldEvent('sensor-jam', at)]` (`gravity-well solar-flare sensor-jam`); `warden` (boolean); optional `herald` (`dust heat silence`). The run has `RUN_FINAL_LAYER` layers (`src/data/constants/gameplay.js`): today a stage is edited, not added. Copy `layer-08.js`.
- Biome `src/content/biomes/<id>.js`: `title`, `layers: [first, last]`, sky, haze, vein, dust, light and `musicTheme` fields (`src/data/biomes.js` explains each). Ranges must tile layers 1 to `RUN_FINAL_LAYER`, and `tests/data/biomes.test.js` pins the three ids. Copy `dense-core.js`.

## Boss: `src/content/bosses/<id>.js`

Data only. A tweak edits numbers in the existing file: Wardens `prime`, `choir`, `null` (`config` and `components` live in `prime.js`), Heralds `dust`, `heat`, `silence` (flat fields). Their behavior is in classes (`src/modules/enemies/types/`) and the lists are imports in `src/data/enemies/boss.js` and `herald.js`: a new boss is not content-only.

Every Warden has its own entrance, the `arrival` recipe in its file (fields explained in `prime.js`): it is born past the left or right edge farther from the ship, flies in with its pieces open while the world slows and the ship is held, lights the edge where it crosses, closes up and only then fights; a low live camera follows the recipe's `shot`. A new Warden writes a recipe and, in its class, `poseArrival(open, spin, dt)` (how its pieces open) and `arrivalBodies()` if more than its hull lights the edge (`src/modules/enemies/boss/arrival.js`). See it with `?content=<id>`.

## Visual

A new enemy writes no render code. Give it one of:

- `view: '<name>'`: one of the hand-made looks, `mote seeker tether husk ram weaver bulwark caster shade leech` (shared with that enemy; `bulwark` draws its plate from a `frontal-shield` behavior, so it needs one).
- `visual: { scale, parts, lights, animate }`, built by `src/modules/render3d/enemies/recipes.js` from the shape helpers the hand-made machines use (`shapes.js`). Units are the enemy's radius, +x is the nose, +y up. `parts`: `{ shape, size: n or [x, y, z], at: [x, y, z], rotate: [x, y, z] radians, mirror, material: hull|trim|glow, color: <PALETTE key> }` — hull and trim are matte; only `glow` parts and `lights` shine (neon only on information, `docs/NORTE.md`); `mirror: true` adds the twin across z. Shapes, designed on every side:

  - `body`: `stations: [[x, half width, top, bottom, round?], …]`, `round` (2 oval, higher boxier), `ridge` — a smooth loft along x (fuselage, pod, carapace; `bottom` shapes the belly).
  - `turned`: `profile: [[radius, height], …]`, `axis: 'y'|'x'`, `smooth` — turned round y (dome, disc, turret) or x (pod, barrel; the top is the nose); ends off the axis are capped, a profile that ends where it starts is a ring.
  - `wing`: `root, tip, span, sweep, thick, dihedral, under` — a thick tapered blade out along +z from its root chord at `at`; `dihedral: Math.PI / 2, under: 1` is a fin.
  - `tube`: `points: [[x, y, z], …], radius: r or [from, to]` — smooth through its points (arm, strut, pipe; not straight up).
  - `nozzle`, `socket`: `dir` — a dark exhaust bell (mouth toward `dir`, default −x) and a dark eye housing (default +x); `size` is the radius.
  - `sphere|box|octahedron|icosahedron|cone|cylinder|torus`: plain primitives, for small details only.

  `lights`: `{ at, size, color, pulse: <getter>, dir, housing }`; each sits in a dark socket open away from the centre (or toward `dir`; `housing: false` for none). `animate`: `{ spin: [x, y, z] rad/s, bob, pulse: <getter> }`; a getter is one the enemy's behaviors provide (e.g. `telegraphRatio`). The outline follows the parts' top view (a circle if it tumbles). Unknown names throw. `sides` (and `rings` on `body` and `tube`) sets how finely a shape is cut: keep a view under ~2500 triangles. Copy `tests/__fixtures__/enemies/sentry.js`.

- Neither: a default small matte machine with one red eye.

`view` and `visual` together is an error (tests/content checks it).

## Gotchas (found by the first worker who followed this page)

- Next free `order`: the highest in the kind plus one — `sed -n 's/^  order: \([0-9]*\).*/\1/p' src/content/<kind>/*.js | sort -n | tail -1` (the number alone: `sort -n` on whole lines sorts them as text). Card orders also live in each weapon's `card`, four spaces in: for cards, add `sed -n 's/^    order: \([0-9]*\).*/\1/p' src/content/weapons/*.js` to the list.
- Ids: enemies, weapons, hulls, stages, biomes in kebab-case (`needle-array`); card ids in snake_case (`needle_array`). The id is the file name.
- Layers past 15 copy layer 14's roster and surges (`beyond()` in `src/data/layers.js`): an enemy with `fromLayer` ≥ 16 spawns only if its role is one layer 14 asks for.
- Movement params are read by each strategy in `src/modules/enemies/components/MovementComponent.js` (orbit: `acceleration`, `maxSpeed`, `preferredDistance`, `orbitDirection`). Behaviors that set velocity themselves (`hold-range`, `charge`) need `strategy: 'linear'`.
- `cone` and `cylinder` stand along y: `rotate: [0, 0, -Math.PI / 2]` points them at the nose (+x).
- A fan's `cooldownMultiplier` below 1 fires faster than the lance.
- New content changes play, so it can change the golden trace (a new card is a new level-up offer; an enemy in a role at layers 1–17 changes spawns): regenerate the fixture in the same commit, as the test's header says.

## Checking

- See it: `npm run dev`, then `/?content=<id>&desktop=force&debugLogging=0` (also `<kind>/<id>`; enemies, bosses, weapons, hulls, cards, stages, not biomes). `&count=N` (1 to 300) spawns N of an enemy; `&fire=1` lets the ship shoot enemies and bosses.
- Run: `npm run test:tocados` while working, `npm run done` at the end. `tests/content/` checks every item's fields (`registry`, `enemies`, `weapons`); `tests/data/` checks stages and biomes.
- `tests/integration/golden-trace.test.js` hashes full runs. It changes only when a change is meant to change play: a new enemy in an existing role (the spawns change), a new card or a boss tweak can change it. Then regenerate it in the same commit: `GOLDEN_UPDATE=1 npx vitest run tests/integration/golden-trace.test.js`.
