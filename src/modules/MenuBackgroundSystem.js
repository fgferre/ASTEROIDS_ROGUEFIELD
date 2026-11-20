// src/modules/MenuBackgroundSystem.js
//
// The Three.js scene behind the main menu: the opening scene (the game's own
// space, broken Ring and rocks, one of three shots drawn each time the game
// opens, rocks hurled into each other now and then) with the chosen hull
// framed in front by the menu's own scene. This file orchestrates (boot, the
// loading the game's shader warm-up waits on, the frame loop, settings,
// screens, the seeded random) and owns that state; the parts live in
// ./menu/: openingScene (+ openingRocks), rendering (the renderer and the
// hull's key light), adaptiveQuality, cameraOrbit, loadingScreen and
// threeUuid.

import { BaseSystem } from '../core/BaseSystem.js';
import { resolveService } from '../core/serviceUtils.js';
import { createRandomHelpers } from '../utils/randomHelpers.js';
import { MenuHullPreview } from './MenuHullPreview.js';
import * as quality from './menu/adaptiveQuality.js';
import { orbitCamera } from './menu/cameraOrbit.js';
import * as loadingScreen from './menu/loadingScreen.js';
import { createOpeningScene, openingShotFromUrl } from './menu/openingScene.js';
import * as rendering from './menu/rendering.js';
import * as threeUuid from './menu/threeUuid.js';

