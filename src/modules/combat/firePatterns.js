// src/modules/combat/firePatterns.js
//
// The fire patterns past the lance's (Weapons.js), the beam's and the fan's
// (beamAndFan.js):
// `chain`, lightning that jumps between enemies; `orbit`, blades circling the
// ship; `aura`, a ring of heat that pulses round the ship; `seeker`, slow
// missiles that turn onto their targets. Each `fire*` runs on a shot like
// Weapons.fireStream, the Weapons instance first; `tickWeaponField` moves
// what lives between shots (the blades, the aura's ring, the missiles a kill
// breeds) and `steerSeeker` turns a missile in flight. Hits land through
// Weapons.hitEnemy, like a beam's.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
// A chain with nothing in reach crackles out this much of its range; its
// bolts show BOLT_LIFE s (proposta 20/10).
const FIZZLE = 0.5;
const BOLT_LIFE = 0.1;
// Missiles a kill breeds fan out over this arc round the dying missile's
// heading.
const BROOD_SPREAD = 120 * DEG;

const extraShots = (stats) =>
  Math.max(0, Math.floor(stats?.multishot ?? 1) - 1);
const damageOf = (stats, entry) =>
  (Number(stats?.damage) || 0) * entry.damageMultiplier;
const wrapAngle = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

// The next shot waits `cooldownMultiplier` × the lance's cooldown.
function setCooldown(w, entry) {
  w.lastShotTime = -w.shootCooldown * (entry.cooldownMultiplier - 1);
}

// A hit of `kind` on `enemy`'s rim facing (fromX, fromY), shoving it along
// `angle`; returns the hit's result (null when the enemy is already gone).
function strike(w, kind, enemy, fromX, fromY, angle, damage) {
  if (enemy.destroyed) return null;
  const dx = enemy.x - fromX;
  const dy = enemy.y - fromY;
  const distance = Math.hypot(dx, dy) || 1;
  const rim = Math.min(enemy.radius || 0, distance);
  return w.hitEnemy(
    {
      kind,
      x: enemy.x - (dx / distance) * rim,
      y: enemy.y - (dy / distance) * rim,
      vx: Math.cos(angle) * w.bulletSpeed,
      vy: Math.sin(angle) * w.bulletSpeed,
      damage,
      hit: false,
    },
    enemy
  );
}

// Every solid enemy whose rim is within `reach` of (x, y), nearest first,
// past `skip`.
function enemiesNear(w, x, y, reach, skip = null) {
  const near = [];
  w.forEachSolidEnemy((enemy) => {
    if (skip?.includes(enemy)) return;
    const limit = reach + (enemy.radius || 0);
    const sq = (enemy.x - x) ** 2 + (enemy.y - y) ** 2;
    if (sq <= limit * limit) near.push({ enemy, sq });
  });
  return near.sort((a, b) => a.sq - b.sq).map(({ enemy }) => enemy);
}

function emitFired(w, pattern, position, target = null, lockCount = 0) {
  w.emit('weapon-fired', {
    position,
    target,
    centerlineTarget: target,
    pattern,
    weaponId: w.weaponId,
    primaryTargetId: w.targeting().currentTarget?.id ?? null,
    targeting: {
      dynamicPrediction: w.targeting().usingDynamicPrediction(),
      lockCount,
      multiLockActive: false,
      predictedPoints: [],
    },
  });
}

/**
 * `chain`: lightning from the muzzle into the nearest `bolts` enemies within
 * `range` px, inside a `cone` of degrees round the aim (360: all round; in
 * auto aim the primary lock first); each then jumps `jumps` times to the
 * nearest enemy within `jumpRange` px not struck yet, `fork` branches a hop,
 * at most `targets` enemies a cast, each hop dealing `falloff` × the one
 * before. Multishot adds a jump each, up to `maxJumps`; the Chain
 * Capacitor's extra jumps come on top. Nothing in reach:
 * the bolt crackles out and fades. An Apex form draws the heavy bolt.
 */
