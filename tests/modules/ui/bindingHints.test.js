import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fillBindingHints } from '../../../src/modules/ui/bindingHints.js';
import { getSettingsSchema } from '../../../src/data/settingsSchema.js';

const html = readFileSync(
  new URL('../../../src/index.html', import.meta.url),
  'utf8'
);
const defaults = () =>
  Object.fromEntries(
    getSettingsSchema()
      .find((category) => category.id === 'controls')
      .fields.map((field) => [field.key, structuredClone(field.default)])
  );

// A <kbd> as fillBindingHints reads it: its marks and its device's holder.
const kbd = (text, binding, device, slot) => ({
  textContent: text,
  dataset: { binding, ...(slot === undefined ? {} : { bindingSlot: slot }) },
  closest: () => ({ dataset: { device } }),
});

describe('Key hints follow the bindings', () => {
  it('show a rebound key, and the default text again once it is restored', () => {
    const hints = {
      dash: kbd('Shift', 'dash', 'keyboard'),
      wasd: kbd('WASD', 'moveUp moveLeft moveDown moveRight', 'keyboard'),
      up: kbd('↑', 'moveUp', 'keyboard', '1'),
      pad: kbd('RB', 'dash', 'gamepad'),
    };
    const root = { querySelectorAll: () => Object.values(hints) };
    const controls = defaults();

    fillBindingHints(controls, root);
    expect(hints.dash.textContent).toBe('Shift');
    expect(hints.up.textContent).toBe('↑');

    controls.dash = { keyboard: ['KeyK', 'ShiftRight'], gamepad: ['button:2'] };
    controls.moveUp.keyboard = ['KeyI', 'ArrowUp'];
    fillBindingHints(controls, root);
    expect(hints.dash.textContent).toBe('K');
    expect(hints.pad.textContent).toBe('X');
    expect(hints.wasd.textContent).toBe('IASD');
    expect(hints.up.textContent).toBe('↑');

    fillBindingHints(defaults(), root);
    expect(hints.dash.textContent).toBe('Shift');
    expect(hints.pad.textContent).toBe('RB');
    expect(hints.wasd.textContent).toBe('WASD');
  });

  it('show a dash for an action with no key, hide an empty second slot, and show a key bound again', () => {
    const shield = kbd('E', 'activateShield', 'keyboard');
    const wasd = kbd('WASD', 'moveUp moveLeft moveDown moveRight', 'keyboard');
    const up2 = kbd('↑', 'moveUp', 'keyboard', '1');
    const root = { querySelectorAll: () => [shield, wasd, up2] };
    const controls = defaults();

    controls.activateShield.keyboard = [];
    controls.moveUp.keyboard = ['', 'ArrowUp'];
    controls.moveDown.keyboard = [];
    fillBindingHints(controls, root);
    expect(shield.hidden).toBe(false);
    expect(shield.textContent).toBe('—');
    expect(wasd.hidden).toBe(false);
    expect(wasd.textContent).toBe('AD');
    expect(up2.hidden).toBe(false);

    controls.moveUp.keyboard = [];
    fillBindingHints(controls, root);
    expect(up2.hidden).toBe(true);

    for (const action of ['moveUp', 'moveLeft', 'moveDown', 'moveRight'])
      controls[action].keyboard = [];
    fillBindingHints(controls, root);
    expect(wasd.hidden).toBe(false);
    expect(wasd.textContent).toBe('—');

    controls.activateShield.keyboard = ['KeyQ'];
    fillBindingHints(controls, root);
    expect(shield.hidden).toBe(false);
    expect(shield.textContent).toBe('Q');
  });

  it('are marked in the menu and pause lists and the briefing', () => {
    expect(html.match(/<kbd data-binding="dash">Shift<\/kbd>/g)).toHaveLength(
      2
    );
    expect(html.match(/<kbd data-binding="dash">RB<\/kbd>/g)).toHaveLength(2);
    const briefing = html.slice(html.indexOf('id="flight-screen"'));
    expect(briefing).toMatch(/<kbd data-binding="strafeLeft">Z<\/kbd>/);
  });
});
