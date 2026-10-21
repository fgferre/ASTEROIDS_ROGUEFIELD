import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';
import { LEVEL_UP_SCREEN_DELAY_SECONDS } from '../../../src/core/GameConstants.js';
import RandomService from '../../../src/core/RandomService.js';
import ProgressionSystem from '../../../src/modules/ProgressionSystem.js';
import UISystem from '../../../src/modules/UISystem.js';
import { LevelUpScreen } from '../../../src/modules/ui/LevelUpScreen.js';
import {
  CARD_STAGGER_MS,
  LEVELUP_EXIT_MS,
  playLevelUpExit,
  staggerCardEntry,
} from '../../../src/modules/ui/levelUpTransition.js';

function fakeNode(rect = { left: 0, top: 0, width: 0, height: 0 }, id = '') {
  const classes = new Set();
  const props = {};
  return {
    dataset: { upgradeId: id },
    classes,
    props,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    style: { setProperty: (name, value) => (props[name] = value) },
    getBoundingClientRect: () => rect,
  };
}

const cardRect = (left) => ({ left, top: 200, width: 200, height: 300 });

describe('Level-up card transition', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('staggers the cards in by 60 ms each', () => {
    const cards = [fakeNode(), fakeNode(), fakeNode()];
    staggerCardEntry(cards);

    expect(cards.map((card) => card.props['--enter-delay'])).toEqual([
      '0ms',
      `${CARD_STAGGER_MS}ms`,
      `${2 * CARD_STAGGER_MS}ms`,
    ]);
    cards.forEach((card) => expect(card.classes.has('is-entering')).toBe(true));
  });

  it('flies the pick to the HUD, drops the rest, resumes after 350 ms', () => {
    const screen = fakeNode();
    const cards = [100, 400, 700].map((left) => fakeNode(cardRect(left)));
    const target = fakeNode({ left: 40, top: 820, width: 120, height: 30 });
    const done = vi.fn();
    staggerCardEntry(cards);

    playLevelUpExit({
      screen,
      cards,
      picked: cards[1],
      target,
      reducedMotion: false,
      done,
    });

    expect(screen.classes.has('is-leaving')).toBe(true);
    expect([...cards[1].classes]).toEqual(['is-picked']);
    expect([...cards[0].classes]).toEqual(['is-dismissed']);
    expect([...cards[2].classes]).toEqual(['is-dismissed']);
    expect(cards[1].props).toMatchObject({
      '--fly-x': '-400px',
      '--fly-y': '485px',
    });

    vi.advanceTimersByTime(LEVELUP_EXIT_MS - 1);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(screen.classes.has('is-leaving')).toBe(false);
  });

  it('resumes at once with reduced motion', () => {
    const screen = fakeNode();
    const cards = [fakeNode(cardRect(0))];
    const done = vi.fn();

    const timer = playLevelUpExit({
      screen,
      cards,
      picked: cards[0],
      target: null,
      reducedMotion: true,
      done,
    });

    expect(timer).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
    expect(cards[0].classes.size).toBe(0);
    expect(screen.classes.size).toBe(0);
  });

  describe('on the level-up screen', () => {
    let restoreDom;
    beforeEach(() => {
      restoreDom = installDomStubs();
    });
    afterEach(() => restoreDom());

    it('keeps the cards locked while they leave', () => {
      const screen = fakeNode();
      document.getElementById = (id) =>
        id === 'levelup-screen' ? screen : null;
      const cards = ['a', 'b'].map((id, i) => fakeNode(cardRect(i * 300), id));
      const levelUp = new LevelUpScreen({
        prefersReducedMotion: () => false,
        showGameUI: vi.fn(),
      });
      levelUp.levelUpState.buttons = cards;
      const locked = () => levelUp.isLevelUpLocked();

      levelUp.leaveLevelUp('b');

      expect(cards[1].classes.has('is-picked')).toBe(true);
      expect(locked()).toBe(true);
      vi.advanceTimersByTime(LEVELUP_EXIT_MS);
      expect(levelUp.showGameUI).toHaveBeenCalledTimes(1);
    });

    it('deals one card per upgrade when UISystem hears the offer', () => {
      const parent = () => ({
        children: [],
        appendChild(child) {
          this.children.push(...(child.children ?? [child]));
        },
      });
      document.createDocumentFragment = parent;
      document.createElement = () => ({
        ...fakeNode(),
        addEventListener: () => {},
        focus: () => {},
      });
      const container = parent();
      const showScreen = vi.fn();
      const handlers = new Map();
      const card = (id) => ({
        id,
        family: 'thermal',
        rarity: 'common',
        levels: [{}],
        text: { name: id, levels: [{ description: 'Fire rate +11%.' }] },
      });
      const progression = {
        upgradeLookup: new Map(['a', 'b', 'c'].map((id) => [id, card(id)])),
        getUpgradeCount: () => 0,
        getFamilyCounts: () => ({ thermal: 0 }),
      };
      UISystem.prototype.setupEventListeners.call({
        levelUpScreen: new LevelUpScreen({
          refs: { container },
          progression: () => progression,
          combat: () => ({
            getWeaponState: () => ({ weaponId: 'lance', chip: 'LANCE' }),
          }),
          showScreen,
          showCardsTip: () => {},
          prefersReducedMotion: () => true,
          previewBuild: () => {},
        }),
        registerEventListener: (name, fn) => handlers.set(name, fn),
      });

      handlers.get('upgrade-options-ready')({
        level: 3,
        options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      });

      expect(showScreen).toHaveBeenCalledWith('levelup', {
        overlay: true,
        show: true,
      });
      expect(container.children.map((card) => card.dataset.upgradeId)).toEqual([
        'a',
        'b',
        'c',
      ]);
      expect(container.children[0].classes.has('is-focused')).toBe(true);
    });
  });
});

