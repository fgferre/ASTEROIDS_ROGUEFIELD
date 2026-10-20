// src/modules/ui/hud/editor/layoutStore.js
//
// HUD layouts as the settings keep them and players share them. The
// built-in presets live in data/ui/hudPresets.js; the player's own are
// `video.hudPresets` in the settings service, [{ id, name, items }], and
// `video.hudLayout` is the active one's id. A layout code ("Copy layout
// code") is CODE_PREFIX and the items as base64url of a compact JSON array.
// Everything here is pure: lists in, new lists out; nothing read from a
// setting or a code is trusted before sanitizeItems has checked it.

import {
  DEFAULT_HUD_PRESET,
  HUD_PRESETS,
  getHudPreset,
} from '../../../../data/ui/hudPresets.js';
import { listInstruments } from '../instruments/registry.js';

export const MAX_USER_PRESETS = 20;
export const MAX_NAME_LENGTH = 24;
export const SCALE_RANGE = Object.freeze({ min: 0.6, max: 1.6 });
export const OPACITY_RANGE = Object.freeze({ min: 0.2, max: 1 });
export const CODE_PREFIX = 'HUD1.';
const MAX_CODE_LENGTH = 4000;
const OFFSET_LIMIT = 4000;
// Codes carry the anchor as its index here: append, never reorder.
export const ANCHORS = Object.freeze([
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'top-stretch',
  'bottom-stretch',
  'screen',
]);

const clamp = (n, { min, max }) => Math.min(max, Math.max(min, n));
const hundredths = (n) => Math.round(n * 100) / 100;

/**
 * What a layout may hold, from the instrument registry and the default
 * preset: its slots in order, each slot's models, and the slots drawn on
 * the whole screen (on the ship), which never move.
 */
export function instrumentCatalog() {
  const items = getHudPreset(DEFAULT_HUD_PRESET).items;
  return {
    slots: items.map((item) => item.slot),
    screen: new Set(
      items.filter((item) => item.anchor === 'screen').map((i) => i.slot)
    ),
    models: Object.fromEntries(
      items.map(({ slot }) => [slot, listInstruments(slot).map((m) => m.id)])
    ),
  };
}

// One item checked against the catalog, or null.
function sanitizeItem(raw, catalog) {
  if (!raw || typeof raw !== 'object') return null;
  const { slot, model, anchor } = raw;
  if (!catalog.slots.includes(slot)) return null;
  if (!catalog.models[slot].includes(model)) return null;
  if (!ANCHORS.includes(anchor)) return null;
  const onShip = catalog.screen.has(slot);
  if ((anchor === 'screen') !== onShip) return null;
  const numbers = [raw.x, raw.y, raw.scale ?? 1, raw.opacity ?? 1].map(Number);
  if (!numbers.every(Number.isFinite)) return null;
  const [x, y, scale, opacity] = numbers;
  const offset = (n) =>
    onShip
      ? 0
      : Math.round(clamp(n, { min: -OFFSET_LIMIT, max: OFFSET_LIMIT }));
  return {
    slot,
    model,
    anchor,
    x: offset(x),
    y: offset(y),
    scale: hundredths(clamp(scale, SCALE_RANGE)),
    opacity: hundredths(clamp(opacity, OPACITY_RANGE)),
    visible: raw.visible !== false,
    plate: Boolean(raw.plate),
  };
}

/**
 * A clean copy of `items` in the catalog's slot order — every slot once,
 * each with a model it has, offsets whole, scale and opacity in range — or
 * null when they cannot be a layout.
 */
export function sanitizeItems(items, catalog) {
  if (!Array.isArray(items) || items.length !== catalog.slots.length) {
    return null;
  }
  const bySlot = new Map();
  for (const raw of items) {
    const item = sanitizeItem(raw, catalog);
    if (!item || bySlot.has(item.slot)) return null;
    bySlot.set(item.slot, item);
  }
  return catalog.slots.map((slot) => bySlot.get(slot));
}

const stretched = (anchor) => anchor.endsWith('-stretch');

/**
 * `item` showing `model` instead. A model drawn across the frame (the
 * Classic Warden bar and XP line) and one drawn at a point need different
 * anchors: across that line the item takes the place the first built-in
 * preset with that model gives it; otherwise it stays where it is.
 */
export function withModel(item, model) {
  const home = Object.values(HUD_PRESETS)
    .flatMap((preset) => preset.items)
    .find((other) => other.slot === item.slot && other.model === model);
  if (!home || stretched(home.anchor) === stretched(item.anchor)) {
    return { ...item, model };
  }
  const { anchor, x, y } = home;
  return { ...item, model, anchor, x, y };
}

/** A preset name as stored: spaces folded, trimmed, MAX_NAME_LENGTH long. */
export function cleanName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

