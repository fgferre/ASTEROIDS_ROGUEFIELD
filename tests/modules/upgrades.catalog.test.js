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
import { WEAPONS } from '../../src/data/weapons.js';
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
    getAngle: () => 0,
    getNosePosition: (angle) => ({
      x: PLAYER.x + Math.cos(angle) * NOSE,
      y: PLAYER.y + Math.sin(angle) * NOSE,
    }),
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

  it('Ballast Rounds: +8% lance damage and -4% fire rate per rank', () => {
    const { combat, eventBus } = makeCombat();
    const cooldown = combat.shootCooldown;
    takeCard(eventBus, 'ballast_rounds');
    expect(fireLance(combat).damage).toBeCloseTo(DAMAGE * 1.08 ** 3, 6);
    expect(combat.shootCooldown).toBeCloseTo(cooldown * 1.04 ** 3, 6);
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

    const length = WEAPONS.harmonic.beam.length;
    const far = makeEnemy('far', PLAYER.x + NOSE + length * 1.3, 300);
    const harmonic = makeCombat([far]);
    takeCard(harmonic.eventBus, 'thermal_lens');
    harmonic.eventBus.emit('upgrade-weapon-harmonic', { weaponId: 'harmonic' });
    const stats = { multishot: 1, damage: DAMAGE };
    for (let shot = 0; shot < WEAPONS.harmonic.beam.every; shot += 1) {
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
    chained.combat.processBulletHit(
      { kind: 'lance', x: 200, y: 300, damage: DAMAGE, hit: false },
      line[0],
      chained.enemies
    );
    expect(line[1].health).toBeLessThan(100);
    expect(line[2].health).toBeLessThan(100);

    const wall = makeEnemy('wall', 200, 300, { health: 1e9 });
    const plain = makeCombat([wall]);
    takeCard(plain.eventBus, 'chain_capacitor');
    const hits = 2000;
    for (let i = 0; i < hits; i += 1) {
      plain.combat.processBulletHit(
        { kind: 'lance', x: 200, y: 300, damage: DAMAGE, hit: false },
        wall,
        plain.enemies
      );
    }
    const doubled = (1e9 - wall.health) / DAMAGE - hits;
    expect(doubled / hits).toBeGreaterThan(0.07);
    expect(doubled / hits).toBeLessThan(0.13);
  });

  it('Gravity Brake: enemies within 120 px move 8% slower per rank, bosses do not', () => {
    const near = makeEnemy('near', 180, 300, { vx: 100 });
    const far = makeEnemy('far', 400, 300, { vx: 100 });
    const boss = makeEnemy('boss', 150, 300, { vx: 100, type: 'boss' });
    const { combat, eventBus } = makeCombat([near, far, boss]);
    takeCard(eventBus, 'gravity_brake', 3);
    combat.updateWeaponEffects(0.5);
    expect(near.x).toBeCloseTo(180 - 100 * 0.24 * 0.5, 6);
    expect(far.x).toBe(400);
    expect(boss.x).toBe(150);
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

  it('Scrap Compactor: +6% XP from orbs per rank', () => {
    const { progression } = startGame().services;
    ['scrap_compactor', 'scrap_compactor', 'scrap_compactor'].forEach((id) =>
      progression.applyUpgrade(id)
    );
    expect(progression.xpGainMultiplier).toBeCloseTo(1.06 ** 3, 6);
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

  it('Blood Ledger (cursed): +100% XP and no heart drops', () => {
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
  });
});