describe('Level-up card choices', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  // A real progression heard by UISystem; the card screen records the levels
  // it deals, and `screens` where the UI went after them.
  function cardTable() {
    const eventBus = createEventBusMock({ withSpies: false });
    const progression = new ProgressionSystem({
      random: new RandomService(7),
      eventBus,
      player: {},
      ui: {},
      effects: {},
      'xp-orbs': { attachProgression: () => {} },
    });
    const dealt = [];
    const screens = [];
    const levelUpScreen = {
      levelUpState: { isVisible: false, options: [] },
      handleUpgradeOptions(offer) {
        dealt.push(offer.level);
        this.levelUpState = { isVisible: true, options: offer.options };
      },
      resetLevelUpState() {
        this.levelUpState = { isVisible: false, options: [] };
      },
    };
    const ui = Object.setPrototypeOf(
      {
        levelUpScreen,
        chestCeremony: { openNext: () => false, clear: () => {} },
        onboarding: { cardPicked: () => {} },
        tacticalHud: { refreshHudFromServices: () => {} },
        queueTransmission: () => {},
        getRandomFork: () => new RandomService(1),
        getService: () => progression,
        showScreen: (name) => screens.push(name),
        registerEventListener: (name, fn) => eventBus.on(name, fn),
      },
      UISystem.prototype
    );
    ui.setupEventListeners();

    // Exactly `count` levels from one pickup, then the pick-screen delay.
    const levelUp = (count) => {
      let xp = progression.experienceToNext - progression.experience;
      for (let i = 1; i < count; i += 1) {
        xp += progression.levelCost(progression.level + i);
      }
      progression.collectXP(xp);
      progression.update(LEVEL_UP_SCREEN_DELAY_SECONDS);
    };
    // The first card taken; the cards leave through showGameUI.
    const pick = () => {
      progression.applyUpgrade(progression.pendingUpgradeOptions[0].id);
      ui.showGameUI();
    };
    return {
      eventBus,
      progression,
      levelUpScreen,
      dealt,
      screens,
      levelUp,
      pick,
    };
  }

  it('deals one card choice per level, in order, before play resumes', () => {
    const { progression, levelUpScreen, dealt, screens, levelUp, pick } =
      cardTable();
    const start = progression.level;

    levelUp(2);
    expect(dealt).toEqual([start + 1]);

    pick();
    expect(dealt).toEqual([start + 1, start + 2]);
    expect(screens).toEqual([]); // still on the cards: the run stays stopped
    // Reroll and banish work on the cards now on screen.
    expect(progression.pendingUpgradeOptions).toEqual(
      levelUpScreen.levelUpState.options
    );

    pick();
    expect(screens).toEqual(['playing']);
  });

  it('deals no cards once the ship is down, and again after a retry', () => {
    const { eventBus, progression, levelUpScreen, dealt, screens, levelUp } =
      cardTable();
    const start = progression.level;

    // Cards dealt on the step the ship dies close, and the one waiting goes.
    levelUp(2);
    eventBus.emit('player-died', {});
    expect(levelUpScreen.levelUpState.isVisible).toBe(false);
    expect(screens).toEqual(['playing']);
    // Nor do cards open while it is down.
    levelUp(1);
    expect(dealt).toEqual([start + 1]);

    // After the respawn only new levels deal cards.
    eventBus.emit('session-retry-countdown', { phase: 'complete' });
    levelUp(1);
    expect(dealt).toEqual([start + 1, start + 4]);
  });
});

