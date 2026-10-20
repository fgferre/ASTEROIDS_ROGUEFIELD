import { describe, expect, it } from 'vitest';
import { getHudPreset } from '../../../src/data/ui/hudPresets.js';
import SettingsSystem from '../../../src/modules/SettingsSystem.js';
import {
  CODE_PREFIX,
  MAX_USER_PRESETS,
  activePreset,
  addPreset,
  decodeLayout,
  encodeLayout,
  instrumentCatalog,
  readUserPresets,
  removePreset,
  renamePreset,
  sanitizeItems,
  storePreset,
  withModel,
} from '../../../src/modules/ui/hud/editor/layoutStore.js';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';

const catalog = instrumentCatalog();
const instrument = getHudPreset('instrument').items;
const slotOf = (items, slot) => items.find((item) => item.slot === slot);
const moved = (items, slot, more) =>
  items.map((item) => (item.slot === slot ? { ...item, ...more } : item));

describe('HUD layouts: items, presets and codes', () => {
  it('takes every built-in preset as it is and rejects what cannot be a layout', () => {
    for (const id of ['instrument', 'classic', 'minimal']) {
      const items = getHudPreset(id).items;
      expect(sanitizeItems(items, catalog)).toEqual(items);
    }
    const without = instrument.filter((item) => item.slot !== 'xp');
    expect(sanitizeItems(without, catalog)).toBeNull();
    expect(
      sanitizeItems([...without, slotOf(instrument, 'radar')], catalog)
    ).toBeNull();
    expect(
      sanitizeItems(moved(instrument, 'radar', { model: 'holo' }), catalog)
    ).toBeNull();
    // On-ship slots stay on the ship, framed ones in the frame.
    expect(
      sanitizeItems(moved(instrument, 'radar', { anchor: 'screen' }), catalog)
    ).toBeNull();
    expect(
      sanitizeItems(moved(instrument, 'xp', { x: Number.NaN }), catalog)
    ).toBeNull();
    // Out-of-range numbers come back in range.
    const clamped = sanitizeItems(
      moved(instrument, 'radar', { scale: 9, opacity: 0, x: 12.6 }),
      catalog
    );
    expect(slotOf(clamped, 'radar')).toMatchObject({
      scale: 1.6,
      opacity: 0.2,
      x: 13,
    });
  });

  it('the Minimal preset: small vitals at the bottom centre, a smaller radar, no run info or feed', () => {
    const minimal = getHudPreset('minimal').items;
    expect(slotOf(minimal, 'vitals')).toMatchObject({
      anchor: 'bottom-center',
      visible: true,
    });
    expect(slotOf(minimal, 'vitals').scale).toBeLessThan(1);
    expect(slotOf(minimal, 'radar').scale).toBeLessThan(1);
    expect(slotOf(minimal, 'run-info').visible).toBe(false);
    expect(slotOf(minimal, 'feed').visible).toBe(false);
    expect(slotOf(minimal, 'xp')).toMatchObject({ visible: true });
  });

  it('saves, renames, overwrites and deletes the player’s presets', () => {
    let presets = [];
    const first = addPreset(presets, 'Wide Radar', instrument);
    presets = first.presets;
    expect(first.id).toBe('user-1');
    // A taken name (a built-in's too) gets a number.
    const second = addPreset(presets, 'instrument', instrument);
    presets = second.presets;
    expect(presets.map((p) => p.name)).toEqual([
      'Wide Radar',
      'instrument (2)',
    ]);
    expect(second.id).toBe('user-2');

    const edited = moved(instrument, 'radar', { x: 200 });
    presets = storePreset(presets, 'user-1', edited);
    expect(slotOf(presets[0].items, 'radar').x).toBe(200);
    presets = renamePreset(presets, 'user-2', 'Wide Radar');
    expect(presets[1].name).toBe('Wide Radar (2)');
    presets = removePreset(presets, 'user-1');
    expect(presets.map((p) => p.id)).toEqual(['user-2']);
    // A new one never reuses a live id.
    expect(addPreset(presets, 'Next', instrument).id).toBe('user-3');

    const full = Array.from({ length: MAX_USER_PRESETS }, (_, i) => ({
      id: `user-${i + 1}`,
      name: `L${i}`,
      items: instrument,
    }));
    expect(addPreset(full, 'One more', instrument)).toBeNull();
  });

  it('keeps the active preset and the saved ones in the settings, across a reload and a reset', () => {
    const restore = installDomStubs();
    try {
      const settings = new SettingsSystem({ eventBus: createEventBusMock() });
      const { presets, id } = addPreset(
        [],
        'Mine',
        moved(instrument, 'radar', { model: 'classic', y: 300 })
      );
      settings.setSetting('video', 'hudPresets', presets);
      settings.setSetting('video', 'hudLayout', id);

      const reloaded = new SettingsSystem({ eventBus: createEventBusMock() });
      const active = activePreset(reloaded.getCategoryValues('video'), catalog);
      expect(active).toMatchObject({ id: 'user-1', name: 'Mine' });
      expect(slotOf(active.items, 'radar')).toMatchObject({
        model: 'classic',
        y: 300,
      });

      // Reset Interface: back to the default layout, the saved ones stay.
      reloaded.resetCategory('video');
      const video = reloaded.getCategoryValues('video');
      expect(video.hudLayout).toBe('instrument');
      expect(readUserPresets(video.hudPresets, catalog)).toHaveLength(1);
      // A deleted (or damaged) layout falls back to the default preset.
      expect(
        activePreset({ hudLayout: 'user-9', hudPresets: [] }, catalog).id
      ).toBe('instrument');
      expect(
        readUserPresets(
          [{ id: 'user-1', name: 'Broken', items: [{ slot: 'radar' }] }, 7],
          catalog
        )
      ).toEqual([]);
    } finally {
      restore();
    }
  });

  it('round-trips a layout through its code', () => {
    const items = sanitizeItems(
      moved(
        moved(instrument, 'radar', { model: 'classic', scale: 1.35 }),
        'feed',
        { visible: false, opacity: 0.45, anchor: 'bottom-left', x: -12 }
      ),
      catalog
    );
    const code = encodeLayout(items);
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    expect(code).toMatch(/^[\w.-]+$/);
    expect(decodeLayout(code, catalog)).toEqual({ ok: true, items });
    // Spaces and line breaks from a chat window are ignored.
    expect(
      decodeLayout(` ${code.slice(0, 20)}\n${code.slice(20)} `, catalog)
    ).toEqual({ ok: true, items });
  });

  it('rejects bad codes with a line for the player, never a throw', () => {
    const json = (rows) =>
      CODE_PREFIX +
      btoa(JSON.stringify(rows)).replace(/\+/g, '-').replace(/\//g, '_');
    const good = JSON.parse(
      atob(
        encodeLayout(instrument)
          .slice(CODE_PREFIX.length)
          .replace(/-/g, '+')
          .replace(/_/g, '/')
      )
    );
    const unknownModel = good.map((row) =>
      row[0] === 'radar' ? ['radar', 'holo', ...row.slice(2)] : row
    );
    const bad = [
      '',
      'hello',
      `${CODE_PREFIX}%%%`,
      `${CODE_PREFIX}bm90IGpzb24`,
      json({ items: [] }),
      json([[1, 2, 3]]),
      json(good.slice(1)),
      json(unknownModel),
      `${CODE_PREFIX}${'A'.repeat(5000)}`,
      null,
      42,
    ];
    for (const code of bad) {
      const result = decodeLayout(code, catalog);
      expect(result.ok, String(code).slice(0, 30)).toBe(false);
      expect(result.error).toMatch(/\w/);
    }
  });

  it('a model drawn across the frame takes its own anchor; others keep their place', () => {
    const warden = slotOf(instrument, 'warden');
    expect(withModel(warden, 'classic')).toMatchObject({
      model: 'classic',
      anchor: 'top-stretch',
      x: 236,
      y: 16,
    });
    const back = withModel(withModel(warden, 'classic'), 'instrument');
    expect(back).toMatchObject({ anchor: 'top-center', x: 0, y: 24 });
    const radar = { ...slotOf(instrument, 'radar'), x: 300, y: 500 };
    expect(withModel(radar, 'classic')).toEqual({ ...radar, model: 'classic' });
  });
});
