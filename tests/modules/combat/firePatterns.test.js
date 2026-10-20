// The chain, orbit, aura and seeker patterns (src/modules/combat/
// firePatterns.js) through the four weapons that fire them, and a weapon's
// own evolution and Apex taking over from its family's lance evolution.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import RandomService from '../../../src/core/RandomService.js';
import CombatSystem from '../../../src/modules/CombatSystem.js';
import ProgressionSystem from '../../../src/modules/ProgressionSystem.js';
import { WEAPON_FORMS } from '../../../src/data/weapons.js';
import {
  ringRadius,
  tickWeaponField,
} from '../../../src/modules/combat/firePatterns.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';

const DAMAGE = 10;
const SHIP = { x: 100, y: 300 };
const MUZZLE = { x: 116, y: 300 };
const STATS = { multishot: 1, damage: DAMAGE };
const firstOf = (id, stage = 'base') => WEAPON_FORMS[id][stage].fire.at(-1);

const enemy = (id, x, y, extra = {}) => ({
  id,
  x,
  y,
  vx: 0,
  vy: 0,
  radius: 10,
  health: 100,
  maxHealth: 100,
  type: 'drone',
  ...extra,
});

function makeRun(list = []) {
  const eventBus = createEventBusMock();
  const enemies = {
    forEachActiveEnemy: (callback) => list.forEach(callback),
    applyDamage(target, damage) {
      target.health = Math.max(0, target.health - damage);
      if (target.health <= 0) target.destroyed = true;
      return { killed: target.destroyed, remainingHealth: target.health };
    },
  };
  const combat = new CombatSystem({
    eventBus,
    player: {
      isDead: false,
      getPosition: () => ({ ...SHIP }),
      getTurretAngle: () => 0,
      getMuzzlePoint: () => ({ ...MUZZLE }),
      getStats: () => STATS,
    },
    enemies,
    physics: { forEachBulletCollision: () => {} },
  });
  const progression = new ProgressionSystem({
    random: new RandomService(7),
    eventBus,
    player: {},
    ui: {},
    effects: {},
    'xp-orbs': { attachProgression: () => {} },
  });
  progression.level = 10;
  return { combat, eventBus, enemies, progression };
}

function armed(weaponId, list) {
  const run = makeRun(list);
  run.eventBus.emit('upgrade-weapon', { weaponId });
  expect(run.combat.weaponId).toBe(weaponId);
  return run;
}

