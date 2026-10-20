// src/modules/collectibles/chestRewards.js
//
// The cards a chest grants (chests.js), one at a time, each drawn after the
// one before it was applied: a rank-up of a card the run owns that has
// ranks left; none → a new card of a family the run owns; none → any card a
// level-up could offer. Each draw weighs cards the way the level-up offers
// do (UpgradeSystem.getDrawWeight: rarity and family steering). Weapon cards
// (they swap the weapon) and cursed ones (a real cost) stay choices the
// pilot makes on a level-up.

import { WEAPON_CARD_IDS } from '../../data/upgrades/index.js';

/** The card definition a chest grants next, or null when none is left. */
export function pickChestCard(progression, random) {
  const eligible = progression
    .getEligibleUpgradeDefinitions()
    .filter(({ id, cursed }) => !cursed && !WEAPON_CARD_IDS.includes(id));
  const owned = ({ id }) => progression.getUpgradeCount(id) > 0;
  const families = progression.getFamilyCounts();
  const rankUps = eligible.filter(owned);
  const kin = eligible.filter((card) => !owned(card) && families[card.family]);
  const pool = rankUps.length ? rankUps : kin.length ? kin : eligible;
  if (!pool.length) return null;
  return random.weightedPick(
    pool.map((value) => ({ value, weight: progression.getDrawWeight(value) }))
  );
}
