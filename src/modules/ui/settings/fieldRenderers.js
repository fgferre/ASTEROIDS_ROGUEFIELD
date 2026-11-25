// src/modules/ui/settings/fieldRenderers.js
//
// The DOM for one settings row (toggle, range, select, segmented, binding,
// the HUD layout picker and the HUD editor's button), built from a schema
// field, its current value and its category's values, and the text of a
// range value. SettingsPanel owns the events and the redraw.

import { formatBindingLabel } from './bindingKeys.js';
import {
  allPresets,
  instrumentCatalog,
  readUserPresets,
} from '../hud/editor/layoutStore.js';
import { asArray } from '../../upgradeCatalog.js';

// `options.inactive`: why the row is greyed (SettingsPanel decides): the
// reason replaces the description and the controls are disabled.
// `options.device`: the device a binding row shows.
export function renderSettingField(
  categoryId,
  field,
  value,
  values = {},
  options = {}
) {
  if (field.control === 'segmented') {
    return renderSegmentedField(categoryId, field, value, options);
  }
  switch (field.type) {
    case 'hudLayout':
      return renderHudLayoutField(categoryId, field, value, values, options);
    case 'hudPresets':
      return renderHudEditField(categoryId, field, value, options);
    case 'toggle':
      return renderToggleField(categoryId, field, value, options);
    case 'range':
      return renderRangeField(categoryId, field, value, options);
    case 'select':
      return renderSelectField(categoryId, field, value, options);
    case 'binding':
      return renderBindingField(categoryId, field, value, options);
    default: {
      const { wrapper } = fieldShell('div', categoryId, field, options);
      return wrapper;
    }
  }
}

// One row: `.settings-field__body` (label, description, the preview line the
// panel adds) on the left, `.settings-field__control` on the right.
function fieldShell(tag, categoryId, field, options, modifier = '') {
  const wrapper = document.createElement(tag);
  wrapper.className = `settings-field${modifier ? ` ${modifier}` : ''}${
    options.inactive ? ' is-inactive' : ''
  }`;
  wrapper.dataset.settingKey = field.key;
  wrapper.dataset.settingCategory = categoryId;

  const body = document.createElement('div');
  body.className = 'settings-field__body';
  const label = document.createElement('span');
  label.className = 'settings-field__label';
  label.textContent = field.label || field.key;
  body.appendChild(label);
  const note =
    options.inactive || (options.hideDescription ? '' : field.description);
  if (note) {
    const description = document.createElement('p');
    description.className = 'settings-field__description';
    description.textContent = note;
    body.appendChild(description);
  }
  wrapper.appendChild(body);

  const control = document.createElement('div');
  control.className = 'settings-field__control';
  wrapper.appendChild(control);
  return { wrapper, body, label, control };
}

function renderToggleField(categoryId, field, value, options) {
  const { wrapper, control } = fieldShell(
    'label',
    categoryId,
    field,
    options,
    'settings-field--toggle'
  );
  const on = Boolean(value ?? field.default);

  const state = document.createElement('span');
  state.className = 'settings-field__state';
  state.textContent = on ? 'On' : 'Off';
  control.appendChild(state);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = on;
  input.disabled = Boolean(options.inactive);
  input.dataset.settingKey = field.key;
  input.dataset.settingCategory = categoryId;
  control.appendChild(input);
  return wrapper;
}

function renderRangeField(categoryId, field, value, options) {
  const { wrapper, control } = fieldShell(
    'div',
    categoryId,
    field,
    options,
    'settings-field--range'
  );
  const numericValue = Number.isFinite(Number(value))
    ? Number(value)
    : Number(field.default ?? field.min ?? 0);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = field.min ?? 0;
  slider.max = field.max ?? 1;
  slider.step = field.step ?? 0.1;
  slider.value = String(numericValue);
  slider.disabled = Boolean(options.inactive);
  slider.dataset.settingKey = field.key;
  slider.dataset.settingCategory = categoryId;
  slider.className = 'settings-range-input';
  slider.setAttribute('aria-label', field.label || field.key);
  control.appendChild(slider);

  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'settings-field__value';
  valueDisplay.dataset.valueFor = field.key;
  valueDisplay.textContent = formatRangeValue(field, numericValue);
  control.appendChild(valueDisplay);
  return wrapper;
}

