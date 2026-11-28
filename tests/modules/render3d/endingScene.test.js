import { describe, expect, it, vi } from 'vitest';
import {
  ENDING_SHOTS,
  REVELATION_SHOTS,
} from '../../../src/core/cinematics.js';
import { EnemyMirror } from '../../../src/modules/render3d/enemyMirror.js';
import {
  EndingScene,
  heroAngle,
  isRevelationBeat,
  shellsAt,
} from '../../../src/modules/render3d/endingScene.js';
import { twinAt } from '../../../src/modules/render3d/endingTwin.js';
import { RING } from '../../../src/modules/render3d/ring/ringShape.js';
import {
  STORY_FAR,
  StoryScene,
} from '../../../src/modules/render3d/storyScene.js';
import THREE from '../../../src/modules/render3d/three.js';

// Just enough of Renderer3D's kit: a real scene and enemy mirror, the
// backdrop's Ring and place sets as plain parts (the Crucible's slip a
// plain cradle frame, its lamps, pane and glow), the key and a fill light,
// a bus, and the opening's scene as built (its Wake a plain group, its own
// borrow and giveBack).
function kit() {
  const scene = new THREE.Scene();
  const enemies = new EnemyMirror(THREE, scene, (fn) => fn(), {
    spawn: () => {},
    flash: () => {},
  });
  const ring = {
    object: new THREE.Group(),
    follow: RING.follow,
    offset: new THREE.Vector3(),
    uniforms: {
      uWake: { value: 0 },
      uIdle: { value: new THREE.Color(0.2, 0.3, 0.4) },
    },
    material: { opacity: 1, transparent: false },
  };
  const holder = new THREE.Group();
  const slip = {
    object: new THREE.Group(),
    frame: new THREE.Group(),
    lamps: [new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh()],
    pane: new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial()
    ),
    paneColor: new THREE.Color(1, 0.8, 0.5),
    glow: new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial()
    ),
    glowColor: new THREE.Color(0.5, 0.4, 0.2),
    paneAt: new THREE.Vector3(-100, 80, 60),
  };
  slip.object.visible = false;
  slip.object.add(slip.frame);
  slip.frame.position.set(0, 1100, 2400);
  holder.add(slip.object);
  const crucible = {
    object: new THREE.Group(),
    layers: [{ anchor: [250, -3600, -900], follow: 0.9, holder }],
    ending: vi.fn(),
    slip: vi.fn(() => slip),
  };
  const places = {
    object: new THREE.Group(),
    built: new Map([['the-crucible', crucible]]),
    setFlight: vi.fn(),
  };
  places.object.add(holder);
  const rock = new THREE.Mesh();
  const structures = { group: new THREE.Group() };
  const player = { group: new THREE.Group(), standIn: new THREE.PointLight() };
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-300, 800, 200);
  const fill = new THREE.HemisphereLight(0xffffff, 0x000000, 0.3);
  scene.add(ring.object, structures.group, places.object, rock, player.group);
  scene.add(key, key.target, fill);
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
    renderer: {
      toneMappingExposure: 1,
      compile: vi.fn(),
      setRenderTarget: vi.fn(),
      render: vi.fn(),
    },
    composer: { readBuffer: {} },
    backdrop: {
      ring,
      places,
      structures,
      setWake: vi.fn(),
      applyStructures: vi.fn(),
    },
    space: {},
    key,
    debris: { meshes: [], plates: [] },
    wardenLight: new THREE.PointLight(0xffffff, 0, 420, 2),
    player,
  };
  player.lightEngines = vi.fn();
  player.still = vi.fn();
  const story = Object.create(StoryScene.prototype);
  const engine = () =>
    new THREE.Group().add(
      new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
    );
  Object.assign(story, {
    t,
    scene: new THREE.Scene(),
    build: vi.fn(),
    origin: new THREE.Vector3(),
    hangar: new THREE.Vector3(-260, -90, 0),
    sky: { place: vi.fn() },
    signal: { visible: true },
    bay: new THREE.PointLight(0xbfd8ff, 0, 900, 2),
    wake: {
      group: new THREE.Group(),
      lights: { engines: [engine(), engine(), engine()] },
    },
    rig: { sun: { shadow: { needsUpdate: false } } },
  });
  const ending = new EndingScene(t, bus, story);
  ending.warm(() => {});
  return { t, bus, rock, crucible, slip, fill, ending, story };
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
    // the ship stands before it, level and dark, the field's roots out
    expect(t.player.group.visible).toBe(true);
    expect(t.player.still).toHaveBeenCalledWith(1);
    expect(t.player.standIn.visible).toBe(false);
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
    // its stand-in light keeps the count of lights the programs were built for
    expect(t.player.standIn.visible).toBe(true);

    // a reset gives everything back, Sovereign's view to its pool
    ending.stop();
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

  it("answers from act 1's last picture, Sovereign still open, the Ring's wake going to the ending's", () => {
    const { t, bus, crucible, slip, ending } = kit();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    ending.start('known', 5000);
    ending.frame(t.camera);
    // act 1 over: known held under the choice, nothing built there
    bus.emit('cinematic-ended', { kind: 'revelation' });
    expect(crucible.slip).toHaveBeenCalledTimes(1);
    expect(slip.object.visible).toBe(false);
    ending.frame(t.camera);
    const known = t.camera.position.clone();
    const knownTurn = t.camera.quaternion.clone();
    const knownFov = t.camera.fov;

    bus.emit('cinematic-started', { kind: 'ending' });
    expect(ending.active).toBe(true);
    ending.start('answer', 6000, 'stewardship');
    ending.frame(t.camera);
    ending.pose(1);
    expect(t.camera.position.distanceTo(known)).toBeLessThan(1e-6);
    expect(t.camera.quaternion.angleTo(knownTurn)).toBeLessThan(1e-6);
    expect(t.camera.fov).toBe(knownFov);
    expect(t.backdrop.setWake).toHaveBeenLastCalledWith(1);
    expect(crucible.ending).toHaveBeenLastCalledWith(true);
    expect(t.enemies.husk.object.visible).toBe(true);
    expect(ending.boss.plateOpen).toBe(REVELATION_SHOTS.open);

    now.mockReturnValue(7000);
    ending.frame(t.camera);
    expect(t.backdrop.setWake).toHaveBeenLastCalledWith(1.25);
    expect(t.camera.fov).toBe(ENDING_SHOTS.answer.fov);
    expect(t.camera.position.y).toBeGreaterThan(known.y);
    now.mockRestore();
  });

  it("goes home into the opening's scene, borrowing the Ring and the ship, and gives them back for the last image", () => {
    const { t, crucible, ending, story } = kit();
    const engines = story.wake.lights.engines;
    const level = (i) => engines[i].children[0].material.color.r;
    ending.start('answer', 6000, 'severance');
    ending.frame(t.camera);
    ending.start('home', 4000, 'severance');
    ending.frame(t.camera);
    ending.pose(1);
    // the opening's scene in the field's place, its first shot's lens
    expect(ending.scene).toBe(story.scene);
    expect(t.backdrop.ring.object.parent).toBe(story.scene);
    expect(t.player.group.parent).toBe(story.scene);
    expect(t.camera.fov).toBe(36);
    expect(t.camera.far).toBe(STORY_FAR);
    expect(t.backdrop.ring.follow).toBe(0);
    // in the run's own look, as its launch told the opening
    expect(ending.look).toBeNull();
    expect(story.signal.visible).toBe(false);
    [0, 1, 2].forEach((i) => expect(level(i)).toBe(1));
    // the horizon Ring lit; the Crucible's left as the answer left it
    expect(t.backdrop.ring.uniforms.uWake.value).toBe(1);
    expect(t.backdrop.setWake).toHaveBeenLastCalledWith(0);
    expect(crucible.ending).toHaveBeenLastCalledWith(true);
    expect(t.player.group.visible).toBe(false);

    // depart: the Wake turned and under way, the Ring dark
    ending.start('depart', 6000, 'severance');
    ending.hold('depart', 6000, 1);
    ending.frame(t.camera);
    ending.pose(2);
    expect(story.wake.group.rotation.y).toBeGreaterThan(0.5);
    expect(story.wake.group.position.length()).toBeGreaterThan(0);
    expect(t.backdrop.ring.uniforms.uWake.value).toBe(0);
    expect(t.backdrop.ring.uniforms.uIdle.value.r).toBe(0);

    // the last image: all of it back where it was
    ending.start('twin', 7000, 'severance');
    ending.frame(t.camera);
    expect(ending.scene).toBe(null);
    expect(t.backdrop.ring.object.parent).toBe(t.scene);
    expect(t.player.group.parent).toBe(t.scene);
    expect(t.backdrop.ring.offset.length()).toBe(0);
    expect(t.backdrop.ring.object.scale.x).toBe(1);
    expect(t.backdrop.ring.uniforms.uIdle.value.r).toBeCloseTo(0.2);
    expect(t.backdrop.applyStructures).toHaveBeenCalled();
    expect(t.camera.far).toBe(20000);
    expect(story.wake.group.rotation.y).toBe(0);
    expect(story.wake.group.position.length()).toBe(0);
    expect(story.signal.visible).toBe(true);
    ending.stop();
    expect(t.backdrop.ring.object.parent).toBe(t.scene);
  });

  it('puts the opening back on a reset from any beat at home', () => {
    const { t, ending, story } = kit();
    ending.start('return', 6000, 'severance');
    ending.hold('return', 6000, 0.9);
    ending.frame(t.camera);
    ending.pose(1);
    expect(t.player.group.visible).toBe(true);
    expect(story.bay.intensity).toBeGreaterThan(0);
    ending.stop();
    expect(ending.scene).toBe(null);
    expect(t.player.group.parent).toBe(t.scene);
    expect(t.backdrop.ring.object.parent).toBe(t.scene);
    expect(t.backdrop.ring.follow).toBe(RING.follow);
    expect(story.bay.intensity).toBe(0);
    expect(t.camera.far).toBe(20000);
    expect(t.camera.fov).toBe(20);
  });

  it("builds the last image on the loading screen on the opening's Wake, compiled and drawn once unculled, then hidden", () => {
    const { t, crucible, slip, rock, story } = kit();
    const ending = new EndingScene(t, { on: () => {} }, story);
    const shown = [];
    const drawn = [];
    t.renderer.render.mockImplementation(() =>
      drawn.push([slip.object.visible, rock.visible, slip.frame.frustumCulled])
    );
    ending.warm(() => shown.push(slip.object.visible), true);
    expect(crucible.slip).toHaveBeenLastCalledWith(story.wake);
    expect(shown).toEqual([true]);
    // the scene as it stands, the slip unculled, into the composer's target
    expect(drawn).toEqual([[true, true, false]]);
    expect(t.renderer.setRenderTarget).toHaveBeenCalledWith(
      t.composer.readBuffer
    );
    expect(slip.object.visible).toBe(false);
    expect(rock.visible).toBe(true);
    expect(slip.frame.frustumCulled).toBe(true);
  });

  it('goes on from what the answer left: Severance dark, its lamps out from the farthest and the window last; Stewardship lit to the cut', () => {
    const ms = 7000;
    const at = (u, ending) => ({ ...twinAt(u, ending, ms) });
    // Severance: the Crucible severed throughout, the lamps all lit first
    const out = [0, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 1].map((u) =>
      at(u, 'severance')
    );
    out.forEach((f) => expect(f.wake).toBe(0));
    expect(out[0]).toMatchObject({ on: 0, off: 1, window: 1 });
    // the farthest go first (the lit run starts later along the arc)
    expect(out[2].on).toBeGreaterThan(0);
    expect(out[2].on).toBeLessThan(1);
    const lampsOut = out.findIndex((f) => f.on === 1);
    const windowOut = out.findIndex((f) => f.window === 0);
    expect(lampsOut).toBeLessThan(windowOut);
    expect(out[windowOut].black).toBe(false);
    expect(out[windowOut].exposure).toBeGreaterThan(0);
    expect(out.at(-1)).toMatchObject({ exposure: 0, black: true });
    // Stewardship: plated throughout, the lamps lit from the farthest
    const lit = [0, 0.5, 0.95, 1].map((u) => at(u, 'stewardship'));
    lit.forEach((f) => expect(f.wake).toBe(1.25));
    expect(lit[0]).toMatchObject({ on: 0, off: 0, window: 1 });
    expect(lit[1].off).toBeGreaterThan(0);
    expect(lit[2]).toMatchObject({ off: 1, window: 1, black: false });
    expect(lit[3].black).toBe(true);
    // the camera holds, then pushes in
    expect(at(0.2, 'severance').push).toBe(0);
    expect(at(0.6, 'severance').push).toBeGreaterThan(0);
    expect(at(1, 'severance').push).toBe(1);
  });

  it('shows the slip only in the last image, black after the act until a reset gives everything back', () => {
    const { t, bus, rock, crucible, slip, fill, ending } = kit();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    ending.start('twin', 7000, 'severance');
    ending.frame(t.camera);
    ending.pose(1);
    expect(slip.object.visible).toBe(true);
    expect(slip.lamps.every((lamp) => lamp.visible)).toBe(true);
    expect(slip.pane.visible).toBe(true);
    // the star below is the key light, every other light off; back after
    expect(t.key.position.y).toBeLessThan(t.key.target.position.y);
    expect(fill.intensity).toBe(0);
    expect(t.enemies.husk.object.visible).toBe(false);
    expect(t.player.group.visible).toBe(false);
    // the Crucible's arcs and star, no Ring
    expect(t.backdrop.places.object.visible).toBe(true);
    expect(t.backdrop.ring.object.visible).toBe(false);
    expect(t.backdrop.structures.group.visible).toBe(false);
    ending.showField();
    expect(t.key.position.toArray()).toEqual([-300, 800, 200]);
    expect(t.key.intensity).toBe(1.6);
    expect(fill.intensity).toBe(0.3);

    // its end (or a skip): the black holds, nothing of the scene drawn
    bus.emit('cinematic-ended', { kind: 'ending' });
    ending.frame(t.camera);
    ending.pose(2);
    expect(ending.black).toBe(true);
    expect(slip.pane.visible).toBe(false);
    expect(ending.scene).not.toBe(t.scene);
    expect(ending.scene.children).toHaveLength(0);
    ending.showField();

    ending.stop();
    expect(slip.object.visible).toBe(false);
    expect(crucible.ending).toHaveBeenLastCalledWith(false);
    expect(t.backdrop.ring.object.visible).toBe(true);
    expect(t.renderer.toneMappingExposure).toBe(1);
    expect(ending.black).toBe(false);
    expect(ending.scene).toBe(null);
    expect(rock.visible).toBe(true);
    now.mockRestore();
  });
});
