// src/modules/ui/hud/hudCommon.js

import { BOSS_CONFIG } from '../../../data/constants/visual.js';

export const FADE_OUT_MS = 300;
export const FEED_MAX_ROWS = 4;
// HUD.md: an on-demand instrument fades to 35 % after 4 s without change.
export const ON_DEMAND_MS = 4000;
// The combo shows from its second kill.
export const COMBO_VISIBLE_MIN = 2;

/** Restarts a CSS animation class on an element. */
export function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/** Combo color tier: text < 1.3×, status 1.3–1.6×, xp 1.7–1.9×, boss at 2.0×. */
export function comboTier(multiplier) {
  const m = Number(multiplier) || 1;
  if (m >= 1.999) return 'boss';
  if (m > 1.601) return 'xp';
  if (m >= 1.299) return 'status';
  return 'text';
}

/**
 * An on-demand instrument (HUD.md): `wake(now)` when its value changes,
 * `update(now)` each frame; `el` carries `is-awake` for ON_DEMAND_MS after
 * the last wake (the CSS fades it to 35 % when the class goes).
 */
export function onDemand(el) {
  let wokeAt = -Infinity;
  let awake = null;
  return {
    wake(now) {
      wokeAt = now;
    },
    update(now) {
      const next = now - wokeAt < ON_DEMAND_MS;
      if (next === awake) return;
      awake = next;
      el.classList.toggle('is-awake', next);
    },
  };
}

/**
 * Boss bar segments left → right ({ left, width } in %, state). Health
 * drains right to left, so phase 0 is the rightmost segment; segments to
 * its right are spent, to its left still ahead. Boundaries come from the
 * Warden's phase thresholds when they match the count, else equal parts.
 */
export function bossSegments(
  phaseCount,
  phase,
  thresholds = BOSS_CONFIG.phaseThresholds
) {
  const total = Math.max(1, Math.floor(Number(phaseCount) || 1));
  const bounds =
    Array.isArray(thresholds) && thresholds.length === total - 1
      ? [0, ...[...thresholds].sort((a, b) => a - b).map((t) => t * 100), 100]
      : Array.from({ length: total + 1 }, (_, i) => (i / total) * 100);
  const current = total - 1 - Math.min(total - 1, Math.max(0, phase || 0));
  return Array.from({ length: total }, (_, i) => ({
    left: bounds[i],
    width: bounds[i + 1] - bounds[i],
    state: i === current ? 'current' : i > current ? 'spent' : 'ahead',
  }));
}
