import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import CombatSystem from '../../src/modules/CombatSystem.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import { WEAPONS, firePattern } from '../../src/data/weapons.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';
import {
  STEP_SECONDS,
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';

// The R5.4 cards: each one's effect, observed through its own data.
const DAMAGE = 10;
const NOSE = 16;
const PLAYER = { x: 100, y: 300 };
const BEAM = firePattern(WEAPONS.harmonic, 'beam');
// A lance landing at (200, 300), as Projectiles builds it.
const lanceHit = () => ({
  kind: 'lance',
  projectile: WEAPONS.lance.projectile,
  x: 200,
  y: 300,
  damage: DAMAGE,
  hit: false,
});

const card = (id) => UPGRADE_LIBRARY.find((entry) => entry.id === id);

// Emits a card's event effects rank by rank, the way UpgradeSystem does.
function takeCard(eventBus, id, ranks = card(id).levels.length) {
  card(id)
    .levels.slice(0, ranks)
    .forEach((level, index) => {
      level.effects
        .filter((effect) => effect.type === 'event')
        .forEach((effect) =>
          eventBus.emit(effect.event, {
            ...effect.payload,
            upgradeId: id,
            level: index + 1,
          })
        );
    });
}

function makeEnemy(id, x, y, extra = {}) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 10,
    health: 100,
    type: 'drone',
    ...extra,
  };
}

function makeCombat(list = []) {
  const eventBus = createEventBusMock();
  const player = {
    isDead: false,
    getPosition: () => ({ ...PLAYER }),
    getTurretAngle: () => 0,
    getMuzzlePoint: () => ({ x: PLAYER.x + NOSE, y: PLAYER.y }),
    getStats: () => ({ multishot: 1, damage: DAMAGE }),
  };
  const enemies = {
    forEachActiveEnemy(callback) {
      list.forEach(callback);
    },
    applyDamage(enemy, damage) {
      enemy.health = Math.max(0, enemy.health - damage);
      const killed = enemy.health <= 0;
      if (killed) enemy.destroyed = true;
      return { killed, remainingHealth: enemy.health };
    },
  };
  const physics = { forEachBulletCollision: () => {} };
  const combat = new CombatSystem({ eventBus, player, enemies, physics });
  return { combat, eventBus, enemies };
}

const fireLance = (combat) => {
  combat.createBullet(PLAYER, { x: 400, y: 300 }, DAMAGE);
  return combat.bullets[combat.bullets.length - 1];
};

