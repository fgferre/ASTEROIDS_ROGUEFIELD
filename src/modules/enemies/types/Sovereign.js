import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { BOSS_KINDS, wardenComponents } from '../../../data/enemies/boss.js';
import { fieldSpan, pressBarrier, tickBarrier } from '../boss/barrier.js';
import { driftToCentre } from '../boss/drift.js';
import { pullRocks } from '../boss/rockPull.js';
import { BossEnemy } from './BossEnemy.js';

const SOV = BOSS_KINDS.sovereign;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
// Plates this open count as open: the core takes full damage.
const OPEN_AT = 0.5;
// A gap this long hides one half of a line (the third phase's wall).
const FAR = 4000;
// The lanes keep this far (rad) inside the PROTECT half.
const LANE_MARGIN = 0.15;

const wrapAngle = (angle) => {
  const a = (((angle + Math.PI) % TAU) + TAU) % TAU;
  return a - Math.PI;
};

// Sovereign (src/content/bosses/sovereign.js), the campaign's last boss. Its
// orders, first and second phase, one after the other:
//   protect-windup — the plates shut; the wall warns, still, through its
//                    centre, its + half `barrier.lead` rad short of the ship;
//   protect        — the wall is solid (hurts and pushes, boss/barrier.js)
//                    and turns `cycle.sweep` rad/s for `cycle.protect` s, the
//                    direction alternating each time; its gap sits
//                    `barrier.gapRadius` px out on the half that reaches the
//                    ship first. `cycle.volleys` lane volleys in the hold;
//   rebuild-windup — the plates open; a cone toward the ship warns;
//   rebuild        — the core is exposed; the cone pulls rocks (absorbed at
//                    the hull, each `pull.rockWorth` of the assembly) and the
//                    ship (`cycle.shipPull`) while it assembles for
//                    `cycle.build` s, then escorts (up to `cycle.escortCap`
//                    of its own alive) and PROTECT again. `scrapShare` of its
//                    health lost in one assembly scraps it:
//   stagger        — `stagger` s, open and still, then PROTECT.
// Below the second threshold, both at once:
//   split-windup   — the split line through it warns (`split.windup` s), the
//                    REBUILD half toward the ship;
//   split          — the line turns `split.spin` rad/s. Hits from the REBUILD
//                    half land in full, from the PROTECT half
//                    `protectDamageFactor`; the REBUILD half pulls (rocks and
//                    ship, within `split.range`) and assembles as above; the
//                    PROTECT half fires a lane volley every
//                    `split.volleyEvery` s and carries a solid wall along its
//                    middle. Each assembly done, and each one scrapped
//                    (`split.scrapShare`), the orders change sides:
//   split-flip     — `split.flipWindup` s: the line stops and warns, nothing
//                    pulls, the wall warns along the middle of the half that
//                    is REBUILD now; then `splitAngle` turns π at once (the
//                    halves trade places), the wall is solid there and a lane
//                    volley follows `split.flipVolley` s later.
// Shut (PROTECT), every hit lands `protectDamageFactor`.
// What the view (and the later model) reads:
//   order      — 'protect' | 'rebuild' | 'both' (third phase);
//   plateOpen  — 0..1, the plate ring shut (0) or open (1); with 'both' the
//                plates on the REBUILD half open, the others shut;
//   plateTurn  — radians, the plate ring's turn;
//   splitAngle — radians, the split line's direction; the REBUILD half is
//                the one `splitAngle + π/2` points into;
//   build      — 0..1, the assembly in progress;
//   barrier    — null or the wall (boss/barrier.js's telegraph; `ray` on the
//                third phase's);
//   telegraph  — null or the REBUILD cone ({ type: 'intake', … }, the Quarry
//                Maw's);
//   beams      — null or a lane volley ({ type: 'eject', lines, … });
//   split      — null or { type: 'split', x, y, angle, phase 'warn'|'turn',
//                timer, duration } ('warn' again through a split-flip; the
//                model may read `sovState === 'split-flip'` and `sovTimer`
//                to move its shells ahead of the π turn).
// For the bot (botPilotAdapter): ventOpen (exposed), shieldUp and facing
// (third phase: the PROTECT half's direction).
export class Sovereign extends BossEnemy {
  initialize(config = {}) {
    super.initialize({
      ...config,
      displayName: SOV.displayName,
      healthFactor: SOV.healthFactor,
      radius: SOV.radius,
      rewards: SOV.rewards,
      phaseThresholds: SOV.phaseThresholds,
      phaseCount: SOV.phaseCount,
      invulnerabilityDuration: SOV.invulnerabilityDuration,
      components: config.components ?? wardenComponents('sovereign'),
    });
    this.bossKind = 'sovereign';
    this.tier = SOV.tier;
    this.subtitle = SOV.subtitle;
    this.movementStrategy = 'linear';
    // Its own escorts, among the minion types the field has.
    this.minionTypes = SOV.minionTypes.filter((type) =>
      this.minionTypes.includes(type)
    );
    this.facing = Math.atan2(GAME_HEIGHT / 2 - this.y, GAME_WIDTH / 2 - this.x);
    this.sovTimer = this.cycle().protectWindup;
    return this;
  }

