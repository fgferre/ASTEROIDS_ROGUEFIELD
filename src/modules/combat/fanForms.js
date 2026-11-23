// src/modules/combat/fanForms.js
//
// The Scatter Coil fan's own family forms (approved 23/11 from the
// mock-ups), the Weapons instance first: Grapeshot's glance (its Kinetic
// `evolution`/`apex`, the fan entry's `ricochet`), and from the weapon's
// `familyForms` the rocks a volley sets alight inside (Thermal, Kindling),
// the bursts' discharges (Arc), the bursts that drag their surroundings in
// before they go off (Field, Implosion) and the scrap a kill throws (Salvage,
// Scrap Rounds). A flak or shrapnel hit runs none of these families' lance
// forms (HitResolution); the glances, implosions, scrap and burning rocks go
// on in CardEffects.updateWeaponEffects (updateFanForms).

import { PLAIN_VARIANTS } from '../enemies/types/Asteroid.js';
import { isBossEnemy } from '../physics/bossTuning.js';
import { arcStrike, flingFragments } from './beamForms.js';

// how long a glance's line stays after its bolt is gone (s)
const GLANCE_FADE = 0.22;

// 0 at 3 cards, 1 at the Apex, -1 off: the fan's form of `family`.
function stageOf(w, family) {
  if (!w.weapon.familyForms?.fan?.includes(family)) return -1;
  if (w.hasApex(family)) return 1;
  return w.hasEvolution(family) ? 0 : -1;
}

const forms = (w) => w.weapon.familyForms;

/**
 * Grapeshot: a bolt that hit and burst glances off its `enemy` into the
 * nearest enemy ahead of it (an enemy another bolt of the volley took
 * counts `taken` px further), aimed where that one will be; it flies on
 * `linger` s past it. Metal sparks where it glanced (`flak-glanced`).
 */
export function glance(w, bullet, enemy) {
  const { reach, cone, linger, taken, keep } = bullet.ricochet;
  const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
  const ux = bullet.vx / speed;
  const uy = bullet.vy / speed;
  const volley = bullet.volley;
  volley.picked ??= new Set(); // the enemies the volley's glances took
  let best = null;
  let bestScore = Infinity;
  w.forEachSolidEnemy((other) => {
    if (other === enemy || bullet.pierced.includes(other)) return;
    const dx = other.x - bullet.x;
    const dy = other.y - bullet.y;
    const d = Math.hypot(dx, dy);
    if (d > reach || d < 1 || (dx * ux + dy * uy) / d < cone) return;
    const score = d + (volley.picked.has(other) ? taken : 0);
    if (score < bestScore) {
      bestScore = score;
      best = other;
    }
  });
  if (!best) return;
  volley.picked.add(best);
  const t = Math.hypot(best.x - bullet.x, best.y - bullet.y) / speed;
  const tx = best.x + (best.vx || 0) * t - bullet.x;
  const ty = best.y + (best.vy || 0) * t - bullet.y;
  const d = Math.hypot(tx, ty) || 1;
  const off = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) || 1;
  bullet.ricochets -= 1;
  bullet.damage *= keep;
  bullet.shrapnel *= keep;
  bullet.hit = false;
  bullet.pierced.push(enemy);
  bullet.vx = (tx / d) * speed;
  bullet.vy = (ty / d) * speed;
  bullet.life = d / speed + linger;
  bullet.trail.length = 0;
  // the line it flies (the bolt is pooled: `glance` says it is still this one)
  bullet.glance = {
    bullet,
    x0: bullet.x,
    y0: bullet.y,
    x: bullet.x,
    y: bullet.y,
    fade: null, // s left once its bolt is gone
    maxFade: GLANCE_FADE,
  };
  w.glances.push(bullet.glance);
  w.emit('flak-glanced', {
    position: { x: bullet.x, y: bullet.y },
    normal: { x: (bullet.x - enemy.x) / off, y: (bullet.y - enemy.y) / off },
    direction: { x: tx / d, y: ty / d },
  });
}

/**
 * A flak or shrapnel `hit` of the fan landed on `enemy` (not blocked): it
 * counts toward Kindling, and a kill throws scrap (Scrap Rounds).
 */
export function fanHit(w, hit, enemy, result) {
  const volley = hit.volley;
  if (!volley) return;
  const thermal = stageOf(w, 'thermal');
  if (thermal >= 0 && !result.killed && !enemy.destroyed) {
    volley.hits ??= new Map(); // enemy → its hits this volley
    const n = (volley.hits.get(enemy) || 0) + 1;
    volley.hits.set(enemy, n);
    if (n === forms(w).thermal.hits)
      kindle(w, thermal, enemy, hit.damage, true);
  }
  const salvage = stageOf(w, 'salvage');
  if (salvage >= 0 && result.killed && !volley.scrap && volley.damage) {
    const { shards, delay, toss } = forms(w).salvage;
    const count = shards[salvage];
    const along = Math.atan2(hit.vy || 0, hit.vx || 1);
    for (let i = 0; i < count; i += 1) {
      // thrown on along the killing hit, two of them apart
      const angle = along + (count > 1 ? (i - 0.5) * 1.2 : 0);
      w.shardSeed += 1;
      w.scraps.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * toss,
        vy: Math.sin(angle) * toss,
        age: 0,
        timer: delay,
        rank: i,
        from: enemy,
        skip: result.fragments || [],
        damage: volley.damage,
        entry: volley.entry,
        seed: w.shardSeed,
      });
    }
  }
}

