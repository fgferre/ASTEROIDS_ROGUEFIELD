import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
  keyEvent,
} from '../__helpers__/headlessGame.js';
import { deserialize, serialize } from '../../src/core/replay.js';
import { STARTING_DRAW } from '../../src/data/hangar.js';

const STEPS = 600;
const SCRIPT = [
  '',
  'W',
  'W',
  'WAe',
  'WA',
  'Wh',
  'S',
  'A',
  'A',
  'W',
  'g',
  'A',
  'W',
  'WDh',
  'WDt',
  'WA',
  'WD',
  'WAe',
  'A',
  'At',
];
const KEY = {
  W: 'KeyW',
  A: 'KeyA',
  S: 'KeyS',
  D: 'KeyD',
  e: 'KeyE',
  g: 'KeyG',
  t: 'KeyT',
  h: 'ShiftLeft',
};
let restoreDom;
beforeEach(() => {
  restoreDom = installDomStubs();
});
afterEach(() => {
  vi.restoreAllMocks();
  GamePools.releaseAll();
  restoreDom();
});

function profileA(game) {
  const h = game.session.resolveServiceInstance('hangar');
  for (const id of [
    'reinforced-plating',
    'spare-capacitor',
    'reroll-1',
    'seal-1',
    'hold',
    'flight-school',
  ])
    h.owned[id] = true;
  h.sealed = [STARTING_DRAW[0]];
  h.setStartingCard(h.getFlightSchoolCards()[0]);
}
function snap(game, label) {
  const { player, progression } = game.services;
  const s = {
    label,
    maxHealth: player.maxHealth,
    health: player.health,
    rerolls: progression.rerollsLeft,
    holds: progression.holdsLeft,
    sealed: [...progression.sealedCards].join(','),
    startingCard: progression.startingCard,
    applied: [...progression.appliedUpgrades.keys()].join(','),
    pos: `${player.position.x.toFixed(3)},${player.position.y.toFixed(3)}`,
    level: progression.level,
  };
  return s;
}
function pick(game) {
  if (game.takeOfferedUpgrade()) {
    const { progression } = game.services;
    progression.applyUpgrade(progression.pendingUpgradeOptions[0].id);
  }
}

describe('replay Hangar setup', () => {
  it("plays the recorder's Hangar setup, not the viewer's", () => {
    const live = createHeadlessGame();
    profileA(live);
    live.session.startNewRun({ source: 'test' });
    live.services.progression.levelCost = () => 10;
    live.services.progression.experienceToNext = 10;
    const a0 = snap(live, 'A start');
    const input = live.services.input;
    const press = (l) => input.onKeyDown(keyEvent(KEY[l]));
    const release = (l) => input.onKeyUp(keyEvent(KEY[l]));
    let held = [];
    let taps = [];
    for (let i = 0; i < STEPS; i += 1) {
      pick(live);
      if (i % 30 === 0) {
        const keys = [...SCRIPT[i / 30]];
        const nh = keys.filter((k) => k === k.toUpperCase());
        held.filter((k) => !nh.includes(k)).forEach(release);
        nh.filter((k) => !held.includes(k)).forEach(press);
        held = nh;
        taps = keys.filter((k) => k !== k.toUpperCase());
        taps.forEach(press);
      } else if (taps.length) {
        taps.forEach(release);
        taps = [];
      }
      live.step();
    }
    const aEnd = snap(live, 'A end');
    const recording = deserialize(
      serialize(live.session.replayRecorder.toJSON())
    );

    const run = (label, prep) => {
      restoreDom();
      restoreDom = installDomStubs();
      const g = createHeadlessGame();
      prep?.(g);
      g.controller.arm(recording);
      g.session.startNewRun({ source: 'test' });
      g.services.progression.levelCost = () => 10;
      g.services.progression.experienceToNext = 10;
      const s0 = snap(g, label + ' start');
      for (let i = 0; i < STEPS; i += 1) {
        g.controller.tick();
        g.step();
      }
      return [s0, snap(g, label + ' end')];
    };
    let viewerHangar;
    const [b0, bEnd] = run('B(empty)', (g) => {
      viewerHangar = g.session.resolveServiceInstance('hangar');
    });
    expect(viewerHangar.getModifiers().hullMultiplier).toBe(1);
    expect(viewerHangar.sealed).toEqual([]);
    expect(b0).toEqual({ ...a0, label: b0.label });
    expect(bEnd).toEqual({ ...aEnd, label: bEnd.label });
    expect(a0.maxHealth).toBe(105);
    expect(a0.rerolls).toBe(3);
  });
});
