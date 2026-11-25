// How each card enters the draw, said in its own file (CONTENT.md, "Card"):
// `unlock` on every card file and every weapon's `card`, or `fallback: true`.
// data/hangar.js and data/achievements.js build the starting draw, the
// licences, the piloting track and the medals' licences from it, so a card
// without one would never be offered.
import { describe, expect, it } from 'vitest';
import { listContent } from '../../src/content/registry.js';
import { ACHIEVEMENTS } from '../../src/data/achievements.js';
import UPGRADE_LIBRARY, {
  pilotCardIds,
} from '../../src/data/upgrades/index.js';

const MEDALS = new Set(ACHIEVEMENTS.map(({ id }) => id));
// The piloting cards a run offers: the Flight Computer and its way.
const PILOT_WAY = pilotCardIds(UPGRADE_LIBRARY);
const PLACED = ['start', 'license', 'pilot'];

// Every card with where its `unlock` is written: `{ file, field, card }`.
const entries = () => [
  ...listContent('cards').map((card) => ({
    file: `src/content/cards/${card.id}.js`,
    field: 'unlock',
    card,
  })),
  ...listContent('weapons')
    .filter((weapon) => weapon.card)
    .map((weapon) => ({
      file: `src/content/weapons/${weapon.id}.js`,
      field: 'card.unlock',
      card: weapon.card,
    })),
];

/** One sentence per problem, naming the file and the field; [] is clean. */
function unlockProblems(list) {
  const problems = [];
  const taken = new Map();
  list.forEach(({ file, field, card }) => {
    const { unlock } = card;
    const at = `${file}: ${field}`;
    if (!unlock) {
      if (!card.fallback) {
        problems.push(
          `${at} is missing: say how the card enters the draw (by 'start', 'license', 'pilot' or 'medal')`
        );
      }
      return;
    }
    if (![...PLACED, 'medal'].includes(unlock.by)) {
      problems.push(
        `${at}.by is '${unlock.by}', not 'start', 'license', 'pilot' or 'medal'`
      );
      return;
    }
    if ((unlock.by === 'pilot') !== PILOT_WAY.includes(card.id)) {
      problems.push(
        unlock.by === 'pilot'
          ? `${at}.by is 'pilot' but the card is not on the Flight Computer's way (its prerequisites, followed down): no run would offer it`
          : `${at}.by is '${unlock.by}' but the card is on the Flight Computer's way: it must be 'pilot'`
      );
    }
    if (unlock.by === 'medal') {
      if (!MEDALS.has(unlock.medal)) {
        problems.push(
          `${at}.medal '${unlock.medal}' is no medal in src/data/achievements.js`
        );
      }
      const key = `medal ${unlock.medal}`;
      if (taken.has(key)) {
        problems.push(
          `${at}.medal '${unlock.medal}' already licenses ${taken.get(key)}`
        );
      }
      taken.set(key, file);
      return;
    }
    if (!Number.isInteger(unlock.at) || unlock.at < 1) {
      problems.push(`${at}.at must be a whole number of at least 1`);
    }
    const key = `${unlock.by} ${unlock.at}`;
    if (taken.has(key)) {
      problems.push(
        `${at}.at ${unlock.at} is taken in '${unlock.by}' by ${taken.get(key)}`
      );
    }
    taken.set(key, file);
    if (
      unlock.by === 'license' &&
      !(Number.isFinite(unlock.cost) && unlock.cost > 0)
    ) {
      problems.push(`${at}.cost must be a Salvage price above 0`);
    }
  });
  return problems;
}

describe('card unlocks', () => {
  it('every card and weapon card says how it enters the draw', () => {
    expect(unlockProblems(entries())).toEqual([]);
  });

  it('refuses a card file with no unlock, naming the file and the field', () => {
    const card = { id: 'gnat_card' };
    expect(
      unlockProblems([
        { file: 'src/content/cards/gnat_card.js', field: 'unlock', card },
      ])
    ).toEqual([
      "src/content/cards/gnat_card.js: unlock is missing: say how the card enters the draw (by 'start', 'license', 'pilot' or 'medal')",
    ]);
  });

  it('refuses a card naming a medal that does not exist', () => {
    const card = {
      id: 'gnat_card',
      unlock: { by: 'medal', medal: 'no-such-medal' },
    };
    expect(
      unlockProblems([
        { file: 'src/content/cards/gnat_card.js', field: 'unlock', card },
      ])
    ).toEqual([
      "src/content/cards/gnat_card.js: unlock.medal 'no-such-medal' is no medal in src/data/achievements.js",
    ]);
  });

  it('refuses two cards in the same place of a list', () => {
    const card = (id) => ({ id, unlock: { by: 'start', at: 1 } });
    expect(
      unlockProblems([
        { file: 'a.js', field: 'unlock', card: card('a') },
        { file: 'b.js', field: 'unlock', card: card('b') },
      ])
    ).toEqual(["b.js: unlock.at 1 is taken in 'start' by a.js"]);
  });

  it('refuses a piloting card off the Flight Computer’s way', () => {
    const card = { id: 'gnat_card', unlock: { by: 'pilot', at: 9 } };
    expect(
      unlockProblems([
        { file: 'src/content/cards/gnat_card.js', field: 'unlock', card },
      ])
    ).toEqual([
      "src/content/cards/gnat_card.js: unlock.by is 'pilot' but the card is not on the Flight Computer's way (its prerequisites, followed down): no run would offer it",
    ]);
  });
});
