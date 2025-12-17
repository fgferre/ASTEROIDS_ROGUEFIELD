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
      this.bootstrapScene();
      this.registerEventHooks();
      this.setupSettingsSubscription();
      this.syncInitialState();
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

  bootstrapScene() {
    const { THREE, CANNON } = this;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000104, 0.008);

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.getAspectRatio(),
      0.1,
      10000
    );
    this.camera.position.set(0, 0, 100);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
    });
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

    this.createLighting();
    this.createStarLayers();
    this.createBaseAssets(5);
    this.updateNormalIntensity(this.normalIntensity);
    this.ensurePoolSize(this.config.maxAsteroids);
    this.prepareInitialField();
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
    const ambient = new THREE.AmbientLight(0x405060, 0.5);
    this.scene.add(ambient);

    const keyLight = new THREE.PointLight(0xffffff, 1, 1000);
    keyLight.position.set(80, 80, 80);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x00aaff, 0.3, 1000);
    fillLight.position.set(-100, -50, -100);
    this.scene.add(fillLight);
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
        transparent: true,
        opacity: this.randomFloat('starfield') * 0.35 + 0.55,
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

  createDeformedIcosahedron(detailSeed = this.randomFloat('assets') * 100) {
    const { THREE } = this;
    const geometry = new THREE.IcosahedronGeometry(1, 5);
    const simplex = new SimplexNoise(this.createRandomGenerator(detailSeed));
    const positions = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const temp = new THREE.Vector3();
    const noiseScale = this.randomFloat('assets') * 0.2 + 0.2;
    const distortion = this.randomFloat('assets') * 0.3 + 0.2;

    for (let i = 0; i < positions.count; i += 1) {
      vertex.fromBufferAttribute(positions, i);

      let totalNoise = 0;
      let frequency = noiseScale;
      let amplitude = 1;

      for (let octave = 0; octave < 4; octave += 1) {
        temp.copy(vertex).multiplyScalar(frequency).addScalar(detailSeed);
        totalNoise += simplex.noise3d(temp.x, temp.y, temp.z) * amplitude;
        frequency *= 2;
        amplitude *= 0.5;
      }

      vertex.normalize().multiplyScalar(1 + totalNoise * distortion);
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

  createProceduralMaterial(seed) {
    const { THREE } = this;
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    const simplex = new SimplexNoise(this.createRandomGenerator(seed));
    const heightData = new Float32Array(size * size);

    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) {
        let amplitude = 1;
        let frequency = 1;
        let totalAmplitude = 0;
        let noiseValue = 0;

        for (let octave = 0; octave < 4; octave += 1) {
          noiseValue +=
            simplex.noise3d(
              (x / size) * frequency + seed * 0.37,
              (y / size) * frequency + seed * 0.53,
              seed * 0.19 + octave * 13.37
            ) * amplitude;
          totalAmplitude += amplitude;
          amplitude *= 0.55;
          frequency *= 2;
        }

        const normalized = noiseValue / totalAmplitude;
        const value = normalized * 0.5 + 0.5;
        heightData[x + y * size] = value;

        const base = 72 + value * 75;
        const r = Math.max(0, Math.min(255, base + value * 18));
        const g = Math.max(0, Math.min(255, base));
        const b = Math.max(0, Math.min(255, base - value * 20));
        const index = (x + y * size) * 4;
        imageData.data[index] = r;
        imageData.data[index + 1] = g;
        imageData.data[index + 2] = b;
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

    const normalData = new Uint8Array(size * size * 4);
    const normalStrength = 4;
    const sampleHeight = (sx, sy) => {
      const xIndex = Math.max(0, Math.min(size - 1, sx));
      const yIndex = Math.max(0, Math.min(size - 1, sy));
      return heightData[xIndex + yIndex * size];
    };

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const left = sampleHeight(x - 1, y);
        const right = sampleHeight(x + 1, y);
        const up = sampleHeight(x, y - 1);
        const down = sampleHeight(x, y + 1);

        const dx = (right - left) * normalStrength;
        const dy = (down - up) * normalStrength;
        const nx = -dx;
        const ny = -dy;
        const nz = 1;
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
      roughness: 0.9,
      metalness: 0.05,
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

  applyEdgeFeather(material) {
    if (!material) {
      return;
    }

    if (!material.userData) {
      material.userData = {};
    }

    if (material.userData.edgeFeatherApplied) {
      return;
    }

    material.userData.edgeFeatherApplied = true;
    material.transparent = true;
    material.dithering = true;

    const uniforms = {
      edgeFeatherStrength: { value: 0.55 },
      edgeFeatherPower: { value: 1.6 },
    };

    material.onBeforeCompile = (shader) => {
      shader.uniforms.edgeFeatherStrength = uniforms.edgeFeatherStrength;
      shader.uniforms.edgeFeatherPower = uniforms.edgeFeatherPower;
      shader.fragmentShader = shader.fragmentShader.replace(
        'uniform float opacity;',
        'uniform float opacity;\nuniform float edgeFeatherStrength;\nuniform float edgeFeatherPower;'
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>\n` +
          'float viewDot = dot(normalize(vNormal), normalize(-vViewPosition));\n' +
          'float fresnel = pow(1.0 - abs(viewDot), edgeFeatherPower);\n' +
          'fresnel = smoothstep(0.0, 1.0, fresnel);\n' +
          'float alphaFeather = clamp(1.0 - fresnel * edgeFeatherStrength, 0.35, 1.0);\n' +
          'diffuseColor.a *= alphaFeather;\n'
      );
    };

    material.customProgramCacheKey = () => 'menu-background-asteroid-feather';
    material.needsUpdate = true;
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
    const baseMaterial =
      this.baseMaterials[
        Math.floor(this.randomFloat('asteroids') * this.baseMaterials.length)
      ];

    mesh.geometry = geometry;
    if (!asteroid.material) {
      asteroid.material = baseMaterial.clone();
    } else {
      asteroid.material.copy(baseMaterial);
    }
    asteroid.material.userData = Object.assign({}, baseMaterial.userData || {});
    this.applyNormalIntensityToMaterial(asteroid.material);
    this.applyEdgeFeather(asteroid.material);
    asteroid.material.transparent = true;
    asteroid.material.opacity = 1;
    asteroid.material.needsUpdate = true;
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
    this.camera.position.x = Math.cos(timer) * orbitalRadius;
    this.camera.position.z = Math.sin(timer) * orbitalRadius;
    this.camera.position.y = Math.sin(timer * 0.7) * 15;
    this.camera.lookAt(0, 0, 0);

    this.starLayers.forEach((layer) => {
      layer.mesh.rotation.y = -timer * layer.speedFactor;
    });

    this.updateExplosions(delta);
    this.renderer.render(this.scene, this.camera);
    if (this.stats) {
      this.stats.end();
    }
  }

  start() {
    if (!this.ready || this.isActive) {
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
}

SimplexNoise.grad3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0,
  -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

export default MenuBackgroundSystem;