export function fireChain(w, chain, playerPos, playerStats) {
  const origin = w.player().getMuzzlePoint();
  const angle = w.getWeaponAngle(origin);
  const start = { x: origin.x, y: origin.y, radius: 0 };
  const style = {
    color: w.weapon.colors.arc,
    heavy: w.weapon.form?.stage === 'apex',
    bolt: true,
    life: BOLT_LIFE,
  };
  const link = (source, target, damage) => {
    w.cards().addArc(source, target, style);
    const along = Math.atan2(target.y - source.y, target.x - source.x);
    strike(w, 'arc', target, source.x, source.y, along, damage);
  };

  const firsts = chainTargets(w, chain, origin, angle);
  let damage = damageOf(playerStats, chain);
  firsts.forEach((enemy) => link(start, enemy, damage));
  const visited = [...firsts];
  const jumps =
    Math.min(chain.maxJumps, chain.jumps + extraShots(playerStats)) +
    (w.cards().cardEffects.chainCapacitor?.extraJumps ?? 0);
  let front = firsts;
  for (let hop = 0; hop < jumps && front.length; hop += 1) {
    damage *= chain.falloff;
    const next = [];
    front.forEach((source) => {
      enemiesNear(w, source.x, source.y, chain.jumpRange, visited)
        .slice(0, chain.fork)
        .forEach((target) => {
          if (visited.length >= chain.targets) return;
          visited.push(target);
          next.push(target);
          link(source, target, damage);
        });
    });
    front = next;
  }

  let end = firsts[0] ? { x: firsts[0].x, y: firsts[0].y } : null;
  if (!end) {
    const reach = chain.range * FIZZLE;
    end = {
      x: origin.x + Math.cos(angle) * reach,
      y: origin.y + Math.sin(angle) * reach,
    };
    w.cards().addArc(start, { ...end, radius: 0 }, style);
  }
  setCooldown(w, chain);
  emitFired(w, chain.pattern, playerPos, end, firsts.length);
}

// The chain's first targets: in range and inside the cone, nearest first;
// in auto aim the primary lock leads when it is among them.
function chainTargets(w, chain, origin, angle) {
  const half = (chain.cone * DEG) / 2;
  const inCone = (enemy) =>
    chain.cone >= 360 ||
    Math.abs(
      wrapAngle(Math.atan2(enemy.y - origin.y, enemy.x - origin.x) - angle)
    ) <= half;
  const firsts = enemiesNear(w, origin.x, origin.y, chain.range).filter(inCone);
  const targeting = w.targeting();
  const lock =
    targeting.aimMode === 'manual' || targeting.stickAim
      ? null
      : targeting.currentTarget;
  const at = lock ? firsts.indexOf(lock) : -1;
  if (at > 0) firsts.unshift(...firsts.splice(at, 1));
  return firsts.slice(0, chain.bolts);
}

/**
 * `orbit`: a ring of `blades` blades (Multishot adds one each, up to
 * `maxBlades`) `radius` px round the ship, turning at `spin` rad/s (below 0
 * the other way); with `sweep` { reach, period } the ring breathes out to
 * `reach` px and back every `period` s. A blade cuts each enemy its
 * `bladeRadius` touches once a cycle, for `damageMultiplier` × damage; a shot
 * starts the next cycle, `cooldownMultiplier` × the lance's cooldown later.
 * Every orbit entry of the fire list is a ring, all turning at once.
 */
export function fireOrbit(w, orbit) {
  w.bladeCuts.clear();
  w.orbitSounded = false;
  setCooldown(w, orbit);
}

/** How far out a ring is at `clock` s. */
export function ringRadius(ring, clock) {
  const { radius, sweep } = ring;
  if (!sweep) return radius;
  return (
    radius +
    ((sweep.reach - radius) * (1 - Math.cos((TAU * clock) / sweep.period))) / 2
  );
}

