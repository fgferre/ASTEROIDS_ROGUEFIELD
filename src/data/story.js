// src/data/story.js

import { deepFreeze } from '../utils/deepFreeze.js';

// What the Wardens say to the pilot (docs/NORTE.md §1, §7 pillar 1). Warden
// lines are keyed by layer, not by boss class. Each line stays under 90
// characters so it fits the transmission banner on one or two rows.
export const STORY = deepFreeze({
  speaker: {
    ring: 'THE RING',
    5: 'WARDEN PRIME',
    10: 'THE CHOIR',
    15: 'WARDEN NULL',
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
  death: [
    'Ember extinguished. The Field takes back what it is owed.',
    'Signal lost. Your hull joins the Ring. You are part of it now.',
    'Another pilot recorded. Another shard returned. The count continues.',
    'The Ring has been broken a thousand years. It can wait for the next pilot.',
  ],
  victory:
    'Warden Null is silent. The Ring hears a pilot at its center. It begins to wake.',
});
