// src/modules/input/keyBindings.js
//
// The controls' bindings, for InputSystem (`input`): the Settings schema's
// fields, the keys and pad buttons each action is bound to (with the key
// names a browser may send for the same key), and which actions a key press
// holds. The maps stay on the input system, under the same names.

import SETTINGS_SCHEMA from '../../data/settingsSchema.js';
import { asArray } from '../upgradeCatalog.js';

export const CONTROLS_CATEGORY_ID = 'controls';
// The move actions: their keys keep the page from scrolling.
const MOVEMENT_ACTIONS = new Set([
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
]);

function clone(value) {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('[InputSystem] Failed to clone value:', error);
    return value;
  }
}

export function resolveControlFieldMap(input) {
  const schema = Array.isArray(SETTINGS_SCHEMA) ? SETTINGS_SCHEMA : [];
  const category = schema.find((entry) => entry.id === CONTROLS_CATEGORY_ID);
  if (!category) {
    return new Map();
  }

  const map = new Map();
  category.fields.forEach((field) => {
    map.set(field.key, field);
    const threshold = Number(field.metadata?.gamepad?.threshold);
    if (Number.isFinite(threshold)) {
      input.gamepadAxisThreshold = threshold;
    }
  });
  return map;
}

export function extractDefaultsFromSchema(input) {
  const defaults = {};
  input.controlFieldDefinitions.forEach((field, key) => {
    defaults[key] = clone(field.default) || { keyboard: [], gamepad: [] };
  });
  return defaults;
}

function resetBindingMaps(input) {
  input.keyboardBindingMap.clear();
  input.gamepadButtonMap.clear();
  input.gamepadAxisMap.clear();
  input.movementBindings.clear();
  input.actionBindings = {};
}

export function applyControlSettings(input, values = {}) {
  resetBindingMaps(input);

  Object.entries(values).forEach(([action, bindingValue]) => {
    const field = input.controlFieldDefinitions.get(action);
    if (field && field.type !== 'binding') {
      return;
    }
    const normalized = normalizeBindingStructure(bindingValue);
    input.actionBindings[action] = normalized;

    if (field) {
      const threshold = Number(field.metadata?.gamepad?.threshold);
      if (Number.isFinite(threshold)) {
        input.gamepadAxisThreshold = threshold;
      }
    }

    registerKeyboardBindings(input, action, normalized.keyboard, field);
    registerGamepadBindings(input, action, normalized.gamepad);
  });
}

function normalizeBindingStructure(binding) {
  if (!binding || typeof binding !== 'object') {
    return { keyboard: [], gamepad: [] };
  }

  return {
    keyboard: asArray(binding.keyboard).filter(Boolean),
    gamepad: asArray(binding.gamepad).filter(Boolean),
  };
}

export function collectKeyboardActions(input, ...inputs) {
  const actions = new Set();
  inputs
    .filter((name) => typeof name === 'string' && name.length > 0)
    .forEach((name) => {
      const normalized = name.toLowerCase();
      const mapped = input.keyboardBindingMap.get(normalized);
      if (mapped) {
        mapped.forEach((action) => actions.add(action));
      }
    });
  return actions;
}

function parseGamepadBinding(binding) {
  if (typeof binding !== 'string') {
    return null;
  }

  const normalized = binding.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('button:')) {
    const index = Number(normalized.split(':')[1]);
    return Number.isInteger(index) ? { type: 'button', index } : null;
  }

  if (normalized.startsWith('axis:')) {
    const parts = normalized.split(':');
    if (parts.length < 3) {
      return null;
    }
    const index = Number(parts[1]);
    if (!Number.isInteger(index)) {
      return null;
    }
    const directionPart = parts[2];
    const direction =
      directionPart.startsWith('-') || directionPart === 'negative'
        ? 'negative'
        : 'positive';
    return { type: 'axis', index, direction };
  }

  return null;
}

export function normalizeKeyboardBinding(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function getKeyboardSynonyms(binding) {
  const synonyms = new Set();
  if (!binding) {
    return synonyms;
  }

  if (binding.startsWith('key') && binding.length === 4) {
    synonyms.add(binding.slice(3));
  }

  if (binding === 'space') {
    synonyms.add(' ');
    synonyms.add('spacebar');
  }

  if (binding.startsWith('shift')) {
    synonyms.add('shift');
  }

  if (binding.startsWith('control')) {
    synonyms.add('control');
    synonyms.add('ctrl');
  }

  if (binding.startsWith('alt')) {
    synonyms.add('alt');
  }

  if (binding.startsWith('meta')) {
    synonyms.add('meta');
  }

  return synonyms;
}

function addKeyboardBinding(input, binding, action) {
  if (!binding) {
    return;
  }

  if (!input.keyboardBindingMap.has(binding)) {
    input.keyboardBindingMap.set(binding, new Set());
  }

  input.keyboardBindingMap.get(binding).add(action);

  if (isMovementAction(action)) {
    input.movementBindings.add(binding);
  }
}

function registerKeyboardBindings(input, action, bindings = []) {
  const entries = asArray(bindings);
  entries.forEach((binding) => {
    const normalized = normalizeKeyboardBinding(binding);
    if (!normalized) {
      return;
    }

    addKeyboardBinding(input, normalized, action);
    const synonyms = getKeyboardSynonyms(normalized);
    synonyms.forEach((synonym) => addKeyboardBinding(input, synonym, action));
  });
}

function registerGamepadBindings(input, action, bindings = []) {
  const entries = asArray(bindings);
  entries.forEach((binding) => {
    const parsed = parseGamepadBinding(binding);
    if (!parsed) {
      return;
    }

    if (parsed.type === 'button') {
      const key = `button:${parsed.index}`;
      if (!input.gamepadButtonMap.has(key)) {
        input.gamepadButtonMap.set(key, new Set());
      }
      input.gamepadButtonMap.get(key).add(action);
    } else if (parsed.type === 'axis') {
      const key = `axis:${parsed.index}:${parsed.direction}`;
      if (!input.gamepadAxisMap.has(key)) {
        input.gamepadAxisMap.set(key, new Set());
      }
      input.gamepadAxisMap.get(key).add(action);
    }
  });
}

function isMovementAction(action) {
  return MOVEMENT_ACTIONS.has(action);
}

export function isMovementBinding(input, binding) {
  if (!binding) {
    return false;
  }
  return input.movementBindings.has(binding.toLowerCase());
}
