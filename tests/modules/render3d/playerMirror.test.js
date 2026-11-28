import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import { TURRET_BARREL_LENGTH } from '../../../src/data/constants/physics.js';
import {
  ALL_HULLS,
  bastion,
  defaultHull,
  solarSlicer,
} from '../../../src/data/shipModels.js';
import CombatSystem from '../../../src/modules/CombatSystem.js';
import PlayerSystem from '../../../src/modules/PlayerSystem.js';
import { HALF_H, HALF_W } from '../../../src/modules/render3d/batches.js';
import { BREAK_SECONDS } from '../../../src/modules/render3d/dissolve.js';
import { PlayerMirror } from '../../../src/modules/render3d/playerMirror.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';
import { createCanvasDocumentStub } from '../../__helpers__/stubs.js';
import {
  cleanupGlobalState,
  setupGlobalMocks,
} from '../../__helpers__/setup.js';
import THREE from '../../../src/modules/render3d/three.js';

const ribbons = { px: [], py: [], polyline: vi.fn() };

function mirrorFor(hull) {
  const player = new PlayerSystem({
    eventBus: createEventBusMock(),
    input: { takeStepFrame: () => ({}) },
  });
  player.noseAim = false; // the Auto Turret taken: the turret on its pivot
  player.setHull(hull);
  const mirror = new PlayerMirror(THREE, new THREE.Scene(), (fn) => fn());
  mirror.update(player, ribbons, 0);
  return { player, mirror };
}

