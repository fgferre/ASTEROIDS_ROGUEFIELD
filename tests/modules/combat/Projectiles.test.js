import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { WEAPONS } from '../../../src/data/weapons.js';
import { Projectiles } from '../../../src/modules/combat/Projectiles.js';

const weapon = {
  form: WEAPONS.lance,
  bulletSpeed: 500,
  bulletLifetime: 1.5,
  trailLength: 2,
  thermalLens: undefined,
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

  it('announces an enemy shot that burns out in the air, not one that leaves the field', () => {
    const emitted = [];
    const projectiles = makeProjectiles(emitted);
    projectiles.createEnemyBullet({
      position: { x: 400, y: 300 },
      velocity: { x: 100, y: 0 },
      projectile: { lifetime: 0.5 },
    });
    projectiles.createEnemyBullet({
      position: { x: 790, y: 300 },
      velocity: { x: 100, y: 0 },
      projectile: { lifetime: 5 },
    });

    projectiles.updateEnemyBullets(0.3); // the second leaves the field
    projectiles.updateEnemyBullets(0.3); // the first burns out
    const expired = emitted.filter(
      ({ name }) => name === 'enemy-bullet-expired'
    );
    expect(expired).toHaveLength(1);
    expect(expired[0].payload.position.x).toBeCloseTo(460, 3);
    expect(expired[0].payload.velocity).toEqual({ x: 100, y: 0 });
  });

  it('compacts the shot arrays in place, keeping survivors in order', () => {
    const projectiles = makeProjectiles();
    for (let i = 0; i < 3; i += 1) {
      projectiles.createEnemyBullet({
        position: { x: 400, y: 300 },
        velocity: { x: 0, y: 0 },
        projectile: { lifetime: i === 1 ? 0.1 : 5 },
      });
      projectiles.createBullet({ x: 400, y: 300 }, { x: 500, y: 300 }, 10);
    }
    projectiles.bullets[1].life = 0.01;

    const enemyList = projectiles.enemyBullets;
    const playerList = projectiles.bullets;
    const enemyKept = [enemyList[0], enemyList[2]];
    const playerKept = [playerList[0], playerList[2]];

    projectiles.updateEnemyBullets(0.3);
    projectiles.updateBullets(0.3);

    expect(projectiles.enemyBullets).toBe(enemyList);
    expect(projectiles.bullets).toBe(playerList);
    expect(enemyList).toEqual(enemyKept);
    expect(playerList).toEqual(playerKept);
    expect(enemyList[0]).toBe(enemyKept[0]);
    expect(playerList[1]).toBe(playerKept[1]);
  });

  it('gives back a shot taken from the pool again as a new one, whatever kind it was', () => {
    const ship = { isDead: false, getPosition: () => ({ x: 400, y: 300 }) };
    const projectiles = new Projectiles({
      physics: () => ({
        buildPlayerCollisionContext: () => ({ collisionRadius: 20 }),
        checkCircleCollision: (x, y, r, px, py, pr) =>
          Math.hypot(x - px, y - py) <= r + pr,
      }),
      emit: () => {},
      weapon: () => ({ ...weapon }),
      burstFlak: () => {},
    });
    GamePools.bullets.clear();

    // The ship's shot, with what the weapon's forms write on it in flight
    // (firePatterns.js, fanForms.js).
    const shot = projectiles.createBullet(
      { x: 400, y: 300 },
      { x: 500, y: 300 },
      10,
      { struck: [], bursts: 0 },
      { ricochet: { times: 2 }, coilSpeed: 1, coilRange: 40 }
    );
    shot.seeker = { target: null, id: null, turn: 4 };
    shot.glance = { bullet: shot, fade: null };
    shot.ricochets -= 1;
    shot.scrapAge = 0.2;
    shot.pierced.push({ id: 'rock' });
    shot.pierceLeft -= 1;
    shot.hit = true;

    // Enemy shots: a Warden's and a frozen one that hit the parked ship, and
    // a frozen one cleared from the air.
    const enemyShot = (x, enemy) =>
      projectiles.createEnemyBullet({
        position: { x, y: 300 },
        velocity: { x: 0, y: 0 },
        projectile: { radius: 9, trailLength: 30, color: '#f0f', damage: 7 },
        enemy: { x, y: 300, ...enemy },
      });
    enemyShot(410, { id: 'warden-1', type: 'boss' });
    enemyShot(390, { id: 'drone-1', type: 'drone' });
    enemyShot(100, { id: 'drone-2', type: 'drone' });
    projectiles.freezeEnemyBullets(3);

    projectiles.updateBullets(0.01);
    projectiles.updateEnemyBullets(0.01, ship);
    projectiles.clearEnemyBullets();

    expect(GamePools.bullets.available).toHaveLength(4);
    for (let i = 0; i < 4; i += 1) {
      expect(GamePools.bullets.acquire()).toStrictEqual(
        GamePools.bullets.createFn()
      );
    }
  });
});
