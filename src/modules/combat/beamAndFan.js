// src/modules/combat/beamAndFan.js
//
// The `beam` and `fan` fire patterns (the Harmonic's beam, the Scatter
// Coil's flak fan) and the flak burst a fan bolt ends in. Each runs on a
// shot like Weapons.fireStream, the Weapons instance first (as in
// firePatterns.js); hits land through Weapons.hitEnemy.

// `beam`: damage lands on everything in the segment on the firing frame;
// the beam stays on screen for `beam.duration`. Aimed like the lances: from
// the muzzle onto the primary lock's lead point in auto, along the turret
// otherwise. With multi-lock, one beam per lock from its turret layer's
// barrel; the cooldown penalty comes once per volley.
export function fireBeam(w, beam, playerPos, playerStats) {
  const muzzle = w.player().getMuzzlePoint();
  const lockAims = w.getLockAims();
  const shots = lockAims || [
    { origin: muzzle, angle: w.getWeaponAngle(muzzle) },
  ];
  // The primary lock's beam stands for the volley in the event.
  const [end] = shots.map(({ origin, angle }) =>
    fireBeamAlong(w, beam, origin, angle, playerStats, Boolean(lockAims))
  );
  w.lastShotTime = -beam.cooldownPenalty;
  const targeting = w.targeting();

  w.emit('weapon-fired', {
    position: playerPos,
    target: end,
    centerlineTarget: end,
    pattern: beam.pattern,
    primaryTargetId: targeting.currentTarget
      ? targeting.currentTarget.id
      : null,
    targeting: {
      dynamicPrediction: targeting.usingDynamicPrediction(),
      lockCount: targeting.currentTargetLocks.length,
      multiLockActive: Boolean(lockAims),
      predictedPoints: lockAims
        ? lockAims.map(({ enemyId, point }) => ({
            enemyId,
            position: { ...point },
          }))
        : [],
    },
  });
}

// One beam of the volley: the hit test, the beam on screen and its event;
// `layered`: a multi-lock beam, from its turret layer's barrel. Returns
// where it ends.
function fireBeamAlong(w, beam, origin, angle, playerStats, layered) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const { width, duration, extraFragments } = beam;
  const length =
    beam.length * (w.cardEffects().thermalLens?.beamLengthMultiplier ?? 1);
  const end = { x: origin.x + dirX * length, y: origin.y + dirY * length };
  const damage = (Number(playerStats?.damage) || 0) * beam.damageMultiplier;

  const struck = [];
  w.forEachSolidEnemy((enemy) => {
    const along = Math.max(
      0,
      Math.min(
        length,
        (enemy.x - origin.x) * dirX + (enemy.y - origin.y) * dirY
      )
    );
    const offX = origin.x + dirX * along - enemy.x;
    const offY = origin.y + dirY * along - enemy.y;
    const radius = enemy.radius || 0;
    const reach = radius + width / 2;
    if (offX * offX + offY * offY > reach * reach) return;
    // Hit point on the rim facing the beam (sparks need a normal).
    const off = Math.hypot(offX, offY);
    struck.push({
      enemy,
      x: off > 0.5 ? enemy.x + (offX / off) * radius : enemy.x - dirX * radius,
      y: off > 0.5 ? enemy.y + (offY / off) * radius : enemy.y - dirY * radius,
    });
  });

  const vx = dirX * w.bulletSpeed;
  const vy = dirY * w.bulletSpeed;
  struck.forEach(({ enemy, x, y }) => {
    if (enemy.destroyed) return;
    w.hitEnemy(
      { kind: 'beam', x, y, vx, vy, damage, extraFragments, hit: false },
      enemy
    );
  });

  w.beams.push({
    x: origin.x,
    y: origin.y,
    ex: end.x,
    ey: end.y,
    angle,
    width,
    life: duration,
    maxLife: duration,
    maxRadius: beam.flashRadius,
    colors: w.weapon.colors,
    layered,
  });

  w.emit('weapon-beam-fired', {
    position: origin,
    end,
    angle,
    damage,
    hits: struck.length,
    kick: beam.kick,
  });
  return end;
}

