import { afterEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import RandomService from '../../src/core/RandomService.js';
import XPOrbSystem from '../../src/modules/XPOrbSystem.js';

describe('XPOrbSystem pool', () => {
  afterEach(() => {
    GamePools.releaseAll();
  });

  it('gives back an orb taken from the pool again as a new one', () => {
    const system = new XPOrbSystem({
      eventBus: { on() {}, off() {}, emit() {} },
      random: new RandomService('orb-pool'),
    });
    GamePools.xpOrbs.clear();

    // A cluster's orbs, with every option, caught in a fusion, homing and
    // drifting, then collected mid-fusion.
    const orbs = [];
    for (let i = 0; i < system.tuning.clusterFusionCount; i += 1) {
      orbs.push(
        system.createXPOrb(400 + i, 300, 5, {
          vx: 40,
          vy: -20,
          age: 2,
          clusterId: 'boss-1',
          source: 'boss',
        })
      );
    }
    system.field.ensureSpatialIndex();
    for (const orb of orbs) orb.vx = orb.vy = 0;
    expect(
      system.fusion.initiateOrbFusion(
        'blue',
        'green',
        { orbs, center: { x: 400, y: 300 } },
        'test'
      )
    ).toBe(true);
    system.sendHome(orbs[0], 300, 600);
    system.setDrift(
      { driftSpeed: 10, driftTurn: 1, pullScale: 1 },
      new RandomService('drift')
    );
    system.updateDrift(0.1);
    orbs.forEach((orb) => system.collectOrb(orb));
    system.field.cleanupCollectedOrbs();

    expect(GamePools.xpOrbs.available).toHaveLength(orbs.length);
    for (let i = 0; i < orbs.length; i += 1) {
      expect(GamePools.xpOrbs.acquire()).toStrictEqual(
        GamePools.xpOrbs.createFn()
      );
    }
  });
});
