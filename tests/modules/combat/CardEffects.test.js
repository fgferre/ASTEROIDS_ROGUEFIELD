import { describe, expect, it } from 'vitest';
import { CardEffects } from '../../../src/modules/combat/CardEffects.js';
import { WEAPON_EVOLUTIONS } from '../../../src/data/weapons.js';

const CHAIN = WEAPON_EVOLUTIONS.arc.chain;

const enemy = (id, x) => ({
  id,
  x,
  y: 300,
  vx: 0,
  vy: 0,
  radius: 10,
  type: 'drone',
});

function makeCards(list = []) {
  const hits = [];
  const damage = [];
  const enemies = {};
  const weapons = {
    beams: [],
    flakBursts: [],
    pulses: [],
    apexes: [],
    bulletSpeed: 500,
    baseShootCooldown: 0.3,
    forEachSolidEnemy: (callback) => list.forEach(callback),
  };
  const player = {
    isDead: false,
    getPosition: () => ({ x: 100, y: 300 }),
    getMuzzlePoint: () => ({ x: 110, y: 300 }),
  };
  const cards = new CardEffects({
    player: () => player,
    enemies: () => enemies,
    targeting: () => ({}),
    weapons: () => weapons,
    hits: () => ({
      processBulletHit: (hit, target, service) =>
        hits.push({ hit, target, service }),
      applyDamageToEnemy: (service, target, amount) => damage.push(amount),
      pushEnemy: () => {},
    }),
  });
  return { cards, hits, damage, enemies, weapons };
}

describe('CardEffects', () => {
  it('Chain Capacitor: the chain jumps once more, one arc and one chain hit per jump', () => {
    const line = [0, 1, 2, 3].map((i) => enemy(`e${i}`, 200 + i * 60));
    const { cards, hits, enemies } = makeCards(line);
    cards.cardEffects.chainCapacitor = { extraJumps: 1, doubleHitChance: 0.1 };

    const jumps = CHAIN.jumps + cards.cardEffects.chainCapacitor.extraJumps;
    cards.chainFrom(line[0], 5, jumps);

    expect(hits.map(({ target }) => target.id)).toEqual(['e1', 'e2']);
    hits.forEach(({ hit, service }) => {
      expect(hit).toMatchObject({ kind: 'chain', damage: 5, hit: false });
      expect(service).toBe(enemies);
    });
    expect(cards.arcs).toHaveLength(2);
    expect(cards.arcs[0]).toMatchObject({
      life: CHAIN.duration,
      maxLife: CHAIN.duration,
      color: null,
      heavy: false,
    });
  });

  it('Gravity Brake holds back what moves near the ship, not what a Stasis froze', () => {
    const moving = { ...enemy('moving', 150), vx: 100 };
    const frozen = { ...enemy('frozen', 160), vx: 100, stunTimer: 1 };
    const shots = [
      { x: 120, y: 300, vx: 0, vy: 100, stasisTimer: 0 },
      { x: 130, y: 300, vx: 0, vy: 100, stasisTimer: 1 },
    ];
    const { cards } = makeCards([moving, frozen]);
    cards.enemyBullets = () => shots;

    cards.applyGravityBrake({ radius: 200, slowFraction: 0.5 }, 0.1);
    expect(moving.x).toBeCloseTo(145, 9);
    expect(shots[0].y).toBeCloseTo(295, 9);
    expect(frozen.x).toBe(160);
    expect(shots[1].y).toBe(300);
  });

  it('a burn set again faster than it ticks still ticks on its own interval', () => {
    const target = enemy('burning', 200);
    const { cards, damage } = makeCards([target]);
    // Sunheart's burn (a tick every 0.5 s) under pulses every 0.4 s.
    const burn = { duration: 1.5, ticks: 3, damageFraction: 0.3 };
    for (let frame = 0; frame < 170; frame += 1) {
      if (frame % 24 === 0) cards.ignite(target, 10, burn);
      cards.updateWeaponEffects(1 / 60);
    }
    expect(damage).toHaveLength(5);
    damage.forEach((amount) => expect(amount).toBeCloseTo(3, 9));
  });

  it('ages the effects every tick and drops the expired ones', () => {
    const a = enemy('a', 200);
    const b = enemy('b', 260);
    const { cards, weapons } = makeCards([a, b]);
    cards.addArc(a, b);
    weapons.flakBursts.push({ x: 0, y: 0, life: CHAIN.duration * 2 });

    cards.updateWeaponEffects(CHAIN.duration / 2);
    expect(cards.arcs).toHaveLength(1);
    expect(cards.arcs[0].life).toBeCloseTo(CHAIN.duration / 2, 9);

    cards.updateWeaponEffects(CHAIN.duration);
    expect(cards.arcs).toHaveLength(0);
    expect(weapons.flakBursts).toHaveLength(1);
    expect(weapons.flakBursts[0].life).toBeCloseTo(CHAIN.duration / 2, 9);
  });
});
