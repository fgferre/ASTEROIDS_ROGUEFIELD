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

// Where its four emitters dock on its hull, as angles round its centre on
// the field, matched to the cage's corners (top-left, top-right,
// bottom-right, bottom-left): four of the six corners of its foot.
const DOCKS = [210, 330, 30, 150].map((deg) => (deg * Math.PI) / 180);

// px between its hull and a cage slid clear of it
const CAGE_CLEARANCE = 6;

const ease = (k) => k * k * (3 - 2 * k);

/**
 * The fences of the square of side `size` centred on (x, y): its sides but
 * `open`, which keeps two stubs from its corners round a doorway `door` px
 * wide in its middle (none once the side is narrower than the doorway).
 * Stubs run the same way as their side, so the same normal points in.
 */
export function cageFences(x, y, size, open, door) {
  const sides = cageSides(x, y, size);
  const fences = sides.filter((_, i) => i !== open);
  const s = sides[open];
  const stub = (size - door) / 2;
  if (stub > 0) {
    const ux = (s.x2 - s.x1) / size;
    const uy = (s.y2 - s.y1) / size;
    fences.push(
      { x1: s.x1, y1: s.y1, x2: s.x1 + ux * stub, y2: s.y1 + uy * stub },
      { x1: s.x2 - ux * stub, y1: s.y2 - uy * stub, x2: s.x2, y2: s.y2 }
    );
  }
  return fences;
}

