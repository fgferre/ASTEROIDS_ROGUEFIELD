import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHudLayoutDefinition } from '../../../src/data/ui/hudLayout.js';
import {
  getInstrument,
  mountInstruments,
} from '../../../src/modules/ui/hud/instruments/registry.js';

const files = import.meta.glob(
  '../../../src/modules/ui/hud/instruments/*/*.js',
  { eager: true }
);

// The node test environment has no DOM: just enough element for the models.
function fakeElement() {
  const classes = new Set();
  const el = {
    style: {},
    dataset: {},
    attributes: {},
    children: [],
    textContent: '',
    innerHTML: '',
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    },
    set className(value) {
      classes.clear();
      value.split(' ').forEach((name) => classes.add(name));
    },
    setAttribute(name, value) {
      el.attributes[name] = String(value);
    },
    appendChild(child) {
      el.children.push(child);
      return child;
    },
  };
  return el;
}

// A slot container: one fake element per selector, two per selector list.
function fakeSlot() {
  const parts = new Map();
  const part = (selector) => {
    if (!parts.has(selector)) parts.set(selector, fakeElement());
    return parts.get(selector);
  };
  return Object.assign(fakeElement(), {
    querySelector: part,
    querySelectorAll: (selector) => [
      part(`${selector} 0`),
      part(`${selector} 1`),
    ],
  });
}

const radarItem = getHudLayoutDefinition().items.find(
  (item) => item.slot === 'radar'
);

function mountRadar(model) {
  const slot = fakeSlot();
  const root = {
    querySelector: (selector) =>
      selector === '[data-slot="radar"]' ? slot : null,
  };
  const radar = mountInstruments(root, [{ ...radarItem, model }]).get('radar');
  return { slot, radar };
}

const state = (blips) => ({
  range: 900,
  jammed: false,
  mode: 'calm',
  ship: { x: 400, y: 300, angle: 0 },
  field: { width: 800, height: 600 },
  view: { x: 0, y: 0, width: 800, height: 600 },
  blips,
  haze: [],
});

describe('HUD instruments', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: fakeElement,
      createElementNS: fakeElement,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('every model file is { slot, id, name, mount, update, destroy } named by its path', () => {
    const paths = Object.keys(files);
    expect(paths.length).toBeGreaterThan(1);
    for (const path of paths) {
      const [slot, file] = path.split('/').slice(-2);
      const model = files[path].default;
      expect(model.slot, path).toBe(slot);
      expect(model.id, path).toBe(file.replace(/\.js$/, ''));
      expect(typeof model.name, path).toBe('string');
      for (const method of ['mount', 'update', 'destroy']) {
        expect(typeof model[method], `${path} ${method}`).toBe('function');
      }
    }
  });

  it('mounts the tactical radar by default and the classic one when the item picks it', () => {
    expect(radarItem.model).toBe('tactical');

    const tactical = mountRadar('tactical');
    expect(tactical.radar.id).toBe('tactical');
    expect(tactical.slot.innerHTML).toContain('class="rt"');
    expect(tactical.slot.style.top).toBe(`${radarItem.y}px`);
    expect(tactical.slot.style.right).toBe(`${radarItem.x}px`);
    expect(tactical.radar.range).toBe(getInstrument('radar', 'tactical').range);

    const classic = mountRadar('classic');
    expect(classic.radar.id).toBe('classic');
    expect(classic.slot.innerHTML).toContain('radar-structure');
    expect(classic.radar.range).toBe(getInstrument('radar', 'classic').range);
  });

  it('classic radar: noise and NO SIGNAL while jammed, a phased Shade dimmed', () => {
    const { slot, radar } = mountRadar('classic');
    const pool = slot.querySelector('.blip-container').children;
    const shown = () => pool.filter((el) => el.style.display !== 'none');
    const structure = slot.querySelector('.radar-structure');

    radar.update({
      ...state([{ kind: 'noise', x: 0.1, y: 0.2 }]),
      jammed: true,
    });
    expect(structure.classList.contains('is-jammed')).toBe(true);
    expect(shown().map((el) => el.dataset.type)).toEqual(['noise']);

    radar.update(
      state([
        { kind: 'fast', x: 0.5, y: 0.5, phased: true },
        { kind: 'machine', x: 1, y: 0, rim: true, count: 7 },
      ])
    );
    expect(structure.classList.contains('is-jammed')).toBe(false);
    expect(shown().map((el) => el.dataset.type)).toEqual(['machine']);
    expect(shown()[0].style.opacity).toBe('0.35');
  });

  it('tactical radar: a crowd beyond the range is one wedge with its count', () => {
    const { slot, radar } = mountRadar('tactical');
    radar.update(
      state([
        { kind: 'machine', rim: true, angle: Math.PI, x: -1, y: 0, count: 12 },
        { kind: 'rock', x: 0.2, y: 0, size: 0.02, inView: true },
      ])
    );
    const blips = slot.querySelector('.rt-blips').children;
    expect(blips[0].attributes.href).toBe('#rt-g-wedge');
    expect(blips[1].attributes.class).toContain('is-dim');
    expect(blips[2].style.display).toBe('none');
    const labels = slot.querySelector('.rt-labels').children;
    expect(labels[0].textContent).toBe('12');
    expect(labels[1].style.display).toBe('none');
  });
});