  resetForPool() {
    super.resetForPool();
    this.sovState = 'start';
    this.sovTimer = 0;
    this.order = 'protect';
    this.plateOpen = 0;
    this.plateTurn = 0;
    this.splitAngle = 0;
    this.build = 0;
    this.assemblyDamage = 0;
    this.escorts = [];
    this.facing = 0;
    this.barrier = null;
    this.beams = null;
    this.split = null;
    this.sweeps = 0;
    this.volleysLeft = 0;
    this.volleyTimer = 0;
    this.shotsLeft = 0;
    this.shotTimer = 0;
    this.shipAt = null;
    this.ventOpen = 0;
    this.shieldUp = 0;
  }

  cycle() {
    return SOV.cycle[Math.min(this.currentPhase, SOV.cycle.length - 1)];
  }

  /** Assembling: what it loses now counts toward a scrap. */
  get building() {
    return this.sovState === 'rebuild' || this.sovState === 'split';
  }

  /** Which half `point` is on: above 0 REBUILD, below 0 PROTECT. */
  sideOf(point) {
    return (
      -(point.x - this.x) * Math.sin(this.splitAngle) +
      (point.y - this.y) * Math.cos(this.splitAngle)
    );
  }

  /** True when a hit at `hit` (or with no hit point) is soaked. */
  shielded(hit) {
    if (this.order === 'both') return Boolean(hit) && this.sideOf(hit) < 0;
    return this.plateOpen < OPEN_AT;
  }

  // Shut (or hit from the PROTECT half) it soaks most of a hit and rings
  // dull (the Bulwark's clang); open, all of it lands, and what it loses
  // while assembling counts toward scrapping the assembly.
  takeDamage(amount, source = null) {
    const hit = source?.hitPosition;
    if (this.shielded(hit)) {
      if (amount > 0 && !this.invulnerable && !this.intangible) {
        const at = hit ?? { x: this.x, y: this.y };
        this.getEventBus()?.emit?.('bulwark-plate-hit', {
          enemy: this,
          enemyId: this.id,
          position: { x: at.x, y: at.y },
        });
      }
      return super.takeDamage(amount * SOV.protectDamageFactor, source);
    }
    const before = this.health;
    const killed = super.takeDamage(amount, source);
    if (this.building && this.alive) {
      this.assemblyDamage += before - this.health;
      const share =
        this.order === 'both' ? SOV.split.scrapShare : SOV.scrapShare;
      if (this.assemblyDamage >= share * this.maxHealth) this.scrap();
    }
    return killed;
  }

  // It always steers itself; the last phase gives both orders at once.
  advancePhase() {
    const before = this.currentPhase;
    super.advancePhase();
    this.movementStrategy = 'linear';
    if (this.currentPhase >= 2 && before < 2) this.beginSplit();
  }

  // On the entrance its plates are its pieces: flung open, shut on arrival.
  poseArrival(open) {
    this.plateOpen = open;
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
    this.updateSovereign(deltaTime, target);
  }

  handlePhaseAssault(deltaTime, target) {
    this.updateSovereign(deltaTime, target);
  }

  handlePhaseFinale(deltaTime, target) {
    this.updateSovereign(deltaTime, target);
  }

