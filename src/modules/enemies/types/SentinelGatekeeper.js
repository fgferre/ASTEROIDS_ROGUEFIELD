import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { BOSS_KINDS, wardenComponents } from '../../../data/enemies/boss.js';
import { angleBetween } from '../base/frontalShield.js';
import { fieldSpan, pressBarrier, tickBarrier } from '../boss/barrier.js';
import { BossEnemy } from './BossEnemy.js';

const GATE = BOSS_KINDS.gatekeeper;
const TAU = Math.PI * 2;
// A plate raised this far soaks the front arc.
const RAISED_AT = 0.5;

const wrapAngle = (angle) => {
  const a = (((angle + Math.PI) % TAU) + TAU) % TAU;
  return a - Math.PI;
};

// How far (x, y) can go along (ux, uy) and stay `margin` inside the field.
function roomAhead(x, y, ux, uy, margin) {
  let room = Infinity;
  for (const [p, u, size] of [
    [x, ux, GAME_WIDTH],
    [y, uy, GAME_HEIGHT],
  ]) {
    if (u > 1e-6) room = Math.min(room, (size - margin - p) / u);
    else if (u < -1e-6) room = Math.min(room, (margin - p) / u);
  }
  return Math.max(0, room);
}

// Sentinel Gatekeeper (src/content/bosses/gatekeeper.js), one loop:
//   reposition     — plate raised, seeking slowly, turning to the ship;
//   barrier-windup — it stops; the barrier warns (solid 0) across the field;
//   lane-windup    — the barrier is solid; a strip toward the ship warns;
//   charging       — the dash along the strip, to its end (field edge or
//                    `charge.distance`); below half health a second strip
//                    and dash follow at once;
//   recover        — plate lowered, still: full damage from any side;
//   then the reposition again. The barrier keeps its own clock: it holds
//   `cycle.barrier` s once solid, then fades.
// What the view reads:
//   facing    — radians, where the plate looks (also `rotation`);
//   shieldUp  — 0..1, the plate raised (1) or lowered (0);
//   barrier   — null or { type: 'barrier', x, y, angle (the line's
//               direction), gapAt (px along the line from x, y), gapWidth,
//               span: [from, to] (the line inside the field, px along it),
//               solid 0..1, timer, duration } — a telegraph of its own;
//   telegraph — the strip: { type: 'lane', x, y (its start), angle, length,
//               width, timer, duration, charging }.
export class SentinelGatekeeper extends BossEnemy {
  initialize(config = {}) {
    super.initialize({
      ...config,
      displayName: GATE.displayName,
      healthFactor: GATE.healthFactor,
      radius: GATE.radius,
      rewards: GATE.rewards,
      phaseThresholds: GATE.phaseThresholds,
      phaseCount: GATE.phaseCount,
      invulnerabilityDuration: GATE.invulnerabilityDuration,
      components: config.components ?? wardenComponents('gatekeeper'),
    });
    this.bossKind = 'gatekeeper';
    this.tier = GATE.tier;
    this.subtitle = GATE.subtitle;
    this.facing = Math.atan2(GAME_HEIGHT / 2 - this.y, GAME_WIDTH / 2 - this.x);
    this.rotation = this.facing;
    this.gateTimer = this.cycle().drift;
    return this;
  }

  resetForPool() {
    super.resetForPool();
    this.gateState = 'reposition';
    this.gateTimer = 0;
    this.shieldUp = 1;
    this.facing = 0;
    this.barrier = null;
    this.chargesLeft = 0;
    this.lane = null;
  }

  cycle() {
    return GATE.cycle[Math.min(this.currentPhase, GATE.cycle.length - 1)];
  }

  get recovering() {
    return this.gateState === 'recover';
  }

