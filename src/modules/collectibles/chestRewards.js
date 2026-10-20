// src/modules/collectibles/chestRewards.js
//
// The cards a chest grants (chests.js), one at a time, each drawn after the
// one before it was applied: a rank-up of a card the run owns that has
// ranks left; none → a new card of a family the run owns; none → any card a
// level-up could offer. Each draw weighs cards the way the level-up offers
// do (UpgradeSystem.getDrawWeight: rarity and family steering). Weapon cards
// (they swap the weapon) and cursed ones (a real cost) stay choices the
// pilot makes on a level-up.

import { PALETTE } from '../../data/constants/palette.js';
import { UPGRADE_FAMILIES } from '../../data/upgrades/families.js';
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

/** The feed line of a card a chest has just applied. */
export function describeChestCard(progression, card) {
  const rank = progression.getUpgradeCount(card.id);
  return {
    id: card.id,
    name: card.text?.name || card.name || card.id,
    detail: rank > 1 ? `RANK ${rank}` : 'NEW',
    color: UPGRADE_FAMILIES[card.family]?.color ?? PALETTE.shot,
  };
}
