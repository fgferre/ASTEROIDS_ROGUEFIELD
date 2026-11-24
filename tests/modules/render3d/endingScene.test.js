import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { REVELATION_SHOTS } from '../../../src/core/cinematics.js';
import { EnemyMirror } from '../../../src/modules/render3d/enemyMirror.js';
import {
  EndingScene,
  heroAngle,
  isRevelationBeat,
  shellsAt,
} from '../../../src/modules/render3d/endingScene.js';
import { RING } from '../../../src/modules/render3d/ring/ringShape.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

// Just enough of Renderer3D's kit: a real scene and enemy mirror, the
// backdrop's Ring and place sets as plain parts, a bus.
function kit() {
  const scene = new THREE.Scene();
  const enemies = new EnemyMirror(THREE, scene, (fn) => fn(), {
    spawn: () => {},
    flash: () => {},
  });
  const ring = { object: new THREE.Group(), follow: RING.follow };
  const places = {
    object: new THREE.Group(),
    built: new Map([
      [
        'the-crucible',
        { layers: [{ anchor: [250, -3600, -900], follow: 0.9 }] },
      ],
    ]),
    setFlight: vi.fn(),
  };
  const rock = new THREE.Mesh();
  const player = { group: new THREE.Group() };
  scene.add(ring.object, places.object, rock, player.group);
  const handlers = {};
  const bus = {
    on: (name, fn) => (handlers[name] = fn),
    emit: (name, payload) => handlers[name]?.(payload),
  };
  const t = {
    THREE,
    scene,
    enemies,
    camera: new THREE.PerspectiveCamera(20, 16 / 9, 10, 20000),
    renderer: { toneMappingExposure: 1 },
    backdrop: { ring, places, setWake: vi.fn() },
    space: {},
    key: { target: new THREE.Object3D() },
    debris: { meshes: [], plates: [] },
    wardenLight: new THREE.PointLight(),
    player,
  };
  return { t, bus, rock, ending: new EndingScene(t, bus) };
}

const sovereign = {
  id: 'sovereign',
  type: 'boss',
  bossKind: 'sovereign',
  x: 520,
  y: 240,
  radius: 84,
  order: 'both',
  plateOpen: 0.6,
  plateTurn: 0.4,
  splitAngle: 0,
  getHitFlash: () => 0,
};