  updateSovereign(deltaTime, target) {
    const position = target?.position ?? null;
    if (position) this.shipAt = { x: position.x, y: position.y };
    const cycle = this.cycle();
    this.sovTimer -= deltaTime;
    driftToCentre(this, deltaTime, SOV.drift);
    switch (this.sovState) {
      case 'protect-windup':
        if (this.sovTimer <= 0) {
          this.sovState = 'protect';
          this.sovTimer = cycle.protect;
          this.volleysLeft = cycle.volleys;
          this.volleyTimer = cycle.protect / (cycle.volleys + 1);
        }
        break;
      case 'protect':
        this.volleyTimer -= deltaTime;
        // one volley at a time: the next waits for the last shots
        if (
          this.volleysLeft > 0 &&
          this.volleyTimer <= 0 &&
          !this.beams &&
          position
        ) {
          this.volleysLeft -= 1;
          this.volleyTimer = cycle.protect / (cycle.volleys + 1);
          this.beginLanes(this.bearingTo(position));
        }
        if (this.sovTimer <= 0) this.beginRebuild(cycle, position);
        break;
      case 'rebuild-windup':
        this.aimCone(deltaTime, position);
        if (this.sovTimer <= 0) {
          this.sovState = 'rebuild';
          this.sovTimer = cycle.build;
          if (this.telegraph) {
            this.telegraph.pulling = true;
            this.telegraph.duration = cycle.build;
          }
        }
        break;
      case 'rebuild':
        this.aimCone(deltaTime, position);
        this.pull(deltaTime, target, cycle.shipPull, (point, margin) =>
          this.inCone(point, cycle, margin)
        );
        if (this.assemble(deltaTime, cycle.build, cycle.escortCap)) {
          this.beginProtect(cycle, position);
        }
        break;
      case 'stagger':
        if (this.sovTimer <= 0) this.beginProtect(cycle, position);
        break;
      case 'split-windup':
      case 'split-flip':
      case 'split':
        this.updateSplit(deltaTime, target);
        break;
      default:
        if (this.sovTimer <= 0 && position) this.beginProtect(cycle, position);
        break;
    }
    this.updateBarrier(deltaTime, target);
    this.updateLanes(deltaTime);
    this.movePlates(deltaTime);
    // What the bot reads (botPilotAdapter): open, and in the last phase the
    // PROTECT half as a plate to go round.
    const both = this.order === 'both';
    this.ventOpen = both ? 1 : this.plateOpen;
    this.shieldUp = both ? 1 : 0;
    if (both) this.facing = this.splitAngle - HALF_PI;
  }

  bearingTo(point) {
    return Math.atan2(point.y - this.y, point.x - this.x);
  }

  // The plates follow the order; shut they turn fast, open slowly.
  movePlates(deltaTime) {
    const open =
      this.order === 'both' ||
      this.sovState === 'rebuild-windup' ||
      this.sovState === 'rebuild' ||
      this.sovState === 'stagger';
    const step = SOV.plateSpeed * deltaTime;
    const goal = open ? 1 : 0;
    this.plateOpen += Math.max(-step, Math.min(step, goal - this.plateOpen));
    const spin = this.order === 'protect' ? 'protect' : 'rebuild';
    this.plateTurn = wrapAngle(
      this.plateTurn + SOV.plateSpin[spin] * deltaTime
    );
  }

  // PROTECT: the wall warns still, its + half `lead` rad short of the ship,
  // then turns toward it; the gap is on that half.
  beginProtect(cycle, position) {
    this.sovState = 'protect-windup';
    this.order = 'protect';
    this.sovTimer = cycle.protectWindup;
    this.clearTelegraph();
    const turn = this.sweeps % 2 === 0 ? 1 : -1;
    this.sweeps += 1;
    const bearing = position ? this.bearingTo(position) : this.facing;
    this.barrier = {
      type: 'barrier',
      x: this.x,
      y: this.y,
      angle: wrapAngle(bearing - turn * SOV.barrier.lead),
      gapAt: SOV.barrier.gapRadius,
      gapWidth: SOV.barrier.gapWidth,
      span: [0, 0],
      spin: turn * cycle.sweep,
      solid: 0,
      phase: 'warn',
      hold: cycle.protect,
      timer: cycle.protectWindup,
      duration: cycle.protectWindup,
    };
    this.placeLine(this.barrier);
    // Its plates shut: its sound (eventCues `boss-attack-started`).
    this.getEventBus()?.emit?.('boss-attack-started', {
      enemy: this,
      enemyId: this.id,
      position: { x: this.x, y: this.y },
    });
  }

  placeLine(b) {
    b.x = this.x;
    b.y = this.y;
    b.span = fieldSpan(this.x, this.y, Math.cos(b.angle), Math.sin(b.angle));
  }

  // The PROTECT wall keeps its own clock (boss/barrier.js) and turns while
  // solid; the third phase's (`ray`) follows the split line instead.
  updateBarrier(deltaTime, target) {
    const b = this.barrier;
    if (!b) return;
    if (!b.ray) {
      if (!tickBarrier(b, deltaTime, SOV.barrier.fade)) {
        this.barrier = null;
        return;
      }
      if (b.phase === 'solid')
        b.angle = wrapAngle(b.angle + b.spin * deltaTime);
    }
    this.placeLine(b);
    if (b.phase === 'solid') pressBarrier(this, b, target, SOV.barrier);
  }

