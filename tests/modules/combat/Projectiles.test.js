import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { Projectiles } from '../../../src/modules/combat/Projectiles.js';

const weapon = {
  weaponId: 'lance',
  bulletSpeed: 500,
  bulletLifetime: 1.5,
  trailLength: 2,
  thermalLens: undefined,
  lanceDamageTuning: 1,
  lanceApexDamage: 1,
  lancePierce: 1,
  pierceBonus: 2,
};

function makeProjectiles(emitted = []) {
  return new Projectiles({
    physics: () => null,
    emit: (name, payload) => emitted.push({ name, payload }),
    weapon: () => ({ ...weapon }),
    burstFlak: () => {},
  });
}

describe('Projectiles', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });

  afterEach(() => {
    GamePools.releaseAll();
  });

  it('fires a lance with the weapon pierce, life and trail, and announces it', () => {
    const emitted = [];
    const projectiles = makeProjectiles(emitted);

    projectiles.createBullet({ x: 400, y: 300 }, { x: 500, y: 300 }, 10);

    expect(projectiles.bullets).toHaveLength(1);
    const bullet = projectiles.bullets[0];
    expect(bullet.kind).toBe('lance');
    expect(bullet.vx).toBeCloseTo(weapon.bulletSpeed, 6);
    expect(bullet.life).toBe(weapon.bulletLifetime);
    expect(bullet.pierceLeft).toBe(weapon.lancePierce + weapon.pierceBonus);
    expect(emitted).toEqual([
      {
        name: 'bullet-created',
        payload: expect.objectContaining({ bullet }),
      },
    ]);

    for (let step = 0; step < 4; step += 1) projectiles.updateBullets(0.01);
    expect(bullet.trail).toHaveLength(weapon.trailLength);
  });

  it('drops an enemy shot once its lifetime runs out', () => {
    const projectiles = makeProjectiles();
    projectiles.createEnemyBullet({
      position: { x: 400, y: 300 },
      velocity: { x: 0, y: 0 },
      projectile: { lifetime: 0.5 },
    });

    projectiles.updateEnemyBullets(0.3);
    expect(projectiles.enemyBullets).toHaveLength(1);
    projectiles.updateEnemyBullets(0.3);
    expect(projectiles.enemyBullets).toHaveLength(0);
  });
});
