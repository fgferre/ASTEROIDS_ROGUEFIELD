// Renderer3D's answers to the field's bursts, kills, hits, burnt-out shots,
// pickups and muzzle flashes: listeners registered on the renderer itself
// (its registerEventListener), split from Renderer3D.js by subject.

import { rgbOf } from './batches.js';
import { BLAST_LOOK } from './blasts.js';
import { SPARK_KIND } from './hitSparks.js';
import { DECAL_KIND } from './scorchDecals.js';
import { strikeOf } from './enemies/rocks.js';
import { isBossEnemy } from '../physics/bossTuning.js';

// Where a shot entered a rock (21/11, 35: "o incandescente tem que ser
// aonde o tiro efetivamente tocou a pedra"), from its centre: back along the
// shot's flight from where it was caught, inside the rock, to its edge;
// straight out from the centre for a hit with no flight.
export function shotContact(enemy, position, vx, vy) {
  const radius = enemy.radius || 12;
  const px = position.x - enemy.x;
  const py = position.y - enemy.y;
  const speed = Math.hypot(vx, vy);
  if (speed > 1e-3) {
    const ux = vx / speed;
    const uy = vy / speed;
    const along = px * ux + py * uy;
    const room = along * along - (px * px + py * py - radius * radius);
    if (room >= 0) {
      const back = along + Math.sqrt(room);
      return { x: px - ux * back, y: py - uy * back };
    }
  }
  const out = Math.hypot(px, py) || 1;
  return { x: (px / out) * radius, y: (py / out) * radius };
}

/** Registers the effect listeners on the renderer `r`. */
export function registerEffectEvents(r) {
  // A burst (flak, a missile) explodes: a fireball rolling into soot, hot
  // streaks all round and incandescent fragments.
  r.registerEventListener('flak-burst', (data) => {
    const { position, angle, radius, look, fizzled } = data || {};
    if (!position) return;
    // a missile spent on nothing at the end of its range pops small
    const missile = look === 'seeker' && !fizzled;
    const kind = look === 'seeker' ? (missile ? 'seeker' : 'spent') : 'flak';
    burst(r, position, radius || 30, kind, angle || 0, missile);
  });
  // a Caster's shell lands in fire, smoke and pieces of its casing
  r.registerEventListener('caster-shell-landed', (data) => {
    if (data?.position) burst(r, data.position, data.radius, 'shell', 0);
  });
  // a split asteroid lives on as its fragments: only real deaths burn;
  // a machine that dies flashes at its own core
  r.registerEventListener('enemy-destroyed', (data) => {
    const enemy = data?.enemy;
    if (!enemy) return;
    if (!data.fragments?.length) r.three?.enemies.markDead(enemy);
    else if (enemy.type === 'asteroid')
      r.three?.enemies.splitRock(enemy, data.fragments);
    if (enemy.type !== 'asteroid' && !isBossEnemy(enemy)) {
      r.killPops.emit(enemy.x, enemy.y, enemy.radius || 12);
      // an Elite's gold blades fly off with its pieces
      const { x, y } = enemy;
      if (enemy.elite)
        r.hitSparks.emit(x, y, 1, 0, 0, 0, true, SPARK_KIND.gold);
    }
  });
  r.registerEventListener('bullet-hit', (data) => {
    const { position, enemy, bullet } = data || {};
    if (!position || data.blocked) return;
    const rock = enemy?.type === 'asteroid';
    // what a rock is made of: stone, metal (iron) or glass (crystal)
    const strike = rock ? strikeOf(enemy) : 'metal';
    const vx = bullet?.vx || 0;
    const vy = bullet?.vy || 0;
    // on a rock everything starts where the shot touched it
    const at = rock ? shotContact(enemy, position, vx, vy) : null;
    const nx = at ? at.x : enemy ? position.x - enemy.x : 0;
    const ny = at ? at.y : enemy ? position.y - enemy.y : 0;
    const x = at ? enemy.x + at.x : position.x;
    const y = at ? enemy.y + at.y : position.y;
    r.hitSparks.emit(
      x,
      y,
      nx,
      ny,
      vx,
      vy,
      Boolean(data.killed),
      SPARK_KIND[strike]
    );
    // what survives the hit keeps its heat where it was struck: a rock a
    // patch of lava, a machine a white-hot spot, and the machine jolts; a
    // machine it kills breaks with the shot's push
    if (!enemy || !bullet || isBossEnemy(enemy)) return;
    const view = r.three?.enemies.views.get(enemy.id || enemy);
    if (!view) return;
    if (data.killed) {
      if (!rock) r.three.enemies.killedBy(view, bullet.vx, bullet.vy);
      return;
    }
    if (rock) {
      if (DECAL_KIND[strike] !== undefined) {
        r.three.decals.hit(view, nx, ny, DECAL_KIND[strike], { x, y });
      }
      r.three.enemies.rockViews.struck(view, nx, ny);
      if (!r.reducedMotion) {
        r.three.enemies.rockViews.kick(view, nx, ny, vx, vy, data.damage);
      }
    } else if (!view.kind.startsWith('herald')) {
      r.three.decals.hit(view, nx, ny, DECAL_KIND.metal);
      if (!r.reducedMotion) {
        r.three.enemies.jolt(view, bullet.vx, bullet.vy, data.damage);
      }
    }
  });
  // an enemy shot that burns out in the air frays into wisps of its light
  r.registerEventListener('enemy-bullet-expired', (data) => {
    const { position, velocity, color, radius } = data || {};
    if (!position || !velocity || !r.three) return;
    const { THREE, threatRgb } = r.three;
    r.shotWisps.emit(
      position.x,
      position.y,
      velocity.x,
      velocity.y,
      radius || 4,
      color ? rgbOf(THREE, color) : threatRgb
    );
  });
  // a pickup taken breaks into bits that fly into the ship, then the hull
  // answers (pickupFx.js)
  r.registerEventListener('pickup-collected', ({ kind, x, y } = {}) => {
    r.pickupFx.emit(kind, x, y);
  });
  r.registerEventListener('health-heart-collected', (data) => {
    r.pickupFx.emit('heart', data.position.x, data.position.y);
  });
  r.registerEventListener('bullet-created', (data) => {
    const { from, bullet } = data || {};
    if (!from || !bullet) return;
    const speed = Math.hypot(bullet.vx || 0, bullet.vy || 0);
    if (speed <= 0) return;
    r.muzzles.emit(from.x, from.y, bullet.vx / speed, bullet.vy / speed);
    r.three?.player.recoilToward(r.cachedPlayer, bullet.vx, bullet.vy);
  });
}

// A burst in fire and smoke (blasts.js, BLAST_LOOK[look]) with its hot
// streaks and fragments thrown round `angle`; `heavy`: a missile's share.
function burst(r, position, radius, look, angle, heavy = false) {
  const { x, y } = position;
  r.three?.blasts.emit(x, y, radius, BLAST_LOOK[look]);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  r.hitSparks.emit(x, y, dx, dy, dx, dy, heavy, SPARK_KIND.blast);
}
