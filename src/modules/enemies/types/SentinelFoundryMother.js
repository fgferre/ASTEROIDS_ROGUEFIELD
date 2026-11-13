import { BOSS_KINDS, wardenComponents } from '../../../data/enemies/boss.js';
import { driftToCentre } from '../boss/drift.js';
import { SHIP_REACH } from '../boss/playerTarget.js';
import { BossEnemy } from './BossEnemy.js';

const MOTHER = BOSS_KINDS['foundry-mother'];
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const BAYS = 2;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const wrapAngle = (angle) => {
  const a = (((angle + Math.PI) % TAU) + TAU) % TAU;
  return a - Math.PI;
};

// Sentinel Foundry Mother (src/content/bosses/foundry-mother.js), one loop:
//   drift    — shut, it steers toward mid-field;
//   assemble — it stops; as many bays as its escort cap allows (none: it goes
//              straight to the sweep) open for `bays.warn` s, then build for
//              `cycle.build` s; each finished bay spawns one escort through
//              the Warden's minion path (spawnMinion). Open, it takes full
//              damage; `scrapShare` of its max health lost during one
//              assembly scraps the units (no spawn), and it reels:
//   stagger  — `stagger` s, still and shut; its next vent is `scrapVent` s
//              longer;
//   sweep    — two opposite arms show their ring segments for `arms.warn` s,
//              placed so the ship sits mid-swing and reaching `arms.lead` px
//              past the ship's distance (within `arms.outer`..`maxReach`),
//              then swing `cycle.sweepArc`
//              degrees in `cycle.sweepTime` s (direction alternating each
//              cycle); a tick every `burnTick` s while the ship's centre is in
//              a swinging segment; rocks and enemies ignore them;
//   vent     — the arms hang, the shell is open: full damage, for
//              `cycle.vent` s (+ the scrap's bonus); then the drift again.
// Outside assemble and vent the shell lets `shellDamageFactor` in. Its
// escorts outlive it as ordinary enemies, as Warden Prime's do.
// What the view reads:
//   ventOpen — 0..1, the shell open (1) or shut (0);
//   bays     — [{ open 0..1, progress 0..1 }] ×2, a bay's doors and its build;
//   arms     — null or { type: 'arms', x, y, segments: [{ angle (centre of
//              the segment), width, inner, outer }], solid 0..1, phase
//              'warn'|'sweep', timer, duration };
//   armAngle — radians, arm 0's direction (arm 1 is opposite);
//   armReach — 0..1, the arms folded (0) or extended (1);
//   armOuter — px, the claw's distance at armReach 1: this swing's reach,
//              the segments' `outer` (the same number draws and hits).
export class SentinelFoundryMother extends BossEnemy {
  initialize(config = {}) {
    super.initialize({
      ...config,
      displayName: MOTHER.displayName,
      healthFactor: MOTHER.healthFactor,
      radius: MOTHER.radius,
      rewards: MOTHER.rewards,
      phaseThresholds: MOTHER.phaseThresholds,
      phaseCount: MOTHER.phaseCount,
      invulnerabilityDuration: MOTHER.invulnerabilityDuration,
      components: config.components ?? wardenComponents('foundry-mother'),
    });
    this.bossKind = 'foundry-mother';
    this.tier = MOTHER.tier;
    this.subtitle = MOTHER.subtitle;
    this.movementStrategy = 'linear';
    // Its own escorts, among the minion types the field has.
    this.minionTypes = MOTHER.minionTypes.filter((type) =>
      this.minionTypes.includes(type)
    );
    this.foundryTimer = this.cycle().drift;
    return this;
  }

  resetForPool() {
    super.resetForPool();
    this.foundryState = 'drift';
    this.foundryTimer = 0;
    this.assemblyStage = 'warn';
    this.assemblyDamage = 0;
    this.bayCount = 0;
    this.bays = Array.from({ length: BAYS }, () => ({ open: 0, progress: 0 }));
    this.escorts = [];
    this.ventBonus = 0;
    this.ventOpen = 0;
    this.arms = null;
    this.armAngle = 0;
    this.armReach = 0;
    this.armOuter = MOTHER.arms.outer;
    this.sweepFrom = 0;
    this.sweepArc = 0;
    this.sweeps = 0;
    this.burnTimer = 0;
  }

  cycle() {
    return MOTHER.cycle[Math.min(this.currentPhase, MOTHER.cycle.length - 1)];
  }

  get exposed() {
    return this.foundryState === 'assemble' || this.foundryState === 'vent';
  }

