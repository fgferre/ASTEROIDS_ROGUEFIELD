/**
 * Layer events
 *
 * A layer's field events (Sensor Jam, Gravity Well, Solar Flare) and its
 * modifier (Hunters' Moon, Glass Field, Magnetic Storm): each starts, plays
 * and ends, announced on the event bus.
 */

import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { resolveService } from '../../../core/serviceUtils.js';
import { clamp } from '../../../utils/mathHelpers.js';
import { FIELD_EVENTS, LAYER_MODIFIERS } from '../../../data/layers.js';
import { PALETTE, withAlpha } from '../../../data/constants/palette.js';

// Field events: a Gravity Well point stays this far inside the field; the
// Solar Flare screen flash (color alpha, seconds, intensity). Proposta 18/10.
const GRAVITY_WELL_INSET = 40;
const SOLAR_FLARE_FLASH = { alpha: 0.5, duration: 0.6, intensity: 0.45 };

export class LayerEvents {
  /**
   * @param {Object} kit
   * @param {Object} kit.eventBus - Announces each start and end
   * @param {Object} kit.enemySystem - The ship, the enemies, XP sparks, effects
   * @param {Object} kit.waveRandom - The wave's random scopes (WaveRandom)
   * @param {Function} kit.getLayer - The layer in progress (currentWave)
   */
  constructor({ eventBus, enemySystem, waveRandom, getLayer }) {
    this.eventBus = eventBus;
    this.enemySystem = enemySystem;
    this.waveRandom = waveRandom;
    this.getLayer = getLayer;
    this.activeFieldEvents = [];
    // The layer's modifier id (LAYER_MODIFIERS) while it plays, else null.
    this.layerModifier = null;
  }

  /**
   * Starts a field event: applies its gameplay effect and emits
   * 'field-event-started' {layer, kind, label, duration, x, y}; (x, y) is the
   * Gravity Well point, else the ship. 'field-event-ended' {kind} follows
   * `duration` seconds later (or when the layer ends).
   */
  startFieldEvent({ kind, label }) {
    const { duration } = FIELD_EVENTS[kind];
    const player = this.enemySystem.getPlayerPositionSnapshot(
      this.enemySystem.getCachedPlayer()
    );
    let point = player ? { x: player.x, y: player.y } : { x: 0, y: 0 };

    if (kind === 'gravity-well') {
      point = this.pickGravityWellPoint(point);
      const { pullSpeed, pullAcceleration } = FIELD_EVENTS[kind];
      this.enemySystem
        .getCachedXPOrbs?.()
        ?.startGlobalPull(duration, pullSpeed, pullAcceleration, 1, point);
    } else if (kind === 'solar-flare') {
      // A phased Shade (`intangible`) is out of reach of the flare.
      this.enemySystem.forEachActiveEnemy?.((enemy) => {
        if (!enemy.intangible) enemy.stunTimer = duration;
      });
      this.enemySystem
        .getCachedEffects?.()
        ?.addScreenFlash(
          withAlpha(PALETTE.xp, SOLAR_FLARE_FLASH.alpha),
          SOLAR_FLARE_FLASH.duration,
          SOLAR_FLARE_FLASH.intensity
        );
    }

    this.activeFieldEvents.push({ kind, remaining: duration });
    this.eventBus.emit('field-event-started', {
      layer: this.getLayer(),
      kind,
      label,
      duration,
      x: point.x,
      y: point.y,
    });
  }

  /**
   * Hunters' Moon: the roster keeps only its kinds, each count scaled;
   * surges keep their size, spawning only those kinds.
   */
  applyHuntersMoon(director) {
    if (director.modifier !== 'hunters-moon') return director;
    const { kinds, countScale } = LAYER_MODIFIERS['hunters-moon'];
    return {
      ...director,
      roster: director.roster
        .filter((entry) => kinds.includes(entry.kind))
        .map((entry) => ({
          ...entry,
          count: Math.round(entry.count * countScale),
        })),
      surges: director.surges
        .map((surge) => ({
          ...surge,
          kinds: surge.kinds.filter((kind) => kinds.includes(kind)),
        }))
        .filter((surge) => surge.kinds.length > 0),
    };
  }

  /**
   * Starts the layer's modifier and emits 'layer-modifier-started'
   * {layer, id, label, color}; 'layer-modifier-ended' {id} follows when the
   * layer ends. Glass Field is read on rock spawn (layerModifier); Magnetic
   * Storm sets the XP sparks drifting, seeded by run and layer.
   */
  startLayerModifier(id) {
    const { label, color } = LAYER_MODIFIERS[id];
    this.layerModifier = id;
    if (id === 'magnetic-storm') {
      const runSeed =
        resolveService(
          'difficulty',
          this.enemySystem.dependencies
        )?.getRunSeed() ?? 0;
      this.enemySystem
        .getCachedXPOrbs?.()
        ?.setDrift(
          LAYER_MODIFIERS[id],
          new RandomService(`magnetic-storm:${runSeed}:${this.getLayer()}`)
        );
    }
    this.eventBus.emit('layer-modifier-started', {
      layer: this.getLayer(),
      id,
      label,
      color,
    });
  }

  /** Ends the layer's modifier, if any (layer over, run reset). */
  endLayerModifier() {
    const id = this.layerModifier;
    if (!id) return;
    this.layerModifier = null;
    if (id === 'magnetic-storm') {
      this.enemySystem.getCachedXPOrbs?.()?.setDrift(null);
    }
    this.eventBus.emit('layer-modifier-ended', { id });
  }

  /** A point at a seeded angle and distance from the ship, inside the field. */
  pickGravityWellPoint(origin) {
    const { minDistance, maxDistance } = FIELD_EVENTS['gravity-well'];
    const { random } = this.waveRandom.createScopedRandom(
      'spawn',
      'gravity-well'
    );
    const angle = random.range(0, Math.PI * 2);
    const distance = random.range(minDistance, maxDistance);
    const bounds = this.enemySystem.getCachedWorld?.()?.getBounds?.() || {
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    };
    return {
      x: clamp(
        origin.x + Math.cos(angle) * distance,
        GRAVITY_WELL_INSET,
        bounds.width - GRAVITY_WELL_INSET
      ),
      y: clamp(
        origin.y + Math.sin(angle) * distance,
        GRAVITY_WELL_INSET,
        bounds.height - GRAVITY_WELL_INSET
      ),
    };
  }

  /** Counts active field events down on the layer's own time. */
  updateFieldEvents(deltaTime) {
    for (const event of this.activeFieldEvents) {
      event.remaining -= deltaTime;
    }
    const ended = this.activeFieldEvents.filter((e) => e.remaining <= 0);
    if (ended.length === 0) return;
    this.activeFieldEvents = this.activeFieldEvents.filter(
      (e) => e.remaining > 0
    );
    for (const { kind } of ended) {
      this.eventBus.emit('field-event-ended', { kind });
    }
  }

  /** Ends every active field event at once (layer over, run reset). */
  endFieldEvents() {
    const ended = this.activeFieldEvents;
    this.activeFieldEvents = [];
    for (const { kind } of ended) {
      this.eventBus.emit('field-event-ended', { kind });
    }
  }
}
