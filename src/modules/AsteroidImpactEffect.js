// src/modules/AsteroidImpactEffect.js
// Sistema cinematográfico de efeitos de colisão para asteroides do menu background

import { DustParticleShader } from './DustParticleShader.js';

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

    this.currentQualityLevel = config.initialQualityLevel || 2; // default: high
    this.randomFloat = config.randomFloat || Math.random.bind(Math);

    // Pools de efeitos ativos
    this.activeFlashes = [];
    this.activeDebrisFields = [];
    this.activeDustClouds = [];
    this.cameraShakeState = null;

    // Geometry/Material pools (criados uma vez, reutilizados)
    this.flashGeometry = null;
    this.flashMaterial = null;
    this.debrisInstancedMeshes = {}; // Por nível de qualidade
    this.dustGeometry = null;
    this.dustMaterial = null;

    this.initializePools();
  }

  initializePools() {
    const { THREE } = this;

    // Flash geometry (SphereGeometry simples)
    this.flashGeometry = new THREE.SphereGeometry(1, 16, 16);

    // Flash material (emissivo branco para ativar bloom)
    this.flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // Note: InstancedMesh e dust Points serão criados dinamicamente por impacto
    // para permitir diferentes quantidades baseadas em qualidade
  }

  /**
   * Dispara todos os efeitos de impacto em uma posição
   * @param {THREE.Vector3} position - Posição do impacto
   * @param {number} impactVelocity - Velocidade do impacto (para escalar efeitos)
   */
  trigger(position, impactVelocity = 60) {
    const quality = this.qualityConfig[this.currentQualityLevel];

    // 1. Flash de impacto
    this.createFlash(position, quality.flashIntensity);

    // 2. Detritos rochosos
    this.createDebrisField(position, impactVelocity, quality.debris);

    // 3. Nuvem de poeira
    this.createDustCloud(position, quality.dust);

    // 4. Camera shake
    this.applyCameraShake(quality.shakeAmount, impactVelocity);
  }

  /**
   * Cria flash de impacto com SphereGeometry emissiva + PointLight intensa
   * A PointLight ilumina os asteroides ao redor (efeito de explosão de fogo)
   */
  createFlash(position, intensity) {
    const { THREE } = this;

    // 1. Flash geométrico (esfera branca que escala e desaparece)
    const flash = new THREE.Mesh(this.flashGeometry, this.flashMaterial.clone());
    flash.position.copy(position);
    flash.scale.set(0.1, 0.1, 0.1);
    flash.material.opacity = 1.0;

    // Configurar emissive para ativar bloom
    flash.material.emissive = new THREE.Color(0xffffff);
    flash.material.emissiveIntensity = intensity;

    this.scene.add(flash);

    // 2. PointLight intensa para iluminar asteroides ao redor (explosão de fogo)
    // Cor laranja-fogo mais intensa que a original
    const light = new THREE.PointLight(0xff6622, intensity * 2, 200, 2);
    light.position.copy(position);
    this.scene.add(light);

    this.activeFlashes.push({
      mesh: flash,
      light: light, // Adicionar luz ao objeto flash
      life: 0,
      maxLife: 0.35, // Ligeiramente mais longo para o efeito de fogo
      maxScale: 12,
      intensity
    });
  }

  /**
   * Cria campo de detritos com InstancedMesh
   */
  createDebrisField(position, impactVelocity, count) {
    const { THREE } = this;

    // Geometria icosahedron low-poly (subdivisão 0)
    const baseGeometry = new THREE.IcosahedronGeometry(0.3, 0);

    // Deformar vértices para criar variação (simulando simplex noise)
    const positions = baseGeometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      // Pseudo-noise usando funções trigonométricas
      const noise = Math.sin(x * 10) * Math.cos(y * 10) * Math.sin(z * 10);
      const deform = 1.0 + noise * 0.3; // 30% variação

      positions[i] *= deform;
      positions[i + 1] *= deform;
      positions[i + 2] *= deform;
    }
    baseGeometry.attributes.position.needsUpdate = true;
    baseGeometry.computeVertexNormals();

    // Material rochoso
    const debrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a4a3a, // Marrom-acinzentado
      roughness: 0.95,
      metalness: 0.0
    });

    // Criar InstancedMesh
    const instancedMesh = new THREE.InstancedMesh(baseGeometry, debrisMaterial, count);
    this.scene.add(instancedMesh);

    // Configurar instâncias individuais
    const debris = [];
    const dummy = new THREE.Object3D();
    const coneAngle = (120 * Math.PI) / 180; // 120° cone

    for (let i = 0; i < count; i++) {
      // Posição inicial no ponto de impacto com pequeno offset
      dummy.position.copy(position);

      // Direção de ejeção (cone/hemisfério)
      const theta = this.randomFloat() * Math.PI * 2;
      const phi = this.randomFloat() * coneAngle;

      const direction = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi)
      );

      // Velocidade (5-25 unidades/s)
      const speed = 5 + this.randomFloat() * 20;
      const velocity = direction.multiplyScalar(speed);

      // Rotação angular aleatória (0.5-2.0 rad/s)
      const angularVelocity = new THREE.Vector3(
        (this.randomFloat() - 0.5) * 2.0,
        (this.randomFloat() - 0.5) * 2.0,
        (this.randomFloat() - 0.5) * 2.0
      );

      // Escala variada (0.5 - 1.5)
      const scale = 0.5 + this.randomFloat() * 1.0;
      dummy.scale.set(scale, scale, scale);

      // Rotação inicial aleatória
      dummy.rotation.set(
        this.randomFloat() * Math.PI * 2,
        this.randomFloat() * Math.PI * 2,
        this.randomFloat() * Math.PI * 2
      );

      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);

      // Variação de cor por instância (tons de cinza/marrom)
      const colorVariation = 0.8 + this.randomFloat() * 0.4;
      instancedMesh.setColorAt(i, new THREE.Color(colorVariation, colorVariation * 0.9, colorVariation * 0.8));

      debris.push({
        index: i,
        position: dummy.position.clone(),
        velocity,
        angularVelocity,
        rotation: dummy.rotation.clone(),
        scale
      });
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    this.activeDebrisFields.push({
      instancedMesh,
      debris,
      life: 0,
      fadeStartTime: 3.0, // Começa fade após 3s
      maxLife: 5.0 // Remove após 5s
    });
  }

  /**
   * Cria nuvem de poeira com THREE.Points e shader procedural
   */
  createDustCloud(position, count) {
    const { THREE } = this;

    // Criar geometria de pontos
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    const velocities = new Float32Array(count * 3);

    const coneAngle = (140 * Math.PI) / 180; // 140° cone (mais amplo que detritos)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Posição inicial próxima ao impacto
      const offset = this.randomFloat() * 2;
      const theta = this.randomFloat() * Math.PI * 2;
      const phi = this.randomFloat() * coneAngle;

      positions[i3] = position.x + offset * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = position.y + offset * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = position.z + offset * Math.cos(phi);

      // Direção de expansão
      const direction = new THREE.Vector3(
        positions[i3] - position.x,
        positions[i3 + 1] - position.y,
        positions[i3 + 2] - position.z
      ).normalize();

      // Velocidade de expansão (2-8 unidades/s, mais lento que detritos)
      const speed = 2 + this.randomFloat() * 6;
      velocities[i3] = direction.x * speed;
      velocities[i3 + 1] = direction.y * speed;
      velocities[i3 + 2] = direction.z * speed;

      // Tamanho variado (4-12 pixels)
      sizes[i] = 4 + this.randomFloat() * 8;

      // Opacidade inicial (0.4-0.6)
      opacities[i] = 0.4 + this.randomFloat() * 0.2;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    // Material com shader customizado
    const material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: DustParticleShader.vertexShader,
      fragmentShader: DustParticleShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    this.activeDustClouds.push({
      points,
      life: 0,
      maxLife: 4.0, // 4s de duração total
      initialOpacities: [...opacities]
    });
  }

  /**
   * Aplica camera shake procedural
   * Nota: O shake é aplicado como OFFSET, não como posição absoluta,
   * para compatibilidade com o sistema de órbita da câmera do menu.
   */
  applyCameraShake(amount, impactVelocity) {
    // Escalar shake baseado na velocidade do impacto
    const intensityScale = Math.min(impactVelocity / 60, 2.0);

    this.cameraShakeState = {
      amount: amount * intensityScale,
      life: 0,
      maxLife: 0.15, // 0.15s de duração (mais curto para evitar conflito com órbita)
      frequency: 40 + this.randomFloat() * 20 // Frequência de tremor
    };
  }

  /**
   * Atualiza todos os efeitos ativos
   * @param {number} delta - Delta time em segundos
   * NOTA: Camera shake é chamado separadamente no MenuBackgroundSystem
   * para garantir que seja aplicado antes do lookAt
   */
  update(delta) {
    this.updateFlashes(delta);
    this.updateDebris(delta);
    this.updateDust(delta);
    // Camera shake chamado externamente pelo MenuBackgroundSystem
  }

  updateFlashes(delta) {
    for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
      const flash = this.activeFlashes[i];
      flash.life += delta;

      const progress = flash.life / flash.maxLife;
      const fadeOut = 1.0 - progress;

      // Escala instantânea 0→maxScale com easing
      const scaleEasing = Math.min(progress * 3, 1.0); // Rápido no início
      const scale = scaleEasing * flash.maxScale;
      flash.mesh.scale.set(scale, scale, scale);

      // Fade out do mesh
      flash.mesh.material.opacity = fadeOut;
      flash.mesh.material.emissiveIntensity = flash.intensity * fadeOut;

      // Fade out da PointLight (efeito de fogo)
      if (flash.light) {
        // Intensidade decai mais rápido no início (efeito de explosão)
        const lightFade = Math.pow(fadeOut, 1.5);
        flash.light.intensity = flash.intensity * 2 * lightFade;
        // Distância da luz expande ligeiramente durante o fade
        flash.light.distance = 200 * (0.8 + progress * 0.4);
      }

      // Remover quando expirar
      if (flash.life >= flash.maxLife) {
        this.scene.remove(flash.mesh);
        flash.mesh.material.dispose();
        if (flash.light) {
          this.scene.remove(flash.light);
        }
        this.activeFlashes.splice(i, 1);
      }
    }
  }

  updateDebris(delta) {
    const { THREE } = this;

    for (let i = this.activeDebrisFields.length - 1; i >= 0; i--) {
      const field = this.activeDebrisFields[i];
      field.life += delta;

      const dummy = new THREE.Object3D();

      // Atualizar cada partícula de detrito
      field.debris.forEach((particle) => {
        // Atualizar posição (física retilínea, sem gravidade)
        particle.position.add(particle.velocity.clone().multiplyScalar(delta));

        // Atualizar rotação
        particle.rotation.x += particle.angularVelocity.x * delta;
        particle.rotation.y += particle.angularVelocity.y * delta;
        particle.rotation.z += particle.angularVelocity.z * delta;

        // Aplicar transformações
        dummy.position.copy(particle.position);
        dummy.rotation.copy(particle.rotation);
        dummy.scale.set(particle.scale, particle.scale, particle.scale);

        dummy.updateMatrix();
        field.instancedMesh.setMatrixAt(particle.index, dummy.matrix);
      });

      field.instancedMesh.instanceMatrix.needsUpdate = true;

      // Fade após fadeStartTime
      if (field.life >= field.fadeStartTime) {
        const fadeProgress = (field.life - field.fadeStartTime) / (field.maxLife - field.fadeStartTime);
        field.instancedMesh.material.opacity = 1.0 - fadeProgress;
        field.instancedMesh.material.transparent = true;
      }

      // Remover quando expirar
      if (field.life >= field.maxLife) {
        this.scene.remove(field.instancedMesh);
        field.instancedMesh.geometry.dispose();
        field.instancedMesh.material.dispose();
        this.activeDebrisFields.splice(i, 1);
      }
    }
  }

  updateDust(delta) {
    for (let i = this.activeDustClouds.length - 1; i >= 0; i--) {
      const cloud = this.activeDustClouds[i];
      cloud.life += delta;

      const progress = cloud.life / cloud.maxLife;

      // Atualizar posições (expansão)
      const positions = cloud.points.geometry.attributes.position.array;
      const velocities = cloud.points.geometry.attributes.velocity.array;

      for (let j = 0; j < positions.length; j += 3) {
        positions[j] += velocities[j] * delta;
        positions[j + 1] += velocities[j + 1] * delta;
        positions[j + 2] += velocities[j + 2] * delta;
      }
      cloud.points.geometry.attributes.position.needsUpdate = true;

      // Fade gradual de opacidade
      const opacities = cloud.points.geometry.attributes.opacity.array;
      for (let j = 0; j < opacities.length; j++) {
        opacities[j] = cloud.initialOpacities[j] * (1.0 - progress);
      }
      cloud.points.geometry.attributes.opacity.needsUpdate = true;

      // Remover quando expirar
      if (cloud.life >= cloud.maxLife) {
        this.scene.remove(cloud.points);
        cloud.points.geometry.dispose();
        cloud.points.material.dispose();
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

    // Easing exponencial (intenso no início, suave no fim)
    const intensity = shake.amount * Math.pow(1.0 - progress, 3);

    // Noise procedural usando seno/cosseno com múltiplas frequências
    const time = shake.life * shake.frequency;
    const offsetX = Math.sin(time * 1.3) * Math.cos(time * 0.7) * intensity;
    const offsetY = Math.sin(time * 1.7) * Math.cos(time * 1.1) * intensity;

    // Aplicar shake como OFFSET à posição ATUAL da câmera (não absoluta)
    // Isso funciona com o sistema de órbita do menu que já movimenta a câmera
    this.camera.position.x += offsetX;
    this.camera.position.y += offsetY;
    // Não aplicar em Z para não afetar a distância focal
  }

  /**
   * Atualiza o nível de qualidade
   * @param {number} level - 0 (low), 1 (medium), 2 (high), 3 (ultra)
   */
  setQualityLevel(level) {
    this.currentQualityLevel = Math.max(0, Math.min(3, level));
  }

  /**
   * Limpa todos os efeitos ativos
   */
  cleanup() {
    // Limpar flashes (mesh + light)
    this.activeFlashes.forEach((flash) => {
      this.scene.remove(flash.mesh);
      flash.mesh.material.dispose();
      if (flash.light) {
        this.scene.remove(flash.light);
      }
    });
    this.activeFlashes = [];

    // Limpar detritos
    this.activeDebrisFields.forEach((field) => {
      this.scene.remove(field.instancedMesh);
      field.instancedMesh.geometry.dispose();
      field.instancedMesh.material.dispose();
    });
    this.activeDebrisFields = [];

    // Limpar poeira
    this.activeDustClouds.forEach((cloud) => {
      this.scene.remove(cloud.points);
      cloud.points.geometry.dispose();
      cloud.points.material.dispose();
    });
    this.activeDustClouds = [];

    // Resetar shake state (câmera gerenciada pelo MenuBackgroundSystem)
    this.cameraShakeState = null;

    // Limpar pools
    if (this.flashGeometry) this.flashGeometry.dispose();
    if (this.flashMaterial) this.flashMaterial.dispose();
  }
}