describe('fire patterns', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  afterEach(() => GamePools.releaseAll());

  it('chain: strikes the nearest enemy in range, then jumps `jumps` times within `jumpRange`, each hop weaker', () => {
    const cast = firstOf('arc-caster');
    // A line of enemies 100–120 px apart along the aim, one off to the side.
    const line = [200, 300, 420, 530, 640].map((x, i) =>
      enemy(`e${i}`, x, 300)
    );
    const aside = enemy('aside', 150, 520);
    const { combat } = armed('arc-caster', [...line, aside]);

    combat.handleShooting(1, STATS);

    const damage = (hop) => DAMAGE * cast.falloff ** hop;
    line
      .slice(0, cast.jumps + 1)
      .forEach((struck, hop) =>
        expect(struck.health).toBeCloseTo(100 - damage(hop), 6)
      );
    expect(line[cast.jumps + 1].health).toBe(100);
    expect(aside.health).toBe(100);
    expect(combat.arcs).toHaveLength(cast.jumps + 1);
    expect(combat.lastShotTime).toBeCloseTo(
      -combat.shootCooldown * (cast.cooldownMultiplier - 1),
      9
    );

    // Multishot adds a jump: the fifth enemy is reached.
    combat.handleShooting(1, { multishot: 2, damage: DAMAGE });
    expect(line[cast.jumps + 1].health).toBeLessThan(100);
  });

  it('chain: a hop past `jumpRange` breaks the chain; nothing in range crackles out and hits nothing', () => {
    const cast = firstOf('arc-caster');
    const near = enemy('near', 200, 300);
    const far = enemy('far', 200 + cast.jumpRange + 20, 300);
    const { combat } = armed('arc-caster', [near, far]);
    combat.handleShooting(1, STATS);
    expect(near.health).toBeLessThan(100);
    expect(far.health).toBe(100);

    const out = enemy('out', MUZZLE.x + cast.range + 40, 300);
    const empty = armed('arc-caster', [out]).combat;
    empty.handleShooting(1, STATS);
    expect(out.health).toBe(100);
    expect(empty.arcs).toHaveLength(1);
  });

  it('orbit: blades ride their ring and cut an enemy once a cycle; a shot starts the next cycle', () => {
    const halo = firstOf('shard-halo');
    const target = enemy('target', SHIP.x + halo.radius, SHIP.y);
    const { combat } = armed('shard-halo', [target]);
    const cut = DAMAGE * halo.damageMultiplier;

    tickWeaponField(combat.weapons, 0.01, STATS);
    expect(combat.blades).toHaveLength(halo.blades);
    combat.blades.forEach((blade) =>
      expect(Math.hypot(blade.x - SHIP.x, blade.y - SHIP.y)).toBeCloseTo(
        halo.radius,
        6
      )
    );
    expect(target.health).toBeCloseTo(100 - cut, 6);

    tickWeaponField(combat.weapons, 0.01, STATS);
    expect(target.health).toBeCloseTo(100 - cut, 6);

    combat.handleShooting(1, STATS);
    tickWeaponField(combat.weapons, 0.01, STATS);
    expect(target.health).toBeCloseTo(100 - 2 * cut, 6);

    // Multishot adds blades.
    tickWeaponField(combat.weapons, 0.01, { multishot: 3, damage: DAMAGE });
    expect(combat.blades).toHaveLength(halo.blades + 2);
  });

  it('orbit: the evolved ring breathes out to its reach and back', () => {
    const tide = firstOf('shard-halo', 'evolution');
    const { period, reach } = tide.sweep;
    expect(ringRadius(tide, 0)).toBeCloseTo(tide.radius, 9);
    expect(ringRadius(tide, period / 2)).toBeCloseTo(reach, 9);
    expect(ringRadius(tide, period)).toBeCloseTo(tide.radius, 9);
  });

  it('aura: each pulse hits everything within its radius and shoves it out, one pulse per cooldown', () => {
    const corona = firstOf('furnace-corona');
    const inside = enemy('inside', SHIP.x + corona.radius, SHIP.y);
    const outside = enemy('outside', SHIP.x, SHIP.y + corona.radius + 20);
    const { combat } = armed('furnace-corona', [inside, outside]);
    const pulse = DAMAGE * corona.damageMultiplier;

    combat.handleShooting(1, STATS);
    expect(inside.health).toBeCloseTo(100 - pulse, 6);
    expect(inside.vx).toBeGreaterThan(0);
    expect(outside.health).toBe(100);
    expect(combat.pulses).toHaveLength(1);

    const wait = combat.shootCooldown * corona.cooldownMultiplier;
    combat.handleShooting(wait * 0.9, STATS);
    expect(inside.health).toBeCloseTo(100 - pulse, 6);
    combat.handleShooting(wait * 0.1 + 1e-6, STATS);
    expect(inside.health).toBeCloseTo(100 - 2 * pulse, 6);
  });

  it('aura: the Apex pulse sets what survives burning', () => {
    const inside = enemy('inside', SHIP.x + 40, SHIP.y);
    const { combat } = armed('furnace-corona', [inside]);
    combat.weapons.apexWeapon('thermal');
    expect(combat.weaponForm.form.id).toBe('sunheart');
    combat.handleShooting(1, STATS);
    expect(combat.burns.has(inside)).toBe(true);
  });

  it('seeker: a salvo gives each missile a target and turns it at most `turn` rad/s, at its speed', () => {
    const salvo = firstOf('seeker-swarm');
    // Straight below the muzzle, 90° off the aim.
    const below = enemy('below', MUZZLE.x, MUZZLE.y + 200);
    const { combat } = armed('seeker-swarm', [below]);

    combat.handleShooting(1, STATS);
    expect(combat.bullets).toHaveLength(salvo.missiles);
    const headings = combat.bullets.map((m) => Math.atan2(m.vy, m.vx));
    const speeds = combat.bullets.map((m) => Math.hypot(m.vx, m.vy));
    combat.bullets.forEach((m) => expect(m.seeker.target).toBe(below));

    const dt = 0.1;
    combat.updateBullets(dt);
    combat.bullets.forEach((missile, i) => {
      const turned = Math.atan2(missile.vy, missile.vx) - headings[i];
      expect(turned).toBeCloseTo(salvo.turn * dt, 6); // both turn toward +y
      expect(Math.hypot(missile.vx, missile.vy)).toBeCloseTo(speeds[i], 6);
    });

    // Its target gone, a missile takes the nearest enemy within reach.
    below.destroyed = true;
    const next = enemy('next', MUZZLE.x + 100, MUZZLE.y - 60);
    combat.weapons.enemies().forEachActiveEnemy = (callback) =>
      [below, next].forEach(callback);
    combat.updateBullets(dt);
    combat.bullets.forEach((m) => expect(m.seeker.target).toBe(next));
  });

  it("seeker: the Apex's killing missile releases two more that do not breed", () => {
    const weak = enemy('weak', 300, 300, { health: 1 });
    const other = enemy('other', 360, 330);
    const { combat, enemies } = armed('seeker-swarm', [weak, other]);
    combat.weapons.apexWeapon('salvage');
    combat.handleShooting(1, STATS);
    const [missile] = combat.bullets;
    expect(missile.seeker.breed).toBe(2);

    combat.processBulletHit(missile, weak, enemies);
    expect(weak.destroyed).toBe(true);
    const before = combat.bullets.length;
    tickWeaponField(combat.weapons, 0.01, STATS);
    const brood = combat.bullets.slice(before);
    expect(brood).toHaveLength(2);
    brood.forEach((m) => expect(m.seeker.breed).toBe(0));
  });
});

