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
  weaponId: id,
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
 * The cards of the flight in play: the new flight (the default; ?direcao=antiga is the old flight) adds its own
 * (`newFlight`) and reads the piloting cards' glide text (`newFlightText`,
 * over `text`) and its `newFlightPrerequisites` (added to `prerequisites`);
 * without it the catalog is today's.
 */
export function cardsForFlight(cards, newFlight) {
  return cards
    .filter((card) => newFlight || !card.newFlight)
    .map((card) =>
      newFlight && card.newFlightText
        ? { ...card, text: { ...card.text, ...card.newFlightText } }
        : card
    )
    .map((card) =>
      newFlight && card.newFlightPrerequisites
        ? {
            ...card,
            prerequisites: [
              ...(card.prerequisites ?? []),
              ...card.newFlightPrerequisites,
            ],
          }
        : card
    );
}

/**
 * A card's text with `weaponId` in hand: its `weaponText[weaponId].levels`
 * over `text.levels`, rank by rank (what the override leaves out keeps the
 * base). Read when the card is shown, not here: the weapon changes mid-run.
 */
export function textForWeapon(card, weaponId) {
  const levels = card.weaponText?.[weaponId]?.levels;
  if (!levels) return card.text;
  return {
    ...card.text,
    levels: card.text.levels.map((level, rank) => ({
      ...level,
      ...levels[rank],
    })),
  };
}

const UPGRADE_LIBRARY = deepFreeze(
  [
    ...cardsForFlight(listContent('cards'), newFlightFromUrl()),
    ...WEAPON_CARDS,
  ].sort((a, b) => a.order - b.order)
);
/**
 * The new flight's piloting cards: the Flight Computer and every card on its
 * way (its prerequisites, followed down); none when it is not in `cards`.
 */
export function pilotCardIds(cards) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const ids = [];
  const visit = (id) => {
    if (ids.includes(id) || !byId.has(id)) return;
    ids.push(id);
    (byId.get(id).prerequisites ?? [])
      .filter(({ type }) => type === 'upgrade')
      .forEach((prerequisite) => visit(prerequisite.id));
  };
  visit('flight_computer');
  return ids;
}

/**
 * The trail's steps: the rank of each piloting card the Flight Computer's way
 * asks for (its prerequisites, followed down), the Flight Computer at 1.
 */
export function trailSteps(cards) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const steps = new Map();
  pilotCardIds(cards).forEach((id) => {
    if (id === 'flight_computer') steps.set(id, 1);
    (byId.get(id).prerequisites ?? [])
      .filter(({ type }) => type === 'upgrade')
      .forEach(({ id: step, level = 1 }) =>
        steps.set(step, Math.max(steps.get(step) ?? 0, level))
      );
  });
  return steps;
}

export const WEAPON_CARD_IDS = Object.freeze(WEAPON_CARDS.map(({ id }) => id));

export { UPGRADE_CATEGORIES };
export default UPGRADE_LIBRARY;
