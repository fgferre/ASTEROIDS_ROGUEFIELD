import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BREAK_SECONDS,
  DISSOLVE_CAP,
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
  it('burns a killed machine for BREAK_SECONDS, then hides and pools it', () => {
    const { mirror, bursts, pushed } = setup();
    const enemy = mote('a');
    mirror.update([enemy], 0, 0);
    const view = mirror.views.get('a');
    // the drone's look is a recipe: its hull is the body group's first mesh
    const [body] = view.body.children;
    const hull = body.material;

    mirror.markDead(enemy);
    mirror.update([], 0, 0);
    expect(mirror.dissolve.count).toBe(1);
    expect(view.object.visible).toBe(true);
    expect(body.material).not.toBe(hull);
    expect(pooled(mirror, view)).toBe(false);
    bursts.update(0.016);
    expect(pushed.length).toBeGreaterThanOrEqual(8);

    // the id comes back while the husk burns: it gets another view
    mirror.update([mote('a')], 0, BREAK_SECONDS * 0.5);
    expect(mirror.views.get('a')).not.toBe(view);

    mirror.update([], 0, BREAK_SECONDS * 0.6);
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
    mirror.update([], 0, BREAK_SECONDS);
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

  it('breaks a killed machine into its own pieces, flying with the shot', () => {
    const { mirror } = setup();
    const enemy = { ...mote('a'), vx: 30, vy: 0 };
    mirror.update([enemy], 0, 0);
    const view = mirror.views.get('a');
    const [hull, ...glows] = view.body.children.filter((n) => n.isMesh);
    const whole = hull.geometry;
    mirror.killedBy(view, 0, 500);
    mirror.markDead(enemy);
    mirror.update([], 0, 0);

    // every vertex knows its piece; the glowing parts share the hull's pieces
    const piece = hull.geometry.getAttribute('aPiece');
    expect(hull.geometry).not.toBe(whole);
    expect(piece.count).toBe(whole.getAttribute('position').count);
    const centres = (attribute) => {
      const set = new Set();
      for (let v = 0; v < attribute.count; v += 1) set.add(attribute.getW(v));
      return set;
    };
    const pieces = centres(piece);
    expect(pieces.size).toBeGreaterThanOrEqual(9);
    expect(pieces.size).toBeLessThanOrEqual(16);
    glows.forEach((mesh) =>
      centres(mesh.geometry.getAttribute('aPiece')).forEach((w) =>
        expect(pieces.has(w)).toBe(true)
      )
    );
    // carried by its momentum and the shot, in the hull's own frame
    const { uExplode, uExplodePush } = view.dissolve.uniforms;
    expect(uExplode.value).toBeGreaterThan(0);
    const push = uExplodePush.value
      .clone()
      .applyMatrix3(new THREE.Matrix3().setFromMatrix4(hull.matrixWorld));
    expect(push.x).toBeCloseTo(30);
    expect(push.z).toBeCloseTo(24);
    // a breaking machine casts no shadow (the depth pass draws it whole)
    mirror.budgetShadows(400, 300);
    expect(view.casters.some((mesh) => mesh.castShadow)).toBe(false);

    mirror.update([], 0, BREAK_SECONDS);
    expect(hull.geometry).toBe(whole);
    expect(uExplode.value).toBe(0);
  });

  it('lights a big machine’s pieces as they break, then cools them', () => {
    const { mirror } = setup();
    const anvil = { ...mote('v'), type: 'anvil', radius: 26 };
    mirror.update([anvil], 0, 0);
    const view = mirror.views.get('v');
    mirror.markDead(anvil);
    mirror.update([], 0, 0);
    const { uBreakHeat } = view.dissolve.uniforms;
    expect(uBreakHeat.value).toBeGreaterThan(0.5);
    mirror.update([], 0, 0.5);
    expect(uBreakHeat.value).toBe(0);

    const drone = mote('d');
    mirror.update([drone], 0, 0);
    const small = mirror.views.get('d');
    mirror.markDead(drone);
    mirror.update([], 0, 0);
    expect(small.dissolve.uniforms.uBreakHeat.value).toBe(0);
  });

  it('breaks a boss into more pieces than a machine', () => {
    const { mirror } = setup();
    const view = mirror.acquire('boss-choir');
    view.radius = 48;
    const plan = mirror.breakOf(view);
    expect(view.kind).toBe('boss-choir');
    expect(plan.count).toBeGreaterThan(16); // a machine's cap
    expect(plan.heat).toBe(0);
    expect(mirror.breakOf({ kind: 'asteroid', radius: 30 })).toBeNull();
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
