// src/modules/combat/beamForms.js
//
// The Harmonic beam's own family forms (approved 22/11 from the mock-ups),
// run once a beam after its hits (beamAndFan.js), the Weapons instance first:
// Thermal's scar (the beam entry's `scar`: Searing Beam, Sunspear), and from
// the weapon's `familyForms` the machines thrown back and the shards of its
// rock kills (Kinetic), the arcs off the beam (Arc), the tug onto its line or
// its trench (Field) and the orbs its kills drop sent to the ship (Salvage).
// A beam hit runs none of these families' lance forms (HitResolution, which
// also flings the fragments of a Kinetic beam's rock kills); the scars, the
// throws and the trench go on in CardEffects.updateWeaponEffects
// (burnScars, updateBeamForms).

import { distanceToSegment } from '../enemies/types/SentinelPrismCrown.js';
import { isBossEnemy } from '../physics/bossTuning.js';

// 0 at 3 cards, 1 at the Apex, -1 off: the beam's form of `family`.
function stageOf(w, family) {
  if (!w.weapon.familyForms?.beam?.includes(family)) return -1;
  if (w.hasApex(family)) return 1;
  return w.hasEvolution(family) ? 0 : -1;
}

// Distance from (x, y) to the segment {x, y, ex, ey}.
const toSegment = (x, y, s) => distanceToSegment(x, y, s.x, s.y, s.ex, s.ey);

const orbSystem = (w) => w.enemies().rewardManager.getXPOrbSystem();

/** The orbs on the field before a beam's hits, with its Salvage form on. */
export function orbsBeforeBeam(w) {
  return stageOf(w, 'salvage') < 0 ? null : new Set(orbSystem(w).xpOrbs);
}

// The point of the segment {x, y, ex, ey} nearest (x, y), into `out`.
function nearestOnSegment(x, y, s, out) {
  const dx = s.ex - s.x;
  const dy = s.ey - s.y;
  const length = dx * dx + dy * dy;
  const t =
    length > 0
      ? Math.max(0, Math.min(1, ((x - s.x) * dx + (y - s.y) * dy) / length))
      : 0;
  out.x = s.x + dx * t;
  out.y = s.y + dy * t;
  return out;
}
const onLine = { x: 0, y: 0 };

/** The Kinetic beam's `fling` while its form is on, else null. */
export function beamFling(w) {
  return stageOf(w, 'kinetic') < 0 ? null : w.weapon.familyForms.kinetic.fling;
}

/**
 * After a beam's hits: `seg` {x, y, ex, ey, dirX, dirY, width, damage},
 * `struck` [{enemy}] what it crossed, `kills` [{x, y}] where the rocks it
 * killed were, `orbsBefore` from orbsBeforeBeam.
 */
export function runBeamForms(w, beam, seg, struck, kills, orbsBefore) {
  if (beam.scar) leaveScar(w, beam.scar, seg);
  const kinetic = stageOf(w, 'kinetic');
  if (kinetic >= 0) {
    throwBack(w, seg, struck);
    if (kinetic === 1) kills.forEach((rock) => shardsFrom(w, rock, seg));
  }
  const arc = stageOf(w, 'arc');
  if (arc >= 0 && struck.length) arcOff(w, arc, seg, struck);
  const field = stageOf(w, 'field');
  if (field === 0) tugOntoLine(w, seg, struck);
  if (field === 1) digTrench(w, seg);
  if (orbsBefore) sendOrbsHome(w, seg, orbsBefore);
}

/** The Kinetic throws and flung fragments, the Field trench, each frame. */
export function updateBeamForms(w, deltaTime) {
  if (w.knocks.length) carryKnocks(w, deltaTime);
  if (w.flung.length) settleFlung(w, deltaTime);
  if (w.trench) holdTrench(w, deltaTime);
}

