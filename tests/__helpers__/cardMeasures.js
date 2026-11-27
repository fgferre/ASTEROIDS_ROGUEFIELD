// The card matrix's measurements: the scenes' small readings (damage per
// second, shots, speeds, turn rates, pulls...) and the rank formulas the
// probes of cardProbes.js use. Split from that catalog by subject.

import { SHIP, STEP_SECONDS } from './cardScene.js';

// Wounded, tanky rocks (cardBench's `tank`): near the ship for the aura and
// orbit, a line ahead for pierce and range, off the line for spread.
export const TANK = [
  [70, 0],
  [0, -70],
  [0, 70],
  [-65, 0],
  [140, 0],
  [220, 0],
  [310, 0],
  [420, 0],
  [540, 0],
  [240, -110],
  [240, 110],
  [400, -150],
  [400, 150],
  [140, -60],
  [140, 60],
];

export const hold = (scene, rocks) =>
  rocks.forEach(({ rock, x, y }) => {
    rock.x = x;
    rock.y = y;
    rock.vx = 0;
    rock.vy = 0;
  });

/** Rocks at `layout` offsets from the ship, held in place every step. */
export function field(scene, layout = TANK, config = {}, stats) {
  return layout.map(([dx, dy]) => {
    const x = SHIP.x + dx;
    const y = SHIP.y + dy;
    const rock = scene.spawn(
      config.type ?? 'asteroid',
      { x, y, ...config },
      stats
    );
    return { rock, x, y };
  });
}

/** Total damage the weapon deals the TANK field in `seconds`, ship parked. */
export function dps(scene, { seconds = 6, layout = TANK, config, each } = {}) {
  const rocks = field(scene, layout, config);
  scene.run(seconds, (sc, frame) => {
    sc.park();
    hold(sc, rocks);
    each?.(sc, frame);
  });
  return {
    value: scene.totalDamage(),
    trigger: scene.damage.length,
    extra: { hits: scene.damage.length, shots: scene.combat.weapons.shots },
  };
}

/** Shots the weapon fired in `seconds` on the TANK field. */
export function shots(scene, opts = {}) {
  const r = dps(scene, opts);
  return {
    value: r.extra.shots,
    trigger: r.extra.shots,
    extra: { damage: r.value },
  };
}

// Counts the projectiles each fire creates (createBullet) and their speeds.
function countBullets(scene) {
  const stats = { created: 0, speeds: [] };
  const projectiles = scene.combat.projectiles;
  const create = projectiles.createBullet.bind(projectiles);
  projectiles.createBullet = (...args) => {
    stats.created += 1;
    const result = create(...args);
    const bullet = projectiles.bullets.at(-1);
    if (bullet) stats.speeds.push(Math.hypot(bullet.vx, bullet.vy));
    return result;
  };
  return stats;
}

// Damage entries split by fire (weapon-fired events).
export function byCast(scene) {
  const casts = [];
  let current = null;
  scene.onEvent = (name) => {
    if (name === 'weapon-fired') {
      current = new Set();
      casts.push(current);
    }
  };
  const applyDamage = scene.enemies.applyDamage;
  scene.enemies.applyDamage = (enemy, damage, options) => {
    current?.add(enemy);
    return applyDamage(enemy, damage, options);
  };
  return casts;
}

// === Expectations ===
// `cum[r]`: the promised value at rank r as a factor of rank 0.
export const mult = (cum) => (rank, below) =>
  (below * cum[rank]) / cum[rank - 1];
// `cum[r]`: the promised amount added at rank r over rank 0.
export const add = (cum) => (rank, below) => below + cum[rank] - cum[rank - 1];
// `values[r]`: the promised value at rank r, whatever the rank below read.
export const abs = (values) => (rank) => values[rank];

// Weapon-specific multishot numbers (the cards' weaponText).
export const MULTISHOT = {
  lance: { metric: 'projectiles per shot', at: (r) => 1 + r },
  harmonic: { metric: 'lances per stream shot', at: (r) => 1 + r },
  scatter: { metric: 'flak bolts per volley', at: (r) => 5 + r },
  'furnace-corona': { metric: 'ring radius (px)', at: (r) => 78 + 10 * r },
  'shard-halo': { metric: 'blades', at: (r) => 3 + r },
  'arc-caster': {
    metric: 'enemies struck per cast (1 + jumps)',
    at: (r) => 4 + r,
  },
  'seeker-swarm': { metric: 'missiles per salvo', at: (r) => 2 + r },
};

