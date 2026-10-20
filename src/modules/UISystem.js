// src/modules/UISystem.js

import SETTINGS_SCHEMA from '../data/settingsSchema.js';
import {
  bossRushStage,
  bossRushStageTitle,
  directorFor,
} from '../data/layers.js';
import { HERALD_KINDS } from '../data/enemies/herald.js';
import { RUN_FINAL_LAYER } from '../data/constants/gameplay.js';
import { biomeForLayer } from '../data/biomes.js';
import { BaseSystem } from '../core/BaseSystem.js';
import { resolveService } from '../core/serviceUtils.js';
import { resolveControlScheme } from './PlayerSystem.js';
import { Onboarding, onboardingPrompts } from './ui/onboarding.js';
import { RunCinematics } from './ui/runCinematics.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { LevelUpScreen } from './ui/LevelUpScreen.js';
import { PauseScreen } from './ui/PauseScreen.js';
import { RunEndScreens } from './ui/RunEndScreens.js';
import { CreditsOverlay } from './ui/CreditsOverlay.js';
import { TacticalHud } from './ui/TacticalHud.js';
import { MainMenu } from './ui/MainMenu.js';
import { HangarScreen } from './ui/HangarScreen.js';
import { CodexScreen } from './ui/CodexScreen.js';
import { cacheStaticNodes } from './ui/domRefs.js';
import { ViewportScaling } from './ui/viewportScaling.js';
import {
  TransmissionQueue,
  bossRushTransmission,
  chapterTransmission,
  deathTransmission,
  hangarTransmission,
  heraldTransmission,
  sightingTransmission,
  victoryTransmission,
  wardenTransmission,
} from './ui/transmissions.js';
import {
  GAMEPAD_FOCUSABLE_SELECTOR,
  GAMEPAD_NAV_SCREENS,
  pickFocusTarget,
} from './ui/gamepadNav.js';

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
      renderer: () => this.getService('renderer'),
      hud: () => this.tacticalHud.layout,
      // The session's pause flag alone: no pause screen, no fixed steps.
      holdSim: (held) => this.getService('game-state')?.setPaused(held),
      bindSkip: (skip) => {
        // Capture on window runs before every other key handler: the key
        // only skips (a held key's repeats are swallowed too).
        const onKey = (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!event.repeat) skip();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
      },
      onIntroEnd: () =>
        this.handleLayerStarted({ wave: this.transmissionLayer }),
    });
    this.onboarding = new Onboarding(
      {
        showTip: (id) => this.showOnboardingTip(id),
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
      player: () => this.getService('player'),
      enemies: () => this.getService('enemies'),
      progression: () => this.getService('progression'),
      combat: () => this.getService('combat'),
      pickups: () => this.getService('pickups'),
      xpOrbs: () => this.getService('xp-orbs'),
      renderer: () => this.getService('renderer'),
    });
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
    });
    this.levelUpScreen = new LevelUpScreen({
      refs: this.domRefs.levelUp,
      progression: () => this.getService('progression'),
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      showGameUI: () => this.showGameUI(),
      showCardsTip: () => this.showOnboardingCardsTip(),
      prefersReducedMotion: () => this.prefersReducedMotion(),
      colorVision: () => this.settingsPanel.colorVision,
    });
    this.pauseScreen = new PauseScreen({
      refs: this.domRefs.pause,
      gameOverQuitBtn: this.domRefs.gameOver.quitBtn,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      progression: () => this.getService('progression'),
      combat: () => this.getService('combat'),
      difficulty: () => this.getService('difficulty'),
      layer: () => this.transmissionLayer,
      settingsOpenHere: () => this.settingsPanel.isOpenFrom('pause'),
      closeSettings: () => this.settingsPanel.closeSettingsPanel(),
    });
    this.runEndScreens = new RunEndScreens({
      refs: { gameOver: this.domRefs.gameOver, victory: this.domRefs.victory },
      showScreen: (name, options) => this.showScreen(name, options),
      progression: () => this.getService('progression'),
      combat: () => this.getService('combat'),
      difficulty: () => this.getService('difficulty'),
      hangar: () => this.getService('hangar'),
      lastTransmission: () => this.lastTransmission,
    });
    this.creditsOverlay = new CreditsOverlay({
      refs: this.domRefs.credits,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      announceVisibility: (isOpen, payload) =>
        this.emitOverlayVisibilityChanged('credits', isOpen, payload),
    });
    this.mainMenu = new MainMenu({
      refs: this.domRefs.menu,
      settings: this.settings,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      hangar: () => this.getService('hangar'),
      codex: () => this.getService('codex'),
      achievements: () => this.getService('achievements'),
      difficulty: () => this.getService('difficulty'),
      player: () => this.getService('player'),
      livePreset: () => this.liveQualityPreset,
    });
    this.hangarScreen = new HangarScreen({
      refs: this.domRefs.hangar,
      settings: this.settings,
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      showScreen: (name, options) => this.showScreen(name, options),
      announceVisibility: (isOpen, payload) =>
        this.emitOverlayVisibilityChanged('hangar', isOpen, payload),
      hangar: () => this.getService('hangar'),
      selectedHullId: () => this.mainMenu.getSelectedHullId(),
      hullName: (hull) => this.mainMenu.getHullDisplayName(hull),
      refreshShipSelector: () => this.mainMenu.requestMenuShipSelectorRefresh(),
    });
    this.codexScreen = new CodexScreen({
      refs: this.domRefs.codex,
      showScreen: (name, options) => this.showScreen(name, options),
      announceVisibility: (isOpen, payload) =>
        this.emitOverlayVisibilityChanged('codex', isOpen, payload),
      codex: () => this.getService('codex'),
      achievements: () => this.getService('achievements'),
    });
    // The static keyboard hints show the scheme in use (style.css).
    document.body.dataset.controls = resolveControlScheme(
      this.resolveSettingsService()?.getCategoryValues('controls')?.hullControl
    );

    // Direct AAA HUD Activation
    this.tacticalHud.activateAAATacticalHud();
    if (this.tacticalHud.layout) {
      this.transmissions = new TransmissionQueue(
        this.tacticalHud.layout,
        ({ speaker, key, text }) => {
          this.lastTransmission = { speaker, text };
          this.eventBus.emit('transmission-shown', { speaker, key });
        },
        ({ key }) => {
          this.eventBus.emit('transmission-finished', { key });
        }
      );
    }
    this.tacticalHud.updateAAATacticalHudFromServices({ force: true });

    this.pauseScreen.bindPauseControls();
    this.runEndScreens.bindCopySeedLink();
    this.levelUpScreen.bindLevelUpControls();
    this.settingsPanel.bindSettingsControls();
    this.creditsOverlay.bindCreditsControls();
    this.codexScreen.bindCodexControls();
    this.hangarScreen.bindHangarControls();
    this.mainMenu.bindMainMenuControls();
    this.mainMenu.initializeMenuShipSelector();
    this.mainMenu.refreshMenuStatus();
    this.mainMenu.refreshBossRushLock();
    this.settingsPanel.bootstrapSettingsState();
    this.viewport.initializeViewportScaling();
  }

  getService(name) {
    return resolveService(name, this.dependencies);
  }

  resolveSettingsService() {
    return this.getService('settings');
  }

  /** EnemySystem pushes the boss bar's state to the ui service. */
  handleBossEvent(eventName, data) {
    return this.tacticalHud.handleBossEvent(eventName, data);
  }

  handleLayerStarted(payload = {}) {
    const hud = this.tacticalHud.layout;
    if (!hud) {
      return;
    }
    const layer = Math.max(1, Math.floor(Number(payload.wave) || 1));
    this.transmissionLayer = layer;
    // The intro's end shows this layer's title card.
    if (this.cinematics.introActive) {
      return;
    }
    const boss = Boolean(payload.isBossWave) || directorFor(layer).warden;
    const biome = biomeForLayer(layer);
    const firstOfBiome = biome.layers[0] === layer;
    const stage = this.bossRush ? bossRushStage(layer) : 0;
    hud.showLayerBanner(layer, {
      boss,
      bossRush: this.bossRush,
      chapter: stage
        ? bossRushStageTitle(stage)
        : firstOfBiome
          ? biome.title
          : layer > RUN_FINAL_LAYER
            ? 'DEEP FIELD'
            : '',
    });
    if (firstOfBiome) {
      this.queueTransmission(chapterTransmission(biome.id));
    }
    if (stage === 1) {
      this.queueTransmission(bossRushTransmission());
    }
  }

  /** Queues a Warden transmission and keeps the frame loop that plays it. */
  queueTransmission(entry, { interrupt = false } = {}) {
    const queue = this.transmissions;
    if (!queue || !entry) {
      return;
    }
    if (interrupt) {
      queue.interrupt(entry);
    } else {
      queue.push(entry);
    }
    if (this.transmissionRaf) {
      return;
    }
    // Wall-clock UI timing like the HUD banners: it keeps playing while the
    // run is paused, dead or won.
    const tick = () => {
      if (this.transmissions !== queue) {
        this.transmissionRaf = null;
        return;
      }
      queue.update(performance.now(), this.prefersReducedMotion());
      this.transmissionRaf = queue.active
        ? window.requestAnimationFrame(tick)
        : null;
    };
    this.transmissionRaf = window.requestAnimationFrame(tick);
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

    this.registerEventListener('wave-started', (payload = {}) => {
      // The run's mode rides on every layer start (the intro's end reads it).
      this.bossRush = Boolean(payload.bossRush);
      this.handleLayerStarted(payload);
    });

    this.registerEventListener('boss-warning', (payload = {}) => {
      // Boss Rush: the breather names the next Warden.
      if (this.bossRush) {
        this.tacticalHud.layout?.showLayerBanner(payload.nextBossWave, {
          boss: true,
          bossRush: true,
          chapter: bossRushStageTitle(bossRushStage(payload.nextBossWave)),
        });
      }
      this.queueTransmission(
        wardenTransmission(payload.nextBossWave, 'warning')
      );
    });

    // A Warden's entrance: the letterbox until it closes up.
    this.registerEventListener('boss-spawned', (payload = {}) => {
      this.cinematics.startArrival(payload.enemy);
    });
    this.registerEventListener('boss-arrived', () => {
      this.cinematics.endArrival();
    });

    this.registerEventListener('boss-defeated', (payload = {}) => {
      this.queueTransmission(wardenTransmission(payload.wave, 'defeated'));
    });

    this.registerEventListener('player-died', () => {
      if (this.runWon) {
        return;
      }
      this.pilotDown = true;
      // Cards dealt on the step the ship died close: the death plays out.
      if (this.levelUpScreen.levelUpState.isVisible) {
        this.showGameUI();
      }
      this.lastTransmission = null;
      this.queueTransmission(
        deathTransmission(this.getRandomFork('base'), this.transmissionLayer),
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

    // A Herald arrives under a violet banner, then speaks; Silence jams the
    // radar while it lives (a new run clears it).
    this.registerEventListener('herald-spawned', ({ kind } = {}) => {
      const herald = HERALD_KINDS[kind];
      if (!herald) return;
      this.tacticalHud.layout?.showHeraldBanner(
        herald.displayName,
        herald.subtitle
      );
      if (herald.jamsRadar) this.tacticalHud.layout?.setRadarJammed(true);
      this.queueTransmission(heraldTransmission(kind, 'spawned'));
    });
    this.registerEventListener('herald-defeated', ({ kind } = {}) => {
      this.queueTransmission(heraldTransmission(kind, 'defeated'));
      if (HERALD_KINDS[kind]?.jamsRadar) {
        this.tacticalHud.layout?.setRadarJammed(false);
      }
    });
    // The Ring names a machine the first time it is ever seen; not over the
    // intro or once the run has ended.
    this.registerEventListener('codex-discovered', ({ type } = {}) => {
      if (this.cinematics.introActive || this.runWon || this.pilotDown) {
        return;
      }
      this.queueTransmission(sightingTransmission(type));
    });
    this.registerEventListener('game-started', () => {
      this.tacticalHud.onGameStarted();
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

    this.registerEventListener('chest-card', (payload) => {
      this.tacticalHud.onChestCard(payload);
    });

    this.registerEventListener('achievement-unlocked', (payload) => {
      this.tacticalHud.onAchievementUnlocked(payload);
    });

    this.registerEventListener('weapon-beam-fired', () => {
      this.tacticalHud.onWeaponBeamFired();
    });

    this.registerEventListener('pause-state-changed', (data) => {
      this.pauseScreen.updatePauseScreen(Boolean(data?.isPaused));
    });

    this.registerEventListener('screen-changed', (payload = {}) => {
      this.handleScreenChanged(payload);
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
      const appState = this.getService('game-state');
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

    this.registerEventListener('run-won', () => {
      this.runWon = true;
      this.lastTransmission = null;
      this.cinematics.startEpilogue();
      this.queueTransmission(victoryTransmission(), { interrupt: true });
    });
    this.registerEventListener('run-continued', () => {
      this.runWon = false;
      this.cinematics.release();
    });
    this.registerEventListener('game-started', () => {
      this.runWon = false;
      this.pilotDown = false;
      this.transmissions?.clear();
      this.cinematics.stop();
      // After startNewRun has unpaused: the intro holds the first step.
      queueMicrotask(() => this.cinematics.startIntro());
      this.removeOnboardingCardsTip();
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
    this.registerEventListener('player-dashed', () => {
      this.onboarding.dashed();
    });
    this.registerEventListener('shield-activated', () => {
      this.onboarding.shieldRaised();
    });
    this.registerEventListener('upgrade-applied', () => {
      this.onboarding.cardPicked();
      this.removeOnboardingCardsTip();
    });
    // No cards once the run has ended: over the victory or under the game over.
    this.registerEventListener('upgrade-options-ready', (payload = {}) => {
      if (this.runWon || this.pilotDown) {
        return;
      }
      this.levelUpScreen.handleUpgradeOptions(payload);
    });
    this.registerEventListener('upgrade-rerolled', (payload = {}) => {
      this.levelUpScreen.refreshLevelUpOptions(payload);
    });
    this.registerEventListener('upgrade-banished', (payload = {}) => {
      this.levelUpScreen.refreshLevelUpOptions(payload);
    });

    this.registerEventListener('settings-menu-requested', (payload = {}) => {
      this.settingsPanel.handleSettingsMenuRequest(payload);
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

    this.registerEventListener('settings-controls-changed', (payload = {}) => {
      if (payload?.values) {
        this.settingsPanel.refreshCategory('controls');
        document.body.dataset.controls = resolveControlScheme(
          payload.values.hullControl
        );
      }
    });

    this.registerEventListener('settings-visual-changed', (payload = {}) => {
      this.settingsPanel.handleVisualPreferencesChange(payload);
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

    this.registerEventListener('input-confirmed', () => {
      this.levelUpScreen.handleLevelUpConfirm();
    });

    this.registerEventListener('gamepad-ui-nav', (payload = {}) => {
      this.handleGamepadNav(payload.action);
    });

    this.registerEventListener('input-device-changed', (payload = {}) => {
      this.handleInputDeviceChanged(payload.device);
    });
  }

  /** Hints and tips name the keys or pad buttons of the last device used. */
  handleInputDeviceChanged(device) {
    document.body.dataset.inputDevice = device;
    if (this.onboarding.shown && this.onboarding.current) {
      this.showOnboardingTip(this.onboarding.current);
    }
  }

  /** The topmost visible screen a pad can navigate, or null during play. */
  getGamepadNavScreen() {
    for (const id of GAMEPAD_NAV_SCREENS) {
      const element = document.getElementById(`${id}-screen`);
      if (element && !element.classList.contains('hidden')) {
        return { id, element };
      }
    }
    return null;
  }

  /**
   * One pad navigation press (InputSystem 'gamepad-ui-nav'): d-pad/stick move
   * the focus, A activates, B goes back, LB/RB switch tabs, X/Y reroll and
   * banish on the level-up screen (whose cards already follow the move and
   * confirm bindings).
   */
  handleGamepadNav(action) {
    const screen = this.getGamepadNavScreen();
    if (!screen || this.settingsPanel.capturing) {
      return;
    }
    const { id, element } = screen;

    if (id === 'levelup') {
      this.levelUpScreen.handleGamepadNav(action);
      return;
    }

    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        this.moveGamepadFocus(element, action);
        break;
      case 'confirm': {
        const active = document.activeElement;
        if (active && element.contains(active) && active !== element) {
          active.click();
        } else {
          this.moveGamepadFocus(element, null);
        }
        break;
      }
      case 'back':
        if (id === 'settings') this.settingsPanel.closeSettingsPanel();
        else if (id === 'codex') this.codexScreen.closeCodex();
        else if (id === 'hangar') this.hangarScreen.closeHangar();
        else if (id === 'credits') {
          this.creditsOverlay.closeCreditsOverlay({ restoreFocus: true });
        } else if (id === 'pause') this.eventBus?.emit?.('toggle-pause');
        break;
      case 'tabPrev':
      case 'tabNext': {
        const step = action === 'tabPrev' ? -1 : 1;
        if (id === 'codex') {
          this.codexScreen.cycleTab(step);
        } else if (id === 'settings') {
          this.settingsPanel.cycleCategory(step);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Focus the nearest control `direction` of the focused one (null: first). */
  moveGamepadFocus(root, direction) {
    const active = document.activeElement;
    const current = active && root.contains(active) ? active : null;
    // Sliders and selects take left/right as a value change.
    if (current && (direction === 'left' || direction === 'right')) {
      const step = direction === 'left' ? -1 : 1;
      if (current.type === 'range') {
        if (step < 0) current.stepDown();
        else current.stepUp();
        current.dispatchEvent(new Event('input', { bubbles: true }));
        current.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      if (current.tagName === 'SELECT') {
        const count = current.options.length;
        current.selectedIndex = (current.selectedIndex + step + count) % count;
        current.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
    const candidates = [
      ...root.querySelectorAll(GAMEPAD_FOCUSABLE_SELECTOR),
    ].filter(
      (candidate) => candidate !== current && candidate.getClientRects().length
    );
    const index = pickFocusTarget(
      current?.getBoundingClientRect() ?? null,
      candidates.map((candidate) => candidate.getBoundingClientRect()),
      direction
    );
    if (index >= 0) {
      candidates[index].focus();
      candidates[index].scrollIntoView?.({ block: 'nearest' });
    }
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
        this.removeOnboardingCardsTip();
      } else if (change.previous === false) {
        this.onboarding.replay();
      }
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

  update(deltaTime) {
    this.tacticalHud.update(deltaTime);
    if (this.onboarding.current) {
      const moving = this.getService('input').getMovementInput();
      this.onboarding.update(deltaTime, {
        moving: moving.up || moving.down || moving.left || moving.right,
        shieldReady: this.getService('player').getShieldState().maxHits > 0,
        bannerBusy: Boolean(this.tacticalHud.layout?.isBannerBusy()),
      });
    }
  }

  handleScreenChanged(payload = {}) {
    const screenName = payload?.screen;
    if (typeof screenName !== 'string' || !screenName.length) {
      return;
    }

    if (screenName === 'pause') {
      this.showScreen('pause', { overlay: true, show: true, emitEvent: false });
      return;
    }

    if (screenName === 'levelup') {
      this.showScreen('levelup', {
        overlay: true,
        show: true,
        emitEvent: false,
      });
      return;
    }

    if (screenName === 'gameover') {
      this.runEndScreens.showGameOverScreen(payload);
      return;
    }

    if (screenName === 'victory') {
      const show = () => this.runEndScreens.showVictoryScreen(payload);
      if (!this.cinematics.deferUntilEpilogueEnds(show)) {
        show();
      }
      return;
    }

    this.showScreen(screenName, { emitEvent: false });
  }

  // Legacy Standard HUD update methods removed.

  showScreen(screenName, options = {}) {
    const { overlay = false, show = true, emitEvent = true } = options;
    try {
      if (overlay) {
        const target = document.getElementById(`${screenName}-screen`);
        if (target) {
          target.classList.toggle('hidden', !show);
        }

        // Keep game-ui visible for pause, level-up and gameover overlays
        if (
          (screenName === 'pause' ||
            screenName === 'levelup' ||
            screenName === 'gameover' ||
            screenName === 'victory') &&
          show
        ) {
          const gameUI = document.getElementById('game-ui');
          if (gameUI) gameUI.classList.remove('hidden');
        }

        // The session service pauses the game on any non-'playing' screen.
        if (screenName === 'levelup' && show && emitEvent) {
          this.eventBus?.emit?.('screen-changed', { screen: screenName });
        }
        return;
      }

      document.querySelectorAll('.screen').forEach((screen) => {
        screen.classList.add('hidden');
      });

      const gameUI = document.getElementById('game-ui');
      if (gameUI) gameUI.classList.add('hidden');

      if (this.settingsPanel.isOpenFrom('menu') && screenName !== 'menu') {
        this.settingsPanel.closeSettingsPanel();
      }

      if (screenName === 'playing' || screenName === 'game') {
        if (gameUI) gameUI.classList.remove('hidden');
      } else {
        const screen = document.getElementById(`${screenName}-screen`);
        if (screen) screen.classList.remove('hidden');
      }

      const pauseOverlay = document.getElementById('pause-screen');
      if (pauseOverlay) pauseOverlay.classList.add('hidden');

      const creditsOverlay = document.getElementById('credits-screen');
      if (creditsOverlay) {
        creditsOverlay.classList.add('hidden');
        creditsOverlay.setAttribute('aria-hidden', 'true');
      }

      this.creditsOverlay.markClosed();

      this.codexScreen.closeCodex();
      this.hangarScreen.closeHangar();

      document.body?.classList.remove('is-credits-open');

      if (screenName === 'menu') {
        this.mainMenu.requestMenuShipSelectorRefresh();
        this.mainMenu.refreshMenuStatus();
        this.mainMenu.refreshBossRushLock();
      }

      if (emitEvent) {
        this.eventBus?.emit?.('screen-changed', { screen: screenName });
      }
    } catch (error) {
      console.error('[UISystem] Failed to show screen:', error);
    }
  }

  /** Back to play; several level-ups at once deal their card choices first. */
  showGameUI(options = {}) {
    this.levelUpScreen.resetLevelUpState();
    if (
      !this.runWon &&
      !this.pilotDown &&
      this.getService('progression').openNextLevelUpOffer()
    ) {
      return;
    }
    this.showScreen('playing', options);
    this.tacticalHud.refreshHudFromServices(true);
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

  isOnboardingEnabled() {
    return (
      !this.onboardingDisabled &&
      this.resolveSettingsService()?.getSetting(
        'gameplay',
        'onboardingTips'
      ) !== false
    );
  }

  /** The in-play tip `id`, naming the keys or buttons the player bound. */
  showOnboardingTip(id) {
    const controls =
      this.resolveSettingsService()?.getCategoryValues('controls') || {};
    const device = this.getService('input').getActiveDevice();
    const keys = {};
    [
      'moveUp',
      'moveDown',
      'moveLeft',
      'moveRight',
      'dash',
      'activateShield',
    ].forEach((action) => {
      keys[action] = this.settingsPanel.formatBindingLabel(
        controls[action]?.[device]?.[0],
        device
      );
    });
    const prompt = onboardingPrompts(
      keys,
      this.getService('player')?.controlScheme,
      device
    )[id];
    this.tacticalHud.layout?.showOnboardingTip(prompt.keys, prompt.text);
  }

  /** The cards tip in the level-up footer, on the first level-up only. */
  showOnboardingCardsTip() {
    const text = this.onboarding.cardsTip(
      this.getService('input').getActiveDevice()
    );
    const content = document.querySelector('#levelup-screen .levelup-content');
    if (!text || !content || content.querySelector('.onboarding-cards-tip')) {
      return;
    }
    const tip = document.createElement('p');
    tip.className = 'levelup-hint onboarding-cards-tip';
    tip.setAttribute('role', 'status');
    tip.textContent = text;
    content.appendChild(tip);
  }

  removeOnboardingCardsTip() {
    document.querySelector('.onboarding-cards-tip')?.remove();
  }
}

export default UISystem;
