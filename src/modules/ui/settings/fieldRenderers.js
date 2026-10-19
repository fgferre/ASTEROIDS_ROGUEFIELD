// src/modules/ui/settings/fieldRenderers.js
//
// The DOM for one settings row (toggle, range, select, segmented, binding),
// built from a schema field and its current value, and the text of a range
// value. SettingsPanel owns the events and the redraw.

import { formatBindingLabel } from './bindingKeys.js';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

export function renderSettingField(categoryId, field, value) {
  if (field.control === 'segmented') {
    return renderSegmentedField(categoryId, field, value);
  }
  switch (field.type) {
    case 'toggle':
      return renderToggleField(categoryId, field, value);
    case 'range':
      return renderRangeField(categoryId, field, value);
    case 'select':
      return renderSelectField(categoryId, field, value);
    case 'binding':
      return renderBindingField(categoryId, field, value);
    default: {
      const wrapper = document.createElement('div');
      wrapper.className = 'settings-field';
      const label = document.createElement('span');
      label.className = 'settings-field__label';
      label.textContent = field.label || field.key;
      wrapper.appendChild(label);
      if (field.description) {
        const description = document.createElement('p');
        description.className = 'settings-field__description';
        description.textContent = field.description;
        wrapper.appendChild(description);
      }
      return wrapper;
    }
  }
}

function renderToggleField(categoryId, field, value) {
  const wrapper = document.createElement('label');
  wrapper.className = 'settings-field settings-field--toggle';
  wrapper.dataset.settingKey = field.key;
  wrapper.dataset.settingCategory = categoryId;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(value ?? field.default);
  input.dataset.settingKey = field.key;
  input.dataset.settingCategory = categoryId;
  wrapper.appendChild(input);

  const body = document.createElement('div');
  body.className = 'settings-field__body';

  const label = document.createElement('span');
  label.className = 'settings-field__label';
  label.textContent = field.label;
  body.appendChild(label);

  if (field.description) {
    const description = document.createElement('p');
    description.className = 'settings-field__description';
    description.textContent = field.description;
    body.appendChild(description);
  }

  wrapper.appendChild(body);
  return wrapper;
}

function renderRangeField(categoryId, field, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'settings-field settings-field--range';
  wrapper.dataset.settingKey = field.key;
  wrapper.dataset.settingCategory = categoryId;

  const header = document.createElement('div');
  header.className = 'settings-field__header';

  const label = document.createElement('span');
  label.className = 'settings-field__label';
  label.textContent = field.label;
  header.appendChild(label);

  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'settings-field__value';
  valueDisplay.dataset.valueFor = field.key;
  const numericValue = Number.isFinite(Number(value))
    ? Number(value)
    : Number(field.default ?? field.min ?? 0);
  valueDisplay.textContent = formatRangeValue(field, numericValue);
  header.appendChild(valueDisplay);

  wrapper.appendChild(header);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = field.min ?? 0;
  slider.max = field.max ?? 1;
  slider.step = field.step ?? 0.1;
  slider.value = String(numericValue);
  slider.dataset.settingKey = field.key;
  slider.dataset.settingCategory = categoryId;
  slider.className = 'settings-range-input';
  wrapper.appendChild(slider);

  if (field.description) {
    const description = document.createElement('p');
    description.className = 'settings-field__description';
    description.textContent = field.description;
    wrapper.appendChild(description);
  }

  return wrapper;
}

