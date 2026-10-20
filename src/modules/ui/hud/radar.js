// src/modules/ui/hud/radar.js
//
// The radar's rules, shared by every radar model (hud/instruments/radar/):
// TacticalHud gathers the field each frame and buildRadarState turns it into
// the radar state documented in hud/instruments/registry.js — what is in
// range and in the camera's view, the rim markers and crowds beyond the
// range, the blip budget and the calm / threat / Warden mode.

import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { CASTER_SHELL_RADIUS } from '../../../content/enemies/caster.js';

// Blips after merging; RADAR_RESERVED of them always go to pickups and Wardens.
export const RADAR_BUDGET = 80;
export const RADAR_RESERVED = 8;
// More than RADAR_CROWD of a kind in one of RADAR_SECTORS directions beyond
// the range merge into one wedge with a count.
export const RADAR_CROWD = 6;
const RADAR_SECTORS = 16;
const SECTOR = (Math.PI * 2) / RADAR_SECTORS;
// Threat mode starts at once and holds this long after the last threat.
export const THREAT_HOLD_MS = 3000;
// A machine faster than the ship's top speed (220) is a fast threat.
const FAST_SPEED = 240; // proposta 20/10
// "Near the view": this far outside it, in field units.
const THREAT_MARGIN = 120; // proposta 20/10
// XP orbs gather into cells this wide; the heaviest HAZE_MAX cells show.
const HAZE_CELL = 80; // proposta 20/10
const HAZE_MAX = 16;
// Sensor Jam: noise dots instead of contacts, re-rolled every RADAR_NOISE_MS.
const RADAR_NOISE_DOTS = 28;
const RADAR_NOISE_MS = 90;
const FIELD = Object.freeze({ width: GAME_WIDTH, height: GAME_HEIGHT });
// Kept first when the budget is short: lower first, then the nearest.
const RANK = {
  herald: 0,
  warden: 1,
  shell: 1,
  elite: 2,
  fast: 3,
  machine: 4,
  pickup: 5,
  rock: 6,
};
// What gets a rim marker beyond the range: threats. A Warden never does (the
// screen-edge marker shows it), nor rocks, pickups or shells.
const RIM_KINDS = new Set(['machine', 'elite', 'herald']);

/** Radar glyph for an enemy: rock, machine, elite, herald or warden. */
export function radarGlyph(enemy) {
  if (enemy.type === 'boss') return 'warden';
  if (enemy.type === 'herald') return 'herald';
  if (enemy.type === 'asteroid') return 'rock';
  return enemy.elite ? 'elite' : 'machine';
}

/** What buildRadarState keeps between frames: the threat hold, the noise. */
export function createRadarMemory() {
  return {
    threatUntil: -Infinity,
    noise: [],
    noiseAt: -Infinity,
    random: new RandomService('radar-jam'),
  };
}

const special = (blip) => blip.kind === 'warden' || blip.kind === 'pickup';
const byRank = (a, b) => RANK[a.kind] - RANK[b.kind] || a.distance - b.distance;

/**
 * The blips the radar draws: RADAR_RESERVED slots go to pickups and Wardens
 * first, the rest by rank up to RADAR_BUDGET; the most important last, so
 * they draw on top.
 */
export function budgetBlips(blips) {
  const sorted = blips.slice().sort(byRank);
  const kept = [];
  const others = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const blip = sorted[i];
    if (special(blip) && kept.length < RADAR_RESERVED) kept.push(blip);
    else others.push(blip);
  }
  for (let i = 0; i < others.length && kept.length < RADAR_BUDGET; i += 1) {
    kept.push(others[i]);
  }
  return kept.sort(byRank).reverse();
}

/**
 * Rim markers for the threats beyond the range, by kind and direction: one
 * chevron each, or one wedge (`count`) for more than RADAR_CROWD of a kind
 * in one sector.
 */
