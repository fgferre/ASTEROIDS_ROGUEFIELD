/**
 * The game's screens, all listening at once on the event imitator
 * (domEvents.js), for the input-layer tests: the real InputSystem, the real
 * screens built and bound in UISystem.initialize's order, the bus wired by
 * the real UISystem.setupEventListeners, and the page's screen nodes read by
 * the real cacheStaticNodes, the real SettingsSystem. Stood in for: the
 * session (a game state that follows 'screen-changed' and answers
 * 'toggle-pause' as GameSessionService does), the HUD, the main menu's own
 * controls (no key listener), the cinematics (the skip hold is listened for
 * directly), the hangar's drawing and the campaign map's moves (recorded).
 * Reduce Motion is on (no card or chest animation). Timers are fake, Date
 * included: the screens' 400 ms lockouts pass with `rig.wait()`; frames run
 * only by `rig.pad()` or `rig.dom.frame()`.
 */

import { describe, expect, it, vi } from 'vitest';
import { installDomEvents } from './domEvents.js';
import { installFakeGamepad } from './fakeGamepad.js';
import { EventBus } from '../../src/core/EventBus.js';
import { FIRST_RUN_MODE } from '../../src/core/runMode.js';
import SETTINGS_SCHEMA from '../../src/data/settingsSchema.js';
import SettingsSystem from '../../src/modules/SettingsSystem.js';
import InputSystem from '../../src/modules/InputSystem.js';
import UISystem from '../../src/modules/UISystem.js';
import { pollGamepad } from '../../src/modules/input/gamepadReading.js';
import { cacheStaticNodes } from '../../src/modules/ui/domRefs.js';
import { HudEditor } from '../../src/modules/ui/hud/editor/HudEditor.js';
import { SettingsPanel } from '../../src/modules/ui/SettingsPanel.js';
import { LevelUpScreen } from '../../src/modules/ui/LevelUpScreen.js';
import { ChestCeremony } from '../../src/modules/ui/ChestCeremony.js';
import { FlightBriefing } from '../../src/modules/ui/FlightBriefing.js';
import { PauseScreen } from '../../src/modules/ui/PauseScreen.js';
import { RunEndScreens } from '../../src/modules/ui/RunEndScreens.js';
import { CreditsOverlay } from '../../src/modules/ui/CreditsOverlay.js';
import { GamepadMenuNav } from '../../src/modules/ui/gamepadNav.js';
import { PadPointer } from '../../src/modules/ui/padPointer.js';
import { HangarScreen } from '../../src/modules/ui/HangarScreen.js';
import { CampaignMap } from '../../src/modules/ui/CampaignMap.js';
import { CodexScreen } from '../../src/modules/ui/CodexScreen.js';
import { HOLD_MS, setSkipPad } from '../../src/modules/ui/skipHold.js';
import { MenuButtons } from '../../src/services/session/menuButtons.js';
import { setupLoadingScreen } from '../../src/modules/menu/loadingScreen.js';
import { getActiveSlot } from '../../src/core/storage.js';

/** The pad's buttons by name (standard mapping). */
export const PAD = Object.freeze({
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  VIEW: 8,
  START: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
});

/** The level-up's offer: three cards, ids a, b, c. */
export const CARDS = ['a', 'b', 'c'];

