import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { BOSS_KINDS, wardenComponents } from '../../../data/enemies/boss.js';
import { BossEnemy } from './BossEnemy.js';

const MAW = BOSS_KINDS['quarry-maw'];
const TAU = Math.PI * 2;
// The mouth sits this far out along its facing, in radii.
const MOUTH = 0.9;
// Jaws this open count as open: the core takes full damage.
const OPEN_AT = 0.5;

const wrapAngle = (angle) => {
  const a = (((angle + Math.PI) % TAU) + TAU) % TAU;
  return a - Math.PI;
};

// Sentinel Quarry Maw (src/content/bosses/quarry-maw.js), one loop:
//   drift         — closed, seeking slowly, turning to the ship;
//   intake-windup — it stops, a wedge shows the cone in front of the mouth;
//   intake        — jaws open, the core is exposed; rocks in the cone are
//                   dragged in and swallowed (no rewards, no kill), the ship
//                   is pulled gently and the open mouth hurts;
//   eject-windup  — jaws shut, it turns to the ship, a line per rock shows
//                   the fan;
//   then the fan: what it swallowed (min..max) as small field rocks, and the
//   drift again. The phase change (phaseThresholds) speeds the cycle and
//   widens the fan. Shut plates soak `closedDamageFactor`.
export class SentinelQuarryMaw extends BossEnemy {
  initialize(config = {}) {
    super.initialize({
      ...config,
      displayName: MAW.displayName,
      healthFactor: MAW.healthFactor,
      radius: MAW.radius,
      rewards: MAW.rewards,
      phaseThresholds: MAW.phaseThresholds,
      phaseCount: MAW.phaseCount,
      invulnerabilityDuration: MAW.invulnerabilityDuration,
      components: config.components ?? wardenComponents('quarry-maw'),
    });
    this.bossKind = 'quarry-maw';
    this.tier = MAW.tier;
    this.subtitle = MAW.subtitle;
    this.facing = Math.atan2(GAME_HEIGHT / 2 - this.y, GAME_WIDTH / 2 - this.x);
    this.rotation = this.facing;
    this.mawTimer = this.cycle().drift;
    return this;
  }

  resetForPool() {
    super.resetForPool();
    this.mawState = 'drift';
    this.mawTimer = 0;
    this.jawOpen = 0;
    this.facing = 0;
    this.swallowed = 0;
    this.salvo = 0;
    this.swallowedTotal = 0;
  }

  cycle() {
    return MAW.cycle[Math.min(this.currentPhase, MAW.cycle.length - 1)];
  }

  get jawsOpen() {
    return this.jawOpen >= OPEN_AT;
  }

  mouthPoint() {
    const reach = this.radius * MOUTH;
    return {
      x: this.x + Math.cos(this.facing) * reach,
      y: this.y + Math.sin(this.facing) * reach,
    };
  }

  attackOrigin() {
    return this.mouthPoint();
  }

  // Shut, the plates soak most of a hit and ring dull (the Bulwark's clang).
  takeDamage(amount, source = null) {
    if (this.jawsOpen) return super.takeDamage(amount, source);
    if (amount > 0 && !this.invulnerable && !this.intangible) {
      const at = source?.hitPosition ?? { x: this.x, y: this.y };
      this.getEventBus()?.emit?.('bulwark-plate-hit', {
        enemy: this,
        enemyId: this.id,
        position: { x: at.x, y: at.y },
      });
    }
    return super.takeDamage(amount * MAW.closedDamageFactor, source);
  }

  // The phase step restores the phase movement; mid-intake it stays put.
  advancePhase() {
    super.advancePhase();
    if (this.mawState !== 'drift') this.movementStrategy = 'linear';
  }

  // On the entrance its jaws are its pieces: flung open, shut on arrival.
  poseArrival(open) {
    this.jawOpen = open;
  }

  handlePhaseIntro(deltaTime, target) {
    this.updateMaw(deltaTime, target);
  }

  handlePhaseAssault(deltaTime, target) {
    this.updateMaw(deltaTime, target);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateMaw(deltaTime, target);
  }

