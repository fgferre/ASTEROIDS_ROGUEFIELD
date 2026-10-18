import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DISSOLVE_CAP,
  DISSOLVE_SECONDS,
  DeathBursts,
} from '../../../src/modules/render3d/dissolve.js';
import { EnemyMirror } from '../../../src/modules/render3d/enemyMirror.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const mote = (id, x = 400) => ({
  id,
  type: 'drone',
  x,
  y: 300,
  radius: 12,
  getHitFlash: () => 0,
});

const setup = () => {
  const pushed = [];
  const bursts = new DeathBursts(
    { push: (p) => pushed.push(p) },
    { light: () => {} }
  );
  const mirror = new EnemyMirror(
    THREE,
    new THREE.Scene(),
    (fn) => fn(),
    bursts
  );
  return { mirror, bursts, pushed };
};

const pooled = (mirror, view) =>
  Boolean(mirror.pools.get(view.kind)?.includes(view));

describe('DissolvePool', () => {
  it('burns a killed enemy for DISSOLVE_SECONDS, then hides and pools it', () => {
    const { mirror, bursts, pushed } = setup();
    const enemy = mote('a');
    mirror.update([enemy], 0, 0);
    const view = mirror.views.get('a');
    const body = view.body;
    const hull = body.material;

    mirror.markDead(enemy);
    mirror.update([], 0, 0);
    expect(mirror.dissolve.count).toBe(1);
    expect(view.object.visible).toBe(true);
    expect(body.material).not.toBe(hull);
    expect(pooled(mirror, view)).toBe(false);
    bursts.update(0.016);
    expect(pushed.length).toBeGreaterThanOrEqual(6);

    // the id comes back while the husk burns: it gets another view
    mirror.update([mote('a')], 0, DISSOLVE_SECONDS * 0.5);
    expect(mirror.views.get('a')).not.toBe(view);

    mirror.update([], 0, DISSOLVE_SECONDS * 0.6);
    expect(mirror.dissolve.count).toBe(0);
    expect(view.object.visible).toBe(false);
    expect(body.material).toBe(hull);
    expect(pooled(mirror, view)).toBe(true);
  });

  it('pools a despawned enemy at once and reuses twins on the next death', () => {
    const { mirror } = setup();
    mirror.update([mote('a')], 0, 0);
    const view = mirror.views.get('a');
    mirror.update([], 0, 0);
    expect(mirror.dissolve.count).toBe(0);
    expect(pooled(mirror, view)).toBe(true);

    const kill = (id) => {
      const enemy = mote(id);
      mirror.update([enemy], 0, 0);
      mirror.markDead(enemy);
      mirror.update([], 0, 0);
      return view.body.material;
    };
    const twin = kill('b');
    mirror.update([], 0, DISSOLVE_SECONDS);
    expect(kill('c')).toBe(twin);
  });

  it('burns a merged machine body through one vertex-coloured twin', () => {
    const { mirror } = setup();
    const ram = { ...mote('r'), type: 'ram' };
    mirror.update([ram], 0, 0);
    const view = mirror.views.get('r');
    mirror.markDead(ram);
    mirror.update([], 0, 0);

    const twin = view.dissolve.twins.get(mirror.machineMaterial);
    expect(twin.vertexColors).toBe(true);
    // the merged body only: lens and core are glow-batch instances
    expect(view.dissolve.twins.size).toBe(1);
    expect(view.dissolve.sources.indexOf(mirror.machineMaterial)).toBe(0);
  });

  it('burns a killed rock as a plain mesh in its look and frees its instance', () => {
    const { mirror } = setup();
    const enemy = {
      id: 'r',
      type: 'asteroid',
      variant: 'gold',
      x: 450,
      y: 320,
      radius: 24,
      getHitFlash: () => 0,
    };
    mirror.update([enemy], 0, 0);
    const view = mirror.views.get('r');
    const mesh = mirror.rocks.meshes[view.family][view.shape];
    expect(mesh.count).toBe(1);

    mirror.markDead(enemy);
    mirror.update([], 0, 0);
    expect(mesh.count).toBe(0);
    expect(pooled(mirror, view)).toBe(true);
    expect(mirror.dissolve.count).toBe(1);
    const burn = mirror.dissolve.slots.find((slot) => slot.view).view;
    expect(burn.kind).toBe('asteroid-burn');
    expect(burn.object.visible).toBe(true);
    expect(burn.object.geometry).toBe(view.object.geometry);
    expect(burn.object.position.equals(view.object.position)).toBe(true);
    expect(burn.object.material).not.toBe(burn.material); // its twin
    expect(burn.object.material.color.equals(view.rock.base)).toBe(true);
    const { uVein } = burn.material.userData.rockUniforms;
    expect(uVein.value.equals(view.rock.vein)).toBe(true);

    mirror.update([], 0, DISSOLVE_SECONDS);
    expect(burn.object.visible).toBe(false);
    expect(pooled(mirror, burn)).toBe(true);
  });

  it('caps concurrent burns, ending the oldest first', () => {
    const { mirror } = setup();
    const enemies = [];
    for (let i = 0; i <= DISSOLVE_CAP; i += 1) enemies.push(mote(`m${i}`, i));
    mirror.update(enemies, 0, 0);
    const first = mirror.views.get('m0');
    const second = mirror.views.get('m1');

    enemies.forEach((enemy, i) => {
      mirror.markDead(enemy);
      mirror.update(enemies.slice(i + 1), 0, 0.001);
    });
    expect(mirror.dissolve.count).toBe(DISSOLVE_CAP);
    expect(pooled(mirror, first)).toBe(true);
    expect(first.object.visible).toBe(false);
    expect(pooled(mirror, second)).toBe(false);
  });

  it('reset clears every burn and pending death', () => {
    const { mirror } = setup();
    const enemies = [mote('a'), mote('b')];
    mirror.update(enemies, 0, 0);
    mirror.markDead(enemies[0]);
    mirror.update([enemies[1]], 0, 0);
    mirror.markDead(enemies[1]);
    mirror.clear();
    expect(mirror.dissolve.count).toBe(0);
    expect(mirror.dead.size).toBe(0);
    expect(mirror.views.size).toBe(0);
    expect(mirror.pools.get('drone')).toHaveLength(2);
  });
});