/** The player's presets from the setting: the valid ones, at most MAX_USER_PRESETS. */
export function readUserPresets(raw, catalog) {
  if (!Array.isArray(raw)) return [];
  const presets = [];
  for (const entry of raw) {
    if (presets.length >= MAX_USER_PRESETS) break;
    const id = entry?.id;
    const name = cleanName(entry?.name);
    const items = sanitizeItems(entry?.items, catalog);
    if (typeof id !== 'string' || !/^user-\d+$/.test(id)) continue;
    if (!name || !items || presets.some((p) => p.id === id)) continue;
    presets.push({ id, name, items });
  }
  return presets;
}

/** Every preset, built-in first: { id, name, builtIn, items }. */
export function allPresets(userPresets) {
  return [
    ...Object.values(HUD_PRESETS).map(({ id, label, items }) => ({
      id,
      name: label,
      builtIn: true,
      items,
    })),
    ...userPresets.map((preset) => ({ ...preset, builtIn: false })),
  ];
}

/** The preset with `id`, or null. */
export function findPreset(id, userPresets) {
  return allPresets(userPresets).find((preset) => preset.id === id) ?? null;
}

/**
 * The layout the settings ask for: `video.hudLayout`'s preset among the
 * built-ins and `video.hudPresets`, or the default preset when it is gone.
 */
export function activePreset(video, catalog) {
  const userPresets = readUserPresets(video?.hudPresets, catalog);
  return (
    findPreset(video?.hudLayout, userPresets) ??
    findPreset(DEFAULT_HUD_PRESET, userPresets)
  );
}

/** `name`, or "name (2)", "name (3)"… so no other preset is called that. */
export function uniqueName(name, userPresets, exceptId = null) {
  const taken = new Set(
    allPresets(userPresets)
      .filter((preset) => preset.id !== exceptId)
      .map((preset) => preset.name.toLowerCase())
  );
  const base = cleanName(name) || 'My Layout';
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, MAX_NAME_LENGTH - suffix.length).trim()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * `userPresets` with a new preset of `items` named `name` (made unique):
 * { presets, id }, or null when MAX_USER_PRESETS are already saved.
 */
export function addPreset(userPresets, name, items) {
  if (userPresets.length >= MAX_USER_PRESETS) return null;
  const next =
    userPresets.reduce(
      (max, preset) => Math.max(max, Number(preset.id.slice(5)) || 0),
      0
    ) + 1;
  const id = `user-${next}`;
  const preset = { id, name: uniqueName(name, userPresets), items };
  return { presets: [...userPresets, preset], id };
}

/** `userPresets` with preset `id` saved as `items`. */
export function storePreset(userPresets, id, items) {
  return userPresets.map((preset) =>
    preset.id === id ? { ...preset, items } : preset
  );
}

/** `userPresets` with preset `id` called `name` (made unique). */
export function renamePreset(userPresets, id, name) {
  return userPresets.map((preset) =>
    preset.id === id
      ? { ...preset, name: uniqueName(name, userPresets, id) }
      : preset
  );
}

/** `userPresets` without preset `id`. */
export function removePreset(userPresets, id) {
  return userPresets.filter((preset) => preset.id !== id);
}

// base64url of an ASCII string, and back (atob throws on a bad alphabet).
const toBase64Url = (text) =>
  btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (code) =>
  atob(code.replace(/-/g, '+').replace(/_/g, '/'));

/** The layout code of `items`: one line to copy and share. */
export function encodeLayout(items) {
  const rows = items.map((item) => [
    item.slot,
    item.model,
    ANCHORS.indexOf(item.anchor),
    item.x,
    item.y,
    Math.round(item.scale * 100),
    Math.round(item.opacity * 100),
    (item.visible ? 1 : 0) | (item.plate ? 2 : 0),
  ]);
  return CODE_PREFIX + toBase64Url(JSON.stringify(rows));
}

const rejected = (error) => ({ ok: false, error });

/**
 * A pasted code read back: { ok: true, items } or { ok: false, error } with
 * a line for the player. Never throws, whatever is pasted.
 */
export function decodeLayout(code, catalog) {
  const text = String(code ?? '').replace(/\s+/g, '');
  if (!text) return rejected('Paste a layout code first.');
  if (!text.startsWith(CODE_PREFIX)) {
    return rejected("That isn't a HUD layout code.");
  }
  let rows;
  try {
    if (text.length > MAX_CODE_LENGTH) throw new Error('too long');
    rows = JSON.parse(fromBase64Url(text.slice(CODE_PREFIX.length)));
  } catch {
    return rejected('That code is damaged. Copy it again.');
  }
  const shaped =
    Array.isArray(rows) &&
    rows.every((row) => Array.isArray(row) && row.length === 8);
  if (!shaped) return rejected('That code is damaged. Copy it again.');
  const items = sanitizeItems(
    rows.map(([slot, model, anchor, x, y, scale, opacity, flags]) => ({
      slot,
      model,
      anchor: ANCHORS[anchor],
      x,
      y,
      scale: Number(scale) / 100,
      opacity: Number(opacity) / 100,
      visible: (flags & 1) === 1,
      plate: (flags & 2) === 2,
    })),
    catalog
  );
  if (!items) {
    return rejected("That code doesn't match this game's instruments.");
  }
  return { ok: true, items };
}
