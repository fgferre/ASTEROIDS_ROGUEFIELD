// src/modules/MenuBackgroundSystem.js

class MenuBackgroundSystem {
  constructor() {
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

    this.config = {
      maxAsteroids: 80,
      baseFieldCount: 55,
      rogueSpawnInterval: 18,
      cullingDistanceSqr: 450 * 450,
      fadeOutDuration: 1.25,
    };

    this.handleResize = this.handleResize.bind(this);
    this.handleScreenChanged = this.handleScreenChanged.bind(this);
    this.animate = this.animate.bind(this);

    if (this.ready) {
      this.bootstrapScene();
      this.registerEventHooks();
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

    if (typeof gameServices !== 'undefined' && gameServices?.register) {
      gameServices.register('menu-background', this);
    }
  }

  bootstrapScene() {
    const { THREE, CANNON } = this;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x06122c, 0.0028);

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.getAspectRatio(),
      0.1,
      10000
    );
    this.camera.position.set(0, 40, 120);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x030a17, 1);
    this.renderer.shadowMap.enabled = true;

    this.world = new CANNON.World();
    this.world.gravity.set(0, 0, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 7;

    this.clock = new THREE.Clock();

    this.createLighting();
    this.createStarLayers();
    this.createBaseAssets(7);
    this.ensurePoolSize(this.config.maxAsteroids);
    this.prepareInitialField();
  }

  createLighting() {
    const { THREE } = this;
    const ambient = new THREE.AmbientLight(0x355a9a, 0.72);
    this.scene.add(ambient);

    const keyLight = new THREE.PointLight(0xf6fbff, 1.2, 1500, 1.4);
    keyLight.position.set(70, 90, 110);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x3a9eff, 0.55, 1400, 2);
    fillLight.position.set(-120, -30, -150);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xff9a64, 0.4, 900, 2.5);
    rimLight.position.set(40, -60, 160);
    this.scene.add(rimLight);
  }

  createStarLayers() {
    const { THREE } = this;
    const layerConfigs = [
      {
        count: 2200,
        radius: 540,
        size: 2.4,
        color: 0xb9ddff,
        opacity: 0.88,
        speedFactor: 0.003,
      },
      {
        count: 1600,
        radius: 420,
        size: 1.9,
        color: 0xdff4ff,
        opacity: 0.82,
        speedFactor: 0.006,
      },
      {
        count: 900,
        radius: 320,
        size: 1.4,
        color: 0xffffff,
        opacity: 0.78,
        speedFactor: 0.01,
      },
    ];

    this.starLayers = layerConfigs.map((config) => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(config.count * 3);

      for (let i = 0; i < config.count; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const radius =
          config.radius * Math.cbrt(Math.random() * 0.85 + 0.15);

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        const offset = i * 3;
        positions[offset] = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: config.color,
        size: config.size,
        transparent: true,
        opacity: config.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: false,
      });

      const mesh = new THREE.Points(geometry, material);
      this.scene.add(mesh);
      return { mesh, speedFactor: config.speedFactor };
    });
  }

  createBaseAssets(count = 6) {
    for (let i = 0; i < count; i += 1) {
      const geometry = this.createDeformedIcosahedron();
      this.baseGeometries.push(geometry);
      this.baseMaterials.push(this.createProceduralMaterial(Math.random() * 100));
    }
  }

  createDeformedIcosahedron(detailSeed = Math.random() * 100) {
    const { THREE } = this;
    const geometry = new THREE.IcosahedronGeometry(1, 4);
    const simplex = new SimplexNoise(() => detailSeed);
    const positions = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < positions.count; i += 1) {
      vertex.fromBufferAttribute(positions, i);

      let frequency = 0.9;
      let amplitude = 0.6;
      let noiseValue = 0;

      for (let octave = 0; octave < 4; octave += 1) {
        const sample = vertex.clone().multiplyScalar(frequency).addScalar(detailSeed);
        noiseValue += simplex.noise3d(sample.x, sample.y, sample.z) * amplitude;
        frequency *= 1.9;
        amplitude *= 0.55;
      }

      const displacement = 1 + noiseValue * 0.35;
      vertex.normalize().multiplyScalar(displacement);
      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    geometry.computeVertexNormals();
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
    const simplex = new SimplexNoise(() => seed);

    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) {
        const n = simplex.noise3d(x / 32, y / 32, seed) * 0.5 + 0.5;
        const shade = 90 + n * 120;
        const index = (x + y * size) * 4;
        imageData.data[index] = shade;
        imageData.data[index + 1] = shade * 0.92;
        imageData.data[index + 2] = shade * 0.85;
        imageData.data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.82,
      metalness: 0.2,
      bumpMap: texture,
      bumpScale: 0.08,
    });
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

    this.asteroidPool.push({
      mesh,
      body,
      active: false,
      fading: false,
      fadeElapsed: 0,
      material: null,
    });
  }

  prepareInitialField() {
    for (let i = 0; i < this.config.baseFieldCount; i += 1) {
      this.spawnBeltAsteroid();
    }
  }

  spawnBeltAsteroid() {
    const { THREE, CANNON } = this;
    const radius = 55 + Math.random() * 90;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 60;

    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    );

    const baseScale = Math.random() * 3 + 2;
    const scaleNoise = 0.65 + Math.random() * 0.7;
    const scale = new THREE.Vector3(
      baseScale * scaleNoise,
      baseScale * (0.8 + Math.random() * 0.4),
      baseScale * (0.85 + Math.random() * 0.5)
    );

    const orbitalSpeed = 12 + Math.random() * 10;
    const tangential = new CANNON.Vec3(-Math.sin(angle), 0, Math.cos(angle));
    tangential.scale(orbitalSpeed, tangential);
    tangential.y = (Math.random() - 0.5) * 4;

    const spin = new CANNON.Vec3(
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5
    );

    this.activateAsteroid({ position, scale, velocity: tangential, angularVelocity: spin });
  }

  spawnRogueAsteroid() {
    if (!this.activeAsteroids.length) {
      return;
    }

    const { THREE, CANNON } = this;
    const target = this.activeAsteroids[
      Math.floor(Math.random() * this.activeAsteroids.length)
    ];

    const spawnDirection = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize();

    const spawnDistance = 320;
    const position = spawnDirection.multiplyScalar(spawnDistance);

    const velocity = new CANNON.Vec3();
    target.body.position.vsub(
      new CANNON.Vec3(position.x, position.y, position.z),
      velocity
    );
    velocity.normalize();
    velocity.scale(70 + Math.random() * 20, velocity);

    const scaleValue = Math.random() * 4 + 3;
    const scale = new THREE.Vector3(
      scaleValue,
      scaleValue * (0.85 + Math.random() * 0.3),
      scaleValue * (0.9 + Math.random() * 0.25)
    );

    const angularVelocity = new CANNON.Vec3(
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 3
    );

    this.activateAsteroid({ position, scale, velocity, angularVelocity });
  }

  activateAsteroid({ position, scale, velocity, angularVelocity }) {
    const asteroid = this.getAsteroidFromPool();
    if (!asteroid) {
      return;
    }

    const { mesh, body } = asteroid;
    const geometry = this.baseGeometries[Math.floor(Math.random() * this.baseGeometries.length)];
    const baseMaterial =
      this.baseMaterials[Math.floor(Math.random() * this.baseMaterials.length)];

    mesh.geometry = geometry;
    if (!asteroid.material) {
      asteroid.material = baseMaterial.clone();
    } else {
      asteroid.material.copy(baseMaterial);
    }
    asteroid.material.transparent = true;
    asteroid.material.opacity = 1;
    asteroid.material.needsUpdate = true;
    mesh.material = asteroid.material;
    mesh.visible = true;
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    const avgRadius = (scale.x + scale.y + scale.z) / 3;
    if (body.shapes[0]) {
      body.shapes[0].radius = avgRadius;
      body.updateBoundingRadius();
    }

    body.mass = Math.max(0.5, Math.pow(avgRadius, 2.2));
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
    this.activeAsteroids.push(asteroid);
  }

  getAsteroidFromPool() {
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

  animate() {
    if (!this.isActive) {
      return;
    }

    this.animationFrame = requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.05);
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

    const orbitRadius = 85;
    const camY = Math.sin(this.elapsedTime * 0.4) * 18;
    this.camera.position.x = Math.cos(this.elapsedTime * 0.18) * orbitRadius;
    this.camera.position.z = Math.sin(this.elapsedTime * 0.18) * orbitRadius;
    this.camera.position.y = camY;
    this.camera.lookAt(0, 0, 0);

    this.starLayers.forEach((layer, index) => {
      const speed = layer.speedFactor;
      layer.mesh.rotation.y = this.elapsedTime * speed;
      layer.mesh.rotation.x = this.elapsedTime * speed * 0.35 + index * 0.2;
    });

    this.renderer.render(this.scene, this.camera);
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

    if (typeof gameEvents !== 'undefined' && gameEvents?.on) {
      gameEvents.on('screen-changed', this.handleScreenChanged);
    }
  }

  syncInitialState() {
    const screen = this.getCurrentScreen();
    if (!screen || screen === 'menu') {
      this.start();
    }
  }

  getCurrentScreen() {
    try {
      if (
        typeof gameServices !== 'undefined' &&
        gameServices?.has &&
        gameServices.has('game-state')
      ) {
        const state = gameServices.get('game-state');
        if (state && typeof state.getScreen === 'function') {
          return state.getScreen();
        }
      }
    } catch (error) {
      console.warn('[MenuBackgroundSystem] Unable to resolve current screen:', error);
    }
    return null;
  }

  getAspectRatio(width = window.innerWidth, height = window.innerHeight) {
    return height === 0 ? 1 : width / height;
  }
}

// Simplex noise implementation adapted for procedural asteroid generation
class SimplexNoise {
  constructor(randomFn = Math.random) {
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
    return (
      grad3[offset] * x +
      grad3[offset + 1] * y +
      grad3[offset + 2] * z
    );
  }
}

SimplexNoise.grad3 = new Float32Array([
  1,
  1,
  0,
  -1,
  1,
  0,
  1,
  -1,
  0,
  -1,
  -1,
  0,
  1,
  0,
  1,
  -1,
  0,
  1,
  1,
  0,
  -1,
  -1,
  0,
  -1,
  0,
  1,
  1,
  0,
  -1,
  1,
  0,
  1,
  -1,
  0,
  -1,
  -1,
]);

export default MenuBackgroundSystem;