// The page's screens and the nodes the screens look up (src/index.html).
function buildPage(dom) {
  const { el, document } = dom;
  const body = document.body;
  const screen = (id, className, attrs = {}) =>
    el('div', { id: `${id}-screen`, className, attrs }, body);
  const button = (id, parent, props = {}) =>
    el('button', { id, type: 'button', ...props }, parent);

  const loading = screen('loading', 'loading-screen hidden');
  el('p', { className: 'opening__line' }, loading);
  el(
    'span',
    {},
    el('div', { className: 'loading-screen__gate-action' }, loading)
  );
  button('press-start-btn', loading);

  const menu = screen('menu', 'screen');
  button('menu-title-back', menu, { className: 'menu-title-back' });
  const prep = el('div', { id: 'menu-prep' }, menu);
  const nodes = el('div', { id: 'campaign-nodes' }, prep);
  [1, 2].forEach((chapter) =>
    button(`chapter-${chapter}`, nodes, {
      dataset: { campaignChapter: String(chapter) },
    })
  );
  const sectors = el('div', { id: 'campaign-sectors' }, prep);
  ['debris-wake', 'dense-core'].forEach((id) =>
    button(`row-${id}`, sectors, { dataset: { campaignRow: id } })
  );
  button('campaign-launch-btn', prep, { className: 'prep-launch__btn' });
  button('menu-codex-btn', menu);
  button('open-settings-btn', menu);

  const gameUi = el('div', { id: 'game-ui', className: 'hidden' }, body);
  el('div', { className: 'game-field' }, gameUi);
  el('div', { className: 'hud-frame' }, el('div', { id: 'hud-layer' }, gameUi));

  const levelUp = screen('levelup', 'screen cards-screen hidden');
  const content = el('div', { className: 'levelup-content' }, levelUp);
  el('div', { id: 'upgrades-container' }, content);
  [
    'levelup-reroll-btn',
    'levelup-banish-btn',
    'levelup-hold-btn',
    'levelup-equip-btn',
    'levelup-cancel-btn',
  ].forEach((id) => button(id, content));

  const chest = screen('chest', 'screen cards-screen hidden', {
    tabindex: '-1',
  });
  ['chest-title', 'chest-count', 'chest-cards'].forEach((id) =>
    el('div', { id }, chest)
  );
  button('chest-continue-btn', chest);

  const flight = screen('flight', 'screen cards-screen hidden', {
    tabindex: '-1',
  });
  button('flight-continue-btn', flight);

  const pause = screen('pause', 'screen hidden');
  ['resume', 'settings', 'edit-hud', 'exit'].forEach((name) =>
    button(`pause-${name}-btn`, pause)
  );

  const modal = { role: 'dialog', 'aria-modal': 'true' };
  const settings = screen('settings', 'screen screen--overlay hidden', modal);
  el('nav', { id: 'settings-tabs' }, settings);
  el('div', { id: 'settings-content' }, settings);
  button('settings-reset-btn', settings);
  button('settings-close-btn', settings);

  const credits = screen('credits', 'screen screen--overlay hidden', modal);
  button('credits-back-btn', credits);
  const changelog = screen('changelog', 'screen screen--overlay hidden', modal);
  button('changelog-back-btn', changelog);

  const codex = screen('codex', 'screen screen--overlay hidden', modal);
  button('codex-back-btn', codex);
  ['enemies', 'achievements'].forEach((tab) =>
    button(`codex-tab-${tab}`, codex, { dataset: { codexTab: tab } })
  );
  el('div', { id: 'codex-list' }, codex);
  el('span', { id: 'codex-count' }, codex);

  const hangar = screen('hangar', 'screen screen--overlay hidden', modal);
  button('hangar-back-btn', hangar);
  el('p', { id: 'hangar-hull-lock' }, hangar);

  const gameOver = screen(
    'gameover',
    'screen screen--overlay end-screen hidden'
  );
  ['gameover-body', 'gameover-invite', 'gameover-seed'].forEach((id) =>
    el('div', { id }, gameOver)
  );
  button('gameover-copy-seed-btn', gameOver);
  // The run buttons in the order the page has them; ⏎ / A on New Mission.
  ['retry-game-btn', 'restart-game-btn', 'quit-game-btn'].forEach((id) =>
    button(id, gameOver)
  );
  el('kbd', {}, document.getElementById('restart-game-btn'));
  const victory = screen('victory', 'screen screen--overlay end-screen hidden');
  ['victory-body', 'victory-invite'].forEach((id) =>
    el('div', { id }, victory)
  );
  ['continue', 'next', 'restart', 'quit', 'menu'].forEach((name) =>
    button(`victory-${name}-btn`, victory)
  );
  const endCredits = screen(
    'end-credits',
    'screen screen--overlay end-credits hidden',
    modal
  );
  el('div', { id: 'end-credits-roll' }, endCredits);
  button('end-credits-continue-btn', endCredits);
  const ending = screen('ending', 'screen screen--overlay end-screen hidden');
  el('div', { id: 'ending-options', className: 'ending-options' }, ending);
}

