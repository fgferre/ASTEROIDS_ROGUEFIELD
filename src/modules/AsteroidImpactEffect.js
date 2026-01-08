// src/modules/AsteroidImpactEffect.js
// Sistema cinematográfico de efeitos de colisão para asteroides do menu background
// Com PRE-LOADING completo para evitar microtravamentos

import { DustParticleShader } from './DustParticleShader.js';

// Configuração de pools (pré-alocados)
const POOL_CONFIG = {
  maxFlashes: 5,           // Máximo de flashes simultâneos
  maxDebrisFields: 3,      // Máximo de campos de detritos simultâneos
  maxDustClouds: 3,        // Máximo de nuvens de poeira simultâneas
  debrisPerField: 150,     // Partículas por campo (usa o máximo, esconde as extras)
  dustPerCloud: 120        // Partículas por nuvem (usa o máximo, esconde as extras)
};

export class AsteroidImpactEffect {
  constructor(THREE, scene, camera, config = {}) {
    this.THREE = THREE;
    this.scene = scene;
    this.camera = camera;

    // Configuração de qualidade adaptativa
    this.qualityConfig = config.qualityLevels || {
      0: { debris: 40, dust: 30, flashIntensity: 3.0, shakeAmount: 0.3 },   // low
      1: { debris: 80, dust: 60, flashIntensity: 4.0, shakeAmount: 0.4 },   // medium
      2: { debris: 150, dust: 120, flashIntensity: 5.0, shakeAmount: 0.5 }, // high
      3: { debris: 300, dust: 200, flashIntensity: 6.0, shakeAmount: 0.5 }  // ultra
    };

    this.currentQualityLevel = config.initialQualityLevel || 2;
    this.randomFloat = config.randomFloat || Math.random.bind(Math);

    // Estado de efeitos ativos (índices nos pools)
    this.activeFlashes = [];
    this.activeDebrisFields = [];
    this.activeDustClouds = [];
    this.cameraShakeState = null;

    // POOLS PRÉ-ALOCADOS (criados uma vez no preload)
    this.flashPool = [];
    this.debrisPool = [];
    this.dustPool = [];

    // Geometrias e materiais compartilhados
    this.sharedGeometries = {};
    this.sharedMaterials = {};

    this.isPreloaded = false;
  }

  /**
   * PRE-LOAD: Cria todos os objetos antecipadamente
   * Deve ser chamado durante o loading do menu, não durante gameplay
   */
  preload() {
    if (this.isPreloaded) return;

    const { THREE } = this;
    console.log('[AsteroidImpactEffect] Preloading effect pools...');

    // 1. Criar geometrias compartilhadas
    this.sharedGeometries.flash = new THREE.SphereGeometry(1, 16, 16);
    this.sharedGeometries.debris = this.createDeformedIcosahedron();

    // 2. Criar materiais compartilhados
    this.sharedMaterials.flash = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.sharedMaterials.debris = new THREE.MeshStandardMaterial({
      color: 0x5a4a3a,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true
    });

    this.sharedMaterials.dust = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: DustParticleShader.vertexShader,
      fragmentShader: DustParticleShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // 3. Pré-criar pools de objetos
    this.preloadFlashPool();
    this.preloadDebrisPool();
    this.preloadDustPool();

    // 4. Forçar compilação dos shaders (render invisível)
    this.warmUpShaders();

    this.isPreloaded = true;
    console.log('[AsteroidImpactEffect] Preload complete.');
  }

