// src/modules/menu/asteroidField.js
//
// The menu's asteroid field: a pool of rocks (Three mesh + Cannon body) in a
// belt around the origin, a rogue thrown at it every few seconds, rocks that
// split when they hit hard enough (a flash of light and the cinematic impact
// FX), fade out when they drift away and are replaced to keep the belt full;
// plus the warm-up that renders the first impact before the menu shows.
// MenuBackgroundSystem keeps the field's state and hands this module a kit
// of live getters; the bodies came from it unchanged.

/**
 * @param {object} kit - live getters THREE, CANNON, scene, world, config,
 *   renderer, camera, composer, customFX, elapsedTime, impactEffect, the
 *   lists asteroidPool, activeAsteroids, objectsToDeactivate, baseGeometries,
 *   baseMaterials, explosions, explosionLightPool, proceduralAsteroidCount
 *   and hasProceduralAsteroids (both settable); randomFloat(fork) and
 *   withSeededMathRandom(fn).
 */
export function createMenuAsteroidField(kit) {
  let spawnedBeltAsteroids = 0;
  // F10: reusable temporaries for hot paths (fragmentAsteroid, etc.)
  let tmpVec3 = null; // initialized when THREE is available
  let tmpCannonVec3 = null;

  function createTemporaries() {
    const { THREE, CANNON } = kit;
    tmpVec3 = new THREE.Vector3();
    tmpCannonVec3 = new CANNON.Vec3();
  }

  function ensurePoolSize(size) {
    while (kit.asteroidPool.length < size) {
      createPoolableAsteroid();
    }
  }

  function createPoolableAsteroid() {
    const { THREE, CANNON } = kit;
    const mesh = new THREE.Mesh();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    kit.scene.add(mesh);

    const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(1) });
    body.sleep();
    kit.world.addBody(body);

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
      handleBodyCollision(event, asteroid);
    });

    kit.asteroidPool.push(asteroid);
  }

  function prepareInitialField() {
    const largeCount = Math.min(20, kit.config.baseFieldCount);
    for (let i = 0; i < kit.config.baseFieldCount; i += 1) {
      spawnBeltAsteroid({ forceLarge: i < largeCount });
    }
  }

  function spawnBeltAsteroid({ forceLarge = false } = {}) {
    const { THREE, CANNON } = kit;
    spawnedBeltAsteroids += 1;

    const belt = { innerRadius: 40, outerRadius: 150, height: 30 };
    const angle = kit.randomFloat('belt') * Math.PI * 2;
    const radius =
      belt.innerRadius +
      kit.randomFloat('belt') * (belt.outerRadius - belt.innerRadius);
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      (kit.randomFloat('belt') - 0.5) * belt.height,
      Math.sin(angle) * radius
    );

    const shouldSpawnLarge =
      forceLarge ||
      spawnedBeltAsteroids <= 20 ||
      kit.randomFloat('belt') < 0.25;
    const scaleVal = shouldSpawnLarge
      ? kit.randomFloat('belt') * 5 + 5
      : kit.randomFloat('belt') * 3 + 2;
    const scaleJitter = 1 + (kit.randomFloat('belt') - 0.5) * 0.8;
    const scale = new THREE.Vector3(
      scaleVal,
      scaleVal,
      scaleVal
    ).multiplyScalar(scaleJitter);

    const velocity = new CANNON.Vec3(
      (kit.randomFloat('belt') - 0.5) * 2,
      (kit.randomFloat('belt') - 0.5) * 2,
      (kit.randomFloat('belt') - 0.5) * 2
    );

    const angularVelocity = new CANNON.Vec3(
      (kit.randomFloat('belt') - 0.5) * 1,
      (kit.randomFloat('belt') - 0.5) * 1,
      (kit.randomFloat('belt') - 0.5) * 1
    );

    activateAsteroid({
      position,
      scale,
      velocity,
      angularVelocity,
    });
  }

  function spawnRogueAsteroid() {
    if (!kit.activeAsteroids.length) {
      return;
    }

    const { THREE, CANNON } = kit;
    const target =
      kit.activeAsteroids[
        Math.floor(kit.randomFloat('asteroids') * kit.activeAsteroids.length)
      ];

    const spawnDirection = new THREE.Vector3(
      kit.randomFloat('asteroids') - 0.5,
      kit.randomFloat('asteroids') - 0.5,
      kit.randomFloat('asteroids') - 0.5
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

    // Non-uniform scaling fights the spherical-domain procedural shader and
    // makes the material look "stretched". Keep uniform scale (study parity).
    const scaleValue = kit.randomFloat('asteroids') * 4 + 4;
    const scale = new THREE.Vector3(scaleValue, scaleValue, scaleValue);

    const angularVelocity = new CANNON.Vec3(
      (kit.randomFloat('asteroids') - 0.5) * 3,
      (kit.randomFloat('asteroids') - 0.5) * 3,
      (kit.randomFloat('asteroids') - 0.5) * 3
    );

    activateAsteroid({ position, scale, velocity, angularVelocity });
  }

  function activateAsteroid({
    position,
    scale,
    velocity,
    angularVelocity,
    fragmentationLevel = 0,
  }) {
    const asteroid = getAsteroidFromPool();
    if (!asteroid) {
      return;
    }

    const { mesh, body } = asteroid;
    const geometry =
      kit.baseGeometries[
        Math.floor(kit.randomFloat('asteroids') * kit.baseGeometries.length)
      ];

    mesh.geometry = geometry;

    // Single-technique policy: all menu asteroids use the same procedural PBR
    // material family (triplanar 3D noise), with seed-driven variations.
    if (
      !asteroid.material ||
      !asteroid.material.userData?.isProceduralAsteroid
    ) {
      const material =
        kit.baseMaterials[
          Math.floor(kit.randomFloat('materials') * kit.baseMaterials.length)
        ];
      asteroid.material = material;
    }

    mesh.material = asteroid.material;
    mesh.visible = true;
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    mesh.rotation.set(
      kit.randomFloat('asteroids') * Math.PI,
      kit.randomFloat('asteroids') * Math.PI,
      kit.randomFloat('asteroids') * Math.PI
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
    kit.activeAsteroids.push(asteroid);
    if (asteroid.material?.userData?.isProceduralAsteroid) {
      kit.proceduralAsteroidCount += 1;
      kit.hasProceduralAsteroids = true;
    }
  }

  function getAsteroidFromPool() {
    if (kit.activeAsteroids.length >= kit.config.maxAsteroids) {
      return null;
    }

    const idle = kit.asteroidPool.find((item) => !item.active);
    if (idle) {
      return idle;
    }

    if (kit.asteroidPool.length < kit.config.maxAsteroids) {
      kit.withSeededMathRandom(() => createPoolableAsteroid());
      return kit.asteroidPool[kit.asteroidPool.length - 1];
    }

    return null;
  }

  function deactivateAsteroid(asteroid) {
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

    // Restore shared material and dispose fade clone
    if (asteroid._fadeClonedMaterial && asteroid._sharedMaterial) {
      asteroid.material.dispose();
      asteroid.material = asteroid._sharedMaterial;
      asteroid.mesh.material = asteroid._sharedMaterial;
      asteroid._sharedMaterial = null;
      asteroid._fadeClonedMaterial = false;
    }
    if (asteroid.material) {
      asteroid.material.opacity = 1;
    }

    if (asteroid.material?.userData?.isProceduralAsteroid) {
      kit.proceduralAsteroidCount = Math.max(
        0,
        kit.proceduralAsteroidCount - 1
      );
    }

    const index = kit.activeAsteroids.indexOf(asteroid);
    if (index >= 0) {
      kit.activeAsteroids.splice(index, 1);
    }

    kit.hasProceduralAsteroids = kit.proceduralAsteroidCount > 0;
  }

  function startFadeOut(asteroid) {
    if (!asteroid.fading) {
      asteroid.fading = true;
      asteroid.fadeElapsed = 0;

      // Clone shared material so fade opacity doesn't contaminate other asteroids
      // that share the same baseMaterials[] entry.
      if (asteroid.material && !asteroid._fadeClonedMaterial) {
        asteroid._sharedMaterial = asteroid.material;
        const cloned = kit.withSeededMathRandom(() =>
          asteroid.material.clone()
        );
        cloned.transparent = true;
        cloned.opacity = 1;
        asteroid.material = cloned;
        asteroid.mesh.material = cloned;
        asteroid._fadeClonedMaterial = true;
      }
    }
  }

  function handleBodyCollision(event, asteroid) {
    if (!asteroid?.active) {
      return;
    }

    if (asteroid.fragmentationLevel >= kit.config.maxFragmentationLevel) {
      return;
    }

    const impact =
      typeof event?.contact?.getImpactVelocityAlongNormal === 'function'
        ? event.contact.getImpactVelocityAlongNormal()
        : 0;

    if (impact <= kit.config.fragmentationThreshold) {
      return;
    }

    createExplosion(asteroid.mesh.position);

    // Disparar efeitos cinematográficos de impacto
    if (kit.impactEffect) {
      kit.impactEffect.trigger(asteroid.mesh.position.clone(), impact);
    }

    fragmentAsteroid(asteroid);
    kit.objectsToDeactivate.push(asteroid);
  }

  function fragmentAsteroid(parent) {
    const radius = parent.body.shapes[0]?.radius || 1;
    const fragments = Math.floor(kit.randomFloat('fragments') * 3) + 2;
    // F10: reuse temporaries instead of allocating per fragment
    const direction = tmpVec3;
    const offset = new kit.THREE.Vector3(); // one alloc for the whole loop
    const impulse = tmpCannonVec3;

    for (let i = 0; i < fragments; i += 1) {
      const scaleMultiplier = kit.randomFloat('fragments') * 0.3 + 0.4;
      const sx = parent.mesh.scale.x * scaleMultiplier;
      const sy = parent.mesh.scale.y * scaleMultiplier;
      const sz = parent.mesh.scale.z * scaleMultiplier;

      if (sx < 1 && sy < 1 && sz < 1) {
        continue;
      }

      direction
        .set(
          kit.randomFloat('fragments') - 0.5,
          kit.randomFloat('fragments') - 0.5,
          kit.randomFloat('fragments') - 0.5
        )
        .normalize();

      offset.copy(parent.mesh.position).addScaledVector(direction, radius);

      impulse.set(direction.x * 15, direction.y * 15, direction.z * 15);

      const avx = (kit.randomFloat('fragments') - 0.5) * 5;
      const avy = (kit.randomFloat('fragments') - 0.5) * 5;
      const avz = (kit.randomFloat('fragments') - 0.5) * 5;

      activateAsteroid({
        position: offset,
        scale: { x: sx, y: sy, z: sz },
        velocity: {
          x: parent.body.velocity.x + impulse.x,
          y: parent.body.velocity.y + impulse.y,
          z: parent.body.velocity.z + impulse.z,
        },
        angularVelocity: { x: avx, y: avy, z: avz },
        fragmentationLevel: parent.fragmentationLevel + 1,
      });
    }
  }

  function createExplosion(position) {
    // F9: reuse pooled PointLight instead of allocating new one
    let light = kit.explosionLightPool.pop();
    if (!light) {
      // Pool exhausted — fall back to allocation (rare)
      const { THREE } = kit;
      light = kit.withSeededMathRandom(
        () => new THREE.PointLight(0xffaa66, 3.5, 140, 2)
      );
      kit.scene.add(light);
    } else {
      light.intensity = 3.5;
      light.distance = 140;
      light.visible = true;
    }
    light.position.copy(position);

    kit.explosions.push({
      light,
      life: 0.4,
      maxLife: 0.4,
      initialIntensity: 3.5,
      initialDistance: 140,
    });
  }

  async function warmupFirstImpactPath() {
    const { THREE } = kit;
    if (
      !THREE ||
      !kit.impactEffect ||
      !kit.renderer ||
      !kit.scene ||
      !kit.camera ||
      kit.activeAsteroids.length === 0
    ) {
      return;
    }

    const waitForFrame = () =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const warmupPosition = new THREE.Vector3(0, 0, 0);

    try {
      // Match the expensive first real impact: pooled impact FX plus the
      // transient explosion light that changes the active light count.
      kit.impactEffect.trigger(
        warmupPosition,
        kit.config.fragmentationThreshold + 10
      );
      createExplosion(warmupPosition);

      await waitForFrame();
      renderWarmupFrame();
      await waitForFrame();
      renderWarmupFrame();
    } finally {
      kit.impactEffect.cleanup();
      clearActiveExplosions();
    }
  }

  function renderWarmupFrame() {
    if (!kit.renderer || !kit.scene || !kit.camera) {
      return;
    }

    if (kit.customFX?.uniforms?.time) {
      kit.customFX.uniforms.time.value = kit.elapsedTime;
    }

    kit.camera.lookAt(0, 0, 0);

    if (kit.composer) {
      kit.composer.render();
      return;
    }

    kit.renderer.render(kit.scene, kit.camera);
  }

  function clearActiveExplosions() {
    while (kit.explosions.length) {
      const explosion = kit.explosions.pop();
      if (explosion?.light) {
        explosion.light.intensity = 0;
        explosion.light.visible = false;
        kit.explosionLightPool.push(explosion.light);
      }
    }
  }

  function updateExplosions(delta) {
    for (let i = kit.explosions.length - 1; i >= 0; i -= 1) {
      const explosion = kit.explosions[i];
      explosion.life -= delta;

      const progress = Math.max(explosion.life, 0) / explosion.maxLife;
      explosion.light.intensity = explosion.initialIntensity * progress;
      explosion.light.distance =
        explosion.initialDistance * (0.7 + progress * 0.3);

      if (explosion.life <= 0) {
        // F9: return light to pool instead of removing from scene
        explosion.light.intensity = 0;
        explosion.light.visible = false;
        kit.explosionLightPool.push(explosion.light);
        kit.explosions.splice(i, 1);
      }
    }
  }

  // Per frame, after the physics step: meshes follow their bodies, rocks
  // past the culling distance fade out, faded and split rocks go back to
  // the pool.
  function updateAsteroids(delta) {
    for (let i = kit.activeAsteroids.length - 1; i >= 0; i -= 1) {
      const asteroid = kit.activeAsteroids[i];
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

      if (distanceSqr > kit.config.cullingDistanceSqr) {
        startFadeOut(asteroid);
      }

      if (asteroid.fading) {
        asteroid.fadeElapsed += delta;
        const fadeProgress = Math.min(
          asteroid.fadeElapsed / kit.config.fadeOutDuration,
          1
        );
        if (asteroid.material) {
          asteroid.material.opacity = 1 - fadeProgress;
          asteroid.material.needsUpdate = true;
        }

        if (fadeProgress >= 1) {
          kit.objectsToDeactivate.push(asteroid);
        }
      }
    }

    while (kit.objectsToDeactivate.length) {
      deactivateAsteroid(kit.objectsToDeactivate.pop());
    }
  }

  return {
    createTemporaries,
    ensurePoolSize,
    createPoolableAsteroid,
    prepareInitialField,
    spawnBeltAsteroid,
    spawnRogueAsteroid,
    activateAsteroid,
    getAsteroidFromPool,
    deactivateAsteroid,
    startFadeOut,
    handleBodyCollision,
    fragmentAsteroid,
    createExplosion,
    warmupFirstImpactPath,
    renderWarmupFrame,
    clearActiveExplosions,
    updateExplosions,
    updateAsteroids,
  };
}