// The bus events an input sends for the session or another screen to act on.
const REQUESTS = [
  'toggle-pause',
  'input-confirmed',
  'settings-menu-requested',
  'modern-flight-engaged',
  'gamepad-menu-back',
  'toggle-fullscreen',
  'exit-to-menu-requested',
];

// The focused element, short: its id, else the card, ending, section, row
// or pilot it is.
function describeFocus(el) {
  if (!el) return null;
  if (el === el.ownerDocument.body) return 'body';
  const { upgradeId, ending, settingsSection, campaignRow, campaignChapter } =
    el.dataset;
  const { pilotSlot, pilotDelete } = el.dataset;
  if (upgradeId) return `card:${upgradeId}`;
  if (ending) return `ending:${ending}`;
  if (settingsSection) return `settings:${settingsSection}`;
  if (campaignRow) return `row:${campaignRow}`;
  if (campaignChapter) return `chapter:${campaignChapter}`;
  if (pilotSlot) return `pilot:${pilotSlot}`;
  if (pilotDelete) return `delete:${pilotDelete}`;
  return el.id || el.className || el.tagName.toLowerCase();
}

const cardDefinition = (id) => ({
  id,
  family: 'thermal',
  rarity: 'common',
  levels: [{}],
  text: { name: id, levels: [{ description: 'Fire rate +11%.' }] },
});