// A chain of rocks ahead, 80 px apart (the Arc Caster jumps 120 px).
// A snake (stays on the 800 × 600 field): each rock 80 px from the next.
const CHAIN = [
  [100, 0],
  [180, 0],
  [260, 0],
  [260, 80],
  [180, 80],
  [100, 80],
  [100, 160],
  [180, 160],
  [260, 160],
];

export function weaponCount(scene, weapon) {
  if (weapon === 'shard-halo') {
    let most = 0;
    scene.run(1, (sc) => {
      sc.park();
      most = Math.max(most, sc.combat.weapons.blades.length);
    });
    return { value: most, trigger: 1 };
  }
  if (weapon === 'furnace-corona') {
    const rocks = field(scene);
    let most = 0;
    scene.run(2, (sc) => {
      sc.park();
      hold(sc, rocks);
      most = Math.max(most, sc.combat.weapons.aura?.radius ?? 0);
    });
    return { value: most, trigger: 1 };
  }
  if (weapon === 'arc-caster') {
    const casts = byCast(scene);
    const rocks = field(scene, CHAIN);
    scene.run(3, (sc) => {
      sc.park();
      hold(sc, rocks);
    });
    const most = Math.max(0, ...casts.map((c) => c.size));
    return { value: most, trigger: casts.length };
  }
  const bullets = countBullets(scene);
  let beams = 0;
  const onEvent = scene.onEvent;
  scene.onEvent = (name, payload) => {
    if (name === 'weapon-beam-fired') beams += 1;
    onEvent?.(name, payload);
  };
  const r = dps(scene, { seconds: 4 });
  const fires = r.extra.shots - beams;
  return { value: fires ? bullets.created / fires : 0, trigger: fires };
}

// The Overcharge Coil with each weapon: what its text says grows.
export function coilMeasure(scene, weapon) {
  if (['lance', 'harmonic', 'scatter', 'seeker-swarm'].includes(weapon)) {
    const bullets = countBullets(scene);
    let beams = 0;
    scene.onEvent = (name) => {
      if (name === 'weapon-beam-fired') beams += 1;
    };
    const r = dps(scene, { seconds: 4 });
    const speed = bullets.speeds.length ? Math.max(...bullets.speeds) : 0;
    return {
      value: speed,
      trigger: bullets.created,
      extra: { beams, shots: r.extra.shots, beamShare: beams / r.extra.shots },
    };
  }
  if (weapon === 'shard-halo') {
    scene.run(0.5, (sc) => sc.park());
    const a = scene.combat.weapons.blades[0]?.around ?? 0;
    scene.run(1, (sc) => sc.park());
    const b = scene.combat.weapons.blades[0]?.around ?? 0;
    return { value: b - a, trigger: scene.combat.weapons.blades.length };
  }
  return shots(scene, { seconds: 30 });
}
export const COIL = {
  lance: { metric: 'lance speed (px/s)', cum: [1, 1.15, 1.3225, 1.520875] },
  harmonic: { metric: 'lance speed (px/s)', cum: [1, 1.15, 1.3225, 1.520875] },
  scatter: { metric: 'flak bolt speed (px/s)', cum: [1, 1.17, 1.33, 1.5] },
  'seeker-swarm': { metric: 'missile speed (px/s)', cum: [1, 1.1, 1.2, 1.3] },
  'arc-caster': {
    metric: 'casts in 30 s',
    cum: [1, 1 / 0.95, 1 / 0.9, 1 / 0.85],
  },
  'furnace-corona': {
    metric: 'pulses in 30 s',
    cum: [1, 1 / 0.95, 1 / 0.9, 1 / 0.85],
  },
  'shard-halo': { metric: 'blade spin (rad/s)', cum: [1, 1.05, 1.1, 1.15] },
};