// `fan`: a fan of the weapon's projectile from the muzzle, aimed like the
// beam. Multishot adds bolts to the fan; the volley waits
// `fan.cooldownMultiplier` × the lance's cooldown. With multi-lock the same
// bolts are split over the locks, earlier locks first, each lock getting a
// small fan of its own (same bolt spacing) centred on its lead point, from
// its turret layer's barrel.
export function fireFan(w, fan, playerPos, playerStats) {
  const origin = w.player().getMuzzlePoint();
  const angle = w.getWeaponAngle(origin);
  const extra = Math.max(0, Math.floor(playerStats?.multishot ?? 1) - 1);
  const bolts = Math.min(fan.maxBolts, fan.bolts + extra);
  const spread = (fan.fan * Math.PI) / 180;
  // Where the bolts are aimed: the end of their range, else of a lance's.
  const reach = w.weapon.projectile.range ?? w.bulletSpeed * w.bulletLifetime;
  // Shared by the volley's bolts: who its shrapnel already hit, and how
  // many bursts it has had (only the first lights the 3D scene).
  const volley = { struck: [], bursts: 0 };
  const lockAims = w.getLockAims();
  const predictedPoints = [];
  const launch = (a, from = origin) => {
    const end = {
      x: from.x + Math.cos(a) * reach,
      y: from.y + Math.sin(a) * reach,
    };
    w.createBullet(from, end, playerStats.damage, volley);
    return end;
  };
  if (lockAims) {
    const step = spread / (fan.bolts - 1);
    const share = Math.floor(bolts / lockAims.length);
    const longer = bolts % lockAims.length;
    lockAims.forEach((lock, index) => {
      const count = share + (index < longer ? 1 : 0);
      for (let i = 0; i < count; i += 1) {
        launch(lock.angle + step * (i - (count - 1) / 2), lock.origin);
      }
      predictedPoints.push({
        enemyId: lock.enemyId,
        position: { ...lock.point },
      });
    });
  } else {
    for (let i = 0; i < bolts; i += 1) {
      const a = bolts === 1 ? angle : angle + spread * (i / (bolts - 1) - 0.5);
      predictedPoints.push({ enemyId: null, position: launch(a) });
    }
  }
  w.lastShotTime = -w.shootCooldown * (fan.cooldownMultiplier - 1);
  const targeting = w.targeting();

  const centre = {
    x: origin.x + Math.cos(angle) * reach,
    y: origin.y + Math.sin(angle) * reach,
  };
  w.emit('weapon-fired', {
    position: playerPos,
    target: centre,
    centerlineTarget: centre,
    pattern: fan.pattern,
    primaryTargetId: targeting.currentTarget
      ? targeting.currentTarget.id
      : null,
    targeting: {
      dynamicPrediction: targeting.usingDynamicPrediction(),
      lockCount: targeting.currentTargetLocks.length,
      multiLockActive: Boolean(lockAims),
      predictedPoints,
    },
  });
}

// A projectile's `burst`: shrapnel hits every solid enemy whose rim is
// within `burst.radius`, at most once per volley, through the same hit path
// as the bolts (so the evolutions apply).
export function burstFlak(w, bolt) {
  const { x, y, volley } = bolt;
  const { radius, duration } = bolt.projectile.burst;
  const struck = [];
  w.forEachSolidEnemy((enemy) => {
    if (volley.struck.includes(enemy)) return;
    const reach = radius + (enemy.radius || 0);
    if ((enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= reach * reach) {
      struck.push(enemy);
    }
  });
  volley.struck.push(...struck);
  struck.forEach((enemy) => {
    if (enemy.destroyed) return;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const distance = Math.hypot(dx, dy) || 1;
    const radius = Math.min(enemy.radius || 0, distance);
    w.hitEnemy(
      {
        kind: 'shrapnel',
        x: enemy.x - (dx / distance) * radius,
        y: enemy.y - (dy / distance) * radius,
        vx: (dx / distance) * w.bulletSpeed,
        vy: (dy / distance) * w.bulletSpeed,
        damage: bolt.shrapnel,
        hit: false,
      },
      enemy
    );
  });

  const angle = Math.atan2(bolt.vy || 0, bolt.vx || 1);
  w.flakBursts.push({
    x,
    y,
    angle,
    life: duration,
    maxLife: duration,
    maxRadius: radius,
    colors: bolt.colors,
    lit: volley.bursts === 0,
  });
  volley.bursts += 1;
  w.emit('flak-burst', {
    position: { x, y },
    radius,
    angle,
    hits: struck.length,
  });
}