  // The raised plate soaks hits on its front arc and rings dull (the
  // Bulwark's clang); from behind, with no hit point, or recovering, all of
  // it lands.
  takeDamage(amount, source = null) {
    const hit = source?.hitPosition;
    const front =
      hit &&
      !this.recovering &&
      this.shieldUp >= RAISED_AT &&
      angleBetween(Math.atan2(hit.y - this.y, hit.x - this.x), this.facing) <=
        GATE.shield.halfArc;
    if (!front) return super.takeDamage(amount, source);
    if (amount > 0 && !this.invulnerable && !this.intangible) {
      this.getEventBus()?.emit?.('bulwark-plate-hit', {
        enemy: this,
        enemyId: this.id,
        position: { x: hit.x, y: hit.y },
      });
    }
    return super.takeDamage(amount * GATE.shield.damageFactor, source);
  }

  // The phase step restores the phase movement; mid-attack it stays put.
  advancePhase() {
    super.advancePhase();
    if (this.gateState !== 'reposition') this.movementStrategy = 'linear';
  }

  // On the entrance the plate comes lowered and rises when it stops.
  poseArrival(open) {
    this.shieldUp = 1 - open;
  }

  handlePhaseIntro(deltaTime, target) {
    this.updateGate(deltaTime, target);
  }

  handlePhaseAssault(deltaTime, target) {
    this.updateGate(deltaTime, target);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateGate(deltaTime, target);
  }

  updateGate(deltaTime, target) {
    const position = target?.position ?? null;
    const cycle = this.cycle();
    this.gateTimer -= deltaTime;
    switch (this.gateState) {
      case 'barrier-windup':
        this.holdStill(deltaTime);
        this.turnTo(position, GATE.turnRate, deltaTime);
        if (this.gateTimer <= 0) {
          this.chargesLeft = cycle.charges;
          this.beginLane(cycle, position);
        }
        break;
      case 'lane-windup':
        this.holdStill(deltaTime);
        this.turnToAngle(this.lane.angle, GATE.aimTurnRate, deltaTime);
        this.telegraph.timer = Math.max(0, this.gateTimer);
        if (this.gateTimer <= 0) this.launch();
        break;
      case 'charging':
        this.chargeAlong(deltaTime);
        if (this.lane.travelled >= this.lane.length) {
          this.endCharge(cycle, position);
        }
        break;
      case 'recover':
        this.holdStill(deltaTime);
        if (this.gateTimer <= 0) {
          this.gateState = 'reposition';
          this.gateTimer = cycle.drift;
          this.applyPhaseMovement(true);
        }
        break;
      default:
        this.turnTo(position, GATE.turnRate, deltaTime);
        if (this.gateTimer <= 0 && position) this.beginBarrier(cycle, position);
        break;
    }
    this.moveShield(this.recovering ? 0 : 1, deltaTime);
    this.updateBarrier(deltaTime, target);
    // The phase movement faces where it goes; the Gatekeeper faces its plate.
    this.rotation = this.facing;
  }

  turnToAngle(wanted, rate, deltaTime) {
    const step = rate * deltaTime;
    const turn = wrapAngle(wanted - this.facing);
    this.facing = wrapAngle(
      this.facing + Math.max(-step, Math.min(step, turn))
    );
  }

  turnTo(position, rate, deltaTime) {
    if (!position) return;
    const wanted = Math.atan2(position.y - this.y, position.x - this.x);
    this.turnToAngle(wanted, rate, deltaTime);
  }

  holdStill(deltaTime) {
    this.movementStrategy = 'linear';
    const keep = Math.max(0, 1 - 4 * deltaTime);
    this.vx *= keep;
    this.vy *= keep;
  }

  moveShield(goal, deltaTime) {
    const step = GATE.shield.speed * deltaTime;
    this.shieldUp += Math.max(-step, Math.min(step, goal - this.shieldUp));
  }

