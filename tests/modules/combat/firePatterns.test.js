// The chain, orbit, aura and seeker patterns (src/modules/combat/
// firePatterns.js) through the four weapons that fire them, and a weapon's
// own evolution and Apex taking over from its family's lance evolution.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import RandomService from '../../../src/core/RandomService.js';
import CombatSystem from '../../../src/modules/CombatSystem.js';
import ProgressionSystem from '../../../src/modules/ProgressionSystem.js';
import { WEAPON_FORMS } from '../../../src/data/weapons.js';
import { burstFlak } from '../../../src/modules/combat/beamAndFan.js';
import {
  familyLine,
  notWithWeapon,
} from '../../../src/modules/ui/upgradeCard.js';
import { knockbackSpeed } from '../../../src/modules/combat/HitResolution.js';
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

  it('chain: with the Chain Capacitor each cast jumps once more', () => {
    const cast = firstOf('arc-caster');
    const line = Array.from({ length: cast.jumps + 3 }, (_, i) =>
      enemy(`e${i}`, 200 + i * 100, 300)
    );
    const { combat, eventBus } = armed('arc-caster', line);
    eventBus.emit('upgrade-chain-capacitor', {
      extraJumps: 1,
      doubleHitChance: 0.1,
    });

    combat.handleShooting(1, STATS);
    const struck = line.filter((target) => target.health < 100);
    expect(struck).toEqual(line.slice(0, cast.jumps + 2));
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

  describe('chain: the families and the six cards', () => {
    const cast = firstOf('arc-caster');
    const forms = WEAPON_FORMS['arc-caster'].base.familyForms;
    const line = (n = 4, extra = {}) =>
      Array.from({ length: n }, (_, i) =>
        enemy(`e${i}`, 200 + i * 100, 300, extra)
      );
    const cast1 = (who, setup = () => {}, stats = STATS) => {
      const { combat, eventBus, enemies } = armed('arc-caster', who);
      setup(combat, eventBus);
      combat.handleShooting(1, stats);
      return { combat, enemies, eventBus };
    };
    const dealt = (who) => 100 - who.health;

    it('thermal: every hop sets its target burning; the field does not', () => {
      const { combat } = cast1(line(), (c) =>
        c.weapons.evolveWeapon('thermal')
      );
      expect(combat.cards.burns.size).toBe(cast.jumps + 1);
      const field = cast1(line(), (c) => c.weapons.evolveWeapon('field'));
      expect(field.combat.cards.burns.size).toBe(0);
    });

    it('field: every hop slows; the Singularity opens one well every 2nd cast, at the first enemy', () => {
      const slowed = cast1(line(), (c) => c.weapons.evolveWeapon('field'));
      expect(slowed.combat.cards.slows.size).toBe(cast.jumps + 1);
      expect(slowed.combat.cards.wells).toHaveLength(0);

      const who = line();
      const { combat } = armed('arc-caster', who);
      combat.weapons.apexWeapon('field');
      combat.handleShooting(1, STATS);
      expect(combat.cards.wells).toHaveLength(0);
      combat.handleShooting(1, STATS);
      expect(combat.cards.wells).toHaveLength(forms.perShot.pulls);
    });

    it('salvage: Prospector pays on the arc kills', () => {
      const weak = enemy('weak', 200, 300, { health: 1 });
      const { combat, enemies } = armed('arc-caster', [weak]);
      enemies.rewardManager = {
        stats: { totalOrbsDropped: 0 },
        createXPOrbs: vi.fn(),
      };
      const damage = enemies.applyDamage;
      enemies.applyDamage = (target, amount, ...rest) => {
        const result = damage(target, amount, ...rest);
        if (result.killed) enemies.rewardManager.stats.totalOrbsDropped += 4;
        return result;
      };
      combat.weapons.evolveWeapon('salvage');
      combat.handleShooting(1, STATS);
      expect(enemies.rewardManager.createXPOrbs).toHaveBeenCalledTimes(1);
    });

    it('kinetic: Railshot keeps 90% a hop, Coilgun full strength and +25% a cast', () => {
      const hops = (stage) => {
        const who = line();
        cast1(who, (c) => {
          if (stage >= 0) c.weapons.evolveWeapon('kinetic');
          if (stage === 1) c.weapons.apexWeapon('kinetic');
        });
        return who.map(dealt);
      };
      const base = hops(-1);
      const rail = hops(0);
      const coil = hops(1);
      rail.forEach((d, hop) => {
        expect(d).toBeCloseTo(DAMAGE * forms.kinetic.falloff[0] ** hop, 6);
      });
      coil.forEach((d) =>
        expect(d).toBeCloseTo(DAMAGE * forms.kinetic.damage[1], 6)
      );
      expect(base[2]).toBeCloseTo(DAMAGE * cast.falloff ** 2, 6);
    });

    it("the cards' own arcs are not family hits: no burn off a Capacitor Bank spark", () => {
      const [target] = line(1);
      const { combat } = armed('arc-caster', [target]);
      combat.weapons.evolveWeapon('thermal');
      combat.cards.strikeArc({ x: 100, y: 300, radius: 0 }, target, 5);
      expect(target.health).toBeLessThan(100);
      expect(combat.cards.burns.size).toBe(0);
    });

    it('Chain Capacitor: only the extra jump, no double hit', () => {
      const who = line(6);
      cast1(who, (c) => {
        c.cards.cardEffects.chainCapacitor = {
          extraJumps: 1,
          doubleHitChance: 1,
        };
      });
      expect(dealt(who[0])).toBeCloseTo(DAMAGE, 6);
      expect(dealt(who[cast.jumps + 1])).toBeGreaterThan(0);
    });

    it('Overcharge Coil: casts come sooner, the cube root of the lance speed gain', () => {
      const { combat, eventBus } = armed('arc-caster', []);
      eventBus.emit('upgrade-weapon-tuning', {
        upgradeId: 'overcharge_coil',
        level: 1,
        bulletSpeedMultiplier: 1.15,
      });
      combat.handleShooting(1, STATS);
      expect(combat.lastShotTime).toBeCloseTo(
        -combat.shootCooldown * (cast.cooldownMultiplier / Math.cbrt(1.15) - 1),
        9
      );
    });

    it('Recoil Dampers: a jump per rank, past the Multishot cap', () => {
      const who = line(cast.maxJumps + 4);
      cast1(
        who,
        (c, bus) =>
          bus.emit('upgrade-weapon-tuning', {
            upgradeId: 'recoil_dampers',
            level: 1,
            pierceBonus: 1,
          }),
        { multishot: 9, damage: DAMAGE }
      );
      const struck = who.filter((target) => target.health < 100);
      expect(struck).toHaveLength(cast.maxJumps + 1 + cast.pierceJumps);
    });

    it('Thermal Lens: cast damage +15% on every hop', () => {
      const who = line();
      cast1(who, (c) => {
        c.cards.cardEffects.thermalLens = { lanceDamageMultiplier: 1.15 };
      });
      who.forEach((target, hop) =>
        expect(dealt(target)).toBeCloseTo(
          DAMAGE * cast.falloff ** hop * 1.15,
          6
        )
      );
    });

    it('Afterburn Lance: hops far from the ship hit harder', () => {
      const who = line(2);
      cast1(who, (c) => {
        c.cards.cardEffects.longBurn = { bonusPer100px: 0.2, maxDistance: 400 };
      });
      expect(dealt(who[0])).toBeCloseTo(DAMAGE * (1 + 0.2 * 1), 6);
      expect(dealt(who[1])).toBeCloseTo(
        DAMAGE * cast.falloff * (1 + 0.2 * 2),
        6
      );
    });

    it('Targeting Matrix: threat focus only for elites, heralds and bosses', () => {
      const focus = (extra) => {
        const who = line(1, extra);
        cast1(who, (c, bus) =>
          bus.emit('upgrade-threat-focus', { damageMultiplier: 1.2 })
        );
        return dealt(who[0]);
      };
      expect(focus({})).toBeCloseTo(DAMAGE, 6);
      expect(focus({ elite: true })).toBeCloseTo(DAMAGE * 1.2, 6);
      expect(focus({ type: 'herald' })).toBeCloseTo(DAMAGE * 1.2, 6);
      expect(focus({ type: 'boss' })).toBeCloseTo(DAMAGE * 1.2, 6);
    });
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

  describe('orbit: the families and the six cards', () => {
    const halo = firstOf('shard-halo');
    const forms = WEAPON_FORMS['shard-halo'].base.familyForms;
    const at = (id, x, y, extra) => enemy(id, SHIP.x + x, SHIP.y + y, extra);
    // Five enemies on the first blade's ring, all within its reach.
    const crowd = () =>
      [-6, -3, 0, 3, 6].map((dy, i) => at(`c${i}`, halo.radius, dy));
    const cut = (who, setup = () => {}, stats = STATS) => {
      const { combat, eventBus } = armed('shard-halo', who);
      setup(combat, eventBus);
      tickWeaponField(combat.weapons, 0.01, stats);
      return combat;
    };
    const lone = (extra) => at('t', halo.radius, 0, extra);
    const dealt = (who) => 100 - who.health;
    const plain = () =>
      dealt(
        (() => {
          const t = lone();
          cut([t]);
          return t;
        })()
      );

    it('thermal: a cut sets the enemy burning, not the field', () => {
      const t = lone();
      const combat = cut([t], (c) => c.weapons.evolveWeapon('thermal'));
      expect(combat.cards.burns.size).toBe(1);
      const f = lone();
      const field = cut([f], (c) => c.weapons.evolveWeapon('field'));
      expect(field.cards.slows.size).toBe(0);
    });

    it('arc: a cycle cutting five enemies starts one chain; Storm forks it', () => {
      const combat = cut(crowd(), (c) => c.weapons.evolveWeapon('arc'));
      expect(combat.arcs).toHaveLength(forms.perShot.chains);
      const storm = cut(crowd(), (c) => c.weapons.apexWeapon('arc'));
      expect(storm.arcs.length).toBeGreaterThan(1);
      // The next cycle gets a new budget.
      combat.handleShooting(1, STATS);
      tickWeaponField(combat.weapons, 0.01, STATS);
      expect(combat.arcs).toHaveLength(2 * forms.perShot.chains);
    });

    it('kinetic: Railshot and Coilgun cut harder and shove further', () => {
      const run = (stage) => {
        const t = lone();
        cut([t], (c) => {
          if (stage >= 0) c.weapons.evolveWeapon('kinetic');
          if (stage === 1) c.weapons.apexWeapon('kinetic');
        });
        return { dealt: dealt(t), speed: Math.hypot(t.vx, t.vy) };
      };
      const base = run(-1);
      [0, 1].forEach((stage) => {
        const heavy = run(stage);
        expect(heavy.dealt).toBeCloseTo(
          base.dealt * forms.kinetic.damage[stage],
          6
        );
        expect(heavy.speed).toBeCloseTo(
          knockbackSpeed(heavy.dealt) * forms.kinetic.push[stage],
          6
        );
      });
    });

    it('salvage: Prospector pays on the cut kills', () => {
      const weak = lone({ health: 1 });
      const { combat, enemies } = armed('shard-halo', [weak]);
      enemies.rewardManager = {
        stats: { totalOrbsDropped: 0 },
        createXPOrbs: vi.fn(),
      };
      const damage = enemies.applyDamage;
      enemies.applyDamage = (target, amount, ...rest) => {
        const result = damage(target, amount, ...rest);
        if (result.killed) enemies.rewardManager.stats.totalOrbsDropped += 4;
        return result;
      };
      combat.weapons.evolveWeapon('salvage');
      tickWeaponField(combat.weapons, 0.01, STATS);
      expect(enemies.rewardManager.createXPOrbs).toHaveBeenCalledTimes(1);
    });

    it('Chain Capacitor: a cut can land twice', () => {
      const twice = lone();
      cut([twice], (c) => {
        c.cards.cardEffects.chainCapacitor = {
          extraJumps: 1,
          doubleHitChance: 1,
        };
      });
      expect(dealt(twice)).toBeCloseTo(plain() * 2, 6);
    });

    it('Overcharge Coil: the blades spin faster, the cube root of the lance speed gain', () => {
      const turn = (gain) => {
        const { combat, eventBus } = armed('shard-halo', []);
        if (gain) {
          eventBus.emit('upgrade-weapon-tuning', {
            upgradeId: 'overcharge_coil',
            level: 1,
            bulletSpeedMultiplier: gain,
          });
        }
        tickWeaponField(combat.weapons, 0.1, STATS);
        return combat.blades[0].around;
      };
      expect(turn(1.15)).toBeCloseTo(turn(0) * Math.cbrt(1.15), 6);
    });

    it('Recoil Dampers: the blades cut 4 px wider', () => {
      const far = () => lone({ x: SHIP.x + halo.radius + 10 + 10 + 2 });
      const t = far();
      cut([t]);
      expect(dealt(t)).toBe(0);
      const wide = far();
      cut([wide], (c, bus) =>
        bus.emit('upgrade-weapon-tuning', {
          upgradeId: 'recoil_dampers',
          level: 1,
          pierceBonus: 1,
        })
      );
      expect(dealt(wide)).toBeGreaterThan(0);
    });

    it('Thermal Lens: cut damage +15%', () => {
      const t = lone();
      cut([t], (c) => {
        c.cards.cardEffects.thermalLens = { lanceDamageMultiplier: 1.15 };
      });
      expect(dealt(t)).toBeCloseTo(plain() * 1.15, 6);
    });

    it('Afterburn Lance: more damage the further the enemy is from the ship', () => {
      const burn = (x) => {
        const t = at('t', x, 0);
        cut([t], (c) => {
          c.cards.cardEffects.longBurn = {
            bonusPer100px: 0.2,
            maxDistance: 400,
          };
        });
        return dealt(t);
      };
      expect(burn(halo.radius)).toBeCloseTo(plain() * (1 + 0.2 * 0.44), 6);
    });

    it('Targeting Matrix: threat focus only for elites, heralds and bosses', () => {
      const focus = (extra) => {
        const t = lone(extra);
        cut([t], (c, bus) =>
          bus.emit('upgrade-threat-focus', { damageMultiplier: 1.2 })
        );
        return dealt(t);
      };
      expect(focus({})).toBeCloseTo(plain(), 6);
      expect(focus({ elite: true })).toBeCloseTo(plain() * 1.2, 6);
      expect(focus({ type: 'herald' })).toBeCloseTo(plain() * 1.2, 6);
      expect(focus({ type: 'boss' })).toBeCloseTo(plain() * 1.2, 6);
    });
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

  it('aura: it carries the families it declares, not its own thermal: the field slows, the Singularity opens one well every 2nd pulse, the budget caps it', () => {
    const crowd = () =>
      [
        [130, 300],
        [100, 335],
        [70, 300],
        [100, 265],
        [135, 325],
      ].map(([x, y], i) => enemy(`c${i}`, x, y));
    const slowed = armed('furnace-corona', crowd());
    slowed.combat.weapons.evolveWeapon('field');
    slowed.combat.handleShooting(1, STATS);
    expect(slowed.combat.cards.slows.size).toBe(5);
    expect(slowed.combat.cards.wells).toHaveLength(0);

    const { combat } = armed('furnace-corona', crowd());
    combat.weapons.apexWeapon('field');
    combat.handleShooting(1, STATS);
    expect(combat.cards.wells).toHaveLength(0); // the well: every 2nd pulse
    combat.handleShooting(1, STATS);
    expect(combat.cards.wells).toHaveLength(1);
    expect(combat.cards.slows.size).toBe(0);

    const thermal = armed('furnace-corona', crowd());
    thermal.combat.weapons.evolveWeapon('thermal');
    thermal.combat.handleShooting(1, STATS);
    expect(thermal.combat.cards.burns.size).toBe(0);
  });

  it('aura: a pulse hitting five enemies starts at most two chains; Storm forks them', () => {
    const crowd = () =>
      [
        [130, 300],
        [100, 335],
        [70, 300],
        [100, 265],
        [135, 325],
      ].map(([x, y], i) => enemy(`c${i}`, x, y));
    const { combat } = armed('furnace-corona', crowd());
    combat.weapons.evolveWeapon('arc');
    combat.handleShooting(1, STATS);
    expect(combat.arcs).toHaveLength(
      WEAPON_FORMS['furnace-corona'].base.familyForms.perShot.chains
    );
    const storm = armed('furnace-corona', crowd());
    storm.combat.weapons.apexWeapon('arc');
    storm.combat.handleShooting(1, STATS);
    expect(storm.combat.arcs.length).toBeGreaterThan(2);
  });

  it('aura: a lance hit with no shot budget starts a chain every time', () => {
    const [a, b, c] = [
      enemy('a', 150, 300),
      enemy('b', 200, 300),
      enemy('c', 250, 300),
    ];
    const { combat, enemies } = makeRun([a, b, c]);
    combat.weapons.evolveWeapon('arc');
    const hit = (extra) => ({
      projectile: {},
      x: 150,
      y: 300,
      vx: 1,
      vy: 0,
      damage: 5,
      hit: false,
      ...extra,
    });
    combat.hits.processBulletHit(hit(), a, enemies);
    combat.hits.processBulletHit(hit(), c, enemies);
    expect(combat.cards.arcs).toHaveLength(2);
    combat.hits.processBulletHit(hit({ shot: { chains: 0 } }), b, enemies);
    expect(combat.cards.arcs).toHaveLength(2);
  });

  it('aura: Railshot and Coilgun make the pulse heavier and throw further', () => {
    const forms = WEAPON_FORMS['furnace-corona'].base.familyForms.kinetic;
    const stats = { multishot: 1, damage: 20 };
    const pulse = (stage) => {
      const target = enemy('t', 140, 300);
      const { combat } = armed('furnace-corona', [target]);
      if (stage >= 0) combat.weapons.evolveWeapon('kinetic');
      if (stage === 1) combat.weapons.apexWeapon('kinetic');
      combat.handleShooting(1, stats);
      return { dealt: 100 - target.health, vx: target.vx };
    };
    const plain = pulse(-1);
    [0, 1].forEach((stage) => {
      const heavy = pulse(stage);
      expect(heavy.dealt).toBeCloseTo(plain.dealt * forms.damage[stage], 6);
      expect(heavy.vx).toBeCloseTo(
        knockbackSpeed(heavy.dealt) * forms.push[stage],
        6
      );
    });
  });

  it('aura: Prospector and Motherlode pay on the pulse kills', () => {
    const weak = enemy('weak', 140, 300, { health: 1 });
    const { combat, enemies } = armed('furnace-corona', [weak]);
    enemies.rewardManager = {
      stats: { totalOrbsDropped: 0 },
      createXPOrbs: vi.fn(),
    };
    const damage = enemies.applyDamage;
    enemies.applyDamage = (target, amount, ...rest) => {
      const result = damage(target, amount, ...rest);
      if (result.killed) enemies.rewardManager.stats.totalOrbsDropped += 4;
      return result;
    };
    combat.weapons.evolveWeapon('salvage');
    combat.handleShooting(1, STATS);
    expect(enemies.rewardManager.createXPOrbs).toHaveBeenCalledTimes(1);
  });

  describe('aura: the six cards', () => {
    const pulse = (setup, who = enemy('t', 140, 300), stats = STATS) => {
      const { combat, eventBus } = armed('furnace-corona', [who]);
      setup(combat, eventBus);
      combat.handleShooting(1, stats);
      return who;
    };
    const base = () => pulse(() => {});
    const dealt = (who) => 100 - who.health;

    it('Chain Capacitor: a pulse hit can land twice', () => {
      const twice = pulse((combat) => {
        combat.cards.cardEffects.chainCapacitor = {
          extraJumps: 1,
          doubleHitChance: 1,
        };
      });
      expect(dealt(twice)).toBeCloseTo(dealt(base()) * 2, 6);
    });

    it('Overcharge Coil: pulses come sooner, the cube root of the lance speed gain', () => {
      const who = enemy('t', 140, 300);
      const { combat, eventBus } = armed('furnace-corona', [who]);
      eventBus.emit('upgrade-weapon-tuning', {
        upgradeId: 'overcharge_coil',
        level: 1,
        bulletSpeedMultiplier: 1.15,
      });
      combat.handleShooting(1, STATS);
      const once = dealt(who);
      const wait =
        (combat.shootCooldown * firstOf('furnace-corona').cooldownMultiplier) /
        Math.cbrt(1.15);
      combat.handleShooting(wait + 1e-6, STATS);
      expect(dealt(who)).toBeCloseTo(2 * once, 6);
    });

    it('Recoil Dampers: the ring reaches 20 px further, past the Multishot cap', () => {
      const far = () => enemy('far', 100 + 78 + 10 + 18, 300);
      expect(dealt(pulse(() => {}, far()))).toBe(0);
      const reached = pulse(
        (combat, bus) =>
          bus.emit('upgrade-weapon-tuning', {
            upgradeId: 'recoil_dampers',
            level: 1,
            pierceBonus: 1,
          }),
        far()
      );
      expect(dealt(reached)).toBeGreaterThan(0);
    });

    it('Thermal Lens: pulse damage +15%', () => {
      const lens = pulse((combat) => {
        combat.cards.cardEffects.thermalLens = { lanceDamageMultiplier: 1.15 };
      });
      expect(dealt(lens)).toBeCloseTo(dealt(base()) * 1.15, 6);
    });

    it('Afterburn Lance: more damage the further the enemy is from the ship', () => {
      const burn = (x) =>
        pulse(
          (combat) => {
            combat.cards.cardEffects.longBurn = {
              bonusPer100px: 0.2,
              maxDistance: 400,
            };
          },
          enemy('t', x, 300)
        );
      const plain = dealt(pulse(() => {}, enemy('t', 160, 300)));
      expect(dealt(burn(160))).toBeCloseTo(plain * 1.12, 6);
      expect(dealt(burn(130))).toBeLessThan(dealt(burn(160)));
    });

    it('Targeting Matrix: threat focus only for elites, heralds and bosses', () => {
      const focus = (extra) =>
        dealt(
          pulse(
            (combat, bus) =>
              bus.emit('upgrade-threat-focus', { damageMultiplier: 1.2 }),
            enemy('t', 140, 300, extra)
          )
        );
      const plain = dealt(base());
      expect(focus({})).toBeCloseTo(plain, 6);
      expect(focus({ elite: true })).toBeCloseTo(plain * 1.2, 6);
      expect(focus({ type: 'herald' })).toBeCloseTo(plain * 1.2, 6);
      expect(focus({ type: 'boss' })).toBeCloseTo(plain * 1.2, 6);
    });
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

  it('seeker: with the Overcharge Coil at rank 3 missiles fly 30% faster and turn 60% tighter', () => {
    const salvo = firstOf('seeker-swarm');
    const below = enemy('below', MUZZLE.x, MUZZLE.y + 200);
    const { combat, eventBus } = armed('seeker-swarm', [below]);
    [1, 2, 3].forEach((level) =>
      eventBus.emit('upgrade-weapon-tuning', {
        upgradeId: 'overcharge_coil',
        level,
        bulletSpeedMultiplier: 1.15,
      })
    );
    combat.handleShooting(1, STATS);
    const [missile] = combat.bullets;
    const base = combat.bulletSpeed / 1.15 ** 3;
    expect(Math.hypot(missile.vx, missile.vy)).toBeCloseTo(
      base * 1.3 * WEAPON_FORMS['seeker-swarm'].base.projectile.speedMultiplier,
      6
    );
    expect(missile.seeker.turn).toBeCloseTo(salvo.turn * 1.6, 6);
  });

  it('seeker: with the Thermal Lens missiles find targets 40% further and a direct hit deals +25%; the burst gains nothing', () => {
    const salvo = firstOf('seeker-swarm');
    const { projectile } = WEAPON_FORMS['seeker-swarm'].base;
    const far = enemy('far', MUZZLE.x + salvo.acquire * 1.3, MUZZLE.y);
    const { combat, eventBus } = armed('seeker-swarm', [far]);
    eventBus.emit('upgrade-thermal-lens', {
      beamLengthMultiplier: 1.4,
      lanceDamageMultiplier: 1.15,
    });
    combat.handleShooting(1, STATS);
    const [missile] = combat.bullets;
    expect(missile.seeker.target).toBe(far);
    const shot = DAMAGE * salvo.damageMultiplier;
    expect(missile.damage).toBeCloseTo(
      shot * 1.25 * projectile.damageMultiplier,
      6
    );
    expect(missile.shrapnel).toBeCloseTo(
      shot * projectile.burst.damageMultiplier,
      6
    );
  });

  it('seeker: with the Chain Capacitor a missile that rolls splits as it locks on; its twin goes for another target and never splits', () => {
    const ahead = enemy('ahead', MUZZLE.x + 200, MUZZLE.y);
    const other = enemy('other', MUZZLE.x + 220, MUZZLE.y + 60);
    const { combat } = armed('seeker-swarm', [ahead, other]);
    combat.cards.cardEffects.chainCapacitor = {
      extraJumps: 1,
      doubleHitChance: 0.1,
    };
    combat.cards.rollCardChance = vi.fn(() => true);
    combat.handleShooting(1, { multishot: 0, damage: DAMAGE });
    const salvo = combat.bullets.length;
    // Each missile locks on within a few frames: one roll each, a twin each.
    for (let frame = 0; frame < 30; frame += 1) {
      combat.updateBullets(1 / 60);
      tickWeaponField(combat.weapons, 1 / 60, STATS);
    }
    expect(combat.cards.rollCardChance).toHaveBeenCalledTimes(salvo);
    const twins = combat.bullets.slice(salvo);
    expect(twins).toHaveLength(salvo);
    twins.forEach((twin) => expect(twin.seeker.splits).toBe(false));
    // The two missiles chase one enemy each, so each twin takes the other.
    expect(new Set(twins.map((twin) => twin.seeker.target))).toEqual(
      new Set([ahead, other])
    );
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

  it("seeker: the Apex's every-third rack missile also breeds", () => {
    const { combat } = armed('seeker-swarm', [enemy('target', 300, 300)]);
    combat.weapons.apexWeapon('salvage');

    combat.handleShooting(1, STATS);
    combat.handleShooting(1, STATS);
    combat.handleShooting(1, STATS);

    expect(combat.bullets.slice(-6)).toHaveLength(6);
    combat.bullets.slice(-6).forEach((missile) => {
      expect(missile.seeker.breed).toBe(2);
    });
  });

  it('thermal family cards can evolve Furnace Corona even when their lance effects do not apply', () => {
    const { combat, progression } = makeRun();

    progression.applyUpgrade('furnace_corona');
    progression.applyUpgrade('thermal_lens');
    progression.applyUpgrade('afterburn_lance');

    expect(combat.weaponId).toBe('furnace-corona');
    expect(combat.weaponForm.form.id).toBe('nova-corona');
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
  describe('burst width (proposta 22/11)', () => {
    const burstRadius = (weaponId, setup) => {
      const { combat, eventBus } = armed(weaponId, []);
      setup(combat, eventBus);
      burstFlak(combat.weapons, {
        x: 300,
        y: 300,
        vx: 1,
        vy: 0,
        shrapnel: 1,
        colors: {},
        volley: { struck: [], bursts: 0 },
        projectile: WEAPON_FORMS[weaponId].base.projectile,
      });
      return combat.flakBursts[0].maxRadius;
    };
    const dampers = (combat, bus) =>
      bus.emit('upgrade-weapon-tuning', {
        upgradeId: 'recoil_dampers',
        level: 1,
        pierceBonus: 1,
      });

    it('Recoil Dampers: the Scatter flak bursts 25 px further, the Seeker missile bursts 25 px further', () => {
      expect(burstRadius('scatter', () => {})).toBe(40);
      expect(burstRadius('scatter', dampers)).toBe(65);
      expect(burstRadius('seeker-swarm', () => {})).toBe(28);
      expect(burstRadius('seeker-swarm', dampers)).toBe(53);
    });

    it('Scatter: Kinetic is its own (Grapeshot, Hailstorm): the flak burst keeps its width', () => {
      expect(
        burstRadius('scatter', (c) => c.weapons.evolveWeapon('kinetic'))
      ).toBe(40);
      expect(
        burstRadius('scatter', (c) => c.weapons.apexWeapon('kinetic'))
      ).toBe(40);
    });

    it('Seeker: Railshot widens the missile burst by 80%, the Apex by 120%', () => {
      expect(
        burstRadius('seeker-swarm', (c) => c.weapons.evolveWeapon('kinetic'))
      ).toBeCloseTo(50.4, 9);
      expect(
        burstRadius('seeker-swarm', (c) => c.weapons.apexWeapon('kinetic'))
      ).toBeCloseTo(61.6, 9);
      expect(
        burstRadius('seeker-swarm', (c, bus) => {
          c.weapons.evolveWeapon('kinetic');
          dampers(c, bus);
        })
      ).toBeCloseTo(95.4, 9);
    });

    it('Seeker: its kinetic, thermal, arc and field lines are its own (its missile forms: CombatSystem.seekerForms.test.js)', () => {
      expect(familyLine('kinetic', 'seeker-swarm')).toBe(
        'missile bursts 80% wider'
      );
      expect(familyLine('kinetic', 'seeker-swarm', true)).toMatch(/120%/);
      expect(familyLine('thermal', 'seeker-swarm')).toMatch(/lodges/);
      expect(familyLine('arc', 'seeker-swarm', true)).toMatch(/5 enemies/);
      expect(familyLine('field', 'seeker-swarm')).toMatch(/gravity well/);
      expect(notWithWeapon('kinetic', 'seeker-swarm')).toBeNull();
    });
  });
});
