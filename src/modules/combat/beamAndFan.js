// src/modules/combat/beamAndFan.js
//
// The `beam` and `fan` fire patterns (the Harmonic's beam, the Scatter
// Coil's flak fan) and the flak burst a fan bolt ends in. Each runs on a
// shot like Weapons.fireStream, the Weapons instance first (as in
// firePatterns.js); hits land through Weapons.hitEnemy.

import { beamFling, orbsBeforeBeam, runBeamForms } from './beamForms.js';
import { capacitorRoll, coilShare, echoShot } from './firePatterns.js';

// `beam`: damage lands on everything in the segment on the firing frame;
// the beam stays on screen for `beam.duration`. Aimed like the lances: from
// the muzzle onto the primary lock's lead point in auto, along the turret
// otherwise. With multi-lock, one beam per lock from its turret layer's
// barrel; the cooldown penalty comes once per volley. The Chain Capacitor
// may fire the volley again along the same lines (`capacitorTwice`).
export function fireBeam(w, beam, playerPos, playerStats) {
  const muzzle = w.player().getMuzzlePoint();
  const lockAims = w.getLockAims();
  const shots = lockAims || [
    { origin: muzzle, angle: w.getWeaponAngle(muzzle) },
  ];
  // The primary lock's beam stands for the volley in the event.
  const stats = { ...playerStats };
  const along = () =>
    shots.map(({ origin, angle }) =>
      fireBeamAlong(w, beam, origin, angle, stats, Boolean(lockAims))
    );
  const [end] = along();
  if (capacitorRoll(w, beam.capacitorTwice)) echoShot(w, along);
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
  const orbsBefore = orbsBeforeBeam(w);
  // Kinetic: a rock it kills splits more and its fragments fly out.
  const fling = beamFling(w);
  const split = extraFragments + (fling ? fling.extra : 0);
  const kills = []; // where the rocks it killed were (the Kinetic shards)
  struck.forEach(({ enemy, x, y }) => {
    if (enemy.destroyed) return;
    const { x: rockX, y: rockY, type } = enemy;
    const result = w.hitEnemy(
      {
        kind: 'beam',
        x,
        y,
        vx,
        vy,
        damage,
        extraFragments: split,
        fling,
        hit: false,
      },
      enemy
    );
    if (result?.killed && type === 'asteroid') {
      kills.push({ x: rockX, y: rockY });
    }
  });
  // The beam's own family forms (beamForms.js), once its hits landed.
  runBeamForms(
    w,
    beam,
    {
      x: origin.x,
      y: origin.y,
      ex: end.x,
      ey: end.y,
      dirX,
      dirY,
      width,
      damage,
    },
    struck,
    kills,
    orbsBefore
  );

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
// its turret layer's barrel. The Thermal Lens narrows a fan with
// `lensSpread`; the Chain Capacitor may fire a volley twice
// (`capacitorTwice`): its `echo`, re-aimed, keeps the cooldown and never
// rolls.
export function fireFan(w, fan, playerPos, playerStats, echo = false) {
  const origin = w.player().getMuzzlePoint();
  const angle = w.getWeaponAngle(origin);
  const extra = Math.max(0, Math.floor(playerStats?.multishot ?? 1) - 1);
  const bolts = Math.min(fan.maxBolts, fan.bolts + extra);
  const focus = w.cardEffects().thermalLens ? fan.lensSpread ?? 1 : 1;
  const spread = (fan.fan * focus * Math.PI) / 180;
  // Where the bolts are aimed: the end of their range (the Overcharge Coil
  // adds `coilRange`), else of a lance's.
  const { range } = w.weapon.projectile;
  const reach = range
    ? range + (fan.coilRange ?? 0) * coilShare(w.bulletSpeed)
    : w.bulletSpeed * w.bulletLifetime;
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
    w.createBullet(from, end, playerStats.damage, volley, fan);
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
  if (!echo) {
    w.lastShotTime = -w.shootCooldown * (fan.cooldownMultiplier - 1);
    if (capacitorRoll(w, fan.capacitorTwice)) {
      const stats = { ...playerStats };
      echoShot(w, () => fireFan(w, fan, w.player().getPosition(), stats, true));
    }
  }
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
  const { burst } = bolt.projectile;
  const { duration } = burst;
  // Recoil Dampers widen it (proposta 17/11); a weapon whose `familyForms`
  // has a kinetic `burstScale` widens it again at Railshot or the Coilgun.
  const scales = w.weapon.familyForms?.kinetic?.burstScale;
  const stage = w.hasApex('kinetic') ? 1 : w.hasEvolution('kinetic') ? 0 : -1;
  const radius =
    (burst.radius + (burst.burstReach ?? 0) * w.cards().pierceBonus) *
    (scales && stage >= 0 ? scales[stage] : 1);
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
    look: bolt.projectile.look,
    // it reached the end of its range and caught nothing (the renderer pops
    // a spent missile small)
    fizzled: bolt.life <= 0 && struck.length === 0,
  });
}
