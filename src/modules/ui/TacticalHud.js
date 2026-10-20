// src/modules/ui/TacticalHud.js
//
// The in-run tactical HUD: mounts the AAA layout over the game field, feeds
// it from the services every frame (vitals, stats, radar, edge arrows, boss
// bar) and pushes the run's events into it (banners, feeds, buffs, radar).

import {
  DEFAULT_HUD_LAYOUT_ID,
  getHudLayoutDefinition,
} from '../../data/ui/hudLayout.js';
import { LAYER_MODIFIERS } from '../../data/layers.js';
import { PICKUP_KINDS } from '../../data/pickups.js';
import { AAAHudLayout, radarGlyph } from './AAAHudLayout.js';

export class TacticalHud {
  /**
   * `refs`: { gameField, gameUi }, where the layout's overlay is looked up.
   * `player()`: the player service (vitals, dash, position), or none.
   * `enemies()`: the enemy service (session stats, wave, active enemies).
   * `progression()`: the progression service (combo, level, XP).
   * `combat()`: the combat service (fire modes, weapon).
   * `physics()`: the physics service (enemies in radar range).
   * `pickups()`: the pickup service (radar blips, edge arrows).
   * `renderer()`: the renderer (edge arrows, the damage arc).
   */
  constructor({
    refs,
    player,
    enemies,
    progression,
    combat,
    physics,
    pickups,
    renderer,
  }) {
    this.refs = refs;
    this.player = player;
    this.enemies = enemies;
    this.progression = progression;
    this.combat = combat;
    this.physics = physics;
    this.pickups = pickups;
    this.renderer = renderer;
    // The mounted AAAHudLayout; transmissions, cinematics and onboarding
    // draw on it too.
    this.layout = null;
    this.definition = getHudLayoutDefinition(DEFAULT_HUD_LAYOUT_ID);
    this.cachedValues = { boss: { visible: false } };
    this.bossHudState = this.createInitialBossHudState();
  }

  activateAAATacticalHud() {
    if (this.layout) {
      return;
    }

    const mountTarget = this.resolveAAATacticalMountTarget();
    if (!mountTarget) {
      console.warn('[TacticalHud] AAA tactical HUD mount target not found.');
      return;
    }

    mountTarget.style.padding = '0px';

    this.layout = new AAAHudLayout();
    this.layout.mount(mountTarget);
  }

  resolveAAATacticalMountTarget() {
    const gameField = this.refs.gameField;
    if (gameField && typeof gameField.querySelector === 'function') {
      const overlay = gameField.querySelector('.game-field__overlay');
      if (overlay instanceof HTMLElement) {
        return overlay;
      }
    }

    const gameUi = this.refs.gameUi;
    if (gameUi && typeof gameUi.querySelector === 'function') {
      const overlay = gameUi.querySelector('.game-field__overlay');
      if (overlay instanceof HTMLElement) {
        return overlay;
      }
    }

    return null;
  }

  /** The per-frame refresh and the buff timers. */
  update(deltaTime) {
    if (!this.layout) {
      return;
    }
    this.updateAAATacticalHudFromServices({ force: false });
    this.layout.tickBuffs(deltaTime);
  }