  updateMaw(deltaTime, target) {
    const position = target?.position ?? null;
    const cycle = this.cycle();
    this.mawTimer -= deltaTime;
    switch (this.mawState) {
      case 'intake-windup':
        this.holdStill(deltaTime);
        this.turnTo(position, MAW.turnRate, deltaTime);
        this.aimCone();
        if (this.mawTimer <= 0) {
          this.mawState = 'intake';
          this.mawTimer = cycle.intake;
          if (this.telegraph?.type === 'intake') {
            this.telegraph.pulling = true;
            this.telegraph.duration = cycle.intake;
          }
        }
        break;
      case 'intake':
        this.holdStill(deltaTime);
        this.moveJaws(1, deltaTime);
        this.aimCone();
        this.pull(deltaTime, target);
        if (this.mawTimer <= 0) this.beginEject(cycle);
        break;
      case 'eject-windup':
        this.holdStill(deltaTime);
        this.moveJaws(0, deltaTime);
        this.turnTo(position, MAW.ejectTurnRate, deltaTime);
        this.aimFan(cycle);
        if (this.mawTimer <= 0) {
          this.eject(cycle);
          this.salvo += 1;
          if (this.salvo < cycle.salvos) {
            this.mawTimer = cycle.salvoGap;
            this.telegraph.duration = cycle.salvoGap;
            this.aimFan(cycle);
          } else {
            this.swallowed = 0;
            this.clearTelegraph();
            this.mawState = 'drift';
            this.mawTimer = cycle.drift;
            this.applyPhaseMovement(true);
          }
        }
        break;
      default:
        this.moveJaws(0, deltaTime);
        this.turnTo(position, MAW.turnRate, deltaTime);
        if (this.mawTimer <= 0 && position) this.beginIntake(cycle);
        break;
    }
    // The phase movement faces where it goes; the Maw faces its mouth.
    this.rotation = this.facing;
  }

  turnTo(position, rate, deltaTime) {
    if (!position) return;
    const wanted = Math.atan2(position.y - this.y, position.x - this.x);
    const step = rate * deltaTime;
    const turn = wrapAngle(wanted - this.facing);
    this.facing = wrapAngle(
      this.facing + Math.max(-step, Math.min(step, turn))
    );
  }

  holdStill(deltaTime) {
    this.movementStrategy = 'linear';
    const keep = Math.max(0, 1 - 4 * deltaTime);
    this.vx *= keep;
    this.vy *= keep;
  }

  moveJaws(goal, deltaTime) {
    const step = MAW.jawSpeed * deltaTime;
    this.jawOpen += Math.max(-step, Math.min(step, goal - this.jawOpen));
  }

  beginIntake(cycle) {
    this.mawState = 'intake-windup';
    this.mawTimer = cycle.intakeWindup;
    this.swallowed = 0;
    this.salvo = 0;
    this.setTelegraph({
      type: 'intake',
      x: this.x,
      y: this.y,
      angle: this.facing,
      arc: MAW.cone.arc,
      length: MAW.cone.range,
      duration: cycle.intakeWindup,
      timer: cycle.intakeWindup,
      pulling: false,
    });
  }

  aimCone() {
    const t = this.telegraph;
    if (t?.type !== 'intake') return;
    t.x = this.x;
    t.y = this.y;
    t.angle = this.facing;
    t.timer = Math.max(0, this.mawTimer);
  }

  /** True when `point` lies in the intake's cone. */
  inCone(point, margin = 0) {
    const dx = point.x - this.x;
    const dy = point.y - this.y;
    if (Math.hypot(dx, dy) > MAW.cone.range + margin) return false;
    const off = Math.abs(wrapAngle(Math.atan2(dy, dx) - this.facing));
    return off <= MAW.cone.arc / 2;
  }