class MenuBackgroundSystem extends BaseSystem {
  constructor(dependencies = {}) {
    const normalizedDependencies =
      dependencies &&
      typeof dependencies === 'object' &&
      !Array.isArray(dependencies)
        ? dependencies
        : {};
    const parentRandom = normalizedDependencies.random;
    const initialRandomSnapshot =
      parentRandom && typeof parentRandom.debugSnapshot === 'function'
        ? parentRandom.debugSnapshot()
        : null;

    // Pass config to BaseSystem with random management options
    super(normalizedDependencies, {
      enableRandomManagement: true,
      systemName: 'MenuBackgroundSystem',
      serviceName: 'menu-background',
      randomForkLabels: {
        base: 'menu.base',
        asteroids: 'menu.asteroids',
        threeUuid: 'menu.three-uuid',
      },
    });
    this._initialRandomSnapshot = initialRandomSnapshot
      ? JSON.parse(JSON.stringify(initialRandomSnapshot))
      : null;
    this._initialRandomSeed =
      typeof parentRandom?.seed === 'number' ? parentRandom.seed >>> 0 : null;

    const randomHelpers = createRandomHelpers({
      getRandomFork: (name) => this.getRandomFork(name),
      random: this.random,
      fallbackSeedPrefix: 'menu-background',
    });
    this.randomHelpers = randomHelpers;
    Object.assign(this, randomHelpers);
    this.settingsService = null;
    this.canvas =
      typeof document !== 'undefined'
        ? document.getElementById('menu-background-canvas')
        : null;

    this.ready =
      typeof window !== 'undefined' &&
      typeof requestAnimationFrame === 'function' &&
      Boolean(this.canvas);

    this.THREE = this.ready ? window.THREE : null;
    this.ready = this.ready && Boolean(this.THREE);

    this._threeMathUtilsState = threeUuid.createThreeMathUtilsState();

    this.animationFrame = null;
    this.isActive = false;
    this.clock = null;
    this.elapsedTime = 0;

    // Pre-loading state
    this.loadingState = {
      isLoading: false,
      isReady: false,
      progress: 0,
      totalSteps: 0,
      currentStep: 0,
      pendingStart: false, // True if start() was called during loading
      // The opaque loading screen still covers the canvas (through the game's
      // shader warm-up): frames keep the scene moving but skip drawing.
      covered: false,
      onProgress: null, // Callback: (progress: 0-1, message: string) => void
      onComplete: null, // Callback: () => void
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    // The opening scene, built while the loading screen shows.
    this.opening = null;

    this.adaptiveQuality = quality.createAdaptiveQualityState();
    this.stats = this.resolveStatsPanel();
    this.unsubscribeFromSettings = null;

    this.handleResize = this.handleResize.bind(this);
    this.handleScreenChanged = this.handleScreenChanged.bind(this);
    this.animate = this.animate.bind(this);

    if (this.ready) {
      this.withSeededMathRandom(() => {
        this.applyDeterministicThreeUuidGenerator();
        this.setupLoadingScreen(); // Setup loading UI callbacks
        this.bootstrapScene();
      });
      this.registerEventHooks();
      this.setupSettingsSubscription();
      // Note: syncInitialState is called from preloadAssets when complete
    } else if (!this.canvas) {
      console.warn('[MenuBackgroundSystem] Canvas element not found.');
    } else {
      console.warn('[MenuBackgroundSystem] Three.js is not available.');
    }
  }

  captureRandomForkSeeds() {
    super.captureRandomForkSeeds();

    // Preserve deterministic UUID generation for Three.js helpers while
    // delegating base fork management to BaseSystem.
    const threeUuidFork = this.randomForks?.threeUuid;
    if (threeUuidFork) {
      this.storeRandomForkSeed('threeUuid', threeUuidFork);
    }
  }

  storeRandomForkSeed(name, fork) {
    if (name !== 'threeUuid' || !fork || typeof fork !== 'object') {
      return;
    }

    if (!this.randomForkSeeds) {
      this.randomForkSeeds = {};
    }

    if (typeof fork.seed === 'number' && Number.isFinite(fork.seed)) {
      this.randomForkSeeds[name] = fork.seed >>> 0;
    }
  }

  ensureThreeUuidRandom() {
    if (!this.randomForks || typeof this.randomForks !== 'object') {
      this.randomForks = {};
    }

    let fork = this.randomForks.threeUuid;
    if (fork && typeof fork.uuid === 'function') {
      return fork;
    }

    const label = this.randomForkLabels?.threeUuid ?? 'menu.three-uuid';
    const parentRandom =
      (this.random && typeof this.random.fork === 'function'
        ? this.random
        : threeUuid.SIMPLEX_DEFAULT_RANDOM) ?? threeUuid.SIMPLEX_DEFAULT_RANDOM;

    fork = parentRandom.fork(label);
    this.randomForks.threeUuid = fork;
    this.storeRandomForkSeed('threeUuid', fork);

    return fork;
  }

  onReset() {
    const fork = this.ensureThreeUuidRandom();
    const storedSeed = this.randomForkSeeds?.threeUuid;

    if (fork && storedSeed !== undefined && typeof fork.reset === 'function') {
      fork.reset(storedSeed);
    }
  }

  reset(options = {}) {
    const normalized =
      options && typeof options === 'object' && options !== null ? options : {};

    if (normalized.refreshForks) {
      if (
        this._initialRandomSnapshot &&
        this.random &&
        typeof this.random.restore === 'function'
      ) {
        this.random.restore(this._initialRandomSnapshot);
      } else if (
        this._initialRandomSeed !== null &&
        this.random &&
        typeof this.random.reset === 'function'
      ) {
        this.random.reset(this._initialRandomSeed);
      }
    }

    super.reset(options);

    if (normalized.restoreThreeUuidGenerator) {
      this.restoreOriginalThreeUuidGenerator();
    }

    this.applyDeterministicThreeUuidGenerator();
  }

  applyDeterministicThreeUuidGenerator() {
    threeUuid.applyDeterministicThreeUuidGenerator(
      this._threeMathUtilsState,
      this.THREE,
      () => this.ensureThreeUuidRandom()
    );
  }

  restoreOriginalThreeUuidGenerator() {
    threeUuid.restoreOriginalThreeUuidGenerator(
      this._threeMathUtilsState,
      this.THREE
    );
  }

  /**
   * Three.js draws its internal UUIDs (and its rand* helpers) from the global
   * Math.random, bypassing MathUtils.generateUUID. While `fn` runs (the async
   * scene build, or a runtime Three allocation) the global is swapped for the
   * menu's seeded fork, so the menu stays reproducible and the dev
   * Math.random guard stays quiet. The original is restored when the
   * outermost call settles (awaited when `fn` returns a promise).
   */
  withSeededMathRandom(fn) {
    const state = this._threeMathUtilsState;
    if (state.seededMathRandomDepth === 0) {
      // eslint-disable-next-line no-restricted-properties -- Three.js reads Math.random; swapped for the seeded generator while the menu scene builds
      state.originalMathRandom = Math.random;
      // eslint-disable-next-line no-restricted-properties -- Three.js reads Math.random; swapped for the seeded generator while the menu scene builds
      Math.random = () => this.ensureThreeUuidRandom().float();
    }
    state.seededMathRandomDepth += 1;

    const release = () => {
      state.seededMathRandomDepth -= 1;
      if (state.seededMathRandomDepth === 0) {
        // eslint-disable-next-line no-restricted-properties -- Three.js reads Math.random; swapped for the seeded generator while the menu scene builds
        Math.random = state.originalMathRandom;
        state.originalMathRandom = undefined;
      }
    };

    let result;
    try {
      result = fn();
    } catch (error) {
      release();
      throw error;
    }
    if (result && typeof result.then === 'function') {
      return result.finally(release);
    }
    release();
    return result;
  }

  destroy() {
    if (
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('resize', this.handleResize);
    }

    if (typeof this.unsubscribeFromSettings === 'function') {
      this.unsubscribeFromSettings();
      this.unsubscribeFromSettings = null;
    }

    super.destroy();

    this.stop();
    this.restoreOriginalThreeUuidGenerator();
  }

  getService(name) {
    return resolveService(name, this.dependencies);
  }

  getSettingsService({ refresh = false } = {}) {
    if (refresh) {
      this.settingsService = null;
    }

    if (!this.settingsService) {
      this.settingsService = this.getService('settings');
    }

    return this.settingsService;
  }

  setupLoadingScreen() {
    loadingScreen.setupLoadingScreen(
      (onProgress, hide) => {
        this.loadingState.covered = true;
        // The frame the screen fades onto is drawn before it starts to fade.
        this.setLoadingCallbacks(onProgress, () => {
          this.loadingState.covered = false;
          if (this.isActive) this.renderFrame();
          hide();
        });
      },
      () => this.eventBus?.emit('press-start'),
      () => this.eventBus?.emit('opening-left')
    );
  }

  bootstrapScene() {
    const { THREE } = this;

    // The menu's own scene: the hull preview, hanging off the camera (camera
    // children only render with the camera in the scene), under its key
    // light. The opening scene draws behind it.
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.getAspectRatio(),
      0.1,
      10000
    );
    this.camera.position.set(0, 0, 100);
    this.scene.add(this.camera);

    this.renderer = rendering.createMenuRenderer(THREE, this.canvas);
    this.clock = new THREE.Clock();
    this.keyLight = rendering.createLighting(THREE, this.scene);

    this.hullPreview = new MenuHullPreview(THREE, this.camera);
    this.hullStage = document.getElementById('menu-hull-stage');
    // While the Hangar is open the hull frames into its stage instead, and
    // that patch of the menu canvas is copied into it (the overlay hides the
    // canvas). A hovered hull button previews its hull.
    this.hangarStage = document.getElementById('hangar-hull-stage');
    this.hangarOpen = false;
    this.hoveredHull = null;
    this.hoveredHullLocked = false;

    this.withSeededMathRandom(() => this.preloadAssets());
  }