// One hit of `amount` on the hull (the game's takeDamage, as a collision
// calls it); what reached the hull.
export function hullHit(scene, amount = 20, input = {}) {
  scene.input = input;
  scene.run(0.2, (sc) => sc.park());
  const before = scene.player.health;
  const { applied } = scene.hit(amount);
  return { value: before - scene.player.health, trigger: applied ? 1 : 0 };
}

// Flight: holds `input` for `seconds` from rest; returns the speed reached.
export function speedAfter(scene, input, seconds) {
  scene.input = input;
  let most = 0;
  scene.run(seconds, (sc) => {
    const v = sc.player.velocity;
    most = Math.max(most, Math.hypot(v.vx, v.vy));
  });
  return most;
}
// The classic turn rate (deg/s) at steady state holding D.
export function turnRate(scene) {
  scene.input = { right: true };
  scene.run(3, (sc) => {
    sc.player.position.x = SHIP.x;
    sc.player.position.y = SHIP.y;
  });
  return (Math.abs(scene.player.angularVelocity) * 180) / Math.PI;
}
// Time (s) a released classic spin takes to stop (under 1°/s).
export function spinStopTime(scene) {
  scene.input = { right: true };
  scene.run(3);
  scene.input = {};
  let t = 0;
  while (Math.abs(scene.player.angularVelocity) > Math.PI / 180 && t < 10) {
    scene.run(STEP_SECONDS);
    t += STEP_SECONDS;
  }
  return t;
}
// Time (s) from letting go at top speed until the ship is still (< 2 px/s).
export function stopTime(scene, input = { up: true }, seconds = 5) {
  speedAfter(scene, input, seconds);
  scene.input = {};
  let t = 0;
  const speed = () =>
    Math.hypot(scene.player.velocity.vx, scene.player.velocity.vy);
  while (speed() > 2 && t < 10) {
    scene.run(STEP_SECONDS);
    t += STEP_SECONDS;
  }
  return t;
}
// The retro's pull (px/s² average over 0.3 s) holding S from top speed.
export function retroPull(scene) {
  speedAfter(scene, { up: true }, 5);
  const v0 = Math.hypot(scene.player.velocity.vx, scene.player.velocity.vy);
  scene.input = { down: true };
  scene.run(0.2);
  const v1 = Math.hypot(scene.player.velocity.vx, scene.player.velocity.vy);
  return (v0 - v1) / 0.2;
}

// Dash: presses dash once; returns what `read` gives when the dash is over.
export function dashOnce(scene, input = {}) {
  scene.input = input;
  scene.run(0.1);
  const start = { ...scene.player.position };
  scene.press.add('dash');
  let dashed = 0;
  const onEvent = scene.onEvent;
  scene.onEvent = (name, payload) => {
    if (name === 'player-dashed') dashed += 1;
    onEvent?.(name, payload);
  };
  scene.run(STEP_SECONDS * 2);
  while (scene.player.maneuvers.dashTimer > 0) scene.run(STEP_SECONDS);
  return { start, dashed };
}

// Seconds between two dashes when dash is pressed every step.
export function dashInterval(scene) {
  const times = [];
  scene.onEvent = (name) => {
    if (name === 'player-dashed') times.push(scene.time);
  };
  scene.run(6, (sc) => {
    sc.park();
    sc.press.add('dash');
  });
  return {
    value: times.length > 1 ? times[1] - times[0] : 0,
    trigger: times.length,
  };
}

// Dashes in the first 0.5 s pressing dash every step.
export function dashesInBurst(scene) {
  let n = 0;
  scene.onEvent = (name) => {
    if (name === 'player-dashed') n += 1;
  };
  scene.run(0.5, (sc) => {
    sc.park();
    sc.press.add('dash');
  });
  return { value: n, trigger: n };
}

// An orb of `value` XP collected at the ship: the experience it gave.
export function orbXp(scene, value = 10) {
  const xp = scene.services['xp-orbs'];
  const before = scene.progression.totalExperience;
  xp.createXPOrb(SHIP.x + 5, SHIP.y, value);
  scene.run(1, (sc) => sc.park());
  return {
    value: scene.progression.totalExperience - before,
    trigger: scene.progression.totalExperience - before > 0 ? 1 : 0,
  };
}