describe("a weapon's own evolution and Apex", () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  afterEach(() => GamePools.releaseAll());

  const ARC = [
    'overcharge_coil',
    'static_shell',
    'capacitor_bank',
    'chain_capacitor',
  ];

  it('its family at 3 cards switches it to its evolution, at 5 to its Apex, in place of the lance evolution', () => {
    const { combat, eventBus, progression } = makeRun();
    const evolved = vi.fn();
    eventBus.on('weapon-evolved', evolved);
    expect(progression.applyUpgrade('arc_caster')).toBe(true);
    expect(combat.getWeaponState()).toMatchObject({
      name: 'Arc Caster',
      evolutions: [],
    });

    ARC.slice(0, 2).forEach((id) => progression.applyUpgrade(id));
    expect(combat.getWeaponState()).toMatchObject({
      name: 'Forked Arc',
      chip: 'FORK',
      evolutions: [
        { family: 'arc', id: 'forked-arc', apex: false, short: 'FORK' },
      ],
    });
    expect(evolved).toHaveBeenCalledWith(
      expect.objectContaining({ family: 'arc', name: 'Forked Arc' })
    );
    expect(combat.weaponForm.fire[0].fork).toBe(2);
    // The Chain Lance stays off: the Arc Caster brings its own.
    expect(combat.weapons.hasEvolution('arc')).toBe(false);

    ARC.slice(2).forEach((id) => progression.applyUpgrade(id));
    expect(combat.getWeaponState()).toMatchObject({
      name: 'Storm Crown',
      evolutions: [{ family: 'arc', id: 'storm-crown', apex: true }],
    });
    expect(combat.weaponForm.fire.map((entry) => entry.every)).toEqual([
      3,
      undefined,
    ]);
  });

  it('taken after its family evolved, it comes in its evolved form; the lance kept the lance evolution', () => {
    const { combat, progression } = makeRun();
    ARC.slice(0, 3).forEach((id) => progression.applyUpgrade(id));
    expect(combat.weapons.hasEvolution('arc')).toBe(true);
    expect(combat.getWeaponState().name).toBe('Amber Lance');

    progression.applyUpgrade('arc_caster');
    expect(combat.getWeaponState().name).toBe('Forked Arc');
    expect(combat.weapons.hasEvolution('arc')).toBe(false);
  });
});