describe('R5.4 cards on the weapon (CombatSystem)', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    GamePools.releaseAll();
    cleanupGlobalState();
  });

  it('Ballast Rounds 3: double damage on an enemy below half health, beams included', () => {
    const [fresh, cracked, beamed] = [100, 40, 40].map((health, i) =>
      makeEnemy(`e${i}`, 200, 300, { health, maxHealth: 100 })
    );
    const { combat, eventBus, enemies } = makeCombat([fresh, cracked, beamed]);
    takeCard(eventBus, 'ballast_rounds');
    combat.processBulletHit(lanceHit(), fresh, enemies);
    combat.processBulletHit(lanceHit(), cracked, enemies);
    const beam = { ...lanceHit(), kind: 'beam', projectile: undefined };
    combat.processBulletHit(beam, beamed, enemies);
    expect(fresh.health).toBe(100 - DAMAGE);
    expect(cracked.health).toBe(40 - 2 * DAMAGE);
    expect(beamed.health).toBe(40 - 2 * DAMAGE);
  });

  it('Afterburn Lance 3: +20% damage per 100 px a round flew, up to +80%, and a 52% longer lock', () => {
    const near = makeEnemy('near', 300, 300, { health: 1000 });
    const far = makeEnemy('far', 750, 300, { health: 1000 });
    const { combat, eventBus, enemies } = makeCombat([near, far]);
    const range = combat.targeting.targetingRange;
    takeCard(eventBus, 'afterburn_lance');
    expect(combat.targeting.targetingRange).toBeCloseTo(range * 1.15 ** 3, 6);
    // Fired from x = 100: 200 px to `near`, 650 px (counted as 400) to `far`.
    [near, far].forEach((enemy) => {
      const round = fireLance(combat);
      round.x = enemy.x;
      combat.processBulletHit(round, enemy, enemies);
    });
    expect(1000 - near.health).toBeCloseTo(DAMAGE * 1.4, 6);
    expect(1000 - far.health).toBeCloseTo(DAMAGE * 1.8, 6);
  });

  it('Recoil Dampers: a lance goes through one more target', () => {
    const first = makeEnemy('a', 200, 300);
    const second = makeEnemy('b', 230, 300);
    const { combat, eventBus, enemies } = makeCombat([first, second]);
    takeCard(eventBus, 'recoil_dampers');
    const bullet = fireLance(combat);
    combat.processBulletHit(bullet, first, enemies);
    combat.processBulletHit(bullet, second, enemies);
    expect(first.health).toBe(100 - DAMAGE);
    expect(second.health).toBe(100 - DAMAGE);
    expect(bullet.hit).toBe(true);
  });

  it('Thermal Lens: +15% lance damage, or a 40% longer beam on the Harmonic Lance', () => {
    const { combat, eventBus } = makeCombat();
    takeCard(eventBus, 'thermal_lens');
    expect(fireLance(combat).damage).toBeCloseTo(DAMAGE * 1.15, 6);

    const length = BEAM.length;
    const far = makeEnemy('far', PLAYER.x + NOSE + length * 1.3, 300);
    const harmonic = makeCombat([far]);
    takeCard(harmonic.eventBus, 'thermal_lens');
    harmonic.eventBus.emit('upgrade-weapon', { weaponId: 'harmonic' });
    const stats = { multishot: 1, damage: DAMAGE };
    for (let shot = 0; shot < BEAM.every; shot += 1) {
      harmonic.combat.handleShooting(1, stats);
    }
    expect(harmonic.combat.bullets[0].damage).toBe(DAMAGE);
    expect(far.health).toBeLessThan(100);
  });

  it('Cinder Trail: the main thruster leaves a trail that burns what touches it', () => {
    const rock = makeEnemy('rock', 200, 300);
    const { combat, eventBus } = makeCombat([rock]);
    takeCard(eventBus, 'cinder_trail', 2);
    const thrust = { type: 'main', intensity: 1, position: { x: 205, y: 300 } };
    eventBus.emit('thruster-effect', thrust);
    combat.updateWeaponEffects(0.2);
    expect(rock.health).toBe(100 - 12);
    // 0.6 s later the trail is gone and burns nothing more.
    combat.updateWeaponEffects(0.6);
    combat.updateWeaponEffects(0.2);
    expect(rock.health).toBe(100 - 12);
  });

  it('Main Thrusters 5: the ion trail hurts machines it touches, half on bosses, never rocks', () => {
    const drone = makeEnemy('drone', 200, 300);
    const boss = makeEnemy('boss', 230, 300, { type: 'boss' });
    const rock = makeEnemy('rock', 260, 300, { type: 'asteroid' });
    const { combat, eventBus } = makeCombat([drone, boss, rock]);
    takeCard(eventBus, 'propulsors', 5);
    [205, 225, 245, 255].forEach((x) =>
      eventBus.emit('thruster-effect', {
        type: 'main',
        intensity: 1,
        position: { x, y: 300 },
      })
    );
    combat.updateWeaponEffects(0.2);
    combat.updateWeaponEffects(0.2);
    expect(drone.health).toBe(100 - 16);
    expect(boss.health).toBe(100 - 8);
    expect(rock.health).toBe(100);
    // 0.5 s after the thrust the trail is gone.
    combat.updateWeaponEffects(0.2);
    combat.updateWeaponEffects(0.2);
    expect(drone.health).toBe(100 - 16);
  });

  it('Braking System 3: the brake shoves enemies within 110 px away, without damage', () => {
    const near = makeEnemy('near', 180, 300);
    const far = makeEnemy('far', 260, 300);
    const { eventBus } = makeCombat([near, far]);
    const brake = card('braking_system').levels[2].effects.find(
      (e) => e.event === 'upgrade-emergency-brake'
    ).payload;
    eventBus.emit('player-braked', {
      position: { ...PLAYER },
      radius: brake.radius,
      knockback: brake.knockback,
    });
    expect(near.vx).toBe(brake.knockback);
    expect(near.health).toBe(100);
    expect(far.vx).toBe(0);
  });

  it('Static Shell: a hit on the ship arcs into every enemy within 90 px', () => {
    const near = makeEnemy('near', 160, 300);
    const far = makeEnemy('far', 300, 300);
    const { combat, eventBus } = makeCombat([near, far]);
    takeCard(eventBus, 'static_shell', 2);
    eventBus.emit('player-took-damage', { damage: 10 });
    combat.updateWeaponEffects(1 / 60);
    expect(near.health).toBe(100 - 40);
    expect(far.health).toBe(100);
    expect(combat.arcs).toHaveLength(1);
  });

  it('Chain Capacitor: one more chain jump with Chain Lance, else a 10% double hit', () => {
    const line = [0, 1, 2].map((i) => makeEnemy(`e${i}`, 200 + i * 60, 300));
    const chained = makeCombat(line);
    chained.combat.evolveWeapon('arc');
    takeCard(chained.eventBus, 'chain_capacitor');
    chained.combat.processBulletHit(lanceHit(), line[0], chained.enemies);
    expect(line[1].health).toBeLessThan(100);
    expect(line[2].health).toBeLessThan(100);

    const wall = makeEnemy('wall', 200, 300, { health: 1e9 });
    const plain = makeCombat([wall]);
    takeCard(plain.eventBus, 'chain_capacitor');
    const hits = 2000;
    for (let i = 0; i < hits; i += 1) {
      plain.combat.processBulletHit(lanceHit(), wall, plain.enemies);
    }
    const doubled = (1e9 - wall.health) / DAMAGE - hits;
    expect(doubled / hits).toBeGreaterThan(0.07);
    expect(doubled / hits).toBeLessThan(0.13);
  });

  it('Gravity Brake 3: enemies and enemy shots within 180 px move 50% slower, Wardens do not', () => {
    const near = makeEnemy('near', 250, 300, { vx: 100 });
    const far = makeEnemy('far', 400, 300, { vx: 100 });
    const boss = makeEnemy('boss', 150, 300, { vx: 100, type: 'boss' });
    const { combat, eventBus } = makeCombat([near, far, boss]);
    const shotNear = { x: 260, y: 300, vx: -200, vy: 0 };
    const shotFar = { x: 400, y: 300, vx: -200, vy: 0 };
    combat.enemyBullets.push(shotNear, shotFar);
    takeCard(eventBus, 'gravity_brake', 3);
    combat.updateWeaponEffects(0.5);
    expect(near.x).toBeCloseTo(250 - 100 * 0.5 * 0.5, 6);
    expect(shotNear.x).toBeCloseTo(260 + 200 * 0.5 * 0.5, 6);
    expect(far.x).toBe(400);
    expect(shotFar.x).toBe(400);
    expect(boss.x).toBe(150);
  });

  it('Capacitor Bank: a kill sparks into the nearest enemy, and a killing spark sparks again up to the rank', () => {
    const line = () =>
      [5, 5, 100].map((health, i) =>
        makeEnemy(`e${i}`, 200 + i * 100, 300, { health })
      );
    const sparked = (ranks) => {
      const list = line();
      const { combat, eventBus, enemies } = makeCombat(list);
      takeCard(eventBus, 'capacitor_bank', ranks);
      combat.processBulletHit(lanceHit(), list[0], enemies);
      return { healths: list.map((enemy) => enemy.health), combat };
    };
    // Rank 1: one spark (60%) kills e1; that kill does not spark on.
    expect(sparked(1).healths).toEqual([0, 0, 100]);
    // Rank 3: sparks at full damage chain until one fails to kill.
    const full = sparked(3);
    expect(full.healths).toEqual([0, 0, 100 - DAMAGE]);
    expect(full.combat.arcs).toHaveLength(2);
    // No kill, no spark.
    const tough = makeEnemy('tough', 200, 300);
    const other = makeEnemy('other', 250, 300);
    const plain = makeCombat([tough, other]);
    takeCard(plain.eventBus, 'capacitor_bank');
    plain.combat.processBulletHit(lanceHit(), tough, plain.enemies);
    expect(other.health).toBe(100);
  });

  it('Arc Lattice 2: every 1 s the 2 nearest enemies within 180 px take a shot each; a charge waits for one in reach', () => {
    const [a, b, c] = [150, 200, 250].map((x, i) => makeEnemy(`e${i}`, x, 300));
    const outside = makeEnemy('out', 400, 300);
    const list = [outside, c, b, a];
    const { combat, eventBus } = makeCombat(list);
    takeCard(eventBus, 'arc_lattice', 2);
    combat.updateWeaponEffects(0.9);
    expect(a.health).toBe(100);
    combat.updateWeaponEffects(0.1);
    expect([a, b, c, outside].map((enemy) => enemy.health)).toEqual([
      100 - DAMAGE,
      100 - DAMAGE,
      100,
      100,
    ]);

    // Nobody in reach: the charge holds, and strikes the first who comes.
    list.length = 0;
    combat.updateWeaponEffects(3);
    const late = makeEnemy('late', 150, 300);
    list.push(late);
    combat.updateWeaponEffects(1 / 60);
    expect(late.health).toBe(100 - DAMAGE);
  });

  it('Gyro Servos 2: fire rate +80% for 1.5 s after a dash', () => {
    const { combat, eventBus } = makeCombat();
    const cooldown = combat.shootCooldown;
    takeCard(eventBus, 'gyro_servos');
    expect(combat.shootCooldown).toBeCloseTo(cooldown, 9);
    eventBus.emit('player-dashed', {});
    expect(combat.shootCooldown).toBeCloseTo(cooldown / 1.8, 9);
    combat.updateWeaponEffects(1.4);
    expect(combat.shootCooldown).toBeCloseTo(cooldown / 1.8, 9);
    combat.updateWeaponEffects(0.2);
    expect(combat.shootCooldown).toBeCloseTo(cooldown, 9);
  });
});

