// src/services/session/headStart.js
//
// A sector run's head start: before its first layer the ship takes the
// sector's `headStart` card picks, one after another, through the level-up
// queue (several level-ups at once already deal their choices in turn). The
// layer waits, held, until the last pick. "Equip for me" makes the picks
// left in one go, by `chooseHeadStartCard`.

import { UPGRADE_FAMILIES } from '../../data/upgrades/families.js';

const CATEGORY_RANK = { offense: 2, defense: 1 };

/**
 * The automatic pick: never a cursed card while another is offered; a
 * weapon card when offered; else the card of the family the run holds most
 * cards of, a card new to the run first (it counts toward the family's
 * bonus and Apex), offense before defense before the rest; ties keep the
 * offer's order. `familyCounts`: distinct cards held per family. Returns
 * the chosen option's id, or null.
 */
export function chooseHeadStartCard(options = [], familyCounts = {}) {
  const clean = options.filter((option) => !option.cursed);
  const pool = clean.length > 0 ? clean : options;
  const score = (option) => [
    option.tags?.includes('weapon') ? 1 : 0,
    familyCounts[option.family?.id] ?? -1,
    option.currentLevel === 0 ? 1 : 0,
    CATEGORY_RANK[option.category?.id] ?? 0,
  ];
  const better = (a, b) => {
    const [sa, sb] = [score(a), score(b)];
    const i = sa.findIndex((value, k) => value !== sb[k]);
    return i >= 0 && sa[i] > sb[i];
  };
  return (
    pool.reduce(
      (best, option) => (!best || better(option, best) ? option : best),
      null
    )?.id ?? null
  );
}

export class HeadStart {
  /**
   * `eventBus`: listens to 'upgrade-applied' (a pick).
   * `resolveServiceInstance(name)`: a session service by name, or null.
   */
  constructor({ eventBus, resolveServiceInstance }) {
    this.resolveServiceInstance = resolveServiceInstance;
    this.pending = false;
    this.total = 0;
    this.made = 0;
    eventBus.on('upgrade-applied', () => this.handlePick());
  }

  /**
   * Grants `picks` level-ups and holds the waves until they are all picked,
   * along with the `owed` choices of levels already gained (a carried build).
   * Call once the run is running; nothing to pick just clears an earlier
   * head start.
   */
  begin(picks = 0, owed = []) {
    this.pending = picks > 0 || owed.length > 0;
    this.total = picks + owed.length;
    this.made = 0;
    if (!this.pending) return;
    this.resolveServiceInstance('enemies').waveManager.holdWaves();
    const progression = this.resolveServiceInstance('progression');
    progression.queueLevelUpOffers(owed);
    const levels = Array.from({ length: picks }, () =>
      progression.applyLevelUp()
    );
    progression.emitExperienceChanged();
    levels.forEach((level) => progression.emitLevelUp(level));
  }

  /** The pick on screen, { pick, total } (1-based), or null outside a head start. */
  progress() {
    return this.pending ? { pick: this.made + 1, total: this.total } : null;
  }

  /**
   * Makes every pick left, the cards on screen first, each through
   * progression.applyUpgrade as a hand pick is, the next cards dealt
   * unseen; the last pick starts the first layer. Returns the build's
   * families, [{ name, cards }] most cards first ([] outside a head start).
   */
  equipRest() {
    if (!this.pending) return [];
    const progression = this.resolveServiceInstance('progression');
    let options = progression.pendingUpgradeOptions;
    while (this.pending) {
      const id = chooseHeadStartCard(options, progression.getFamilyCounts());
      if (id) progression.applyUpgrade(id);
      if (!this.pending) break;
      const offer = progression.dealNextLevelUpOffer();
      if (!offer) {
        this.finish();
        break;
      }
      options = offer.options;
    }
    return Object.entries(progression.getFamilyCounts())
      .filter(([, cards]) => cards > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, cards]) => ({ name: UPGRADE_FAMILIES[id].name, cards }));
  }

  // The pick that leaves no choice waiting lets the first layer start.
  handlePick() {
    if (!this.pending) return;
    this.made += 1;
    const progression = this.resolveServiceInstance('progression');
    if (progression.pendingLevelUpScreens.length > 0) return;
    this.finish();
  }

  finish() {
    this.pending = false;
    const enemies = this.resolveServiceInstance('enemies');
    enemies.waveManager.resumeWaves();
    if (!enemies.waveManager.waveInProgress) enemies.startNextWave();
  }
}