  /**
   * Cria geometria de icosaedro deformado (compartilhada)
   */
  createDeformedIcosahedron() {
    const { THREE } = this;
    const geometry = new THREE.IcosahedronGeometry(0.3, 0);

    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      const noise = Math.sin(x * 10) * Math.cos(y * 10) * Math.sin(z * 10);
      const deform = 1.0 + noise * 0.3;
      positions[i] *= deform;
      positions[i + 1] *= deform;
      positions[i + 2] *= deform;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Pré-cria pool de flashes (mesh + light)
   */
  preloadFlashPool() {
    const { THREE } = this;

    for (let i = 0; i < POOL_CONFIG.maxFlashes; i++) {
      const mesh = new THREE.Mesh(
        this.sharedGeometries.flash,
        this.sharedMaterials.flash.clone()
      );
      mesh.visible = false;
      this.scene.add(mesh);

      const light = new THREE.PointLight(0xff6622, 0, 200, 2);
      light.visible = false;
      this.scene.add(light);

      this.flashPool.push({
        mesh,
        light,
        inUse: false,
        life: 0,
        maxLife: 0,
        maxScale: 0,
        intensity: 0
      });
    }
  }

  /**
   * Pré-cria pool de campos de detritos (InstancedMesh)
   */
  preloadDebrisPool() {
    const { THREE } = this;

    for (let i = 0; i < POOL_CONFIG.maxDebrisFields; i++) {
      const instancedMesh = new THREE.InstancedMesh(
        this.sharedGeometries.debris,
        this.sharedMaterials.debris.clone(),
        POOL_CONFIG.debrisPerField
      );
      instancedMesh.visible = false;
      instancedMesh.count = 0; // Inicialmente sem instâncias visíveis
      this.scene.add(instancedMesh);

      // Pré-alocar arrays para dados de partículas
      const particles = [];
      for (let j = 0; j < POOL_CONFIG.debrisPerField; j++) {
        particles.push({
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          angularVelocity: new THREE.Vector3(),
          rotation: new THREE.Euler(),
          scale: 1
        });
      }

      this.debrisPool.push({
        instancedMesh,
        particles,
        inUse: false,
        life: 0,
        maxLife: 0,
        fadeStartTime: 0,
        activeCount: 0
      });
    }
  }

  /**
   * Pré-cria pool de nuvens de poeira (Points)
   */
  preloadDustPool() {
    const { THREE } = this;

    for (let i = 0; i < POOL_CONFIG.maxDustClouds; i++) {
      // Criar BufferGeometry com atributos pré-alocados
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(POOL_CONFIG.dustPerCloud * 3);
      const sizes = new Float32Array(POOL_CONFIG.dustPerCloud);
      const opacities = new Float32Array(POOL_CONFIG.dustPerCloud);
      const velocities = new Float32Array(POOL_CONFIG.dustPerCloud * 3);

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
      geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

      const points = new THREE.Points(geometry, this.sharedMaterials.dust.clone());
      points.visible = false;
      this.scene.add(points);

      this.dustPool.push({
        points,
        inUse: false,
        life: 0,
        maxLife: 0,
        initialOpacities: new Float32Array(POOL_CONFIG.dustPerCloud),
        activeCount: 0
      });
    }
  }

  /**
   * Força compilação dos shaders fazendo um render "invisível"
   */
  warmUpShaders() {
    // Ativar temporariamente um de cada para forçar compilação
    if (this.flashPool[0]) {
      this.flashPool[0].mesh.visible = true;
      this.flashPool[0].mesh.scale.set(0.001, 0.001, 0.001);
    }
    if (this.debrisPool[0]) {
      this.debrisPool[0].instancedMesh.visible = true;
      this.debrisPool[0].instancedMesh.count = 1;
    }
    if (this.dustPool[0]) {
      this.dustPool[0].points.visible = true;
    }

    // O próximo frame vai compilar os shaders
    // Depois desativar
    requestAnimationFrame(() => {
      if (this.flashPool[0]) {
        this.flashPool[0].mesh.visible = false;
      }
      if (this.debrisPool[0]) {
        this.debrisPool[0].instancedMesh.visible = false;
        this.debrisPool[0].instancedMesh.count = 0;
      }
      if (this.dustPool[0]) {
        this.dustPool[0].points.visible = false;
      }
    });
  }

  /**
   * Dispara todos os efeitos de impacto em uma posição
   */
  trigger(position, impactVelocity = 60) {
    if (!this.isPreloaded) {
      console.warn('[AsteroidImpactEffect] Not preloaded! Call preload() first.');
      this.preload();
    }

    const quality = this.qualityConfig[this.currentQualityLevel];

    // 1. Flash de impacto (do pool)
    this.activateFlash(position, quality.flashIntensity);

    // 2. Detritos rochosos (do pool)
    this.activateDebrisField(position, impactVelocity, quality.debris);

    // 3. Nuvem de poeira (do pool)
    this.activateDustCloud(position, quality.dust);

    // 4. Camera shake
    this.applyCameraShake(quality.shakeAmount, impactVelocity);
  }

  /**
   * Ativa um flash do pool
   */
  activateFlash(position, intensity) {
    // Encontrar flash disponível no pool
    const flash = this.flashPool.find(f => !f.inUse);
    if (!flash) return; // Pool cheio, ignorar

    flash.inUse = true;
    flash.life = 0;
    flash.maxLife = 0.35;
    flash.maxScale = 12;
    flash.intensity = intensity;

    // Configurar mesh
    flash.mesh.position.copy(position);
    flash.mesh.scale.set(0.1, 0.1, 0.1);
    flash.mesh.material.opacity = 1.0;
    flash.mesh.material.emissiveIntensity = intensity;
    flash.mesh.visible = true;

    // Configurar luz
    flash.light.position.copy(position);
    flash.light.intensity = intensity * 2;
    flash.light.visible = true;

    this.activeFlashes.push(flash);
  }

  /**
   * Ativa um campo de detritos do pool
   */
  activateDebrisField(position, impactVelocity, count) {
    const { THREE } = this;

    // Encontrar campo disponível no pool
    const field = this.debrisPool.find(f => !f.inUse);
    if (!field) return;

    field.inUse = true;
    field.life = 0;
    field.maxLife = 5.0;
    field.fadeStartTime = 3.0;
    field.activeCount = Math.min(count, POOL_CONFIG.debrisPerField);

    const coneAngle = (120 * Math.PI) / 180;
    const dummy = new THREE.Object3D();

    // Configurar cada partícula
    for (let i = 0; i < field.activeCount; i++) {
      const particle = field.particles[i];

      // Posição inicial
      particle.position.copy(position);

      // Direção de ejeção (cone)
      const theta = this.randomFloat() * Math.PI * 2;
      const phi = this.randomFloat() * coneAngle;

      const direction = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi)
      );

      // Velocidade
      const speed = 5 + this.randomFloat() * 20;
      particle.velocity.copy(direction).multiplyScalar(speed);

      // Rotação angular
      particle.angularVelocity.set(
        (this.randomFloat() - 0.5) * 2.0,
        (this.randomFloat() - 0.5) * 2.0,
        (this.randomFloat() - 0.5) * 2.0
      );

      // Escala e rotação inicial
      particle.scale = 0.5 + this.randomFloat() * 1.0;
      particle.rotation.set(
        this.randomFloat() * Math.PI * 2,
        this.randomFloat() * Math.PI * 2,
        this.randomFloat() * Math.PI * 2
      );

      // Atualizar matriz da instância
      dummy.position.copy(particle.position);
      dummy.rotation.copy(particle.rotation);
      dummy.scale.set(particle.scale, particle.scale, particle.scale);
      dummy.updateMatrix();
      field.instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    field.instancedMesh.count = field.activeCount;
    field.instancedMesh.instanceMatrix.needsUpdate = true;
    field.instancedMesh.material.opacity = 1.0;
    field.instancedMesh.visible = true;

    this.activeDebrisFields.push(field);
  }

