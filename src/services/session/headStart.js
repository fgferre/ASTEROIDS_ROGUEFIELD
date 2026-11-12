// src/services/session/headStart.js
//
// A sector run's head start: before its first layer the ship takes the
// sector's `headStart` card picks, one after another, through the level-up
// queue (several level-ups at once already deal their choices in turn). The
// layer waits, held, until the last pick.

export class HeadStart {
  /**
   * `eventBus`: listens to 'upgrade-applied' (a pick).
   * `resolveServiceInstance(name)`: a session service by name, or null.
   */
  constructor({ eventBus, resolveServiceInstance }) {
    this.resolveServiceInstance = resolveServiceInstance;
    this.pending = false;
    eventBus.on('upgrade-applied', () => this.handlePick());
  }

  /**
   * Grants `picks` level-ups and holds the waves until they are all picked.
   * Call once the run is running; 0 picks just clears an earlier head start.
   */
  begin(picks = 0) {
    this.pending = picks > 0;
    if (!this.pending) return;
    this.resolveServiceInstance('enemies').waveManager.holdWaves();
    const progression = this.resolveServiceInstance('progression');
    const levels = Array.from({ length: picks }, () =>
      progression.applyLevelUp()
    );
    progression.emitExperienceChanged();
    levels.forEach((level) => progression.emitLevelUp(level));
  }

  // The pick that leaves no choice waiting lets the first layer start.
  handlePick() {
    const progression = this.resolveServiceInstance('progression');
    if (!this.pending || progression.pendingLevelUpScreens.length > 0) return;
    this.pending = false;
    const enemies = this.resolveServiceInstance('enemies');
    enemies.waveManager.resumeWaves();
    if (!enemies.waveManager.waveInProgress) enemies.startNextWave();
  }
}
