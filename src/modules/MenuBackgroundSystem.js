import * as THREE from 'three';
import { Body, Sphere, Vec3, World } from 'cannon-es';

const ASTEROID_COUNT = 36;
const FIELD_RADIUS = 140;
const MIN_SCALE = 2.5;
const MAX_SCALE = 7.5;
const CAMERA_ORBIT_RADIUS = 85;
const CAMERA_VERTICAL_SWAY = 18;
const CAMERA_SPEED = 0.25;
const WORLD_STEP = 1 / 60;
const RESPAWN_RADIUS = 220;
const RESPAWN_BUFFER = 40;

function createAsteroidGeometry(size) {
  const geometry = new THREE.IcosahedronGeometry(size, 1);
  const positionAttribute = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < positionAttribute.count; i += 1) {
    vertex.fromBufferAttribute(positionAttribute, i);
    const offset = 0.75 + Math.random() * 0.45;
    vertex.multiplyScalar(offset);
    positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function createAsteroidMaterial() {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x8fb3ff).offsetHSL((Math.random() - 0.5) * 0.15, 0.1, 0),
    emissive: new THREE.Color(0x0a1a3a),
    metalness: 0.35,
    roughness: 0.8,
    flatShading: true,
  });
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

class MenuBackgroundSystem {
  constructor() {
    this.canvas = document.getElementById('menu-background-canvas');
    if (!this.canvas) {
      console.warn('[MenuBackgroundSystem] Canvas not found');
      return;
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x00000a);
    this.scene.fog = new THREE.FogExp2(0x02040c, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );
    this.camera.position.set(0, 16, CAMERA_ORBIT_RADIUS);

    this.clock = new THREE.Clock();
    this.animationHandle = null;
    this.isRunning = false;

    this.world = new World({ gravity: new Vec3(0, 0, 0) });
    this.asteroids = [];
    this.tmpForce = new Vec3();
    this.tmpSwirl = new Vec3();
    this.lookAtTarget = new THREE.Vector3();

    this.setupLighting();
    this.createStarfield();
    this.spawnAsteroids();

    this.animate = this.animate.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleScreenChange = this.handleScreenChange.bind(this);

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    if (typeof gameEvents !== 'undefined') {
      gameEvents.on('screen-changed', this.handleScreenChange);
    }

    if (typeof gameServices !== 'undefined') {
      gameServices.register('menu-background', this);
    }

    if (!document.getElementById('menu-screen')?.classList.contains('hidden')) {
      this.start();
    }
  }

  setupLighting() {
    const ambient = new THREE.AmbientLight(0x1c2942, 1.2);
    this.scene.add(ambient);

    const fill = new THREE.PointLight(0x2f8cff, 2, 260, 2);
    fill.position.set(-60, 40, 10);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0xff9966, 1.4, 220, 2.5);
    rim.position.set(70, -30, -40);
    this.scene.add(rim);
  }

  createStarfield() {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 600;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const radius = randomInRange(60, 200);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const starMaterial = new THREE.PointsMaterial({
      size: 1.8,
      sizeAttenuation: true,
      color: new THREE.Color(0x93d7ff),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.starfield = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.starfield);
  }

  spawnAsteroids() {
    for (let i = 0; i < ASTEROID_COUNT; i += 1) {
      const scale = randomInRange(MIN_SCALE, MAX_SCALE);
      const geometry = createAsteroidGeometry(scale);
      const material = createAsteroidMaterial();
      const mesh = new THREE.Mesh(geometry, material);

      const angle = Math.random() * Math.PI * 2;
      const distance = randomInRange(FIELD_RADIUS * 0.3, FIELD_RADIUS);
      const height = randomInRange(-35, 35);
      mesh.position.set(
        Math.cos(angle) * distance,
        height,
        Math.sin(angle) * distance,
      );
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      this.scene.add(mesh);

      const body = new Body({
        mass: 1,
        shape: new Sphere(scale * 0.6),
        position: new Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
      });

      const drift = new Vec3(
        randomInRange(-2, 2),
        randomInRange(-1.5, 1.5),
        randomInRange(-2, 2),
      );
      body.velocity.copy(drift);

      const angular = new Vec3(
        randomInRange(-1.5, 1.5),
        randomInRange(-1.5, 1.5),
        randomInRange(-1.5, 1.5),
      );
      body.angularVelocity.copy(angular);

      this.world.addBody(body);

      this.asteroids.push({ mesh, body });
    }
  }

  handleScreenChange(payload) {
    if (!payload) return;
    if (payload.screen === 'menu') {
      this.start();
    } else {
      this.stop();
    }
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.stop();
    } else if (!document.getElementById('menu-screen')?.classList.contains('hidden')) {
      this.start();
    }
  }

  handleResize() {
    if (!this.renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.isRunning || !this.renderer) {
      return;
    }
    this.isRunning = true;
    this.clock.getDelta();
    this.animationHandle = requestAnimationFrame(this.animate);
  }

  stop() {
    this.isRunning = false;
    if (this.animationHandle) {
      cancelAnimationFrame(this.animationHandle);
      this.animationHandle = null;
    }
  }

  animate() {
    if (!this.isRunning) {
      return;
    }

    this.animationHandle = requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.world.step(WORLD_STEP, delta, 3);

    this.asteroids.forEach((asteroid) => {
      const { mesh, body } = asteroid;
      const radius = body.position.length();
      if (radius > RESPAWN_RADIUS) {
        const factor = FIELD_RADIUS - RESPAWN_BUFFER;
        const angle = Math.random() * Math.PI * 2;
        const height = randomInRange(-30, 30);
        body.position.set(
          Math.cos(angle) * factor,
          height,
          Math.sin(angle) * factor,
        );
        body.velocity.set(
          randomInRange(-2, 2),
          randomInRange(-1.5, 1.5),
          randomInRange(-2, 2),
        );
      }

      this.tmpForce.copy(body.position).scale(-0.2);
      body.applyForce(this.tmpForce);

      this.tmpSwirl.set(-body.position.z, 0, body.position.x).scale(0.12);
      body.applyForce(this.tmpSwirl);

      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    });

    const elapsed = this.clock.elapsedTime * CAMERA_SPEED;
    this.camera.position.x = Math.cos(elapsed) * CAMERA_ORBIT_RADIUS;
    this.camera.position.z = Math.sin(elapsed) * CAMERA_ORBIT_RADIUS;
    this.camera.position.y = Math.sin(elapsed * 0.6) * CAMERA_VERTICAL_SWAY;
    this.camera.lookAt(this.lookAtTarget);

    if (this.starfield) {
      this.starfield.rotation.y -= delta * 0.05;
      this.starfield.rotation.x += delta * 0.02;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

export default MenuBackgroundSystem;