describe('UISystem overlay handoffs', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('hides the finished level-up before opening a queued chest', () => {
    const calls = [];
    const ui = Object.setPrototypeOf(
      {
        levelUpScreen: { resetLevelUpState: () => {} },
        chestCeremony: {
          queue: [{}],
          openNext: () => (calls.push('chest'), true),
        },
        getService: () => ({ openNextLevelUpOffer: () => false }),
        showScreen: (...args) => calls.push(args),
        tacticalHud: { refreshHudFromServices: vi.fn() },
        runWon: false,
        pilotDown: false,
      },
      UISystem.prototype
    );

    ui.showGameUI();

    expect(calls).toEqual([
      ['levelup', { overlay: true, show: false, emitEvent: false }],
      'chest',
    ]);
  });

  it('ignores pause and Settings input during the quit transition', () => {
    const handlers = new Map();
    const updatePauseScreen = vi.fn();
    const handleSettingsMenuRequest = vi.fn();
    const ui = Object.setPrototypeOf(
      {
        registerEventListener: (name, handler) => handlers.set(name, handler),
      },
      UISystem.prototype
    );
    ui.getService = () => ({
      getRawState: () => ({ sessionState: 'quitting' }),
    });
    ui.hudEditor = { isOpen: false };
    ui.pauseScreen = { updatePauseScreen };
    ui.settingsPanel = { handleSettingsMenuRequest };
    ui.setupEventListeners();

    handlers.get('toggle-pause')();
    handlers.get('settings-menu-requested')({ source: 'gamepad' });

    expect(updatePauseScreen).not.toHaveBeenCalled();
    expect(handleSettingsMenuRequest).not.toHaveBeenCalled();
  });

  it('pauses a live run before opening Settings and tags its return state', () => {
    const handlers = new Map();
    const eventBus = { emit: vi.fn() };
    const session = {
      getScreen: () => 'playing',
      isPaused: () => false,
      getSessionState: () => 'running',
    };
    const handleSettingsMenuRequest = vi.fn();
    const ui = Object.setPrototypeOf(
      {
        eventBus,
        registerEventListener: (name, handler) => handlers.set(name, handler),
      },
      UISystem.prototype
    );
    ui.getService = () => session;
    ui.settingsPanel = { handleSettingsMenuRequest };
    ui.setupEventListeners();

    handlers.get('settings-menu-requested')({ source: 'gamepad' });

    expect(eventBus.emit).toHaveBeenCalledWith('toggle-pause');
    expect(handleSettingsMenuRequest).toHaveBeenCalledWith({
      source: 'playing',
    });
  });

  it.each(['levelup', 'chest'])(
    'keeps the active %s screen when closing the HUD editor',
    (screen) => {
      const classes = {
        pause: new Set(),
        menu: new Set(['hidden']),
        gameUI: new Set(),
        levelup: new Set(),
        chest: new Set(),
      };
      const classList = (name) => ({
        add: (value) => classes[name].add(value),
        remove: (value) => classes[name].delete(value),
        contains: (value) => classes[name].has(value),
        toggle: (value, force) =>
          force ? classes[name].add(value) : classes[name].delete(value),
      });
      const ui = Object.setPrototypeOf(
        {
          hudEditor: {
            isOpen: false,
            open({ onClose }) {
              this.isOpen = true;
              this.onClose = onClose;
            },
          },
          tacticalHud: { layout: {} },
          settingsPanel: {
            settingsState: { isOpen: true, source: 'gamepad' },
            closeSettingsPanel: vi.fn(),
            openSettingsPanel: vi.fn(),
          },
          getService: () => ({ getScreen: () => screen }),
          pauseScreen: { currentPauseState: false },
          domRefs: { pause: {} },
        },
        UISystem.prototype
      );
      document.getElementById = (id) =>
        ({
          'pause-screen': { classList: classList('pause') },
          'menu-screen': { classList: classList('menu') },
          'game-ui': { classList: classList('gameUI') },
          'levelup-screen': { classList: classList('levelup') },
          'chest-screen': { classList: classList('chest') },
        })[id];

      ui.openHudEditor();
      expect(classes[screen].has('hidden')).toBe(true);
      ui.hudEditor.onClose();

      expect(classes.menu.has('hidden')).toBe(true);
      expect(classes.gameUI.has('hidden')).toBe(false);
      expect(classes[screen].has('hidden')).toBe(false);
      expect(ui.settingsPanel.openSettingsPanel).toHaveBeenCalledWith(
        'gamepad'
      );
    }
  );
});
