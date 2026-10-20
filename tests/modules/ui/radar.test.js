import { describe, expect, it } from 'vitest';
import {
  RADAR_BUDGET,
  RADAR_RESERVED,
  THREAT_HOLD_MS,
  buildRadarState,
  createRadarMemory,
  radarGlyph,
} from '../../../src/modules/ui/hud/radar.js';

// The ship at (200, 150) with the camera showing the field's top-left quarter.
const input = (over = {}) => ({
  ship: { x: 200, y: 150, angle: 0 },
  range: 900,
  jammed: false,
  view: { x: 0, y: 0, width: 400, height: 300 },
  enemies: [],
  pickups: [],
  orbs: [],
  shots: [],
  now: 0,
  ...over,
});
const enemy = (x, y, extra = {}) => ({
  type: 'drone',
  x,
  y,
  vx: 0,
  vy: 0,
  radius: 12,
  ...extra,
});
const build = (over, memory = createRadarMemory()) =>
  buildRadarState(input(over), memory);
const kinds = (blips, kind) => blips.filter((b) => b.kind === kind).length;

describe('radar state', () => {
  it('picks the blip glyph by enemy type and elite flag', () => {
    const glyphs = [
      { type: 'asteroid' },
      { type: 'drone' },
      { type: 'hunter', elite: true },
      { type: 'herald', heraldKind: 'dust' },
      { type: 'boss', bossKind: 'prime' },
    ].map(radarGlyph);
    expect(glyphs).toEqual(['rock', 'machine', 'elite', 'herald', 'warden']);
  });

  it("dims what the camera's view already shows and keeps the rest bright", () => {
    const { blips } = build({
      enemies: [enemy(300, 200), enemy(700, 500)],
    });
    const at = (x) => blips.find((b) => b.x === (x - 200) / 900);
    expect(at(300).inView).toBe(true);
    expect(at(700).inView).toBe(false);
  });

  it('merges more than 6 of a kind in one direction beyond the range into one wedge', () => {
    const east = (n) =>
      Array.from({ length: n }, (_, i) => enemy(1200 + i * 10, 150 + i));
    const crowd = build({ enemies: east(7) }).blips;
    expect(crowd).toHaveLength(1);
    expect(crowd[0]).toMatchObject({ rim: true, kind: 'machine', count: 7 });
    expect(crowd[0].angle).toBeCloseTo(0);

    const few = build({ enemies: east(6) }).blips;
    expect(few).toHaveLength(6);
    expect(few.every((b) => b.rim && b.count === 1)).toBe(true);
  });

  it('draws at most 80 blips and always keeps 8 of them for pickups and Wardens', () => {
    const machines = Array.from({ length: 100 }, (_, i) => enemy(210 + i, 160));
    const pickups = Array.from({ length: 10 }, (_, i) => ({
      x: 600 + i,
      y: 400,
    }));
    const warden = enemy(500, 300, { type: 'boss' });
    const { blips } = build({ enemies: [...machines, warden], pickups });

    expect(blips).toHaveLength(RADAR_BUDGET);
    expect(kinds(blips, 'warden') + kinds(blips, 'pickup')).toBe(
      RADAR_RESERVED
    );
    expect(kinds(blips, 'warden')).toBe(1);
    expect(kinds(blips, 'machine')).toBe(RADAR_BUDGET - RADAR_RESERVED);
    // The most important draw last, on top.
    expect(blips.at(-1).kind).toBe('warden');
  });

  it('gives a Warden beyond the range no rim chevron (the screen edge marks it)', () => {
    const { blips } = build({
      enemies: [
        enemy(1500, 150, { type: 'boss' }),
        enemy(150, 1400, { type: 'herald' }),
      ],
    });
    expect(blips).toHaveLength(1);
    expect(blips[0]).toMatchObject({ rim: true, kind: 'herald', count: 1 });
    expect(blips[0].distance).toBeCloseTo(Math.hypot(50, 1250));
  });

  it('enters threat mode at once and leaves it 3 s after the last threat', () => {
    const memory = createRadarMemory();
    const elite = [enemy(300, 200, { elite: true })];
    expect(build({ now: 0 }, memory).mode).toBe('calm');
    expect(build({ now: 1000, enemies: elite }, memory).mode).toBe('threat');
    const after = (ms) => build({ now: 1000 + ms }, memory).mode;
    expect(after(THREAT_HOLD_MS - 100)).toBe('threat');
    expect(after(THREAT_HOLD_MS)).toBe('calm');

    const warden = [enemy(300, 200, { type: 'boss' })];
    expect(build({ now: 9000, enemies: warden }, memory).mode).toBe('warden');
  });

  it('counts enemy fire coming at the ship as a threat, not fire going away', () => {
    const shot = (vx) => [{ x: 300, y: 150, vx, vy: 0 }];
    expect(build({ shots: shot(-200) }).mode).toBe('threat');
    expect(build({ shots: shot(200) }).mode).toBe('calm');
  });

  it('shows noise instead of contacts while jammed, re-rolled every 90 ms', () => {
    const memory = createRadarMemory();
    const jammed = (now) =>
      build({ jammed: true, now, enemies: [enemy(300, 200)] }, memory).blips;
    const first = jammed(0);
    expect(first.length).toBeGreaterThan(1);
    expect(first.every((b) => b.kind === 'noise')).toBe(true);
    expect(jammed(50)).toBe(first);
    expect(jammed(100)).not.toBe(first);
  });
});