  // A lane volley: `lanes.count` lines round `centre`, warning, then shots.
  beginLanes(centre) {
    const { count, spread, warn, length, shots } = SOV.lanes;
    this.beams = {
      type: 'eject',
      x: this.x,
      y: this.y,
      lines: Array.from({ length: count }, (_, i) => ({
        x: this.x,
        y: this.y,
        angle: centre + (i - (count - 1) / 2) * spread,
        length,
      })),
      timer: warn,
      duration: warn,
    };
    this.shotsLeft = shots;
    this.shotTimer = 0;
  }

  updateLanes(deltaTime) {
    const b = this.beams;
    if (!b) return;
    b.timer = Math.max(0, b.timer - deltaTime);
    b.x = this.x;
    b.y = this.y;
    for (const line of b.lines) {
      line.x = this.x;
      line.y = this.y;
    }
    if (b.timer > 0) return;
    this.shotTimer -= deltaTime;
    if (this.shotTimer > 0) return;
    this.shotTimer = SOV.lanes.shotGap;
    for (const line of b.lines) {
      this.emitBossProjectile({
        angle: line.angle,
        speed: SOV.lanes.speed,
        damage: Math.round(this.projectileDamage * SOV.lanes.damageFactor),
        pattern: 'lane',
      });
    }
    this.shotsLeft -= 1;
    if (this.shotsLeft <= 0) this.beams = null;
  }

  // REBUILD: the plates open and a cone toward the ship warns.
  beginRebuild(cycle, position) {
    this.sovState = 'rebuild-windup';
    this.order = 'rebuild';
    this.sovTimer = cycle.rebuildWindup;
    this.build = 0;
    this.assemblyDamage = 0;
    if (position) this.facing = this.bearingTo(position);
    this.setTelegraph({
      type: 'intake',
      x: this.x,
      y: this.y,
      angle: this.facing,
      arc: cycle.arc,
      length: cycle.range,
      duration: cycle.rebuildWindup,
      timer: cycle.rebuildWindup,
      pulling: false,
    });
  }

  // The cone follows the ship, slowly.
  aimCone(deltaTime, position) {
    if (position) {
      const step = SOV.pull.turnRate * deltaTime;
      const turn = wrapAngle(this.bearingTo(position) - this.facing);
      this.facing = wrapAngle(
        this.facing + Math.max(-step, Math.min(step, turn))
      );
    }
    const t = this.telegraph;
    if (t?.type !== 'intake') return;
    t.x = this.x;
    t.y = this.y;
    t.angle = this.facing;
    t.timer = Math.max(0, this.sovTimer);
  }

  /** True when `point` lies in the REBUILD cone. */
  inCone(point, cycle, margin = 0) {
    const dx = point.x - this.x;
    const dy = point.y - this.y;
    if (Math.hypot(dx, dy) > cycle.range + margin) return false;
    return (
      Math.abs(wrapAngle(Math.atan2(dy, dx) - this.facing)) <= cycle.arc / 2
    );
  }

  /** True when `point` is in the REBUILD half, within the split's range. */
  inRebuildHalf(point, margin = 0) {
    const reach = Math.hypot(point.x - this.x, point.y - this.y);
    return reach <= SOV.split.range + margin && this.sideOf(point) > 0;
  }

  // Rocks where `inside` holds are dragged to the hull and absorbed there
  // (no rewards, no kill), each a share of the assembly; the ship is drawn
  // in at `shipPull` px/s².
  pull(deltaTime, target, shipPull, inside) {
    const { rockAcceleration, rockMaxSpeed, absorbReach, rockWorth } = SOV.pull;
    const rockPull = {
      reach: this.radius + absorbReach,
      acceleration: rockAcceleration,
      maxSpeed: rockMaxSpeed,
    };
    pullRocks(this, this, deltaTime, rockPull, inside, () => {
      this.build = Math.min(1, this.build + rockWorth);
    });
    const ship = target?.position;
    const velocity = target?.player?.velocity;
    if (!ship || !velocity || !inside(ship, 0)) return;
    const dx = this.x - ship.x;
    const dy = this.y - ship.y;
    const d = Math.hypot(dx, dy) || 1;
    velocity.vx += (dx / d) * shipPull * deltaTime;
    velocity.vy += (dy / d) * shipPull * deltaTime;
  }

  // The assembly: true once it is done, its escorts sent (two at most, as
  // many as the cap leaves room for).
  assemble(deltaTime, buildTime, cap) {
    this.build = Math.min(1, this.build + deltaTime / buildTime);
    if (this.build < 1) return false;
    const room = Math.max(0, cap - this.escortsAlive());
    for (let i = 0; i < Math.min(2, room); i += 1) this.spawnMinion();
    this.build = 0;
    this.assemblyDamage = 0;
    return true;
  }