describe("the ending's act 1", () => {
  it('shuts Sovereign from its fall, holds it sealed, then opens it past the fight', () => {
    const { sealed } = REVELATION_SHOTS.opens;
    expect(shellsAt(0, 0.6)).toBeCloseTo(0.6);
    expect(shellsAt((sealed * 2) / 3, 0.6)).toBe(0);
    expect(shellsAt(sealed, 0.6)).toBe(0);
    expect(shellsAt(1, 0.6)).toBe(REVELATION_SHOTS.open);
    expect(REVELATION_SHOTS.open).toBeGreaterThan(1);
    // count turns the hero view home from where opens saw it
    expect(heroAngle('opens', 0.7)).toBe(REVELATION_SHOTS.opens.orbit);
    expect(heroAngle('count', 0)).toBe(REVELATION_SHOTS.opens.orbit);
    expect(heroAngle('count', 1)).toBeCloseTo(0);
    expect(isRevelationBeat('known')).toBe(true);
    expect(isRevelationBeat('answer')).toBe(false);
  });

  it('lets Sovereign fall whole: kept for the ending, else burnt in place; a Warden still breaks', () => {
    const bursts = { spawn: vi.fn(), flash: vi.fn() };
    const mirror = new EnemyMirror(
      THREE,
      new THREE.Scene(),
      (fn) => fn(),
      bursts
    );
    const sovereign = (id) => ({
      id,
      type: 'boss',
      bossKind: 'sovereign',
      x: 400,
      y: 300,
      radius: 84,
      order: 'rebuild',
      plateOpen: 1,
      plateTurn: 0,
      splitAngle: 0,
      getHitFlash: () => 0,
    });
    const kept = sovereign('kept');
    mirror.update([kept], 0);
    const view = mirror.views.get('kept');
    const hinge = view.plates[0].hinge.position.x;
    // the ending opens the shells past the fight's widest
    mirror.update([{ ...kept, plateOpen: 1.4 }], 0);
    expect(view.plates[0].hinge.position.x).toBeGreaterThan(hinge);

    mirror.keepFallen = true;
    mirror.markDead(kept);
    mirror.update([], 0);
    expect(mirror.husk).toBe(view);
    expect(view.object.visible).toBe(true);
    expect(mirror.dissolve.slots.some((slot) => slot.view)).toBe(false);
    // the final blow's bursts and flash stay
    expect(bursts.spawn).toHaveBeenCalledTimes(1);
    expect(bursts.flash).toHaveBeenCalledTimes(1);
    mirror.releaseHusk();
    expect(mirror.husk).toBe(null);
    expect(view.object.visible).toBe(false);

    mirror.keepFallen = false;
    const burnt = sovereign('burnt');
    const warden = { ...sovereign('warden'), bossKind: 'warden' };
    mirror.update([burnt, warden], 0);
    mirror.markDead(burnt);
    mirror.markDead(warden);
    mirror.update([], 0);
    const burns = mirror.dissolve.slots.filter((slot) => slot.view);
    const byKind = Object.fromEntries(
      burns.map((slot) => [slot.view.kind, slot.breaks])
    );
    expect(byKind).toEqual({ 'boss-sovereign': false, boss: true });
    expect(mirror.husk).toBe(null);
  });

  it('draws the very view Sovereign fell in, nothing of the fight, and gives everything back for act 2', () => {
    const { t, bus, rock, ending } = kit();
    t.enemies.update([sovereign], 0);
    const view = t.enemies.views.get('sovereign');
    // the simulation's order: the win starts the act before the scene
    // hears of the fall, then the kill lands; the next frame draws it
    expect(ending.start('opens', 6000)).toBe(true);
    bus.emit('boss-defeated', { enemy: sovereign });
    t.enemies.markDead(sovereign);
    ending.frame(t.camera);
    t.enemies.update([], 0);
    ending.pose(1);
    expect(t.enemies.husk).toBe(view);
    expect(view.object.visible).toBe(true);
    expect(ending.centre.toArray()).toEqual([120, 0, -60]);
    expect(ending.boss.plateTurn).toBe(sovereign.plateTurn);
    // the ship stands before it, the field's roots are out of the frame
    expect(t.player.group.visible).toBe(true);
    expect(rock.visible).toBe(false);
    expect(t.backdrop.ring.object.visible).toBe(true);
    expect(t.wardenLight.intensity).toBeGreaterThan(0);
    ending.showField();
    expect(rock.visible).toBe(true);

    // a cut: the Null Boundary's set and look, the Ring held, no Sovereign
    ending.start('rupture', 6000);
    ending.frame(t.camera);
    ending.pose(2);
    expect(t.backdrop.places.setFlight).toHaveBeenLastCalledWith(
      'wardens-reach',
      1,
      0,
      0
    );
    expect(ending.look.to.place).toBe('wardens-reach');
    expect(t.backdrop.ring.follow).toBe(0);
    expect(t.renderer.toneMappingExposure).toBe(1.3);
    expect(view.object.visible).toBe(false);
    expect(t.player.group.visible).toBe(false);

    // act 2 starts: the act's state goes back, Sovereign's view to its pool
    bus.emit('cinematic-started', { kind: 'ending' });
    expect(ending.active).toBe(false);
    expect(rock.visible).toBe(true);
    expect(t.backdrop.places.setFlight).toHaveBeenLastCalledWith(null);
    expect(t.backdrop.ring.follow).toBe(RING.follow);
    expect(t.renderer.toneMappingExposure).toBe(1);
    expect(t.camera.fov).toBe(20);
    expect(t.enemies.husk).toBe(null);
    expect(t.enemies.keepFallen).toBe(false);
  });

  it('holds its last picture under the choice when skipped', () => {
    const { t, bus, ending } = kit();
    ending.start('rupture', 6000);
    ending.frame(t.camera);
    bus.emit('cinematic-ended', { kind: 'revelation' });
    expect(ending.beat).toBe('known');
    expect(ending.progress).toBe(1);
    ending.frame(t.camera);
    expect(t.backdrop.ring.follow).toBe(RING.follow);
  });
});