  // Shut, the shell soaks most of a hit and rings dull (the Bulwark's
  // clang); building or venting, all of it lands, and what it loses while
  // building counts toward scrapping the units.
  takeDamage(amount, source = null) {
    if (!this.exposed) {
      if (amount > 0 && !this.invulnerable && !this.intangible) {
        const at = source?.hitPosition ?? { x: this.x, y: this.y };
        this.getEventBus()?.emit?.('bulwark-plate-hit', {
          enemy: this,
          enemyId: this.id,
          position: { x: at.x, y: at.y },
        });
      }
      return super.takeDamage(amount * MOTHER.shellDamageFactor, source);
    }
    const before = this.health;
    const killed = super.takeDamage(amount, source);
    if (this.foundryState === 'assemble' && this.alive) {
      this.assemblyDamage += before - this.health;
      if (this.assemblyDamage >= MOTHER.scrapShare * this.maxHealth) {
        this.scrap();
      }
    }
    return killed;
  }

  // The phase step restores the phase movement; it always steers itself.
  advancePhase() {
    super.advancePhase();
    this.movementStrategy = 'linear';
  }

  // On the entrance its arms are its pieces: unfolded, folded on arrival.
  poseArrival(open) {
    this.armReach = open;
  }

  // Every escort it builds is remembered, to hold the cap.
  spawnChild(type, config) {
    const child = super.spawnChild(type, config);
    if (child) this.escorts.push({ enemy: child, id: child.id });
    return child;
  }

  /** Its escorts still alive (a pooled one reused under a new id is not). */
  escortsAlive() {
    this.escorts = this.escorts.filter(
      ({ enemy, id }) => enemy.alive && enemy.id === id
    );
    return this.escorts.length;
  }

  handlePhaseIntro(deltaTime, target) {
    this.updateFoundry(deltaTime, target);
  }

  handlePhaseAssault(deltaTime, target) {
    this.updateFoundry(deltaTime, target);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateFoundry(deltaTime, target);
  }

  updateFoundry(deltaTime, target) {
    const position = target?.position ?? null;
    const cycle = this.cycle();
    this.foundryTimer -= deltaTime;
    switch (this.foundryState) {
      case 'assemble':
        this.holdStill(deltaTime);
        this.updateBays(deltaTime, cycle, position);
        break;
      case 'stagger':
        this.holdStill(deltaTime);
        if (this.foundryTimer <= 0) this.beginSweep(cycle, position);
        break;
      case 'sweep':
        this.holdStill(deltaTime);
        this.updateArms(cycle);
        break;
      case 'vent':
        this.holdStill(deltaTime);
        if (this.foundryTimer <= 0) {
          this.foundryState = 'drift';
          this.foundryTimer = cycle.drift;
        }
        break;
      default:
        driftToCentre(this, deltaTime, MOTHER.drift);
        if (this.foundryTimer <= 0 && position) {
          this.beginAssembly(cycle, position);
        }
        break;
    }
    const arms = this.foundryState === 'sweep' || this.foundryState === 'vent';
    this.ease(
      'ventOpen',
      this.foundryState === 'vent',
      MOTHER.ventSpeed,
      deltaTime
    );
    this.ease('armReach', arms, MOTHER.arms.reachSpeed, deltaTime);
    if (this.foundryState !== 'assemble') {
      const step = MOTHER.bays.closeSpeed * deltaTime;
      for (const bay of this.bays) bay.open = Math.max(0, bay.open - step);
    }
    if (this.arms) this.placeArms();
    this.burn(deltaTime, target);
  }

  ease(field, open, speed, deltaTime) {
    const step = speed * deltaTime;
    const goal = open ? 1 : 0;
    this[field] += Math.max(-step, Math.min(step, goal - this[field]));
  }

  holdStill(deltaTime) {
    this.movementStrategy = 'linear';
    const keep = Math.max(0, 1 - 4 * deltaTime);
    this.vx *= keep;
    this.vy *= keep;
  }

  // ASSEMBLE: a bay opens only if its escort stays inside the cap.
  beginAssembly(cycle, position) {
    const room = cycle.escortCap - this.escortsAlive();
    this.bayCount = this.minionTypes.length
      ? Math.max(0, Math.min(BAYS, room))
      : 0;
    if (!this.bayCount) {
      this.beginSweep(cycle, position);
      return;
    }
    this.foundryState = 'assemble';
    this.assemblyStage = 'warn';
    this.foundryTimer = MOTHER.bays.warn;
    this.assemblyDamage = 0;
    for (const bay of this.bays) bay.progress = 0;
  }

