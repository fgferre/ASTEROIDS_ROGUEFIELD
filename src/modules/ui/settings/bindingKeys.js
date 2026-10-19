// src/modules/ui/settings/bindingKeys.js
//
// The words for a key or pad binding: the label a binding button shows, the
// key code a captured key event stands for, and its normalized spelling.

import {
  PAD_BUTTON_GLYPHS,
  PAD_STICK_GLYPHS,
} from '../../../data/constants/gamepad.js';

export function formatBindingLabel(value, device) {
  if (!value) {
    return 'Set';
  }

  if (device === 'keyboard') {
    if (value.startsWith('Key') && value.length === 4) {
      return value.slice(3).toUpperCase();
    }
    if (value.startsWith('Digit')) {
      return value.slice(5);
    }
    if (value === 'Space') {
      return 'Spacebar';
    }
    if (value === 'Escape') {
      return 'Esc';
    }
    if (value.startsWith('Arrow')) {
      return `Arrow ${value.slice(5)}`;
    }
    if (value.startsWith('Shift')) {
      return 'Shift';
    }
    if (value.startsWith('Control')) {
      return 'Ctrl';
    }
    if (value.startsWith('Alt')) {
      return 'Alt';
    }
    return value;
  }

  if (device === 'gamepad') {
    if (value.startsWith('button:')) {
      const index = Number(value.split(':')[1]);
      return PAD_BUTTON_GLYPHS[index] ?? `Button ${index}`;
    }
    if (value.startsWith('axis:')) {
      const [, index, direction] = value.split(':');
      const negative = direction === 'negative' || direction === '-';
      const stick = PAD_STICK_GLYPHS[Math.floor(Number(index) / 2)];
      if (!stick) {
        return `Axis ${index} ${negative ? '−' : '+'}`;
      }
      const arrows = Number(index) % 2 === 0 ? ['←', '→'] : ['↑', '↓'];
      return `${stick} ${arrows[negative ? 0 : 1]}`;
    }
  }

  return value;
}

export function resolveKeyboardBindingFromPayload(payload = {}) {
  const event = payload?.event;
  if (event && typeof event.code === 'string' && event.code.length > 0) {
    return event.code;
  }

  if (typeof payload?.code === 'string' && payload.code.length > 0) {
    return normalizeCapturedKeyboardCode(payload.code);
  }

  const key =
    typeof payload?.key === 'string' && payload.key.length > 0
      ? payload.key
      : event?.key;
  if (typeof key === 'string' && key.length > 0) {
    return normalizeCapturedKeyboardCode(key);
  }

  return '';
}

function normalizeCapturedKeyboardCode(input) {
  if (typeof input !== 'string') {
    return '';
  }

  if (input === ' ') {
    return 'Space';
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  const lower = trimmed.toLowerCase();

  if (lower.startsWith('key') && lower.length === 4) {
    return `Key${lower.slice(3).toUpperCase()}`;
  }

  if (lower.startsWith('digit') && lower.length === 6) {
    return `Digit${lower.slice(5)}`;
  }

  if (lower.startsWith('numpad')) {
    return `Numpad${lower.slice(6)}`;
  }

  if (lower.startsWith('arrow')) {
    return `Arrow${lower.slice(5, 6).toUpperCase()}${lower.slice(6)}`;
  }

  if (lower === 'space' || lower === 'spacebar') {
    return 'Space';
  }

  if (lower === 'escape' || lower === 'esc') {
    return 'Escape';
  }

  if (lower === 'enter') {
    return 'Enter';
  }

  if (lower === 'tab') {
    return 'Tab';
  }

  if (lower === 'backspace') {
    return 'Backspace';
  }

  if (lower === 'delete') {
    return 'Delete';
  }

  if (lower.startsWith('shift')) {
    return `Shift${lower.slice(5, 6).toUpperCase()}${lower.slice(6)}`;
  }

  if (lower.startsWith('control')) {
    return `Control${lower.slice(7, 8).toUpperCase()}${lower.slice(8)}`;
  }

  if (lower.startsWith('ctrl')) {
    return `Control${lower.slice(4, 5).toUpperCase()}${lower.slice(5)}`;
  }

  if (lower.startsWith('alt')) {
    return `Alt${lower.slice(3, 4).toUpperCase()}${lower.slice(4)}`;
  }

  if (lower.startsWith('meta')) {
    return `Meta${lower.slice(4, 5).toUpperCase()}${lower.slice(5)}`;
  }

  if (/^f\d{1,2}$/.test(lower)) {
    return lower.toUpperCase();
  }

  if (trimmed.length === 1) {
    if (trimmed === ' ') {
      return 'Space';
    }
    return trimmed.toUpperCase();
  }

  return `${trimmed[0].toUpperCase()}${trimmed.slice(1)}`;
}
