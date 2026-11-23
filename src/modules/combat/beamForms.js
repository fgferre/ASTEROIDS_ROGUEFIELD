// src/modules/combat/beamForms.js
//
// The Harmonic beam's own family forms (approved 22/11 from the mock-ups),
// run once a beam after its hits (beamAndFan.js), the Weapons instance first:
// Thermal's scar (the beam entry's `scar`: Searing Beam, Sunspear), and from
// the weapon's `familyForms` the arcs off the beam (Arc) and the orbs its
// kills drop sent to the ship (Salvage). A beam hit runs none of these
// families' lance forms (HitResolution); the scars burn on in
// CardEffects.updateWeaponEffects (burnScars).

import { distanceToSegment } from '../enemies/types/SentinelPrismCrown.js';

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

/**
 * After a beam's hits: `seg` {x, y, ex, ey, dirX, dirY, width, damage},
 * `struck` [{enemy}] what it crossed, `orbsBefore` from orbsBeforeBeam.
 */
export function runBeamForms(w, beam, seg, struck, orbsBefore) {
  if (beam.scar) leaveScar(w, beam.scar, seg);
  const arc = stageOf(w, 'arc');
  if (arc >= 0 && struck.length) arcOff(w, arc, seg, struck);
  if (orbsBefore) sendOrbsHome(w, seg, orbsBefore);
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
