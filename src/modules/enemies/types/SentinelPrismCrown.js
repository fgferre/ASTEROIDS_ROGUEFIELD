import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { BOSS_KINDS, wardenComponents } from '../../../data/enemies/boss.js';
import { driftToCentre } from '../boss/drift.js';
import { BossEnemy } from './BossEnemy.js';

const CROWN = BOSS_KINDS['prism-crown'];
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
// Mirror 0's orbit is searched in this many steps for the turn whose beam
// passes closest to the ship.
const AIM_STEPS = 360;

/** Distance from (px, py) to the segment (x1, y1)–(x2, y2). */
export function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t =
    length > 0
      ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length))
      : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

/** The segment from (x, y) along `angle` to the field's edge. */
export function segmentToEdge(
  x,
  y,
  angle,
  width = GAME_WIDTH,
  height = GAME_HEIGHT
) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const reach = (from, d, size) => {
    if (d > 1e-9) return (size - from) / d;
    if (d < -1e-9) return -from / d;
    return Infinity;
  };
  const t = Math.max(0, Math.min(reach(x, dx, width), reach(y, dy, height)));
  return { x1: x, y1: y, x2: x + dx * t, y2: y + dy * t };
}

// Sentinel Prism Crown (src/content/bosses/prism-crown.js), one loop:
//   drift — mirrors closed in, it steers toward mid-field;
//   align — it stops; the mirrors turn to a new arrangement (mirror 0's beam
//           crosses the ship) and the beams' paths warn for `cycle.warn` s;
//   fire  — the beams burn along those paths for `cycle.burn` s while the
//           whole crown turns at `cycle.sweep` °/s (direction alternating
//           by volley); a tick every `burnTick` s while the ship's centre is
//           within `width / 2` of a burning segment;
//   rest  — beams off, mirrors spread out and dark: full damage, for
//           `cycle.rest` s; then the drift again. Beams ignore rocks and
//           enemies; outside the rest the core lets `coreDamageFactor` in.
// What the view reads:
//   crownOpen — 0..1, the mirrors spread out and dark (1) or closed in (0);
//   mirrors   — [{ x, y, angle (its reflected beam's direction), orbit (its
//               angle round the core) }], field px and radians;
//   beams     — null or { type: 'prism', x, y, segments: [{ x1, y1, x2, y2 }]
//               (core → mirror, then mirror → edge, per mirror), solid 0..1,
//               phase 'warn'|'burn', timer, duration, width }.
export class SentinelPrismCrown extends BossEnemy {
  initialize(config = {}) {
    super.initialize({
      ...config,
      displayName: CROWN.displayName,
      healthFactor: CROWN.healthFactor,
      radius: CROWN.radius,
      rewards: CROWN.rewards,
      phaseThresholds: CROWN.phaseThresholds,
      phaseCount: CROWN.phaseCount,
      invulnerabilityDuration: CROWN.invulnerabilityDuration,
      components: config.components ?? wardenComponents('prism-crown'),
    });
    this.bossKind = 'prism-crown';
    this.tier = CROWN.tier;
    this.subtitle = CROWN.subtitle;
    this.movementStrategy = 'linear';
    this.crownTimer = this.cycle().drift;
    this.mirrorCount = this.cycle().mirrors;
    this.placeMirrors();
    return this;
  }

  resetForPool() {
    super.resetForPool();
    this.crownState = 'drift';
    this.crownTimer = 0;
    this.crownOpen = 0;
    this.crownTurn = 0;
    this.bend = 0;
    this.volley = 0;
    this.mirrorCount = 0;
    this.mirrors = [];
    this.beams = null;
    this.burnTimer = 0;
  }

  cycle() {
    return CROWN.cycle[Math.min(this.currentPhase, CROWN.cycle.length - 1)];
  }

  get resting() {
    return this.crownState === 'rest';
  }