  // BAR THE LANE: a line through it, square to the ship; the gap sits
  // `gapOffset` along it from the ship's spot (the ship is square to the
  // line, so that spot is the Gatekeeper's own), on the side with more room,
  // kept inside the field.
  beginBarrier(cycle, position) {
    this.gateState = 'barrier-windup';
    this.gateTimer = cycle.barrierWindup;
    const { gapWidth, gapOffset, edgeMargin } = GATE.barrier;
    const toShip = Math.atan2(position.y - this.y, position.x - this.x);
    const angle = toShip + Math.PI / 2;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const span = fieldSpan(this.x, this.y, ux, uy);
    const ship = (position.x - this.x) * ux + (position.y - this.y) * uy;
    const side = span[1] - ship >= ship - span[0] ? 1 : -1;
    const low = span[0] + gapWidth / 2 + edgeMargin;
    const high = span[1] - gapWidth / 2 - edgeMargin;
    const wanted = ship + side * gapOffset;
    const gapAt = low <= high ? Math.max(low, Math.min(high, wanted)) : ship;
    this.barrier = {
      type: 'barrier',
      x: this.x,
      y: this.y,
      angle,
      gapAt,
      gapWidth,
      span,
      solid: 0,
      phase: 'warn',
      hold: cycle.barrier,
      timer: cycle.barrierWindup,
      duration: cycle.barrierWindup,
    };
  }

  // The barrier's own clock (boss/barrier.js): warn → solid (hold) → fade →
  // gone. Solid, it hurts and pushes the ship away outside the gap; rocks,
  // enemies and bullets ignore it.
  updateBarrier(deltaTime, target) {
    if (!this.barrier) return;
    if (!tickBarrier(this.barrier, deltaTime, GATE.barrier.fade)) {
      this.barrier = null;
      return;
    }
    if (this.barrier.phase === 'solid') this.pressBarrier(target);
  }

  pressBarrier(target) {
    pressBarrier(this, this.barrier, target, GATE.barrier);
  }

  // CHARGE THE LANE: a strip as wide as it, from where it stands toward the
  // ship, to the field edge or `charge.distance`.
  beginLane(cycle, position) {
    this.gateState = 'lane-windup';
    this.gateTimer = cycle.laneWindup;
    const angle = position
      ? Math.atan2(position.y - this.y, position.x - this.x)
      : this.facing;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const room = roomAhead(this.x, this.y, ux, uy, this.radius * 0.5);
    this.lane = {
      x: this.x,
      y: this.y,
      angle,
      length: Math.min(GATE.charge.distance, room),
      travelled: 0,
    };
    this.setTelegraph({
      type: 'lane',
      x: this.x,
      y: this.y,
      angle,
      length: this.lane.length,
      width: this.radius * 2,
      duration: cycle.laneWindup,
      timer: cycle.laneWindup,
      charging: false,
    });
  }

  launch() {
    this.gateState = 'charging';
    this.chargesLeft -= 1;
    this.facing = this.lane.angle;
    this.telegraph.charging = true;
    this.telegraph.timer = 0;
  }

  // Along the strip, on it: whatever pushed it this frame, it is put back on
  // the line at the distance it has run.
  chargeAlong(deltaTime) {
    const { lane } = this;
    const ux = Math.cos(lane.angle);
    const uy = Math.sin(lane.angle);
    lane.travelled = Math.min(
      lane.length,
      lane.travelled + GATE.charge.speed * deltaTime
    );
    this.x = lane.x + ux * lane.travelled;
    this.y = lane.y + uy * lane.travelled;
    const running = lane.travelled < lane.length;
    this.vx = running ? ux * GATE.charge.speed : 0;
    this.vy = running ? uy * GATE.charge.speed : 0;
  }

  // Another strip at once while charges are left, else the recovery.
  endCharge(cycle, position) {
    this.vx = 0;
    this.vy = 0;
    if (this.chargesLeft > 0) {
      this.beginLane(cycle, position);
      return;
    }
    this.clearTelegraph();
    this.lane = null;
    this.gateState = 'recover';
    this.gateTimer = cycle.recover;
  }
}

export default SentinelGatekeeper;
