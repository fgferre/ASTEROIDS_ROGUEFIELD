// src/modules/UISystem.js

import SETTINGS_SCHEMA from '../data/settingsSchema.js';
import { sectorById } from '../data/sectors.js';
import { BaseSystem } from '../core/BaseSystem.js';
import { resolveService } from '../core/serviceUtils.js';
import { Onboarding } from './ui/onboarding.js';
import {
  isOnboardingEnabled,
  listenForLessons,
  refreshMenuTips,
  removeOnboardingCardsTip,
  showOnboardingCardsTip,
  showOnboardingTip,
  updateOnboarding,
} from './ui/onboardingTips.js';
import { RunCinematics } from './ui/runCinematics.js';
import {
  handleLayerStarted,
  listenForStory,
  queueTransmission,
  runModeOf,
} from './ui/runStory.js';
import {
  handleScreenChanged,
  holdSim,
  showGameUI,
  showScreen,
} from './ui/screenSwitch.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { LevelUpScreen } from './ui/LevelUpScreen.js';
import { ChestCeremony } from './ui/ChestCeremony.js';
import { FlightBriefing } from './ui/FlightBriefing.js';
import { PauseScreen } from './ui/PauseScreen.js';
import { RunEndScreens } from './ui/RunEndScreens.js';
import { CreditsOverlay, fillChangelog } from './ui/CreditsOverlay.js';
import { TacticalHud } from './ui/TacticalHud.js';
import { followHudLayout, openHudEditor } from './ui/hudEditorDoor.js';
import { MainMenu } from './ui/MainMenu.js';
import { HangarScreen } from './ui/HangarScreen.js';
import { CampaignMap } from './ui/CampaignMap.js';
import { CodexScreen } from './ui/CodexScreen.js';
import { cacheStaticNodes } from './ui/domRefs.js';
import { ViewportScaling } from './ui/viewportScaling.js';
import {
  TransmissionQueue,
  deathTransmission,
  hangarTransmission,
  winTransmissions,
} from './ui/transmissions.js';
import { GamepadMenuNav } from './ui/gamepadNav.js';
import { PadPointer } from './ui/padPointer.js';
import { setSkipPad } from './ui/skipHold.js';
import { inputLayers } from './input/inputLayers.js';

class UISystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      enableRandomManagement: true,
      systemName: 'UISystem',
      serviceName: 'ui',
      randomForkLabels: {
        base: 'ui.base',
        animations: 'ui.animations',
        transitions: 'ui.transitions',
      },
    });
    // `?replay=` runs without the first-run onboarding tips.
    this.onboardingDisabled = false;
  }

  initialize() {
    this.damageFlashTimeout = null;
    this.shieldFailTimeout = null;
    this.timePulseTimeout = null;
    this.killsPulseTimeout = null;
    this.levelPulseTimeout = null;

    this.transmissions = null;
    this.transmissionRaf = null;
    this.transmissionLayer = 1;
    // The line shown since the death or the win, quoted on the end screen.
    this.lastTransmission = null;
    this.cinematics = new RunCinematics({
      eventBus: this.eventBus,
      renderer: () => resolveService('renderer', this.dependencies),
      hud: () => this.tacticalHud.layout,
      holdSim: (held) => this.holdSim(held),
      // A head start holds the first layer: its title card waits for it.
      onIntroEnd: () =>
        resolveService('enemies', this.dependencies)?.waveManager
          .waveInProgress &&
        this.handleLayerStarted({ wave: this.transmissionLayer }),
      speak: (entry) => this.queueTransmission(entry),
      hush: () => this.transmissions?.clear(),
      nextLine: () => this.transmissions?.next() ?? false,
    });
    // The skip key's Start is read on the pad the game reads.
    setSkipPad(() => resolveService('input', this.dependencies)?.gamepad);
    this.onboarding = new Onboarding(
      {
        showTip: (id) => showOnboardingTip(this, id),
        hideTip: () => this.tacticalHud.layout?.hideOnboardingTip(),
      },
      (id) => this.eventBus?.emit('onboarding-step', { id })
    );

    this.settings = this.resolveSettingsService();
    this.liveQualityPreset = null;

    this.tacticalState = {
      contactsCache: null,
      threats: new Map(),
      isReady: false,
    };

    this.domRefs = cacheStaticNodes();
    this.viewport = new ViewportScaling({
      refs: this.domRefs,
      hud: () => this.tacticalHud.layout,
    });
    this.tacticalHud = new TacticalHud({
      refs: { gameField: this.domRefs.gameField, gameUi: this.domRefs.gameUi },
      player: () => resolveService('player', this.dependencies),
      enemies: () => resolveService('enemies', this.dependencies),
      progression: () => resolveService('progression', this.dependencies),
      combat: () => resolveService('combat', this.dependencies),
      pickups: () => resolveService('pickups', this.dependencies),
      xpOrbs: () => resolveService('xp-orbs', this.dependencies),
      renderer: () => resolveService('renderer', this.dependencies),
      mode: () => runModeOf(this),
      shieldKey: () => {
        const device = resolveService(
          'input',
          this.dependencies
        ).getActiveDevice();
        if (device === 'touch') return ''; // SHIELD is on screen
        return this.settingsPanel.formatBindingLabel(
          this.settings?.getSetting('controls', 'activateShield')?.[
            device
          ]?.[0],
          device
        );
      },
    });
    // Built when its file first arrives (ui/hudEditorDoor.js).
    this.hudEditor = null;
    this.hudEditorArriving = null;
    this.settingsPanel = new SettingsPanel({
      refs: this.domRefs.settings,
      pauseSettingsBtn: this.domRefs.pause.settingsBtn,
      settings: this.settings,
      schema: SETTINGS_SCHEMA,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      announceVisibility: (isOpen, payload) =>
        this.emitOverlayVisibilityChanged('settings', isOpen, payload),
      setHudBaseScale: (scale) => this.viewport.setHudBaseScale(scale),
      livePreset: () => this.liveQualityPreset,
      openHudEditor: () => this.openHudEditor(),
      dependencies: this.dependencies,
    });
    this.levelUpScreen = new LevelUpScreen({
      refs: this.domRefs.levelUp,
      progression: () => resolveService('progression', this.dependencies),
      headStart: () =>
        resolveService('game-session', this.dependencies).headStart,
      combat: () => resolveService('combat', this.dependencies),
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      showGameUI: () => this.showGameUI(),
      showCardsTip: (headStart) => this.showOnboardingCardsTip(headStart),
      prefersReducedMotion: () => this.prefersReducedMotion(),
      hud: () => this.tacticalHud.layout,
    });
    this.chestCeremony = new ChestCeremony({
      refs: this.domRefs.chest,
      progression: () => resolveService('progression', this.dependencies),
      combat: () => resolveService('combat', this.dependencies),
      showScreen: (name, options) => this.showScreen(name, options),
      showGameUI: () => this.showGameUI(),
      cardChoiceOpen: () => this.levelUpScreen.levelUpState.isVisible,
      prefersReducedMotion: () => this.prefersReducedMotion(),
    });
    this.flightBriefing = new FlightBriefing(this.domRefs.flight, this);
    this.pauseScreen = new PauseScreen({
      refs: this.domRefs.pause,
      gameOverQuitBtn: this.domRefs.gameOver.quitBtn,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      progression: () => resolveService('progression', this.dependencies),
      combat: () => resolveService('combat', this.dependencies),
      difficulty: () => resolveService('difficulty', this.dependencies),
      layer: () => this.transmissionLayer,
      mode: () => runModeOf(this),
      settingsOpenHere: () => this.settingsPanel.isOpenFrom('pause'),
      closeSettings: () => this.settingsPanel.closeSettingsPanel(),
      openHudEditor: () => this.openHudEditor(),
    });
    this.runEndScreens = new RunEndScreens({
      refs: this.domRefs,
      showScreen: (name, options) => this.showScreen(name, options),
      progression: () => resolveService('progression', this.dependencies),
      combat: () => resolveService('combat', this.dependencies),
      difficulty: () => resolveService('difficulty', this.dependencies),
      hangar: () => resolveService('hangar', this.dependencies),
      lastTransmission: () => this.lastTransmission,
      cinematics: this.cinematics,
      cancelQuit: () => this.pauseScreen.cancelQuitConfirm(),
      announceOverlay: (...args) => this.emitOverlayVisibilityChanged(...args),
    });
    this.creditsOverlay = new CreditsOverlay({
      refs: this.domRefs.credits,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      announceVisibility: (isOpen, payload) =>
        this.emitOverlayVisibilityChanged('credits', isOpen, payload),
    });
    this.changelogOverlay = new CreditsOverlay({
      name: 'changelog',
      refs: this.domRefs.changelog,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      announceVisibility: (isOpen, payload) =>
        this.emitOverlayVisibilityChanged('changelog', isOpen, payload),
    });
    this.mainMenu = new MainMenu({
      refs: this.domRefs.menu,
      settings: this.settings,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      hangar: () => resolveService('hangar', this.dependencies),
      codex: () => resolveService('codex', this.dependencies),
      achievements: () => resolveService('achievements', this.dependencies),
      difficulty: () => resolveService('difficulty', this.dependencies),
      player: () => resolveService('player', this.dependencies),
      livePreset: () => this.liveQualityPreset,
    });
    this.padNav = new GamepadMenuNav(this);
    this.padNav.watchScreens();
    this.padPointer = new PadPointer(this);
    this.hangarScreen = new HangarScreen({
      refs: this.domRefs.hangar,
      settings: this.settings,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      announceVisibility: (isOpen, payload) =>
        this.emitOverlayVisibilityChanged('hangar', isOpen, payload),
      hangar: () => resolveService('hangar', this.dependencies),
      selectedHullId: () => this.mainMenu.getSelectedHullId(),
      hullName: (hull) => this.mainMenu.getHullDisplayName(hull),
      refreshShipSelector: () => this.mainMenu.requestMenuShipSelectorRefresh(),
    });
    this.campaignMap = new CampaignMap({
      refs: this.domRefs.campaign,
      showTab: () => this.mainMenu.setPrepTab('campaign'),
      prepareTravel: (start) => this.cinematics.prepareTravel(start),
    });
    this.codexScreen = new CodexScreen({
      refs: this.domRefs.codex,
      showScreen: (name, options) => this.showScreen(name, options),
      announceVisibility: (isOpen, payload) =>
        this.emitOverlayVisibilityChanged('codex', isOpen, payload),
      codex: () => resolveService('codex', this.dependencies),
      achievements: () => resolveService('achievements', this.dependencies),
    });
    // The static keyboard hints show the scheme the ship flies (style.css):
    // the player's, which every run starts classic.
    document.body.dataset.controls = resolveService(
      'player',
      this.dependencies
    ).controlScheme;

    // Direct AAA HUD Activation, in the HUD Layout setting's layout
    this.followHudLayout(
      this.resolveSettingsService()?.getCategoryValues('video')
    );
    this.tacticalHud.activateAAATacticalHud();
    if (this.tacticalHud.layout) {
      this.transmissions = new TransmissionQueue(
        this.tacticalHud.layout,
        ({ speaker, key, text }, onScreenMs) => {
          this.lastTransmission = { speaker, text };
          const shown = { speaker, key, text, onScreenMs };
          this.eventBus.emit('transmission-shown', shown);
        },
        (entry) => this.eventBus.emit('transmission-finished', entry),
        (entry) => this.eventBus.emit('transmission-cut', entry),
        (entry) => this.eventBus.emit('transmission-dropped', entry)
      );
    }
    this.tacticalHud.updateAAATacticalHudFromServices({ force: true });

    this.pauseScreen.bindPauseControls();
    this.runEndScreens.bindControls();
    this.levelUpScreen.bindLevelUpControls();
    this.chestCeremony.bindControls();
    this.settingsPanel.bindSettingsControls();
    this.creditsOverlay.bindCreditsControls();
    this.changelogOverlay.bindCreditsControls();
    fillChangelog(this.domRefs.changelog);
    this.codexScreen.bindCodexControls();
    this.hangarScreen.bindHangarControls();
    this.campaignMap.bindCampaignControls();
    this.mainMenu.bindMainMenuControls();
    this.mainMenu.initializeMenuShipSelector();
    this.mainMenu.refreshMenuStatus();
    this.mainMenu.refreshBossRushLock();
    this.settingsPanel.bootstrapSettingsState();
    this.viewport.initializeViewportScaling();
  }

  /** The HUD Layout setting's layout on the HUD (app.js, the settings). */
  followHudLayout(video) {
    followHudLayout(this, video);
  }

  /** Settings → Edit HUD Layout or the pause screen's Edit HUD; the first
   * time, once the editor's file has come (ui/hudEditorDoor.js). */
  openHudEditor() {
    return openHudEditor(this);
  }

  resolveSettingsService() {
    return resolveService('settings', this.dependencies);
  }

  /** EnemySystem pushes the boss bar's state to the ui service. */
  handleBossEvent(eventName, data) {
    return this.tacticalHud.handleBossEvent(eventName, data);
  }

  /** A layer's banner and lines (ui/runStory.js). */
  handleLayerStarted(payload) {
    handleLayerStarted(this, payload);
  }

  queueTransmission(entry, options) {
    queueTransmission(this, entry, options);
  }

  setupEventListeners() {
    const registerBossEvent = (eventName) => {
      this.registerEventListener(eventName, (payload = {}) => {
        this.tacticalHud.handleBossEvent(eventName, payload);
      });
      this.registerEventListener(`ui-${eventName}`, (payload = {}) => {
        this.tacticalHud.handleBossEvent(eventName, payload);
      });
    };

    [
      'boss-hud-update',
      'boss-wave-started',
      'boss-spawned',
      'boss-phase-changed',
      'boss-invulnerability-changed',
      'boss-defeated',
    ].forEach(registerBossEvent);

    // The layers' banners, the Wardens' and Heralds' lines (ui/runStory.js).
    listenForStory(this);

    this.registerEventListener('player-died', () => {
      if (this.runWon) return;
      this.pilotDown = true;
      // Cards dealt on the step the ship died close: the death plays out.
      this.chestCeremony.clear();
      if (this.levelUpScreen.levelUpState.isVisible) {
        this.showGameUI();
      }
      this.lastTransmission = null;
      this.queueTransmission(
        deathTransmission(
          this.getRandomFork('base'),
          this.transmissionLayer,
          runModeOf(this).sector
        ),
        { interrupt: true }
      );
    });

    this.registerEventListener('surge-started', (payload) => {
      this.tacticalHud.onSurgeStarted(payload);
    });

    this.registerEventListener('field-event-started', (payload) => {
      this.tacticalHud.onFieldEventStarted(payload);
    });

    this.registerEventListener('field-event-ended', (payload) => {
      this.tacticalHud.onFieldEventEnded(payload);
    });

    this.registerEventListener('layer-modifier-started', (payload) => {
      this.tacticalHud.onLayerModifierStarted(payload);
    });
    this.registerEventListener('layer-modifier-ended', (payload) => {
      this.tacticalHud.onLayerModifierEnded(payload);
    });

    this.registerEventListener('game-started', () => {
      // A sector run returns to the campaign map when it ends.
      this.tacticalHud.onGameStarted();
      this.campaignMap.noteRunStart(runModeOf(this).sector?.id);
    });
    this.registerEventListener('aim-stick-changed', (payload) => {
      this.tacticalHud.onAimStickChanged(payload);
    });

    this.registerEventListener('player-took-damage', (payload) => {
      this.tacticalHud.onPlayerTookDamage(payload);
    });

    this.registerEventListener('enemy-destroyed', (payload) => {
      this.tacticalHud.onEnemyDestroyed(payload);
    });

    this.registerEventListener('xp-orb-collected', (payload) => {
      this.tacticalHud.onXpOrbCollected(payload);
    });

    this.registerEventListener('pickup-collected', (payload) => {
      this.tacticalHud.onPickupCollected(payload);
    });

    // A chest's cards, shown once it has given them all (ui/ChestCeremony.js).
    this.registerEventListener('chest-card', (payload) => {
      this.chestCeremony.addCard(payload);
    });
    this.registerEventListener('chest-spent', () => {
      if (this.runWon || this.pilotDown) return;
      this.chestCeremony.chestSpent();
    });

    this.registerEventListener('achievement-unlocked', (payload) => {
      this.tacticalHud.onAchievementUnlocked(payload);
    });

    this.registerEventListener('weapon-beam-fired', () => {
      this.tacticalHud.onWeaponBeamFired();
    });

    this.registerEventListener('pause-state-changed', (data) => {
      // The pad's Start resumes from anywhere: the editor keeps the run
      // paused and asks before it closes.
      if (this.hudEditor?.isOpen) {
        if (!data?.isPaused) {
          queueMicrotask(() => this.eventBus.emit('toggle-pause'));
          this.hudEditor.requestClose();
        }
        return;
      }
      if (!data?.isPaused && this.settingsPanel.isOpenFrom('playing')) {
        this.settingsPanel.closeSettingsPanel({ resumeRun: false });
      }
      this.pauseScreen.updatePauseScreen(Boolean(data?.isPaused));
    });

    this.registerEventListener('screen-changed', (payload = {}) => {
      handleScreenChanged(this, payload);
    });

    this.registerEventListener('hangar-purchased', ({ id } = {}) => {
      this.mainMenu.refreshMenuStatus();
      this.hangarScreen.showPurchaseLine(hangarTransmission(id));
    });

    // Renderer3D's Auto quality picked a preset: menu strip and the
    // Graphics preview name it.
    this.registerEventListener('quality-changed', ({ preset } = {}) => {
      this.liveQualityPreset = preset;
      this.mainMenu.refreshMenuStatus();
      this.settingsPanel.refreshCategory('graphics');
    });

    this.registerEventListener('toggle-pause', () => {
      if (
        resolveService('game-state', this.dependencies)?.getRawState?.()
          ?.sessionState === 'quitting'
      ) {
        return;
      }
      // The HUD editor holds the pause screen (pause-state-changed below).
      if (this.hudEditor?.isOpen) {
        return;
      }
      const appState = resolveService('game-state', this.dependencies);
      if (appState && typeof appState.isPaused === 'function') {
        this.pauseScreen.updatePauseScreen(Boolean(appState.isPaused()));
      }
    });

    this.registerEventListener('wave-complete', (payload = {}) => {
      this.tacticalHud.handleWaveCompletionEvent(payload);
    });

    this.registerEventListener('ui-show-screen', (payload = {}) => {
      if (payload?.screen) {
        this.showScreen(payload.screen, payload.options || {});
      }
    });

    // The won sector's id rides on the event: the ending's choice and the
    // win's lines are about that sector.
    this.registerEventListener('run-won', ({ wave, sector } = {}) => {
      this.runWon = true;
      this.chestCeremony.clear();
      this.lastTransmission = null;
      // The ending's act 1 says Sovereign's last words itself. Its scenes play
      // over a field still in flight, the instruments away: no flying tip on
      // them (this run is over; the next one teaches what is left).
      if (this.runEndScreens.opensChoice(sector)) {
        this.onboarding.stop();
        this.cinematics.startRevelation();
        return;
      }
      this.cinematics.startEpilogue();
      const [last, ...after] = winTransmissions(wave, sectorById(sector)?.boss);
      this.queueTransmission(last, { interrupt: true });
      after.forEach((line) => this.queueTransmission(line));
    });
    this.registerEventListener('run-continued', () => {
      this.runWon = false;
      this.cinematics.release();
    });
    this.registerEventListener('game-started', (payload = {}) => {
      this.runWon = false;
      this.pilotDown = false;
      this.chestCeremony.clear();
      this.runEndScreens.noteRunStart(payload);
      this.transmissions?.clear();
      this.cinematics.stop();
      this.cinematics.armTravel(payload);
      // After startNewRun has unpaused: the intro holds the first step.
      queueMicrotask(() => this.cinematics.startIntro());
      removeOnboardingCardsTip();
      this.onboarding.menuActed('menu');
      if (this.isOnboardingEnabled()) {
        this.onboarding.start();
      } else {
        this.onboarding.stop();
      }
    });
    // A retry's countdown ends in the respawn: the pilot is back.
    this.registerEventListener('session-retry-countdown', ({ phase } = {}) => {
      if (phase === 'complete') {
        this.pilotDown = false;
      }
    });
    // The lessons' answers and the menu's lines (ui/onboardingTips.js).
    listenForLessons(this);
    // No cards once the run has ended: over the victory or under the game
    // over; a run's first cards wait for its journey and intro.
    this.registerEventListener('upgrade-options-ready', (payload = {}) => {
      if (this.runWon || this.pilotDown) return;
      this.cinematics.afterTravel(() =>
        this.levelUpScreen.handleUpgradeOptions(payload)
      );
    });
    this.registerEventListener('upgrade-rerolled', (payload = {}) => {
      this.levelUpScreen.refreshLevelUpOptions(payload);
    });
    this.registerEventListener('upgrade-banished', (payload = {}) => {
      this.levelUpScreen.refreshLevelUpOptions(payload);
    });

    this.registerEventListener('settings-menu-requested', (payload = {}) => {
      const appState = resolveService('game-state', this.dependencies);
      if (appState?.getRawState?.()?.sessionState === 'quitting') {
        return;
      }
      let source = payload.source || 'menu';
      if (appState?.getScreen?.() === 'playing') {
        if (appState.isPaused?.()) {
          source = 'pause';
        } else {
          this.eventBus?.emit?.('toggle-pause');
          source = 'playing';
        }
      }
      this.settingsPanel.handleSettingsMenuRequest({ ...payload, source });
    });

    this.registerEventListener('toggle-fullscreen', () => {
      this.settingsPanel.toggleFullscreen();
    });

    this.registerEventListener('settings-changed', (change) => {
      this.settingsPanel.handleSettingsChange(change);
      this.followSettingsChange(change);
    });

    this.registerEventListener('credits-menu-requested', (payload = {}) => {
      this.creditsOverlay.handleCreditsMenuRequest(payload);
    });

    this.registerEventListener('changelog-menu-requested', (payload = {}) => {
      this.changelogOverlay.handleCreditsMenuRequest(payload);
    });

    this.registerEventListener('settings-controls-changed', (payload = {}) => {
      if (payload?.values) {
        this.settingsPanel.refreshCategory('controls');
      }
    });
    // The key hints follow the scheme in play (PlayerSystem).
    this.registerEventListener('control-scheme-changed', ({ scheme }) => {
      document.body.dataset.controls = scheme;
    });

    this.registerEventListener('settings-visual-changed', (payload = {}) => {
      this.settingsPanel.handleVisualPreferencesChange(payload);
      this.followHudLayout(payload.values?.video);
    });

    this.registerEventListener('key-pressed', (payload) => {
      this.settingsPanel.handleKeyPressForCapture(payload);
    });

    this.registerEventListener('gamepad-input-detected', (payload) => {
      this.settingsPanel.handleGamepadInputForCapture(payload);
    });

    this.registerEventListener('input-action', (payload = {}) => {
      this.levelUpScreen.handleLevelUpInputAction(payload);
    });

    // The screen on top of the input layer stack takes the confirm.
    this.registerEventListener('input-confirmed', () => inputLayers.confirm());

    this.registerEventListener('gamepad-ui-nav', (payload = {}) => {
      // The d-pad steps item by item: the pad's pointer goes (not while it
      // changes a list the pointer opened).
      if (
        ['up', 'down', 'left', 'right'].includes(payload.action) &&
        !this.padNav.editing
      ) {
        this.padPointer.hide();
      }
      this.padNav.handle(payload.action);
    });
    this.registerEventListener('gamepad-ui-scroll', (payload = {}) => {
      this.padNav.scroll(payload.y);
    });

    this.registerEventListener('input-device-changed', (payload = {}) => {
      this.handleInputDeviceChanged(payload.device);
    });
  }

  /** Hints and tips name the keys or pad buttons of the last device used. */
  handleInputDeviceChanged(device) {
    document.body.dataset.inputDevice = device;
    if (this.onboarding.shown && this.onboarding.current) {
      showOnboardingTip(this, this.onboarding.current);
    }
    this.padNav.refreshHints();
  }

  // The menu strip, the ship selector and the onboarding tips follow a
  // setting change.
  followSettingsChange(change) {
    if (!change) {
      return;
    }

    if (change.category === 'gameplay' || change.type === 'reset-all') {
      this.mainMenu.requestMenuShipSelectorRefresh();
    }

    if (
      change.category === 'graphics' ||
      change.key === 'difficulty' ||
      change.type === 'reset-all'
    ) {
      this.mainMenu.refreshMenuStatus();
    }

    if (change.category === 'gameplay' && change.key === 'onboardingTips') {
      if (change.value === false) {
        this.onboarding.stop();
        removeOnboardingCardsTip();
      } else if (change.previous === false) {
        this.onboarding.replay();
      }
      this.refreshMenuTips();
    }
  }

  emitOverlayVisibilityChanged(overlay, isOpen, payload = {}) {
    if (!overlay || !this.eventBus?.emit) {
      return;
    }

    this.eventBus.emit('ui-overlay-visibility-changed', {
      overlay,
      isOpen: Boolean(isOpen),
      ...payload,
    });
  }

  /** After each drawn frame (app.js), paused too: the HUD on field points
   * (the hull ring, the recharges, edge arrows, damage arcs) and the
   * editor's frames for the on-ship ones, where this frame drew them. */
  placeOnField() {
    this.tacticalHud.placeOnField();
    this.hudEditor?.followShip();
  }

  update(deltaTime) {
    this.tacticalHud.update(deltaTime);
    updateOnboarding(this, deltaTime);
  }

  // Which screen shows (ui/screenSwitch.js).
  showScreen(screenName, options) {
    showScreen(this, screenName, options);
  }

  showGameUI(options) {
    showGameUI(this, options);
  }

  holdSim(held) {
    holdSim(this, held);
  }

  /** GameSessionService clears the cards when a run starts or ends. */
  resetLevelUpState() {
    this.levelUpScreen.resetLevelUpState();
  }

  prefersReducedMotion() {
    return (
      document.body.classList.contains('motion-reduced') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  // The onboarding on screen (ui/onboardingTips.js).
  isOnboardingEnabled() {
    return isOnboardingEnabled(this);
  }

  showOnboardingCardsTip(headStart) {
    showOnboardingCardsTip(this, headStart);
  }

  refreshMenuTips(hangarOpen) {
    refreshMenuTips(this, hangarOpen);
  }
}

export default UISystem;