  formatAAATacticalClock(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    const pad = (value) => `${Math.max(0, value)}`.padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(remainder)}`;
  }

  updateAAATacticalHudFromServices(options = {}) {
    const hud = this.layout;
    if (!hud) {
      return;
    }

    const force = Boolean(options.force);

    const player = this.player();
    const enemies = this.enemies();
    const progression = this.progression();

    const playerPosition =
      player && typeof player.getPosition === 'function'
        ? player.getPosition()
        : player?.position && typeof player.position === 'object'
          ? { x: player.position.x ?? 0, y: player.position.y ?? 0 }
          : { x: 0, y: 0 };

    if (player || force) {
      const hull = Number(player?.health ?? 0) || 0;
      const maxHull = Number(player?.maxHealth ?? 0) || 0;

      let shield = 0;
      let maxShield = 0;

      if (player && typeof player.getShieldState === 'function') {
        const shieldState = player.getShieldState() || {};
        shield =
          Number(shieldState.currentHP ?? shieldState.currentHits ?? 0) || 0;
        maxShield = Number(shieldState.maxHP ?? shieldState.maxHits ?? 0) || 0;
      } else {
        shield = Number(player?.shieldHP ?? 0) || 0;
        maxShield = Number(player?.shieldMaxHP ?? 0) || 0;
      }

      hud.updateVitals(shield, maxShield, hull, maxHull);
      if (player) {
        hud.updateDashCooldown(player.getDashCooldownFraction());
      }
    }

    if (enemies && typeof enemies.getSessionStats === 'function') {
      const session = enemies.getSessionStats() || {};
      const timeElapsed =
        session.timeElapsed ?? session.sessionTimeSeconds ?? 0;
      const totalKills = session.totalKills ?? session.kills ?? 0;

      hud.updateStats(
        this.formatAAATacticalClock(timeElapsed),
        totalKills,
        undefined
      );
    }

    if (progression && typeof progression.getComboState === 'function') {
      const comboState = progression.getComboState() || {};
      const comboCount = Number(comboState.comboCount ?? 0) || 0;
      hud.updateStats(null, undefined, comboCount, comboState.multiplier);
    }

    // Plan 01.07 Task 5/6 — render combat mode indicators from CombatSystem
    // state. Single source of truth: CombatSystem.getSpreadMode() / .getAimMode().
    const combat = this.combat();
    if (combat && typeof hud.updateModeIndicators === 'function') {
      const spreadMode =
        typeof combat.getSpreadMode === 'function'
          ? combat.getSpreadMode()
          : 'concentrated';
      const aimMode =
        typeof combat.getAimMode === 'function' ? combat.getAimMode() : 'auto';
      hud.updateModeIndicators(spreadMode, aimMode);
      hud.updateWeapon(combat.getWeaponState());
    }

    const waveState =
      enemies && typeof enemies.getWaveState === 'function'
        ? enemies.getWaveState() || null
        : null;

    if (progression) {
      const level =
        typeof progression.getLevel === 'function'
          ? progression.getLevel()
          : Number(progression.level ?? 1) || 1;
      const xp =
        typeof progression.getExperience === 'function'
          ? progression.getExperience()
          : null;

      hud.updateExperience(
        level,
        xp?.current ?? 0,
        xp?.needed ?? 1,
        waveState?.current ?? 1
      );
    }

    if (typeof hud.updateNextWaveTimer === 'function') {
      const isActive = waveState ? Boolean(waveState.isActive ?? true) : true;
      const breakTimerRaw =
        waveState?.breakTimer ?? waveState?.breakTimerSeconds ?? 0;
      const breakSeconds = !isActive
        ? Math.max(0, Math.ceil(Number(breakTimerRaw) || 0))
        : 0;
      hud.updateNextWaveTimer(breakSeconds);
    }

    const physics = this.physics();
    if (
      (physics && typeof physics.getNearbyEnemies === 'function' && player) ||
      (enemies && typeof enemies.getActiveEnemies === 'function' && player)
    ) {
      const pluginConfig = this.definition?.plugin || {};
      const radarRange = Math.max(
        1,
        (Number(pluginConfig.radarRange) || 1500) * hud.radarRangeFactor
      );

      let radarEnemies = [];
      if (physics && typeof physics.getNearbyEnemies === 'function') {
        try {
          // A phased Shade still shows on the radar, dimmed.
          radarEnemies = physics.getNearbyEnemies(
            Number(playerPosition.x) || 0,
            Number(playerPosition.y) || 0,
            radarRange,
            { includeIntangible: true }
          );
        } catch (error) {
          radarEnemies = [];
        }
      } else if (enemies && typeof enemies.getActiveEnemies === 'function') {
        radarEnemies = enemies.getActiveEnemies() || [];
      }

      const blips = [];
      const originX = Number(playerPosition.x) || 0;
      const originY = Number(playerPosition.y) || 0;
      const limit = 80;

      for (let index = 0; index < radarEnemies.length; index += 1) {
        if (blips.length >= limit) {
          break;
        }

        const enemy = radarEnemies[index];
        if (!enemy) {
          continue;
        }

        const enemyX = Number(enemy?.position?.x ?? enemy?.x ?? 0);
        const enemyY = Number(enemy?.position?.y ?? enemy?.y ?? 0);
        if (!Number.isFinite(enemyX) || !Number.isFinite(enemyY)) {
          continue;
        }

        const dx = enemyX - originX;
        const dy = enemyY - originY;
        const distance = Math.hypot(dx, dy);
        if (!Number.isFinite(distance) || distance > radarRange) {
          continue;
        }

        blips.push({
          x: dx / radarRange,
          y: dy / radarRange,
          type: radarGlyph(enemy),
          phased: Boolean(enemy.intangible),
        });
      }

      const pickups = this.pickups()?.getActivePickups() || [];
      for (let i = 0; i < pickups.length && blips.length < limit; i += 1) {
        const dx = pickups[i].x - originX;
        const dy = pickups[i].y - originY;
        if (Math.hypot(dx, dy) <= radarRange) {
          blips.push({
            x: dx / radarRange,
            y: dy / radarRange,
            type: 'pickup',
          });
        }
      }

      hud.updateRadar(blips);
    }

    // Off-screen arrows (Wardens, Heralds, then pickups) and the Herald's bar.
    const renderer = this.renderer();
    const arrowTargets = [];
    let herald = null;
    if (renderer && player && enemies) {
      const toTarget = (kind, entity, color, labelled) => {
        const point = renderer.worldToScreen(entity.x, entity.y);
        if (!point) return;
        arrowTargets.push({
          kind,
          x: point.x,
          y: point.y,
          color,
          distance: labelled
            ? Math.hypot(
                entity.x - playerPosition.x,
                entity.y - playerPosition.y
              )
            : undefined,
        });
      };
      const active = enemies.getActiveEnemies();
      for (let i = 0; i < active.length; i += 1) {
        const enemy = active[i];
        if (enemy.type === 'boss') toTarget('warden', enemy, null, true);
        if (enemy.type === 'herald') {
          toTarget('herald', enemy, null, true);
          herald = herald || enemy;
        }
      }
      const pickups = this.pickups()?.getActivePickups() || [];
      for (let i = 0; i < pickups.length; i += 1) {
        toTarget('pickup', pickups[i], pickups[i].color, false);
      }
    }
    hud.updateEdgeArrows(arrowTargets);

    const bossState = this.getBossHudState();
    const cachedBossVisible = Boolean(this.cachedValues.boss?.visible);
    const bossActive =
      cachedBossVisible ||
      Boolean(bossState.active) ||
      Boolean(bossState.upcoming);

    if (!bossActive && herald) {
      hud.updateBoss(
        true,
        herald.displayName,
        Math.max(0, Math.min(100, (herald.health / herald.maxHealth) * 100)),
        {
          phase: 0,
          phaseCount: 1,
          herald: true,
          invulnerable: Boolean(herald.invulnerable),
        }
      );
    } else if (!bossActive) {
      hud.updateBoss(false);
    } else {
      const bossName = bossState.name || 'BOSS';
      const maxHealth = Number(bossState.maxHealth ?? 0) || 0;
      const currentHealth = Number(bossState.health ?? 0) || 0;
      const percent =
        maxHealth > 0
          ? Math.max(0, Math.min(100, (currentHealth / maxHealth) * 100))
          : 100;
      const phaseInfo = {
        phase: bossState.phase ?? 0,
        phaseCount: bossState.phaseCount ?? 1,
        phaseColors: bossState.phaseColors || [],
        invulnerable: Boolean(bossState.invulnerable),
      };
      hud.updateBoss(true, bossName, percent, phaseInfo);
    }
  }

  refreshHudFromServices(force = false) {
    this.updateAAATacticalHudFromServices({ force });
  }

  createInitialBossHudState() {
    return {
      active: false,
      upcoming: false,
      defeated: false,
      bossId: null,
      name: null,
      health: 0,
      maxHealth: 0,
      phase: 0,
      phaseCount: 0,
      phaseColors: [],
      invulnerable: false,
    };
  }

  getBossHudState() {
    const state =
      this.bossHudState && typeof this.bossHudState === 'object'
        ? this.bossHudState
        : this.createInitialBossHudState();

    return {
      ...this.createInitialBossHudState(),
      ...state,
      phaseColors: Array.isArray(state.phaseColors)
        ? [...state.phaseColors]
        : [],
    };
  }

  handleBossEvent(eventName, data = {}) {
    if (!eventName) {
      return this.getBossHudState();
    }

    const current = this.getBossHudState();
    const next = {
      ...current,
      ...data,
      phaseColors: Array.isArray(data?.phaseColors)
        ? [...data.phaseColors]
        : current.phaseColors,
    };

    switch (eventName) {
      case 'boss-wave-started':
        this.layout?.holdBossBar();
        next.active = false;
        next.upcoming = true;
        next.defeated = false;
        next.health = 0;
        next.maxHealth = Number(data?.maxHealth ?? next.maxHealth ?? 0) || 0;
        break;
      case 'boss-spawned':
        if (!current.active) {
          this.layout?.showBossIntro(
            data?.enemy?.displayName,
            data?.enemy?.subtitle
          );
        }
        next.active = true;
        next.upcoming = false;
        next.defeated = false;
        break;
      case 'boss-phase-changed':
      case 'boss-invulnerability-changed':
        next.active = true;
        next.upcoming = false;
        next.defeated = false;
        break;
      case 'boss-defeated':
        next.active = false;
        next.upcoming = false;
        next.defeated = true;
        next.health = 0;
        next.invulnerable = false;
        break;
      case 'boss-hud-update':
      default:
        break;
    }

    next.phase = Math.max(0, Math.floor(Number(next.phase ?? 0) || 0));
    next.phaseCount = Math.max(
      next.phase + 1,
      Math.floor(Number(next.phaseCount ?? 0) || 0)
    );
    next.health = Math.max(0, Number(next.health ?? 0) || 0);
    next.maxHealth = Math.max(
      next.health,
      Number(next.maxHealth ?? next.health ?? 0) || 0
    );
    next.wave = Number.isFinite(Number(next.wave))
      ? Math.max(1, Math.floor(Number(next.wave)))
      : null;
    next.invulnerable = Boolean(next.invulnerable);
    next.name =
      typeof next.name === 'string' && next.name.trim() ? next.name : 'BOSS';

    this.bossHudState = next;
    this.cachedValues.boss = {
      ...(this.cachedValues.boss || {}),
      visible: Boolean(next.active || next.upcoming || next.defeated),
    };

    this.updateAAATacticalHudFromServices({ force: true });
    return this.getBossHudState();
  }

  handleWaveCompletionEvent(payload = {}) {
    const state = this.getBossHudState();
    const completedWave = Number.isFinite(Number(payload?.wave))
      ? Math.max(1, Math.floor(Number(payload.wave)))
      : null;
    const hasBossContext =
      Boolean(this.cachedValues.boss?.visible) ||
      Boolean(state.bossId) ||
      Boolean(state.defeated);
    const waveMatches =
      completedWave === null ||
      state.wave === null ||
      state.wave === completedWave;

    if (!hasBossContext || !waveMatches) {
      return;
    }

    if (state.active || state.upcoming) {
      return;
    }

    this.bossHudState = this.createInitialBossHudState();
    this.cachedValues.boss = { visible: false };
    this.updateAAATacticalHudFromServices({ force: true });
  }

  onSurgeStarted(payload = {}) {
    this.layout?.showSurgeBanner(payload.label);
  }

  onFieldEventStarted(payload = {}) {
    this.layout?.showFieldEventBanner(payload.label);
    if (payload.kind === 'sensor-jam') {
      this.layout?.setRadarJammed(true);
    }
  }

  onFieldEventEnded(payload = {}) {
    if (payload.kind === 'sensor-jam') {
      this.layout?.setRadarJammed(false);
    }
  }

  // A layer modifier's banner follows the LAYER one; Dense Fog shortens
  // the radar until the layer ends.
  onLayerModifierStarted(payload = {}) {
    this.layout?.showModifierBanner(payload.label, payload.color);
    if (payload.id === 'dense-fog') {
      this.layout?.setRadarRange(LAYER_MODIFIERS['dense-fog'].radarRange);
    }
  }

  onLayerModifierEnded(payload = {}) {
    if (payload.id === 'dense-fog') this.layout?.setRadarRange(1);
  }

  /** A new run: radar and aim stick back to normal, no buffs left. */
  onGameStarted() {
    this.layout?.setRadarJammed(false);
    this.layout?.setRadarRange(1);
    this.layout?.setAimStick(false);
    this.layout?.clearBuffs();
  }

  onAimStickChanged({ active } = {}) {
    this.layout?.setAimStick(active);
  }

  onPlayerTookDamage({ playerPosition, damageSource } = {}) {
    const renderer = this.renderer();
    if (!playerPosition || !damageSource || !renderer) return;
    this.layout?.showDamageFrom(
      renderer.worldToScreen(playerPosition.x, playerPosition.y),
      renderer.worldToScreen(damageSource.x, damageSource.y)
    );
  }

  onEnemyDestroyed(payload = {}) {
    if (payload.source?.cause === 'mine-detonation') return;
    this.layout?.addKillFeed(
      payload.enemy?.type,
      payload.enemy?.elite,
      payload.enemy?.displayName
    );
  }

  onXpOrbCollected(payload = {}) {
    this.layout?.addXpFeed(Number(payload.value));
  }

  onPickupCollected({ kind } = {}) {
    const pickup = PICKUP_KINDS[kind];
    this.layout?.addPickupFeed(pickup.label, pickup.detail, pickup.color);
    if (pickup.duration) {
      this.layout?.startBuff(kind, pickup.label, pickup.duration, pickup.color);
    }
  }

  // A chest's cards (collectibles/chests.js): the CHEST banner with the
  // first, then a feed line each.
  onChestCard({ index, total, name, detail, color } = {}) {
    if (index === 0) {
      this.layout?.showChestBanner(
        `${total} ${total === 1 ? 'CARD' : 'CARDS'}`
      );
    }
    this.layout?.addPickupFeed(name, detail, color);
  }

  onAchievementUnlocked({ title } = {}) {
    this.layout?.addAchievementFeed(title);
  }

  onWeaponBeamFired() {
    this.layout?.flashBeam();
  }
}
