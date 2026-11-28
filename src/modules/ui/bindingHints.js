// src/modules/ui/bindingHints.js
//
// The key hints in index.html name the default keys. Each <kbd> that stands
// for a rebindable key says which action(s) it shows (`data-binding`, several
// split by spaces, as WASD) and which slot of the binding
// (`data-binding-slot`, default 0); the device is its nearest `data-device`.
// While a binding is still the default, the hint keeps its own text (↑, ⏎,
// Space); once rebound, it shows the bound key's label.

import { getSettingsSchema } from '../../data/settingsSchema.js';
import { formatBindingLabel } from './settings/bindingKeys.js';

const DEFAULT_BINDINGS = Object.fromEntries(
  getSettingsSchema()
    .find((category) => category.id === 'controls')
    .fields.map((field) => [field.key, field.default])
);

const originalText = new WeakMap();

/** Labels of several keys as one hint: WASD, or "Arrow Up Arrow Left …". */
export function joinKeyLabels(labels) {
  return labels.every((label) => label.length === 1)
    ? labels.join('')
    : labels.join(' ');
}

/** Fills every marked hint under `root` from `controls` (settings values). */
export function fillBindingHints(controls, root = document) {
  root.querySelectorAll('kbd[data-binding]').forEach((kbd) => {
    if (!originalText.has(kbd)) originalText.set(kbd, kbd.textContent);
    const device = kbd.closest('[data-device]')?.dataset.device ?? 'keyboard';
    const slot = Number(kbd.dataset.bindingSlot ?? 0);
    const actions = kbd.dataset.binding.split(' ');
    const codes = actions.map((action) => controls?.[action]?.[device]?.[slot]);
    const unchanged = actions.every(
      (action, i) => codes[i] === DEFAULT_BINDINGS[action]?.[device]?.[slot]
    );
    const bound = codes.filter(Boolean);
    const missing = !unchanged && bound.length === 0;
    // Bindings are compact: an empty first slot means the action has no key,
    // shown as a dash; an empty later slot is an optional key, hidden.
    kbd.hidden = missing && slot > 0;
    kbd.textContent = !missing
      ? unchanged
        ? originalText.get(kbd)
        : joinKeyLabels(bound.map((code) => formatBindingLabel(code, device)))
      : '—';
  });
}

/** Fills the hints now and again whenever the control settings change. */
export function followBindingHints(eventBus, settings) {
  fillBindingHints(settings.getCategoryValues('controls'));
  eventBus.on('settings-controls-changed', ({ values } = {}) => {
    if (values) fillBindingHints(values);
  });
}
