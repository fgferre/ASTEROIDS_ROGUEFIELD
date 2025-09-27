import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_URL = new URL(
  '../../assets/models/menu/menu-background.gltf',
  import.meta.url,
).href;

function safeRegisterService(name, instance) {
  if (
    typeof gameServices !== 'undefined' &&
    gameServices &&
    typeof gameServices.register === 'function'
  ) {
    gameServices.register(name, instance);
  }
}

class MenuBackgroundSystem {
  constructor() {
    safeRegisterService('menu-background', this);

    this.canvas = document.getElementById('menu-3d-canvas');
    this.fallbackElement = document.querySelector('[data-menu-background-fallback]');

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = new THREE.Clock();
    this.mixers = [];
    this.animationFrameId = null;
    this.modelGroup = null;
    this.starfield = null;
    this.isActive = false;
    this.isPaused = false;
    this.modelLoaded = false;
    this.wasPausedForVisibility = false;
    this.currentPixelRatio = 1;
    this.supported = false;

    this.renderLoop = this.renderLoop.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);

    if (!this.canvas) {
      this.updateFallback(
        'Canvas do menu 3D não encontrado. Experiência padrão ativada.',
      );
      return;
    }

    this.setFallbackVisible(true);
    this.updateFallback('Preparando visual interativo do hangar espacial...');

    this.supported = this.checkWebGLSupport();
    if (!this.supported) {
      this.updateFallback(
        'Seu dispositivo não suporta o visual 3D. O menu permanece totalmente funcional.',
      );
      this.canvas.style.display = 'none';
      return;
    }