// Kinetic: a machine the beam struck, unless heavy (a boss or a herald, as
// pushEnemy weighs them), is thrown back along the beam by position: its AI
// caps a velocity shove at its top speed.
function throwBack(w, seg, struck) {
  const { knock } = w.weapon.familyForms.kinetic;
  struck.forEach(({ enemy }) => {
    if (enemy.destroyed || enemy.type === 'asteroid') return;
    if (isBossEnemy(enemy) || enemy.type === 'herald') return;
    w.knocks.push({
      enemy,
      id: enemy.id,
      dirX: seg.dirX,
      dirY: seg.dirY,
      left: knock.distance,
      tau: knock.tau,
    });
  });
}

// Each frame a throw covers its share of what is left (easing out).
function carryKnocks(w, deltaTime) {
  let kept = 0;
  w.knocks.forEach((knock) => {
    const { enemy } = knock;
    if (enemy.destroyed || enemy.id !== knock.id) return;
    const step = knock.left * (1 - Math.exp(-deltaTime / knock.tau));
    enemy.x += knock.dirX * step;
    enemy.y += knock.dirY * step;
    knock.left -= step;
    if (knock.left > 1) w.knocks[kept++] = knock;
  });
  w.knocks.length = kept;
}

// A rock's velocity, both places it lives.
function setVelocity(enemy, vx, vy) {
  enemy.vx = vx;
  enemy.vy = vy;
  if (enemy.velocity) {
    enemy.velocity.vx = vx;
    enemy.velocity.vy = vy;
  }
}

/**
 * Kinetic: the fragments of a rock the beam killed (`spawned` and the split's
 * own `fragments`) fly out from where it was at `fling.speed`, a grit trail
 * behind each (HitResolution, on the kill), then settle to their own drift.
 */
export function flingFragments(w, rock, fling, ...lists) {
  lists.forEach((list) =>
    list.forEach((fragment) => {
      const dx = fragment.x - rock.x;
      const dy = fragment.y - rock.y;
      const d = Math.hypot(dx, dy) || 1;
      w.shardSeed += 1;
      w.flung.push({
        enemy: fragment,
        id: fragment.id,
        driftX: fragment.vx || 0,
        driftY: fragment.vy || 0,
        age: 0,
        settle: fling.settle,
        trail: fling.trail,
        seed: w.shardSeed,
      });
      setVelocity(fragment, (dx / d) * fling.speed, (dy / d) * fling.speed);
    })
  );
}

// A flung fragment eases back to its drift; let go after three time
// constants (5%), or once gone.
function settleFlung(w, deltaTime) {
  let kept = 0;
  w.flung.forEach((flung) => {
    const { enemy } = flung;
    if (enemy.destroyed || enemy.id !== flung.id) return;
    flung.age += deltaTime;
    const keep = Math.exp(-deltaTime / flung.settle);
    setVelocity(
      enemy,
      flung.driftX + ((enemy.vx || 0) - flung.driftX) * keep,
      flung.driftY + ((enemy.vy || 0) - flung.driftY) * keep
    );
    if (flung.age < 3 * flung.settle) w.flung[kept++] = flung;
  });
  w.flung.length = kept;
}