function renderSelectField(categoryId, field, value, options = {}) {
  const { wrapper, label, control } = fieldShell(
    'div',
    categoryId,
    field,
    options,
    'settings-field--select'
  );
  const selectId = `setting-${categoryId}-${field.key}`;
  // A label for the select, not a bare span.
  label.setAttribute('id', `${selectId}-label`);

  const select = document.createElement('select');
  select.id = selectId;
  select.className = 'settings-select-input';
  select.dataset.settingKey = field.key;
  select.dataset.settingCategory = categoryId;
  select.setAttribute('aria-labelledby', `${selectId}-label`);

  const choices = asArray(field.options);
  const optionLabels =
    (field.optionLabels && typeof field.optionLabels === 'object'
      ? field.optionLabels
      : {}) || {};

  choices.forEach((optionValue) => {
    const optionElement = document.createElement('option');
    optionElement.value = optionValue;
    optionElement.textContent =
      optionLabels[optionValue] ?? String(optionValue);
    select.appendChild(optionElement);
  });

  const defaultValue =
    typeof value === 'string' && value
      ? value
      : typeof field.default === 'string'
        ? field.default
        : choices[0];

  if (defaultValue !== undefined && defaultValue !== null) {
    select.value = defaultValue;
  }

  if (choices.length === 0 || options.inactive) {
    select.disabled = true;
  }

  control.appendChild(select);
  return wrapper;
}

// The active HUD layout: the built-in presets, then the player's own.
function renderHudLayoutField(categoryId, field, value, values, options) {
  const layouts = allPresets(
    readUserPresets(values.hudPresets, instrumentCatalog())
  ).map(({ id, name, builtIn }) => ({ id, name, builtIn }));
  const wrapper = renderSelectField(
    categoryId,
    { ...field, options: [] },
    value,
    options
  );
  const select = wrapper.querySelector('.settings-select-input');
  select.disabled = Boolean(options.inactive);
  [
    ['Presets', layouts.filter((layout) => layout.builtIn)],
    ['Your Layouts', layouts.filter((layout) => !layout.builtIn)],
  ].forEach(([label, group]) => {
    if (group.length === 0) return;
    const optgroup = document.createElement('optgroup');
    optgroup.setAttribute('label', label);
    group.forEach(({ id, name }) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  });
  select.value = layouts.some((layout) => layout.id === value)
    ? value
    : field.default;
  return wrapper;
}

// The way into the HUD editor (SettingsPanel opens it), with the count of
// layouts saved.
function renderHudEditField(categoryId, field, value, options) {
  const saved = asArray(value).length;
  const { wrapper, control } = fieldShell(
    'div',
    categoryId,
    {
      ...field,
      description: `${field.description} ${
        saved === 1 ? '1 layout saved.' : `${saved || 'No'} layouts saved.`
      }`,
    },
    options,
    'settings-field--wide'
  );

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--secondary settings-hud-edit';
  button.dataset.action = 'edit-hud-layout';
  button.textContent = 'Edit HUD Layout';
  control.appendChild(button);
  return wrapper;
}

// A select shown as one button per option; a click sets it at once.
function renderSegmentedField(categoryId, field, value, options) {
  const { wrapper, label, control } = fieldShell(
    'div',
    categoryId,
    field,
    options,
    'settings-field--wide'
  );
  label.id = `setting-${categoryId}-${field.key}-label`;

  const group = document.createElement('div');
  group.className = 'settings-segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', label.id);
  const current = value ?? field.default;
  asArray(field.options).forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-segment';
    button.disabled = Boolean(options.inactive);
    button.dataset.settingKey = field.key;
    button.dataset.settingCategory = categoryId;
    button.dataset.segmentValue = option;
    button.setAttribute('aria-pressed', String(option === current));
    button.textContent = field.optionLabels?.[option] ?? option;
    group.appendChild(button);
  });
  control.appendChild(group);
  return wrapper;
}

// A binding row: the label (the reason, when greyed) and the capture
// buttons of one device, `options.device` (keyboard when unset).
function renderBindingField(categoryId, field, value = {}, options = {}) {
  const device = options.device || 'keyboard';
  // A binding row names the action; only the reason adds a line.
  const { wrapper, control } = fieldShell(
    'div',
    categoryId,
    field,
    { ...options, hideDescription: true },
    'settings-field--binding'
  );

  const bindings = asArray(value?.[device]);
  const metadata = field.metadata?.[device] || {};
  const maxSlots = Math.max(
    Number(metadata.max) ||
      bindings.length ||
      asArray(field.default?.[device]).length,
    1
  );

  for (let slot = 0; slot < maxSlots; slot += 1) {
    const bindingValue = bindings[slot] ?? '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      slot === 0 && !bindingValue
        ? 'settings-binding-btn is-unbound'
        : 'settings-binding-btn';
    button.disabled = Boolean(options.inactive);
    button.dataset.action = 'capture-binding';
    button.dataset.settingKey = field.key;
    button.dataset.settingCategory = categoryId;
    button.dataset.bindingDevice = device;
    button.dataset.slot = String(slot);
    button.dataset.label = bindingValue;
    button.textContent = bindingValue
      ? formatBindingLabel(bindingValue, device)
      : 'Set';
    control.appendChild(button);
  }
  return wrapper;
}

export function formatRangeValue(field, value) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  const isPercentage = Number(field.max) === 1 && Number(field.min) === 0;
  if (isPercentage || field.key === 'hudScale') {
    return `${Math.round(value * 100)}%`;
  }

  return value.toFixed(2).replace(/\.00$/, '');
}
