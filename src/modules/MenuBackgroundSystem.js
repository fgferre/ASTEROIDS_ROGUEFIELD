// src/modules/MenuBackgroundSystem.js

import { BaseSystem } from '../core/BaseSystem.js';
import RandomService from '../core/RandomService.js';
import { resolveService } from '../core/serviceUtils.js';
import { createRandomHelpers } from '../utils/randomHelpers.js';

const SIMPLEX_DEFAULT_RANDOM = new RandomService(
  'menu-background:simplex-default'
);

class MenuBackgroundSystem extends BaseSystem {
  constructor(dependencies = {}) {
    const input =
      dependencies &&
      typeof dependencies === 'object' &&
      !Array.isArray(dependencies)
        ? dependencies
        : {};
    const { random = null, ...rest } = input;

    // Pass config to BaseSystem with random management options
    super(rest, {
      enableRandomManagement: true,
      systemName: 'MenuBackgroundSystem',
      serviceName: 'menu-background',
      randomForkLabels: {
        base: 'menu.base',
        starfield: 'menu.starfield',
        assets: 'menu.assets',
        belt: 'menu.belt',
        asteroids: 'menu.asteroids',
        fragments: 'menu.fragments',
        materials: 'menu.materials',
        threeUuid: 'menu.three-uuid',
      },
    });

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
    this.CANNON = this.ready ? window.CANNON : null;
    this.ready = this.ready && Boolean(this.THREE) && Boolean(this.CANNON);

    this._threeMathUtilsState = {
      originalMathUtils: null,
      originalMath: undefined,
      originalMathRandom: undefined,
      deterministicMathUtils: null,
      deterministicUuidGenerator: null,
      deterministicMathRandom: null,
      generateUuidDescriptors: new Map(),
      patchedMathUtilsTargets: new Set(),
    };

    this.animationFrame = null;
    this.isActive = false;
    this.clock = null;
    this.elapsedTime = 0;
    this.rogueSpawnTimer = 0;

    // Pre-loading state
    this.loadingState = {
      isLoading: false,
      isReady: false,
      progress: 0,
      totalSteps: 0,
      currentStep: 0,
      pendingStart: false, // True if start() was called during loading
      onProgress: null, // Callback: (progress: 0-1, message: string) => void
      onComplete: null, // Callback: () => void
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.world = null;

    this.starLayers = [];
    this.baseGeometries = [];
    this.baseMaterials = [];
    this.asteroidPool = [];
    this.activeAsteroids = [];
    this.objectsToDeactivate = [];
    this.explosions = [];

    this.config = {
      maxAsteroids: 100,
      baseFieldCount: 60,
      rogueSpawnInterval: 15,
      cullingDistanceSqr: 300 * 300,
      fadeOutDuration: 1.25,
      fragmentationThreshold: 60,
      maxFragmentationLevel: 2,
    };

    // Phase 3: Adaptive Quality System
    this.adaptiveQuality = {
      enabled: true,
      currentLevel: 2, // 0=low, 1=medium, 2=high, 3=ultra
      targetFpsMin: 50,
      targetFpsMax: 58, // Just below v-sync to avoid fluctuation
      // FPS tracking
      frameTimesMs: [],
      frameTimesMaxSamples: 60, // 1 second of samples at 60fps
      lastFps: 60,
      // Adjustment cooldown (prevent rapid changes)
      adjustmentCooldown: 0,
      adjustmentCooldownDuration: 2.0, // seconds between quality changes
      // Quality level definitions - reduced chromatic aberration for clarity
      levels: [
        { name: 'low', shaderDetail: 0.0, bloomStrength: 0.3, chromaticAberration: 0.0 },
        { name: 'medium', shaderDetail: 0.5, bloomStrength: 0.4, chromaticAberration: 0.0002 },
        { name: 'high', shaderDetail: 1.0, bloomStrength: 0.5, chromaticAberration: 0.0004 },
        { name: 'ultra', shaderDetail: 1.5, bloomStrength: 0.6, chromaticAberration: 0.0006 },
      ],
    };

    this.spawnedBeltAsteroids = 0;
    this.stats =
      this.ready && typeof window.stats !== 'undefined' ? window.stats : null;
    this.alphaToCoverageEnabled = false;

    this.normalIntensity = this.resolveInitialNormalIntensity();
    this.unsubscribeFromSettings = null;

    this.handleVideoSettingsChanged =
      this.handleVideoSettingsChanged.bind(this);

    this.handleResize = this.handleResize.bind(this);
    this.handleScreenChanged = this.handleScreenChanged.bind(this);
    this.animate = this.animate.bind(this);

    if (this.ready) {
      this.applyDeterministicThreeUuidGenerator();
      this.setupLoadingScreen(); // Setup loading UI callbacks
      this.bootstrapScene();
      this.registerEventHooks();
      this.setupSettingsSubscription();
      // Note: syncInitialState is now called from preloadAssets when complete
    } else {
      if (!this.canvas) {
        console.warn('[MenuBackgroundSystem] Canvas element not found.');
      } else {
        console.warn(
          '[MenuBackgroundSystem] Required libraries not available. Three.js or Cannon.js missing.'
        );
      }
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
        : SIMPLEX_DEFAULT_RANDOM) ?? SIMPLEX_DEFAULT_RANDOM;

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
    super.reset(options);

    const normalized =
      options && typeof options === 'object' && options !== null ? options : {};

    if (normalized.restoreThreeUuidGenerator) {
      this.restoreOriginalThreeUuidGenerator();
    }

    this.applyDeterministicThreeUuidGenerator();
  }

  applyDeterministicThreeUuidGenerator() {
    const state = this._threeMathUtilsState;
    if (!state || !this.THREE || typeof this.THREE !== 'object') {
      return;
    }

    const three = this.THREE;
    const mathUtilsCandidate = three.MathUtils ?? three.Math;
    if (!mathUtilsCandidate || typeof mathUtilsCandidate !== 'object') {
      return;
    }

    if (state.originalMathRandom === undefined) {
      state.originalMathRandom =
        typeof Math.random === 'function' ? Math.random : null;
    }

    if (!state.deterministicMathRandom) {
      const deterministicRandom = () => {
        const fork = this.ensureThreeUuidRandom();
        if (fork && typeof fork.float === 'function') {
          return fork.float();
        }
        if (typeof state.originalMathRandom === 'function') {
          return state.originalMathRandom();
        }
        return SIMPLEX_DEFAULT_RANDOM.float();
      };

      try {
        Object.defineProperty(deterministicRandom, 'name', {
          value: 'MenuBackgroundDeterministicRandom',
          configurable: true,
        });
      } catch (error) {
        // Ignore failure to label the function
      }

      state.deterministicMathRandom = deterministicRandom;
    }

    if (
      state.deterministicMathRandom &&
      Math.random !== state.deterministicMathRandom
    ) {
      Math.random = state.deterministicMathRandom;
    }

    const aliasCandidate =
      typeof three.Math === 'object' && three.Math !== null ? three.Math : null;

    if (
      state.deterministicMathUtils &&
      mathUtilsCandidate === state.deterministicMathUtils
    ) {
      if (
        state.deterministicMathUtils &&
        aliasCandidate !== state.deterministicMathUtils &&
        (aliasCandidate !== null ||
          (state.originalMath !== null && state.originalMath !== undefined))
      ) {
        three.Math = state.deterministicMathUtils;
      }
      return;
    }

    state.originalMathUtils = mathUtilsCandidate;

    if (aliasCandidate !== state.deterministicMathUtils) {
      if (aliasCandidate !== null) {
        state.originalMath = aliasCandidate;
      } else if (state.originalMath === undefined) {
        state.originalMath = null;
      }
    }

    if (!state.deterministicUuidGenerator) {
      state.deterministicUuidGenerator = () => {
        const fork = this.ensureThreeUuidRandom();
        if (fork && typeof fork.uuid === 'function') {
          return fork.uuid('menu-background:three.uuid');
        }
        return SIMPLEX_DEFAULT_RANDOM.uuid('menu-background:three.uuid');
      };
    }

    const patchedOriginal = this.patchMathUtilsGenerateUuid(
      mathUtilsCandidate,
      state.deterministicUuidGenerator
    );

    let aliasPatched = false;
    if (aliasCandidate && aliasCandidate !== mathUtilsCandidate) {
      aliasPatched = this.patchMathUtilsGenerateUuid(
        aliasCandidate,
        state.deterministicUuidGenerator
      );
    }

    if (patchedOriginal || aliasPatched) {
      state.deterministicMathUtils = mathUtilsCandidate;
      three.MathUtils = mathUtilsCandidate;

      if (
        aliasCandidate !== null ||
        (state.originalMath !== null && state.originalMath !== undefined)
      ) {
        three.Math = aliasCandidate ?? mathUtilsCandidate;
      }

      return;
    }

    const deterministic = this.cloneMathUtilsWithDeterministicUuid(
      mathUtilsCandidate,
      state.deterministicUuidGenerator
    );

    state.deterministicMathUtils = deterministic;
    three.MathUtils = deterministic;

    if (
      aliasCandidate !== null ||
      (state.originalMath !== null && state.originalMath !== undefined)
    ) {
      three.Math = deterministic;
    }
  }

  restoreOriginalThreeUuidGenerator() {
    const state = this._threeMathUtilsState;
    if (!state || !this.THREE || typeof this.THREE !== 'object') {
      return;
    }

    this.restorePatchedMathUtilsTargets();

    const three = this.THREE;
    if (
      state.deterministicMathUtils &&
      three.MathUtils === state.deterministicMathUtils
    ) {
      if (state.originalMathUtils) {
        three.MathUtils = state.originalMathUtils;
      }
    }

    if (state.deterministicMathUtils) {
      const aliasCandidate =
        typeof three.Math === 'object' && three.Math !== null
          ? three.Math
          : null;

      if (aliasCandidate === state.deterministicMathUtils) {
        if (state.originalMath === null) {
          const descriptor = Object.getOwnPropertyDescriptor(three, 'Math');
          if (descriptor && descriptor.configurable === false) {
            three.Math = undefined;
          } else if (descriptor) {
            delete three.Math;
          } else {
            three.Math = undefined;
          }
        } else if (state.originalMath !== undefined) {
          three.Math = state.originalMath;
        } else if (state.originalMathUtils) {
          three.Math = state.originalMathUtils;
        }
      }
    }

    state.deterministicMathUtils = null;

    if (state.deterministicMathRandom) {
      if (typeof state.originalMathRandom === 'function') {
        Math.random = state.originalMathRandom;
      }
      state.deterministicMathRandom = null;
    }
  }

  destroy() {
    if (
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('resize', this.handleResize);
    }

    super.destroy();

    this.stop();
    this.restoreOriginalThreeUuidGenerator();
  }

  cloneMathUtilsWithDeterministicUuid(source, uuidGenerator) {
    const prototype = Object.getPrototypeOf(source) || Object.prototype;
    const clone = Object.create(prototype);
    const keys = Reflect.ownKeys(source);

    keys.forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor) {
        clone[key] = source[key];
        return;
      }

      if (key === 'generateUUID') {
        const enumerable = descriptor.enumerable ?? false;
        const configurable = descriptor.configurable ?? true;
        const writable = Object.prototype.hasOwnProperty.call(
          descriptor,
          'writable'
        )
          ? Boolean(descriptor.writable)
          : true;

        Object.defineProperty(clone, key, {
          configurable,
          enumerable,
          writable,
          value: uuidGenerator,
        });
        return;
      }

      Object.defineProperty(clone, key, descriptor);
    });

    if (!keys.includes('generateUUID')) {
      Object.defineProperty(clone, 'generateUUID', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: uuidGenerator,
      });
    }

    const isFrozen = Object.isFrozen(source);
    const isSealed = Object.isSealed(source);
    const isExtensible = Object.isExtensible(source);

    if (isFrozen) {
      Object.freeze(clone);
    } else if (isSealed) {
      Object.seal(clone);
    } else if (!isExtensible) {
      Object.preventExtensions(clone);
    }

    return clone;
  }

  copyGenerateUuidDescriptor(target) {
    if (!target || typeof target !== 'object') {
      return null;
    }

    const descriptor = Object.getOwnPropertyDescriptor(target, 'generateUUID');
    if (!descriptor) {
      return null;
    }

    const copy = {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
    };

    if (Object.prototype.hasOwnProperty.call(descriptor, 'writable')) {
      copy.writable = descriptor.writable;
    }

    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      copy.value = descriptor.value;
    }

    if (Object.prototype.hasOwnProperty.call(descriptor, 'get')) {
      copy.get = descriptor.get;
    }

    if (Object.prototype.hasOwnProperty.call(descriptor, 'set')) {
      copy.set = descriptor.set;
    }

    return copy;
  }

  overwriteGenerateUuid(target, uuidGenerator) {
    if (!target || typeof target !== 'object') {
      return false;
    }

    const descriptor = Object.getOwnPropertyDescriptor(target, 'generateUUID');

    if (!descriptor) {
      try {
        target.generateUUID = uuidGenerator;
        if (target.generateUUID === uuidGenerator) {
          return true;
        }
      } catch (error) {
        // Ignore assignment errors and fallback to defineProperty
      }

      try {
        Object.defineProperty(target, 'generateUUID', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: uuidGenerator,
        });
        return target.generateUUID === uuidGenerator;
      } catch (error) {
        return false;
      }
    }

    if (descriptor.configurable !== false) {
      const nextDescriptor = {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
      };

      if (Object.prototype.hasOwnProperty.call(descriptor, 'writable')) {
        nextDescriptor.writable = descriptor.writable;
      }

      try {
        Object.defineProperty(target, 'generateUUID', {
          ...nextDescriptor,
          value: uuidGenerator,
        });
        if (target.generateUUID === uuidGenerator) {
          return true;
        }
      } catch (error) {
        // Ignore defineProperty failure and fallback to direct assignment
      }
    }

    if (descriptor.set && typeof descriptor.set === 'function') {
      try {
        descriptor.set.call(target, uuidGenerator);
        if (target.generateUUID === uuidGenerator) {
          return true;
        }
      } catch (error) {
        // Ignore setter errors and continue to fallback attempts
      }
    }

    if (descriptor.writable) {
      try {
        target.generateUUID = uuidGenerator;
        if (target.generateUUID === uuidGenerator) {
          return true;
        }
      } catch (error) {
        return false;
      }
    }

    return false;
  }

  patchMathUtilsGenerateUuid(target, uuidGenerator) {
    if (
      !target ||
      typeof target !== 'object' ||
      typeof uuidGenerator !== 'function'
    ) {
      return false;
    }

    const state = this._threeMathUtilsState;
    if (!state) {
      return false;
    }

    if (!state.generateUuidDescriptors) {
      state.generateUuidDescriptors = new Map();
    }

    if (!state.generateUuidDescriptors.has(target)) {
      state.generateUuidDescriptors.set(
        target,
        this.copyGenerateUuidDescriptor(target)
      );
    }

    const patched = this.overwriteGenerateUuid(target, uuidGenerator);

    if (patched) {
      if (!state.patchedMathUtilsTargets) {
        state.patchedMathUtilsTargets = new Set();
      }
      state.patchedMathUtilsTargets.add(target);
    } else {
      state.generateUuidDescriptors.delete(target);
    }

    return patched;
  }

  restoreMathUtilsGenerateUuid(target) {
    if (!target || typeof target !== 'object') {
      return;
    }

    const state = this._threeMathUtilsState;
    if (!state || !state.generateUuidDescriptors) {
      return;
    }

    const descriptor = state.generateUuidDescriptors.get(target) || null;

    if (!descriptor) {
      if (Object.prototype.hasOwnProperty.call(target, 'generateUUID')) {
        try {
          delete target.generateUUID;
        } catch (error) {
          try {
            target.generateUUID = undefined;
          } catch (innerError) {
            // Swallow errors restoring missing descriptor
          }
        }
      }
      state.generateUuidDescriptors.delete(target);
      return;
    }

    try {
      Object.defineProperty(target, 'generateUUID', descriptor);
    } catch (error) {
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        try {
          target.generateUUID = descriptor.value;
        } catch (innerError) {
          // Ignore assignment errors when restoring descriptor value
        }
      }
    }

    state.generateUuidDescriptors.delete(target);
  }

  restorePatchedMathUtilsTargets() {
    const state = this._threeMathUtilsState;
    if (!state || !state.patchedMathUtilsTargets) {
      return;
    }

    state.patchedMathUtilsTargets.forEach((target) => {
      this.restoreMathUtilsGenerateUuid(target);
    });

    state.patchedMathUtilsTargets.clear();
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

  /**
   * Sets up the loading screen UI and connects callbacks.
   * Automatically updates progress bar and hides loading when complete.
   */
  setupLoadingScreen() {
    if (typeof document === 'undefined') return;

    const loadingScreen = document.getElementById('loading-screen');
    const progressFill = document.getElementById('loading-progress-fill');
    const progressPercent = document.getElementById('loading-progress-percent');
    const progressMessage = document.getElementById('loading-progress-message');
    const menuScreen = document.getElementById('menu-screen');

    if (!loadingScreen) {
      console.warn('[MenuBackgroundSystem] Loading screen element not found.');
      return;
    }

    this.setLoadingCallbacks(
      // onProgress callback
      (progress, message) => {
        const percent = Math.round(progress * 100);

        if (progressFill) {
          progressFill.style.width = `${percent}%`;
        }

        if (progressPercent) {
          progressPercent.textContent = `${percent}%`;
        }

        if (progressMessage) {
          progressMessage.textContent = message;
        }
      },
      // onComplete callback
      () => {
        // Fade out loading screen
        loadingScreen.classList.add('hidden');

        // Show menu screen
        if (menuScreen) {
          menuScreen.classList.remove('hidden');
        }

        // Remove loading screen from DOM after transition
        setTimeout(() => {
          if (loadingScreen.parentNode) {
            loadingScreen.parentNode.removeChild(loadingScreen);
          }
        }, 600);
      }
    );
  }

  bootstrapScene() {
    const { THREE, CANNON } = this;

    this.scene = new THREE.Scene();
    // Reduced fog density for clearer distant objects
    this.scene.fog = new THREE.FogExp2(0x000104, 0.003);

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.getAspectRatio(),
      0.1,
      10000
    );
    this.camera.position.set(0, 0, 100);

    // WebGL2 upgrade - enables #version 300 es shaders like the study
    const gl2Context = this.canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      context: gl2Context,
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
    });

    // Log WebGL version for debugging
    const glVersion = this.renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1';
    console.log(`[MenuBackgroundSystem] Renderer: ${glVersion}`);
    const pixelRatio = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x050916, 1);
    this.renderer.shadowMap.enabled = true;
    if (
      typeof this.renderer.outputEncoding !== 'undefined' &&
      THREE &&
      THREE.sRGBEncoding
    ) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }
    if (
      typeof this.renderer.toneMapping !== 'undefined' &&
      THREE &&
      typeof THREE.ACESFilmicToneMapping !== 'undefined'
    ) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
    }

    this.enableAlphaToCoverage();

    this.world = new CANNON.World();
    this.world.gravity.set(0, 0, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 5;

    this.clock = new THREE.Clock();

    // Quick setup (non-blocking)
    this.createLighting();
    this.createStarLayers();
    this.createAtmosphere();
    this.setupPostProcessing();

    // Start async preloading for heavy assets
    this.preloadAssets();
  }

  /**
   * Asynchronously preloads heavy assets (geometries, materials, asteroid pool).
   * Uses chunked loading to avoid blocking the main thread.
   */
  async preloadAssets() {
    const ls = this.loadingState;
    ls.isLoading = true;
    ls.isReady = false;
    ls.progress = 0;

    const geometryCount = 8;
    const materialCount = 8;
    const poolSize = this.config.maxAsteroids;

    // Total steps: geometries + materials + pool chunks + field setup
    const poolChunks = Math.ceil(poolSize / 10); // Create 10 pool items per chunk
    ls.totalSteps = geometryCount + materialCount + poolChunks + 1;
    ls.currentStep = 0;

    const updateProgress = (message) => {
      ls.currentStep++;
      ls.progress = ls.currentStep / ls.totalSteps;
      if (typeof ls.onProgress === 'function') {
        ls.onProgress(ls.progress, message);
      }
    };

    // Helper to yield to main thread
    const yieldToMain = () =>
      new Promise((resolve) => setTimeout(resolve, 0));

    try {
      // Phase 1: Create geometries (one per frame)
      for (let i = 0; i < geometryCount; i++) {
        const geometry = this.createDeformedIcosahedron();
        this.baseGeometries.push(geometry);
        updateProgress(`Creating geometry ${i + 1}/${geometryCount}`);
        await yieldToMain();
      }

      // Phase 2: Create materials (one per frame)
      for (let i = 0; i < materialCount; i++) {
        const material = this.createProceduralMaterial(
          this.randomFloat('assets') * 100
        );
        this.baseMaterials.push(material);
        updateProgress(`Creating material ${i + 1}/${materialCount}`);
        await yieldToMain();
      }

      // Apply normal intensity to all materials
      this.updateNormalIntensity(this.normalIntensity);

      // Phase 3: Create asteroid pool in chunks
      for (let chunk = 0; chunk < poolChunks; chunk++) {
        const chunkStart = chunk * 10;
        const chunkEnd = Math.min(chunkStart + 10, poolSize);

        for (let i = chunkStart; i < chunkEnd; i++) {
          if (this.asteroidPool.length < poolSize) {
            this.createPoolableAsteroid();
          }
        }

        updateProgress(
          `Creating asteroid pool ${Math.min((chunk + 1) * 10, poolSize)}/${poolSize}`
        );
        await yieldToMain();
      }

      // Phase 4: Prepare initial asteroid field
      this.prepareInitialField();
      updateProgress('Preparing asteroid field');

      // Mark loading complete
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

  setupPostProcessing() {
    const { THREE, scene, camera, renderer } = this;
    if (!THREE || !renderer || !THREE.EffectComposer) return;

    this.composer = new THREE.EffectComposer(renderer);

    const renderPass = new THREE.RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // 1. Unreal Bloom Pass - reduced for clarity
    if (THREE.UnrealBloomPass) {
      this.bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.4, // Strength: reduced for clearer image
        0.2, // Radius: tighter bloom
        0.92 // Threshold: only very bright spots bloom
      );
      this.composer.addPass(this.bloomPass);
    }

    // 2. Custom FX: Chromatic Aberration + Filmic Grain
    if (THREE.ShaderPass) {
      this.customFX = this.createCustomFXPass();
      this.composer.addPass(this.customFX);
    }

    // 3. SMAA Anti-aliasing
    if (THREE.SMAAPass) {
      const pixelRatio = renderer.getPixelRatio();
      this.smaaPass = new THREE.SMAAPass(
        window.innerWidth * pixelRatio,
        window.innerHeight * pixelRatio
      );
      this.composer.addPass(this.smaaPass);
    }
  }

  createCustomFXPass() {
    const { THREE } = this;
    const shader = {
      uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.0004 }, // Reduced chromatic aberration
        time: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        uniform float time;
        varying vec2 vUv;

        float random(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec2 uv = vUv;

          // Very subtle Chromatic Aberration (R/B shift)
          float r = texture2D(tDiffuse, uv + vec2(amount, 0.0)).r;
          float g = texture2D(tDiffuse, uv).g;
          float b = texture2D(tDiffuse, uv - vec2(amount, 0.0)).b;

          vec3 color = vec3(r, g, b);

          // Very subtle film grain (reduced from 0.035 to 0.015)
          float noise = (random(uv + time * 0.01) - 0.5) * 0.015;
          color += noise;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    };
    return new THREE.ShaderPass(shader);
  }

  enableAlphaToCoverage() {
    if (!this.renderer) {
      return;
    }

    try {
      const gl = this.renderer.getContext();
      if (gl && typeof gl.SAMPLE_ALPHA_TO_COVERAGE !== 'undefined') {
        gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        this.alphaToCoverageEnabled = true;
      }
    } catch (error) {
      console.warn(
        '[MenuBackgroundSystem] Failed to enable alpha-to-coverage.',
        error
      );
      this.alphaToCoverageEnabled = false;
    }
  }

  createLighting() {
    const { THREE } = this;

    // Ambient light - provides base illumination for all surfaces
    // Increased intensity for better visibility
    const ambient = new THREE.AmbientLight(0x667788, 0.8);
    this.scene.add(ambient);

    // Key light - main sun-like light source
    // Warm white, high intensity, positioned for dramatic lighting
    const keyLight = new THREE.PointLight(0xfff8f0, 1.8, 2000);
    keyLight.position.set(100, 80, 100);
    keyLight.castShadow = true;
    this.scene.add(keyLight);
    this.keyLight = keyLight; // Store reference for potential adjustments

    // Fill light - softer blue light from opposite side
    // Helps illuminate shadow areas with space-like ambiance
    const fillLight = new THREE.PointLight(0x4488cc, 0.6, 1500);
    fillLight.position.set(-120, -40, -80);
    this.scene.add(fillLight);

    // Rim light - adds edge definition from behind
    // Creates nice silhouette separation
    const rimLight = new THREE.PointLight(0x88aaff, 0.4, 1200);
    rimLight.position.set(0, 100, -150);
    this.scene.add(rimLight);

    // Hemisphere light - simulates sky/ground ambient
    // Adds subtle gradient between top (space) and bottom
    const hemiLight = new THREE.HemisphereLight(0x446688, 0x222233, 0.3);
    this.scene.add(hemiLight);
  }

  createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Radial gradient for soft star look
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();

    const texture = new this.THREE.CanvasTexture(canvas);
    return texture;
  }

  createStarLayers() {
    const { THREE } = this;
    const layerConfigs = [
      { count: 4000, distance: 8000, pixelSize: 0.9, speedFactor: 0.05 },
      { count: 3000, distance: 6000, pixelSize: 1.1, speedFactor: 0.1 },
      { count: 2000, distance: 4000, pixelSize: 1.4, speedFactor: 0.2 },
    ];

    this.starLayers = layerConfigs.map((config) => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(config.count * 3);

      for (let i = 0; i < config.count; i += 1) {
        const theta = this.randomFloat('starfield') * Math.PI * 2;
        const phi = Math.acos(2 * this.randomFloat('starfield') - 1);
        const radius = config.distance;

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        const offset = i * 3;
        positions[offset] = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;
      }

      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3)
      );
      const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: this.computeWorldSpacePointSize(
          config.distance,
          config.pixelSize
        ),
        map: this.createStarTexture(), // [NEO-ARCADE] Use texture for round stars
        transparent: true,
        opacity: this.randomFloat('starfield') * 0.35 + 0.65, // [NEO-ARCADE] Boost opacity
        fog: false,
      });
      material.sizeAttenuation = true;
      material.depthWrite = false;
      material.blending = THREE.AdditiveBlending;

      const mesh = new THREE.Points(geometry, material);
      this.scene.add(mesh);
      return {
        mesh,
        speedFactor: config.speedFactor,
        config: { ...config },
      };
    });
  }

  createAtmosphere() {
    const { THREE } = this;
    if (!THREE) return;

    // 1. Nebula Layers (Gaseous backdrops)
    this.nebulas = [];
    const nebulaConfigs = [
      { size: 2000, color: 0x0a1835, opacity: 0.15, z: -1200, speed: 0.02 },
      { size: 1800, color: 0x1a0a25, opacity: 0.12, z: -1500, speed: -0.015 },
    ];

    nebulaConfigs.forEach((cfg) => {
      const geometry = new THREE.PlaneGeometry(cfg.size, cfg.size);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          color: { value: new THREE.Color(cfg.color) },
          opacity: { value: cfg.opacity },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform float opacity;
          uniform vec3 color;
          varying vec2 vUv;

          float noise(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }

          void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            float dist = length(uv);
            float mask = smoothstep(1.0, 0.2, dist);
            
            float n = noise(vUv * 4.0 + time * 0.02);
            n += noise(vUv * 8.0 - time * 0.01) * 0.5;
            
            gl_FragColor = vec4(color * (n * 0.6 + 0.4), mask * opacity);
          }
        `,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = cfg.z;
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.userData.rotateSpeed = cfg.speed;
      this.scene.add(mesh);
      this.nebulas.push(mesh);
    });

    // 2. Space Dust (Foreground particles)
    const dustCount = 800;
    const dustGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(dustCount * 3);

    for (let i = 0; i < dustCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 500;
    }

    dustGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    const dustMaterial = new THREE.PointsMaterial({
      size: 0.7,
      color: 0x66aaff,
      map: this.createStarTexture(),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.dustSystem = new THREE.Points(dustGeometry, dustMaterial);
    this.scene.add(this.dustSystem);
  }

  computeWorldSpacePointSize(distance, pixelSize = 1) {
    if (!this.camera) {
      return pixelSize;
    }

    const fov = typeof this.camera.fov === 'number' ? this.camera.fov : 60;
    const height =
      this.renderer?.domElement?.clientHeight || window.innerHeight || 1;
    const pixelRatio =
      (typeof this.renderer?.getPixelRatio === 'function'
        ? this.renderer.getPixelRatio()
        : null) ||
      window.devicePixelRatio ||
      1;

    const effectivePixelSize = pixelSize * pixelRatio;
    const fovInRadians = (fov * Math.PI) / 180;
    const viewHeightAtDistance = 2 * distance * Math.tan(fovInRadians / 2);

    return (
      (effectivePixelSize / Math.max(1, height)) * viewHeightAtDistance ||
      pixelSize
    );
  }

  updateStarLayerSizes() {
    this.starLayers.forEach((layer) => {
      const { mesh, config } = layer;
      if (!mesh?.material || !config) {
        return;
      }

      const newSize = this.computeWorldSpacePointSize(
        config.distance,
        config.pixelSize
      );

      if (mesh.material.size !== newSize) {
        mesh.material.size = newSize;
        mesh.material.needsUpdate = true;
      }
    });
  }

  createBaseAssets(count = 5) {
    for (let i = 0; i < count; i += 1) {
      const geometry = this.createDeformedIcosahedron();
      this.baseGeometries.push(geometry);
      this.baseMaterials.push(
        this.createProceduralMaterial(this.randomFloat('assets') * 100)
      );
    }
  }

  resolveInitialNormalIntensity() {
    let resolved = 1;

    try {
      const settings = this.getSettingsService();
      if (settings && typeof settings.getCategoryValues === 'function') {
        const videoValues = settings.getCategoryValues('video');
        const stored = videoValues?.menuAsteroidNormalIntensity;
        if (typeof stored === 'number' && Number.isFinite(stored)) {
          resolved = stored;
        }
      }
    } catch (error) {
      console.warn(
        '[MenuBackgroundSystem] Unable to resolve initial normal intensity from settings:',
        error
      );
    }

    const numeric = Number(resolved);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(2.5, numeric)) : 1;
  }

  createRandomGenerator(seed = this.randomFloat('assets') * 1000) {
    let value = Math.floor(seed * 1000) % 2147483647;
    if (value <= 0) {
      value += 2147483646;
    }

    return () => {
      value = (value * 16807) % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  /**
   * Creates a realistically deformed asteroid geometry using advanced noise techniques.
   * Implements the multi-layer displacement from the study:
   * 1. FBM base distortion - overall shape variation
   * 2. Ridged Multifractal - sharp mountain-like ridges
   * 3. Plane scraping - flat cut surfaces
   * 4. Voronoi features - craters (bowls) and rock protrusions
   */
  createDeformedIcosahedron(detailSeed = this.randomFloat('assets') * 100) {
    const { THREE } = this;
    // Use detail level 5 for good balance of quality and performance
    const geometry = new THREE.IcosahedronGeometry(1, 5);
    const simplex = new SimplexNoise(this.createRandomGenerator(detailSeed));
    const positions = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    // Per-asteroid variation parameters (seeded)
    const rng = this.createRandomGenerator(detailSeed);

    // Displacement parameters - balanced for smooth but interesting shapes
    const params = {
      // Global displacement amplitude - moderate for rounded shapes
      displacement: rng() * 0.12 + 0.18,

      // Ridge strength - subtle undulations, not sharp peaks
      ridgeStrength: rng() * 0.25 + 0.35,

      // Scrape/cut strength - gentle flat areas
      scrapeStrength: rng() * 0.2 + 0.25,

      // Crater/rock feature strength - subtle surface features
      craterStrength: rng() * 0.25 + 0.3,

      // Feature density - lower = larger, smoother features
      featureDensity: rng() * 0.8 + 2.0,
    };

    for (let i = 0; i < positions.count; i += 1) {
      vertex.fromBufferAttribute(positions, i);
      const p = vertex.clone().normalize();

      // Seed offset for this asteroid
      const px = p.x + detailSeed * 5.0;
      const py = p.y + detailSeed * 5.0;
      const pz = p.z + detailSeed * 5.0;

      // 1. BASE DISTORTION - Low frequency FBM for smooth overall shape
      const base = simplex.fbm(px * 0.3, py * 0.3, pz * 0.3, 3, 0.5, 2.0);

      // 2. RIDGED MULTIFRACTAL - Low frequency for gentle undulations
      const ridges =
        simplex.ridgedMF(px * 0.5, py * 0.5, pz * 0.5, 3, 2.0, 0.5) *
        params.ridgeStrength;

      // 3. PLANE SCRAPING - Large flat cut surfaces
      const cutNoise = simplex.noise3d(px * 0.3 + 12, py * 0.3 + 12, pz * 0.3 + 12);
      const cuts = this.smoothstep(0.25, 0.75, cutNoise) * params.scrapeStrength;

      // 4. VORONOI FEATURES - Craters and rock protrusions
      const [dist, cellId] = simplex.voronoi3d(
        px * params.featureDensity,
        py * params.featureDensity,
        pz * params.featureDensity
      );

      let features = 0;

      if (cellId < 0.4) {
        // CRATER - smooth bowl shape with subtle rim
        const rim = this.smoothstep(0.7, 0.5, dist); // Subtle raised edge
        const bowl = this.smoothstep(0.5, 0.0, dist); // Smooth depression
        const hasCentralPeak = cellId < 0.12;
        const peak = hasCentralPeak ? this.smoothstep(0.15, 0.0, dist) * 0.25 : 0;
        const craterShape = rim * 0.15 - bowl * 0.8 + peak;
        features += craterShape;
      } else if (cellId > 0.7) {
        // ROCK PROTRUSION - gentle raised area
        let rock = this.smoothstep(0.6, 0.0, dist);
        rock = Math.pow(rock, 0.5); // Very soft falloff
        features += rock * 0.5;
      }
      // cellId 0.4-0.7 = smooth area (no feature)

      features *= params.craterStrength;

      // COMBINE ALL LAYERS
      const totalDisplacement =
        (base + ridges - cuts + features) * params.displacement;

      // Apply displacement along normal (radial direction for sphere)
      vertex.add(vertex.clone().normalize().multiplyScalar(1 + totalDisplacement));
      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    if (geometry.attributes.position) {
      geometry.attributes.position.needsUpdate = true;
    }

    geometry.computeVertexNormals();
    if (typeof geometry.normalizeNormals === 'function') {
      geometry.normalizeNormals();
    }

    const hasTangentPrerequisites =
      geometry.index &&
      geometry.attributes &&
      geometry.attributes.position &&
      geometry.attributes.normal &&
      geometry.attributes.uv;

    if (
      hasTangentPrerequisites &&
      typeof geometry.computeTangents === 'function'
    ) {
      try {
        geometry.computeTangents();
      } catch (error) {
        console.warn(
          '[MenuBackgroundSystem] Failed to compute tangents for asteroid geometry:',
          error
        );
      }
    }
    return geometry;
  }

  /**
   * Attempt to match GPU smoothstep behavior in JS
   */
  smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /**
   * Linear interpolation helper
   */
  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * 2D Worley noise for texture generation
   * Returns [closestDist, cellId]
   */
  worley2d(x, y, simplex) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    const fx = x - px;
    const fy = y - py;

    let minDist = 8.0;
    let cellId = 0.0;

    // Search 3x3 neighborhood
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = px + i;
        const cy = py + j;

        // Hash for cell point
        const hash = this.hash2d(cx, cy);

        // Random point within cell
        const rx = i - fx + hash * 0.7;
        const ry = j - fy + this.hash2d(cx + 127, cy) * 0.7;

        const dist = rx * rx + ry * ry;

        if (dist < minDist) {
          minDist = dist;
          cellId = hash;
        }
      }
    }

    return [Math.sqrt(minDist), cellId];
  }

  /**
   * Simple 2D hash function for worley noise
   */
  hash2d(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  /**
   * Creates an enhanced procedural material with techniques from the study.
   * Phase 2 improvements:
   * - 512px textures for higher detail
   * - Worley noise for mineral spots (mottled appearance)
   * - Crack network pattern
   * - Multi-scale normal map
   * - Varied color palette (dust, rock, mineral, metal)
   */
  createProceduralMaterial(seed) {
    const { THREE } = this;
    const canvas = document.createElement('canvas');
    const size = 512; // Phase 2: Increased from 256 for better detail
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    const simplex = new SimplexNoise(this.createRandomGenerator(seed));
    const heightData = new Float32Array(size * size);

    // Color palette - brightened for better visibility while maintaining realism
    const palette = {
      regolith: { r: 35, g: 33, b: 38 }, // Dark dust (brightened)
      rockBase: { r: 95, g: 90, b: 85 }, // Medium grey/brown (was 51,49,46)
      rockVar: { r: 140, g: 135, b: 125 }, // Lighter grey (was 89,87,82)
      mineral: { r: 160, g: 150, b: 135 }, // Brownish mineral spot (brightened)
      metal: { r: 200, g: 205, b: 215 }, // Silver metallic (brightened)
    };

    // Per-material variation
    const rng = this.createRandomGenerator(seed + 1000);
    const materialParams = {
      patchiness: rng() * 0.4 + 0.4, // Mineral spot intensity
      metalAmount: rng() * 0.25 + 0.15, // Metal visibility (slightly increased)
      darkness: rng() * 0.15 + 0.25, // Overall darkness (reduced range: 0.25-0.4 instead of 0.7-1.0)
      crackIntensity: rng() * 0.6 + 0.4, // Crack visibility
    };

    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) {
        const u = x / size;
        const v = y / size;

        // 1. BASE HEIGHT - Multi-octave FBM
        let heightValue = 0;
        let amplitude = 1;
        let frequency = 1;
        let totalAmplitude = 0;

        for (let octave = 0; octave < 5; octave += 1) {
          heightValue +=
            simplex.noise3d(
              u * frequency * 4 + seed * 0.37,
              v * frequency * 4 + seed * 0.53,
              seed * 0.19 + octave * 13.37
            ) * amplitude;
          totalAmplitude += amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }
        heightValue = (heightValue / totalAmplitude) * 0.5 + 0.5;

        // 2. WORLEY NOISE - Mineral spots (mottled appearance)
        const [cellDist, cellId] = this.worley2d(
          u * 6 + seed,
          v * 6 + seed * 0.7,
          simplex
        );
        const mineralSpot =
          this.smoothstep(0.6, 0.2, cellDist) * materialParams.patchiness;

        // 3. CRACK NETWORK - Voronoi cell edges
        const [crackDist] = this.worley2d(
          u * 12 + seed * 1.3,
          v * 12 + seed * 0.9,
          simplex
        );
        const crackMask =
          1 - this.smoothstep(0.0, 0.08, crackDist) * materialParams.crackIntensity;

        // 4. MACRO COLOR VARIATION - Large scale color shifts
        const macroVar = simplex.fbm(
          u * 2 + seed + 10,
          v * 2 + seed + 10,
          seed,
          3,
          0.5,
          2.0
        );
        const macroNorm = macroVar * 0.5 + 0.5;

        // 5. LAYER MASKS
        const dustMask = this.smoothstep(0.4, 0.0, heightValue) * 0.6;
        const metalThreshold = 1.0 - materialParams.metalAmount;
        const metalMask = this.smoothstep(metalThreshold, 1.0, heightValue);

        // 6. COMBINE COLORS
        // Start with base rock (varied by macro noise)
        let r = this.lerp(palette.rockBase.r, palette.rockVar.r, macroNorm);
        let g = this.lerp(palette.rockBase.g, palette.rockVar.g, macroNorm);
        let b = this.lerp(palette.rockBase.b, palette.rockVar.b, macroNorm);

        // Add mineral spots
        r = this.lerp(r, palette.mineral.r, mineralSpot);
        g = this.lerp(g, palette.mineral.g, mineralSpot);
        b = this.lerp(b, palette.mineral.b, mineralSpot);

        // Add metallic highlights
        r = this.lerp(r, palette.metal.r, metalMask);
        g = this.lerp(g, palette.metal.g, metalMask);
        b = this.lerp(b, palette.metal.b, metalMask);

        // Add dust in low areas
        r = this.lerp(r, palette.regolith.r, dustMask);
        g = this.lerp(g, palette.regolith.g, dustMask);
        b = this.lerp(b, palette.regolith.b, dustMask);

        // Darken cracks
        r *= crackMask;
        g *= crackMask;
        b *= crackMask;

        // Apply overall darkness
        const darknessFactor = 1.5 - materialParams.darkness;
        r *= darknessFactor;
        g *= darknessFactor;
        b *= darknessFactor;

        // Store height for normal map (include crack depth)
        heightData[x + y * size] = heightValue * crackMask;

        const index = (x + y * size) * 4;
        imageData.data[index] = Math.max(0, Math.min(255, Math.round(r)));
        imageData.data[index + 1] = Math.max(0, Math.min(255, Math.round(g)));
        imageData.data[index + 2] = Math.max(0, Math.min(255, Math.round(b)));
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const albedoTexture = new THREE.CanvasTexture(canvas);
    albedoTexture.wrapS = THREE.RepeatWrapping;
    albedoTexture.wrapT = THREE.RepeatWrapping;
    albedoTexture.anisotropy = Math.min(
      8,
      this.renderer?.capabilities?.getMaxAnisotropy?.() || 1
    );
    albedoTexture.generateMipmaps = true;
    albedoTexture.needsUpdate = true;
    if (typeof albedoTexture.encoding !== 'undefined') {
      albedoTexture.encoding = THREE.sRGBEncoding;
    }

    // ENHANCED NORMAL MAP - Multi-scale detail
    const normalData = new Uint8Array(size * size * 4);
    const sampleHeight = (sx, sy) => {
      const xIndex = Math.max(0, Math.min(size - 1, sx));
      const yIndex = Math.max(0, Math.min(size - 1, sy));
      return heightData[xIndex + yIndex * size];
    };

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        // Multi-scale normal calculation (central differences at multiple scales)
        let nx = 0;
        let ny = 0;
        const scales = [1, 2, 4]; // Sample at different distances
        const weights = [0.5, 0.3, 0.2]; // Weight each scale

        for (let s = 0; s < scales.length; s++) {
          const scale = scales[s];
          const weight = weights[s];

          const left = sampleHeight(x - scale, y);
          const right = sampleHeight(x + scale, y);
          const up = sampleHeight(x, y - scale);
          const down = sampleHeight(x, y + scale);

          nx += ((left - right) / (2 * scale)) * weight;
          ny += ((up - down) / (2 * scale)) * weight;
        }

        // Normalize
        const nz = 0.15; // Controls overall normal intensity
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

        const index = (x + y * size) * 4;
        normalData[index] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
        normalData[index + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
        normalData[index + 2] = Math.round(((nz / length) * 0.5 + 0.5) * 255);
        normalData[index + 3] = 255;
      }
    }

    const normalTexture = new THREE.DataTexture(
      normalData,
      size,
      size,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    normalTexture.wrapS = THREE.RepeatWrapping;
    normalTexture.wrapT = THREE.RepeatWrapping;
    normalTexture.anisotropy = Math.min(
      8,
      this.renderer?.capabilities?.getMaxAnisotropy?.() || 1
    );
    normalTexture.generateMipmaps = true;
    normalTexture.needsUpdate = true;
    if (typeof normalTexture.encoding !== 'undefined') {
      normalTexture.encoding = THREE.LinearEncoding;
    }

    const material = new THREE.MeshStandardMaterial({
      map: albedoTexture,
      normalMap: normalTexture,
      roughness: 0.85, // Slightly more reflective for mineral spots
      metalness: 0.08, // Slight metalness for silver deposits
    });
    material.normalMapType = THREE.TangentSpaceNormalMap;
    material.dithering = true;
    material.userData = material.userData || {};
    material.userData.normalTexture = normalTexture;
    material.userData.albedoTexture = albedoTexture;
    this.applyNormalIntensityToMaterial(material);
    return material;
  }

  applyNormalIntensityToMaterial(
    material,
    targetIntensity = this.normalIntensity
  ) {
    const { THREE } = this;
    if (!material || !THREE) {
      return;
    }

    const intensity = Number.isFinite(targetIntensity)
      ? Math.max(0, Math.min(2.5, targetIntensity))
      : 1;

    if (
      !material.normalScale ||
      typeof material.normalScale.set !== 'function'
    ) {
      material.normalScale = new THREE.Vector2(intensity, intensity);
    } else {
      material.normalScale.set(intensity, intensity);
    }

    material.userData = material.userData || {};
    material.userData.menuNormalIntensity = intensity;
    material.needsUpdate = true;
  }

  updateNormalIntensity(rawValue) {
    const numeric = Number(rawValue);
    const resolved = Number.isFinite(numeric) ? numeric : this.normalIntensity;
    const clamped = Math.max(0, Math.min(2.5, resolved));
    this.normalIntensity = clamped;

    this.baseMaterials.forEach((material) => {
      this.applyNormalIntensityToMaterial(material, clamped);
    });

    this.activeAsteroids.forEach((asteroid) => {
      if (asteroid?.material) {
        this.applyNormalIntensityToMaterial(asteroid.material, clamped);
      }
    });
  }

  setupSettingsSubscription() {
    try {
      const settings = this.getSettingsService();
      if (!settings || typeof settings.subscribe !== 'function') {
        return;
      }

      if (typeof this.unsubscribeFromSettings === 'function') {
        this.unsubscribeFromSettings();
        this.unsubscribeFromSettings = null;
      }

      this.unsubscribeFromSettings = settings.subscribe(
        (change = {}) => {
          if (!change) {
            return;
          }

          if (change.type === 'snapshot') {
            const snapshotValue =
              change.value?.video?.menuAsteroidNormalIntensity;
            if (typeof snapshotValue === 'number') {
              this.updateNormalIntensity(snapshotValue);
            }
            return;
          }

          if (change.category === 'video') {
            if (
              change.key === 'menuAsteroidNormalIntensity' &&
              typeof change.value === 'number'
            ) {
              this.updateNormalIntensity(change.value);
              return;
            }

            if (typeof settings.getCategoryValues === 'function') {
              const videoValues = settings.getCategoryValues('video');
              const stored = videoValues?.menuAsteroidNormalIntensity;
              if (typeof stored === 'number') {
                this.updateNormalIntensity(stored);
              }
            }
          }
        },
        { immediate: true }
      );
    } catch (error) {
      console.warn(
        '[MenuBackgroundSystem] Unable to subscribe to settings updates:',
        error
      );
    }
  }

  handleVideoSettingsChanged(event = {}) {
    const { values, change } = event;

    if (values && typeof values.menuAsteroidNormalIntensity === 'number') {
      this.updateNormalIntensity(values.menuAsteroidNormalIntensity);
      return;
    }

    if (
      change &&
      change.key === 'menuAsteroidNormalIntensity' &&
      typeof change.value === 'number'
    ) {
      this.updateNormalIntensity(change.value);
    }
  }

  /**
   * GLSL noise functions chunk - ported from asteroid_generator_study.html
   * Contains: Simplex 3D, FBM, Ridge, Voronoi/Worley
   */
  getNoiseGLSL() {
    return `
      // --- Utilities ---
      vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289_4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute4(vec4 x) { return mod289_4(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      // --- Simplex Noise 3D ---
      float snoise3(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289_3(i);
        vec4 p = permute4(permute4(permute4(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt4(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }

      // --- FBM ---
      float fbm3(vec3 p, int octaves) {
        float amplitude = 0.5;
        float frequency = 1.0;
        float total = 0.0;
        float normalization = 0.0;
        for (int i = 0; i < 6; ++i) {
          if(i >= octaves) break;
          total += snoise3(p * frequency) * amplitude;
          normalization += amplitude;
          amplitude *= 0.5;
          frequency *= 2.0;
        }
        return total / normalization;
      }

      // --- Voronoi/Worley ---
      vec3 voronoiLCSN(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        float id = 0.0;
        vec2 res = vec2(8.0);
        for(int k = -1; k <= 1; k++) {
          for(int j = -1; j <= 1; j++) {
            for(int i = -1; i <= 1; i++) {
              vec3 b = vec3(float(i), float(j), float(k));
              vec3 p_hash = p + b;
              float hash = fract(sin(dot(p_hash, vec3(127.1, 311.7, 74.7))) * 43758.5453);
              vec3 r = vec3(b) - f + (hash * 0.7);
              float d = dot(r, r);
              if(d < res.x) {
                res.y = res.x;
                res.x = d;
                id = hash;
              } else if(d < res.y) {
                res.y = d;
              }
            }
          }
        }
        return vec3(sqrt(res.x), id, sqrt(res.y));
      }

      // --- Warped Noise (Flow Texture) ---
      float warpedNoise(vec3 p) {
        float q = fbm3(p, 4);
        float r = fbm3(p + q * 2.5, 4);
        return fbm3(p + r * 4.0, 4);
      }

      // --- Crack Network ---
      float getCracks(vec3 p) {
        vec3 x = p * 4.0;
        vec3 cellI = floor(x);
        vec3 cellF = fract(x);
        float m_dist = 1.0;
        for(int k = -1; k <= 1; k++) {
          for(int j = -1; j <= 1; j++) {
            for(int l = -1; l <= 1; l++) {
              vec3 b = vec3(float(l), float(j), float(k));
              vec3 p_hash = cellI + b;
              vec3 r = vec3(b) - cellF + fract(sin(dot(p_hash, vec3(127.1, 311.7, 74.7))) * 43758.5453);
              float d = dot(r, r);
              if(d < m_dist) m_dist = d;
            }
          }
        }
        return 1.0 - sqrt(m_dist);
      }
    `;
  }

  /**
   * Creates a fully procedural ShaderMaterial based on asteroid_generator_study.html.
   * This bypasses MeshStandardMaterial entirely for guaranteed shader execution.
   * Uses WebGL1 syntax which Three.js automatically upgrades to WebGL2 when available.
   *
   * Effects include:
   * - Procedural warped noise texture (flow patterns)
   * - Voronoi-based crack network
   * - Mineral spots (mottled appearance via Worley)
   * - Central difference bump mapping (7 samples)
   * - Layered material system (dust, rock, mineral, metal)
   */
  createProceduralAsteroidMaterial(seed = Math.random() * 100) {
    const { THREE } = this;

    const noiseGLSL = this.getNoiseGLSL();

    // Use WebGL1 syntax - Three.js automatically converts to WebGL2 when available
    // Don't declare position, normal, modelMatrix etc - Three.js provides them
    const vertexShader = `
      varying vec3 vWorldPosition;
      varying vec3 vObjPosition;
      varying vec3 vNormalWorld;
      varying float vAO;

      void main() {
        vObjPosition = position;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormalWorld = normalize(normalMatrix * normal);

        // Simple AO based on vertex height
        float height = length(position) - 1.0;
        vAO = smoothstep(-0.3, 0.3, height * 0.5 + 0.3);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    // Fragment shader with all procedural effects from the study
    const fragmentShader = `
      precision highp float;

      varying vec3 vWorldPosition;
      varying vec3 vObjPosition;
      varying vec3 vNormalWorld;
      varying float vAO;

      uniform vec3 u_lightDir;
      uniform vec3 u_viewPos;
      uniform float u_seed;
      uniform float u_textureScale;
      uniform float u_bumpStrength;
      uniform float u_crackIntensity;
      uniform float u_metalAmount;
      uniform float u_darkness;
      uniform float u_patchiness;

      ${noiseGLSL}

      float getSurfaceDetail(vec3 p) {
        float flow = warpedNoise(p * u_textureScale * 0.3 + vec3(u_seed));
        float grain = snoise3(p * u_textureScale * 4.0) * 0.2;
        float cells = getCracks(p * 2.0 + vec3(u_seed));
        float cracks = smoothstep(0.05, 0.1, cells);
        float crackLayer = (1.0 - cracks) * u_crackIntensity * 1.5;
        return flow + grain - crackLayer;
      }

      void main() {
        vec3 N_macro = normalize(vNormalWorld);
        vec3 p = vObjPosition;

        // --- 1. MICRO BUMP (Central Differences - 7 sample technique from study) ---
        float eps = 0.005;
        float h_center = getSurfaceDetail(p);

        float h_x1 = getSurfaceDetail(p + vec3(-eps, 0.0, 0.0));
        float h_x2 = getSurfaceDetail(p + vec3(eps, 0.0, 0.0));
        float h_y1 = getSurfaceDetail(p + vec3(0.0, -eps, 0.0));
        float h_y2 = getSurfaceDetail(p + vec3(0.0, eps, 0.0));
        float h_z1 = getSurfaceDetail(p + vec3(0.0, 0.0, -eps));
        float h_z2 = getSurfaceDetail(p + vec3(0.0, 0.0, eps));

        vec3 grad;
        grad.x = (h_x2 - h_x1) / (2.0 * eps);
        grad.y = (h_y2 - h_y1) / (2.0 * eps);
        grad.z = (h_z2 - h_z1) / (2.0 * eps);

        // Remove component parallel to normal (tangent space projection)
        grad -= N_macro * dot(grad, N_macro);
        vec3 N = normalize(N_macro - grad * u_bumpStrength);

        // --- 2. MATERIALS (Mottled & Diverse - from study) ---
        float h_norm = h_center * 0.5 + 0.5;

        // MINERAL SPOTS (Worley-based patches)
        vec3 cellData = voronoiLCSN(p * 1.5 + vec3(u_seed));
        float spots = smoothstep(0.6, 0.2, cellData.x);

        // MACRO COLOR VARIATION
        float macroVar = fbm3(p * 0.5 + vec3(u_seed + 10.0), 3);

        // --- PALETTE (exactly from study) ---
        vec3 colRegolith = vec3(0.05, 0.05, 0.06);  // Dark dust
        vec3 colRockBase = vec3(0.20, 0.19, 0.18);  // Medium grey/brown
        vec3 colRockVar  = vec3(0.35, 0.34, 0.32);  // Lighter grey
        vec3 colMineral  = vec3(0.40, 0.38, 0.35);  // Brownish mineral
        vec3 colSilver   = vec3(0.70, 0.72, 0.75);  // Silver metallic

        // 1. Base Rock (Varied by macro noise)
        vec3 albedo = mix(colRockBase, colRockVar, macroVar * 0.5 + 0.5);

        // 2. Add Mineral Spots (Mottling)
        albedo = mix(albedo, colMineral, spots * u_patchiness);

        // 3. Layer Masks
        float dustMask = smoothstep(0.4, 0.0, h_norm) * (1.0 - vAO);
        dustMask = clamp(dustMask, 0.0, 1.0);

        float metalThreshold = 1.0 - u_metalAmount;
        float metalMask = smoothstep(metalThreshold, 1.0, h_norm);

        // 4. Apply Layers
        albedo = mix(albedo, colSilver, metalMask);
        albedo = mix(albedo, colRegolith, dustMask);

        // Cracks are darker (from study)
        float crackCells = getCracks(p * 2.0 + vec3(u_seed));
        float crackVis = (1.0 - smoothstep(0.0, 0.05, crackCells)) * u_crackIntensity;
        albedo *= (1.0 - crackVis * 0.95);

        // Apply overall brightness (inverse darkness)
        albedo *= (1.5 - u_darkness);

        // Roughness varies by material (from study)
        float roughness = 0.7;
        roughness = mix(roughness, 0.25, metalMask);   // Metal is shiny
        roughness = mix(roughness, 0.98, dustMask);    // Dust is matte
        roughness = mix(roughness, 1.0, crackVis);     // Cracks are matte
        roughness = mix(roughness, 0.8, spots * u_patchiness * 0.5);

        // --- 3. LIGHTING (Blinn-Phong with rim - from study) ---
        vec3 V = normalize(u_viewPos - vWorldPosition);
        vec3 L = normalize(u_lightDir);
        vec3 H = normalize(L + V);

        float NdotL = max(dot(N, L), 0.0);
        float NdotH = max(dot(N, H), 0.0);
        float NdotV = max(dot(N, V), 0.0);

        // Half-Lambert diffuse for softer shadows while keeping contrast
        float diff = NdotL * 0.8 + 0.2 * NdotL * NdotL;

        // Specular with shininess from roughness
        float shininess = (1.0 - roughness) * 128.0 + 2.0;
        float spec = pow(NdotH, shininess) * (1.0 - roughness) * 0.5;

        // Specular occlusion (from study)
        float specOcc = smoothstep(0.2, 1.0, vAO);
        spec *= specOcc;

        // Rim lighting for silhouette - reduced strength
        float rim = pow(1.0 - NdotV, 4.0) * 0.15 * roughness;

        // Final color composition
        vec3 ambient = vec3(0.03, 0.03, 0.04);
        vec3 sunColor = vec3(1.0, 0.95, 0.9);

        vec3 finalColor = albedo * (diff * sunColor * 0.9 + ambient);
        finalColor += vec3(spec) * sunColor;
        finalColor += vec3(rim) * albedo;

        // Apply AO (from study)
        finalColor *= (vAO * 0.5 + 0.5);

        // No gamma here - renderer handles tone mapping
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        u_lightDir: { value: new THREE.Vector3(1.0, 0.6, 0.4).normalize() },
        u_viewPos: { value: new THREE.Vector3(0, 0, 100) },
        u_seed: { value: seed },
        u_textureScale: { value: 8.0 + Math.random() * 6.0 },
        u_bumpStrength: { value: 1.2 + Math.random() * 0.6 },
        u_crackIntensity: { value: 0.7 + Math.random() * 0.3 },
        u_metalAmount: { value: 0.15 + Math.random() * 0.2 },
        u_darkness: { value: 0.4 + Math.random() * 0.3 },
        u_patchiness: { value: 0.4 + Math.random() * 0.4 },
      },
      vertexShader,
      fragmentShader,
      side: THREE.FrontSide,
    });

    material.userData.isProceduralAsteroid = true;
    material.userData.seed = seed;

    return material;
  }

  /**
   * Updates procedural material uniforms for camera position.
   */
  updateProceduralMaterialUniforms() {
    if (!this.camera) return;

    const viewPos = this.camera.position;
    const lightDir = this.keyLight
      ? this.keyLight.position.clone().normalize()
      : new this.THREE.Vector3(1.0, 0.6, 0.4).normalize();

    this.activeAsteroids.forEach((asteroid) => {
      if (asteroid.material?.userData?.isProceduralAsteroid) {
        asteroid.material.uniforms.u_viewPos.value.copy(viewPos);
        asteroid.material.uniforms.u_lightDir.value.copy(lightDir);
      }
    });
  }

  /**
   * Legacy patch method - now creates procedural material instead.
   */
  patchAsteroidMaterial(material) {
    // This method is kept for compatibility but no longer patches
    // The actual procedural material is created in activateAsteroid
    return material;
  }

  ensurePoolSize(size) {
    while (this.asteroidPool.length < size) {
      this.createPoolableAsteroid();
    }
  }

  createPoolableAsteroid() {
    const { THREE, CANNON } = this;
    const mesh = new THREE.Mesh();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    this.scene.add(mesh);

    const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(1) });
    body.sleep();
    this.world.addBody(body);

    const asteroid = {
      mesh,
      body,
      active: false,
      fading: false,
      fadeElapsed: 0,
      material: null,
      fragmentationLevel: 0,
    };

    body.asteroidRef = asteroid;
    body.addEventListener('collide', (event) => {
      this.handleBodyCollision(event, asteroid);
    });

    this.asteroidPool.push(asteroid);
  }

  prepareInitialField() {
    const largeCount = Math.min(20, this.config.baseFieldCount);
    for (let i = 0; i < this.config.baseFieldCount; i += 1) {
      this.spawnBeltAsteroid({ forceLarge: i < largeCount });
    }
  }

  spawnBeltAsteroid({ forceLarge = false } = {}) {
    const { THREE, CANNON } = this;
    this.spawnedBeltAsteroids += 1;

    const belt = { innerRadius: 40, outerRadius: 150, height: 30 };
    const angle = this.randomFloat('belt') * Math.PI * 2;
    const radius =
      belt.innerRadius +
      this.randomFloat('belt') * (belt.outerRadius - belt.innerRadius);
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      (this.randomFloat('belt') - 0.5) * belt.height,
      Math.sin(angle) * radius
    );

    const shouldSpawnLarge =
      forceLarge ||
      this.spawnedBeltAsteroids <= 20 ||
      this.randomFloat('belt') < 0.25;
    const scaleVal = shouldSpawnLarge
      ? this.randomFloat('belt') * 5 + 5
      : this.randomFloat('belt') * 3 + 2;
    const scale = new THREE.Vector3(
      scaleVal * (1 + (this.randomFloat('belt') - 0.5) * 0.8),
      scaleVal * (1 + (this.randomFloat('belt') - 0.5) * 0.8),
      scaleVal * (1 + (this.randomFloat('belt') - 0.5) * 0.8)
    );

    const velocity = new CANNON.Vec3(
      (this.randomFloat('belt') - 0.5) * 2,
      (this.randomFloat('belt') - 0.5) * 2,
      (this.randomFloat('belt') - 0.5) * 2
    );

    const angularVelocity = new CANNON.Vec3(
      (this.randomFloat('belt') - 0.5) * 1,
      (this.randomFloat('belt') - 0.5) * 1,
      (this.randomFloat('belt') - 0.5) * 1
    );

    this.activateAsteroid({
      position,
      scale,
      velocity,
      angularVelocity,
    });
  }

  spawnRogueAsteroid() {
    if (!this.activeAsteroids.length) {
      return;
    }

    const { THREE, CANNON } = this;
    const target =
      this.activeAsteroids[
        Math.floor(this.randomFloat('asteroids') * this.activeAsteroids.length)
      ];

    const spawnDirection = new THREE.Vector3(
      this.randomFloat('asteroids') - 0.5,
      this.randomFloat('asteroids') - 0.5,
      this.randomFloat('asteroids') - 0.5
    ).normalize();

    const spawnDistance = 300;
    const position = spawnDirection.multiplyScalar(spawnDistance);

    const velocity = new CANNON.Vec3();
    target.body.position.vsub(
      new CANNON.Vec3(position.x, position.y, position.z),
      velocity
    );
    velocity.normalize();
    velocity.scale(80, velocity);

    const scaleValue = this.randomFloat('asteroids') * 4 + 4;
    const scale = new THREE.Vector3(
      scaleValue,
      scaleValue * (0.85 + this.randomFloat('asteroids') * 0.3),
      scaleValue * (0.9 + this.randomFloat('asteroids') * 0.25)
    );

    const angularVelocity = new CANNON.Vec3(
      (this.randomFloat('asteroids') - 0.5) * 3,
      (this.randomFloat('asteroids') - 0.5) * 3,
      (this.randomFloat('asteroids') - 0.5) * 3
    );

    this.activateAsteroid({ position, scale, velocity, angularVelocity });
  }

  activateAsteroid({
    position,
    scale,
    velocity,
    angularVelocity,
    fragmentationLevel = 0,
  }) {
    const asteroid = this.getAsteroidFromPool();
    if (!asteroid) {
      return;
    }

    const { mesh, body } = asteroid;
    const geometry =
      this.baseGeometries[
        Math.floor(this.randomFloat('asteroids') * this.baseGeometries.length)
      ];

    mesh.geometry = geometry;

    // Use the new procedural ShaderMaterial instead of MeshStandardMaterial
    if (!asteroid.material || !asteroid.material.userData?.isProceduralAsteroid) {
      const seed = this.randomFloat('materials') * 100;
      asteroid.material = this.createProceduralAsteroidMaterial(seed);
    }

    mesh.material = asteroid.material;
    mesh.visible = true;
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    mesh.rotation.set(
      this.randomFloat('asteroids') * Math.PI,
      this.randomFloat('asteroids') * Math.PI,
      this.randomFloat('asteroids') * Math.PI
    );

    const avgRadius = (scale.x + scale.y + scale.z) / 3;
    if (body.shapes[0]) {
      body.shapes[0].radius = avgRadius;
      body.updateBoundingRadius();
    }

    body.mass = Math.max(0.5, Math.pow(avgRadius, 3));
    body.updateMassProperties();
    body.position.set(position.x, position.y, position.z);
    body.velocity.set(velocity.x, velocity.y, velocity.z);
    body.angularVelocity.set(
      angularVelocity.x,
      angularVelocity.y,
      angularVelocity.z
    );
    body.force.set(0, 0, 0);
    body.torque.set(0, 0, 0);
    body.wakeUp();

    asteroid.active = true;
    asteroid.fading = false;
    asteroid.fadeElapsed = 0;
    asteroid.fragmentationLevel = fragmentationLevel;
    this.activeAsteroids.push(asteroid);
  }

  getAsteroidFromPool() {
    if (this.activeAsteroids.length >= this.config.maxAsteroids) {
      return null;
    }

    const idle = this.asteroidPool.find((item) => !item.active);
    if (idle) {
      return idle;
    }

    if (this.asteroidPool.length < this.config.maxAsteroids) {
      this.createPoolableAsteroid();
      return this.asteroidPool[this.asteroidPool.length - 1];
    }

    return null;
  }

  deactivateAsteroid(asteroid) {
    if (!asteroid?.active) {
      return;
    }

    asteroid.active = false;
    asteroid.fading = false;
    asteroid.fadeElapsed = 0;
    asteroid.fragmentationLevel = 0;
    asteroid.mesh.visible = false;
    asteroid.mesh.position.set(0, -10000, 0);
    asteroid.body.sleep();
    asteroid.body.position.set(0, -10000, 0);
    asteroid.body.velocity.set(0, 0, 0);
    asteroid.body.angularVelocity.set(0, 0, 0);
    if (asteroid.material) {
      asteroid.material.opacity = 1;
    }

    const index = this.activeAsteroids.indexOf(asteroid);
    if (index >= 0) {
      this.activeAsteroids.splice(index, 1);
    }
  }

  startFadeOut(asteroid) {
    if (!asteroid.fading) {
      asteroid.fading = true;
      asteroid.fadeElapsed = 0;
    }
  }

  handleBodyCollision(event, asteroid) {
    if (!asteroid?.active) {
      return;
    }

    if (asteroid.fragmentationLevel >= this.config.maxFragmentationLevel) {
      return;
    }

    const impact =
      typeof event?.contact?.getImpactVelocityAlongNormal === 'function'
        ? event.contact.getImpactVelocityAlongNormal()
        : 0;

    if (impact <= this.config.fragmentationThreshold) {
      return;
    }

    this.createExplosion(asteroid.mesh.position);
    this.fragmentAsteroid(asteroid);
    this.objectsToDeactivate.push(asteroid);
  }

  fragmentAsteroid(parent) {
    const { THREE, CANNON } = this;
    const radius = parent.body.shapes[0]?.radius || 1;
    const fragments = Math.floor(this.randomFloat('fragments') * 3) + 2;

    for (let i = 0; i < fragments; i += 1) {
      const scaleMultiplier = this.randomFloat('fragments') * 0.3 + 0.4;
      const newScale = parent.mesh.scale
        .clone()
        .multiplyScalar(scaleMultiplier);

      if (newScale.x < 1 && newScale.y < 1 && newScale.z < 1) {
        continue;
      }

      const direction = new THREE.Vector3(
        this.randomFloat('fragments') - 0.5,
        this.randomFloat('fragments') - 0.5,
        this.randomFloat('fragments') - 0.5
      ).normalize();

      const offset = parent.mesh.position
        .clone()
        .add(direction.clone().multiplyScalar(radius));

      const explosionImpulse = new CANNON.Vec3(
        direction.x,
        direction.y,
        direction.z
      );
      explosionImpulse.scale(15, explosionImpulse);

      const velocity = new CANNON.Vec3(
        parent.body.velocity.x + explosionImpulse.x,
        parent.body.velocity.y + explosionImpulse.y,
        parent.body.velocity.z + explosionImpulse.z
      );

      const angularVelocity = new CANNON.Vec3(
        (this.randomFloat('fragments') - 0.5) * 5,
        (this.randomFloat('fragments') - 0.5) * 5,
        (this.randomFloat('fragments') - 0.5) * 5
      );

      this.activateAsteroid({
        position: offset,
        scale: newScale,
        velocity,
        angularVelocity,
        fragmentationLevel: parent.fragmentationLevel + 1,
      });
    }
  }

  createExplosion(position) {
    const { THREE } = this;
    const light = new THREE.PointLight(0xffaa66, 3.5, 140, 2);
    light.position.copy(position);
    this.scene.add(light);

    this.explosions.push({
      light,
      life: 0.4,
      maxLife: 0.4,
      initialIntensity: light.intensity,
      initialDistance: light.distance,
    });
  }

  updateExplosions(delta) {
    for (let i = this.explosions.length - 1; i >= 0; i -= 1) {
      const explosion = this.explosions[i];
      explosion.life -= delta;

      const progress = Math.max(explosion.life, 0) / explosion.maxLife;
      explosion.light.intensity = explosion.initialIntensity * progress;
      explosion.light.distance =
        explosion.initialDistance * (0.7 + progress * 0.3);

      if (explosion.life <= 0) {
        this.scene.remove(explosion.light);
        this.explosions.splice(i, 1);
      }
    }
  }

  // ============================================
  // Phase 3: Adaptive Quality System
  // ============================================

  /**
   * Updates FPS tracking and adjusts quality level dynamically.
   * Called every frame to maintain smooth performance.
   */
  updateAdaptiveQuality(delta) {
    const aq = this.adaptiveQuality;
    if (!aq.enabled) return;

    // Track frame time
    const frameTimeMs = delta * 1000;
    aq.frameTimesMs.push(frameTimeMs);
    if (aq.frameTimesMs.length > aq.frameTimesMaxSamples) {
      aq.frameTimesMs.shift();
    }

    // Calculate average FPS (need at least 30 samples)
    if (aq.frameTimesMs.length < 30) return;

    const avgFrameTime =
      aq.frameTimesMs.reduce((a, b) => a + b, 0) / aq.frameTimesMs.length;
    const currentFps = 1000 / avgFrameTime;
    aq.lastFps = currentFps;

    // Update cooldown
    if (aq.adjustmentCooldown > 0) {
      aq.adjustmentCooldown -= delta;
      return;
    }

    // Check if we need to adjust quality
    const maxLevel = aq.levels.length - 1;

    if (currentFps < aq.targetFpsMin && aq.currentLevel > 0) {
      // FPS too low - decrease quality
      aq.currentLevel--;
      aq.adjustmentCooldown = aq.adjustmentCooldownDuration;
      this.applyQualityLevel(aq.currentLevel);
      console.log(
        `[AdaptiveQuality] FPS ${currentFps.toFixed(1)} < ${aq.targetFpsMin}, ` +
          `降级 to "${aq.levels[aq.currentLevel].name}"`
      );
    } else if (currentFps > aq.targetFpsMax && aq.currentLevel < maxLevel) {
      // FPS has headroom - try increasing quality
      aq.currentLevel++;
      aq.adjustmentCooldown = aq.adjustmentCooldownDuration;
      this.applyQualityLevel(aq.currentLevel);
      console.log(
        `[AdaptiveQuality] FPS ${currentFps.toFixed(1)} > ${aq.targetFpsMax}, ` +
          `升级 to "${aq.levels[aq.currentLevel].name}"`
      );
    }
  }

  /**
   * Applies a quality level to all relevant systems.
   */
  applyQualityLevel(level) {
    const aq = this.adaptiveQuality;
    const config = aq.levels[level];
    if (!config) return;

    // Update bloom pass
    if (this.bloomPass) {
      this.bloomPass.strength = config.bloomStrength;
    }

    // Update chromatic aberration in custom FX
    if (this.customFX && this.customFX.uniforms) {
      this.customFX.uniforms.amount.value = config.chromaticAberration;
    }

    // Update asteroid material shader detail
    this.updateAsteroidShaderDetail(config.shaderDetail);
  }

  /**
   * Updates the shader detail level for all asteroid materials.
   * This controls the complexity of fragment shader effects.
   */
  updateAsteroidShaderDetail(detailLevel) {
    // Store current detail level for new asteroids
    this.currentShaderDetail = detailLevel;

    // Update all active asteroid materials
    this.activeAsteroids.forEach((asteroid) => {
      if (asteroid.material && asteroid.material.userData) {
        asteroid.material.userData.shaderDetail = detailLevel;
        // Update the uniform directly if shader is compiled
        const uniforms = asteroid.material.userData.shaderUniforms;
        if (uniforms && uniforms.detailLevel) {
          uniforms.detailLevel.value = detailLevel;
        }
      }
    });

    // Update base materials
    this.baseMaterials.forEach((material) => {
      if (material.userData) {
        material.userData.shaderDetail = detailLevel;
        const uniforms = material.userData.shaderUniforms;
        if (uniforms && uniforms.detailLevel) {
          uniforms.detailLevel.value = detailLevel;
        }
      }
    });
  }

  /**
   * Updates time uniform for all asteroid shaders (for animated effects).
   */
  updateAsteroidShaderTime(time) {
    this.activeAsteroids.forEach((asteroid) => {
      if (asteroid.material && asteroid.material.userData) {
        const uniforms = asteroid.material.userData.shaderUniforms;
        if (uniforms && uniforms.time) {
          uniforms.time.value = time;
        }
      }
    });
  }

  /**
   * Gets the current FPS from the adaptive quality system.
   */
  getCurrentFps() {
    return this.adaptiveQuality.lastFps;
  }

  /**
   * Gets the current quality level name.
   */
  getCurrentQualityLevel() {
    const aq = this.adaptiveQuality;
    return aq.levels[aq.currentLevel]?.name || 'unknown';
  }

  animate() {
    if (!this.isActive) {
      return;
    }

    this.animationFrame = requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (this.stats) {
      this.stats.begin();
    }
    this.elapsedTime += delta;
    this.rogueSpawnTimer += delta;

    // Phase 3: Adaptive Quality - monitor FPS and adjust quality
    this.updateAdaptiveQuality(delta);

    if (this.rogueSpawnTimer >= this.config.rogueSpawnInterval) {
      this.spawnRogueAsteroid();
      this.rogueSpawnTimer = 0;
    }

    this.world.step(1 / 60, delta, 3);

    for (let i = this.activeAsteroids.length - 1; i >= 0; i -= 1) {
      const asteroid = this.activeAsteroids[i];
      const { body, mesh } = asteroid;
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
      );

      const distanceSqr =
        body.position.x * body.position.x +
        body.position.y * body.position.y +
        body.position.z * body.position.z;

      if (distanceSqr > this.config.cullingDistanceSqr) {
        this.startFadeOut(asteroid);
      }

      if (asteroid.fading) {
        asteroid.fadeElapsed += delta;
        const fadeProgress = Math.min(
          asteroid.fadeElapsed / this.config.fadeOutDuration,
          1
        );
        if (asteroid.material) {
          asteroid.material.opacity = 1 - fadeProgress;
          asteroid.material.needsUpdate = true;
        }

        if (fadeProgress >= 1) {
          this.objectsToDeactivate.push(asteroid);
        }
      }
    }

    while (this.objectsToDeactivate.length) {
      this.deactivateAsteroid(this.objectsToDeactivate.pop());
    }

    while (this.activeAsteroids.length < this.config.baseFieldCount) {
      this.spawnBeltAsteroid();
    }

    const timer = this.elapsedTime * 0.03;
    const orbitalRadius = 70;

    // Cinematic Damping & Lens Float
    const driftX = Math.sin(this.elapsedTime * 0.4) * 3;
    const driftY = Math.cos(this.elapsedTime * 0.25) * 2;

    const targetPosX = Math.cos(timer) * orbitalRadius + driftX;
    const targetPosZ = Math.sin(timer) * orbitalRadius;
    const targetPosY = Math.sin(timer * 0.7) * 15 + driftY;

    // Smooth lerp for "weighty" camera feel
    const camLerp = 0.04;
    this.camera.position.x += (targetPosX - this.camera.position.x) * camLerp;
    this.camera.position.y += (targetPosY - this.camera.position.y) * camLerp;
    this.camera.position.z += (targetPosZ - this.camera.position.z) * camLerp;

    this.camera.lookAt(0, 0, 0);

    // Update Atmosphere
    if (this.nebulas) {
      this.nebulas.forEach((neb) => {
        neb.material.uniforms.time.value = this.elapsedTime;
        neb.rotation.z += neb.userData.rotateSpeed * delta;
      });
    }

    if (this.dustSystem) {
      this.dustSystem.rotation.y += delta * 0.02;
    }

    this.starLayers.forEach((layer) => {
      layer.mesh.rotation.y = -timer * layer.speedFactor;
    });

    this.updateExplosions(delta);

    // Update procedural asteroid material uniforms (camera/light position)
    this.updateProceduralMaterialUniforms();

    // Phase 3: Update shader time for animated effects (sparkle, etc.)
    this.updateAsteroidShaderTime(this.elapsedTime);

    if (this.customFX && this.customFX.uniforms) {
      this.customFX.uniforms.time.value = this.elapsedTime;
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.stats) {
      this.stats.end();
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
    if (this.clock) {
      this.clock.start();
      this.clock.getDelta();
    }
    this.elapsedTime = 0;
    this.rogueSpawnTimer = 0;
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  /**
   * Called when preloading completes to sync the initial state.
   * Starts animation if a start was pending during loading.
   */
  syncInitialState() {
    if (this.loadingState.pendingStart) {
      this.loadingState.pendingStart = false;
      this.start();
    }
  }

  stop() {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    if (this.clock) {
      this.clock.stop();
    }
    this.activeAsteroids.forEach((asteroid) => {
      asteroid.body.sleep();
    });
  }

  handleResize() {
    if (!this.ready) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = this.getAspectRatio(width, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    if (this.composer) {
      this.composer.setSize(width, height);
    }

    this.updateStarLayerSizes();
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

  registerEventHooks() {
    window.addEventListener('resize', this.handleResize, { passive: true });

    this.registerEventListener('screen-changed', this.handleScreenChanged);
    this.registerEventListener(
      'settings-video-changed',
      this.handleVideoSettingsChanged
    );
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

// Simplex noise implementation adapted for procedural asteroid generation
class SimplexNoise {
  constructor(randomFn = () => SIMPLEX_DEFAULT_RANDOM.float()) {
    this.p = new Uint8Array(256);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);

    for (let i = 0; i < 256; i += 1) {
      this.p[i] = i;
    }

    for (let i = 255; i > 0; i -= 1) {
      const n = Math.floor((i + 1) * randomFn());
      const temp = this.p[i];
      this.p[i] = this.p[n];
      this.p[n] = temp;
    }

    for (let i = 0; i < 512; i += 1) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise3d(xin, yin, zin) {
    const perm = this.perm;
    const permMod12 = this.permMod12;
    const grad3 = SimplexNoise.grad3;

    const F3 = 1 / 3;
    const G3 = 1 / 6;

    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const z0 = zin - Z0;

    let i1;
    let j1;
    let k1;
    let i2;
    let j2;
    let k2;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      } else {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      }
    } else if (y0 < z0) {
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else if (x0 < z0) {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    const gi0 = permMod12[ii + perm[jj + perm[kk]]];
    const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
    const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
    const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let n3 = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * this.dot(grad3, gi0, x0, y0, z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * this.dot(grad3, gi1, x1, y1, z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * this.dot(grad3, gi2, x2, y2, z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      t3 *= t3;
      n3 = t3 * t3 * this.dot(grad3, gi3, x3, y3, z3);
    }

    return 32 * (n0 + n1 + n2 + n3);
  }

  dot(grad3, index, x, y, z) {
    const offset = index * 3;
    return grad3[offset] * x + grad3[offset + 1] * y + grad3[offset + 2] * z;
  }

  /**
   * Fractal Brownian Motion - layered noise for natural variation
   */
  fbm(x, y, z, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let amplitude = 0.5;
    let frequency = 1.0;
    let total = 0.0;
    let normalization = 0.0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise3d(x * frequency, y * frequency, z * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / normalization;
  }

  /**
   * Ridge function - creates sharp ridges from noise
   */
  ridge(h, offset = 1.0) {
    h = Math.abs(h);
    h = offset - h;
    h = h * h;
    return h;
  }

  /**
   * Ridged Multifractal - creates sharp mountain-like ridges
   * Based on the study's ridgedMF implementation
   */
  ridgedMF(x, y, z, octaves = 4, lacunarity = 2.2, gain = 0.5) {
    let sum = 0.0;
    let amp = 0.5;
    let freq = 1.0;
    let prev = 1.0;

    for (let i = 0; i < octaves; i++) {
      const n = this.noise3d(x * freq, y * freq, z * freq);
      const r = this.ridge(n, 1.0);
      sum += r * amp * prev;
      prev = r;
      freq *= lacunarity;
      amp *= gain;
    }

    return sum;
  }

  /**
   * 3D Voronoi/Cellular noise - returns [closestDist, cellId, secondClosestDist]
   * Used for craters and rock protrusions
   */
  voronoi3d(x, y, z) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    const pz = Math.floor(z);
    const fx = x - px;
    const fy = y - py;
    const fz = z - pz;

    let minDist = 8.0;
    let secondMinDist = 8.0;
    let cellId = 0.0;

    // Search 3x3x3 neighborhood
    for (let k = -1; k <= 1; k++) {
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const cx = px + i;
          const cy = py + j;
          const cz = pz + k;

          // Hash function for cell point position
          const hash = this.hashVoronoi(cx, cy, cz);

          // Random point within cell (0.0 to 0.7 range for variation)
          const rx = i - fx + hash * 0.7;
          const ry = j - fy + this.hashVoronoi(cx + 127, cy, cz) * 0.7;
          const rz = k - fz + this.hashVoronoi(cx, cy + 127, cz) * 0.7;

          const dist = rx * rx + ry * ry + rz * rz;

          if (dist < minDist) {
            secondMinDist = minDist;
            minDist = dist;
            cellId = hash;
          } else if (dist < secondMinDist) {
            secondMinDist = dist;
          }
        }
      }
    }

    return [Math.sqrt(minDist), cellId, Math.sqrt(secondMinDist)];
  }

  /**
   * Simple hash function for voronoi cell IDs
   */
  hashVoronoi(x, y, z) {
    const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }
}

SimplexNoise.grad3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0,
  -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

export default MenuBackgroundSystem;