/**
 * Kindling: `enemy` catches fire inside (a rock, or at the Apex a machine;
 * never a boss) and burns; `spread` passes it on to the nearest one within
 * the form's reach, once.
 */
function kindle(w, stage, enemy, damage, spread) {
  const rock = enemy.type === 'asteroid';
  if (!rock && (stage < 1 || isBossEnemy(enemy))) return;
  const { burn } = forms(w).thermal;
  w.cards().ignite(enemy, damage, burn);
  if (!w.kindled.some((k) => k.enemy === enemy && k.id === enemy.id)) {
    // a plain rock's cracks light; a gold, volatile or parasite rock keeps
    // the look that warns or pays
    if (rock && !enemy.look && PLAIN_VARIANTS.has(enemy.variant)) {
      enemy.look = 'kindled';
    }
    w.shardSeed += 1;
    w.kindled.push({ enemy, id: enemy.id, damage, seed: w.shardSeed });
  }
  if (!spread || stage < 1) return;
  const reach = forms(w).thermal.spread;
  let next = null;
  let nearest = Infinity;
  w.forEachSolidEnemy((other) => {
    if (other === enemy || w.kindled.some((k) => k.enemy === other)) return;
    const gap =
      Math.hypot(other.x - enemy.x, other.y - enemy.y) -
      (other.radius || 0) -
      (enemy.radius || 0);
    if (gap <= reach && gap < nearest) {
      nearest = gap;
      next = other;
    }
  });
  if (next) kindle(w, stage, next, damage, false);
}

/**
 * A kindled rock died (`enemy-destroyed`): its pieces fly out burning, each
 * alight as it was.
 */
export function kindledDied(w, enemy, fragments) {
  const at = w.kindled.findIndex((k) => k.enemy === enemy && k.id === enemy.id);
  if (at < 0) return;
  const { damage } = w.kindled[at];
  w.kindled.splice(at, 1);
  const stage = stageOf(w, 'thermal');
  if (stage < 0 || !fragments?.length) return;
  const { fling } = forms(w).thermal;
  flingFragments(w, enemy, { ...fling, fire: true }, fragments);
  fragments.forEach((piece) => kindle(w, stage, piece, damage, false));
}

/**
 * Implosion: a fan burst with enemies in reach waits `hold` s while they
 * are dragged into its centre, then bursts on the clump (a copy of the
 * bolt, `imploded`). False when nothing is in reach: it bursts at once.
 */
export function implodeFirst(w, bolt) {
  const stage = stageOf(w, 'field');
  if (stage < 0 || bolt.imploded) return false;
  const { reach, hold, tau } = forms(w).field;
  const caught = [];
  w.forEachSolidEnemy((enemy) => {
    if (isBossEnemy(enemy)) return;
    const gap =
      Math.hypot(enemy.x - bolt.x, enemy.y - bolt.y) - (enemy.radius || 0);
    if (gap <= reach[stage]) caught.push({ enemy, id: enemy.id });
  });
  if (!caught.length) return false;
  // one well a volley: five overlapping read as confetti
  if (!bolt.volley.well) {
    bolt.volley.well = true;
    w.cards().wells.push({
      x: bolt.x,
      y: bolt.y,
      life: hold[stage],
      maxLife: hold[stage],
    });
  }
  w.implosions.push({
    x: bolt.x,
    y: bolt.y,
    timer: hold[stage],
    tau,
    caught,
    bolt: {
      x: bolt.x,
      y: bolt.y,
      vx: bolt.vx,
      vy: bolt.vy,
      life: bolt.life,
      volley: bolt.volley,
      projectile: bolt.projectile,
      shrapnel: bolt.shrapnel,
      colors: bolt.colors,
      imploded: true,
    },
  });
  return true;
}

/**
 * Discharge: a fan burst at (x, y) of `radius` arcs to the nearest enemies
 * outside it; at the Apex each bolt jumps on. A bolt is a chain hit: no form
 * procs off it.
 */
