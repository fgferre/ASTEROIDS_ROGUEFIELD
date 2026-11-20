import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../__helpers__/headlessGame.js';
import { FlightBriefing } from '../../src/modules/ui/FlightBriefing.js';
import CodexService from '../../src/services/CodexService.js';
import { deserialize, serialize } from '../../src/core/replay.js';

const STEPS = 300;
let restoreDom;

beforeEach(() => {
  restoreDom = installDomStubs();
});
afterEach(() => {
  vi.restoreAllMocks();
  GamePools.releaseAll();
  restoreDom();
});

function cheap(game) {
  const { progression } = game.services;
  progression.levelCost = () => 10;
  progression.experienceToNext = 10;
}

function roundTrip(game) {
  return deserialize(serialize(game.session.replayRecorder.toJSON()));
}

function pickFirstCard(game) {
  if (game.takeOfferedUpgrade()) {
    const { progression } = game.services;
    progression.applyUpgrade(progression.pendingUpgradeOptions[0].id);
  }
}

describe('replay fidelity', () => {
  it("a replayed run writes nothing to the player's save", () => {
    const live = createHeadlessGame();
    live.session.startNewRun({ source: 'test' });
    cheap(live);
    for (let i = 0; i < STEPS; i += 1) {
      pickFirstCard(live);
      live.step();
    }
    const recording = roundTrip(live);

    const game = createHeadlessGame();
    const hangar = game.session.resolveServiceInstance('hangar');
    // Not built by the harness (nothing depends on it): the real class on the bus.
    const codex = new CodexService({ eventBus: game.eventBus });
    game.controller.arm(recording);
    game.session.startNewRun({ source: 'test' });
    cheap(game);
    const salvage = hangar.salvage;
    const medals = Object.keys(hangar.achievements.unlocked).length;
    const seen = Object.keys(codex.seen).length;

    const setItem = vi.spyOn(window.localStorage, 'setItem');
    for (let i = 0; i < STEPS; i += 1) {
      game.controller.tick();
      game.step();
    }
    game.services.world.handlePlayerDeath();
    // What a played replay emits as it goes on.
    const { eventBus } = game;
    eventBus.emit('wave-complete', { wave: 1 });
    eventBus.emit('boss-spawned', {
      enemy: { type: 'boss', bossKind: 'prime' },
    });
    eventBus.emit('herald-spawned', { kind: 'heat' });
    eventBus.emit('boss-defeated', { bossKind: 'prime' });

    // 'roguefield.lastSeed' (a dot) is a never-read diagnostic from the boot path.
    const saved = setItem.mock.calls
      .map(([key]) => key)
      .filter((key) => key.startsWith('roguefield:'));
    expect(saved).toEqual([]);
    expect(hangar.salvage).toBe(salvage);
    expect(Object.keys(hangar.achievements.unlocked)).toHaveLength(medals);
    expect(Object.keys(codex.seen)).toHaveLength(seen);
  });

  it('a replay passes the flight briefing on its own', () => {
    // The card's prerequisites, held by both the recorded run and its replay.
    const givePrereqs = (game) => {
      const { appliedUpgrades } = game.services.progression;
      appliedUpgrades.set('braking_system', 3);
      appliedUpgrades.set('rcs_system', 3);
      appliedUpgrades.set('auto_aim', 1);
    };
    const live = createHeadlessGame();
    live.session.startNewRun({ source: 'test' });
    cheap(live);
    givePrereqs(live);
    let took = false;
    for (let i = 0; i < STEPS; i += 1) {
      if (i === 5) live.services.progression.collectXP(10);
      if (live.takeOfferedUpgrade()) {
        const { progression } = live.services;
        progression.applyUpgrade(
          took ? progression.pendingUpgradeOptions[0].id : 'flight_computer'
        );
        took = true;
      }
      live.step();
    }
    const recording = roundTrip(live);
    expect(recording.upgrades.map(([, e]) => e?.upgradeId ?? e)).toContain(
      'flight_computer'
    );

    const game = createHeadlessGame();
    const { session, eventBus, ui } = game;
    // The real FlightBriefing on the real bus; the two UI calls it makes
    // (showScreen, showGameUI) do what UISystem does.
    const bridge = {
      eventBus,
      registerEventListener: (name, fn) => eventBus.on(name, fn),
      showScreen(name, { show = true, emitEvent = true } = {}) {
        if (!show) return;
        session.setScreen(name);
        if (emitEvent) eventBus.emit('screen-changed', { screen: name });
      },
      showGameUI() {
        if (ui.flightBriefing.openNext()) return;
        session.setScreen('playing');
        eventBus.emit('screen-changed', { screen: 'playing' });
      },
    };
    globalThis.document.getElementById = () => null;
    ui.flightBriefing = new FlightBriefing(
      {
        screen: { focus() {}, style: { setProperty() {} } },
        continueBtn: { addEventListener() {} },
      },
      bridge
    );
    ui.showGameUI = bridge.showGameUI;

    // The briefing ignores Continue for a short wall-clock lockout, so time
    // has to move like real frames.
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    game.controller.arm(recording);
    session.startNewRun({ source: 'test' });
    cheap(game);
    givePrereqs(game);
    let stepped = 0;
    for (let frames = 0; frames < 4000 && stepped < STEPS; frames += 1) {
      now += 16;
      if (stepped === 5 && frames === 5)
        game.services.progression.collectXP(10);
      game.controller.tick();
      if (session.isRunning()) {
        game.step();
        stepped += 1;
      }
    }

    expect(stepped).toBe(recording.steps);
    expect(session.getScreen()).toBe('playing');
    expect(ui.flightBriefing.isVisible).toBe(false);
  });

  it('a replay repeats the cards a hold kept back', () => {
    const LEVEL_UP_STEPS = [5, 60, 120];
    const watchOffers = (game) => {
      const offers = [];
      game.eventBus.on('upgrade-options-ready', (payload = {}) => {
        offers.push((payload.options ?? []).map((o) => o.id));
      });
      return offers;
    };
    const giveHolds = (game) => {
      // Holds come from the Hangar's contract: give the run two.
      game.services.progression.holdsPerRun = 2;
      game.services.progression.holdsLeft = 2;
    };

    const live = createHeadlessGame();
    live.session.startNewRun({ source: 'test' });
    cheap(live);
    giveHolds(live);
    const { progression } = live.services;
    const liveOffers = watchOffers(live);
    let level = 0;
    let held = null;
    for (let i = 0; i < STEPS; i += 1) {
      if (LEVEL_UP_STEPS.includes(i)) progression.collectXP(10);
      if (live.takeOfferedUpgrade()) {
        const options = progression.pendingUpgradeOptions.map((o) => o.id);
        let pick = options[0];
        if (level === 0) {
          held = options[1];
          expect(progression.holdUpgrade(held)).not.toBeNull();
        } else if (level === 1 && options.includes(held)) {
          pick = held;
        }
        level += 1;
        progression.applyUpgrade(pick);
      }
      live.step();
    }
    const recording = roundTrip(live);
    const recorded = live.snapshot();

    const replay = createHeadlessGame();
    const replayOffers = watchOffers(replay);
    replay.controller.arm(recording);
    replay.session.startNewRun({ source: 'test' });
    cheap(replay);
    giveHolds(replay);
    for (let i = 0; i < STEPS; i += 1) {
      if (LEVEL_UP_STEPS.includes(i)) replay.services.progression.collectXP(10);
      replay.controller.tick();
      replay.step();
    }

    expect(replayOffers).toEqual(liveOffers);
    expect(replay.snapshot()).toEqual(recorded);
  });
});
