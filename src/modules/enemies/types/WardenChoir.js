import { WARDEN_KINDS, wardenComponents } from '../../../data/enemies/boss.js';
import { BossEnemy } from './BossEnemy.js';

const CHOIR = WARDEN_KINDS.choir;
const TAU = Math.PI * 2;
// How much farther out the cores fly, fully open on the entrance.
const ARRIVAL_SPREAD = 1.2;

// Warden Choir (layer 10): three cores orbit a shared centre. One sings —
// lit, takes full damage, fires the fan — and the voice passes every
// `singDuration` s; the dim ones take `dimDamageFactor`. Every
// `chorusInterval` s all remaining cores fire at one point, announced by a
// line from each. Each phase threshold breaks the singing core off.
export class WardenChoir extends BossEnemy {
  initialize(config = {}) {
    super.initialize({
      ...config,
      displayName: CHOIR.displayName,
      healthFactor: CHOIR.healthFactor,
      radius: CHOIR.radius,
      spreadProjectileCount: CHOIR.spreadProjectileCount,
      spreadArc: CHOIR.spreadArc,
      spreadCooldown: CHOIR.spreadCooldown,
      spreadVariance: CHOIR.spreadVariance,
      spreadWindup: CHOIR.spreadWindup,
      components: config.components ?? wardenComponents('choir'),
    });
    this.bossKind = 'choir';
    this.subtitle = CHOIR.subtitle;
    this.cores = [];
    for (let i = 0; i < CHOIR.coreCount; i += 1) {
      this.cores.push({
        index: i,
        offset: (i * TAU) / CHOIR.coreCount,
        alive: true,
        x: this.x,
        y: this.y,
      });
    }
    this.updateCorePositions();
    return this;
  }

  resetForPool() {
    super.resetForPool();
    this.cores = [];
    this.orbitAngle = 0;
    this.singingIndex = 0;
    this.singTimer = CHOIR.singDuration;
    this.chorusTimer = CHOIR.chorusInterval;
    this.chorusWindupTimer = 0;
    this.coreSpread = 1;
  }

  singingCore() {
    return this.cores[this.singingIndex];
  }

  attackOrigin() {
    return this.singingCore() || this;
  }

  lostCoreCount() {
    return this.cores.reduce((sum, core) => sum + (core.alive ? 0 : 1), 0);
  }

  updateCorePositions() {
    const orbit = CHOIR.coreOrbitRadius * this.coreSpread;
    for (const core of this.cores) {
      const angle = this.orbitAngle + core.offset;
      core.x = this.x + Math.cos(angle) * orbit;
      core.y = this.y + Math.sin(angle) * orbit;
    }
  }

  // Each core lights the edge as it crosses on the entrance.
  arrivalBodies() {
    return this.cores;
  }

  // On the entrance the cores fly wide and spin fast, then draw in.
  poseArrival(open, spin, deltaTime) {
    this.coreSpread = 1 + ARRIVAL_SPREAD * open;
    this.orbitAngle =
      (this.orbitAngle + (CHOIR.orbitSpeed + spin) * deltaTime) % TAU;
    this.updateCorePositions();
  }

  // The voice moves to the next living core; a fan being announced by the
  // old voice is dropped, not fired from the new one.
  passVoice() {
    const count = this.cores.length;
    for (let step = 1; step <= count; step += 1) {
      const index = (this.singingIndex + step) % count;
      if (this.cores[index].alive) {
        this.singingIndex = index;
        break;
      }
    }
    this.singTimer = CHOIR.singDuration;
    if (this.spreadWindupTimer > 0) {
      this.spreadWindupTimer = 0;
      this.spreadTimer = this.computeSpreadCooldown();
      if (this.telegraph?.type === 'fan') this.clearTelegraph();
    }
  }

  // One core breaks off per phase reached (the singing one), never the last.
  syncCores() {
    const target = Math.min(this.currentPhase, this.cores.length - 1);
    while (this.lostCoreCount() < target) {
      this.singingCore().alive = false;
      this.chorusWindupTimer = 0;
      this.clearTelegraph();
      this.passVoice();
    }
  }

