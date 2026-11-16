// src/data/upgrades/index.js

// Aggregator for all upgrade definitions
// Maintains backward compatibility with original upgrades.js structure
//
// One file per card in src/content/cards/, plus the `card` of each weapon in
// src/content/weapons/, listed by `order` (the order of the catalog, which
// decides what a level-up offers first).

import { listContent } from '../../content/registry.js';
import { newFlightFromUrl } from '../../modules/player/newFlight.js';
import { deepFreeze } from '../../utils/deepFreeze.js';
import { UPGRADE_CATEGORIES } from './categories.js';

// A weapon card swaps the cannon for its weapon: one rank, one event, and no
// build holds two of them.
const armed = listContent('weapons').filter((weapon) => weapon.card);
const WEAPON_CARDS = armed.map(({ id, card }) => ({
  ...card,
  excludes: armed
    .filter((other) => other.card !== card)
    .map((other) => other.card.id),
  levels: [
    {
      rank: 1,
      effects: [
        { type: 'event', event: 'upgrade-weapon', payload: { weaponId: id } },
      ],
    },
  ],
}));

/**
 * The cards of the flight in play: the new flight (?direcao=nova) adds its own
 * (`newFlight`) and reads the piloting cards' glide text (`newFlightText`,
 * over `text`); without it the catalog is today's.
 */
export function cardsForFlight(cards, newFlight) {
  return cards
    .filter((card) => newFlight || !card.newFlight)
    .map((card) =>
      newFlight && card.newFlightText
        ? { ...card, text: { ...card.text, ...card.newFlightText } }
        : card
    );
}

const UPGRADE_LIBRARY = deepFreeze(
  [
    ...cardsForFlight(listContent('cards'), newFlightFromUrl()),
    ...WEAPON_CARDS,
  ].sort((a, b) => a.order - b.order)
);
export const WEAPON_CARD_IDS = Object.freeze(WEAPON_CARDS.map(({ id }) => id));

export { UPGRADE_CATEGORIES };
export default UPGRADE_LIBRARY;
