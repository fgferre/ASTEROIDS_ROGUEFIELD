// src/modules/combat/missileForms.js
//
// The Seeker Swarm missile's own family forms (picked 23/11 from the
// mock-ups), the Weapons instance first, from the weapon's `familyForms`:
// the missile that lodges in its target and burns inside it before it
// bursts bigger (Thermal, Thermite), the bolt each burst throws across the
// enemies round it (Arc, Storm Warhead) and the well each burst leaves
// (Field, Gravity Warhead). A missile or shrapnel hit runs none of these
// families' lance forms (HitResolution); the lodged missiles, thermite,
// bolts and wells go on in CardEffects.updateWeaponEffects
// (updateMissileForms).

import { PLAIN_VARIANTS } from '../enemies/types/Asteroid.js';
import { isBossEnemy } from '../physics/bossTuning.js';
import { arcStrike } from './beamForms.js';

// How long a lodged rock's pieces stay molten after it dies (s).
const COOL = 0.6;
// Seconds between the sparks a lodged missile spits, as its burn runs on
// (the last third the fastest); a stuck piece of thermite, steadily.
const SPIT = [5 / 60, 3 / 60, 2 / 60];
const PIECE_SPIT = 6 / 60;

// 0 at 3 cards, 1 at the Apex, -1 off: the missile's form of `family`.
function stageOf(w, family) {
  if (!w.weapon.familyForms?.missile?.includes(family)) return -1;
  if (w.hasApex(family)) return 1;
  return w.hasEvolution(family) ? 0 : -1;
}

const forms = (w) => w.weapon.familyForms;
const here = (entry) => !entry.enemy.destroyed && entry.enemy.id === entry.id;

// A plain rock with thermite in it runs molten (rocks.js `kindled`); a gold,
// volatile or parasite rock keeps the look that warns or pays.
function heat(enemy) {
  if (enemy.type === 'asteroid' && !enemy.look) {
    if (PLAIN_VARIANTS.has(enemy.variant)) enemy.look = 'kindled';
  }
}

// It cools once no thermite is left in it.
function coolOff(w, enemy) {
  if (enemy.look !== 'kindled' || enemy.destroyed) return;
  if (w.lodged.some((L) => L.enemy === enemy && here(L))) return;
  enemy.look = null;
}

// Sparks thrown off (x, y) along (nx, ny) (`missile-sparks`, the renderer's
// hit sparks); `heavy` the bigger spray.
function sparks(w, x, y, nx, ny, heavy, kind) {
  w.emit('missile-sparks', { x, y, nx, ny, heavy, kind });
}

/**
 * Thermite: a missile `bullet` that hit `enemy` and neither killed it nor
 * was blocked lodges in it (never a boss): true, its burst waits. Where it
 * went in is held in the hull's frame.
 */
export function lodge(w, bullet, enemy, result) {
  const stage = stageOf(w, 'thermal');
  if (stage < 0 || bullet.kind !== 'seeker') return false;
  if (result.blocked || result.killed || enemy.destroyed) return false;
  if (isBossEnemy(enemy)) return false;
  const { burstScale, burstDamage, every, hold } = forms(w).thermal;
  const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
  const off = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) || 1;
  const r = (enemy.radius || 10) * 0.85;
  const ox = ((bullet.x - enemy.x) / off) * r;
  const oy = ((bullet.y - enemy.y) / off) * r;
  w.shardSeed += 1;
  w.lodged.push({
    enemy,
    id: enemy.id,
    ox,
    oy,
    x: enemy.x + ox,
    y: enemy.y + oy,
    ux: bullet.vx / speed,
    uy: bullet.vy / speed,
    age: 0,
    hold,
    burnIn: every,
    spitIn: SPIT[0],
    stage,
    seed: w.shardSeed,
    damage: bullet.damage,
    // the burst it holds (the missile is pooled: a copy)
    bolt: {
      vx: bullet.vx,
      vy: bullet.vy,
      life: 1,
      damage: bullet.damage,
      shrapnel: bullet.shrapnel * burstDamage,
      burstScale,
      projectile: bullet.projectile,
      colors: bullet.colors,
    },
  });
  heat(enemy);
  return true;
}

/**
 * A missile burst at (x, y) (beamAndFan's burstFlak, after its shrapnel):
 * the Storm Warhead's bolt sets off from it, the Gravity Warhead's well
 * opens on it. `struck`: what the burst's shrapnel hit.
 */