// The farthest orb (px from the ship, 5 px steps) the magnet moves in a step.
export function magnetReach(scene) {
  const xp = scene.services['xp-orbs'];
  scene.run(0.1, (sc) => sc.park());
  let reach = 0;
  for (let d = 20; d <= 400; d += 5) {
    const orb = xp.createXPOrb(SHIP.x + d, SHIP.y, 1);
    const before = orb.x;
    xp.update(STEP_SECONDS);
    const pulled = orb.x < before - 1e-9;
    xp.consumeOrb(orb);
    if (!pulled) break;
    reach = d;
  }
  return { value: reach, trigger: 1 };
}

// Seconds until a far orb (outside the magnet) starts flying to the ship.
export function towTime(scene) {
  const xp = scene.services['xp-orbs'];
  const orb = xp.createXPOrb(SHIP.x + 350, SHIP.y + 250, 1);
  const x0 = orb.x;
  let t = 0;
  while (t < 30) {
    scene.run(0.1, (sc) => sc.park());
    t += 0.1;
    if (orb.x !== x0 || !xp.getActiveOrbs().includes(orb)) break;
  }
  return { value: Math.min(t, 30), trigger: 1 };
}

// The combo multiplier after 40 kills in a row (cap reached).
export function comboCap(scene) {
  for (let i = 0; i < 40; i += 1) {
    scene.progression.incrementCombo({ reason: 'enemy-destroyed' });
  }
  // What an orb of 100 XP is worth at that combo, ÷ 100 (the real multiplier).
  const before = scene.progression.totalExperience;
  scene.progression.collectXP(100);
  return {
    value: (scene.progression.totalExperience - before) / 100,
    trigger: 1,
  };
}

// Kills `count` small rocks through the game's damage path; field pickups dropped.
export function pickupsFromRocks(scene, count = 400) {
  let made = 0;
  for (let i = 0; i < count; i += 1) {
    const rock = scene.spawn(
      'asteroid',
      { size: 'small', x: SHIP.x + 200, y: SHIP.y + 150 },
      { health: null }
    );
    if (!rock) continue;
    scene.enemies.applyDamage(rock, 1e9);
    made += 1;
    scene.run(STEP_SECONDS, (sc) => sc.park());
  }
  const pickups = scene.services.pickups.getActivePickups().length;
  return {
    value: pickups / made,
    trigger: made,
    extra: { rocks: made, pickups },
  };
}

// A rock flying 60 px/s at `distance` below the ship, put back each step:
// its speed (px/s) from what it flew between steps.
export function driftSpeed(scene, distance) {
  const rock = scene.spawn('asteroid', {
    x: SHIP.x - 20,
    y: SHIP.y + distance,
    vx: 60,
    vy: 0,
  });
  let flown = 0;
  let prev = null;
  let frames = 0;
  scene.run(1, (sc) => {
    sc.park();
    if (prev !== null) {
      flown += rock.x - prev;
      frames += 1;
    }
    rock.x = SHIP.x - 20;
    rock.y = SHIP.y + distance;
    rock.vx = 60;
    rock.vy = 0;
    prev = rock.x;
  });
  return { value: flown / (frames * STEP_SECONDS), trigger: frames };
}
// The same for an enemy shot (the combat system's enemy bullets).
export function shotSpeed(scene, distance) {
  scene.combat.handleEnemyProjectile({
    position: { x: SHIP.x - 20, y: SHIP.y + distance },
    velocity: { x: 60, y: 0 },
    damage: 1,
    lifetime: 100,
  });
  const shot = scene.combat.enemyBullets.at(-1);
  if (!shot) return { value: 0, trigger: 0 };
  let flown = 0;
  let prev = null;
  let frames = 0;
  scene.run(0.5, (sc) => {
    sc.park();
    if (prev !== null) {
      flown += shot.x - prev;
      frames += 1;
    }
    shot.x = SHIP.x - 20;
    shot.y = SHIP.y + distance;
    shot.vx = 60;
    shot.vy = 0;
    shot.life = 100;
    prev = shot.x;
  });
  return {
    value: frames ? flown / (frames * STEP_SECONDS) : 0,
    trigger: frames,
  };
}

