import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AAAHudLayout,
  comboTier,
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
