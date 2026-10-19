// src/modules/ui/hud/hudCommon.js

export const FADE_OUT_MS = 300;
export const FEED_MAX_ROWS = 4;

/** Restarts a CSS animation class on an element. */
export function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}
