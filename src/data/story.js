// src/data/story.js

import { deepFreeze } from '../utils/deepFreeze.js';
import { listContent } from '../content/registry.js';

// What is said to the pilot (docs/NORTE.md §1, §7 pillar 1; the campaign's
// script is docs/ROTEIRO.md). Each line stays under 90 characters so it fits
// the transmission banner on one or two rows.
export const STORY = deepFreeze({
  speaker: {
    ring: 'THE RING',
    wake: 'WAKE',
    prime: 'WARDEN PRIME',
    choir: 'THE CHOIR',
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
      'Salvage Lanes. Cargo has moved here for a thousand years. The schedule still runs.',
    'prime-gate':
      'Prime Gate. Last opened: a thousand years ago. Power: nominal. Keeper: on station.',
    'furnace-drift':
      'Furnace Drift. The Core vents here. It has not been allowed to cool.',
    'crystal-choir':
      'Crystal Choir. Nine voices sang this seam shut. Six are crystal now.',
    'dense-core':
      'Resonance Chamber. Voices: three of nine. Seams held: all of them. For now.',
    'assembly-graveyard':
      'Assembly Graveyard. The same chassis, built again. Order received once. Never closed.',
    'quarantine-grid':
      'Quarantine Grid. Nothing leaves. That was the last order anyone gave on purpose.',
    'wardens-reach':
      'Null Boundary. Cut made by the operators. Guard posted: one. Nothing logged past it.',
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
      { speaker: 'ring', text: 'Gate log updated. Prime is counting.' },
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
        text: 'Continuance resumed. Archive: eleven million citizens. Restoring. Materials required.',
      },
      {
        speaker: 'wake',
        text: "It's pulling the Field back together. Pilot — it's pulling at us. At the Wake.",
      },
      {
        speaker: 'ring',
        text: 'Returning citizens: resolved. The Wake. All aboard are counted.',
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
  // What each boss says, keyed by its kind (Wardens and Sentinels alike), in
  // the campaign's order. warning: on 'boss-warning', the layer before it.
  // last: as its final phase begins. defeated: on its 'boss-defeated' (after
  // Warden Null's on the run's last layer comes `victory`).
  boss: {
    'quarry-maw': {
      warning:
        'Quarry unit active. Stone is counted before it is eaten. So are hulls.',
      last: 'Intake widened. Sorting continues. Nothing here is thrown away.',
      defeated:
        'Quarry Maw offline. The stone goes uncounted. Prime will ask why.',
    },
    gatekeeper: {
      warning: 'Lane closed. Gate holds. You are not on the manifest.',
      last: 'Schedule slipping. Second pass authorised. The lane stays closed.',
      defeated: 'Gate open. One hull through. Prime has been told.',
    },
    prime: {
      warning:
        'Salvage pilot. You are counted. The Ring is broken. It is not abandoned.',
      last: 'The count does not close with you in it. Prime will correct the count.',
      defeated:
        'Prime yields. The record is kept. Below, the Choir is already singing it.',
    },
    'kiln-engine': {
      warning:
        'Furnace lit. Core temperature rising. One hull, unlisted, entering the fire.',
      last: 'Vents sealed. Pressure: rising. The fire has one place left to go.',
      defeated:
        'Kiln Engine cold. Heat released: all of it. Seams: one, opening.',
    },
    'prism-crown': {
      warning:
        'Six voices sleep in the crystal. The Crown still carries their note.',
      last: 'The note is cracking. Six sleepers stir. The Crown holds them a little longer.',
      defeated: 'The Crown is dark. The note has stopped. The seam has not.',
    },
    choir: {
      warning:
        'We are three. We were nine. We sang the Ring closed. We will sing you still.',
      last: 'The hymn thins. The seam hears the gap. Do not be the gap.',
      defeated:
        'The hymn breaks. We were not guarding it. We were holding it shut.',
    },
    // `last`: the order it cannot close.
    'foundry-mother': {
      warning:
        'Assembly line active. Chassis count: unfinished. Intruder count: one.',
      last: 'Order open. Build the chassis. Build the chassis. No one closes the order.',
      defeated:
        'Foundry Mother stopped. The line is still. The count is wrong and will stay wrong.',
    },
    // `last`: what the boundary is for.
    interdictor: {
      warning: 'Quarantine holds. Boundary drawn. You are inside it.',
      last: 'The boundary was never for you. It keeps the Ring from hearing. You are loud.',
      defeated:
        'Interdictor offline. The boundary is open. Null has been waiting for this.',
    },
    // `last`: its shell shed, it says why it wanted stillness.
    null: {
      warning:
        'I am the stillness the Ring kept for its ending. Come closer, ember. Be still.',
      last: 'Stop. Every shot is a voice. It is listening for one.',
      defeated:
        'Still... no longer. It hears you now. I kept it asleep a thousand years.',
    },
    // `last`: the two orders at once.
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
  // Spoken as a stage of a sector run begins (docs/ROTEIRO.md "Falas de meio
  // de fase"), keyed by sector, then stage: the Wake at every third, where
  // each chapter's turn is said while it is happening; the others as noted.
  stage: {
    'debris-wake': {
      3: {
        speaker: 'wake',
        text: "Scrap this old shouldn't have running lights. Keep your eyes open.",
      },
    },
    'salvage-lanes': {
      3: {
        speaker: 'wake',
        text: 'Those convoys are on a timetable. Somebody is still dispatching them.',
      },
      // The Wake's people, once a chapter: what a loss would cost.
      4: {
        speaker: 'wake',
        text: 'Forty of us on this ship, pilot. All forty are watching your feed.',
      },
    },
    'prime-gate': {
      3: {
        speaker: 'wake',
        text: 'A garrison. For a gate nobody has used in a thousand years. Who are they expecting?',
      },
    },
    'furnace-drift': {
      3: {
        speaker: 'wake',
        text: "Every vent you close, our reactors climb. Whatever this place is, it's feeding us.",
      },
    },
    'crystal-choir': {
      3: {
        speaker: 'wake',
        text: "The seam is singing back. I don't like how much it sounds like an alarm.",
      },
      // The Wake's people, once a chapter: what a loss would cost.
      4: {
        speaker: 'wake',
        text: "Reactor crew says thank you. Mara hasn't slept in a week. Tonight she might.",
      },
    },
    'dense-core': {
      3: {
        speaker: 'wake',
        text: "The cracks answer when a machine dies. Pilot, I think we're the ones opening them.",
      },
    },
    // The archive is named here, two sectors before it matters.
    'assembly-graveyard': {
      2: {
        speaker: 'ring',
        text: 'Citizens stored: eleven million. Citizens restored: none. Order still open.',
      },
      3: {
        speaker: 'wake',
        text: "Same hull, same serial, again and again. It isn't building a fleet. It's repeating.",
      },
    },
    'quarantine-grid': {
      3: {
        speaker: 'wake',
        text: "These fences point inward. They weren't keeping us out. They were keeping it in.",
      },
      // The Wake's people, once a chapter: what a loss would cost.
      4: {
        speaker: 'wake',
        text: "The kids on deck three named your hull. I'm not telling you what.",
      },
    },
    'wardens-reach': {
      3: {
        speaker: 'wake',
        text: "Past this line our charts are blank. The signal isn't. It knows we're here.",
      },
    },
    'the-crucible': {
      3: {
        speaker: 'wake',
        text: "It has our hull plans, pilot. It's building Wakes. Finish this before one launches.",
      },
    },
  },
  // The campaign's ending (docs/ROTEIRO.md, "A escolha"): after Sovereign
  // falls in ENDING_SECTOR the pilot picks one, by its `choice` and its
  // `stakes` (what becomes of the Ring, of the archive of its citizens and
  // of the Wake); its `lines` play in order over the held epilogue shot and
  // its `epitaph` stands under the final card's title.
  ending: {
    severance: {
      title: 'Severance',
      choice: 'Cut the core loose. The Field goes quiet. The archive sleeps.',
      stakes: {
        ring: 'Goes dark. Nothing is rebuilt again.',
        archive: 'Every citizen it holds sleeps. None is restored.',
        wake: 'Takes the power it came for and goes home.',
      },
      epitaph:
        'The Ring is dark. Its citizens are at rest. The Wake went home.',
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
      stakes: {
        ring: 'Stays awake and rebuilds, on your orders.',
        archive: 'Kept open. One day, perhaps, restored.',
        wake: 'Stays to stand watch. Nobody goes home.',
      },
      epitaph: 'The Ring is awake, and watched. The Wake keeps the count.',
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
