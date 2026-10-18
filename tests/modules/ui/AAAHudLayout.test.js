import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AAAHudLayout,
  bossSegments,
  comboTier,
  damageArcAngle,
  radarGlyph,
} from '../../../src/modules/ui/AAAHudLayout.js';
import { PICKUP_KINDS } from '../../../src/data/pickups.js';

describe('AAAHudLayout combo tier', () => {
  it('steps the combo color with the multiplier the progression system produces', () => {
    // ProgressionSystem: multiplier = 1 + (combo - 1) * 0.1, capped at 2.0.
    const tierAt = (combo) => comboTier(Math.min(2, 1 + (combo - 1) * 0.1));
    expect([1, 2, 3].map(tierAt)).toEqual(['text', 'text', 'text']);
    expect([4, 5, 6, 7].map(tierAt)).toEqual([
      'status',
      'status',
      'status',
      'status',
    ]);
    expect([8, 9, 10].map(tierAt)).toEqual(['xp', 'xp', 'xp']);
    expect([11, 30].map(tierAt)).toEqual(['boss', 'boss']);
  });
});

// The node test environment has no DOM: just enough element for the chips.
function fakeElement() {
  const classes = new Set();
  const el = {
    parent: null,
    children: [],
    textContent: '',
    dataset: {},
    style: {
      setProperty(name, value) {
        this[name] = value;
      },
    },
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    },
    set className(value) {
      classes.clear();
      value.split(' ').forEach((name) => classes.add(name));
    },
    appendChild(child) {
      child.parent = el;
      el.children.push(child);
      return child;
    },
    remove() {
      if (el.parent) {
        el.parent.children = el.parent.children.filter((c) => c !== el);
      }
      el.parent = null;
    },
  };
  return el;
}

describe('AAAHudLayout weapon and buff chips', () => {
  let hud;
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: fakeElement });
    hud = new AAAHudLayout();
    hud.els = {
      weaponChip: fakeElement(),
      weaponName: fakeElement(),
      beamPips: fakeElement(),
      beamPipEls: [fakeElement(), fakeElement(), fakeElement()],
      evolutions: fakeElement(),
      buffs: fakeElement(),
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  const filledPips = () =>
    hud.els.beamPipEls.filter((pip) => pip.classList.contains('is-filled'))
      .length;

  it('names the weapon and fills a pip per shot toward the Harmonic beam', () => {
    hud.updateWeapon({ weaponId: 'lance', shotsToBeam: null, evolutions: [] });
    expect(hud.els.weaponName.textContent).toBe('LANCE');
    expect(hud.els.beamPips.classList.contains('is-hidden')).toBe(true);

    // Beam every 4th shot: shotsToBeam 4 → 1 fills 0 → 3 pips.
    const pipsAt = (shotsToBeam) => {
      hud.updateWeapon({ weaponId: 'harmonic', shotsToBeam, evolutions: [] });
      return filledPips();
    };
    expect([4, 3, 2, 1].map(pipsAt)).toEqual([0, 1, 2, 3]);
    expect(hud.els.weaponName.textContent).toBe('HARMONIC');
    expect(hud.els.beamPips.classList.contains('is-hidden')).toBe(false);
  });

  it('adds a family-coloured chip when the weapon evolves', () => {
    const state = { weaponId: 'lance', shotsToBeam: null, evolutions: [] };
    hud.updateWeapon(state);
    expect(hud.els.evolutions.children).toHaveLength(0);

    hud.updateWeapon({
      ...state,
      evolutions: [{ family: 'thermal', id: 'incendiary', name: 'x' }],
    });
    const [chip] = hud.els.evolutions.children;
    expect(chip.textContent).toBe('INCENDIARY');
    expect(chip.style['--family-color']).toBeTruthy();

    // A new run clears the evolutions and their chips.
    hud.updateWeapon(state);
    expect(hud.els.evolutions.children).toHaveLength(0);
  });

  it('counts the Overcharge chip down and removes it at zero', () => {
    const { label, duration, color } = PICKUP_KINDS.overcharge;
    hud.startBuff('overcharge', label, duration, color);
    const [chip] = hud.els.buffs.children;
    const [text, meter] = chip.children;
    expect(text.textContent).toBe('OVERCHARGE 8.0s');

    hud.tickBuffs(0.1);
    expect(text.textContent).toBe('OVERCHARGE 7.9s');
    expect(meter.children[0].style.transform).toBe(`scaleX(${7.9 / duration})`);

    hud.tickBuffs(duration);
    expect(hud.els.buffs.children).toHaveLength(0);
  });
});