function tickOrbit(w, rings, centre, deltaTime, playerStats) {
  w.orbitClock += deltaTime;
  const extra = extraShots(playerStats);
  const cuts = [];
  rings.forEach((ring, r) => {
    const count = Math.min(ring.maxBlades, ring.blades + extra);
    const radius = ringRadius(ring, w.orbitClock);
    const turn = w.orbitClock * ring.spin;
    const travel = Math.sign(ring.spin) * (Math.PI / 2);
    for (let i = 0; i < count; i += 1) {
      const a = turn + (TAU * i) / count;
      const x = centre.x + Math.cos(a) * radius;
      const y = centre.y + Math.sin(a) * radius;
      const heading = a + travel;
      // `around`: where on its ring (cx, cy, radius) it is; `index` 0 is
      // the ring's first blade (the 3D mirror draws the ring once).
      w.blades.push({
        x,
        y,
        angle: heading,
        size: ring.bladeRadius,
        cx: centre.x,
        cy: centre.y,
        radius,
        around: a,
        spin: ring.spin,
        index: i,
      });
      const slot = r * 64 + i;
      enemiesNear(w, x, y, ring.bladeRadius).forEach((enemy) => {
        let cut = w.bladeCuts.get(slot);
        if (!cut) w.bladeCuts.set(slot, (cut = new Set()));
        if (cut.has(enemy)) return;
        cut.add(enemy);
        cuts.push([enemy, x, y, heading, damageOf(playerStats, ring)]);
      });
    }
  });
  cuts.forEach(([enemy, x, y, heading, damage]) =>
    strike(w, 'blade', enemy, x, y, heading, damage)
  );
  // The weapon sounds once a cycle, on its first cut.
  if (cuts.length && !w.orbitSounded) {
    w.orbitSounded = true;
    emitFired(w, 'orbit', centre);
  }
}

/**
 * `aura`: a pulse of heat on every enemy whose rim is within `radius` px of
 * the ship (Multishot widens it `growth` px each, up to `maxRadius`), for
 * `damageMultiplier` × damage, shoving it out; `burn` { duration, ticks,
 * damageFraction } sets what survives burning like the Incendiary Lance. The
 * pulse shows for `duration` s; between pulses the ring heats up.
 */
export function fireAura(w, aura, playerPos, playerStats) {
  const radius = auraRadius(aura, playerStats);
  const damage = damageOf(playerStats, aura);
  const { x, y } = playerPos;
  enemiesNear(w, x, y, radius).forEach((enemy) => {
    const out = Math.atan2(enemy.y - y, enemy.x - x);
    const result = strike(w, 'heat', enemy, x, y, out, damage);
    if (aura.burn && result && !result.killed && !enemy.destroyed) {
      w.cards().ignite(enemy, damage, aura.burn);
    }
  });
  w.pulses.push({
    x,
    y,
    maxRadius: radius,
    life: aura.duration,
    maxLife: aura.duration,
    colors: w.weapon.colors,
  });
  setCooldown(w, aura);
  emitFired(w, aura.pattern, playerPos);
}

const auraRadius = (aura, playerStats) =>
  Math.min(aura.maxRadius, aura.radius + aura.growth * extraShots(playerStats));

// The ring between pulses: the weapon's last aura entry (the one every shot
// can fire), `heat` 0 → 1 as the next pulse comes due.
function tickAura(w, aura, centre, playerStats) {
  const wait = w.shootCooldown * aura.cooldownMultiplier;
  const since =
    w.lastShotTime + w.shootCooldown * (aura.cooldownMultiplier - 1);
  w.aura = {
    x: centre.x,
    y: centre.y,
    radius: auraRadius(aura, playerStats),
    heat: Math.min(1, Math.max(0, since / wait)),
    colors: w.weapon.colors,
  };
  w.pulses.forEach((pulse) => {
    pulse.x = centre.x;
    pulse.y = centre.y;
  });
}

/**
 * `seeker`: a salvo of `missiles` (Multishot adds one each, up to
 * `maxMissiles`) launched across `spread` degrees round the aim (360: a ring
 * all round), each for `damageMultiplier` × damage before the projectile's
 * own, each with its own target: the locks first, then the nearest enemies
 * within `acquire` px, round again when there are fewer. In flight a missile
 * turns at most `turn` rad/s onto its target (steerSeeker); `breed`: a
 * missile that kills launches that many more from the wreck, which do not
 * breed.
 */
export function fireSeeker(w, seeker, playerPos, playerStats) {
  const origin = w.player().getMuzzlePoint();
  const angle = w.getWeaponAngle(origin);
  const count = Math.min(
    seeker.maxMissiles,
    seeker.missiles + extraShots(playerStats)
  );
  const targets = seekerTargets(w, origin, seeker.acquire, count);
  const damage = damageOf(playerStats, seeker);
  for (let i = 0; i < count; i += 1) {
    const a =
      seeker.spread >= 360
        ? angle + (TAU * i) / count
        : count === 1
          ? angle
          : angle + seeker.spread * DEG * (i / (count - 1) - 0.5);
    launchSeeker(w, seeker, origin, a, damage, targets[i % targets.length]);
  }
  setCooldown(w, seeker);
  const first = targets[0];
  emitFired(
    w,
    seeker.pattern,
    playerPos,
    first ? { x: first.x, y: first.y } : null,
    targets.length
  );
}