// Emergency brake: flies forward 2 s, then S held 0.5 s, a rock `distance`
// px ahead of where the brake fires; value: how far the rock was shoved (px),
// extra.damage: what it took from the brake (twin: lance hits equal).
export function brakeShove(scene, distance = 80) {
  scene.player.angle = Math.PI / 2; // nose down: the lance fires away from the rock
  scene.input = { up: true };
  scene.run(1.5);
  // A drone: the shove moves machines, never rocks (HitResolution.pushEnemy).
  const rock = scene.spawn('drone', {
    x: scene.player.position.x + distance,
    y: scene.player.position.y,
  });
  const d0 = scene.healthLost(rock);
  let braked = 0;
  const onEvent = scene.onEvent;
  scene.onEvent = (name, payload) => {
    if (name === 'player-braked') braked += 1;
    onEvent?.(name, payload);
  };
  const flying = Math.hypot(scene.player.velocity.vx, scene.player.velocity.vy);
  scene.input = { down: true };
  // The rock kept still beside the ship until the brake fires, then let go.
  let xHeld = rock.x;
  let yHeld = rock.y;
  scene.run(0.75, (sc) => {
    if (braked) return;
    rock.x = sc.player.position.x + distance;
    rock.y = sc.player.position.y;
    rock.vx = 0;
    rock.vy = 0;
    xHeld = rock.x;
    yHeld = rock.y;
  });
  return {
    value: Math.round(Math.hypot(rock.x - xHeld, rock.y - yHeld) * 10) / 10,
    trigger: flying > 40 ? 1 : 0,
    extra: { damage: scene.healthLost(rock) - d0, braked, flying },
  };
}
// Seconds between two emergency brakes: fly, brake, fly back the other way, brake.
export function brakeCooldown(scene) {
  const times = [];
  let started = null;
  scene.onEvent = (name) => {
    if (name === 'player-braked') times.push(scene.time);
  };
  scene.input = { up: true };
  scene.run(1.5);
  scene.input = { down: true };
  for (let i = 0; i < 40 && !times.length; i += 1) scene.run(1 / 60);
  if (times.length) started = scene.player.maneuvers.brakeCooldownTimer;
  return {
    value: started ?? 0,
    trigger: times.length ? 1 : 0,
    extra: { brakes: times.length },
  };
}
// A rock the lance kills at once, then a line of `count` rocks 100 px apart
// below it (off the line of fire), weak enough that a spark kills them.
// value: spark damage on the first of them; extra.sparked: how many took a spark.
export function sparkChain(scene, count) {
  const target = scene.spawn(
    'asteroid',
    { size: 'small', x: SHIP.x + 120, y: SHIP.y, vx: 0, vy: 0 },
    { health: 1, maxHealth: 1 }
  );
  const line = [];
  for (let i = 1; i <= count; i += 1) {
    const rock = scene.spawn(
      'asteroid',
      { size: 'small', x: SHIP.x + 120, y: SHIP.y + 100 * i, vx: 0, vy: 0 },
      count > 1 ? { health: 1, maxHealth: 1e3 } : {}
    );
    line.push({ rock, x: SHIP.x + 120, y: SHIP.y + 100 * i });
  }
  scene.run(1.5, (sc) => {
    sc.park();
    hold(sc, line);
  });
  const sparked = line.filter(({ rock }) =>
    scene.damage.some((d) => d.enemy === rock)
  ).length;
  return {
    value: scene.damageTo(line[0].rock),
    trigger: scene.damage.some((d) => d.enemy === target) ? 1 : 0,
    extra: { sparked, killingHit: scene.player.damage },
  };
}
// Rocks behind the ship at 130, 150, 170 and 190 px (the lance fires ahead):
// how many hits they take in 6 s.
export function lattice(scene) {
  const rocks = field(scene, [
    [-130, 0],
    [0, 150],
    [0, -170],
    [-134, 134],
  ]);
  scene.run(6, (sc) => {
    sc.park();
    hold(sc, rocks);
  });
  const hits = scene.damage.filter((d) =>
    rocks.some(({ rock }) => rock === d.enemy)
  );
  return {
    value: hits.length,
    trigger: 1,
    extra: { damage: hits.reduce((s, d) => s + d.damage, 0) },
  };
}
// Lance hits on one tanky rock over ~1000 shots: the share that came twice.
export function doubleHits(scene) {
  const [r] = field(scene, [[100, 0]]);
  scene.run(250, (sc) => {
    sc.park();
    hold(sc, [r]);
  });
  const hits = scene.damage
    .filter((d) => d.enemy === r.rock)
    .map((d) => d.damage);
  const plain = Math.min(...hits);
  const doubled = hits.filter((d) => d > plain * 1.5).length;
  return {
    value: hits.length ? doubled / hits.length : 0,
    trigger: hits.length,
    extra: { hits: hits.length, doubled },
  };
}
export function levelUpRepair(scene) {
  const { player, progression } = scene;
  player.health = player.maxHealth - 50;
  const before = player.health;
  progression.experienceToNext = 10;
  progression.collectXP(progression.experienceToNext);
  return {
    value: player.health - before,
    trigger: progression.level > 1 ? 1 : 0,
  };
}
export function heartsDropped(scene) {
  const hearts = scene.services.healthHearts;
  let n = 0;
  const spawn = hearts.spawnHeart.bind(hearts);
  hearts.spawnHeart = (...a) => {
    n += 1;
    return spawn(...a);
  };
  for (let i = 0; i < 300; i += 1) {
    scene.enemies.rewardManager.tryDropHealthHeart({
      id: `gold-${i}`,
      type: 'asteroid',
      size: 'large',
      variant: 'gold',
      x: 200,
      y: 200,
      radius: 30,
    });
  }
  return { value: n, trigger: 1 };
}