// Kinetic ×5: a rock the beam killed bursts into shards on along the beam;
// each enemy inside the cone takes one shard hit (kind `shrapnel`, as a
// flak burst's: the lance forms come on it).
function shardsFrom(w, rock, seg) {
  const { halfAngle, reach, damageFraction, life, max } =
    w.weapon.familyForms.kinetic.cone;
  w.shardSeed += 1;
  w.shards.push({
    x: rock.x,
    y: rock.y,
    angle: Math.atan2(seg.dirY, seg.dirX),
    life,
    maxLife: life,
    seed: w.shardSeed,
  });
  if (w.shards.length > max) w.shards.shift();
  const inside = [];
  w.forEachSolidEnemy((enemy) => {
    const dx = enemy.x - rock.x;
    const dy = enemy.y - rock.y;
    const d = Math.hypot(dx, dy);
    const r = enemy.radius || 0;
    if (d < 1 || d > reach + r) return;
    // its rim inside the cone
    const off = Math.acos(
      Math.max(-1, Math.min(1, (dx * seg.dirX + dy * seg.dirY) / d))
    );
    if (off > halfAngle + Math.asin(Math.min(1, r / d))) return;
    inside.push(enemy);
  });
  inside.forEach((enemy) => {
    if (enemy.destroyed) return;
    const dx = enemy.x - rock.x;
    const dy = enemy.y - rock.y;
    const d = Math.hypot(dx, dy);
    const r = Math.min(enemy.radius || 0, d);
    w.hitEnemy(
      {
        kind: 'shrapnel',
        x: enemy.x - (dx / d) * r,
        y: enemy.y - (dy / d) * r,
        vx: (dx / d) * w.bulletSpeed,
        vy: (dy / d) * w.bulletSpeed,
        damage: seg.damage * damageFraction,
        hit: false,
      },
      enemy
    );
  });
}

// Field ×3: what lies within `band` px of the beam's line (rim) is tugged
// onto it at the Singularity's pull speed for `tug` s, and slowed `hold` s
// with what it struck (CardEffects' pulls and slows, their static grip).
// What it struck is on the line already: re-centring it would hold still
// rocks on it for every beam after.
function tugOntoLine(w, seg, struck) {
  const { band, tug, hold } = w.weapon.familyForms.field;
  const cards = w.cards();
  const crossed = new Set(struck.map(({ enemy }) => enemy));
  w.forEachSolidEnemy((enemy) => {
    if (enemy.type === 'boss') return;
    if (!crossed.has(enemy)) {
      const reach = (enemy.radius || 0) + band;
      if (toSegment(enemy.x, enemy.y, seg) > reach) return;
      const { x, y } = nearestOnSegment(enemy.x, enemy.y, seg, onLine);
      cards.pulls.set(enemy, { id: enemy.id, timer: tug, x, y });
    }
    cards.slows.set(enemy, { id: enemy.id, timer: hold });
  });
}

// Field ×5: the beam's line becomes a trench; a new one replaces the last.
function digTrench(w, seg) {
  const { life, reach, tau } = w.weapon.familyForms.field.trench;
  w.trench = {
    x: seg.x,
    y: seg.y,
    ex: seg.ex,
    ey: seg.ey,
    reach,
    tau,
    life,
    maxLife: life,
  };
}

// The trench drags what is within `reach` px (rim) toward its line, the
// gap closing with time constant `tau` s (fast from afar, gently near it,
// so it gathers more than it pins); no boss.
function holdTrench(w, deltaTime) {
  const trench = w.trench;
  trench.life -= deltaTime;
  if (trench.life <= 0) {
    w.trench = null;
    return;
  }
  const { reach } = trench;
  const share = 1 - Math.exp(-deltaTime / trench.tau);
  w.forEachSolidEnemy((enemy) => {
    if (enemy.type === 'boss') return;
    const { x, y } = nearestOnSegment(enemy.x, enemy.y, trench, onLine);
    const r = reach + (enemy.radius || 0);
    if ((x - enemy.x) ** 2 + (y - enemy.y) ** 2 > r * r) return;
    enemy.x += (x - enemy.x) * share;
    enemy.y += (y - enemy.y) * share;
  });
}

// Searing Beam: the beam's line stays burning; the oldest goes past `max`.
// It touches on its first frame.
function leaveScar(w, scar, seg) {
  w.scarSeed += 1;
  w.scars.push({
    x: seg.x,
    y: seg.y,
    ex: seg.ex,
    ey: seg.ey,
    width: scar.width,
    life: scar.life,
    maxLife: scar.life,
    damage: seg.damage,
    burn: scar.burn,
    tick: scar.tick,
    timer: scar.tick,
    seed: w.scarSeed,
  });
  if (w.scars.length > scar.max) w.scars.shift();
}