  /**
   * Ativa uma nuvem de poeira do pool
   */
  activateDustCloud(position, count) {
    const { THREE } = this;

    // Encontrar nuvem disponível no pool
    const cloud = this.dustPool.find(c => !c.inUse);
    if (!cloud) return;

    cloud.inUse = true;
    cloud.life = 0;
    cloud.maxLife = 4.0;
    cloud.activeCount = Math.min(count, POOL_CONFIG.dustPerCloud);

    const positions = cloud.points.geometry.attributes.position.array;
    const sizes = cloud.points.geometry.attributes.size.array;
    const opacities = cloud.points.geometry.attributes.opacity.array;
    const velocities = cloud.points.geometry.attributes.velocity.array;

    const coneAngle = (140 * Math.PI) / 180;

    for (let i = 0; i < cloud.activeCount; i++) {
      const i3 = i * 3;

      // Posição inicial
      const offset = this.randomFloat() * 2;
      const theta = this.randomFloat() * Math.PI * 2;
      const phi = this.randomFloat() * coneAngle;

      positions[i3] = position.x + offset * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = position.y + offset * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = position.z + offset * Math.cos(phi);

      // Velocidade de expansão
      const dx = positions[i3] - position.x;
      const dy = positions[i3 + 1] - position.y;
      const dz = positions[i3 + 2] - position.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const speed = 2 + this.randomFloat() * 6;

      velocities[i3] = (dx / len) * speed;
      velocities[i3 + 1] = (dy / len) * speed;
      velocities[i3 + 2] = (dz / len) * speed;

      // Tamanho e opacidade
      sizes[i] = 4 + this.randomFloat() * 8;
      opacities[i] = 0.4 + this.randomFloat() * 0.2;
      cloud.initialOpacities[i] = opacities[i];
    }

    // Zerar partículas não usadas
    for (let i = cloud.activeCount; i < POOL_CONFIG.dustPerCloud; i++) {
      opacities[i] = 0;
    }

    cloud.points.geometry.attributes.position.needsUpdate = true;
    cloud.points.geometry.attributes.size.needsUpdate = true;
    cloud.points.geometry.attributes.opacity.needsUpdate = true;
    cloud.points.geometry.attributes.velocity.needsUpdate = true;
    cloud.points.visible = true;

    this.activeDustClouds.push(cloud);
  }