  // Not resting, the core soaks most of a hit and rings dull (the Bulwark's
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
    return super.takeDamage(amount * CROWN.coreDamageFactor, source);
  }

  // The phase step restores the phase movement; it always steers itself.
  advancePhase() {
    super.advancePhase();
    this.movementStrategy = 'linear';
  }

  // On the entrance its mirrors are its pieces: wide, closing in on arrival.
  poseArrival(open) {
    this.crownOpen = open;
    this.placeMirrors();
  }

  handlePhaseIntro(deltaTime, target) {
    this.updateCrown(deltaTime, target);
  }

  handlePhaseAssault(deltaTime, target) {
    this.updateCrown(deltaTime, target);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateCrown(deltaTime, target);
  }

  updateCrown(deltaTime, target) {
    const position = target?.position ?? null;
    const cycle = this.cycle();
    this.crownTimer -= deltaTime;
    switch (this.crownState) {
      case 'align':
        this.holdStill();
        if (this.crownTimer <= 0) this.fire(cycle);
        break;
      case 'fire':
        this.holdStill();
        if (this.crownTimer <= 0) {
          this.crownState = 'rest';
          this.crownTimer = cycle.rest;
          this.beams = null;
        } else {
          const turn = this.volley % 2 === 0 ? 1 : -1;
          this.crownTurn += turn * cycle.sweep * DEG * deltaTime;
        }
        break;
      case 'rest':
        this.holdStill();
        if (this.crownTimer <= 0) {
          this.crownState = 'drift';
          this.crownTimer = cycle.drift;
          this.volley += 1;
        }
        break;
      default:
        driftToCentre(this, deltaTime, CROWN.drift);
        if (this.crownTimer <= 0 && position) this.align(cycle, position);
        break;
    }
    this.moveCrown(this.resting ? 1 : 0, deltaTime);
    this.placeMirrors();
    if (this.beams) this.traceBeams();
    this.burn(deltaTime, target);
  }

  // Its beams' paths have to stay where they were shown.
  holdStill() {
    this.movementStrategy = 'linear';
    this.vx = 0;
    this.vy = 0;
  }

  moveCrown(goal, deltaTime) {
    const step = CROWN.crown.openSpeed * deltaTime;
    this.crownOpen += Math.max(-step, Math.min(step, goal - this.crownOpen));
  }

  // Mirror i sits at `crownTurn + i · 360°/n` round the core, its beam bent
  // off the radial by the volley's bend plus its own twist.
  mirrorAt(i, turn = this.crownTurn, open = this.crownOpen) {
    const { orbit, spread, twists } = CROWN.crown;
    const distance = this.radius * orbit * (1 + spread * open);
    const at = turn + (i * TAU) / this.mirrorCount;
    return {
      x: this.x + Math.cos(at) * distance,
      y: this.y + Math.sin(at) * distance,
      angle: at + this.bend + (twists[i % twists.length] ?? 0) * DEG,
      orbit: at,
    };
  }

  placeMirrors() {
    this.mirrors = Array.from({ length: this.mirrorCount }, (_, i) =>
      this.mirrorAt(i)
    );
  }

  // ALIGN: the volley's bend, then the turn that brings mirror 0's beam
  // closest to the ship; the crown is closed in for it.
  align(cycle, ship) {
    this.crownState = 'align';
    this.crownTimer = cycle.warn;
    this.crownOpen = 0;
    this.mirrorCount = cycle.mirrors;
    const { bends } = CROWN.crown;
    this.bend = bends[this.volley % bends.length] * DEG;
    let best = Infinity;
    for (let step = 0; step < AIM_STEPS; step += 1) {
      const turn = (step * TAU) / AIM_STEPS;
      const m = this.mirrorAt(0, turn, 0);
      const s = segmentToEdge(m.x, m.y, m.angle);
      const miss = distanceToSegment(ship.x, ship.y, s.x1, s.y1, s.x2, s.y2);
      if (miss < best) {
        best = miss;
        this.crownTurn = turn;
      }
    }
    this.placeMirrors();
    this.beams = {
      type: 'prism',
      x: this.x,
      y: this.y,
      segments: [],
      solid: 0,
      phase: 'warn',
      timer: cycle.warn,
      duration: cycle.warn,
      width: CROWN.beam.width,
    };
    this.traceBeams();
  }

  fire(cycle) {
    this.crownState = 'fire';
    this.crownTimer = cycle.burn;
    Object.assign(this.beams, {
      phase: 'burn',
      solid: 1,
      timer: cycle.burn,
      duration: cycle.burn,
    });
  }

  // Each mirror's two segments: core → mirror, mirror → the field's edge.
  traceBeams() {
    const b = this.beams;
    b.x = this.x;
    b.y = this.y;
    b.timer = Math.max(0, this.crownTimer);
    b.segments = this.mirrors.flatMap((m) => [
      { x1: this.x, y1: this.y, x2: m.x, y2: m.y },
      segmentToEdge(m.x, m.y, m.angle),
    ]);
  }

  /** True when `point` is within half a beam's width of one of its segments. */
  inBeam(point) {
    const b = this.beams;
    if (!b) return false;
    return b.segments.some(
      (s) =>
        distanceToSegment(point.x, point.y, s.x1, s.y1, s.x2, s.y2) <=
        b.width / 2
    );
  }

  // One tick every `burnTick` s while the ship's centre is in a burning beam
  // (the first on stepping in).
  burn(deltaTime, target) {
    const ship = target?.position;
    if (!ship || this.beams?.phase !== 'burn' || !this.inBeam(ship)) {
      this.burnTimer = 0;
      return;
    }
    this.burnTimer -= deltaTime;
    if (this.burnTimer > 0) return;
    this.burnTimer += CROWN.burnTick;
    this.system?.applyDirectDamageToPlayer?.(
      Math.round(this.contactDamage * CROWN.beam.damageFactor),
      {
        cause: 'boss-beam',
        position: { ...ship },
        radius: CROWN.beam.width / 2,
        source: this,
      }
    );
  }
}

export default SentinelPrismCrown;
