import { BaseSystem } from '../core/BaseSystem.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/GameConstants.js';
import { familyForm } from './ui/upgradeCard.js';

const WORLD_SERVICE_MAP = {
  player: 'player',
  enemies: 'enemies',
  physics: 'physics',
  progression: 'progression',
  combat: 'combat',
};

class WorldSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'WorldSystem',
      serviceName: 'world',
      enableRandomManagement: false,
    });

    this.playerAlive = true;
    // Warden id → run time it arrived (its fight starts there).
    this.wardenArrivals = new Map();

    this.resolveCachedServices(WORLD_SERVICE_MAP, { force: true });
  }

  setupEventListeners() {
    this.registerEventListener('player-reset', () => {
      this.resolveCachedServices(WORLD_SERVICE_MAP, { force: true });
    });

    this.registerEventListener('progression-reset', () => {
      this.resolveCachedServices(WORLD_SERVICE_MAP, { force: true });
    });

    this.registerEventListener('physics-reset', () => {
      this.resolveCachedServices(WORLD_SERVICE_MAP, { force: true });
    });

    // The run's timeline (see recordRunEvent).
    this.registerEventListener('synergy-unlocked', ({ family } = {}) =>
      this.recordFamilyForm('evolution', family)
    );
    this.registerEventListener('apex-unlocked', ({ family } = {}) =>
      this.recordFamilyForm('apex', family)
    );
    this.registerEventListener('boss-arrived', ({ enemyId } = {}) => {
      this.wardenArrivals.set(enemyId, this.runClock());
    });
    this.registerEventListener('boss-defeated', ({ enemy } = {}) => {
      const arrived = this.wardenArrivals.get(enemy?.id);
      this.recordRunEvent({
        kind: 'warden',
        name: enemy?.displayName ?? null,
        fight: arrived === undefined ? null : this.runClock() - arrived,
      });
    });
    this.registerEventListener('combo-updated', ({ comboCount } = {}) => {
      const timeline = this.enemies.sessionStats.timeline;
      const best = timeline.find(({ kind }) => kind === 'combo');
      if (best && comboCount <= best.combo) return;
      if (best) timeline.splice(timeline.indexOf(best), 1);
      this.recordRunEvent({ kind: 'combo', combo: comboCount });
    });
  }

  runClock() {
    return this.enemies.sessionStats.timeElapsed;
  }

  /**
   * One moment of the run for the end screens' timeline (ui/runTimeline.js),
   * stamped with the run time and the layer. Kept in the enemies' session
   * stats, which a retry's snapshot carries: weapon evolutions and Apexes
   * (once per family, a retry re-sends them; named by the weapon held then,
   * which a later weapon card does not rename), Warden kills with their fight
   * time from the arrival, the best combo (one entry, at its latest peak)
   * and deaths, in the order they happened.
   */
  recordRunEvent(event) {
    const stats = this.enemies.sessionStats;
    stats.timeline.push({
      ...event,
      time: stats.timeElapsed,
      layer: this.enemies.getWaveState()?.current ?? 1,
    });
  }

  recordFamilyForm(kind, family) {
    const timeline = this.enemies.sessionStats.timeline;
    if (timeline.some((e) => e.kind === kind && e.family === family)) return;
    const { weaponId } = this.combat;
    const { name } = familyForm(family, weaponId, kind === 'apex');
    this.recordRunEvent({ kind, family, weaponId, name });
  }

  getBounds() {
    return { width: GAME_WIDTH, height: GAME_HEIGHT };
  }

  update() {
    // DON'T return early - let game keep running even when player is dead
    // This allows asteroids to keep wandering while player is in death state

    this.resolveCachedServices(WORLD_SERVICE_MAP);

    const player = this.player;
    const enemies = this.enemies;

    if (!player || !enemies) {
      return;
    }

    // Skip collision detection if player is dead or retrying
    if (!this.playerAlive || player.isDead || player.isRetrying) {
      return;
    }

    const physics = this.physics;

    if (physics && typeof physics.processPlayerCollisions === 'function') {
      const collisionSummary = physics.processPlayerCollisions(player, enemies);
      if (collisionSummary?.playerDied) {
        this.handlePlayerDeath();
      }
      return;
    }

    if (
      physics &&
      typeof physics.handlePlayerAsteroidCollision === 'function' &&
      (typeof enemies.forEachActiveEnemy === 'function' ||
        typeof enemies.forEachActiveAsteroid === 'function')
    ) {
      const iterateEnemies =
        typeof enemies.forEachActiveEnemy === 'function'
          ? enemies.forEachActiveEnemy.bind(enemies)
          : enemies.forEachActiveAsteroid.bind(enemies);

      iterateEnemies((asteroid) => {
        if (!this.playerAlive) {
          return;
        }
        const outcome = physics.handlePlayerAsteroidCollision(
          player,
          asteroid,
          enemies
        );
        if (outcome?.playerDied) {
          this.handlePlayerDeath();
        }
      });
      return;
    }

    if (
      physics &&
      typeof physics.handlePlayerAsteroidCollision === 'function' &&
      (typeof enemies.getActiveEnemies === 'function' ||
        typeof enemies.getAsteroids === 'function')
    ) {
      const asteroids =
        typeof enemies.getActiveEnemies === 'function'
          ? enemies.getActiveEnemies()
          : typeof enemies.getAsteroids === 'function'
            ? enemies.getAsteroids()
            : [];
      if (Array.isArray(asteroids)) {
        for (let i = 0; i < asteroids.length; i += 1) {
          if (!this.playerAlive) {
            break;
          }
          const asteroid = asteroids[i];
          const outcome = physics.handlePlayerAsteroidCollision(
            player,
            asteroid,
            enemies
          );
          if (outcome?.playerDied) {
            this.handlePlayerDeath();
            break;
          }
        }
      }
    }
  }

  // Stats shared by the game over and victory screens.
  buildRunSummary() {
    this.resolveCachedServices(WORLD_SERVICE_MAP);
    const progression = this.progression;
    const enemies = this.enemies;

    const stats = enemies
      ? enemies.getSessionStats()
      : { totalKills: 0, timeElapsed: 0, timeline: [] };
    return {
      player: { level: progression ? progression.getLevel() : 1 },
      stats: { ...stats, timeline: [...stats.timeline] },
      wave: enemies ? enemies.getWaveState() : { completedWaves: 0 },
      maxCombo: progression ? progression.getMaxCombo() : 0,
      upgrades: progression
        ? progression.getUpgradeProgressSnapshot().map(({ id, level }) => {
            const definition = progression.upgradeLookup?.get(id) || {};
            return {
              id,
              level,
              name: definition.text?.name || definition.name || id,
            };
          })
        : [],
      synergies: progression?.getSynergySnapshot?.().synergies ?? [],
    };
  }

  handlePlayerDeath() {
    if (!this.playerAlive) return;

    console.log('[WorldSystem] Player died - triggering explosion');

    this.resolveCachedServices(WORLD_SERVICE_MAP);

    const player = this.player;

    // Get player position BEFORE marking as dead
    const playerPosition =
      player && typeof player.getPosition === 'function'
        ? player.getPosition()
        : player
          ? player.position
          : { x: 960, y: 540 }; // Fallback to center

    // Mark player as dead (but keep game running)
    if (player && typeof player.markDead === 'function') {
      player.markDead();
    }

    this.recordRunEvent({
      kind: 'death',
      killer: player?.lastDamageSource ?? null,
    });
    const data = {
      ...this.buildRunSummary(),
      position: playerPosition, // CRITICAL: Add position for explosion!
      killedBy: player?.lastDamageSource ?? null,
    };

    // Emit player-died FIRST so explosion triggers
    this.eventBus?.emit?.('player-died', data);

    // Mark world state as player not alive (but DON'T stop enemies - they keep wandering)
    this.playerAlive = false;

    // DON'T stop enemies - let them keep moving while player is dead/retrying
  }

  reset(options) {
    super.reset(options);
    this.playerAlive = true;
    this.resolveCachedServices(WORLD_SERVICE_MAP, { force: true });
  }
}

export default WorldSystem;