  /**
   * Aplica camera shake procedural
   */
  applyCameraShake(amount, impactVelocity) {
    const intensityScale = Math.min(impactVelocity / 60, 2.0);

    this.cameraShakeState = {
      amount: amount * intensityScale,
      life: 0,
      maxLife: 0.15,
      frequency: 40 + this.randomFloat() * 20
    };
  }

  /**
   * Atualiza todos os efeitos ativos
   */
  update(delta) {
    this.updateFlashes(delta);
    this.updateDebris(delta);
    this.updateDust(delta);
  }

  updateFlashes(delta) {
    for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
      const flash = this.activeFlashes[i];
      flash.life += delta;

      const progress = flash.life / flash.maxLife;
      const fadeOut = 1.0 - progress;

      // Escala
      const scaleEasing = Math.min(progress * 3, 1.0);
      const scale = scaleEasing * flash.maxScale;
      flash.mesh.scale.set(scale, scale, scale);

      // Fade out
      flash.mesh.material.opacity = fadeOut;
      flash.mesh.material.emissiveIntensity = flash.intensity * fadeOut;

      // Luz
      const lightFade = Math.pow(fadeOut, 1.5);
      flash.light.intensity = flash.intensity * 2 * lightFade;
      flash.light.distance = 200 * (0.8 + progress * 0.4);

      // Devolver ao pool quando expirar
      if (flash.life >= flash.maxLife) {
        flash.mesh.visible = false;
        flash.light.visible = false;
        flash.inUse = false;
        this.activeFlashes.splice(i, 1);
      }
    }
  }

  updateDebris(delta) {
    const { THREE } = this;
    const dummy = new THREE.Object3D();

    for (let i = this.activeDebrisFields.length - 1; i >= 0; i--) {
      const field = this.activeDebrisFields[i];
      field.life += delta;

      // Atualizar partículas
      for (let j = 0; j < field.activeCount; j++) {
        const particle = field.particles[j];

        // Física
        particle.position.add(particle.velocity.clone().multiplyScalar(delta));
        particle.rotation.x += particle.angularVelocity.x * delta;
        particle.rotation.y += particle.angularVelocity.y * delta;
        particle.rotation.z += particle.angularVelocity.z * delta;

        // Atualizar matriz
        dummy.position.copy(particle.position);
        dummy.rotation.copy(particle.rotation);
        dummy.scale.set(particle.scale, particle.scale, particle.scale);
        dummy.updateMatrix();
        field.instancedMesh.setMatrixAt(j, dummy.matrix);
      }

      field.instancedMesh.instanceMatrix.needsUpdate = true;

      // Fade
      if (field.life >= field.fadeStartTime) {
        const fadeProgress = (field.life - field.fadeStartTime) / (field.maxLife - field.fadeStartTime);
        field.instancedMesh.material.opacity = 1.0 - fadeProgress;
      }

      // Devolver ao pool
      if (field.life >= field.maxLife) {
        field.instancedMesh.visible = false;
        field.instancedMesh.count = 0;
        field.inUse = false;
        this.activeDebrisFields.splice(i, 1);
      }
    }
  }

  updateDust(delta) {
    for (let i = this.activeDustClouds.length - 1; i >= 0; i--) {
      const cloud = this.activeDustClouds[i];
      cloud.life += delta;

      const progress = cloud.life / cloud.maxLife;
      const positions = cloud.points.geometry.attributes.position.array;
      const velocities = cloud.points.geometry.attributes.velocity.array;
      const opacities = cloud.points.geometry.attributes.opacity.array;

      // Atualizar posições
      for (let j = 0; j < cloud.activeCount; j++) {
        const j3 = j * 3;
        positions[j3] += velocities[j3] * delta;
        positions[j3 + 1] += velocities[j3 + 1] * delta;
        positions[j3 + 2] += velocities[j3 + 2] * delta;

        // Fade
        opacities[j] = cloud.initialOpacities[j] * (1.0 - progress);
      }

      cloud.points.geometry.attributes.position.needsUpdate = true;
      cloud.points.geometry.attributes.opacity.needsUpdate = true;

      // Devolver ao pool
      if (cloud.life >= cloud.maxLife) {
        cloud.points.visible = false;
        cloud.inUse = false;
        this.activeDustClouds.splice(i, 1);
      }
    }
  }

  updateCameraShake(delta) {
    if (!this.cameraShakeState) return;

    const shake = this.cameraShakeState;
    shake.life += delta;

    const progress = shake.life / shake.maxLife;

    if (progress >= 1.0) {
      this.cameraShakeState = null;
      return;
    }

    const intensity = shake.amount * Math.pow(1.0 - progress, 3);
    const time = shake.life * shake.frequency;
    const offsetX = Math.sin(time * 1.3) * Math.cos(time * 0.7) * intensity;
    const offsetY = Math.sin(time * 1.7) * Math.cos(time * 1.1) * intensity;

    this.camera.position.x += offsetX;
    this.camera.position.y += offsetY;
  }

  setQualityLevel(level) {
    this.currentQualityLevel = Math.max(0, Math.min(3, level));
  }

  cleanup() {
    // Desativar todos os efeitos ativos
    this.activeFlashes.forEach(flash => {
      flash.mesh.visible = false;
      flash.light.visible = false;
      flash.inUse = false;
    });
    this.activeFlashes = [];

    this.activeDebrisFields.forEach(field => {
      field.instancedMesh.visible = false;
      field.instancedMesh.count = 0;
      field.inUse = false;
    });
    this.activeDebrisFields = [];

    this.activeDustClouds.forEach(cloud => {
      cloud.points.visible = false;
      cloud.inUse = false;
    });
    this.activeDustClouds = [];

    this.cameraShakeState = null;
  }

  /**
   * Destruir completamente (liberar memória)
   */
  destroy() {
    this.cleanup();

    // Remover objetos da cena e liberar memória
    this.flashPool.forEach(flash => {
      this.scene.remove(flash.mesh);
      this.scene.remove(flash.light);
      flash.mesh.material.dispose();
    });
    this.flashPool = [];

    this.debrisPool.forEach(field => {
      this.scene.remove(field.instancedMesh);
      field.instancedMesh.material.dispose();
    });
    this.debrisPool = [];

    this.dustPool.forEach(cloud => {
      this.scene.remove(cloud.points);
      cloud.points.geometry.dispose();
      cloud.points.material.dispose();
    });
    this.dustPool = [];

    // Geometrias compartilhadas
    if (this.sharedGeometries.flash) this.sharedGeometries.flash.dispose();
    if (this.sharedGeometries.debris) this.sharedGeometries.debris.dispose();

    this.isPreloaded = false;
  }
}
