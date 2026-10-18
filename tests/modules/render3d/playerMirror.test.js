import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultHull, solarSlicer } from '../../../src/data/shipModels.js';
import PlayerSystem from '../../../src/modules/PlayerSystem.js';
import { PlayerMirror } from '../../../src/modules/render3d/playerMirror.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';
import {
  cleanupGlobalState,
  setupGlobalMocks,
} from '../../__helpers__/setup.js';

// The vendored r128 build is UMD: evaluated with an `exports` object it
// fills that object instead of a global.
const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const ribbons = { px: [], py: [], polyline: vi.fn() };

function mirrorFor(hull) {
  const player = new PlayerSystem({
    eventBus: createEventBusMock(),
    input: { getMovementInput: () => ({}) },
    'command-queue': null,
  });
  player.setHull(hull);
  const mirror = new PlayerMirror(THREE, new THREE.Scene(), (fn) => fn());
  mirror.update(player, ribbons, 0);
  return { player, mirror };
}

describe('PlayerMirror', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it('burns cyan on the Interceptor and amber on the Solar Slicer', () => {
    const cyan = mirrorFor(defaultHull).mirror.flameMaterial.color;
    const amber = mirrorFor(solarSlicer).mirror.flameMaterial.color;
    expect(cyan.b).toBeGreaterThan(cyan.r);
    expect(amber.r).toBeGreaterThan(amber.b);
  });

  it('lights the side puff on the strafing flank only', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    player.thrusterVisual.sideL = 1;
    player.lastThrusterState.sideL = 1;
    mirror.update(player, ribbons, 0);
    const shown = mirror.puffs.filter(({ puff }) => puff.visible);
    expect(shown.map(({ left }) => left)).toEqual([true]);
  });

  it('banks into a held strafe up to 22°, then relaxes level', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    player.controlScheme = 'modern';
    player.angularVelocity = 0;
    player.lastThrusterState.sideL = 1;
    let time = 0;
    for (let i = 0; i < 120; i += 1) {
      time += 1 / 60;
      mirror.update(player, ribbons, time);
    }
    expect(mirror.group.rotation.x).toBeCloseTo((22 * Math.PI) / 180, 3);

    player.lastThrusterState.sideL = 0;
    for (let i = 0; i < 120; i += 1) {
      time += 1 / 60;
      mirror.update(player, ribbons, time);
    }
    expect(Math.abs(mirror.group.rotation.x)).toBeLessThan(1e-3);
  });

  it('banks only on the yaw rate in classic controls', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    player.controlScheme = 'classic';
    player.lastThrusterState.sideL = 1;
    player.angularVelocity = -100;
    let time = 0;
    for (let i = 0; i < 120; i += 1) {
      time += 1 / 60;
      mirror.update(player, ribbons, time);
    }
    expect(mirror.group.rotation.x).toBeCloseTo((-8 * Math.PI) / 180, 3);
  });

  it('shows the dash ring and a brighter rim only through dash i-frames', () => {
    const { player, mirror } = mirrorFor(defaultHull);
    const rim = mirror.rim.r + mirror.rim.g + mirror.rim.b;
    player.dashTimer = 0.1;
    player.invulnerableTimer = 0.2;
    mirror.update(player, ribbons, 0.1);
    expect(mirror.dashRing.visible).toBe(true);
    expect(mirror.rim.r + mirror.rim.g + mirror.rim.b).toBeGreaterThan(rim);

    player.dashTimer = 0;
    player.invulnerableTimer = 0;
    mirror.update(player, ribbons, 0.2);
    expect(mirror.dashRing.visible).toBe(false);
    expect(mirror.rim.r + mirror.rim.g + mirror.rim.b).toBeCloseTo(rim, 6);
  });
});