  advancePhase() {
    super.advancePhase();
    this.syncCores();
  }

  // A hit counts against the core nearest to it.
  takeDamage(amount, source = null) {
    return super.takeDamage(
      amount * this.damageFactorAt(source?.hitPosition),
      source
    );
  }

  damageFactorAt(position) {
    if (!position || !this.cores.length) return 1;
    let nearest = null;
    let best = Infinity;
    for (const core of this.cores) {
      if (!core.alive) continue;
      const d = Math.hypot(position.x - core.x, position.y - core.y);
      if (d < best) {
        best = d;
        nearest = core;
      }
    }
    return nearest === this.singingCore() ? 1 : CHOIR.dimDamageFactor;
  }

  handlePhaseIntro(deltaTime, target) {
    this.updateChoir(deltaTime, target);
  }

  handlePhaseAssault(deltaTime, target) {
    this.updateChoir(deltaTime, target);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateChoir(deltaTime, target);
  }

  updateChoir(deltaTime, target) {
    this.syncCores();
    const spin =
      CHOIR.orbitSpeed + this.lostCoreCount() * CHOIR.orbitSpeedPerLostCore;
    this.orbitAngle = (this.orbitAngle + spin * deltaTime) % TAU;
    this.updateCorePositions();

    this.singTimer -= deltaTime;
    if (this.singTimer <= 0) this.passVoice();

    if (this.updateChorus(deltaTime, target)) return;
    this.updateSpreadCycle(deltaTime, target);
  }

  // Returns true while the chorus is being announced (the fan waits).
  updateChorus(deltaTime, target) {
    if (this.chorusWindupTimer > 0) {
      this.chorusWindupTimer -= deltaTime;
      this.aimChorusLines();
      if (this.chorusWindupTimer <= 0) {
        this.fireChorus();
        this.clearTelegraph();
        this.chorusTimer = CHOIR.chorusInterval;
      }
      return true;
    }
    if (this.spreadWindupTimer > 0) return false;

    this.chorusTimer -= deltaTime;
    if (this.chorusTimer > 0 || !target?.position) return false;

    this.chorusWindupTimer = CHOIR.chorusWindup;
    this.setTelegraph({
      type: 'chorus',
      focus: { x: target.position.x, y: target.position.y },
      lines: this.cores
        .filter((core) => core.alive)
        .map((core) => ({ x: core.x, y: core.y, angle: 0, length: 0 })),
      duration: CHOIR.chorusWindup,
      timer: CHOIR.chorusWindup,
    });
    this.aimChorusLines();
    return true;
  }

  // Lines run from each living core to the locked focus point.
  aimChorusLines() {
    const t = this.telegraph;
    if (t?.type !== 'chorus') return;
    t.timer = Math.max(0, this.chorusWindupTimer);
    const alive = this.cores.filter((core) => core.alive);
    t.lines.length = alive.length;
    alive.forEach((core, i) => {
      const line = t.lines[i] || (t.lines[i] = {});
      line.x = core.x;
      line.y = core.y;
      line.angle = Math.atan2(t.focus.y - core.y, t.focus.x - core.x);
      line.length = Math.hypot(t.focus.x - core.x, t.focus.y - core.y);
    });
  }

  fireChorus() {
    const t = this.telegraph;
    const focus = t?.focus;
    if (!focus) return;
    const shots = Math.max(1, CHOIR.chorusShots);
    for (const core of this.cores) {
      if (!core.alive) continue;
      const base = Math.atan2(focus.y - core.y, focus.x - core.x);
      for (let k = 0; k < shots; k += 1) {
        this.emitBossProjectile({
          angle: base + (k - (shots - 1) / 2) * CHOIR.chorusSpread,
          speed: CHOIR.chorusProjectileSpeed,
          damage: this.projectileDamage,
          pattern: 'chorus',
          origin: core,
        });
      }
    }
  }
}

export default WardenChoir;