    try {
      this.initializeRenderer();
      this.initializeScene();
      this.loadModel();

      window.addEventListener('resize', this.handleResize, { passive: true });
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    } catch (error) {
      console.error('[MenuBackgroundSystem] Falha ao inicializar', error);
      this.updateFallback('Não foi possível iniciar o visual 3D do menu.');
      this.dispose();
    }
  }

  checkWebGLSupport() {
    try {
      const context =
        this.canvas.getContext('webgl2', { depth: false }) ||
        this.canvas.getContext('webgl', { depth: false }) ||
        this.canvas.getContext('experimental-webgl');
      if (context && typeof context.getParameter === 'function') {
        return true;
      }
    } catch (error) {
      console.warn('[MenuBackgroundSystem] WebGL não disponível', error);
    }
    return false;
  }

  initializeRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.currentPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.handleResize();
  }

  initializeScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050b18, 0.035);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    this.camera.position.set(0, 0.6, 6);
    this.camera.lookAt(0, 0.2, 0);

    this.setupLights();
    this.createStarfield();
  }

  setupLights() {
    const ambient = new THREE.AmbientLight(0x4460ff, 0.55);
    this.scene.add(ambient);

    const mainLight = new THREE.DirectionalLight(0x6ea8ff, 1.2);
    mainLight.position.set(4.5, 6, 6.5);
    this.scene.add(mainLight);

    const rimLight = new THREE.PointLight(0xff6fb7, 1.05, 22, 2);
    rimLight.position.set(-6, 2, -5);
    this.scene.add(rimLight);

    const fillLight = new THREE.PointLight(0x48ffc2, 0.8, 18, 2);
    fillLight.position.set(2.5, -1.5, 5.5);
    this.scene.add(fillLight);
  }

  createStarfield() {
    const starCount = 420;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const colorA = new THREE.Color(0x89caff);
    const colorB = new THREE.Color(0xff9edb);

    for (let i = 0; i < starCount; i += 1) {
      const radius = 10 + Math.random() * 24;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const index = i * 3;
      positions[index] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index + 1] = radius * Math.cos(phi) * 0.6;
      positions[index + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const lerpColor = colorA.clone().lerp(colorB, Math.random() * 0.8);
      colors[index] = lerpColor.r;
      colors[index + 1] = lerpColor.g;
      colors[index + 2] = lerpColor.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.04,
      sizeAttenuation: true,
      depthWrite: false,
      transparent: true,
      opacity: 0.82,
    });

    this.starfield = new THREE.Points(geometry, material);
    this.scene.add(this.starfield);
  }

  loadModel() {
    const loader = new GLTFLoader();

    loader.load(
      MODEL_URL,
      (gltf) => {
        this.modelGroup = gltf.scene;
        this.modelGroup.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            if (child.material) {
              child.material.transparent = true;
              child.material.depthWrite = false;
            }
          }
        });
        this.modelGroup.scale.setScalar(1.1);
        this.modelGroup.position.set(0, -0.4, 0);
        this.modelGroup.rotation.set(0, Math.PI * 0.25, 0);
        this.scene.add(this.modelGroup);

        if (Array.isArray(gltf.animations) && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(this.modelGroup);
          gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip);
            action.clampWhenFinished = false;
            action.play();
          });
          this.mixers.push(mixer);
        }

        this.modelLoaded = true;
        this.setFallbackVisible(false);
      },
      undefined,
      (error) => {
        console.error('[MenuBackgroundSystem] Falha ao carregar modelo 3D', error);
        this.updateFallback(
          'Não foi possível carregar o visual 3D do menu. Recarregue para tentar novamente.',
        );
        this.setFallbackVisible(true);
      },
    );
  }

  start() {
    if (!this.renderer || !this.scene || !this.camera || !this.supported) {
      return;
    }

    if (this.isActive && !this.isPaused) {
      return;
    }

    this.isActive = true;
    this.isPaused = false;
    this.clock.start();
    this.clock.getDelta();
    this.handleResize();

    if (this.modelLoaded) {
      this.setFallbackVisible(false);
    }

    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(this.renderLoop);
    }
  }

  stop() {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.isPaused = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.clock.stop();

    if (this.renderer) {
      this.renderer.clear(true, true, true);
    }
  }

  pause() {
    if (!this.isActive || this.isPaused) {
      return;
    }

    this.isPaused = true;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  resume() {
    if (!this.isActive || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    this.clock.getDelta();

    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(this.renderLoop);
    }
  }

  renderLoop() {
    if (!this.isActive || this.isPaused) {
      return;
    }

    const delta = this.clock.getDelta();

    this.mixers.forEach((mixer) => mixer.update(delta));

    if (this.modelGroup) {
      this.modelGroup.rotation.y += delta * 0.12;
    }

    if (this.starfield) {
      this.starfield.rotation.y += delta * 0.02;
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }

    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  }

  handleResize() {
    if (!this.renderer || !this.camera || !this.canvas) {
      return;
    }

    const { clientWidth, clientHeight } = this.canvas;
    const width = clientWidth || this.canvas.parentElement?.clientWidth || window.innerWidth;
    const height = clientHeight || this.canvas.parentElement?.clientHeight || window.innerHeight;

    const desiredPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (desiredPixelRatio !== this.currentPixelRatio) {
      this.currentPixelRatio = desiredPixelRatio;
      this.renderer.setPixelRatio(this.currentPixelRatio);
    }

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  handleVisibilityChange() {
    if (!this.isActive) {
      return;
    }

    if (document.visibilityState === 'hidden') {
      this.wasPausedForVisibility = !this.isPaused;
      this.pause();
    } else if (this.wasPausedForVisibility) {
      this.wasPausedForVisibility = false;
      this.resume();
    }
  }

  updateFallback(message) {
    if (this.fallbackElement) {
      this.fallbackElement.textContent = message;
    }
  }

  setFallbackVisible(isVisible) {
    if (this.fallbackElement) {
      this.fallbackElement.hidden = !isVisible;
    }
  }

  dispose() {
    this.stop();

    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    if (this.starfield) {
      this.starfield.geometry?.dispose();
      this.starfield.material?.dispose?.();
      this.starfield = null;
    }

    if (this.scene) {
      this.scene.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose?.();
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material?.dispose?.());
          } else {
            child.material?.dispose?.();
          }
        }
      });
    }

    this.mixers = [];
    this.modelGroup = null;

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.scene = null;
    this.camera = null;
  }
}

export default MenuBackgroundSystem;