// The weapon card's own numbers: projectiles per fire, beam share and length.
export function weaponCard(scene, what) {
  const bullets = countBullets(scene);
  let beams = 0;
  let len = 0;
  scene.onEvent = (name) => {
    if (name === 'weapon-beam-fired') beams += 1;
  };
  const r = dps(scene, {
    seconds: 8,
    each: (sc) => {
      for (const b of sc.combat.weapons.beams)
        len = Math.max(len, Math.hypot(b.ex - b.x, b.ey - b.y));
    },
  });
  const fired = r.extra.shots;
  const value = {
    beamShare: beams / fired,
    beamLength: len,
    perShot: bullets.created / Math.max(1, fired - beams),
  }[what];
  return { value, trigger: fired };
}

// Weapons that never aim: the Targeting Matrix's ranks 1-2 are a damage
// bonus on elites, heralds and bosses for them (weaponText).
export const FOCUS_WEAPONS = ['arc-caster', 'furnace-corona', 'shard-halo'];

// A common rock 150 px out at -30° and a volatile one 300 px out at +30°:
// the share of the damage the volatile one takes in 4 s.
export function dangerShare(scene, scale = 1) {
  const near = scene.spawn('asteroid', {
    variant: 'common',
    x: SHIP.x + 130 * scale,
    y: SHIP.y - 75 * scale,
  });
  const far = scene.spawn('asteroid', {
    variant: 'volatile',
    x: SHIP.x + 260 * scale,
    y: SHIP.y + 150 * scale,
  });
  const rocks = [near, far].map((rock) => ({ rock, x: rock.x, y: rock.y }));
  scene.run(4, (sc) => {
    sc.park();
    hold(sc, rocks);
  });
  const a = scene.healthLost(near);
  const b = scene.healthLost(far);
  return {
    value: a + b > 0 ? b / (a + b) : 0,
    trigger: a + b > 0 ? 1 : 0,
    extra: { variant: far.variant },
  };
}
// A rock crossing `out` px ahead at 300 px/s, put back every 61 steps: hits
// per shot. 61 shares no factor with a cadence of 15 or 16 steps, so the shots
// meet the rock at every point of its crossing (put back every 60 steps, a
// Lance firing every 15 met it at the same four points every second).
export function crossingHits(scene, out = 300) {
  const rock = scene.spawn('asteroid', {
    x: SHIP.x + out,
    y: SHIP.y - 150,
    vx: 0,
    vy: 300,
  });
  let aim = 0;
  scene.run(20, (sc, frame) => {
    sc.park();
    if (frame % 61 === 0) {
      rock.x = SHIP.x + out;
      rock.y = SHIP.y - 150;
    }
    rock.vx = 0;
    rock.vy = 300;
    const point = sc.combat.getPrimaryAimPoint();
    if (point) aim += point.y - rock.y;
  });
  const hits = scene.damage.filter((d) => d.enemy === rock).length;
  const fired = scene.combat.weapons.shots;
  // `lead`: how far ahead of the rock (px, summed over the steps) the aim point sat.
  return {
    value: fired ? hits / fired : 0,
    trigger: fired,
    extra: { lead: Math.round(aim) },
  };
}