  // The doors open over the warning, then each open bay builds; done, one
  // escort per bay and the sweep.
  updateBays(deltaTime, cycle, position) {
    const open = this.bays.slice(0, this.bayCount);
    if (this.assemblyStage === 'warn') {
      const opened = clamp01(1 - this.foundryTimer / MOTHER.bays.warn);
      for (const bay of open) bay.open = opened;
      if (this.foundryTimer <= 0) this.assemblyStage = 'build';
      return;
    }
    for (const bay of open) {
      bay.progress = Math.min(1, bay.progress + deltaTime / cycle.build);
    }
    if (open[0].progress < 1) return;
    for (const bay of open) {
      bay.progress = 0;
      this.spawnMinion();
    }
    this.beginSweep(cycle, position);
  }

  // Hit hard enough while building: the units are scrapped and it reels.
  scrap() {
    for (const bay of this.bays) bay.progress = 0;
    this.foundryState = 'stagger';
    this.foundryTimer = MOTHER.stagger;
    this.ventBonus = MOTHER.scrapVent;
  }

  // SWEEP: arm 0 starts half a swing behind the ship's bearing, so the ship
  // sits mid-swing; the direction alternates each cycle.
  beginSweep(cycle, position) {
    const { warn, outer, lead, maxReach } = MOTHER.arms;
    const turn = this.sweeps % 2 === 0 ? 1 : -1;
    const bearing = position
      ? Math.atan2(position.y - this.y, position.x - this.x)
      : this.armAngle;
    const distance = position
      ? Math.hypot(position.x - this.x, position.y - this.y)
      : 0;
    this.armOuter = Math.min(maxReach, Math.max(outer, distance + lead));
    this.foundryState = 'sweep';
    this.foundryTimer = warn;
    this.sweepArc = turn * cycle.sweepArc * DEG;
    this.sweepFrom = bearing - this.sweepArc / 2;
    this.armAngle = this.sweepFrom;
    this.arms = {
      type: 'arms',
      x: this.x,
      y: this.y,
      segments: [],
      solid: 0,
      phase: 'warn',
      timer: warn,
      duration: warn,
    };
    this.placeArms();
  }

  // Warn → swing (`cycle.sweepTime`) → vent.
  updateArms(cycle) {
    const a = this.arms;
    if (a.phase === 'warn') {
      if (this.foundryTimer > 0) return;
      Object.assign(a, { phase: 'sweep', solid: 1 });
      this.foundryTimer = a.duration = cycle.sweepTime;
      // The arms swing: their sound (eventCues `boss-attack-started`).
      this.getEventBus()?.emit?.('boss-attack-started', {
        enemy: this,
        enemyId: this.id,
        position: { x: this.x, y: this.y },
      });
    }
    const progress = clamp01(1 - this.foundryTimer / a.duration);
    this.armAngle = this.sweepFrom + this.sweepArc * progress;
    if (this.foundryTimer > 0) return;
    this.arms = null;
    this.sweeps += 1;
    this.foundryState = 'vent';
    this.foundryTimer = cycle.vent + this.ventBonus;
    this.ventBonus = 0;
  }

  placeArms() {
    const a = this.arms;
    const { inner, width } = MOTHER.arms;
    a.x = this.x;
    a.y = this.y;
    a.timer = Math.max(0, this.foundryTimer);
    a.segments = [0, 1].map((i) => ({
      angle: wrapAngle(this.armAngle + i * Math.PI),
      width: width * DEG,
      inner,
      outer: this.armOuter,
    }));
  }

  /** True when `point` is inside one of the arms' ring segments. */
  inArm(point) {
    const a = this.arms;
    if (!a) return false;
    const distance = Math.hypot(point.x - a.x, point.y - a.y);
    const bearing = Math.atan2(point.y - a.y, point.x - a.x);
    return a.segments.some(
      (s) =>
        distance >= s.inner &&
        distance <= s.outer &&
        Math.abs(wrapAngle(bearing - s.angle)) <= s.width / 2
    );
  }

  // One tick every `burnTick` s while the ship's centre is in a swinging
  // arm's segment (the first on being caught).
  burn(deltaTime, target) {
    const ship = target?.position;
    if (!ship || this.arms?.phase !== 'sweep' || !this.inArm(ship)) {
      this.burnTimer = 0;
      return;
    }
    this.burnTimer -= deltaTime;
    if (this.burnTimer > 0) return;
    this.burnTimer += MOTHER.burnTick;
    this.system?.applyDirectDamageToPlayer?.(
      Math.round(this.contactDamage * MOTHER.arms.damageFactor),
      {
        cause: 'boss-arm',
        position: { ...ship },
        radius: target?.player?.getHullBoundingRadius?.() ?? SHIP_REACH,
        source: this,
      }
    );
  }
}

export default SentinelFoundryMother;
