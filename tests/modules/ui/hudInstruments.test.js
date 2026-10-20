import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD_PRESETS, getHudPreset } from '../../../src/data/ui/hudPresets.js';
import { AAAHudLayout } from '../../../src/modules/ui/AAAHudLayout.js';
import { TacticalHud } from '../../../src/modules/ui/TacticalHud.js';
import {
  getInstrument,
  mountInstruments,
} from '../../../src/modules/ui/hud/instruments/registry.js';
import {
  fakeDocument,
  fakeElement,
  fakeHudRoot,
} from '../../__helpers__/fakeHudDom.js';

const files = import.meta.glob(
  '../../../src/modules/ui/hud/instruments/*/*.js',
  { eager: true }
);

const radarItem = getHudPreset('instrument').items.find(
  (item) => item.slot === 'radar'
);

function mountRadar(model) {
  const root = fakeHudRoot();
  const radar = mountInstruments(
    root,
    [{ ...radarItem, model }],
    fakeElement()
  ).get('radar');
  return { slot: root.slots.get('radar'), radar };
}

// The ids of the models mounted per slot.
const mountedModels = (mounted) =>
  Object.fromEntries([...mounted].map(([slot, model]) => [slot, model.id]));

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
    vi.stubGlobal('document', fakeDocument());
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

  it('every preset places every slot once, each with a model that exists', () => {
    const slots = new Set(
      Object.keys(files).map((path) => path.split('/').slice(-2)[0])
    );
    for (const preset of Object.values(HUD_PRESETS)) {
      expect(preset.items.map((item) => item.slot).sort()).toEqual(
        [...slots].sort()
      );
      for (const { slot, model } of preset.items) {
        expect(getInstrument(slot, model), `${preset.id} ${slot}`).toBeTruthy();
      }
    }
  });

  it('the Instrument preset mounts the new models, the Classic one the old ones', () => {
    const instrument = mountInstruments(
      fakeHudRoot(),
      getHudPreset('instrument').items,
      fakeElement()
    );
    expect(mountedModels(instrument)).toEqual({
      'hull-ring': 'instrument',
      recharges: 'instrument',
      'run-info': 'instrument',
      warden: 'instrument',
      radar: 'tactical',
      feed: 'instrument',
      vitals: 'instrument',
      xp: 'instrument',
      build: 'instrument',
    });

    const root = fakeHudRoot();
    const classic = mountInstruments(
      root,
      getHudPreset('classic').items,
      fakeElement()
    );
    // No recharges on the ship: the dash meter is the build's DASH chip.
    expect(mountedModels(classic)).toEqual({
      'hull-ring': 'classic',
      'run-info': 'classic',
      warden: 'classic',
      radar: 'classic',
      feed: 'classic',
      vitals: 'classic',
      xp: 'classic',
      build: 'classic',
    });
    expect(root.slots.get('recharges').style.display).toBe('none');
    // The old grid's places: 16 px margins, the boss bar between 220 px columns.
    expect(root.slots.get('warden').style.left).toBe(
      'calc(236px * var(--hud-u, 1))'
    );
    expect(root.slots.get('warden').style.right).toBe(
      'calc(236px * var(--hud-u, 1))'
    );
  });

  it('the HUD Layout setting swaps the mounted instruments for the other preset', () => {
    const hud = new TacticalHud({
      refs: {},
      player: () => null,
      enemies: () => null,
      progression: () => null,
      combat: () => null,
      pickups: () => null,
      xpOrbs: () => null,
      renderer: () => null,
      shieldKey: () => 'E',
    });
    const layout = new AAAHudLayout({
      items: getHudPreset('instrument').items,
    });
    layout._mounted = true;
    layout._layer = fakeHudRoot();
    layout.els = { direction: fakeElement() };
    layout._mountInstruments();
    hud.layout = layout;
    const destroyed = vi.spyOn(layout._instruments.get('xp'), 'destroy');

    hud.setLayout(getHudPreset('classic').items);

    expect(destroyed).toHaveBeenCalled();
    expect(hud.items).toBe(getHudPreset('classic').items);
    expect(layout._instruments.get('xp').id).toBe('classic');
    expect(layout._instruments.get('radar').id).toBe('classic');
    expect(layout._instruments.has('recharges')).toBe(false);
    expect(
      layout._layer.slots.get('build').classList.contains('hud-plate')
    ).toBe(false);

    hud.setLayout(getHudPreset('instrument').items);
    expect(layout._instruments.get('vitals').id).toBe('instrument');
    expect(
      layout._layer.slots.get('build').classList.contains('hud-plate')
    ).toBe(true);
  });

  it('mounts the tactical radar by default and the classic one when the item picks it', () => {
    expect(radarItem.model).toBe('tactical');

    const tactical = mountRadar('tactical');
    expect(tactical.radar.id).toBe('tactical');
    expect(tactical.slot.innerHTML).toContain('class="rt"');
    expect(tactical.slot.style.top).toBe(
      `calc(${radarItem.y}px * var(--hud-u, 1))`
    );
    expect(tactical.slot.style.right).toBe(
      `calc(${radarItem.x}px * var(--hud-u, 1))`
    );
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