  // Hit hard enough while assembling: the assembly is scrapped and it reels,
  // open; on the last phase the orders change sides instead.
  scrap() {
    this.build = 0;
    this.assemblyDamage = 0;
    if (this.order === 'both') {
      this.beginFlip();
      return;
    }
    this.sovState = 'stagger';
    this.sovTimer = SOV.stagger;
    this.clearTelegraph();
  }

  // The last phase's orders change sides: the line stops and warns, the wall
  // warns where it will stand, along the middle of today's REBUILD half.
  beginFlip() {
    const { flipWindup } = SOV.split;
    this.sovState = 'split-flip';
    this.sovTimer = flipWindup;
    this.build = 0;
    this.assemblyDamage = 0;
    const warn = { phase: 'warn', timer: flipWindup, duration: flipWindup };
    Object.assign(this.split, warn);
    Object.assign(this.barrier, warn, { solid: 0 });
  }

  // The last phase: the REBUILD half toward the ship, the line warning.
  beginSplit() {
    const { windup } = SOV.split;
    this.sovState = 'split-windup';
    this.order = 'both';
    this.sovTimer = windup;
    this.clearTelegraph();
    this.beams = null;
    this.build = 0;
    this.assemblyDamage = 0;
    const bearing = this.shipAt ? this.bearingTo(this.shipAt) : this.facing;
    this.splitAngle = wrapAngle(bearing - HALF_PI);
    this.volleyTimer = SOV.split.volleyEvery;
    this.split = {
      type: 'split',
      x: this.x,
      y: this.y,
      angle: this.splitAngle,
      phase: 'warn',
      timer: windup,
      duration: windup,
    };
    this.barrier = {
      type: 'barrier',
      ray: true,
      x: this.x,
      y: this.y,
      angle: this.splitAngle - HALF_PI,
      gapAt: -FAR / 2,
      gapWidth: FAR,
      span: [0, 0],
      solid: 0,
      phase: 'warn',
      timer: windup,
      duration: windup,
    };
  }

  // Both orders: the line turns, the REBUILD half pulls and assembles, the
  // PROTECT half fires its lanes; its wall runs along the PROTECT half's
  // middle. An assembly done (or scrapped) trades the halves (beginFlip).
  updateSplit(deltaTime, target) {
    const { spin, volleyEvery, shipPull, build, escortCap } = SOV.split;
    const s = this.split;
    const b = this.barrier;
    const flipping = this.sovState === 'split-flip';
    if (this.sovState !== 'split') {
      s.timer = b.timer = Math.max(0, this.sovTimer);
      if (this.sovTimer <= 0) {
        if (flipping) {
          this.splitAngle = wrapAngle(this.splitAngle + Math.PI);
          this.volleyTimer = SOV.split.flipVolley;
        }
        this.sovState = 'split';
        Object.assign(s, { phase: 'turn', timer: 1, duration: 1 });
        Object.assign(b, { phase: 'solid', solid: 1, timer: 1, duration: 1 });
      }
    } else {
      this.splitAngle = wrapAngle(this.splitAngle + spin * deltaTime);
      this.pull(deltaTime, target, shipPull, (point, margin) =>
        this.inRebuildHalf(point, margin)
      );
      this.volleyTimer -= deltaTime;
      if (this.volleyTimer <= 0) {
        this.volleyTimer = volleyEvery;
        this.beginLanes(this.protectLaneCentre());
      }
      if (this.assemble(deltaTime, build, escortCap)) this.beginFlip();
    }
    s.x = this.x;
    s.y = this.y;
    s.angle = this.splitAngle;
    // through a flip the wall already warns where the turn will put it
    const flipped = this.sovState === 'split-flip' ? -1 : 1;
    b.angle = this.splitAngle - flipped * HALF_PI;
  }

  // The lanes' centre: at the ship when it stands in the PROTECT half, else
  // along the PROTECT half's nearest edge, kept inside it.
  protectLaneCentre() {
    const middle = this.splitAngle - HALF_PI;
    const { count, spread } = SOV.lanes;
    const room = Math.max(
      0,
      HALF_PI - (spread * (count - 1)) / 2 - LANE_MARGIN
    );
    const off = this.shipAt
      ? wrapAngle(this.bearingTo(this.shipAt) - middle)
      : 0;
    return middle + Math.max(-room, Math.min(room, off));
  }
}

export default Sovereign;
