// The playtest bot's reading of hazards and its plans (src/bootstrap/botPilot.js).
import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS,
  createBotPilot,
  decide,
  hazardAt,
  pickCard,
  rollout,
} from '../../src/bootstrap/botPilot.js';

const KNOBS = { horizon: 0.7, substeps: 5 };

function makeWorld(over = {}) {
  return {
    time: 0,
    width: 800,
    height: 600,
    movers: [],
    zones: [],
    loot: [],
    boss: null,
    ...over,
    ship: {
      x: 400,
      y: 300,
      vx: 0,
      vy: 0,
      radius: 15,
      maxSpeed: 220,
      acceleration: 280,
      damping: 3.1,
      braking: 0,
      dashReady: false,
      dashImpulse: 520,
      shieldReady: false,
      invulnerable: 0,
      health: 100,
      maxHealth: 100,
      ...over.ship,
    },
  };
}

const zoneWorld = (zone) => makeWorld({ zones: [zone] });

// The danger summed along the path a plan holds.
function pathHazard(world, dir) {
  return rollout(world, DIRECTIONS[dir], KNOBS).reduce(
    (sum, p) => sum + hazardAt(world, p.x, p.y, p.t),
    0
  );
}

describe('hazardAt', () => {
  // [type, zone, a point inside, a point outside]
  const cases = [
    [
      'charge lane',
      {
        type: 'charge',
        ox: 100,
        oy: 300,
        or: 30,
        angle: 0,
        length: 300,
        timer: 0,
      },
      [300, 310],
      [300, 400],
    ],
    [
      'aim line (locked)',
      {
        type: 'aim',
        ox: 100,
        oy: 100,
        or: 20,
        angle: 0,
        length: 600,
        locked: true,
        timer: 0,
      },
      [500, 104],
      [500, 160],
    ],
    [
      'spread fan',
      {
        type: 'fan',
        x: 100,
        y: 300,
        angle: 0,
        arc: 0.6,
        length: 180,
        timer: 0,
      },
      [350, 320],
      [100, 500],
    ],
    [
      'intake mouth',
      {
        type: 'intake',
        x: 400,
        y: 300,
        ox: 400,
        oy: 300,
        or: 66,
        angle: 0,
        arc: 1,
        length: 340,
        pulling: true,
        timer: 0,
      },
      [460, 300],
      [400, 500],
    ],
    [
      'eject line',
      {
        type: 'eject',
        lines: [{ x: 100, y: 100, angle: 0, length: 200 }],
        timer: 0,
      },
      [250, 105],
      [250, 200],
    ],
    [
      'barrier, off its gap',
      {
        type: 'barrier',
        x: 400,
        y: 300,
        angle: 0,
        gapAt: 0,
        gapWidth: 140,
        span: [-400, 400],
        phase: 'solid',
        timer: 2,
      },
      [600, 305],
      [400, 305],
    ],
    [
      'hot wedge',
      {
        type: 'sectors',
        x: 400,
        y: 300,
        angle: 0,
        count: 8,
        offset: 0,
        phase: 'burn',
        timer: 1,
        length: 600,
      },
      [600, 340],
      [600, 260],
    ],
    [
      'slag pool',
      {
        type: 'pools',
        pools: [{ x: 200, y: 200, radius: 55, phase: 'burn', timer: 2 }],
      },
      [220, 200],
      [300, 200],
    ],
    [
      'prism beam',
      {
        type: 'prism',
        segments: [{ x1: 0, y1: 100, x2: 800, y2: 100 }],
        width: 20,
        phase: 'burn',
        timer: 1,
      },
      [400, 104],
      [400, 160],
    ],
    [
      'arm (ring sector)',
      {
        type: 'arms',
        x: 400,
        y: 300,
        segments: [{ angle: 0, width: 1.2, inner: 78, outer: 230 }],
        phase: 'sweep',
        timer: 1,
      },
      [550, 300],
      [700, 300],
    ],
    [
      'grid fence',
      {
        type: 'grid',
        fences: [{ x1: 200, y1: 200, x2: 400, y2: 200 }],
        phase: 'solid',
        timer: 2,
      },
      [300, 210],
      [300, 300],
    ],
    [
      'locked beam (burning)',
      {
        type: 'lock',
        x: 400,
        y: 300,
        x2: 800,
        y2: 300,
        width: 24,
        phase: 'burn',
        timer: 1,
      },
      [600, 305],
      [600, 360],
    ],
    [
      'artillery landing',
      { type: 'shell', x: 300, y: 300, radius: 110, timer: 0 },
      [380, 300],
      [450, 300],
    ],
    [
      'armed mine',
      {
        type: 'mine',
        x: 300,
        y: 300,
        armed: true,
        proximityRadius: 80,
        explosionRadius: 120,
      },
      [400, 300],
      [480, 300],
    ],
  ];

  it.each(cases)(
    '%s: inside hurts, outside is safe',
    (_, zone, inside, outside) => {
      const world = zoneWorld(zone);
      expect(hazardAt(world, ...inside, 0)).toBeGreaterThanOrEqual(1);
      expect(hazardAt(world, ...outside, 0)).toBe(0);
    }
  );

  it('a warning hurts only once its timer runs out; a burn only until it ends', () => {
    const warn = zoneWorld({
      type: 'pools',
      pools: [{ x: 200, y: 200, radius: 55, phase: 'warn', timer: 0.5 }],
    });
    expect(hazardAt(warn, 200, 200, 0)).toBe(0);
    expect(hazardAt(warn, 200, 200, 0.6)).toBeGreaterThanOrEqual(1);
    const burn = zoneWorld({
      type: 'pools',
      pools: [{ x: 200, y: 200, radius: 55, phase: 'burn', timer: 0.3 }],
    });
    expect(hazardAt(burn, 200, 200, 0)).toBeGreaterThanOrEqual(1);
    expect(hazardAt(burn, 200, 200, 0.6)).toBe(0);
  });

  it('a fading barrier or cage no longer hurts', () => {
    const fence = { x1: 200, y1: 200, x2: 400, y2: 200 };
    const world = zoneWorld({
      type: 'grid',
      fences: [fence],
      phase: 'fade',
      timer: 1,
    });
    expect(hazardAt(world, 300, 200, 0)).toBe(0);
  });

  it('a closing cage keeps its doorway wide, as the game builds it', () => {
    // 400 px closing 250 px/s: in 1 s it is 150 px, its top doorway still
    // 130 px wide (stubs 10 px), not scaled down with the cage
    const world = zoneWorld({
      type: 'grid',
      x: 400,
      y: 300,
      size: 400,
      open: 0,
      door: 130,
      closing: -250,
      fences: [],
      phase: 'solid',
      timer: 2,
    });
    expect(hazardAt(world, 435, 225, 1)).toBeLessThan(1);
    expect(hazardAt(world, 470, 225, 1)).toBeGreaterThanOrEqual(1);
  });

  it('a moving body is extrapolated by its velocity, across the wrap', () => {
    const world = makeWorld({
      movers: [{ x: 790, y: 300, vx: 100, vy: 0, radius: 5 }],
    });
    expect(hazardAt(world, 40, 300, 0)).toBe(0);
    expect(hazardAt(world, 40, 300, 0.5)).toBeGreaterThanOrEqual(1);
  });
});

