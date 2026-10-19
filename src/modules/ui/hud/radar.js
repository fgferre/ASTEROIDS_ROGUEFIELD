// src/modules/ui/hud/radar.js

const RADAR_SIZE = 220;
const RADAR_POOL_SIZE = 80;
// Sensor Jam: noise dots on the radar, re-rolled every RADAR_NOISE_MS.
export const RADAR_NOISE_DOTS = 28;
export const RADAR_NOISE_MS = 90;
// A phased Shade's blip (it can't be hit or locked while phased).
const RADAR_PHASED_ALPHA = 0.35; // proposta 18/10

/** Radar blip glyph for an enemy: rock, machine, elite, herald or warden. */
export function radarGlyph(enemy) {
  if (enemy.type === 'boss') return 'warden';
  if (enemy.type === 'herald') return 'herald';
  if (enemy.type === 'asteroid') return 'rock';
  return enemy.elite ? 'elite' : 'machine';
}

/** The pooled blip elements, hidden, inside the radar's blip container. */
export function createBlipPool(container) {
  const pool = [];
  for (let i = 0; i < RADAR_POOL_SIZE; i += 1) {
    const el = document.createElement('div');
    el.className = 'blip machine';
    el.dataset.type = 'machine';
    el.style.display = 'none';
    container.appendChild(el);
    pool.push(el);
  }
  return pool;
}

/**
 * Lays `list` ([{x: -1..1, y: -1..1, type, phased}]) out on the pooled blips;
 * the pool's spare blips are hidden.
 */
export function drawBlips(pool, list) {
  const count = Math.min(list.length, pool.length);
  for (let i = 0; i < pool.length; i += 1) {
    const el = pool[i];
    if (i >= count) {
      if (el.style.display !== 'none') el.style.display = 'none';
      continue;
    }
    const b = list[i];
    const type = b.type || 'machine';
    if (el.dataset.type !== type) {
      el.dataset.type = type;
      el.className = 'blip ' + type;
    }
    el.style.display = '';
    const opacity = b.phased ? String(RADAR_PHASED_ALPHA) : '';
    if (el.style.opacity !== opacity) el.style.opacity = opacity;
    const x = ((b.x + 1) / 2) * RADAR_SIZE;
    const y = ((b.y + 1) / 2) * RADAR_SIZE;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
}