describe('R5.4 cards in a running game', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreDom();
    GamePools.releaseAll();
  });

  function startGame() {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    game.services.progression.level = 10;
    return game;
  }

  const stepFor = (game, seconds) => {
    for (let i = 0; i < Math.ceil(seconds / STEP_SECONDS); i += 1) game.step();
  };

  // Steps until the dash ends; returns the invulnerability left at that step.
  function dashAndLand(game) {
    const { player } = game.services;
    game.eventBus.emit('dash-pressed');
    game.step();
    while (player.dashTimer > 0) game.step();
    return player.invulnerableTimer;
  }

  it('Phase Skin: 0.4 s of invulnerability after a dash ends', () => {
    const game = startGame();
    const before = dashAndLand(game);
    stepFor(game, 2);
    game.services.progression.applyUpgrade('phase_skin');
    const after = dashAndLand(game);
    expect(before).toBeLessThan(0.1);
    expect(after).toBeGreaterThan(0.4 - 2 * STEP_SECONDS);
  });

  it('Scrap Compactor 3: every level-up repairs 20 hull', () => {
    const game = startGame();
    const { player, progression } = game.services;
    const levelUp = () => {
      player.health = player.maxHealth - 50;
      progression.collectXP(progression.experienceToNext);
      return player.health - (player.maxHealth - 50);
    };
    expect(levelUp()).toBe(0);
    [1, 2, 3].forEach(() => progression.applyUpgrade('scrap_compactor'));
    expect(levelUp()).toBe(20);
  });

  it('Wide Net 3: every 10 s every orb on the Field flies to the ship', () => {
    const game = startGame();
    const { player, progression, 'xp-orbs': xpOrbs } = game.services;
    player.setInvulnerableTimer(1e9);
    progression.applyUpgrade('wide_net');
    progression.applyUpgrade('wide_net');
    progression.applyUpgrade('wide_net');
    // XP orbs tick on world time, which can lag the steps (slow-mo).
    stepFor(game, 9.5);
    expect(xpOrbs.globalPull).toBeNull();
    stepFor(game, 1);
    expect(xpOrbs.globalPull).not.toBeNull();
  });

  it('Magnetic Field: each rank widens the reach the ship actually collects from', () => {
    const game = startGame();
    const { player, progression, 'xp-orbs': xpOrbs } = game.services;
    const base = player.getMagnetismRadius();
    // Steps one frame with an orb at `distance` straight right of the ship;
    // true if the magnet moved it.
    const pulls = (distance) => {
      const { x, y } = player.getPosition();
      const orb = xpOrbs.createXPOrb(x + distance, y, 1);
      const before = orb.x;
      xpOrbs.update(STEP_SECONDS);
      const moved = orb.x !== before;
      xpOrbs.consumeOrb(orb);
      return moved;
    };
    expect(pulls(base * 1.3)).toBe(false);
    progression.applyUpgrade('magfield');
    expect(player.getMagnetismRadius()).toBe(Math.floor(base * 1.4));
    expect(pulls(base * 1.3)).toBe(true);
    progression.applyUpgrade('magfield');
    progression.applyUpgrade('magfield');
    expect(pulls(base * 1.9)).toBe(true);
  });

  it('Lucky Fragment: rocks drop field pickups only with the card', () => {
    const game = startGame();
    const { pickups, progression } = game.services;
    const destroyRocks = () => {
      for (let i = 0; i < 200; i += 1) {
        game.eventBus.emit('enemy-destroyed', {
          enemy: { id: `rock-${i}`, type: 'asteroid', x: 200, y: 200 },
          position: { x: 200, y: 200 },
        });
      }
    };
    destroyRocks();
    expect(pickups.getActivePickups()).toHaveLength(0);
    progression.applyUpgrade('lucky_fragment');
    destroyRocks();
    const dropped = pickups.getActivePickups().length;
    expect(dropped).toBeGreaterThan(5);
    expect(dropped).toBeLessThan(45);
  });

  it('Glass Cannon (cursed): +60% damage, -30% max hull', () => {
    const { player, progression } = startGame().services;
    const { damage, maxHealth } = player;
    progression.applyUpgrade('glass_cannon');
    expect(player.damage).toBe(Math.floor(damage * 1.6));
    expect(player.maxHealth).toBe(Math.round(maxHealth * 0.7));
    expect(player.health).toBeLessThanOrEqual(player.maxHealth);
  });

  it('Overclocked Core (cursed): +35% fire rate, hull drains 1 HP / 4 s down to 20%', () => {
    const game = startGame();
    const { player, progression, combat } = game.services;
    player.setInvulnerableTimer(1e9);
    const cooldown = combat.shootCooldown;
    progression.applyUpgrade('overclocked_core');
    expect(combat.shootCooldown).toBeCloseTo(cooldown * 0.74, 6);

    const start = player.health;
    stepFor(game, 8.5);
    expect(player.health).toBe(start - 2);
    const floor = Math.ceil(player.maxHealth * 0.2);
    player.health = floor + 1;
    stepFor(game, 12.5);
    expect(player.health).toBe(floor);
  });

  it('Blood Ledger (cursed): +100% XP, no heart drops, a full repair per Warden', () => {
    const game = startGame();
    const { progression, enemies, healthHearts } = game.services;
    const spawnHeart = vi.spyOn(healthHearts, 'spawnHeart');
    const rock = (i) => ({
      id: `gold-${i}`,
      type: 'asteroid',
      size: 'large',
      variant: 'gold',
      x: 200,
      y: 200,
      radius: 30,
    });
    for (let i = 0; i < 300; i += 1)
      enemies.rewardManager.tryDropHealthHeart(rock(i));
    expect(spawnHeart.mock.calls.length).toBeGreaterThan(0);

    progression.applyUpgrade('blood_ledger');
    expect(progression.xpGainMultiplier).toBeCloseTo(2, 6);
    spawnHeart.mockClear();
    for (let i = 0; i < 300; i += 1)
      enemies.rewardManager.tryDropHealthHeart(rock(i));
    expect(spawnHeart).not.toHaveBeenCalled();

    const { player } = game.services;
    player.health = 10;
    game.eventBus.emit('boss-defeated', { x: 200, y: 200 });
    expect(player.health).toBe(player.maxHealth);
  });
});