// Recoil Dampers with each weapon (weaponText): what it says grows.
export const RECOIL = {
  'arc-caster': {
    metric: 'enemies struck per cast (1 + jumps)',
    expect: (b) => b + 1,
  },
  'shard-halo': { metric: 'blade size (px)', expect: (b) => b + 4 },
  scatter: {
    metric: 'damage in 6 s on a tight pack (bursts 25 px wider)',
    expect: () => 'more',
  },
  'seeker-swarm': {
    metric: 'damage in 6 s on a tight pack (bursts 25 px wider)',
    expect: () => 'more',
  },
  'furnace-corona': {
    metric: 'pulse reach (ring radius, px)',
    expect: (b) => b + 20,
  },
};
const PACK = [];
for (let row = -2; row <= 2; row += 1)
  for (let col = 0; col < 4; col += 1) PACK.push([110 + col * 34, row * 34]);
export function recoilMeasure(scene, weapon) {
  if (weapon === 'arc-caster') return weaponCount(scene, weapon);
  if (weapon === 'shard-halo') {
    scene.run(0.5, (sc) => sc.park());
    return {
      value: scene.combat.weapons.blades[0]?.size ?? 0,
      trigger: scene.combat.weapons.blades.length,
    };
  }
  if (weapon === 'furnace-corona') {
    const rocks = field(scene);
    let most = 0;
    let reach = 0;
    scene.run(2, (sc) => {
      sc.park();
      hold(sc, rocks);
      most = Math.max(most, sc.combat.weapons.aura?.radius ?? 0);
      for (const p of sc.combat.weapons.pulses ?? [])
        reach = Math.max(reach, p.radius ?? p.maxRadius ?? 0);
    });
    return {
      value: reach || most,
      trigger: most,
      extra: { aura: most, pulse: reach },
    };
  }
  if (weapon === 'scatter' || weapon === 'seeker-swarm')
    return dps(scene, { layout: PACK });
  const casts = byCast(scene);
  const rocks = field(scene, [
    [100, 0],
    [130, 0],
    [160, 0],
    [190, 0],
    [220, 0],
  ]);
  scene.run(1, (sc) => {
    sc.park();
    hold(sc, rocks);
    // The Harmonic's lances only: its beam (every 4th shot) already crosses
    // the whole line, and at 15 steps a shot the 4th lands inside the second.
    if (weapon === 'harmonic') sc.combat.weapons.shots = 0;
  });
  return {
    value: Math.max(0, ...casts.map((c) => c.size)),
    trigger: casts.length,
  };
}

// Mean damage per hit on the rocks of `layout`, held, 6 s.
export function perHit(scene, layout, config) {
  const r = dps(scene, { layout, config });
  return {
    value: r.trigger ? r.value / r.trigger : 0,
    trigger: r.trigger,
    extra: r.extra,
  };
}

// Lock-on range, in play: the Auto Turret held (setup), a rock 25° off the
// nose at a distance between the rank below's range and this rank's (base
// 400 px); the damage it takes in 4 s (without a lock the gun fires along
// the nose and misses it).
export function lockReach(scene, cellRank) {
  const cum = [1, 1.15, 1.3225, 1.520875];
  const distance = 400 * ((cum[cellRank - 1] + cum[cellRank]) / 2);
  const angle = (25 * Math.PI) / 180;
  const [r] = field(scene, [
    [Math.cos(angle) * distance, Math.sin(angle) * distance],
  ]);
  scene.run(4, (sc) => {
    sc.park();
    hold(sc, [r]);
  });
  return {
    value: scene.healthLost(r.rock),
    trigger: 1,
    extra: { distance: Math.round(distance) },
  };
}

// === The probes ===
// Each entry: card id → list of probes (the first is the card's main promise).