  // Rocks in the cone are dragged to the mouth and swallowed there; the ship
  // is drawn in gently; the open mouth hurts.
  pull(deltaTime, target) {
    const mouth = this.mouthPoint();
    const rocks = [];
    this.system?.forEachActiveEnemy?.((enemy) => {
      if (enemy.type === 'asteroid' && !enemy.destroyed) rocks.push(enemy);
    });
    for (const rock of rocks) {
      const dx = mouth.x - rock.x;
      const dy = mouth.y - rock.y;
      const d = Math.hypot(dx, dy);
      if (d <= MAW.swallowReach + (rock.radius || 0) * 0.5) {
        this.swallow(rock);
        continue;
      }
      if (!this.inCone(rock, rock.radius || 0)) continue;
      rock.vx += (dx / d) * MAW.rockPullAcceleration * deltaTime;
      rock.vy += (dy / d) * MAW.rockPullAcceleration * deltaTime;
      const speed = Math.hypot(rock.vx, rock.vy);
      if (speed > MAW.rockPullMaxSpeed) {
        rock.vx *= MAW.rockPullMaxSpeed / speed;
        rock.vy *= MAW.rockPullMaxSpeed / speed;
      }
    }

    const ship = target?.position;
    if (!ship || !this.jawsOpen) return;
    const dx = mouth.x - ship.x;
    const dy = mouth.y - ship.y;
    const d = Math.hypot(dx, dy) || 1;
    const velocity = target.player?.velocity;
    if (velocity && this.inCone(ship)) {
      const { shipPull } = this.cycle();
      velocity.vx += (dx / d) * shipPull * deltaTime;
      velocity.vy += (dy / d) * shipPull * deltaTime;
    }
    if (d <= MAW.mouthReach + this.radius * 0.25) {
      this.system?.applyDirectDamageToPlayer?.(
        Math.round(this.contactDamage * MAW.mouthDamageFactor),
        {
          cause: 'boss-maw',
          position: mouth,
          radius: MAW.mouthReach,
          source: this,
        }
      );
    }
  }

  // Gone without 'enemy-destroyed': no orbs, no kill, no combo. The layer
  // still counts it as gone, so it can close.
  swallow(rock) {
    rock.destroyed = true;
    this.system?.invalidateActiveEnemyCache?.();
    this.system?.waveManager?.onEnemyDestroyed?.({
      enemy: rock,
      swallowedBy: this.id,
    });
    this.swallowed += 1;
    this.swallowedTotal += 1;
  }

  ejectCount(cycle) {
    return Math.max(cycle.ejectMin, Math.min(MAW.eject.max, this.swallowed));
  }

  // The fan of the salvo about to leave: a later salvo has one rock fewer
  // and flies through the gaps of the one before.
  ejectAngles(cycle) {
    const count = this.ejectCount(cycle) - (this.salvo % 2);
    const step = cycle.fanArc / (this.ejectCount(cycle) - 1);
    const start = this.facing - (step * (count - 1)) / 2;
    return Array.from({ length: count }, (_, i) => start + step * i);
  }

  beginEject(cycle) {
    this.mawState = 'eject-windup';
    this.mawTimer = cycle.ejectWindup;
    this.salvo = 0;
    this.setTelegraph({
      type: 'eject',
      x: this.x,
      y: this.y,
      lines: [],
      duration: cycle.ejectWindup,
      timer: cycle.ejectWindup,
    });
    this.aimFan(cycle);
  }

  // A line per rock from the mouth, along where each will fly.
  aimFan(cycle) {
    const t = this.telegraph;
    if (t?.type !== 'eject') return;
    const mouth = this.mouthPoint();
    t.x = this.x;
    t.y = this.y;
    t.timer = Math.max(0, this.mawTimer);
    t.lines = this.ejectAngles(cycle).map((angle) => ({
      x: mouth.x,
      y: mouth.y,
      angle,
      length: MAW.cone.range * 0.7,
    }));
  }

  // What it ate, spat back as ordinary field rocks (they pay when broken).
  eject(cycle) {
    const mouth = this.mouthPoint();
    const { size, heavySize } = MAW.eject;
    const speed = cycle.ejectSpeed;
    const angles = this.ejectAngles(cycle);
    // The heavy rocks sit at the fan's centre.
    const firstHeavy = Math.floor((angles.length - cycle.heavy) / 2);
    angles.forEach((angle, i) => {
      const heavy = i >= firstHeavy && i < firstHeavy + cycle.heavy;
      this.spawnChild('asteroid', {
        size: heavy ? heavySize : size,
        variant: 'common',
        x: mouth.x,
        y: mouth.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      });
    });
  }
}

export default SentinelQuarryMaw;