// Sentinel Interdictor (src/content/bosses/interdictor.js), one loop:
//   drift — it steers toward mid-field, the cage down, its emitters docked;
//   grid  — it stops and throws its four emitters out to the corners of a
//           square of `cycle.size` px round where the ship will be in
//           `grid.lead` s (kept inside the field): they fly `grid.deploy` s, anchor, and project thin lines
//           for `grid.project` s (the warning); then the cage is solid:
//           three fences and, in the side that faces the boss, two stubs
//           round a doorway `cycle.door` px wide. Solid, it closes in round
//           its centre to `grid.close` of its side over `cycle.closeTime` s
//           (unless its own body is inside), holds `grid.hold` s, then
//           collapses over `grid.fade` s and the emitters fly home in
//           `grid.recall` s. The first cage of a fight takes `grid.first`.
//           A solid fence touched hurts once (then none for `grid.grace` s)
//           and pushes the ship back; squeezed between two, it is spat out
//           of the doorway (rocks, enemies and bullets ignore the fences). From the warning on it fires `cycle.beams` locked
//           beams one after another, `lock.gap` s apart: each aims at the
//           ship for `cycle.aim` s, freezes for `lock.freeze` s, then burns
//           along the frozen line to the field's edge for `lock.burn` s (a
//           tick every `burnTick` s while the ship's centre is within
//           `width / 2` of it);
//   rest  — cage and beams gone, the vents open: full damage, for
//           `cycle.rest` s; then the drift again.
// Outside the rest its shell lets `shellDamageFactor` in.
// What the view reads:
//   ventOpen — 0..1, the vents open (1) or shut (0);
//   mastRise — 0..1, the emitter mast raised (1) or down (entrance);
//   aimAngle — radians, where its emitter points;
//   emitters — [{ x, y, lift 0..1 (up in flight), docked }] ×4, the fence
//              emitters, in the cage's corner order;
//   grid     — null or { type: 'grid', x, y (its centre), size (now), full
//              (as drawn), open (0..3, the side with the doorway: 0 top,
//              1 right, 2 bottom, 3 left), door (px), fences: [{ x1, y1,
//              x2, y2 }] (three sides, then the doorway's two stubs), posts:
//              [{ x, y }] (the four corners), solid 0..1, phase 'warn'|
//              'solid'|'fade', timer, duration, deploy, project (s of the
//              warning: the emitters' flight, then the lines) };
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
    this.emitters = DOCKS.map(() => ({
      x: this.x,
      y: this.y,
      lift: 0,
      docked: true,
    }));
    this.placeEmitters(0);
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
    this.cages = 0;
    this.fenceGrace = 0;
    this.recall = null;
    this.emitters = [];
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
        if (this.gridTimer <= 0 && position) {
          this.beginGrid(cycle, position, target.player?.velocity);
        }
        break;
    }
    const step = INTERDICTOR.ventSpeed * deltaTime;
    const goal = this.resting ? 1 : 0;
    this.ventOpen += Math.max(-step, Math.min(step, goal - this.ventOpen));
    this.fenceGrace = Math.max(0, this.fenceGrace - deltaTime);
    this.updateGrid(deltaTime, target);
    this.placeEmitters(deltaTime);
    this.burn(deltaTime, target);
  }

  // Its beams start where it stands: it stays put while the cage is up.
  holdStill() {
    this.movementStrategy = 'linear';
    this.vx = 0;
    this.vy = 0;
  }

  // GRID: the square round the ship, inside the field; its doorway in the
  // side that faces the boss (proposta 13/11: the open side was the
  // farthest from it, then the next one clockwise, and the pilot left by
  // it before the cage was solid: now the way out runs toward its beam).
  beginGrid(cycle, ship, velocity = null) {
    const spec =
      this.cages === 0 ? { ...cycle, ...INTERDICTOR.grid.first } : cycle;
    this.cages += 1;
    const { size } = spec;
    const { lead } = INTERDICTOR.grid;
    const ahead = {
      x: ship.x + (velocity?.vx ?? 0) * lead,
      y: ship.y + (velocity?.vy ?? 0) * lead,
    };
    const { x, y } = this.placeCage(ahead, size);
    let near = Infinity;
    cageSides(x, y, size).forEach((s, i) => {
      const mid = Math.hypot(
        (s.x1 + s.x2) / 2 - this.x,
        (s.y1 + s.y2) / 2 - this.y
      );
      if (mid < near) {
        near = mid;
        this.openSide = i;
      }
    });
    const { deploy, project } = INTERDICTOR.grid;
    this.gridState = 'grid';
    this.recall = null;
    this.grid = {
      type: 'grid',
      x,
      y,
      size,
      full: size,
      // with its own body inside the cage, closing would press the ship
      // onto it (12/11, a pilot died that way): that cage stands still
      closes: this.clearOf(x, y, size),
      open: this.openSide,
      door: spec.door,
      closeTime: spec.closeTime,
      fences: cageFences(x, y, size, this.openSide, spec.door),
      posts: cageSides(x, y, size).map((s) => ({ x: s.x1, y: s.y1 })),
      solid: 0,
      phase: 'warn',
      timer: deploy + project,
      duration: deploy + project,
      deploy,
      project,
    };
    this.locksLeft = spec.beams;
    this.lockAim = spec.aim;
    this.lockGap = 0;
  }

  /** True when its body lies outside the square of `size` round (x, y). */
  clearOf(x, y, size) {
    return (
      Math.max(Math.abs(this.x - x), Math.abs(this.y - y)) >=
      size / 2 + this.radius
    );
  }

  // Where the cage goes: round `at` (where the ship is heading), inside
  // the field, slid away from its own body along the axis the ship is
  // farther on, then the other, until the body is outside it (proposta
  // 13/11: a cage round the ship held the boss inside most of the time
  // and stood still, harmless). A ship hugging it keeps a cage that cannot
  // close.
  placeCage(at, size) {
    const half = size / 2;
    const fit = (p) => ({
      x: clamp(p.x, half, GAME_WIDTH - half),
      y: clamp(p.y, half, GAME_HEIGHT - half),
    });
    const plain = fit(at);
    const dx = at.x - this.x;
    const dy = at.y - this.y;
    const away = half + this.radius + CAGE_CLEARANCE;
    const slide = (axis) => {
      const d = axis === 'x' ? dx : dy;
      if (Math.abs(d) >= away) return fit(at);
      const moved = { ...at };
      moved[axis] = this[axis] + (Math.sign(d) || 1) * away;
      return fit(moved);
    };
    const order = Math.abs(dx) >= Math.abs(dy) ? ['x', 'y'] : ['y', 'x'];
    for (const axis of order) {
      const p = slide(axis);
      if (this.clearOf(p.x, p.y, size)) return p;
    }
    return plain;
  }

  // The cage's own clock: warn → solid (closing, then holding) → fade →
  // gone, the emitters flying home. Solid, a fence hurts and throws the
  // ship out.
  updateGrid(deltaTime, target) {
    const g = this.grid;
    if (!g) return;
    g.timer -= deltaTime;
    if (g.phase === 'warn' && g.timer <= 0) {
      g.phase = 'solid';
      g.solid = 1;
      g.timer = g.duration = g.closeTime + INTERDICTOR.grid.hold;
      this.getEventBus()?.emit?.('boss-attack-started', {
        enemy: this,
        enemyId: this.id,
        position: { x: this.x, y: this.y },
      });
    } else if (g.phase === 'solid' && g.timer <= 0) {
      g.phase = 'fade';
      g.timer = g.duration = INTERDICTOR.grid.fade;
    } else if (g.phase === 'fade') {
      g.solid = Math.max(0, g.timer / g.duration);
      if (g.timer <= 0) {
        this.grid = null;
        const { recall } = INTERDICTOR.grid;
        this.recall = {
          from: g.posts.map((p) => ({ ...p })),
          timer: recall,
          duration: recall,
        };
        return;
      }
    }
    if (g.phase === 'solid') {
      if (g.closes) this.closeCage(g);
      this.pressFences(target);
    }
  }

  // Solid, the quarantine closes in round its centre, from `full` down to
  // `grid.close` of it in the cage's `closeTime` s, then holds; the doorway
  // keeps its width (the stubs shrink).
  // A cage drawn round its own body does not close.
  closeCage(g) {
    const progress = clamp((g.duration - g.timer) / g.closeTime, 0, 1);
    g.size = g.full * (1 - (1 - INTERDICTOR.grid.close) * progress);
    g.fences = cageFences(g.x, g.y, g.size, g.open, g.door);
    g.posts = cageSides(g.x, g.y, g.size).map((s) => ({ x: s.x1, y: s.y1 }));
  }

  /** Its dock `i` on the hull, on the field. */
  dock(i) {
    const r = this.radius * INTERDICTOR.grid.dock;
    return {
      x: this.x + Math.cos(DOCKS[i]) * r,
      y: this.y + Math.sin(DOCKS[i]) * r,
    };
  }

  // The emitters: out of their docks to the corners while the cage warns,
  // on the corners while it stands, home again after it collapses.
  placeEmitters(deltaTime) {
    const g = this.grid;
    const r = this.recall;
    if (r) {
      r.timer -= deltaTime;
      if (r.timer <= 0) this.recall = null;
    }
    this.emitters.forEach((e, i) => {
      const home = this.dock(i);
      let at = home;
      let lift = 0;
      if (g) {
        const k =
          g.phase === 'warn'
            ? clamp((g.duration - g.timer) / g.deploy, 0, 1)
            : 1;
        const p = g.posts[i];
        const t = ease(k);
        at = { x: home.x + (p.x - home.x) * t, y: home.y + (p.y - home.y) * t };
        lift = Math.sin(Math.PI * k);
      } else if (this.recall) {
        const k = 1 - clamp(this.recall.timer / this.recall.duration, 0, 1);
        const p = this.recall.from[i];
        const t = ease(k);
        at = { x: p.x + (home.x - p.x) * t, y: p.y + (home.y - p.y) * t };
        lift = 0.6 * Math.sin(Math.PI * k);
      }
      e.x = at.x;
      e.y = at.y;
      e.lift = lift;
      e.docked = !g && !this.recall;
    });
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

  // A fence touched is a wall: it pushes the ship back to the side it is
  // on (or comes from), a dash included. Squeezed between two opposite
  // fences of a closing cage, the ship is spat out of the doorway instead
  // (proposta 13/11: they bounced a trapped ship between them until it
  // died; thrown out through any fence, the test pilot dashed through
  // every cage for free). It hurts once, then not again for `grid.grace` s.
  pressFences(target) {
    const ship = target?.position;
    const reach = target?.player?.getHullBoundingRadius?.() ?? SHIP_REACH;
    if (!ship) return;
    const hit = this.fencesHit(ship, reach);
    if (!hit.length) return;
    const velocity = target.player?.velocity;
    // each fence's normal toward the ship's side
    const pushes = hit.map((f) => {
      const length = Math.hypot(f.x2 - f.x1, f.y2 - f.y1) || 1;
      const nx = -(f.y2 - f.y1) / length;
      const ny = (f.x2 - f.x1) / length;
      const off = (ship.x - f.x1) * nx + (ship.y - f.y1) * ny;
      const moving = velocity ? velocity.vx * nx + velocity.vy * ny : 0;
      const side = Math.sign(off) || -Math.sign(moving) || 1;
      return { x: nx * side, y: ny * side };
    });
    const squeezed = pushes.some((a) =>
      pushes.some((b) => a.x * b.x + a.y * b.y < -0.5)
    );
    const g = this.grid;
    const out = cageSides(0, 0, 1)[g.open];
    // the doorway side's normal points in: out is against it
    const door = { x: out.y2 - out.y1, y: -(out.x2 - out.x1) };
    if (velocity) {
      for (const push of squeezed ? [door] : pushes) {
        const moving = velocity.vx * push.x + velocity.vy * push.y;
        const kick = Math.max(0, INTERDICTOR.grid.push - moving);
        velocity.vx += push.x * kick;
        velocity.vy += push.y * kick;
      }
    }
    if (this.fenceGrace > 0) return;
    this.fenceGrace = INTERDICTOR.grid.grace;
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