export function rimMarkers(beyond) {
  const groups = new Map();
  for (let i = 0; i < beyond.length; i += 1) {
    const b = beyond[i];
    const sector =
      Math.round(Math.atan2(b.y, b.x) / SECTOR + RADAR_SECTORS) % RADAR_SECTORS;
    const key = `${b.kind}:${sector}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const markers = [];
  for (const [key, list] of groups) {
    if (list.length <= RADAR_CROWD) {
      for (let i = 0; i < list.length; i += 1) markers.push(rim(list[i]));
      continue;
    }
    const angle = Number(key.split(':')[1]) * SECTOR;
    let nearest = Infinity;
    for (let i = 0; i < list.length; i += 1) {
      nearest = Math.min(nearest, list[i].distance);
    }
    markers.push({
      kind: list[0].kind,
      rim: true,
      angle,
      x: Math.cos(angle),
      y: Math.sin(angle),
      distance: nearest,
      count: list.length,
    });
  }
  return markers;
}

function rim(b) {
  const angle = Math.atan2(b.y, b.x);
  return {
    kind: b.kind,
    rim: true,
    angle,
    x: Math.cos(angle),
    y: Math.sin(angle),
    distance: b.distance,
    count: 1,
  };
}

/** Next radar mode: the Warden's fight, else threat (held), else calm. */
export function radarMode(memory, { warden, threat, now }) {
  if (threat) memory.threatUntil = now + THREAT_HOLD_MS;
  if (warden) return 'warden';
  return now < memory.threatUntil ? 'threat' : 'calm';
}

function noise(memory, now) {
  if (now - memory.noiseAt >= RADAR_NOISE_MS) {
    memory.noiseAt = now;
    memory.noise = Array.from({ length: RADAR_NOISE_DOTS }, () => ({
      kind: 'noise',
      x: memory.random.range(-0.85, 0.85),
      y: memory.random.range(-0.85, 0.85),
      inView: false,
      rim: false,
      distance: 0,
    }));
  }
  return memory.noise;
}

/**
 * The radar state for this frame (registry.js documents it). `input`:
 * { ship: { x, y, angle }, range, jammed, view (the camera's, or null),
 * enemies, pickups, orbs (XP), shots (enemy bullets), now (ms) }.
 */
export function buildRadarState(input, memory) {
  const { ship, range, view, now } = input;
  const inView = (x, y) =>
    view !== null &&
    x >= view.x &&
    x <= view.x + view.width &&
    y >= view.y &&
    y <= view.y + view.height;
  const nearView = (x, y) =>
    view === null
      ? Math.hypot(x - ship.x, y - ship.y) <= range
      : x >= view.x - THREAT_MARGIN &&
        x <= view.x + view.width + THREAT_MARGIN &&
        y >= view.y - THREAT_MARGIN &&
        y <= view.y + view.height + THREAT_MARGIN;

  const blips = [];
  const beyond = [];
  let warden = false;
  let threat = false;
  // A blip at (x, y): in range, or beyond it (rim kinds only); the blip in
  // range is returned for its details.
  const contact = (kind, x, y) => {
    const dx = x - ship.x;
    const dy = y - ship.y;
    const distance = Math.hypot(dx, dy);
    const blip = { kind, x: dx / range, y: dy / range, distance };
    if (distance <= range) {
      blip.inView = inView(x, y);
      blip.rim = false;
      blips.push(blip);
      return blip;
    }
    // On the rim a fast machine is a machine.
    blip.kind = kind === 'fast' ? 'machine' : kind;
    if (RIM_KINDS.has(blip.kind)) beyond.push(blip);
    return null;
  };

  const { enemies } = input;
  for (let i = 0; i < enemies.length; i += 1) {
    const enemy = enemies[i];
    let kind = radarGlyph(enemy);
    const speed = Math.hypot(enemy.vx, enemy.vy);
    if (kind === 'machine' && speed > FAST_SPEED) kind = 'fast';
    if (kind === 'warden') warden = true;
    if ((kind === 'elite' || kind === 'fast') && nearView(enemy.x, enemy.y)) {
      threat = true;
    }
    const blip = contact(kind, enemy.x, enemy.y);
    if (blip) {
      blip.phased = Boolean(enemy.intangible);
      blip.size = enemy.radius / range;
      blip.heading =
        speed > 1
          ? Math.atan2(enemy.vy, enemy.vx)
          : Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
    }
    const { shell } = enemy;
    if (shell) {
      if (nearView(shell.x, shell.y)) threat = true;
      const landing = contact('shell', shell.x, shell.y);
      if (landing) {
        landing.size = CASTER_SHELL_RADIUS / range;
        landing.progress = enemy.shellProgress;
      }
    }
  }

  const { shots } = input;
  for (let i = 0; i < shots.length && !threat; i += 1) {
    const s = shots[i];
    const towardShip = (ship.x - s.x) * s.vx + (ship.y - s.y) * s.vy > 0;
    if (towardShip && nearView(s.x, s.y)) threat = true;
  }

  const { pickups } = input;
  for (let i = 0; i < pickups.length; i += 1) {
    contact('pickup', pickups[i].x, pickups[i].y);
  }

  const mode = radarMode(memory, { warden, threat, now });
  const state = { range, jammed: input.jammed, mode, ship, field: FIELD, view };
  if (input.jammed) {
    state.blips = noise(memory, now);
    state.haze = [];
    return state;
  }
  state.blips = budgetBlips(blips.concat(rimMarkers(beyond)));
  state.haze = gatherHaze(input.orbs, ship, range, inView);
  return state;
}

// XP orbs in range, gathered into HAZE_CELL cells: one haze per cell.
function gatherHaze(orbs, ship, range, inView) {
  const cells = new Map();
  for (let i = 0; i < orbs.length; i += 1) {
    const orb = orbs[i];
    if (orb.collected) continue;
    if (Math.hypot(orb.x - ship.x, orb.y - ship.y) > range) continue;
    const key = `${Math.floor(orb.x / HAZE_CELL)}:${Math.floor(orb.y / HAZE_CELL)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.x += orb.x;
      cell.y += orb.y;
      cell.weight += 1;
    } else {
      cells.set(key, { x: orb.x, y: orb.y, weight: 1 });
    }
  }
  return [...cells.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, HAZE_MAX)
    .map((cell) => {
      const x = cell.x / cell.weight;
      const y = cell.y / cell.weight;
      return {
        x: (x - ship.x) / range,
        y: (y - ship.y) / range,
        weight: cell.weight,
        inView: inView(x, y),
      };
    });
}