export function missileBurst(w, bolt, x, y, struck) {
  if (!w.weapon.familyForms?.missile || bolt.projectile.look !== 'seeker')
    return;
  const arc = stageOf(w, 'arc');
  if (arc >= 0) {
    const { leaps, damageFraction } = forms(w).arc;
    w.storms.push({
      from: { x, y, radius: 0 },
      left: leaps[arc],
      wait: 0,
      taken: new Set([...struck, ...bolt.volley.struck]),
      damage: bolt.damage * damageFraction[arc],
    });
  }
  const field = stageOf(w, 'field');
  if (field >= 0) {
    const { reach, hold, tau } = forms(w).field;
    const caught = [];
    w.forEachSolidEnemy((enemy) => {
      if (isBossEnemy(enemy) || enemy.destroyed) return;
      const gap = Math.hypot(enemy.x - x, enemy.y - y) - (enemy.radius || 0);
      if (gap <= reach[field]) caught.push({ enemy, id: enemy.id });
    });
    const well = { x, y, timer: hold[field], tau, caught };
    w.gravityWells.push(well);
    w.cards().wells.push({ x, y, life: hold[field], maxLife: hold[field] });
    // the salvo's missiles still flying turn onto it (steerSeeker)
    if (field === 1 && caught.length && bolt.seeker?.salvo) {
      bolt.seeker.salvo.well = well;
    }
  }
}

/** Lodged missiles, thermite, bolts and wells, each frame. */
export function updateMissileForms(w, deltaTime, burstFlak) {
  const { lodged, thermite, cooling, storms, gravityWells } = w;
  const busy =
    lodged.length ||
    thermite.length ||
    cooling.length ||
    storms.length ||
    gravityWells.length;
  if (!busy) return;
  if (!forms(w)?.missile) {
    // another weapon now: what the missiles left goes out
    const hot = [...lodged, ...cooling];
    [lodged, thermite, cooling, storms, gravityWells].forEach((list) => {
      list.length = 0;
    });
    hot.forEach((entry) => coolOff(w, entry.enemy));
    return;
  }
  if (lodged.length) burnInside(w, deltaTime, burstFlak);
  if (w.thermite.length) stickThermite(w, deltaTime);
  if (w.cooling.length) coolPieces(w, deltaTime);
  if (w.storms.length) leap(w, deltaTime);
  if (w.gravityWells.length) pullIn(w, deltaTime);
}

// A lodged missile rides its hull, burns it and spits white-hot slag back
// out of the hole, faster as it goes; at `hold`, or when the hull is gone,
// it bursts where it is.
function burnInside(w, deltaTime, burstFlak) {
  const { every, burn } = forms(w).thermal;
  const due = [];
  let kept = 0;
  w.lodged.forEach((L) => {
    L.age += deltaTime;
    const alive = here(L);
    if (alive) {
      L.x = L.enemy.x + L.ox;
      L.y = L.enemy.y + L.oy;
      L.burnIn -= deltaTime;
      if (L.burnIn <= 1e-9) {
        L.burnIn += every;
        w.cards().ignite(L.enemy, L.damage, burn);
      }
    }
    L.spitIn -= deltaTime;
    if (L.spitIn <= 1e-9) {
      const t = L.age / L.hold;
      L.spitIn += SPIT[t > 0.7 ? 2 : t > 0.35 ? 1 : 0];
      // each spark off the line it went in along, up to 0.7 rad either side
      L.spits = (L.spits ?? 0) + 1;
      const j = Math.sin((L.seed * 31 + L.spits) * 12.9898) * 0.7;
      const nx = -L.ux * Math.cos(j) + L.uy * Math.sin(j);
      const ny = -L.uy * Math.cos(j) - L.ux * Math.sin(j);
      sparks(w, L.x, L.y, nx, ny, t > 0.75, 'burn');
    }
    if (L.age >= L.hold - 1e-9 || !alive) due.push(L);
    else w.lodged[kept++] = L;
  });
  w.lodged.length = kept;
  due.forEach((L) => {
    burstFlak(w, {
      ...L.bolt,
      x: L.x - L.ux * 2,
      y: L.y - L.uy * 2,
      volley: { struck: [], bursts: 0 },
    });
    coolOff(w, L.enemy);
    if (L.stage === 1) throwThermite(w, L);
  });
}

// At 5 the bigger burst throws thermite at the nearest enemies round it.
function throwThermite(w, L) {
  const { pieces, range } = forms(w).thermal;
  const near = [];
  w.forEachSolidEnemy((enemy) => {
    if (enemy.destroyed || isBossEnemy(enemy)) return;
    if (enemy === L.enemy && here(L)) return;
    const gap = Math.hypot(enemy.x - L.x, enemy.y - L.y) - (enemy.radius || 0);
    if (gap <= range) near.push({ enemy, gap });
  });
  near.sort((a, b) => a.gap - b.gap);
  near.slice(0, pieces[1]).forEach(({ enemy }) => {
    w.shardSeed += 1;
    w.thermite.push({
      enemy,
      id: enemy.id,
      x: L.x,
      y: L.y,
      ox: 0,
      oy: 0,
      flying: true,
      age: 0,
      burnIn: 0,
      spitIn: 0,
      damage: L.damage,
      seed: w.shardSeed,
    });
  });
}

