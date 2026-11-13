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
    wake: 'WAKE',
    5: 'WARDEN PRIME',
    10: 'THE CHOIR',
    15: 'WARDEN NULL',
    null: 'WARDEN NULL',
    'quarry-maw': 'QUARRY MAW',
    gatekeeper: 'GATEKEEPER',
    'kiln-engine': 'KILN ENGINE',
    'prism-crown': 'PRISM CROWN',
    'foundry-mother': 'FOUNDRY MOTHER',
    interdictor: 'THE INTERDICTOR',
    sovereign: 'SOVEREIGN',
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
    'the-crucible':
      'The Crucible. All orders arrive here. Two of them cannot both be obeyed.',
  },
  // The journey to each sector (docs/ROTEIRO.md), keyed by the sector it
  // flies to: the opening to the first, then one between each pair. Spoken
  // in order over the travel scene (src/modules/ui/runCinematics.js) by the
  // Wake or the Ring (a `speaker` key above).
  travel: {
    'debris-wake': [
      {
        speaker: 'wake',
        text: 'That signal could keep our lights on. Bring back what you can.',
      },
      {
        speaker: 'wake',
        text: 'Link is clean. The interceptor is yours. We lose a hull, not you.',
      },
      {
        speaker: 'ring',
        text: 'Visitors: one. Returning citizens: unresolved.',
      },
    ],
    'salvage-lanes': [
      {
        speaker: 'wake',
        text: "Something out there is still sorting the wreckage. Abandoned places don't do that.",
      },
      {
        speaker: 'ring',
        text: 'Lane assignment: none. Proceed uncounted. Briefly.',
      },
    ],
    'prime-gate': [
      {
        speaker: 'wake',
        text: 'The gate ahead has power. A thousand years, and it has power.',
      },
      { speaker: 'ring', text: 'Prime has been told. Prime is counting.' },
    ],
    'furnace-drift': [
      {
        speaker: 'wake',
        text: "We're through. The heat is deeper in. That's what we came for.",
      },
      {
        speaker: 'ring',
        text: 'One hull past the gate. The record does not have a word for you.',
      },
    ],
    'crystal-choir': [
      {
        speaker: 'wake',
        text: 'Reactor crew is cheering. Every furnace you put out, our lights get steadier.',
      },
      {
        speaker: 'wake',
        text: 'Odd thing. The cracks out there got wider when it went cold.',
      },
    ],
    'dense-core': [
      {
        speaker: 'wake',
        text: "That wasn't a weapon back there. It was holding something closed. Go carefully.",
      },
      {
        speaker: 'ring',
        text: 'Resonance failing. Seam width: increasing. Cause: one hull.',
      },
    ],
    'assembly-graveyard': [
      {
        speaker: 'wake',
        text: 'We have the power we came for. We could turn back now.',
      },
      {
        speaker: 'wake',
        text: "...the signal moved. It's calling from further in. It's calling us by name.",
      },
    ],
    'quarantine-grid': [
      {
        speaker: 'wake',
        text: 'It builds the same machine forever. Nobody told it to stop. Nobody was left to.',
      },
      {
        speaker: 'ring',
        text: 'Quarantine ahead. Drawn by the operators. Not drawn against you. Against us.',
      },
    ],
    'wardens-reach': [
      {
        speaker: 'wake',
        text: 'They broke their own Ring. On purpose. And put a guard on the pieces.',
      },
      {
        speaker: 'wake',
        text: "Pilot... I think we're the thing the guard was for.",
      },
    ],
    'the-crucible': [
      {
        speaker: 'ring',
        text: 'Continuance resumed. Restoring: nine hundred sectors, all citizens. Materials required.',
      },
      {
        speaker: 'wake',
        text: "It's pulling the Field back together. Pilot — it's pulling at us. At the Wake.",
      },
      {
        speaker: 'wake',
        text: "There's a center. Whatever gives the order is there. Go.",
      },
    ],
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
      // `last`: at half health, the order it cannot close.
      last: 'Order open. Build the chassis. Build the chassis. No one closes the order.',
      defeated:
        'Foundry Mother stopped. The line is still. The count is wrong and will stay wrong.',
    },
    interdictor: {
      warning: 'Quarantine holds. Boundary drawn. You are inside it.',
      // `last`: at half health, what the boundary is for.
      last: 'The boundary was never for you. It keeps the Ring from hearing. You are loud.',
      defeated:
        'Interdictor offline. The boundary is open. Null has been waiting for this.',
    },
    // Warden Null's `last` (the final-phase hook is keyed by boss kind): its
    // shell shed, it says why it wanted stillness.
    null: {
      last: 'Stop. Every shot is a voice. It is listening for one.',
    },
    // `last`: as its final phase begins, the two orders at once.
    sovereign: {
      warning:
        'Protect them. Rebuild them. I will do both. You are material for the second.',
      last: 'Protect. Rebuild. Protect. The orders do not agree. I do not stop.',
      defeated:
        'Orders... unassigned. Operator present. Operator: you. Choose.',
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
  // The campaign's ending (docs/ROTEIRO.md, "A escolha"): after Sovereign
  // falls in ENDING_SECTOR the pilot picks one, by its `choice`; its
  // `lines` play in order over the held epilogue shot.
  ending: {
    severance: {
      title: 'Severance',
      choice: 'Cut the core loose. The Field goes quiet. The archive sleeps.',
      lines: [
        {
          speaker: 'ring',
          text: 'Continuance: closed. Citizens: at rest. Thank you for counting us.',
        },
        { speaker: 'wake', text: 'Lights are steady. All of them. Come home.' },
      ],
    },
    stewardship: {
      title: 'Stewardship',
      choice: 'Keep the Ring awake, under watch. Yours.',
      lines: [
        {
          speaker: 'ring',
          text: 'Continuance: supervised. Operator logged. Sectors relighting: nine. Then more.',
        },
        {
          speaker: 'wake',
          text: 'So we stay. Somebody has to keep count. Might as well be us.',
        },
      ],
    },
  },
});

/** The sector whose win opens the ending's choice. */
export const ENDING_SECTOR = 'the-crucible';