describe('decide', () => {
  it('moves off the line of an incoming bullet', () => {
    const world = makeWorld({
      movers: [{ x: 250, y: 300, vx: 300, vy: 0, radius: 4, kind: 'bullet' }],
    });
    const plan = decide(world, KNOBS);
    expect(Math.abs(DIRECTIONS[plan.dir]?.y ?? 0)).toBeGreaterThan(0.5);
    expect(pathHazard(world, plan.dir)).toBeLessThan(pathHazard(world, 0));
  });

  it('gives way to a closing rock', () => {
    const world = makeWorld({
      movers: [{ x: 510, y: 300, vx: -120, vy: 0, radius: 35, kind: 'rock' }],
    });
    const plan = decide(world, KNOBS);
    expect(DIRECTIONS[plan.dir]?.x ?? 0).toBeLessThanOrEqual(0);
    expect(pathHazard(world, plan.dir)).toBeLessThan(pathHazard(world, 0));
  });

  it('leaves a burning wedge by the shortest safe way', () => {
    // Wedge 0 (hot) runs from the +x axis 45° down; the ship sits just
    // inside its upper edge, so up is the short way out.
    const world = makeWorld({
      ship: { x: 600, y: 310 },
      zones: [
        {
          type: 'sectors',
          x: 400,
          y: 300,
          angle: 0,
          count: 8,
          offset: 0,
          phase: 'burn',
          timer: 2,
          length: 900,
        },
      ],
    });
    const plan = decide(world, KNOBS);
    expect(DIRECTIONS[plan.dir]?.y ?? 0).toBeLessThan(0);
  });

  it('does not walk into a warned zone that burns before it could cross', () => {
    const pool = (timer) => ({
      type: 'pools',
      pools: [{ x: 470, y: 300, radius: 55, phase: 'warn', timer }],
    });
    const loot = [{ x: 650, y: 300 }];
    const soon = makeWorld({ zones: [pool(0.3)], loot });
    const plan = decide(soon, KNOBS);
    expect(DIRECTIONS[plan.dir]?.x ?? 0).toBeLessThanOrEqual(0);
    // the same orb with the pool far from burning: it goes for it
    const later = makeWorld({ zones: [pool(5)], loot });
    expect(decide(later, KNOBS).dir).toBe(3);
  });

  it('dashes out when cornered and the dash is ready', () => {
    const rock = { x: 345, y: 300, vx: 260, vy: 0, radius: 35, kind: 'rock' };
    const ready = makeWorld({ movers: [rock], ship: { dashReady: true } });
    const plan = decide(ready, KNOBS);
    expect(plan.dash).toBe(true);
    expect(Math.abs(DIRECTIONS[plan.dir].y)).toBeGreaterThan(0.5);
    const spent = makeWorld({ movers: [rock] });
    expect(decide(spent, KNOBS).dash).toBe(false);
    const shielded = makeWorld({ movers: [rock], ship: { shieldReady: true } });
    expect(decide(shielded, KNOBS).shield).toBe(true);
  });

  it('steps out of a barrier that will be there', () => {
    // A solid wall through (400, 300), turning down onto the ship 60 px
    // below it: safe now, hit where the wall will be.
    const wall = {
      type: 'barrier',
      x: 400,
      y: 300,
      angle: 0,
      spin: 0.4,
      gapAt: -300,
      gapWidth: 100,
      span: [-400, 400],
      phase: 'solid',
      timer: 3,
    };
    const world = makeWorld({ zones: [wall], ship: { x: 600, y: 360 } });
    expect(hazardAt(world, 600, 360, 0)).toBe(0);
    expect(hazardAt(world, 600, 360, 0.7)).toBeGreaterThanOrEqual(1);
    const plan = decide(world, KNOBS);
    expect(plan.dir).not.toBe(0);
    expect(pathHazard(world, plan.dir)).toBeLessThan(pathHazard(world, 0));
  });

  it('closes on a target beyond its weapon’s reach', () => {
    // 220 px off a boss's rim: a firing gap for a long gun, out of a 180 px
    // scatter gun's reach.
    const boss = { x: 200, y: 300, radius: 50, open: 0 };
    const world = makeWorld({ boss, ship: { x: 470, reach: 180 } });
    expect(DIRECTIONS[decide(world, KNOBS).dir]?.x).toBeLessThan(0);
  });

  it('goes for an orb when nothing threatens', () => {
    const world = makeWorld({ loot: [{ x: 600, y: 300 }] });
    expect(decide(world, KNOBS).dir).toBe(3);
  });

  it('goes for a heart lying close to the edge', () => {
    const world = makeWorld({
      loot: [{ x: 300, y: 575 }],
      ship: { x: 300, y: 550 },
    });
    expect(DIRECTIONS[decide(world, KNOBS).dir]?.y).toBeGreaterThan(0.5);
  });
});

