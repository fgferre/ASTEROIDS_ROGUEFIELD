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
  const enemies = {};
  const weapons = {
    beams: [],
    flakBursts: [],
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
      applyDamageToEnemy: () => {},
      pushEnemy: () => {},
    }),
  });
  return { cards, hits, enemies, weapons };
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
