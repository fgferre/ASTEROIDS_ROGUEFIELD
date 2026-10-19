// src/modules/MenuBackgroundSystem.js
//
// The Three.js scene behind the main menu: an asteroid belt orbited by a
// slow camera under the NASA starfield, with the chosen hull framed in
// front. This file orchestrates (boot, preload, the frame loop, settings,
// screens, the seeded random) and owns the scene's state; the parts live in
// ./menu/: rendering (renderer, lights, post), starfield, atmosphere,
// asteroidMaterials (+ asteroidNoise), asteroidField, adaptiveQuality,
// cameraOrbit, menuSettings, loadingScreen and threeUuid.

import { BaseSystem } from '../core/BaseSystem.js';
import { resolveService } from '../core/serviceUtils.js';
import { createRandomHelpers } from '../utils/randomHelpers.js';
import { AsteroidImpactEffect } from './AsteroidImpactEffect.js';
import { MenuHullPreview } from './MenuHullPreview.js';
import * as quality from './menu/adaptiveQuality.js';
import { createMenuAsteroidField } from './menu/asteroidField.js';
import { createMenuAsteroidMaterials } from './menu/asteroidMaterials.js';
import * as atmosphere from './menu/atmosphere.js';
import { orbitCamera } from './menu/cameraOrbit.js';
import * as loadingScreen from './menu/loadingScreen.js';
import * as menuSettings from './menu/menuSettings.js';
import * as rendering from './menu/rendering.js';
import * as stars from './menu/starfield.js';
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
        starfield: 'menu.starfield',
        assets: 'menu.assets',
        belt: 'menu.belt',
        asteroids: 'menu.asteroids',
        fragments: 'menu.fragments',
        materials: 'menu.materials',
        threeUuid: 'menu.three-uuid',
        atmosphere: 'menu.atmosphere',
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
    this.CANNON = this.ready ? window.CANNON : null;
    this.ready = this.ready && Boolean(this.THREE) && Boolean(this.CANNON);

    this._threeMathUtilsState = threeUuid.createThreeMathUtilsState();

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
    this.monolithMaterials = [];
    this.asteroidPool = [];
    this.activeAsteroids = [];
    this.proceduralAsteroidCount = 0;
    this.hasProceduralAsteroids = false;
    this.objectsToDeactivate = [];
    this.explosions = [];
    // F9: pre-allocated explosion light pool to avoid new PointLight() per explosion
    this._explosionLightPool = [];
    this._explosionLightPoolSize = 4;

    this.config = {
      // Higher tessellation is required for "Monolith-like" silhouettes.
      // Reduce density to keep performance stable.
      maxAsteroids: 28,
      baseFieldCount: 18,
      rogueSpawnInterval: 15,
      cullingDistanceSqr: 300 * 300,
      fadeOutDuration: 1.25,
      fragmentationThreshold: 60,
      maxFragmentationLevel: 2,
    };

    // Phase 3: Adaptive Quality System
    this.adaptiveQuality = quality.createAdaptiveQualityState();
    this.currentShaderDetail =
      this.adaptiveQuality.levels[this.adaptiveQuality.currentLevel]
        ?.shaderDetail ?? 1.0;

    this.stats = this.resolveStatsPanel();
    this.alphaToCoverageEnabled = false;

    this.normalIntensity = menuSettings.resolveInitialNormalIntensity(() =>
      this.getSettingsService()
    );
    this.unsubscribeFromSettings = null;

    // The scene's parts (./menu/); each reads what it needs through a kit.
    this.starfield = stars.createMenuStarfield(this._createStarfieldKit());
    this.asteroidMaterials = createMenuAsteroidMaterials(
      this._createAsteroidMaterialsKit()
    );
    this.asteroidField = createMenuAsteroidField(
      this._createAsteroidFieldKit()
    );

    this.handleVideoSettingsChanged =
      this.handleVideoSettingsChanged.bind(this);

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

    // Destroy impact effects (libera memória dos pools)
    if (this.impactEffect) {
      this.impactEffect.destroy();
      this.impactEffect = null;
    }

    super.destroy();

    this.stop();
    this.restoreOriginalThreeUuidGenerator();
  }

  /**
   * The kits the scene parts get instead of the system (the SFXBus._createKit
   * pattern): live getters, so a field replaced later (at boot, or by a test)
   * is honoured; setters only for values the part updates; the system's own
   * helpers. Frozen.
   */
  _createStarfieldKit() {
    const system = this;
    return Object.freeze({
      get THREE() {
        return system.THREE;
      },
      get scene() {
        return system.scene;
      },
      get camera() {
        return system.camera;
      },
      get renderer() {
        return system.renderer;
      },
      get nebulas() {
        return system.nebulas;
      },
      get dustSystem() {
        return system.dustSystem;
      },
      get starLayers() {
        return system.starLayers;
      },
      set starLayers(layers) {
        system.starLayers = layers;
      },
      randomFloat: (name) => system.randomFloat(name),
      createStarTexture: () => system.createStarTexture(),
    });
  }

  _createAsteroidMaterialsKit() {
    const system = this;
    return Object.freeze({
      get THREE() {
        return system.THREE;
      },
      get adaptiveQuality() {
        return system.adaptiveQuality;
      },
      get baseMaterials() {
        return system.baseMaterials;
      },
      get monolithMaterials() {
        return system.monolithMaterials;
      },
      get activeAsteroids() {
        return system.activeAsteroids;
      },
      get camera() {
        return system.camera;
      },
      get keyLight() {
        return system.keyLight;
      },
      get elapsedTime() {
        return system.elapsedTime;
      },
      get normalIntensity() {
        return system.normalIntensity;
      },
      set normalIntensity(value) {
        system.normalIntensity = value;
      },
      get currentShaderDetail() {
        return system.currentShaderDetail;
      },
      set currentShaderDetail(value) {
        system.currentShaderDetail = value;
      },
      randomFloat: (name) => system.randomFloat(name),
    });
  }

  _createAsteroidFieldKit() {
    const system = this;
    return Object.freeze({
      get THREE() {
        return system.THREE;
      },
      get CANNON() {
        return system.CANNON;
      },
      get scene() {
        return system.scene;
      },
      get world() {
        return system.world;
      },
      get config() {
        return system.config;
      },
      get renderer() {
        return system.renderer;
      },
      get camera() {
        return system.camera;
      },
      get composer() {
        return system.composer;
      },
      get customFX() {
        return system.customFX;
      },
      get elapsedTime() {
        return system.elapsedTime;
      },
      get impactEffect() {
        return system.impactEffect;
      },
      get asteroidPool() {
        return system.asteroidPool;
      },
      get activeAsteroids() {
        return system.activeAsteroids;
      },
      get objectsToDeactivate() {
        return system.objectsToDeactivate;
      },
      get baseGeometries() {
        return system.baseGeometries;
      },
      get baseMaterials() {
        return system.baseMaterials;
      },
      get explosions() {
        return system.explosions;
      },
      get explosionLightPool() {
        return system._explosionLightPool;
      },
      get proceduralAsteroidCount() {
        return system.proceduralAsteroidCount;
      },
      set proceduralAsteroidCount(value) {
        system.proceduralAsteroidCount = value;
      },
      get hasProceduralAsteroids() {
        return system.hasProceduralAsteroids;
      },
      set hasProceduralAsteroids(value) {
        system.hasProceduralAsteroids = value;
      },
      randomFloat: (name) => system.randomFloat(name),
      withSeededMathRandom: (fn) => system.withSeededMathRandom(fn),
    });
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
    loadingScreen.setupLoadingScreen((onProgress, onComplete) =>
      this.setLoadingCallbacks(onProgress, onComplete)
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

    this.renderer = rendering.createMenuRenderer(THREE, this.canvas);
    this.enableAlphaToCoverage();

    this.world = new CANNON.World();
    this.world.gravity.set(0, 0, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 5;

    this.clock = new THREE.Clock();

    // F10: initialize reusable temporaries
    this.asteroidField.createTemporaries();

    // F9: pre-allocate explosion light pool
    for (let i = 0; i < this._explosionLightPoolSize; i++) {
      const light = new THREE.PointLight(0xffaa66, 0, 140, 2);
      light.visible = false;
      this.scene.add(light);
      this._explosionLightPool.push(light);
    }

    // Quick setup (non-blocking)
    this.keyLight = rendering.createLighting(THREE, this.scene);
    // The chosen hull, framed into the menu's stage box (camera children
    // only render with the camera in the scene).
    this.scene.add(this.camera);
    this.hullPreview = new MenuHullPreview(THREE, this.camera);
    this.hullStage = document.getElementById('menu-hull-stage');
    // While the Hangar is open the hull frames into its stage instead, and
    // that patch of the menu canvas is copied into it (the overlay hides the
    // canvas). A hovered hull button previews its hull.
    this.hangarStage = document.getElementById('hangar-hull-stage');
    this.hangarOpen = false;
    this.hoveredHull = null;
    this.hoveredHullLocked = false;
    // Lightweight placeholder while NASA starfield loads during preload.
    this.starfield.createFallbackStarLayers();
    this.createAtmosphere();
    this.setupPostProcessing();
    this.setupImpactEffects();

    // Start async preloading for heavy assets
    this.withSeededMathRandom(() => this.preloadAssets());
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

    const starfieldStepCount = 1;
    const geometryCount = 10;
    const materialCount = 12;
    const monolithMaterialCount = 0;
    const poolSize = this.config.maxAsteroids;
    const impactEffectsStepCount = 1; // Pre-load impact effects
    const impactWarmupStepCount = 1; // Compile first-impact render path

    // Total steps: geometries + materials + pool chunks + field setup + impact effects
    const poolChunks = Math.ceil(poolSize / 10); // Create 10 pool items per chunk
    ls.totalSteps =
      starfieldStepCount +
      geometryCount +
      materialCount +
      monolithMaterialCount +
      poolChunks +
      impactEffectsStepCount +
      impactWarmupStepCount +
      1;
    ls.currentStep = 0;

    const updateProgress = (message) => {
      ls.currentStep++;
      ls.progress = ls.currentStep / ls.totalSteps;
      if (typeof ls.onProgress === 'function') {
        ls.onProgress(ls.progress, message);
      }
    };

    // Helper to yield to main thread
    const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0));

    try {
      // Phase 0: Load NASA starfield (matches the standalone mockup).
      await this.starfield.createNasaStarfieldLayers();
      updateProgress('Loading NASA starfield');
      await yieldToMain();

      // Phase 1: Create geometries (one per frame)
      for (let i = 0; i < geometryCount; i++) {
        const geometry = this.asteroidMaterials.createDeformedIcosahedron();
        this.baseGeometries.push(geometry);
        updateProgress(`Creating geometry ${i + 1}/${geometryCount}`);
        await yieldToMain();
      }

      // Phase 2: Create materials (one per frame)
      // Single-technique policy: menu asteroids use one unified procedural
      // material pipeline (PBR + 3D noise with triplanar mixing).
      for (let i = 0; i < materialCount; i++) {
        const seed = this.randomFloat('materials') * 100;
        const material =
          this.asteroidMaterials.createTriplanarAsteroidMaterial(seed);
        this.baseMaterials.push(material);
        updateProgress(`Creating materials ${i + 1}/${materialCount}`);
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
            this.asteroidField.createPoolableAsteroid();
          }
        }

        updateProgress(
          `Creating asteroid pool ${Math.min((chunk + 1) * 10, poolSize)}/${poolSize}`
        );
        await yieldToMain();
      }

      // Phase 4: Pre-load impact effects (pools de flash, debris, dust)
      if (this.impactEffect) {
        this.impactEffect.preload();
        updateProgress('Loading impact effects');
        await yieldToMain();
      }

      // Phase 5: Prepare initial asteroid field so impact warmup renders against
      // the same lit materials that the player sees once the menu is visible.
      this.asteroidField.prepareInitialField();
      updateProgress('Preparing asteroid field');
      await yieldToMain();

      // Phase 6: Warm the real first-impact path (lights + debris + dust uploads)
      await this.asteroidField.warmupFirstImpactPath();
      updateProgress('Warming impact pipeline');

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
    Object.assign(
      this,
      rendering.setupPostProcessing({
        THREE: this.THREE,
        scene: this.scene,
        camera: this.camera,
        renderer: this.renderer,
        adaptiveQuality: this.adaptiveQuality,
      })
    );
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

  setupImpactEffects() {
    const { THREE, scene, camera } = this;
    if (!THREE || !scene || !camera) return;

    // Criar sistema de efeitos de impacto cinematográficos
    this.impactEffect = new AsteroidImpactEffect(THREE, scene, camera, {
      qualityLevels: {
        0: { debris: 40, dust: 30, flashIntensity: 3.0, shakeAmount: 0.3 }, // low
        1: { debris: 80, dust: 60, flashIntensity: 4.0, shakeAmount: 0.4 }, // medium
        2: { debris: 150, dust: 120, flashIntensity: 5.0, shakeAmount: 0.5 }, // high
        3: { debris: 300, dust: 200, flashIntensity: 6.0, shakeAmount: 0.5 }, // ultra
      },
      initialQualityLevel: this.adaptiveQuality?.currentLevel || 2,
      randomFloat: () => this.randomFloat('fragments'),
    });
  }

  createStarTexture() {
    return stars.createStarTexture(this.THREE);
  }

  createAtmosphere() {
    const created = atmosphere.createAtmosphere({
      THREE: this.THREE,
      scene: this.scene,
      ensureRandom: (name) => this.ensureRandom(name),
      createStarTexture: () => this.createStarTexture(),
    });
    if (created) {
      Object.assign(this, created);
    }
  }

  fetchNasaBinaryAsset(filename, baseCandidates, timeoutMs) {
    return stars.fetchNasaBinaryAsset(filename, baseCandidates, timeoutMs);
  }

  updateNormalIntensity(rawValue) {
    this.asteroidMaterials.updateNormalIntensity(rawValue);
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
        menuSettings.createSettingsListener(settings, {
          syncHullPreview: () => this.syncHullPreview(),
          updateNormalIntensity: (value) => this.updateNormalIntensity(value),
        }),
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

  handleVideoSettingsChanged(event = {}) {
    menuSettings.applyVideoSettingsChange(event, (value) =>
      this.updateNormalIntensity(value)
    );
  }

  spawnBeltAsteroid(options) {
    this.asteroidField.spawnBeltAsteroid(options);
  }

  spawnRogueAsteroid() {
    this.asteroidField.spawnRogueAsteroid();
  }

  deactivateAsteroid(asteroid) {
    this.asteroidField.deactivateAsteroid(asteroid);
  }

  startFadeOut(asteroid) {
    this.asteroidField.startFadeOut(asteroid);
  }

  createExplosion(position) {
    this.asteroidField.createExplosion(position);
  }

  clearActiveExplosions() {
    this.asteroidField.clearActiveExplosions();
  }

  updateExplosions(delta) {
    this.asteroidField.updateExplosions(delta);
  }

  updateAdaptiveQuality(delta) {
    quality.updateAdaptiveQuality(this.adaptiveQuality, delta, (level) =>
      this.applyQualityLevel(level)
    );
  }

  applyQualityLevel(level) {
    quality.applyQualityLevel(this.adaptiveQuality, level, {
      bloomPass: this.bloomPass,
      customFX: this.customFX,
      impactEffect: this.impactEffect,
      updateAsteroidShaderDetail: (detail) =>
        this.asteroidMaterials.updateAsteroidShaderDetail(detail),
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

    // F4: 30Hz fixed step with max 1 catch-up (decorative menu doesn't need 60Hz physics)
    this.world.step(1 / 30, delta, 1);

    this.asteroidField.updateAsteroids(delta);

    while (this.activeAsteroids.length < this.config.baseFieldCount) {
      this.spawnBeltAsteroid();
    }

    const timer = orbitCamera(this.camera, this.elapsedTime);

    // Aplicar camera shake ANTES do lookAt (offset à posição calculada)
    if (this.impactEffect) {
      this.impactEffect.updateCameraShake(delta);
    }

    this.camera.lookAt(0, 0, 0);

    this.hullPreview.update(
      delta,
      this.hangarOpen ? this.hangarStage : this.hullStage,
      this.hullReducedMotion
    );

    atmosphere.updateAtmosphere(
      this.nebulas,
      this.dustSystem,
      this.elapsedTime,
      delta
    );

    this.starfield.updateStarLayers(timer, this.elapsedTime);

    this.updateExplosions(delta);

    // Atualizar efeitos cinematográficos de impacto (flash, detritos, poeira)
    // Nota: camera shake é aplicado antes do lookAt (linhas acima)
    if (this.impactEffect) {
      this.impactEffect.update(delta);
    }

    // Procedural asteroid shader is optional; menu currently uses PBR materials.
    // Keep calls guarded to avoid unnecessary work.
    if (this.hasProceduralAsteroids) {
      this.asteroidMaterials.updateProceduralMaterialUniforms();
      this.asteroidMaterials.updateAsteroidShaderTime(this.elapsedTime);
    }

    if (this.customFX && this.customFX.uniforms) {
      this.customFX.uniforms.time.value = this.elapsedTime;
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    if (this.hangarOpen) {
      this.copyHangarStage();
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
    // A Hangar purchase may have unlocked the selected hull.
    this.syncHullPreview();
    if (this.clock) {
      this.clock.start();
      this.clock.getDelta();
    }
    this.elapsedTime = 0;
    this.rogueSpawnTimer = 0;
    this.animationFrame = requestAnimationFrame(this.animate);
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

    this.starfield.updateStarLayerSizes();
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

export default MenuBackgroundSystem;