  /**
   * Builds the opening scene and draws it once (its programs compile and the
   * nebula bakes) while the loading screen still covers the canvas, one
   * step a task so the page stays responsive.
   */
  async preloadAssets() {
    const ls = this.loadingState;
    ls.isLoading = true;
    ls.isReady = false;
    ls.progress = 0;
    ls.totalSteps = 2;
    ls.currentStep = 0;

    const updateProgress = (message) => {
      ls.currentStep++;
      ls.progress = ls.currentStep / ls.totalSteps;
      if (typeof ls.onProgress === 'function') {
        ls.onProgress(ls.progress, message);
      }
    };
    const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0));

    try {
      await yieldToMain();
      this.opening = createOpeningScene(
        this,
        () => this.randomFloat('asteroids'),
        openingShotFromUrl()
      );
      updateProgress('Building the field');
      await yieldToMain();

      this.opening.update(0, true);
      this.opening.render();
      updateProgress('Lighting the field');

      ls.isLoading = false;
      ls.isReady = true;
      ls.progress = 1;

      if (typeof ls.onComplete === 'function') {
        ls.onComplete();
      }

      // Auto-start if we should be active
      this.syncInitialState();
    } catch (error) {
      console.error('[MenuBackgroundSystem] Preload error:', error);
      ls.isLoading = false;
      ls.isReady = false;
    }
  }

  /**
   * Sets callbacks for loading progress updates.
   * @param {Function} onProgress - Called with (progress: 0-1, message: string)
   * @param {Function} onComplete - Called when loading is complete
   */
  setLoadingCallbacks(onProgress, onComplete) {
    this.loadingState.onProgress = onProgress;
    this.loadingState.onComplete = onComplete;
  }

  /**
   * Returns whether the system has finished loading.
   */
  isPreloadComplete() {
    return this.loadingState.isReady;
  }

  /**
   * Returns the current loading progress (0-1).
   */
  getLoadingProgress() {
    return this.loadingState.progress;
  }

  // Any settings change may pick another hull or turn reduced motion on.
  setupSettingsSubscription() {
    try {
      const settings = this.getSettingsService();
      if (!settings || typeof settings.subscribe !== 'function') {
        return;
      }
      this.unsubscribeFromSettings = settings.subscribe(
        () => this.syncHullPreview(),
        { immediate: true }
      );
    } catch (error) {
      console.warn(
        '[MenuBackgroundSystem] Unable to subscribe to settings updates:',
        error
      );
    }
  }

  // The selected hull (if the Hangar has unlocked it) and reduced motion.
  syncHullPreview() {
    const settings = this.getSettingsService();
    const hull =
      this.hoveredHull ?? settings.getCategoryValues('gameplay')?.selectedHull;
    // A hovered locked hull previews as its silhouette.
    const silhouette = Boolean(this.hoveredHull) && this.hoveredHullLocked;
    // New meshes draw Three's UUIDs: from the seeded stream.
    this.withSeededMathRandom(() =>
      this.hullPreview.setHull(
        silhouette ? hull : this.getService('hangar').hullFor(hull),
        silhouette
      )
    );
    this.hullReducedMotion =
      Boolean(settings.getCategoryValues('accessibility')?.reducedMotion) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // The menu's adaptive quality follows the frame rate; the opening scene
  // drops its bloom at the low level.
  updateAdaptiveQuality(delta) {
    quality.updateAdaptiveQuality(this.adaptiveQuality, delta, (level) =>
      this.opening?.setQuality(level)
    );
  }

  resolveStatsPanel() {
    if (!this.ready || typeof window === 'undefined') {
      return null;
    }

    return typeof window.stats !== 'undefined' ? window.stats : null;
  }

  animate() {
    if (!this.isActive) {
      return;
    }

    this.animationFrame = requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.stats = this.stats || this.resolveStatsPanel();
    this.stats?.begin();
    this.elapsedTime += delta;

    this.updateAdaptiveQuality(delta);
    this.opening.update(delta, this.hullReducedMotion);

    // The menu camera circles (its key light turns about the hull with it).
    orbitCamera(this.camera, this.elapsedTime);
    this.camera.lookAt(0, 0, 0);
    this.hullPreview.update(
      delta,
      this.hangarOpen ? this.hangarStage : this.hullStage,
      this.hullReducedMotion
    );

    if (!this.loadingState.covered) {
      this.renderFrame();
    }

    this.stats?.end();
  }

  renderFrame() {
    this.opening.render();
    if (this.hangarOpen) {
      this.copyHangarStage();
    }
  }

  start() {
    if (!this.ready || this.isActive) {
      return;
    }

    // If still loading, mark that we want to start when ready
    if (this.loadingState.isLoading || !this.loadingState.isReady) {
      this.loadingState.pendingStart = true;
      return;
    }

    this.isActive = true;
    // The window may have changed, and stop() released the render targets.
    this.handleResize();
    // A Hangar purchase may have unlocked the selected hull.
    this.syncHullPreview();
    if (this.clock) {
      this.clock.start();
      this.clock.getDelta();
    }
    this.elapsedTime = 0;
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  stop() {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.opening?.release();
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    if (this.clock) {
      this.clock.stop();
    }
  }

  handleResize() {
    if (!this.ready || !this.isActive) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = this.getAspectRatio(width, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.opening?.resize(width, height);
  }

  handleScreenChanged(event) {
    if (!event || typeof event.screen !== 'string') {
      return;
    }

    if (event.screen === 'menu') {
      this.start();
    } else {
      this.stop();
    }
  }

  // Same frame as the render, so the drawing buffer still holds it.
  copyHangarStage() {
    const target = this.hangarStage;
    const source = this.renderer.domElement;
    const stage = target?.getBoundingClientRect();
    const view = source.getBoundingClientRect();
    if (!stage?.width || !view.width) return;
    const scale = source.width / view.width;
    const width = Math.round(stage.width * scale);
    const height = Math.round(stage.height * scale);
    if (target.width !== width || target.height !== height) {
      target.width = width;
      target.height = height;
    }
    this.hangarStageContext ??= target.getContext('2d');
    this.hangarStageContext.drawImage(
      source,
      (stage.left - view.left) * scale,
      (stage.top - view.top) * scale,
      width,
      height,
      0,
      0,
      width,
      height
    );
  }

  registerEventHooks() {
    window.addEventListener('resize', this.handleResize, { passive: true });

    this.registerEventListener('screen-changed', this.handleScreenChanged);
    this.registerEventListener('ui-overlay-visibility-changed', (event) => {
      if (event?.overlay !== 'hangar') return;
      this.hangarOpen = event.isOpen;
      this.hoveredHull = null;
      this.syncHullPreview();
    });
    this.registerEventListener('hangar-hull-hovered', (event) => {
      this.hoveredHull = event?.hullId ?? null;
      this.hoveredHullLocked = Boolean(event?.locked);
      this.syncHullPreview();
    });
  }

  syncInitialState() {
    const screen = this.getCurrentScreen();
    if (!screen || screen === 'menu') {
      this.start();
    }
  }

  getCurrentScreen() {
    try {
      const state = this.getService('game-state');
      if (state && typeof state.getScreen === 'function') {
        return state.getScreen();
      }
    } catch (error) {
      console.warn(
        '[MenuBackgroundSystem] Unable to resolve current screen:',
        error
      );
    }
    return null;
  }

  getAspectRatio(width = window.innerWidth, height = window.innerHeight) {
    return height === 0 ? 1 : width / height;
  }
}

export default MenuBackgroundSystem;