describe('createBotPilot', () => {
  // A minute of a busy field, a frame at a time.
  function fly(seed) {
    const pilot = createBotPilot({ preset: 'average', seed });
    const keys = [];
    for (let frame = 0; frame < 600; frame += 1) {
      const time = frame / 60;
      const movers = [0, 1, 2, 3, 4].map((i) => ({
        x: (100 + i * 150 + time * 80) % 800,
        y: 100 + i * 90,
        vx: 80,
        vy: i % 2 ? 40 : -40,
        radius: 10,
        kind: 'bullet',
        ref: `b${i}:${Math.floor(time / 2)}`,
      }));
      keys.push(JSON.stringify(pilot.step(makeWorld({ time, movers }))));
    }
    return keys;
  }

  it('makes the same decisions from the same seed', () => {
    expect(fly(7)).toEqual(fly(7));
  });

  it('acts on a plan only after its reaction delay', () => {
    const pilot = createBotPilot({ preset: 'average' });
    const world = (time) => makeWorld({ time, loot: [{ x: 600, y: 300 }] });
    expect(pilot.step(world(0)).right).toBe(false);
    expect(pilot.step(world(0.2)).right).toBe(false);
    expect(pilot.step(world(0.26)).right).toBe(true);
  });
});

describe('pickCard', () => {
  const card = (id, category, tags = [], cursed = false) => ({
    id,
    category: { id: category },
    tags,
    cursed,
  });

  it('never takes a cursed card; weapons first, then damage, then defence', () => {
    const offer = [
      card('shield', 'defense'),
      card('glass_cannon', 'offense', ['damage'], true),
      card('plasma', 'offense', ['damage']),
    ];
    expect(pickCard(offer)).toBe('plasma');
    expect(pickCard([...offer, card('scatter', 'offense', ['weapon'])])).toBe(
      'scatter'
    );
    expect(pickCard([card('rcs', 'mobility'), card('shield', 'defense')])).toBe(
      'shield'
    );
  });
});