function seekerTargets(w, origin, acquire, count, skip = null) {
  const locks = skip ? [] : w.targeting().currentTargetLocks || [];
  const chosen = locks
    .filter((enemy) => enemy && !enemy.destroyed && !enemy.intangible)
    .slice(0, count);
  const rest = enemiesNear(w, origin.x, origin.y, acquire, [
    ...chosen,
    ...(skip ?? []),
  ]);
  return [...chosen, ...rest.slice(0, count - chosen.length)];
}

function launchSeeker(w, seeker, from, angle, damage, target, breed) {
  const bullet = w.createBullet(
    from,
    { x: from.x + Math.cos(angle), y: from.y + Math.sin(angle) },
    damage
  );
  if (!bullet) return;
  bullet.seeker = {
    target: target ?? null,
    id: target?.id ?? null,
    turn: seeker.turn,
    acquire: seeker.acquire,
    breed: breed ?? seeker.breed,
    entry: seeker,
    damage,
  };
}

/** Turns a missile toward its target, taking the nearest when it is gone. */
export function steerSeeker(w, bullet, deltaTime) {
  const seeker = bullet.seeker;
  let { target } = seeker;
  if (
    !target ||
    target.destroyed ||
    target.intangible ||
    target.id !== seeker.id
  ) {
    target = enemiesNear(w, bullet.x, bullet.y, seeker.acquire)[0] ?? null;
    seeker.target = target;
    seeker.id = target?.id ?? null;
  }
  if (!target) return;
  const heading = Math.atan2(bullet.vy, bullet.vx);
  const limit = seeker.turn * deltaTime;
  const turn = Math.max(
    -limit,
    Math.min(
      limit,
      wrapAngle(Math.atan2(target.y - bullet.y, target.x - bullet.x) - heading)
    )
  );
  const speed = Math.hypot(bullet.vx, bullet.vy);
  bullet.vx = Math.cos(heading + turn) * speed;
  bullet.vy = Math.sin(heading + turn) * speed;
}

/** A missile with `breed` killed `enemy`: its brood launches next tick. */
export function breedSeekers(w, bullet, enemy) {
  w.broods.push({
    x: enemy.x,
    y: enemy.y,
    heading: Math.atan2(bullet.vy, bullet.vx),
    seeker: bullet.seeker,
    dead: enemy,
  });
}

function launchBroods(w) {
  const broods = w.broods.splice(0);
  broods.forEach(({ x, y, heading, seeker, dead }) => {
    const count = seeker.breed;
    const from = { x, y };
    const targets = seekerTargets(w, from, seeker.acquire, count, [dead]);
    for (let i = 0; i < count; i += 1) {
      const a =
        count === 1
          ? heading
          : heading + BROOD_SPREAD * (i / (count - 1) - 0.5);
      launchSeeker(
        w,
        seeker.entry,
        from,
        a,
        seeker.damage,
        targets[i % targets.length],
        0
      );
    }
  });
}

/**
 * What lives between shots, every frame the ship may fire: the blades of
 * each `orbit` ring, the `aura` ring, the missiles kills bred.
 */
export function tickWeaponField(w, deltaTime, playerStats) {
  const { fire } = w.weapon;
  const centre = w.player().getPosition();
  w.blades.length = 0;
  const rings = fire.filter((entry) => entry.pattern === 'orbit');
  if (rings.length) tickOrbit(w, rings, centre, deltaTime, playerStats);
  const aura = fire.findLast((entry) => entry.pattern === 'aura');
  if (aura) tickAura(w, aura, centre, playerStats);
  else w.aura = null;
  if (w.broods.length) launchBroods(w);
}

/** The ship cannot fire (dead, gone, held): no blades and no ring show. */
export function holsterWeaponField(w) {
  w.blades.length = 0;
  w.aura = null;
}
