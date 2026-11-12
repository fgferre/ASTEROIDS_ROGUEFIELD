// src/bootstrap/botPilotAdapter.js
//
// Feeds the playtest bot (botPilot.js) from the running systems and writes
// its keys through InputSystem's key handlers, the way the golden trace's
// scripted pilot does; takes the level-up cards by its card policy. Used by
// the bot's tests and the playtest command (tests/playtest/); no DOM.

import { BOSS_KINDS } from '../data/enemies/boss.js';
import { DASH_IMPULSE } from '../data/constants/gameplay.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/GameConstants.js';
import { createFixedStepper } from '../core/fixedStep.js';
import { createBotPilot, pickCard } from './botPilot.js';

// A Sentinel's own hazards, besides its `telegraph`, by field name.
const BOSS_ZONES = ['barrier', 'sectors', 'beams', 'arms', 'grid', 'lock'];
const KEYS = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  dash: 'ShiftLeft',
  shield: 'KeyE',
};

// A parasite rock bites from a little way off (its look gives it away).
const reachOf = (e) =>
  e.variant === 'parasite' ? (e.behavior?.minDistance || 25) + 6 : 0;

const zoneOf = (t, owner) => ({
  ...t,
  ox: owner.x,
  oy: owner.y,
  or: owner.radius || 20,
  ref: t,
});

// How open a boss is to full damage, from what its view draws (0..1).
function openness(boss) {
  const bays = (boss.bays || []).map((bay) => bay.open || 0);
  return Math.max(
    boss.ventOpen || 0,
    boss.crownOpen || 0,
    boss.jawOpen || 0,
    ...bays
  );
}

// A caster's marked point or shell in the air: a blast disc at the landing,
// timed by what its view shows (the aim ring's charge, the shell's flight).
function artilleryZones(enemy) {
  const params = enemy.recipe?.behaviors?.['lob-shell'];
  if (!params) return [];
  const zones = [];
  if (enemy.shell) {
    zones.push({
      type: 'shell',
      x: enemy.shell.x,
      y: enemy.shell.y,
      radius: params.radius,
      timer: (1 - (enemy.shellProgress ?? 0)) * params.flight,
      ref: enemy.shell,
    });
  }
  if (enemy.aim) {
    zones.push({
      type: 'shell',
      x: enemy.aim.x,
      y: enemy.aim.y,
      radius: params.radius,
      timer:
        (1 - (enemy.telegraphRatio ?? 0)) * params.telegraph + params.flight,
      ref: enemy,
    });
  }
  return zones;
}

// A swinging arm's turn rate, as seen from one look to the next.
function armSpin(arms, time, memory) {
  const angle = arms.segments?.[0]?.angle;
  const last = memory.get(arms);
  memory.set(arms, { angle, time });
  if (!last || !(time > last.time) || !Number.isFinite(angle)) return 0;
  const turn = Math.atan2(
    Math.sin(angle - last.angle),
    Math.cos(angle - last.angle)
  );
  return turn / (time - last.time);
}

/**
 * What a player sees, as the bot's `world` (botPilot.js): the ship, the
 * moving bodies, the telegraphs, the loot and the boss's exposed state.
 * `memory` (a WeakMap, kept between calls) tracks what moves between looks.
 */
