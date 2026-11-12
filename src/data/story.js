// src/data/story.js

import { deepFreeze } from '../utils/deepFreeze.js';
import { listContent } from '../content/registry.js';

// What the Wardens say to the pilot (docs/NORTE.md §1, §7 pillar 1). Warden
// lines are keyed by layer, not by boss class; Sentinel lines by boss kind
// (they end a sector, whatever its layer). Each line stays under 90
// characters so it fits the transmission banner on one or two rows.
export const STORY = deepFreeze({
  speaker: {
    ring: 'THE RING',
    5: 'WARDEN PRIME',
    10: 'THE CHOIR',
    15: 'WARDEN NULL',
    'quarry-maw': 'QUARRY MAW',
    gatekeeper: 'GATEKEEPER',
    'kiln-engine': 'KILN ENGINE',
    'prism-crown': 'PRISM CROWN',
    'foundry-mother': 'FOUNDRY MOTHER',
    interdictor: 'THE INTERDICTOR',
    dust: 'HERALD OF DUST',
    heat: 'HERALD OF HEAT',
    silence: 'HERALD OF SILENCE',
  },
  // Spoken by the Ring as each biome begins.
  chapter: {
    'outer-ring':
      'Outer Ring. Sectors one through nine hundred. Atmosphere: none. Visitors: one.',
    'dense-core':
      'Dense Core. Mass high, light low. The heat you see is the Ring, still thinking.',
    'wardens-reach':
      "Warden's Reach. Structure intact. Law intact. No vessel is logged past this point.",
  },
  // Spoken by the Ring as a sector run begins, in place of its biome's line
  // (docs/ROTEIRO.md); a sector without one keeps the biome's.
  sector: {
    'debris-wake':
      'Debris Wake. What the Ring let go of. All of it is still counted.',
    'salvage-lanes':
      'Salvage Lanes. Cargo moved here for nine hundred years. The schedule still runs.',
    'furnace-drift':
      'Furnace Drift. The Core vents here. It has not been allowed to cool.',
    'crystal-choir':
      'Crystal Choir. Nine voices held this seam shut. Three remain.',
    'assembly-graveyard':
      'Assembly Graveyard. The same chassis, built again. Order received once. Never closed.',
    'quarantine-grid':
      'Quarantine Grid. Nothing leaves. That was the last order anyone gave on purpose.',
  },
  // Spoken by the Ring the first time a support machine is ever seen (the
  // Codex's first meeting): the `sighting` line of its content file.
  // Machines without a line arrive unannounced.
  sighting: Object.fromEntries(
    listContent('enemies')
      .filter((enemy) => enemy.sighting)
      .map((enemy) => [enemy.id, enemy.sighting])
  ),
  // Warden Prime, as a Boss Rush opens on its gate.
  bossRush:
    'Three gates. Nothing between them. You will be counted at every one.',
  // The Ring logs a Hangar purchase, keyed by item id.
  hangar: {
    'bastion-hull':
      'Escort hull logged: Bastion. Built to bring others home. Carrying one.',
  },
  // warning: on 'boss-warning', the layer before the Warden. defeated: on its
  // 'boss-defeated' (the last Warden's defeat is the victory line).
  warden: {
    5: {
      warning:
        'Salvage pilot. You are counted. The Ring is broken. It is not abandoned.',
      defeated:
        'Prime yields. The record is kept. Below, the Choir is already singing it.',
    },
    10: {
      warning:
        'We are three. We were nine. We sang the Ring closed. We will sing you still.',
      defeated:
        'The hymn breaks. No matter. At the center, nothing needs to be sung.',
    },
    15: {
      warning:
        'I am the stillness the Ring kept for its ending. Come closer, ember. Be still.',
      defeated:
        'Still... no longer. It hears you now. I kept it asleep a thousand years.',
    },
  },
  // Sentinel lines, keyed by boss kind: warning and defeated as a Warden's.
  sentinel: {
    'quarry-maw': {
      warning:
        'Quarry unit active. Stone is counted before it is eaten. So are hulls.',
      defeated:
        'Quarry Maw offline. The stone goes uncounted. Prime will ask why.',
    },
    gatekeeper: {
      warning: 'Lane closed. Gate holds. You are not on the manifest.',
      defeated: 'Gate open. One hull through. Prime has been told.',
    },
    'kiln-engine': {
      warning:
        'Furnace lit. Core temperature rising. One hull, unlisted, entering the fire.',
      defeated:
        'Kiln Engine cold. The Core will remember the temperature it lost.',
    },
    'prism-crown': {
      warning:
        'Three voices remain in the crystal. They have found a new listener.',
      defeated: 'The Crown is dark. The Chamber heard it go quiet.',
    },
    'foundry-mother': {
      warning:
        'Assembly line active. Chassis count: unfinished. Intruder count: one.',
      defeated:
        'Foundry Mother stopped. The line is still. The count is wrong and will stay wrong.',
    },
    interdictor: {
      warning: 'Quarantine holds. Boundary drawn. You are inside it.',
      defeated:
        'Interdictor offline. The boundary is open. Null has been waiting for this.',
    },
  },
  // Herald lines, keyed by kind: spawned on 'herald-spawned', defeated on
  // 'herald-defeated'. Dust counts, Heat reads temperatures, Silence barely
  // finishes a sentence.
  herald: {
    dust: {
      spawned:
        'Inventory: nine hundred sectors. Stone, metal, one hull. The hull is not on the list.',
      defeated:
        'Struck from the record: one Herald. Remaining: stone, metal, one hull. Recounting.',
    },
    heat: {
      spawned:
        'Core: four thousand kelvin. Your hull: three hundred. The difference will be corrected.',
      defeated:
        'Cooling. Twelve hundred. Nine hundred. The Core is still hotter. It is waiting for you.',
    },
    silence: {
      spawned: '...past here... nothing answers. Not the Ring. Not you.',
      defeated: '...broken... Null hears... still...',
    },
  },
  // One is picked with the seeded random when the pilot dies.
  // The pilot flies by remote link from the Wake: a hull is lost, not the
  // pilot (docs/ROTEIRO.md).
  death: [
    'Link severed. Interceptor lost. The Field keeps the hull.',
    'Hull returned to the count. The Wake has another. The Ring has patience.',
    'Signal lost. The Ring files one more shard. The pilot is not in it.',
    'The Ring has been broken a thousand years. It can wait for your next hull.',
  ],
  victory:
    'Warden Null is silent. The Ring hears a pilot at its center. It begins to wake.',
});