describe('PlayerMirror', () => {
  beforeEach(() => {
    setupGlobalMocks();
    // the hull's livery paints in a canvas
    vi.stubGlobal('document', createCanvasDocumentStub());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanupGlobalState();
  });

  it('burns cyan on the Interceptor and amber on the Solar Slicer', () => {
    const cyan = mirrorFor(defaultHull).mirror.flameMaterial.color;
    const amber = mirrorFor(solarSlicer).mirror.flameMaterial.color;
    expect(cyan.b).toBeGreaterThan(cyan.r);
    expect(amber.r).toBeGreaterThan(amber.b);
  });

  it('builds the Solar Slicer with amber-edged blades and a low turret', () => {
    const named = (mirror, name) =>
      mirror.ship.children.filter((child) => child.name === name);
    const interceptor = mirrorFor(defaultHull).mirror;
    expect(named(interceptor, 'bladeEdge')).toHaveLength(0);
    expect(interceptor.turretHousing.visible).toBe(true);
    expect(interceptor.turretHousingLow.visible).toBe(false);

    const slicer = mirrorFor(solarSlicer).mirror;
    const edges = named(slicer, 'bladeEdge');
    expect(edges).toHaveLength(1);
    // both blades edged: segments on either side of the spine
    const position = edges[0].geometry.getAttribute('position');
    const sides = new Set();
    for (let i = 0; i < position.count; i += 1) {
      sides.add(Math.sign(position.getZ(i)));
    }
    expect(sides).toEqual(new Set([-1, 1]));
    const { r, b } = edges[0].material.color;
    expect(r).toBeGreaterThan(b);
    expect(slicer.flames).toHaveLength(2);
    expect(slicer.turretHousing.visible).toBe(false);
    expect(slicer.turretHousingLow.visible).toBe(true);
    expect(slicer.barrels.position.y).toBeLessThan(0);
  });

  it('builds the Bastion with amber-trimmed armour on darker steel', () => {
    const named = (mirror, name) =>
      mirror.ship.children.filter((child) => child.name === name);
    const bastionMirror = mirrorFor(bastion).mirror;
    const trims = named(bastionMirror, 'bladeEdge');
    expect(trims).toHaveLength(1);
    const { r, b } = trims[0].material.color;
    expect(r).toBeGreaterThan(b);
    // the trim sits on top of the armour, above every fin plate
    const position = trims[0].geometry.getAttribute('position');
    const sides = new Set();
    for (let i = 0; i < position.count; i += 1) {
      sides.add(Math.sign(position.getZ(i)));
      expect(position.getY(i)).toBeGreaterThan(4.5);
    }
    expect(sides).toEqual(new Set([-1, 1]));
    expect(bastionMirror.turretHousing.visible).toBe(true);

    const darkest = (mirror) => {
      const color = mirror.ship
        .getObjectByName('hull')
        .geometry.getAttribute('color');
      let max = 0;
      for (let i = 0; i < color.count; i += 1) {
        max = Math.max(max, color.getX(i));
      }
      return max;
    };
    expect(darkest(bastionMirror)).toBeLessThan(
      darkest(mirrorFor(defaultHull).mirror)
    );
  });

  it('builds the Interceptor in plates, its wingtips following the RCS upgrade', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const stock = mirror.puffs
      .filter(({ size }) => size === 1)
      .map(({ puff }) => Math.abs(puff.position.z));
    expect(stock).toHaveLength(2);
    // lit leading edges, one per wing
    const edge = mirror.ship.children.find((child) => child.name === 'edge');
    expect(edge.geometry.getAttribute('position').count).toBe(4);

    const grown = player.getHullGeometry(defaultHull, { rcs: 3 });
    const span = Math.max(...grown.rcsPorts.map((port) => Math.abs(port.y)));
    expect(span).toBeGreaterThan(stock[0]);
  });

  it("draws each hull's static plates as one vertex-coloured mesh", () => {
    [defaultHull, solarSlicer, bastion].forEach((hull) => {
      const { mirror } = mirrorFor(hull);
      const solids = mirror.ship.children.filter((child) =>
        [child.material].flat().includes(mirror.hullMaterial)
      );
      expect(
        solids.map((mesh) => mesh.name),
        hull.id
      ).toEqual(['hull']);
      expect(solids[0].geometry.getAttribute('color')).toBeDefined();
      expect(mirror.hullMaterial.vertexColors).toBe(true);
      let meshes = 0;
      let lines = 0;
      mirror.ship.traverse((object) => {
        if (object.isMesh) meshes += 1;
        if (object.isLineSegments) lines += 1;
      });
      // hull + canopy + per nozzle (throat, flame, core) + one puff per
      // wingtip port + the two nose jets + the two retro flames + the six
      // sputter embers + the navigation lights (one per wingtip, the strobe,
      // the sensor's glow)
      const { nozzles, rcsPorts } = mirror.geometry;
      expect(meshes, hull.id).toBe(
        2 +
          3 * nozzles.length +
          rcsPorts.length +
          2 +
          2 +
          6 +
          rcsPorts.length +
          2
      );
      expect(lines, hull.id).toBeLessThanOrEqual(3);
    });
  });

  it("wears each hull's own livery, never on the turret, and flashes its strobe", () => {
    const { player, mirror } = mirrorFor(bastion);
    const bastionCoat = mirror.livery.uLivery.value;
    expect(bastionCoat.isTexture).toBe(true);
    expect(mirror.hullMaterial.userData.livery).toBe(mirror.livery);
    expect(mirror.turretMaterials[0].userData.livery).toBeNull();
    player.setHull(defaultHull);
    mirror.update(player, ribbons, 0.5);
    expect(mirror.livery.uLivery.value).not.toBe(bastionCoat);
    expect(mirror.strobe.visible).toBe(false);
    mirror.update(player, ribbons, 1.21);
    expect(mirror.strobe.visible).toBe(true);
  });

  it('caches the merged hull and shares its buffers with the dash ghosts', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const hull = mirror.ship.getObjectByName('hull').geometry;
    const ghost = mirror.ghosts[0].geometry;
    mirror.ghosts.forEach((g) => expect(g.geometry).toBe(ghost));
    expect(ghost.getAttribute('position')).toBe(hull.getAttribute('position'));
    expect(ghost.drawRange.count).toBeLessThan(
      hull.getAttribute('position').count
    );

    player.setHull(solarSlicer);
    mirror.update(player, ribbons, 0);
    expect(mirror.ship.getObjectByName('hull').geometry).not.toBe(hull);
    player.setHull(defaultHull);
    mirror.update(player, ribbons, 0);
    expect(mirror.ship.getObjectByName('hull').geometry).toBe(hull);
  });

  it('rim-lights the hull material and carries no flat shield ring', () => {
    const { mirror } = mirrorFor(defaultHull);
    expect(mirror.hullMaterial.userData.rimBase).toBeDefined();
    expect(mirror.shield).toBeUndefined();
    expect(mirror.shieldRadius).toBeGreaterThan(0);
  });

  it('lights the turn couple: a nose swinging to starboard shows the starboard wingtip and the port nose jet', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    player.thrusters.lastThrusterState.turnR = 1;
    mirror.update(player, ribbons, 0);
    const shown = mirror.puffs
      .filter(({ puff }) => puff.visible)
      .map(({ puff }) => ({
        fore: puff.position.x > 0,
        starboard: puff.position.z > 0,
      }));
    expect(shown).toEqual(
      expect.arrayContaining([
        { fore: false, starboard: true },
        { fore: true, starboard: false },
      ])
    );
    expect(shown).toHaveLength(2);
  });

  it('lights the mirrored couple on a port turn, with a twin needle from RCS level 3', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const turnLeft = (level) => {
      player.thrusters.rcsVisualLevel = level;
      player.thrusters.lastThrusterState.turnL = 1;
      mirror.update(player, ribbons, 0);
      return mirror.puffs.filter(({ puff }) => puff.visible);
    };
    const stock = turnLeft(0);
    expect(
      stock.map(({ puff }) => ({
        fore: puff.position.x > 0,
        starboard: puff.position.z > 0,
      }))
    ).toEqual(
      expect.arrayContaining([
        { fore: false, starboard: false },
        { fore: true, starboard: true },
      ])
    );
    expect(stock).toHaveLength(2);
    expect(stock.every(({ twin }) => twin === null)).toBe(true);

    const upgraded = turnLeft(3);
    expect(upgraded).toHaveLength(2);
    expect(upgraded.every(({ twin }) => twin.visible)).toBe(true);
  });

  it('makes the main flame longer and tighter per Propulsors level, with pressure diamonds only at 5', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const flames = [0, 1, 3, 5].map((level) => {
      player.thrusters.thrusterVisualLevel = level;
      mirror.update(player, ribbons, 0);
      mirror.lightEngines(1, level, 0);
      const { flame, shocks } = mirror.flames[0];
      return { length: flame.scale.x, width: flame.scale.y, shocks };
    });
    for (let i = 1; i < flames.length; i += 1) {
      expect(flames[i].length).toBeGreaterThan(flames[i - 1].length);
      expect(flames[i].width).toBeLessThan(flames[i - 1].width);
    }
    expect(flames.map(({ shocks }) => shocks.length)).toEqual([0, 0, 0, 3]);
    expect(flames[3].shocks.every((shock) => shock.visible)).toBe(true);
  });

  it('overshoots the flame leaving rest and settles at cruise', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const flameAt = (speed) => {
      player.angle = 0;
      player.velocity.vx = speed;
      player.velocity.vy = 0;
      player.enginesIdle = false;
      player.thrusters.lastThrusterState.main = 1;
      for (let i = 0; i < 30; i += 1) mirror.update(player, ribbons, 0);
      return mirror.flames[0].flame.scale.x;
    };
    const cruise = player.flight.acceleration / player.flight.baseLinearDamping;
    expect(flameAt(0)).toBeGreaterThan(1.8 * flameAt(cruise));
  });

  it("shapes each hull's flame by its hull data", () => {
    const flameOf = (hull) => {
      const { mirror } = mirrorFor(hull);
      mirror.lightEngines(1, 0, 0);
      const { flame, r } = mirror.flames[0];
      return { length: flame.scale.x, width: flame.scale.y / (r * 0.95) };
    };
    const stock = flameOf(defaultHull);
    [defaultHull, solarSlicer, bastion].forEach((hull) => {
      const { length, width } = flameOf(hull);
      expect(length / stock.length, hull.id).toBeCloseTo(
        hull.visual.flame.length,
        6
      );
      expect(width, hull.id).toBeCloseTo(hull.visual.flame.width, 6);
    });
    expect(bastion.visual.flame.width).toBeGreaterThan(1);
    expect(solarSlicer.visual.flame.length).toBeGreaterThan(1);
  });

  it('sputters and drops embers only under a third of the hull, also at rest', () => {
    const { mirror } = mirrorFor(defaultHull);
    const watch = (main, hull) => {
      let cuts = 0;
      let embers = 0;
      for (let t = 0; t < 3; t += 1 / 60) {
        mirror.lightEngines(main, 0, t, { hull });
        if (main > 0 && !mirror.flames[0].flame.visible) cuts += 1;
        embers += mirror.embers.filter((ember) => ember.visible).length;
      }
      return { cuts, embers };
    };
    expect(watch(1, 0.4)).toEqual({ cuts: 0, embers: 0 });
    const failing = watch(1, 0.2);
    expect(failing.cuts).toBeGreaterThan(0);
    expect(failing.embers).toBeGreaterThan(0);
    expect(watch(0, 0.2).embers).toBeGreaterThan(0);
  });

  it('burns the turn jets and the retro as hard as the pilot pushes; a full key burns full', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const at = (turn, aux) => {
      player.thrusters.lastThrusterState.turnR = turn;
      player.thrusters.lastThrusterState.aux = aux;
      for (let i = 0; i < 30; i += 1) mirror.update(player, ribbons, 0);
      return {
        jet: mirror.rcsJets.turnR.material.opacity,
        retro: mirror.retroMaterial.opacity,
      };
    };
    expect(at(1, 1)).toEqual({ jet: 1, retro: 1 });
    // The Modern flight's whole retro share, on a key.
    expect(at(1, 0.7).retro).toBeCloseTo(1, 2);
    const part = at(0.3, 0.3);
    expect(part.jet).toBeCloseTo(0.3, 2);
    expect(part.retro).toBeCloseTo(0.3 / 0.7, 2);
    expect(at(0.6, 0.6).retro).toBeGreaterThan(part.retro + 0.3);
  });

  it("lights a whole flank's jets, fore and aft, for the auto-brake's push across the hull", () => {
    const { player, mirror } = mirrorFor(defaultHull);
    player.thrusters.lastThrusterState.brakeStarboard = 0.5;
    mirror.update(player, ribbons, 0);
    const shown = mirror.puffs
      .filter(({ puff }) => puff.visible)
      .map(({ puff }) => ({
        fore: puff.position.x > 0,
        starboard: puff.position.z > 0,
      }));
    expect(shown).toEqual(
      expect.arrayContaining([
        { fore: false, starboard: true },
        { fore: true, starboard: true },
      ])
    );
    expect(shown).toHaveLength(2);
  });

  it('lights the retro flames with the brake, longer and doubled with the Braking System', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const retrosAt = (level, aux) => {
      player.thrusters.brakingVisualLevel = level;
      player.thrusters.lastThrusterState.aux = aux;
      for (let i = 0; i < 30; i += 1) mirror.update(player, ribbons, 0);
      return mirror.retros;
    };
    expect(retrosAt(0, 0).some(({ mesh }) => mesh.visible)).toBe(false);
    const stock = retrosAt(0, 1);
    expect(stock).toHaveLength(2);
    expect(stock.every(({ mesh }) => mesh.visible)).toBe(true);
    const stockLength = stock[0].mesh.scale.x;
    const upgraded = retrosAt(2, 1);
    expect(upgraded).toHaveLength(4);
    expect(upgraded[0].mesh.scale.x).toBeGreaterThan(stockLength);
  });

  it('draws nothing at the engines of an idle ship on a full hull', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const engines = [
      ...mirror.flames.flatMap(({ flame, core }) => [flame, core]),
      ...mirror.embers,
      ...mirror.puffs.map(({ puff }) => puff),
      ...mirror.retros.map(({ mesh }) => mesh),
    ];
    for (let t = 0; t < 4; t += 0.1) {
      mirror.update(player, ribbons, t);
      expect(engines.filter((mesh) => mesh.visible)).toEqual([]);
      expect(mirror.light.intensity).toBe(0);
      expect(mirror.nozzleMaterial.color.r).toBeCloseTo(mirror.accent.r * 0.5);
      expect(mirror.nozzleMaterial.color.b).toBeCloseTo(mirror.accent.b * 0.5);
    }
  });

  it('rolls toward the lit turn couple or flank and pitches with the engine, then settles level', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const jets = player.thrusters.lastThrusterState;
    const deg = (d) => (d * Math.PI) / 180;
    let time = 0;
    const fly = (state) => {
      Object.assign(jets, state);
      for (let i = 0; i < 120; i += 1) {
        time += 1 / 60;
        mirror.update(player, ribbons, time);
      }
      return [mirror.group.rotation.x, mirror.group.rotation.z];
    };
    const [roll, nose] = fly({ turnR: 1, main: 1 });
    expect(roll).toBeCloseTo(deg(25), 3);
    expect(nose).toBeCloseTo(deg(8), 3);
    // a flank pushing to port leans the hull to port; the retro dips the nose
    const [lean, dip] = fly({ turnR: 0, main: 0, brakeStarboard: 1, aux: 1 });
    expect(lean).toBeCloseTo(deg(-20), 3);
    expect(dip).toBeCloseTo(deg(-8), 3);
    const level = fly({ brakeStarboard: 0, aux: 0 });
    expect(level.map(Math.abs).every((a) => a < 1e-3)).toBe(true);
  });

  it('holds a ship posed by a cinematic level and dark, whatever the pilot holds', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const lit = [
      ...mirror.flames.flatMap(({ flame, core }) => [flame, core]),
      ...mirror.puffs.map(({ puff }) => puff),
      ...mirror.retros.map(({ mesh }) => mesh),
      mirror.flareFan,
    ];
    player.enginesIdle = false;
    Object.assign(player.thrusters.lastThrusterState, {
      main: 1,
      turnR: 1,
      aux: 1,
    });
    for (let i = 0; i < 60; i += 1) {
      const time = i / 60;
      mirror.update(player, ribbons, time);
      mirror.flashMuzzle();
      mirror.still(time);
      expect(lit.filter((mesh) => mesh.visible)).toEqual([]);
      expect(mirror.light.intensity).toBe(0);
      expect(mirror.group.rotation.x).toBe(0);
      expect(mirror.group.rotation.z).toBe(0);
    }
    // the pilot's own flame was lit under it
    mirror.update(player, ribbons, 1);
    expect(mirror.flames[0].flame.visible).toBe(true);
  });

  it('springs the barrels back from a shot while the hull gives against it and returns, never jumping', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const rest = mirror.barrels.position.x;
    const hullOff = () => [
      mirror.group.position.x - (player.position.x - HALF_W),
      mirror.group.position.z - (player.position.y - HALF_H),
    ];
    let time = 0;
    const step = (frames = 1) => {
      for (let i = 0; i < frames; i += 1) {
        time += 1 / 60;
        mirror.update(player, ribbons, time);
      }
    };
    step();
    mirror.flashMuzzle();
    mirror.recoilToward(player, 1, 0, player.position);
    step();
    expect(mirror.barrels.position.x).toBeCloseTo(rest - 1.7, 5);
    expect(mirror.ship.position.x).toBe(0);
    step(3);
    const [back, side] = hullOff();
    expect(back).toBeLessThan(-1);
    expect(Math.abs(side)).toBeLessThan(1e-6);
    step(60);
    expect(mirror.barrels.position.x).toBeCloseTo(rest, 2);
    expect(Math.abs(hullOff()[0])).toBeLessThan(0.02);
    // a shot every frame: the kicks pile up to a cap, never further
    for (let i = 0; i < 60; i += 1) {
      mirror.recoilToward(player, 1, 0, player.position);
      step();
      expect(Math.hypot(...hullOff())).toBeLessThanOrEqual(1.5 + 1e-9);
    }
  });

  it('keeps the hull still and level under reduced motion and takes no kick from a shard fired away from the ship', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const rest = mirror.barrels.position.x;
    player.thrusters.lastThrusterState.turnR = 1;
    let time = 0;
    for (let i = 0; i < 30; i += 1) {
      if (i === 10) mirror.recoilToward(player, 0, 1, player.position);
      time += 1 / 60;
      mirror.update(player, ribbons, time, 0, true);
      if (i === 10) expect(mirror.barrels.position.x).toBeLessThan(rest - 1);
      expect(mirror.group.position.z).toBeCloseTo(
        player.position.y - HALF_H,
        6
      );
      expect(mirror.group.rotation.x).toBe(0);
    }
    // a Scrap Rounds shard leaves its rock, far from the ship
    const shard = { x: player.position.x + 200, y: player.position.y };
    for (let i = 0; i < 30; i += 1) {
      if (i === 10) mirror.recoilToward(player, 1, 0, shard);
      time += 1 / 60;
      mirror.update(player, ribbons, time);
      if (i >= 10) expect(mirror.barrels.position.x).toBeCloseTo(rest, 2);
    }
  });

  it('shows the dash ring and a brighter rim only through dash i-frames', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const rim = mirror.rim.r + mirror.rim.g + mirror.rim.b;
    player.maneuvers.dashTimer = 0.1;
    player.invulnerableTimer = 0.2;
    mirror.update(player, ribbons, 0.1);
    expect(mirror.dashRing.visible).toBe(true);
    expect(mirror.rim.r + mirror.rim.g + mirror.rim.b).toBeGreaterThan(rim);

    player.maneuvers.dashTimer = 0;
    player.invulnerableTimer = 0;
    mirror.update(player, ribbons, 0.2);
    expect(mirror.dashRing.visible).toBe(false);
    expect(mirror.rim.r + mirror.rim.g + mirror.rim.b).toBeCloseTo(rim, 6);
  });

  it("blinks through a hit's invulnerability but holds steady through the win's", () => {
    const { player, mirror } = mirrorFor(defaultHull);
    player.invulnerableTimer = 1;
    mirror.update(player, ribbons, 0.03);
    expect(mirror.blink.value).toBeGreaterThan(0);

    player.guardSteadily(9);
    mirror.update(player, ribbons, 0.03);
    expect(mirror.blink.value).toBe(0);
  });

  it('draws no afterimage dropped while Blink hides the ship', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const hidden = { x: 100, y: 300, angle: 0, age: 0 };
    player.maneuvers.dashGhosts = [hidden];
    player._quitExplosionHidden = true;
    mirror.update(player, ribbons, 0.05);

    player._quitExplosionHidden = false;
    player.maneuvers.dashGhosts = [
      hidden,
      { x: 140, y: 300, angle: 0, age: 0 },
    ];
    mirror.update(player, ribbons, 0.15);
    expect(mirror.ghosts[0].visible).toBe(false);
    expect(mirror.ghosts[1].visible).toBe(true);
  });

  it('breaks into its own pieces when it dies, its flames out, then hides', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const hull = mirror.ship.children.find((child) => child.name === 'hull');
    const whole = hull.geometry;
    const glass = mirror.ship.children.find(
      (child) => child.material === mirror.canopyMaterial
    );
    const [flame] = mirror.flames;
    player.velocity = { vx: 50, vy: 0 };
    player.markDead();
    mirror.update(player, ribbons, 0.1, 0.016);

    expect(mirror.breaking).toBe(true);
    expect(mirror.group.visible).toBe(true);
    expect(hull.geometry.getAttribute('aPiece')).toBeDefined();
    // the sensor's see-through glass breaks with it
    expect(glass.visible).toBe(true);
    expect(glass.geometry.getAttribute('aPiece')).toBeDefined();
    expect(Array.isArray(hull.material)).toBe(true); // its finishes' twins
    expect(flame.flame.visible).toBe(false);
    expect(hull.castShadow).toBe(false);

    mirror.update(player, ribbons, 2, BREAK_SECONDS);
    expect(mirror.breaking).toBe(false);
    expect(mirror.group.visible).toBe(false);
    expect(hull.geometry).toBe(whole);
    expect(hull.material).toBe(mirror.hullMaterials);
  });

  it('ends the break when a new run brings the ship back', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    player.markDead();
    mirror.update(player, ribbons, 0.1, 0.016);
    player.isDead = false;
    mirror.update(player, ribbons, 0.2, 0.016);
    expect(mirror.breaking).toBe(false);
    expect(mirror.group.visible).toBe(true);
  });

  it('keeps the count of lights shown while Blink hides the ship', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const shown = () => {
      let count = 0;
      mirror.group.parent.traverseVisible((object) => {
        if (object.isPointLight) count += 1;
      });
      return count;
    };
    const before = shown();
    player._quitExplosionHidden = true;
    mirror.update(player, ribbons, 0.05);
    expect(mirror.group.visible).toBe(false);
    expect(shown()).toBe(before);
  });

  it('stacks a thin turret layer per lock past the primary at Targeting Matrix rank 3, each turned onto its lock', () => {
    if (!GamePools.initialized) GamePools.initialize();
    const { player, mirror } = mirrorFor(defaultHull);
    player.multishot = 4;
    // four drones round the ship (400, 300), 150 px out
    const foes = [
      [550, 300],
      [400, 150],
      [250, 300],
      [400, 450],
    ].map(([x, y], i) => ({
      id: `drone-${i}`,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 10,
      health: 100,
      type: 'drone',
    }));
    const eventBus = createEventBusMock();
    const combat = new CombatSystem({
      eventBus,
      player,
      enemies: { forEachActiveEnemy: (callback) => foes.forEach(callback) },
      physics: { forEachBulletCollision: () => {} },
    });
    const play = () => {
      for (let frame = 0; frame < 60; frame += 1) {
        combat.update(1 / 60);
        player.updateTurret(1 / 60);
      }
      mirror.update(player, ribbons, 0);
      return mirror.layers.filter((layer) => layer.group.visible);
    };

    eventBus.emit('upgrade-aiming-suite', { resetWeights: true, level: 1 });
    eventBus.emit('upgrade-aiming-suite', { level: 2 });
    expect(play()).toHaveLength(0);

    eventBus.emit('upgrade-aiming-suite', { level: 3, multiLockTargets: 4 });
    ALL_HULLS.forEach((hull) => {
      player.setHull(hull);
      player.multishot = 4; // a new hull resets the stats
      const shown = play();
      expect(shown, hull.id).toHaveLength(3);
      mirror.group.updateMatrixWorld(true);
      const turretTop = new THREE.Box3().setFromObject(mirror.turret).max.y;
      const tips = shown.map((layer, i) => {
        // the barrel tip sits on the sim's muzzle point toward its own lock
        const tip = layer.group.localToWorld(
          new THREE.Vector3(TURRET_BARREL_LENGTH, 0, 0)
        );
        const muzzle = player.getMuzzlePoint(player.lockAims[i + 1].point);
        expect(tip.x + HALF_W, hull.id).toBeCloseTo(muzzle.x, 2);
        expect(tip.z + HALF_H, hull.id).toBeCloseTo(muzzle.y, 2);
        expect(
          new THREE.Box3().setFromObject(layer.barrel).min.y,
          hull.id
        ).toBeGreaterThan(turretTop);
        return `${Math.round(muzzle.x)},${Math.round(muzzle.y)}`;
      });
      expect(new Set(tips).size, hull.id).toBe(3);
      // every lock line leaves the turret's axis, at its own barrel's height
      const pivot = player.getTurretPivot();
      const heights = [0, 1, 2, 3].map((i) => {
        const from = mirror.lockLineOrigin(i);
        expect(from.x + HALF_W, hull.id).toBeCloseTo(pivot.x, 2);
        expect(from.z + HALF_H, hull.id).toBeCloseTo(pivot.y, 2);
        return from.y;
      });
      expect(heights[1], hull.id).toBeGreaterThan(turretTop);
      expect(heights[3], hull.id).toBeGreaterThan(heights[1]);
    });
    GamePools.releaseAll();
  });

  it('hides the dash ring under a raised shield dome', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    player.shield.isShieldActive = true;
    player.maneuvers.dashTimer = 0.1;
    player.invulnerableTimer = 0.2;
    mirror.update(player, ribbons, 0.1);
    expect(mirror.dashRing.visible).toBe(false);
  });
});