export function readWorld(services, time, memory = new WeakMap()) {
  const { player, enemies, combat } = services;
  const shield = player.shield;
  const ship = {
    x: player.position.x,
    y: player.position.y,
    vx: player.velocity.vx,
    vy: player.velocity.vy,
    radius: player.getHullBoundingRadius(),
    maxSpeed: player.flight.maxSpeed,
    acceleration: player.flight.acceleration,
    damping: player.flight.baseLinearDamping,
    braking: player.flight.brakingDamping,
    dashReady: player.maneuvers.canDash() && !(player.dashTimer > 0),
    dashImpulse: DASH_IMPULSE * player.maneuvers.dashDistanceMultiplier,
    shieldReady:
      shield.shieldUpgradeLevel > 0 &&
      !shield.isShieldActive &&
      !(shield.shieldCooldownTimer > 0),
    invulnerable: player.invulnerableTimer || 0,
    health: player.health,
    maxHealth: player.maxHealth,
  };
  const movers = [];
  const zones = [];
  let boss = null;
  enemies.forEachActiveEnemy((e) => {
    if (e.destroyed) return;
    if (e.proximityRadius > 0) {
      zones.push({ type: 'mine', ...pick(e), ref: e });
    } else {
      movers.push({
        x: e.x,
        y: e.y,
        vx: e.vx || 0,
        vy: e.vy || 0,
        radius: (e.radius || 10) + reachOf(e),
        kind:
          e.type === 'asteroid' ? 'rock' : e.type === 'boss' ? 'boss' : 'enemy',
        ref: e,
      });
    }
    if (e.telegraph) zones.push(zoneOf(e.telegraph, e));
    zones.push(...artilleryZones(e));
    if (e.type !== 'boss') return;
    const kind = BOSS_KINDS[e.bossKind] || {};
    for (const field of BOSS_ZONES) {
      if (!e[field]?.type) continue;
      const zone = zoneOf(e[field], e);
      if (field === 'arms') zone.spin = armSpin(e.arms, time, memory);
      zones.push(zone);
    }
    for (const pool of e.pools || []) {
      zones.push({ type: 'pools', pools: [pool], ref: pool });
    }
    for (const core of e.cores || []) {
      if (core.alive) movers.push(still(core, kind.coreRadius || 28));
    }
    if (e.shellOpen >= 0.5) {
      for (const plate of e.plates || []) {
        movers.push(still(plate, kind.plateRadius || 16));
      }
    }
    if (!boss) {
      boss = {
        x: e.x,
        y: e.y,
        radius: e.radius,
        facing: e.facing,
        shieldUp: e.shieldUp || 0,
        open: openness(e),
      };
    }
  });
  for (const b of combat.enemyBullets || []) {
    movers.push({
      x: b.x,
      y: b.y,
      vx: b.vx || 0,
      vy: b.vy || 0,
      radius: b.radius || 3,
      kind: 'bullet',
      ref: b,
    });
  }
  return {
    time,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    ship,
    movers,
    zones,
    loot: readLoot(services, ship),
    boss,
  };
}

const pick = (e) => ({
  x: e.x,
  y: e.y,
  armed: Boolean(e.armed),
  proximityRadius: e.proximityRadius,
  explosionRadius: e.explosionRadius,
});

const still = (body, radius) => ({
  x: body.x,
  y: body.y,
  vx: 0,
  vy: 0,
  radius,
  kind: 'enemy',
  ref: body,
});

function readLoot(services, ship) {
  const loot = [];
  for (const orb of services['xp-orbs']?.getActiveOrbs?.() || []) {
    loot.push({ x: orb.x, y: orb.y });
  }
  for (const item of services.pickups?.getActivePickups?.() || []) {
    if (!item.claimed) loot.push({ x: item.x, y: item.y });
  }
  if (ship.health < ship.maxHealth) {
    for (const heart of services.healthHearts?.hearts || []) {
      if (!heart.collected) loot.push({ x: heart.x, y: heart.y });
    }
  }
  return loot;
}

const keyEvent = (code) => ({
  key: code.slice(3).toLowerCase(),
  code,
  preventDefault() {},
  stopPropagation() {},
});

/**
 * The bot at the controls of a running game: call step() once before each
 * game step. `cards` lists the card ids it took, in order.
 */
export function createBotDriver({
  services,
  eventBus,
  preset = 'average',
  knobs,
  seed = 1,
  stepSeconds = createFixedStepper().step,
}) {
  const pilot = createBotPilot({ preset, knobs, seed });
  const memory = new WeakMap();
  const cards = [];
  let offer = null;
  let held = [];
  let frame = 0;
  eventBus.on('upgrade-options-ready', (payload = {}) => {
    offer = payload.options || [];
  });

  return {
    pilot,
    cards,
    step() {
      if (offer) {
        const id = pickCard(offer);
        offer = null;
        if (id && services.progression.applyUpgrade(id)) cards.push(id);
      }
      const keys = pilot.step(readWorld(services, frame * stepSeconds, memory));
      const next = Object.keys(KEYS)
        .filter((name) => keys[name])
        .map((name) => KEYS[name]);
      const { input } = services;
      held
        .filter((code) => !next.includes(code))
        .forEach((code) => input.onKeyUp(keyEvent(code)));
      next
        .filter((code) => !held.includes(code))
        .forEach((code) => input.onKeyDown(keyEvent(code)));
      held = next;
      frame += 1;
    },
  };
}
