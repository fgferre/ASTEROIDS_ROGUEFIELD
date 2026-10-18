import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AAAHudLayout,
  bossSegments,
  comboTier,
  damageArcAngle,
  edgeArrow,
  radarGlyph,
  spreadEdgeArrows,
} from '../../../src/modules/ui/AAAHudLayout.js';
import { PICKUP_KINDS } from '../../../src/data/pickups.js';
import { bossRushStageTitle } from '../../../src/data/layers.js';
import { WEAPONS } from '../../../src/data/weapons.js';

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

  const weaponState = (weaponId, shotsToBeam = null) => ({
    weaponId,
    name: WEAPONS[weaponId].name,
    shotsToBeam,
    evolutions: [],
  });

  it('names the weapon and fills a pip per shot toward the Harmonic beam', () => {
    hud.updateWeapon(weaponState('lance'));
    expect(hud.els.weaponName.textContent).toBe('AMBER LANCE');
    expect(hud.els.beamPips.classList.contains('is-hidden')).toBe(true);

    // Beam every 4th shot: shotsToBeam 4 → 1 fills 0 → 3 pips.
    const pipsAt = (shotsToBeam) => {
      hud.updateWeapon(weaponState('harmonic', shotsToBeam));
      return filledPips();
    };
    expect([4, 3, 2, 1].map(pipsAt)).toEqual([0, 1, 2, 3]);
    expect(hud.els.weaponName.textContent).toBe('HARMONIC PLASMA LANCE');
    expect(hud.els.beamPips.classList.contains('is-hidden')).toBe(false);
  });

  it('reads the weapon name from the weapon state: the Scatter Coil has no pips', () => {
    hud.updateWeapon(weaponState('scatter'));
    expect(hud.els.weaponName.textContent).toBe('SCATTER COIL');
    expect(hud.els.beamPips.classList.contains('is-hidden')).toBe(true);
  });

  it('adds a family-coloured chip when the weapon evolves', () => {
    const state = weaponState('lance');
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

  it('swaps the chip for a brighter APEX chip when the family reaches its Apex', () => {
    const state = weaponState('lance');
    hud.updateWeapon({
      ...state,
      evolutions: [{ family: 'thermal', id: 'incendiary', name: 'x' }],
    });
    hud.updateWeapon({
      ...state,
      evolutions: [
        { family: 'thermal', id: 'solar-flare', apex: true, short: 'FLARE' },
      ],
    });
    const chips = hud.els.evolutions.children;
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toBe('APEX FLARE');
    expect(chips[0].classList.contains('is-apex')).toBe(true);
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

describe('AAAHudLayout radar', () => {
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

  it('dims the blip of a phased Shade and restores it once solid', () => {
    hud.updateRadar([{ ...enemy[0], phased: true }]);
    expect(shown()[0].style.opacity).toBe('0.35');

    hud.updateRadar(enemy);
    expect(shown()[0].style.opacity).toBe('');
  });
});

describe('AAAHudLayout layer modifier', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'performance'],
    });
    vi.stubGlobal('window', {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the MODIFIER banner in its colour once the LAYER banner ends', () => {
    const hud = new AAAHudLayout();
    hud.els = {
      layerBanner: fakeElement(),
      layerBannerTitle: fakeElement(),
      layerBannerSub: fakeElement(),
    };
    hud.showLayerBanner(17);
    hud.showModifierBanner('Glass Field', '#5eead4');
    vi.advanceTimersByTime(0);
    expect(hud.els.layerBannerTitle.textContent).toBe('LAYER 17');

    vi.advanceTimersByTime(1250);

    const banner = hud.els.layerBanner;
    expect(hud.els.layerBannerTitle.textContent).toBe('MODIFIER');
    expect(hud.els.layerBannerSub.textContent).toBe('Glass Field');
    expect(banner.classList.contains('is-modifier')).toBe(true);
    expect(banner.style['--modifier-color']).toBe('#5eead4');
  });

  it('titles a Boss Rush Warden banner BOSS RUSH over its stage', () => {
    const hud = new AAAHudLayout();
    hud.els = {
      layerBanner: fakeElement(),
      layerBannerTitle: fakeElement(),
      layerBannerSub: fakeElement(),
    };
    hud.showLayerBanner(5, {
      boss: true,
      bossRush: true,
      chapter: bossRushStageTitle(1),
    });
    vi.advanceTimersByTime(0);

    expect(hud.els.layerBannerTitle.textContent).toBe('BOSS RUSH');
    expect(hud.els.layerBannerSub.textContent).toBe('WARDEN 1 OF 3 — PRIME');
    expect(hud.els.layerBanner.classList.contains('is-boss')).toBe(true);
  });

  it('scales the radar range for Dense Fog and back', () => {
    const hud = new AAAHudLayout();
    hud.setRadarRange(0.5);
    expect(hud.radarRangeFactor).toBe(0.5);
    hud.setRadarRange(1);
    expect(hud.radarRangeFactor).toBe(1);
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

describe('AAAHudLayout off-screen arrows around the panels', () => {
  const corners = {
    topLeft: { w: 220, h: 120 },
    topRight: { w: 230, h: 240 },
    bottomLeft: { w: 260, h: 110 },
    bottomRight: { w: 250, h: 130 },
  };

  it('slides the arrow along its edge off the corner panels', () => {
    const upLeft = edgeArrow({ x: -500, y: -400 }, 800, 600, 28, corners);
    expect(upLeft).toMatchObject({ edge: 'top', x: 248, y: 28 });
    const right = edgeArrow({ x: 1400, y: 50 }, 800, 600, 28, corners);
    expect(right).toMatchObject({ edge: 'right', x: 772, y: 268 });
    // Between the panels it stays where it points.
    const below = edgeArrow({ x: 400, y: 900 }, 800, 600, 28, corners);
    expect(below).toMatchObject({ edge: 'bottom', x: 400, y: 572 });
  });

  it('steps the farther of two arrows on one panel along the edge', () => {
    const far = {
      ...edgeArrow({ x: -500, y: -400 }, 800, 600, 28, corners),
      distance: 900,
    };
    const near = {
      ...edgeArrow({ x: -300, y: -600 }, 800, 600, 28, corners),
      distance: 400,
    };
    const other = {
      ...edgeArrow({ x: 1400, y: 50 }, 800, 600, 28, corners),
      distance: 1200,
    };
    spreadEdgeArrows([far, near, other], 800, 600);
    expect(near).toMatchObject({ edge: 'top', x: 248, y: 28 });
    expect(far).toMatchObject({ edge: 'top', x: 278, y: 28 });
    // Alone on its edge, it stays put.
    expect(other).toMatchObject({ edge: 'right', x: 772, y: 268 });
  });
});

describe('AAAHudLayout AIM chip', () => {
  it('reads MANUAL while the right stick aims, AUTO after', () => {
    const hud = new AAAHudLayout();
    hud.els = { aimModeIndicator: fakeElement() };
    hud.setAimStick(true);
    hud.updateModeIndicators('concentrated', 'auto');
    expect(hud.els.aimModeIndicator.innerText).toBe('MANUAL');
    hud.setAimStick(false);
    hud.updateModeIndicators('concentrated', 'auto');
    expect(hud.els.aimModeIndicator.innerText).toBe('AUTO');
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

describe('AAAHudLayout accessibility styles', () => {
  it('enlarges transmission lines 1.35× with Large Subtitles and stops their flicker with Reduce Flashing', () => {
    const css = AAAHudLayout.prototype._getCSS.call({});
    expect(css).toMatch(
      /body\.subtitles-large \.transmission__line \{ font-size: calc\(var\(--text-md\) \* 1\.35\); \}/
    );
    expect(css).toMatch(
      /body\.flashing-reduced \.transmission\.is-showing \{ animation: none; \}/
    );
  });
});

describe('AAAHudLayout kill feed', () => {
  it('names a Warden by its own displayName, falling back to Warden Prime', () => {
    const hud = new AAAHudLayout();
    const keys = [];
    hud._pushFeed = (key) => keys.push(key);

    hud.addKillFeed('boss', false, 'Warden Choir');
    hud.addKillFeed('boss', true);

    expect(keys).toEqual(['kill:Warden Choir', 'kill:Elite Warden Prime']);
  });
});