function renderSelectField(categoryId, field, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'settings-field settings-field--select';
  wrapper.dataset.settingKey = field.key;
  wrapper.dataset.settingCategory = categoryId;

  const label = document.createElement('label');
  const selectId = `setting-${categoryId}-${field.key}`;
  label.className = 'settings-field__label';
  label.setAttribute('for', selectId);
  label.textContent = field.label || field.key;
  wrapper.appendChild(label);

  const select = document.createElement('select');
  select.id = selectId;
  select.className = 'settings-select-input';
  select.dataset.settingKey = field.key;
  select.dataset.settingCategory = categoryId;

  const options = ensureArray(field.options);
  const optionLabels =
    (field.optionLabels && typeof field.optionLabels === 'object'
      ? field.optionLabels
      : {}) || {};

  options.forEach((optionValue) => {
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
        : options[0];

  if (defaultValue !== undefined && defaultValue !== null) {
    select.value = defaultValue;
  }

  if (options.length === 0) {
    select.disabled = true;
  }

  wrapper.appendChild(select);

  if (field.description) {
    const description = document.createElement('p');
    description.className = 'settings-field__description';
    description.textContent = field.description;
    wrapper.appendChild(description);
  }

  return wrapper;
}

// A select shown as one button per option; a click sets it at once.
function renderSegmentedField(categoryId, field, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'settings-field settings-field--wide';
  wrapper.dataset.settingKey = field.key;
  wrapper.dataset.settingCategory = categoryId;

  const label = document.createElement('span');
  label.className = 'settings-field__label';
  label.id = `setting-${categoryId}-${field.key}-label`;
  label.textContent = field.label;
  wrapper.appendChild(label);

  const group = document.createElement('div');
  group.className = 'settings-segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', label.id);
  const current = value ?? field.default;
  ensureArray(field.options).forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-segment';
    button.dataset.settingKey = field.key;
    button.dataset.settingCategory = categoryId;
    button.dataset.segmentValue = option;
    button.setAttribute('aria-pressed', String(option === current));
    button.textContent = field.optionLabels?.[option] ?? option;
    group.appendChild(button);
  });
  wrapper.appendChild(group);

  if (field.description) {
    const description = document.createElement('p');
    description.className = 'settings-field__description';
    description.textContent = field.description;
    wrapper.appendChild(description);
  }
  return wrapper;
}

function renderBindingField(categoryId, field, value = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'settings-field settings-field--binding';
  wrapper.dataset.settingKey = field.key;
  wrapper.dataset.settingCategory = categoryId;

  const header = document.createElement('div');
  header.className = 'settings-field__header';

  const label = document.createElement('span');
  label.className = 'settings-field__label';
  label.textContent = field.label;
  header.appendChild(label);

  if (field.description) {
    const description = document.createElement('p');
    description.className = 'settings-field__description';
    description.textContent = field.description;
    header.appendChild(description);
  }

  wrapper.appendChild(header);

  const groups = document.createElement('div');
  groups.className = 'settings-binding__groups';

  const devices = ['keyboard', 'gamepad'];
  devices.forEach((device) => {
    const bindings = ensureArray(value?.[device]);
    const metadata = field.metadata?.[device] || {};
    const maxSlots = Math.max(
      Number(metadata.max) ||
        bindings.length ||
        ensureArray(field.default?.[device]).length,
      1
    );

    const deviceGroup = document.createElement('div');
    deviceGroup.className = `settings-binding__group settings-binding__group--${device}`;

    const deviceTitle = document.createElement('span');
    deviceTitle.className = 'settings-binding__device';
    deviceTitle.textContent =
      metadata.label || (device === 'keyboard' ? 'Keyboard' : 'Gamepad');
    deviceGroup.appendChild(deviceTitle);

    const list = document.createElement('div');
    list.className = 'settings-binding__list';

    for (let slot = 0; slot < maxSlots; slot += 1) {
      const bindingValue = bindings[slot] ?? '';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-binding-btn';
      button.dataset.action = 'capture-binding';
      button.dataset.settingKey = field.key;
      button.dataset.settingCategory = categoryId;
      button.dataset.device = device;
      button.dataset.slot = String(slot);
      button.dataset.label = bindingValue;
      button.textContent = bindingValue
        ? formatBindingLabel(bindingValue, device)
        : 'Set';
      list.appendChild(button);
    }

    deviceGroup.appendChild(list);
    groups.appendChild(deviceGroup);
  });

  wrapper.appendChild(groups);
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

  if (field.key === 'screenShakeIntensity') {
    return `${Math.round(value * 100)}%`;
  }

  return value.toFixed(2).replace(/\.00$/, '');
}