export function mountScreens() {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
    ],
    now: 1_000_000,
  });
  // The page's clock runs with the fake one (the skip hold times by it).
  const t0 = Date.now();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - t0 + 1);
  const dom = installDomEvents();
  const gamepad = installFakeGamepad();
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  buildPage(dom);
  // Reduce Motion: the cards and the chest skip their animations.
  dom.document.body.classList.add('motion-reduced');

  const bus = new EventBus();
  const sent = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (name, payload) => {
    sent.push({ name, payload });
    emit(name, payload);
  };

  // The game state the screens and the input read; a card overlay or a
  // screen change sets its screen, as the session does.
  const state = { screen: 'menu', paused: false, sessionState: 'menu' };
  const gameState = {
    getScreen: () => state.screen,
    isPaused: () => state.paused,
    setPaused: (paused) => (state.paused = paused),
    getRawState: () => ({ sessionState: state.sessionState }),
  };

  const progression = {
    upgradeLookup: new Map(CARDS.map((id) => [id, cardDefinition(id)])),
    getUpgradeCount: () => 0,
    getFamilyCounts: () => ({ thermal: 0 }),
    pilotCardIds: [],
    trailSteps: new Map(),
    openCards: null,
    sealedCards: new Set(),
    rerollsLeft: 2,
    banishesLeft: 2,
    holdsPerRun: 1,
    holdsLeft: 1,
    heldCard: null,
    applyUpgrade: vi.fn(() => true),
    rerollUpgradeOptions: vi.fn(),
    banishUpgrade: vi.fn(),
    holdUpgrade: vi.fn(() => true),
    openNextLevelUpOffer: () => false,
    getSynergySnapshot: () => ({ families: {}, synergies: [] }),
    getUpgradeProgressSnapshot: () => [],
  };
  const combat = {
    getWeaponState: () => ({
      weaponId: 'lance',
      chip: 'LANCE',
      evolutions: [],
    }),
  };
  const headStart = { progress: () => null, equipRest: () => [] };
  const difficulty = {
    runLabel: () => 'Seed 1',
    shareLink: () => 'http://localhost/?seed=1',
  };

  const settings = new SettingsSystem({ eventBus: bus });
  const input = new InputSystem({
    eventBus: bus,
    settings,
    'game-state': gameState,
  });

  const hudLayer = dom.document.getElementById('hud-layer');
  const ui = Object.setPrototypeOf(
    {
      eventBus: bus,
      _eventListeners: [],
      runWon: false,
      pilotDown: false,
      transmissions: null,
      liveQualityPreset: null,
      dependencies: {
        'event-bus': bus,
        'game-state': gameState,
        'game-session': { mode: FIRST_RUN_MODE, headStart },
        input,
        settings,
        progression,
        combat,
      },
    },
    UISystem.prototype
  );

  // As UISystem.initialize builds them (the input-bearing ones).
  ui.cinematics = {
    introActive: false,
    afterTravel: (show) => show(),
    prepareEnding: () => {},
    playEnding: vi.fn(() => false),
    deferUntilEpilogueEnds: () => false,
  };
  setSkipPad(() => input.gamepad);
  ui.onboarding = {
    shown: false,
    current: null,
    flown: true,
    cardsTip: () => '',
    menuActed: () => {},
    cardPicked: () => {},
    menuTip: () => null,
  };
  ui.settings = settings;
  ui.domRefs = cacheStaticNodes();
  ui.tacticalHud = {
    layout: {
      layer: hudLayer,
      previewBuildCard: () => {},
      hideOnboardingTip: () => {},
      showTimedNotice: () => {},
      isNoticeShowing: () => false,
      slotState: () => null,
      instrument: () => null,
      invalidatePanelCorners: () => {},
      setItems: () => {},
    },
    setLayout: () => {},
    refreshHudFromServices: () => {},
  };
  ui.hudEditor = new HudEditor({
    hud: () => ui.tacticalHud.layout,
    settings,
    setLayout: () => {},
    refresh: () => {},
    wardenLive: () => false,
    device: () => input.getActiveDevice(),
  });
  const send = (name, payload) => bus.emit(name, payload);
  ui.settingsPanel = new SettingsPanel({
    refs: ui.domRefs.settings,
    pauseSettingsBtn: ui.domRefs.pause.settingsBtn,
    settings,
    schema: SETTINGS_SCHEMA,
    emit: send,
    announceVisibility: (isOpen, payload) =>
      ui.emitOverlayVisibilityChanged('settings', isOpen, payload),
    setHudBaseScale: () => {},
    livePreset: () => null,
    openHudEditor: () => ui.openHudEditor(),
    dependencies: ui.dependencies,
  });
  ui.levelUpScreen = new LevelUpScreen({
    refs: ui.domRefs.levelUp,
    progression: () => progression,
    headStart: () => headStart,
    combat: () => combat,
    emit: send,
    showScreen: (name, options) => ui.showScreen(name, options),
    showGameUI: () => ui.showGameUI(),
    showCardsTip: (start) => ui.showOnboardingCardsTip(start),
    prefersReducedMotion: () => ui.prefersReducedMotion(),
    hud: () => ui.tacticalHud.layout,
  });
  ui.chestCeremony = new ChestCeremony({
    refs: ui.domRefs.chest,
    progression: () => progression,
    combat: () => combat,
    showScreen: (name, options) => ui.showScreen(name, options),
    showGameUI: () => ui.showGameUI(),
    cardChoiceOpen: () => ui.levelUpScreen.levelUpState.isVisible,
    prefersReducedMotion: () => ui.prefersReducedMotion(),
  });
  ui.flightBriefing = new FlightBriefing(ui.domRefs.flight, ui);
  ui.pauseScreen = new PauseScreen({
    refs: ui.domRefs.pause,
    gameOverQuitBtn: ui.domRefs.gameOver.quitBtn,
    emit: send,
    showScreen: (name, options) => ui.showScreen(name, options),
    progression: () => null,
    combat: () => combat,
    difficulty: () => difficulty,
    layer: () => 1,
    settingsOpenHere: () => ui.settingsPanel.isOpenFrom('pause'),
    closeSettings: () => ui.settingsPanel.closeSettingsPanel(),
    openHudEditor: () => ui.openHudEditor(),
  });
  ui.runEndScreens = new RunEndScreens({
    refs: ui.domRefs,
    showScreen: (name, options) => ui.showScreen(name, options),
    progression: () => progression,
    combat: () => combat,
    difficulty: () => difficulty,
    hangar: () => ({ lastAward: null }),
    lastTransmission: () => null,
    cinematics: ui.cinematics,
    announceOverlay: (...args) => ui.emitOverlayVisibilityChanged(...args),
  });
  ui.creditsOverlay = new CreditsOverlay({
    refs: ui.domRefs.credits,
    emit: send,
    showScreen: (name, options) => ui.showScreen(name, options),
    announceVisibility: (isOpen, payload) =>
      ui.emitOverlayVisibilityChanged('credits', isOpen, payload),
  });
  ui.changelogOverlay = new CreditsOverlay({
    name: 'changelog',
    refs: ui.domRefs.changelog,
    emit: send,
    showScreen: (name, options) => ui.showScreen(name, options),
    announceVisibility: (isOpen, payload) =>
      ui.emitOverlayVisibilityChanged('changelog', isOpen, payload),
  });
  ui.mainMenu = {
    cyclePrepTab: vi.fn(() => null),
    requestMenuShipSelectorRefresh: () => {},
    refreshMenuStatus: () => {},
    refreshBossRushLock: () => {},
  };
  ui.padNav = new GamepadMenuNav(ui);
  ui.padNav.watchScreens();
  // Which screen the pad's press, back or tab switch went to (its moves
  // need a layout this rig has not: where the focus lands is not judged).
  const padMoves = [];
  ['press', 'back', 'cycleTab'].forEach((name) => {
    const real = ui.padNav[name].bind(ui.padNav);
    ui.padNav[name] = (target, ...rest) => {
      const id = typeof target === 'string' ? target : target.id;
      padMoves.push(`${name}:${id.replace(/-screen$/, '')}`);
      return real(target, ...rest);
    };
  });
  const levelUpPad = ui.levelUpScreen.handleGamepadNav.bind(ui.levelUpScreen);
  ui.levelUpScreen.handleGamepadNav = (action) => {
    padMoves.push(`levelup:${action}`);
    levelUpPad(action);
  };
  ui.padPointer = new PadPointer(ui);
  ui.hangarScreen = new HangarScreen({
    refs: ui.domRefs.hangar,
    settings,
    emit: send,
    showScreen: (name, options) => ui.showScreen(name, options),
    announceVisibility: (isOpen, payload) =>
      ui.emitOverlayVisibilityChanged('hangar', isOpen, payload),
    hangar: () => null,
    selectedHullId: () => null,
    hullName: () => '',
    refreshShipSelector: () => {},
  });
  // Its drawing needs the hangar service; its keys do not.
  ui.hangarScreen.renderHangar = () => {};
  ui.campaignMap = new CampaignMap({
    refs: ui.domRefs.campaign,
    showTab: () => {},
    prepareTravel: () => {},
  });
  // Its moves draw from the sector records: recorded here, not drawn.
  const mapMoves = [];
  ['stepChapter', 'stepRow', 'focusRow'].forEach((name) => {
    ui.campaignMap[name] = (arg) => mapMoves.push(`${name}(${arg})`);
  });
  ui.campaignMap.selectChapter = () => {};
  ui.campaignMap.selectSector = () => {};
  ui.codexScreen = new CodexScreen({
    refs: ui.domRefs.codex,
    showScreen: (name, options) => ui.showScreen(name, options),
    announceVisibility: (isOpen, payload) =>
      ui.emitOverlayVisibilityChanged('codex', isOpen, payload),
    codex: () => ({ getEntries: () => [] }),
    achievements: () => ({ getEntries: () => [] }),
  });

  ui.pauseScreen.bindPauseControls();
  ui.runEndScreens.bindControls();
  ui.levelUpScreen.bindLevelUpControls();
  ui.chestCeremony.bindControls();
  ui.settingsPanel.bindSettingsControls();
  ui.creditsOverlay.bindCreditsControls();
  ui.changelogOverlay.bindCreditsControls();
  ui.codexScreen.bindCodexControls();
  ui.hangarScreen.bindHangarControls();
  ui.campaignMap.bindCampaignControls();
  UISystem.prototype.setupEventListeners.call(ui);
  // The session's side (GameSessionService's screen change and togglePause),
  // heard after the UI's, as at boot.
  const pauseChanged = () =>
    bus.emit('pause-state-changed', { isPaused: state.paused });
  bus.on('screen-changed', ({ screen } = {}) => {
    state.screen = screen;
    if (screen !== 'playing' && state.paused) {
      state.paused = false;
      pauseChanged();
    }
  });
  bus.on('toggle-pause', () => {
    if (['victory', 'quitting'].includes(state.sessionState)) return;
    if (state.screen !== 'playing' && !state.paused) return;
    state.paused = state.screen === 'playing' && !state.paused;
    state.sessionState = state.paused ? 'paused' : 'running';
    pauseChanged();
  });
  // The session's run buttons (one document click listener), its flows
  // recorded.
  const flows = [];
  const flow =
    (name) =>
    (options = {}) => {
      flows.push(options.source ? `${name}:${options.source}` : name);
      return true;
    };
  new MenuButtons({
    eventBus: bus,
    startNewRun: flow('newRun'),
    requestRetry: flow('retry'),
    exitToMenu: flow('exit'),
    continueBeyondVictory: flow('continue'),
  }).setupDomEventListeners();

  // A key with the browser's button default, approximated: Enter clicks
  // the focused enabled button on keydown, Space on keyup (still focused),
  // unless a listener prevented it.
  const pressButton = (code) => {
    const down = dom.keyDown(code);
    const button = down.target.tagName === 'BUTTON' ? down.target : null;
    if (code === 'Enter' && button && !down.defaultPrevented) button.click();
    const up = dom.keyUp(code);
    if (
      code === 'Space' &&
      button &&
      !down.defaultPrevented &&
      !up.defaultPrevented &&
      dom.document.activeElement === button
    ) {
      button.click();
    }
    return down;
  };
  const count = (name) => sent.filter((entry) => entry.name === name).length;
  const levelUp = () => ui.levelUpScreen.levelUpState;
  const watched = {};
  // What each screen shows now, for `effects` to compare.
  const snapshot = () => ({
    ...Object.fromEntries(
      Object.entries(watched).map(([name, read]) => [name, read()])
    ),
    top: ui.padNav.screen()?.id ?? null,
    screen: state.screen,
    focus: describeFocus(dom.document.activeElement),
    levelUp: levelUp().isVisible,
    card: levelUp().focusIndex,
    picked: progression.applyUpgrade.mock.calls.map(([id]) => id).join(),
    rerolls: progression.rerollUpgradeOptions.mock.calls.length,
    banishing: levelUp().banishMode,
    holding: levelUp().holdMode,
    chest: ui.chestCeremony.isVisible,
    briefing: ui.flightBriefing.isVisible,
    choice: Boolean(ui.runEndScreens.choice),
    ending: ui.cinematics.playEnding.mock.calls.map(([id]) => id).join(),
    endCredits: Boolean(ui.runEndScreens.endCredits.onDone),
    pause: ui.pauseScreen.currentPauseState,
    quitArmed: Boolean(ui.pauseScreen.quitConfirm.button),
    settings: ui.settingsPanel.settingsState.isOpen,
    codex: ui.codexScreen.codexState.isOpen && ui.codexScreen.codexState.tab,
    hangar: ui.hangarScreen.hangarState.isOpen,
    credits: ui.creditsOverlay.creditsState.isOpen,
    changelog: ui.changelogOverlay.creditsState.isOpen,
    session: flows.join(),
    map: mapMoves.join(),
    pad: padMoves.join(),
    capturing: ui.settingsPanel.capturing,
    gate: !dom.document
      .getElementById('loading-screen')
      .classList.contains('hidden'),
    pilots: Boolean(dom.document.querySelector('.pilot-screen')),
  });
  const rig = {
    dom,
    bus,
    ui,
    input,
    state,
    progression,
    headStart,
    gamepad,
    sent,
    count,
    /** Bus events sent since the call: name → count. */
    record() {
      const from = sent.length;
      return (name) =>
        sent.slice(from).filter((entry) => entry.name === name).length;
    },
    tap: (code, init) => dom.tap(code, init),
    keyDown: (code, init) => dom.keyDown(code, init),
    keyUp: (code, init) => dom.keyUp(code, init),
    /**
     * A pad button pressed for a frame, then let go for one: read as the
     * game reads it, by the menus' frame loops (InputSystem's, the pad
     * pointer's, a cinematic's, the gate's, the pilots') and, in flight, by
     * the fixed step's poll.
     */
    pad(button) {
      [[button], []].forEach((pressed) => {
        gamepad.set({ pressed });
        if (input.isGameRunning()) pollGamepad(input);
        dom.frame();
      });
    },
    /**
     * One input by name: a key code tapped ('Enter', 'KeyS', 'Digit1');
     * 'down:' or 'up:' and a code, that half only; 'hold:' and a code, held
     * past the skip hold's time (a frame runs) then let go; a code and
     * '+click', tapped with the browser's button default (Enter clicks the
     * focused button on keydown, Space on keyup, unless prevented); 'pad:A'
     * (a button of PAD); 'bus:confirm' (an 'input-confirmed' straight on
     * the bus). Returns the keydown event for a key.
     */
    send(input) {
      if (input.startsWith('pad:')) return rig.pad(PAD[input.slice(4)]);
      if (input === 'bus:confirm') {
        return bus.emit('input-confirmed', { source: 'test' });
      }
      const [half, code] = input.split(':');
      if (half === 'down') return dom.keyDown(code);
      if (half === 'up') return dom.keyUp(code);
      if (half === 'hold') {
        const event = dom.keyDown(code);
        rig.wait(HOLD_MS + 100);
        dom.frame();
        dom.keyUp(code);
        return event;
      }
      if (input.endsWith('+click')) return pressButton(input.split('+')[0]);
      return dom.tap(input);
    },
    /** The screens' 400 ms lockout and any reveal, passed. */
    wait: (ms = 450) => vi.advanceTimersByTime(ms),
    snapshot,
    /** Adds `read()` to the snapshot as `name` (a scene's own callbacks). */
    watch(name, read) {
      watched[name] = read;
    },
    /**
     * What `act` changed once its microtasks ran: the snapshot fields that
     * moved (their new value), the bus requests it sent (`sent`, by count)
     * and, for a key, whether its keydown was default-prevented.
     */
    async effects(act) {
      const before = snapshot();
      const from = sent.length;
      const event = act();
      await Promise.resolve();
      await Promise.resolve();
      const after = snapshot();
      const changed = Object.fromEntries(
        Object.entries(after).filter(([key, value]) => before[key] !== value)
      );
      const requests = {};
      sent.slice(from).forEach(({ name }) => {
        if (REQUESTS.includes(name)) requests[name] = (requests[name] ?? 0) + 1;
      });
      const result = { ...changed, sent: requests };
      if (event && 'defaultPrevented' in event) {
        result.prevented = event.defaultPrevented;
      }
      return result;
    },
    /** The bus's swallowed listener errors (EventBus logs, never throws). */
    errors: () => errors.mock.calls,
    /** The game in flight, nothing open. */
    fly() {
      state.screen = 'playing';
      state.paused = false;
      state.sessionState = 'running';
      ui.showScreen('playing', { emitEvent: false });
    },
    /** Shown the way the game shows each, past its lockout. */
    open: {
      levelUp() {
        rig.fly();
        bus.emit('upgrade-options-ready', {
          level: 3,
          options: CARDS.map((id) => ({ id })),
        });
        rig.wait();
        return ui.levelUpScreen;
      },
      chest() {
        rig.fly();
        bus.emit('chest-card', { id: 'a' });
        bus.emit('chest-card', { id: 'b' });
        bus.emit('chest-spent');
        rig.wait();
        return ui.chestCeremony;
      },
      briefing() {
        rig.fly();
        bus.emit('upgrade-modern-flight');
        ui.flightBriefing.openNext();
        rig.wait();
        return ui.flightBriefing;
      },
      /** The campaign's last win: the choice between the endings. */
      choice() {
        rig.fly();
        state.screen = 'victory';
        state.sessionState = 'victory';
        ui.runEndScreens.showEndingChoice({ data: {} });
        rig.wait();
        return ui.runEndScreens;
      },
      /** The end credits; `onDone` runs when they end. */
      endCredits(onDone = vi.fn()) {
        rig.fly();
        state.screen = 'victory';
        state.sessionState = 'victory';
        ui.runEndScreens.endCredits.play(onDone);
        return onDone;
      },
      /** The run paused, as the session's pause-state-changed shows it. */
      pause() {
        rig.fly();
        state.paused = true;
        state.sessionState = 'paused';
        bus.emit('pause-state-changed', { isPaused: true });
        return ui.pauseScreen;
      },
      /** Settings as F10 asks for it (refused over a choice, today). */
      settings() {
        dom.tap('F10');
        return ui.settingsPanel;
      },
      codex() {
        ui.codexScreen.openCodex();
        return ui.codexScreen;
      },
      hangar() {
        ui.hangarScreen.openHangar();
        return ui.hangarScreen;
      },
      credits() {
        ui.creditsOverlay.openCreditsOverlay();
        return ui.creditsOverlay;
      },
      /**
       * Boot's way to the menu: the opening, its press, the PRESS START
       * gate, its press, then the pilots (skipped unless `pilots`: the
       * entry a choice reloaded into), and the menu the gate watches. The
       * pad's B on the menu goes back to the gate as MenuBackgroundSystem
       * wires it.
       */
      gate({ pilots = false } = {}) {
        dom.document
          .getElementById('loading-screen')
          .classList.remove('hidden');
        if (!pilots) {
          dom.window.sessionStorage.setItem(
            'roguefield:pilot-chosen',
            String(getActiveSlot())
          );
        }
        let loaded;
        const gate = setupLoadingScreen((_progress, done) => (loaded = done));
        bus.on('gamepad-menu-back', () => gate.leaveMenu());
        loaded();
        dom.tap('Enter'); // leaves the opening
        rig.wait(700);
        dom.tap('Enter'); // PRESS START
        rig.wait(1000);
        return gate;
      },
    },
    /** Run at destroy (a cinematic's skip listener, say). */
    cleanups: [],
    destroy() {
      rig.cleanups.forEach((fn) => fn());
      vi.advanceTimersByTime(1);
      input.destroy();
      vi.clearAllTimers();
      vi.useRealTimers();
      gamepad.restore();
      dom.restore();
    },
  };
  return rig;
}

/**
 * One describe per pair, one test per input: `open(rig)` sets the screens
 * up, each row is `[input, effects, leak]` (see `rig.send` and
 * `rig.effects`). A row marked `leak` is today's leak: an input reaching the
 * screen below; its name says so, for the layer stack to flip it.
 */
export function pinTable(name, open, rows) {
  describe(name, () => {
    rows.forEach(([input, expected, leak]) => {
      it(`${leak ? 'LEAK today: ' : ''}${input}`, async () => {
        const rig = mountScreens();
        try {
          open(rig);
          expect(await rig.effects(() => rig.send(input))).toEqual(expected);
          expect(rig.errors()).toEqual([]);
        } finally {
          rig.destroy();
        }
      });
    });
  });
}

/**
 * Lays `elements` out for the pad's moves: a column (or a row, `across`)
 * of 200 x 40 boxes from `at` px.
 */
export function layOut(elements, { across = false, at = 0 } = {}) {
  [...elements].forEach((el, i) => {
    el.rect = across
      ? { left: i * 240, top: at, width: 200, height: 40 }
      : { left: 0, top: at + i * 60, width: 200, height: 40 };
  });
}
