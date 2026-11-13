import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SECTORS } from '../../../src/data/sectors.js';
import { ShipMotion } from '../../../src/modules/render3d/travel/motion.js';
import { ShotPlan } from '../../../src/modules/render3d/travel/shots.js';
import {
  WorldMap,
  placeFrame,
} from '../../../src/modules/render3d/travel/world.js';
import {
  linePauses,
  travelLeg,
} from '../../../src/modules/render3d/travelScene.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const frame = (id) =>
  placeFrame(id, {
    position: new THREE.Vector3(),
    heading: new THREE.Vector3(),
    angle: 0,
  });

// A journey to `to` planned as the scene plans it, landing on the origin
// headed up the field.
function fly(to, durationMs = 9000) {
  const leg = travelLeg(to);
  const map = new WorldMap(THREE).set(frame(leg.to), new THREE.Vector3(), 0);
  const motion = new ShipMotion(THREE);
  motion.plan(
    map,
    frame(leg.from),
    frame(leg.to),
    durationMs,
    leg.jumps ? 0.36 : null,
    !leg.from
  );
  return { leg, map, motion };
}

describe('the journey between sectors', () => {
  it('jumps only into a new chapter and on the opening', () => {
    expect(travelLeg('debris-wake')).toMatchObject({ from: null, jumps: true });
    expect(travelLeg('salvage-lanes').jumps).toBe(false);
    expect(travelLeg('furnace-drift').jumps).toBe(true);
    expect(travelLeg('crystal-choir').jumps).toBe(false);
    expect(travelLeg('the-crucible')).toMatchObject({
      from: 'wardens-reach',
      jumps: true,
    });
  });

  it('places every place once, the place left where it stands when reached', () => {
    const seen = SECTORS.map((s) => frame(s.look.backdrop).position);
    seen.forEach((p, i) =>
      seen
        .slice(i + 1)
        .forEach((q) => expect(p.distanceTo(q)).toBeGreaterThan(500))
    );
    // Salvage Lanes, seen from the journey leaving it and from the one
    // reaching it, is the same spot of the world.
    const out = fly('prime-gate');
    const back = new THREE.Vector3();
    out.map.point(frame('salvage-lanes').position, back);
    const into = fly('salvage-lanes');
    const there = new THREE.Vector3();
    into.map.point(frame('salvage-lanes').position, there);
    expect(there.length()).toBeCloseTo(0, 6);
    // The two maps differ by a turn and a shift only: distances hold.
    const a = new THREE.Vector3();
    out.map.point(frame('debris-wake').position, a);
    const b = new THREE.Vector3();
    into.map.point(frame('debris-wake').position, b);
    expect(a.distanceTo(back)).toBeCloseTo(b.distanceTo(there), 3);
  });

  it('leaves its place at rest nosed as it stood and lands on the spawn headed up the field', () => {
    ['salvage-lanes', 'furnace-drift', 'the-crucible'].forEach((to) => {
      const { leg, map, motion } = fly(to);
      const start = new THREE.Vector3();
      map.point(frame(leg.from).position, start);
      const heading = new THREE.Vector3();
      map.direction(frame(leg.from).heading, heading);
      const p = new THREE.Vector3();
      const f = new THREE.Vector3();
      expect(Math.abs(motion.at(0, p, f))).toBeLessThan(5);
      expect(p.distanceTo(start)).toBeLessThan(1e-3);
      expect(f.dot(heading)).toBeGreaterThan(0.999);
      expect(Math.abs(motion.at(1, p, f))).toBeLessThan(5);
      expect(p.length()).toBeLessThan(1e-2);
      expect(f.z).toBeLessThan(-0.999);
    });
  });

  it('never slides or runs back: speed stays ahead of the nose', () => {
    const { motion } = fly('salvage-lanes');
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const f = new THREE.Vector3();
    for (let t = 0.02; t < 0.98; t += 0.02) {
      motion.at(t, p, f);
      motion.at(t + 0.001, q);
      const step = q.sub(p);
      expect(step.dot(f)).toBeGreaterThan(0);
      expect(step.normalize().dot(f)).toBeGreaterThan(0.95);
    }
  });

  it('holds every shot long enough to read at any length, cutting into pauses', () => {
    [7000, 16000].forEach((durationMs) => {
      ['salvage-lanes', 'furnace-drift'].forEach((to) => {
        const { motion } = fly(to, durationMs);
        const shots = new ShotPlan(THREE);
        shots.plan(motion, durationMs, []);
        const cuts = [0, ...shots.cuts, 1];
        for (let i = 1; i < cuts.length; i += 1) {
          expect((cuts[i] - cuts[i - 1]) * durationMs).toBeGreaterThanOrEqual(
            1199
          );
        }
      });
    });
    const pauses = linePauses([{ text: 'x'.repeat(40) }], 10000);
    expect(pauses[0][0]).toBeCloseTo(0.1);
    expect(pauses[0][1]).toBeCloseTo(0.3);
  });
});