/** Each scar sets alight what lies on it, every `tick` s. */
export function burnScars(w, cards, deltaTime) {
  w.scars.forEach((scar) => {
    scar.timer += deltaTime;
    if (scar.timer < scar.tick - 1e-9) return;
    scar.timer -= scar.tick;
    w.forEachSolidEnemy((enemy) => {
      const reach = (enemy.radius || 0) + scar.width / 2 + 2;
      if (toSegment(enemy.x, enemy.y, scar) <= reach) {
        cards.ignite(enemy, scar.damage, scar.burn);
      }
    });
  });
}

// Arc: at 3, `arcs` bolts from the farthest enemy the beam crossed to the
// nearest ones off the beam; at the Apex, a bolt from each enemy it crossed
// (up to `cap`) to the nearest one off the beam, jumping on off the beam to
// the nearest not yet in that chain, `jumps` bolts at most (one bolt each
// could not match the Storm Lance chains the beam had before). A bolt is a
// chain hit: no form procs off it.
function arcOff(w, stage, seg, struck) {
  const { range, damageFraction, arcs, cap, jumps, life } =
    w.weapon.familyForms.arc;
  const damage = seg.damage * damageFraction[stage];
  const crossed = new Set(struck.map(({ enemy }) => enemy));
  const taken = new Set();
  const nearest = (from, count) => {
    const near = [];
    w.forEachSolidEnemy((enemy) => {
      if (crossed.has(enemy) || taken.has(enemy)) return;
      const d2 = (enemy.x - from.x) ** 2 + (enemy.y - from.y) ** 2;
      if (d2 < range * range) near.push({ enemy, d2 });
    });
    near.sort((a, b) => a.d2 - b.d2);
    return near.slice(0, count).map(({ enemy }) => enemy);
  };
  const strike = (source, target) => {
    taken.add(target);
    const from = { x: source.x, y: source.y, radius: source.radius };
    w.cards().addArc(from, target, { bolt: true, life, heavy: stage === 1 });
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const r = target.radius || 0;
    w.hitEnemy(
      {
        kind: 'chain',
        x: target.x - (dx / d) * r,
        y: target.y - (dy / d) * r,
        vx: (dx / d) * w.bulletSpeed,
        vy: (dy / d) * w.bulletSpeed,
        damage,
        hit: false,
      },
      target
    );
  };
  if (stage === 0) {
    const along = ({ enemy }) =>
      (enemy.x - seg.x) * seg.dirX + (enemy.y - seg.y) * seg.dirY;
    const far = struck.reduce((a, b) => (along(b) > along(a) ? b : a)).enemy;
    nearest(far, arcs).forEach((target) => strike(far, target));
    return;
  }
  let left = cap;
  struck.forEach(({ enemy }) => {
    if (left <= 0) return;
    let from = enemy;
    taken.clear(); // a chain's own: two chains may share an enemy
    for (let jump = 0; jump < jumps; jump += 1) {
      const [target] = nearest(from, 1);
      if (!target) break;
      if (jump === 0) left -= 1;
      strike(from, target);
      from = target;
    }
  });
}

// Salvage: the orbs the beam's kills dropped fly to the ship; at the Apex
// every orb within `drag` px of the beam too.
function sendOrbsHome(w, seg, orbsBefore) {
  const { speed, acceleration, drag } = w.weapon.familyForms.salvage;
  const orbs = orbSystem(w);
  const reach = seg.width / 2 + drag;
  const apex = stageOf(w, 'salvage') === 1;
  orbs.xpOrbs.forEach((orb) => {
    if (
      !orbsBefore.has(orb) ||
      (apex && toSegment(orb.x, orb.y, seg) <= reach)
    ) {
      orbs.sendHome(orb, speed, acceleration);
    }
  });
}