export function discharge(w, bolt, x, y, radius) {
  const stage = stageOf(w, 'arc');
  if (stage < 0) return;
  const { range, arcs, jumps, damageFraction, cap, life } = forms(w).arc;
  const volley = bolt.volley;
  volley.discharged ??= new Set(); // the enemies its bolts struck
  const damage = bolt.shrapnel * damageFraction[stage];
  const nearest = (from, count, outside) => {
    const near = [];
    w.forEachSolidEnemy((enemy) => {
      if (volley.discharged.has(enemy)) return;
      const d = Math.hypot(enemy.x - from.x, enemy.y - from.y);
      if (d > range || d - (enemy.radius || 0) <= outside) return;
      near.push({ enemy, d });
    });
    near.sort((a, b) => a.d - b.d);
    return near.slice(0, count).map(({ enemy }) => enemy);
  };
  const strike = (from, target) => {
    if (volley.discharged.size >= cap[stage]) return false;
    volley.discharged.add(target);
    // no shove: it would throw the machines out of the next volley's fan
    arcStrike(w, from, target, damage, life, stage === 1, false);
    return true;
  };
  const centre = { x, y, radius: 0 };
  nearest(centre, arcs[stage], radius).forEach((first) => {
    if (!strike(centre, first)) return;
    let from = first;
    for (let jump = 0; jump < jumps[stage]; jump += 1) {
      const [next] = nearest(from, 1, 0);
      if (!next || !strike(from, next)) break;
      from = next;
    }
  });
}

/** Glances, implosions, scrap and burning rocks, each frame. */
export function updateFanForms(w, deltaTime, burstFlak) {
  if (w.glances.length) followGlances(w, deltaTime);
  if (w.implosions.length) drawIn(w, deltaTime, burstFlak);
  if (w.scraps.length) throwScrap(w, deltaTime);
  if (w.kindled.length) coolKindled(w);
}

// A glance's line follows its bolt, then fades.
function followGlances(w, deltaTime) {
  let kept = 0;
  w.glances.forEach((g) => {
    const { bullet } = g;
    if (g.fade === null) {
      if (bullet.glance !== g || bullet.hit || bullet.life <= 0)
        g.fade = GLANCE_FADE;
      else {
        g.x = bullet.x;
        g.y = bullet.y;
      }
    } else g.fade -= deltaTime;
    if (g.fade === null || g.fade > 0) w.glances[kept++] = g;
  });
  w.glances.length = kept;
}

// What an implosion caught closes on its centre (to 0.7 of its radius, so
// the clump keeps its shapes); then it bursts.
function drawIn(w, deltaTime, burstFlak) {
  const due = [];
  let kept = 0;
  w.implosions.forEach((imp) => {
    imp.timer -= deltaTime;
    const share = 1 - Math.exp(-deltaTime / imp.tau);
    imp.caught.forEach(({ enemy, id }) => {
      if (enemy.destroyed || enemy.id !== id) return;
      const dx = imp.x - enemy.x;
      const dy = imp.y - enemy.y;
      const d = Math.hypot(dx, dy);
      const stop = (enemy.radius || 0) * 0.7;
      if (d <= stop) return;
      const step = (d - stop) * share;
      enemy.x += (dx / d) * step;
      enemy.y += (dy / d) * step;
    });
    if (imp.timer <= 1e-9) due.push(imp);
    else w.implosions[kept++] = imp;
  });
  w.implosions.length = kept;
  due.forEach((imp) => burstFlak(w, imp.bolt));
}

// Scrap tumbles off where it was thrown, then fires itself at the nearest
// enemies (the second shard at the second nearest, or with the first when
// it is alone), a bolt of a volley of its own that throws none.
function throwScrap(w, deltaTime) {
  const { range } = forms(w)?.salvage ?? {};
  const due = [];
  let kept = 0;
  w.scraps.forEach((s) => {
    s.timer -= deltaTime;
    s.age += deltaTime;
    s.x += s.vx * deltaTime;
    s.y += s.vy * deltaTime;
    if (s.timer <= 1e-9) due.push(s);
    else w.scraps[kept++] = s;
  });
  w.scraps.length = kept;
  if (!range) return;
  due.forEach((s) => {
    const near = [];
    w.forEachSolidEnemy((enemy) => {
      if (enemy === s.from || s.skip.includes(enemy)) return;
      const d = Math.hypot(enemy.x - s.x, enemy.y - s.y) - (enemy.radius || 0);
      if (d < range) near.push({ enemy, d });
    });
    if (!near.length) return;
    near.sort((a, b) => a.d - b.d);
    const { enemy } = near[s.rank % near.length];
    const volley = { struck: [], bursts: 0, scrap: true };
    const shard = w.createBullet(s, enemy, s.damage, volley, s.entry);
    if (!shard) return;
    shard.ricochets = 0;
    // it keeps its tumble from the toss
    shard.scrapAge = s.age;
  });
}

// A rock or machine no longer burning cools; one gone leaves the list.
function coolKindled(w) {
  const burns = w.cards().burns;
  let kept = 0;
  w.kindled.forEach((k) => {
    const { enemy } = k;
    if (enemy.destroyed || enemy.id !== k.id) return;
    if (burns.get(enemy)?.id !== k.id) {
      if (enemy.look === 'kindled') enemy.look = null;
      return;
    }
    w.kindled[kept++] = k;
  });
  w.kindled.length = kept;
}