// A piece of thermite flies at its enemy's rim, sticks where it lands and
// burns there `stick` s; one whose enemy is gone goes out.
function stickThermite(w, deltaTime) {
  const { speed, stick, every, burn } = forms(w).thermal;
  let kept = 0;
  w.thermite.forEach((p) => {
    if (!here(p)) return;
    const { enemy } = p;
    if (p.flying) {
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const r = (enemy.radius || 10) * 0.85;
      const step = speed * deltaTime;
      if (d - r > step) {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        w.thermite[kept++] = p;
        return;
      }
      // it burns on the hull (the burn's bites), not inside it
      p.flying = false;
      p.ox = (-dx / d) * r;
      p.oy = (-dy / d) * r;
    }
    p.age += deltaTime;
    p.x = enemy.x + p.ox;
    p.y = enemy.y + p.oy;
    p.burnIn -= deltaTime;
    if (p.burnIn <= 1e-9) {
      p.burnIn += every;
      w.cards().ignite(enemy, p.damage, burn);
    }
    p.spitIn -= deltaTime;
    if (p.spitIn <= 1e-9) {
      p.spitIn += PIECE_SPIT;
      const out = Math.hypot(p.ox, p.oy) || 1;
      sparks(w, p.x, p.y, p.ox / out, p.oy / out, false, 'burn');
    }
    if (p.age < stick) w.thermite[kept++] = p;
  });
  w.thermite.length = kept;
}

/**
 * A rock with thermite in it died (`enemy-destroyed`): its pieces, molten
 * as it was (Asteroid passes the look on), cool off.
 */
export function thermiteDied(w, enemy, fragments) {
  if (enemy.look !== 'kindled' || stageOf(w, 'thermal') < 0) return;
  (fragments || []).forEach((piece) => {
    if (piece.look === 'kindled')
      w.cooling.push({ enemy: piece, id: piece.id, left: COOL });
  });
}

function coolPieces(w, deltaTime) {
  let kept = 0;
  w.cooling.forEach((c) => {
    c.left -= deltaTime;
    if (c.left > 1e-9) w.cooling[kept++] = c;
    else if (here(c)) coolOff(w, c.enemy);
  });
  w.cooling.length = kept;
}

// The Storm Warhead's bolt leaps to the nearest enemy it has not struck
// within `range` (rim), `gap` s a leap; with none left it is spent.
function leap(w, deltaTime) {
  const { range, gap, life } = forms(w).arc;
  let kept = 0;
  w.storms.forEach((s) => {
    s.wait -= deltaTime;
    if (s.wait > 1e-9) {
      w.storms[kept++] = s;
      return;
    }
    let best = null;
    let nearest = range;
    w.forEachSolidEnemy((enemy) => {
      if (s.taken.has(enemy) || enemy.destroyed) return;
      const d =
        Math.hypot(enemy.x - s.from.x, enemy.y - s.from.y) -
        (enemy.radius || 0);
      if (d < nearest) {
        nearest = d;
        best = enemy;
      }
    });
    if (!best) return;
    s.taken.add(best);
    const { x, y } = best;
    const radius = best.radius || 0;
    const d = Math.hypot(s.from.x - x, s.from.y - y) || 1;
    const nx = (s.from.x - x) / d;
    const ny = (s.from.y - y) / d;
    // the Storm Lance's heavy bolt, not a weapon's thin one
    arcStrike(w, s.from, best, s.damage, life, true, true, false);
    sparks(w, x + nx * radius, y + ny * radius, nx, ny, true, 'metal');
    s.from = { x, y, radius };
    s.left -= 1;
    s.wait = gap;
    if (s.left > 0) w.storms[kept++] = s;
  });
  w.storms.length = kept;
}

// What a well caught closes on its centre (to 0.8 of its radius), the gap
// shrinking with time constant `tau`; the well lasts its `timer`.
function pullIn(w, deltaTime) {
  let kept = 0;
  w.gravityWells.forEach((well) => {
    well.timer -= deltaTime;
    const share = 1 - Math.exp(-deltaTime / well.tau);
    well.caught.forEach((entry) => {
      if (!here(entry)) return;
      const { enemy } = entry;
      const dx = well.x - enemy.x;
      const dy = well.y - enemy.y;
      const d = Math.hypot(dx, dy);
      const stop = (enemy.radius || 0) * 0.8;
      if (d <= stop) return;
      const step = (d - stop) * share;
      enemy.x += (dx / d) * step;
      enemy.y += (dy / d) * step;
    });
    if (well.timer > 1e-9) w.gravityWells[kept++] = well;
  });
  w.gravityWells.length = kept;
}
