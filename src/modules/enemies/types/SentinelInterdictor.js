import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { BOSS_KINDS, wardenComponents } from '../../../data/enemies/boss.js';
import { driftToCentre } from '../boss/drift.js';
import { SHIP_REACH } from '../boss/playerTarget.js';
import { BossEnemy } from './BossEnemy.js';
import { distanceToSegment, segmentToEdge } from './SentinelPrismCrown.js';

const INTERDICTOR = BOSS_KINDS.interdictor;
const SIDES = 4;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The four sides of the square of side `size` centred on (x, y), clockwise
 * on the field (y down) from the top: 0 top, 1 right, 2 bottom, 3 left. Each
 * runs so that its left-hand normal (-uy, ux) points into the square.
 */
export function cageSides(x, y, size) {
  const h = size / 2;
  const corners = [
    { x: x - h, y: y - h },
    { x: x + h, y: y - h },
    { x: x + h, y: y + h },
    { x: x - h, y: y + h },
  ];
  return corners.map((a, i) => {
    const b = corners[(i + 1) % SIDES];
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}

// Sentinel Interdictor (src/content/bosses/interdictor.js), one loop:
//   drift — it steers toward mid-field, the cage down;
//   grid  — it stops; a square cage of `cycle.size` px is drawn round the
//           ship (kept inside the field), one side open: the side farthest
//           from it the first time, then the next one clockwise each cycle.
//           The cage warns `grid.warn` s, holds solid `cycle.solid` s (closing
//           in round its centre to `grid.close` of its side over
//           `grid.closeTime` s), fades
//           `grid.fade` s; solid, a fence hurts and pushes the ship back
//           (rocks, enemies and bullets ignore it). From the warning on it
//           fires `cycle.beams` locked beams one after another, `lock.gap`
//           s apart: each aims at the ship for `cycle.aim` s, freezes for
//           `lock.freeze` s, then burns along the frozen line to the field's
//           edge for `lock.burn` s (a tick every `burnTick` s while the
//           ship's centre is within `width / 2` of it);
//   rest  — cage and beams gone, the vents open: full damage, for
//           `cycle.rest` s; then the drift again.
// Outside the rest its shell lets `shellDamageFactor` in.
// What the view reads:
//   ventOpen — 0..1, the vents open (1) or shut (0);
//   mastRise — 0..1, the emitter mast raised (1) or down (entrance);
//   aimAngle — radians, where its emitter points;
//   grid     — null or { type: 'grid', x, y (its centre), size (now), full
//              (as drawn), open (0..3,
//              the open side: 0 top, 1 right, 2 bottom, 3 left), fences:
//              [{ x1, y1, x2, y2 }] (the three closed sides), posts: [{ x, y
//              }] (the four corners), solid 0..1, phase 'warn'|'solid'|
//              'fade', timer, duration };
//   lock     — null or { type: 'lock', x, y (its start), angle, x2, y2 (where
//              it meets the field's edge), phase 'aim'|'freeze'|'burn', timer,
//              duration, width }.
export class SentinelInterdictor extends BossEnemy {
  initialize(config = {}) {
    super.initialize({
      ...config,
      displayName: INTERDICTOR.displayName,
      healthFactor: INTERDICTOR.healthFactor,
      radius: INTERDICTOR.radius,
      rewards: INTERDICTOR.rewards,
      phaseThresholds: INTERDICTOR.phaseThresholds,
      phaseCount: INTERDICTOR.phaseCount,
      invulnerabilityDuration: INTERDICTOR.invulnerabilityDuration,
      components: config.components ?? wardenComponents('interdictor'),
    });
    this.bossKind = 'interdictor';
    this.tier = INTERDICTOR.tier;
    this.subtitle = INTERDICTOR.subtitle;
    this.movementStrategy = 'linear';
    this.aimAngle = Math.atan2(
      GAME_HEIGHT / 2 - this.y,
      GAME_WIDTH / 2 - this.x
    );
    this.gridTimer = this.cycle().drift;
    return this;
  }

  resetForPool() {
    super.resetForPool();
    this.gridState = 'drift';
    this.gridTimer = 0;
    this.ventOpen = 0;
    this.mastRise = 1;
    this.aimAngle = 0;
    this.grid = null;
    this.lock = null;
    this.openSide = null;
    this.locksLeft = 0;
    this.lockGap = 0;
    this.lockAim = 0;
    this.burnTimer = 0;
  }

  cycle() {
    return INTERDICTOR.cycle[
      Math.min(this.currentPhase, INTERDICTOR.cycle.length - 1)
    ];
  }

  get resting() {
    return this.gridState === 'rest';
  }

  // Not resting, the shell soaks most of a hit and rings dull (the Bulwark's
  // clang); resting, all of it lands.
  takeDamage(amount, source = null) {
    if (this.resting) return super.takeDamage(amount, source);
    if (amount > 0 && !this.invulnerable && !this.intangible) {
      const at = source?.hitPosition ?? { x: this.x, y: this.y };
      this.getEventBus()?.emit?.('bulwark-plate-hit', {
        enemy: this,
        enemyId: this.id,
        position: { x: at.x, y: at.y },
      });
    }
    return super.takeDamage(amount * INTERDICTOR.shellDamageFactor, source);
  }

  // The phase step restores the phase movement; it always steers itself.
  advancePhase() {
    super.advancePhase();
    this.movementStrategy = 'linear';
  }

  // On the entrance its mast is down, rising as it stops.
  poseArrival(open) {
    this.mastRise = 1 - open;
  }

  handlePhaseIntro(deltaTime, target) {
    this.updateInterdictor(deltaTime, target);
  }

  handlePhaseAssault(deltaTime, target) {
    this.updateInterdictor(deltaTime, target);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateInterdictor(deltaTime, target);
  }

  updateInterdictor(deltaTime, target) {
    const position = target?.position ?? null;
    const cycle = this.cycle();
    this.gridTimer -= deltaTime;
    switch (this.gridState) {
      case 'grid':
        this.holdStill();
        this.updateLocks(deltaTime, position);
        if (!this.grid && !this.lock && this.locksLeft <= 0) {
          this.gridState = 'rest';
          this.gridTimer = cycle.rest;
        }
        break;
      case 'rest':
        this.holdStill();
        if (this.gridTimer <= 0) {
          this.gridState = 'drift';
          this.gridTimer = cycle.drift;
        }
        break;
      default:
        driftToCentre(this, deltaTime, INTERDICTOR.drift);
        if (this.gridTimer <= 0 && position) this.beginGrid(cycle, position);
        break;
    }
    const step = INTERDICTOR.ventSpeed * deltaTime;
    const goal = this.resting ? 1 : 0;
    this.ventOpen += Math.max(-step, Math.min(step, goal - this.ventOpen));
    this.updateGrid(deltaTime, target);
    this.burn(deltaTime, target);
  }

  // Its beams start where it stands: it stays put while the cage is up.
  holdStill() {
    this.movementStrategy = 'linear';
    this.vx = 0;
    this.vy = 0;
  }

  // GRID: the square round the ship, inside the field; the open side is the
  // one farthest from it the first time, then the next one clockwise.
  beginGrid(cycle, ship) {
    const { size } = cycle;
    const x = clamp(ship.x, size / 2, GAME_WIDTH - size / 2);
    const y = clamp(ship.y, size / 2, GAME_HEIGHT - size / 2);
    const sides = cageSides(x, y, size);
    if (this.openSide === null) {
      let far = -1;
      sides.forEach((s, i) => {
        const mid = Math.hypot(
          (s.x1 + s.x2) / 2 - this.x,
          (s.y1 + s.y2) / 2 - this.y
        );
        if (mid > far) {
          far = mid;
          this.openSide = i;
        }
      });
    } else {
      this.openSide = (this.openSide + 1) % SIDES;
    }
    const { warn } = INTERDICTOR.grid;
    this.gridState = 'grid';
    this.grid = {
      type: 'grid',
      x,
      y,
      size,
      full: size,
      // with its own body inside the cage, closing would press the ship
      // onto it (12/11, a pilot died that way): that cage stands still
      closes:
        Math.max(Math.abs(this.x - x), Math.abs(this.y - y)) >=
        size / 2 + this.radius,
      open: this.openSide,
      fences: sides.filter((_, i) => i !== this.openSide),
      posts: sides.map((s) => ({ x: s.x1, y: s.y1 })),
      solid: 0,
      phase: 'warn',
      hold: cycle.solid,
      timer: warn,
      duration: warn,
    };
    this.locksLeft = cycle.beams;
    this.lockAim = cycle.aim;
    this.lockGap = 0;
  }

  // The cage's own clock: warn → solid (hold) → fade → gone. Solid, a fence
  // hurts and pushes the ship back.
  updateGrid(deltaTime, target) {
    const g = this.grid;
    if (!g) return;
    g.timer -= deltaTime;
    if (g.phase === 'warn' && g.timer <= 0) {
      g.phase = 'solid';
      g.solid = 1;
      g.timer = g.duration = g.hold;
    } else if (g.phase === 'solid' && g.timer <= 0) {
      g.phase = 'fade';
      g.timer = g.duration = INTERDICTOR.grid.fade;
    } else if (g.phase === 'fade') {
      g.solid = Math.max(0, g.timer / g.duration);
      if (g.timer <= 0) {
        this.grid = null;
        return;
      }
    }
    if (g.phase === 'solid') {
      if (g.closes) this.closeCage(g);
      this.pressFences(target);
    }
  }

  // Solid, the quarantine closes in round its centre, from `full` down to
  // `grid.close` of it in `grid.closeTime` s, then holds; the open side
  // stays open.
  // A cage drawn round its own body does not close.
  closeCage(g) {
    const progress = clamp(
      (g.duration - g.timer) / INTERDICTOR.grid.closeTime,
      0,
      1
    );
    g.size = g.full * (1 - (1 - INTERDICTOR.grid.close) * progress);
    const sides = cageSides(g.x, g.y, g.size);
    g.fences = sides.filter((_, i) => i !== g.open);
    g.posts = sides.map((s) => ({ x: s.x1, y: s.y1 }));
  }

  /** The solid fences that touch `point` (a ship of `reach` px). */
  fencesHit(point, reach = SHIP_REACH) {
    const g = this.grid;
    if (g?.phase !== 'solid') return [];
    const touch = INTERDICTOR.grid.thickness / 2 + reach;
    return g.fences.filter(
      (f) =>
        distanceToSegment(point.x, point.y, f.x1, f.y1, f.x2, f.y2) <= touch
    );
  }

  // Each fence touched pushes the ship back to the side it is on (or comes
  // from); one hit of damage a frame, like the Gatekeeper's barrier.
  pressFences(target) {
    const ship = target?.position;
    const reach = target?.player?.getHullBoundingRadius?.() ?? SHIP_REACH;
    if (!ship) return;
    const hit = this.fencesHit(ship, reach);
    if (!hit.length) return;
    const velocity = target.player?.velocity;
    for (const f of hit) {
      const length = Math.hypot(f.x2 - f.x1, f.y2 - f.y1) || 1;
      const nx = -(f.y2 - f.y1) / length;
      const ny = (f.x2 - f.x1) / length;
      const off = (ship.x - f.x1) * nx + (ship.y - f.y1) * ny;
      const moving = velocity ? velocity.vx * nx + velocity.vy * ny : 0;
      const side = Math.sign(off) || -Math.sign(moving) || 1;
      if (velocity) {
        const kick = Math.max(0, INTERDICTOR.grid.push - moving * side) * side;
        velocity.vx += nx * kick;
        velocity.vy += ny * kick;
      }
    }
    const f = hit[0];
    const t = clamp(
      ((ship.x - f.x1) * (f.x2 - f.x1) + (ship.y - f.y1) * (f.y2 - f.y1)) /
        ((f.x2 - f.x1) ** 2 + (f.y2 - f.y1) ** 2 || 1),
      0,
      1
    );
    this.system?.applyDirectDamageToPlayer?.(
      Math.round(this.contactDamage * INTERDICTOR.grid.damageFactor),
      {
        cause: 'boss-barrier',
        position: { x: f.x1 + (f.x2 - f.x1) * t, y: f.y1 + (f.y2 - f.y1) * t },
        radius: INTERDICTOR.grid.thickness / 2 + reach,
        source: this,
      }
    );
  }

  // LOCK, one beam after another while any are left: aim (tracking the
  // ship) → freeze → burn → the gap before the next.
  updateLocks(deltaTime, position) {
    const l = this.lock;
    if (!l) {
      this.lockGap -= deltaTime;
      if (this.locksLeft > 0 && this.lockGap <= 0) this.beginLock(position);
      return;
    }
    l.timer -= deltaTime;
    if (l.phase === 'aim') {
      if (position)
        this.pointLock(Math.atan2(position.y - this.y, position.x - this.x));
      if (l.timer <= 0) {
        l.phase = 'freeze';
        l.timer = l.duration = INTERDICTOR.lock.freeze;
      }
    } else if (l.phase === 'freeze' && l.timer <= 0) {
      l.phase = 'burn';
      l.timer = l.duration = INTERDICTOR.lock.burn;
    } else if (l.phase === 'burn' && l.timer <= 0) {
      this.lock = null;
      this.locksLeft -= 1;
      this.lockGap = INTERDICTOR.lock.gap;
    }
  }

  beginLock(position) {
    this.lock = {
      type: 'lock',
      x: this.x,
      y: this.y,
      angle: this.aimAngle,
      x2: this.x,
      y2: this.y,
      phase: 'aim',
      timer: this.lockAim,
      duration: this.lockAim,
      width: INTERDICTOR.lock.width,
    };
    this.pointLock(
      position
        ? Math.atan2(position.y - this.y, position.x - this.x)
        : this.aimAngle
    );
  }

  // The line from where it stands along `angle` to the field's edge.
  pointLock(angle) {
    const l = this.lock;
    const s = segmentToEdge(this.x, this.y, angle);
    Object.assign(l, { x: s.x1, y: s.y1, angle, x2: s.x2, y2: s.y2 });
    this.aimAngle = angle;
  }

  /** True when `point` is within half the burning line's width of it. */
  inLock(point) {
    const l = this.lock;
    if (l?.phase !== 'burn') return false;
    return (
      distanceToSegment(point.x, point.y, l.x, l.y, l.x2, l.y2) <= l.width / 2
    );
  }

  // One tick every `burnTick` s while the ship's centre is in the burning
  // line (the first on being caught).
  burn(deltaTime, target) {
    const ship = target?.position;
    if (!ship || !this.inLock(ship)) {
      this.burnTimer = 0;
      return;
    }
    this.burnTimer -= deltaTime;
    if (this.burnTimer > 0) return;
    this.burnTimer += INTERDICTOR.burnTick;
    this.system?.applyDirectDamageToPlayer?.(
      Math.round(this.contactDamage * INTERDICTOR.lock.damageFactor),
      {
        cause: 'boss-beam',
        position: { ...ship },
        radius: INTERDICTOR.lock.width / 2,
        source: this,
      }
    );
  }
}

export default SentinelInterdictor;