describe('AAAHudLayout radar jam', () => {
  let hud;
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: fakeElement });
    hud = new AAAHudLayout();
    hud.els = { radar: fakeElement(), radarContainer: fakeElement() };
    hud._createBlipPool();
  });
  afterEach(() => vi.unstubAllGlobals());

  const shown = () => hud._blipPool.filter((el) => el.style.display !== 'none');
  const enemy = [{ x: 0.5, y: 0.5, type: 'machine' }];

  it('shows noise and NO SIGNAL while jammed, the real blips after', () => {
    hud.setRadarJammed(true);
    hud.updateRadar(enemy);
    expect(hud.els.radar.classList.contains('is-jammed')).toBe(true);
    expect(shown().length).toBeGreaterThan(1);
    expect(shown().every((el) => el.dataset.type === 'noise')).toBe(true);

    hud.setRadarJammed(false);
    hud.updateRadar(enemy);
    expect(hud.els.radar.classList.contains('is-jammed')).toBe(false);
    expect(shown().map((el) => el.dataset.type)).toEqual(['machine']);
  });
});

describe('AAAHudLayout radar glyphs', () => {
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
});

describe('AAAHudLayout damage direction', () => {
  it('points the arc from the ship toward the source in screen space', () => {
    const ship = { x: 400, y: 300 };
    expect(damageArcAngle(ship, { x: 500, y: 300 })).toBeCloseTo(0);
    expect(damageArcAngle(ship, { x: 400, y: 200 })).toBeCloseTo(-Math.PI / 2);
    expect(damageArcAngle(ship, { x: 300, y: 400 })).toBeCloseTo(
      (3 * Math.PI) / 4
    );
    expect(damageArcAngle(ship, { x: 400, y: 300 })).toBeNull();
    expect(damageArcAngle(ship, null)).toBeNull();
  });
});

describe('AAAHudLayout off-screen arrows', () => {
  let hud;
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: fakeElement });
    hud = new AAAHudLayout();
    hud.els = { direction: fakeElement() };
    hud._createDirectionPools();
  });
  afterEach(() => vi.unstubAllGlobals());

  const visible = () =>
    hud._arrowPool.filter(({ el }) => el.style.display !== 'none');

  it('hides the arrow while the target is on screen', () => {
    hud.updateEdgeArrows([{ kind: 'warden', x: 120, y: 80, distance: 300 }]);
    expect(visible()).toHaveLength(0);
  });

  it('pins the arrow to the edge facing an off-screen target', () => {
    hud.updateEdgeArrows([
      { kind: 'warden', x: 1400, y: 300, distance: 812 },
      { kind: 'herald', x: 400, y: -500, distance: 640 },
      { kind: 'pickup', x: -60, y: 320, color: '#ffd700' },
    ]);
    const [warden, herald, pickup] = visible();
    expect(visible()).toHaveLength(3);
    expect(warden.el.dataset.edge).toBe('right');
    expect(warden.label.textContent).toBe('810m');
    expect(herald.el.dataset.edge).toBe('top');
    expect(herald.el.dataset.kind).toBe('herald');
    expect(pickup.el.dataset.edge).toBe('left');
    expect(pickup.el.style['--arrow-color']).toBe('#ffd700');
    expect(pickup.label.textContent).toBe('');

    // Back on screen: the arrow goes away.
    hud.updateEdgeArrows([{ kind: 'warden', x: 600, y: 300 }]);
    expect(visible()).toHaveLength(0);
  });
});

describe('AAAHudLayout boss bar segments', () => {
  it('splits a Warden bar at its phase thresholds and marks the current phase', () => {
    const at = (phase) => bossSegments(3, phase);
    expect(at(0).map(({ left, width }) => [left, width])).toEqual([
      [0, 33],
      [33, 33],
      [66, 34],
    ]);
    expect(at(0).map((seg) => seg.state)).toEqual([
      'ahead',
      'ahead',
      'current',
    ]);
    expect(at(1).map((seg) => seg.state)).toEqual([
      'ahead',
      'current',
      'spent',
    ]);
    expect(at(2).map((seg) => seg.state)).toEqual([
      'current',
      'spent',
      'spent',
    ]);
  });

  it('gives a Herald one full-width segment', () => {
    expect(bossSegments(1, 0)).toEqual([
      { left: 0, width: 100, state: 'current' },
    ]);
  });
});
