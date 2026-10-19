// src/modules/menu/starfield.js
//
// The menu's stars: a light placeholder sky at boot, then the NASA catalogue
// (public/nasa/stars.*.bin, galaxies.0.bin) remapped into 18 shells that
// follow the orbiting camera by different amounts, for parallax; their
// point sizes on resize and every frame. MenuBackgroundSystem keeps
// starLayers (and the nebulas and dust the NASA sky hides) and hands this
// module a kit of live getters; the bodies came from it unchanged.

import { debugLog } from '../../core/debugLogging.js';
import { IS_DEV } from '../../core/env.js';

const NASA_FETCH_TIMEOUT_MS = 5000;

export function createStarTexture(THREE) {
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

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

async function fetchWithTimeout(
  url,
  { timeoutMs = NASA_FETCH_TIMEOUT_MS } = {}
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchNasaBinaryAsset(
  filename,
  baseCandidates = ['/'],
  timeoutMs = NASA_FETCH_TIMEOUT_MS
) {
  let lastStatus = null;
  let lastError = null;

  for (const candidate of baseCandidates) {
    const url = `${candidate}nasa/${filename}`;

    try {
      const response = await fetchWithTimeout(url, { timeoutMs });
      lastStatus = response.status;
      if (response.ok) {
        return response.arrayBuffer();
      }
    } catch (error) {
      lastError = error;
    }
  }

  const message =
    lastStatus !== null
      ? `Failed to fetch NASA ${filename} (last status ${lastStatus})`
      : `Failed to fetch NASA ${filename}`;

  if (lastError) {
    throw new Error(message, { cause: lastError });
  }

  throw new Error(message);
}

/**
 * @param {object} kit - live getters THREE, scene, camera, renderer,
 *   nebulas, dustSystem and starLayers (settable); randomFloat(fork) and
 *   createStarTexture() (the system's, so a stub replacing it is honoured).
 */
export function createMenuStarfield(kit) {
  let nasaStarfieldLoaded = false;
  let nasaStarfieldLoading = false;

  function createFallbackStarLayers() {
    const { THREE } = kit;
    const layerConfigs = [
      { count: 2500, distance: 8000, pixelSize: 0.9, speedFactor: 0.02 },
      { count: 1800, distance: 6000, pixelSize: 1.2, speedFactor: 0.04 },
    ];

    kit.starLayers = layerConfigs.map((config) => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(config.count * 3);

      for (let i = 0; i < config.count; i += 1) {
        const theta = kit.randomFloat('starfield') * Math.PI * 2;
        const phi = Math.acos(2 * kit.randomFloat('starfield') - 1);
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
        size: computeWorldSpacePointSize(config.distance, config.pixelSize),
        map: kit.createStarTexture(),
        transparent: true,
        opacity: kit.randomFloat('starfield') * 0.35 + 0.65,
        fog: false,
      });
      material.sizeAttenuation = true;
      material.depthWrite = false;
      material.blending = THREE.AdditiveBlending;

      const mesh = new THREE.Points(geometry, material);
      kit.scene.add(mesh);
      return { mesh, speedFactor: config.speedFactor, config: { ...config } };
    });
  }

  function computeWorldSpacePointSize(distance, pixelSize = 1) {
    if (!kit.camera) {
      return pixelSize;
    }

    const fov = typeof kit.camera.fov === 'number' ? kit.camera.fov : 60;
    const height =
      kit.renderer?.domElement?.clientHeight || window.innerHeight || 1;
    const pixelRatio =
      (typeof kit.renderer?.getPixelRatio === 'function'
        ? kit.renderer.getPixelRatio()
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

  function updateStarLayerSizes() {
    kit.starLayers.forEach((layer) => {
      const { mesh, config } = layer;
      if (!mesh?.material || !config) {
        return;
      }

      const shaderUniforms = mesh.material.uniforms;
      if (shaderUniforms?.particleSize) {
        shaderUniforms.particleSize.value = computeStarParticleSize(
          config.pixelSize
        );
        return;
      }

      // Legacy PointsMaterial fallback.
      const newSize = computeWorldSpacePointSize(
        config.distance,
        config.pixelSize
      );
      if (mesh.material.size !== newSize) {
        mesh.material.size = newSize;
        mesh.material.needsUpdate = true;
      }
    });
  }

  function computeStarParticleSize(pixelSize = 1) {
    const width =
      kit.renderer?.domElement?.clientWidth || window.innerWidth || 1;
    const height =
      kit.renderer?.domElement?.clientHeight || window.innerHeight || 1;
    const pixelRatio =
      (typeof kit.renderer?.getPixelRatio === 'function'
        ? kit.renderer.getPixelRatio()
        : null) ||
      window.devicePixelRatio ||
      1;

    // Match the original study formula: sqrt(maxDim * devicePixelRatio) / 60
    const viewportScale = Math.sqrt(Math.max(width, height) * pixelRatio) / 60;
    return Math.max(0.1, viewportScale * pixelSize);
  }

  async function createNasaStarfieldLayers() {
    const { THREE } = kit;
    if (!THREE || !kit.scene || nasaStarfieldLoaded || nasaStarfieldLoading) {
      return;
    }

    nasaStarfieldLoading = true;

    try {
      const baseUrl =
        (typeof import.meta !== 'undefined' &&
          import.meta.env &&
          typeof import.meta.env.BASE_URL === 'string' &&
          import.meta.env.BASE_URL) ||
        '/';

      const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const baseCandidates = Array.from(
        new Set([normalizedBaseUrl, '/'].filter(Boolean))
      );

      const nasaFiles = [
        'stars.0.bin',
        'stars.1.bin',
        'stars.2.bin',
        'stars.3.bin',
        'stars.4.bin',
        'stars.5.bin',
        'galaxies.0.bin',
      ];

      class BinaryReader {
        constructor(data) {
          this.view = new DataView(data);
          this.offset = 0;
        }
        readInt32() {
          const value = this.view.getInt32(this.offset, true);
          this.offset += 4;
          return value;
        }
        readFloat32() {
          const value = this.view.getFloat32(this.offset, true);
          this.offset += 4;
          return value;
        }
        readByte() {
          const value = this.view.getUint8(this.offset);
          this.offset += 1;
          return value;
        }
      }

      const rotateByQuaternion = (x, y, z) => {
        const cosTheta = 0.9174077;
        const sinTheta = 0.3979486;
        return {
          x,
          y: y * cosTheta - z * sinTheta,
          z: y * sinTheta + z * cosTheta,
        };
      };

      const buffers = [];
      let totalStars = 0;
      for (const file of nasaFiles) {
        const buf = await fetchNasaBinaryAsset(file, baseCandidates);
        const tmpReader = new BinaryReader(buf);
        const count = tmpReader.readInt32();
        buffers.push({ file, buf, count });
        totalStars += count;
      }

      // Match the original study conversions.
      const KM_TO_PARSEC = 1 / 3.086e13;
      const DISTANCE_SCALE = 206265000.0;
      const KM_TO_UNITS = KM_TO_PARSEC * DISTANCE_SCALE;

      // Parallax tuning: the NASA mockup uses true 3D distances (and a huge camera far plane).
      // In the menu we keep stars close enough to create a visible parallax during the
      // camera orbit by remapping the NASA distances into MANY shells near the scene.
      // We preserve the NASA photometry (absMag + original distance for brightness),
      // and only remap the *render-space* radius used for parallax.
      // More dramatic parallax: many shells closer to the scene + exaggerated
      // camera-follow factors per layer (including negative for "near" layers).
      const LAYER_COUNT = 18;
      const MIN_SKY_RADIUS = 520;
      const MAX_SKY_RADIUS = 1500;
      const FOLLOW_MIN = -0.65;
      const FOLLOW_MAX = 0.92;
      const FOLLOW_CURVE = 1.15;

      const positions = new Float32Array(totalStars * 3);
      const starColors = new Float32Array(totalStars * 4);
      const starDistances = new Float32Array(totalStars);

      let writeIndex = 0;
      for (const entry of buffers) {
        const reader = new BinaryReader(entry.buf);
        const count = reader.readInt32();
        for (let i = 0; i < count; i += 1) {
          reader.readFloat32(); // mag (unused by shader)
          const absMag = reader.readFloat32();
          const r = reader.readByte();
          const g = reader.readByte();
          const b = reader.readByte();
          const posY = reader.readFloat32();
          const posZ = reader.readFloat32();
          const posX = reader.readFloat32();

          const maxComponent = Math.max(r, g, b, 1);
          const normalizedR = r / maxComponent;
          const normalizedG = g / maxComponent;
          const normalizedB = b / maxComponent;

          const rotated = rotateByQuaternion(posX, -posY, posZ);

          const xUnits = rotated.x * KM_TO_UNITS;
          const yUnits = rotated.y * KM_TO_UNITS;
          const zUnits = rotated.z * KM_TO_UNITS;
          const distUnits = Math.sqrt(
            xUnits * xUnits + yUnits * yUnits + zUnits * zUnits
          );
          const inv = distUnits > 0 ? 1 / distUnits : 1;

          const o = writeIndex * 3;
          // Store unit direction for a second pass (we remap radii using percentiles).
          positions[o] = xUnits * inv;
          positions[o + 1] = yUnits * inv;
          positions[o + 2] = zUnits * inv;

          const c = writeIndex * 4;
          starColors[c] = normalizedR;
          starColors[c + 1] = normalizedG;
          starColors[c + 2] = normalizedB;
          starColors[c + 3] = absMag;

          starDistances[writeIndex] = distUnits;
          writeIndex += 1;
        }
      }

      const sortedDistances = Array.from(starDistances).filter(
        (value) =>
          typeof value === 'number' && Number.isFinite(value) && value > 0
      );
      sortedDistances.sort((a, b) => a - b);
      const totalSorted = sortedDistances.length;
      const pickPercentile = (p) => {
        if (!totalSorted) {
          return 1;
        }
        const idx = Math.max(
          0,
          Math.min(totalSorted - 1, Math.floor(p * (totalSorted - 1)))
        );
        return sortedDistances[idx];
      };

      const distanceBoundaries = Array.from(
        { length: Math.max(0, LAYER_COUNT - 1) },
        (_, i) => pickPercentile((i + 1) / LAYER_COUNT)
      );

      const findLayerIndex = (distance) => {
        // upperBound(distanceBoundaries, distance)
        let lo = 0;
        let hi = distanceBoundaries.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (distance < distanceBoundaries[mid]) {
            hi = mid;
          } else {
            lo = mid + 1;
          }
        }
        return lo; // 0..LAYER_COUNT-1
      };

      const radiiByLayer = Array.from({ length: LAYER_COUNT }, (_, idx) => {
        const x = LAYER_COUNT > 1 ? idx / (LAYER_COUNT - 1) : 0;
        return MIN_SKY_RADIUS + (MAX_SKY_RADIUS - MIN_SKY_RADIUS) * x;
      });
      const followByLayer = Array.from({ length: LAYER_COUNT }, (_, idx) => {
        const x = LAYER_COUNT > 1 ? idx / (LAYER_COUNT - 1) : 0;
        const shaped = Math.pow(x, FOLLOW_CURVE);
        return FOLLOW_MIN + (FOLLOW_MAX - FOLLOW_MIN) * shaped;
      });

      const layerCounts = new Array(LAYER_COUNT).fill(0);
      const layerIndices = new Uint8Array(starDistances.length);
      for (let i = 0; i < starDistances.length; i += 1) {
        const d = starDistances[i];
        const layerIndex = findLayerIndex(d);
        layerIndices[i] = layerIndex;
        layerCounts[layerIndex] += 1;
      }

      const layerPositions = layerCounts.map(
        (count) => new Float32Array(count * 3)
      );
      const layerColors = layerCounts.map(
        (count) => new Float32Array(count * 4)
      );
      const layerDistances = layerCounts.map(
        (count) => new Float32Array(count)
      );
      const layerWrite = new Array(LAYER_COUNT).fill(0);

      for (let i = 0; i < starDistances.length; i += 1) {
        const layerIndex = layerIndices[i];
        const outIndex = layerWrite[layerIndex];
        layerWrite[layerIndex] += 1;

        const radius = radiiByLayer[layerIndex];

        const inPos = i * 3;
        const outPos = outIndex * 3;
        layerPositions[layerIndex][outPos] = positions[inPos] * radius;
        layerPositions[layerIndex][outPos + 1] = positions[inPos + 1] * radius;
        layerPositions[layerIndex][outPos + 2] = positions[inPos + 2] * radius;

        const inCol = i * 4;
        const outCol = outIndex * 4;
        layerColors[layerIndex][outCol] = starColors[inCol];
        layerColors[layerIndex][outCol + 1] = starColors[inCol + 1];
        layerColors[layerIndex][outCol + 2] = starColors[inCol + 2];
        layerColors[layerIndex][outCol + 3] = starColors[inCol + 3];

        layerDistances[layerIndex][outIndex] = starDistances[i];
      }

      const nasaVertexShader = `
        #define PI 3.1415926538

        attribute vec4 starColor;
        attribute float starDist;
        varying vec4 fColor;
        uniform float particleSize;
        uniform float intensity;

        float absoluteMagnitudeToFlux(float absoluteMagnitude, float distance) {
          float luminosityInWatts = 1.35e18 * pow(10.0, absoluteMagnitude / -2.5);
          return luminosityInWatts / (4.0 * PI * distance * distance);
        }

        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          fColor = starColor;

          float absMag = starColor.a;
          float distance = starDist;

          float flux = absoluteMagnitudeToFlux(absMag, distance);
          float brightness = 2.0 * log(1.0 + flux * 1e4);

          float scaled = brightness * particleSize * intensity;
          fColor.a = clamp(scaled, 0.05, 1.0);
          gl_PointSize = clamp(brightness * 4.0 * particleSize * intensity, 5.0, 50.0);

          float nearFade = clamp((distance - 6.684e6) / 6.016e7, 0.0, 1.0);
          fColor.a = mix(0.0, fColor.a, nearFade);
        }
      `;

      const nasaFragmentShader = `
        precision highp float;
        varying vec4 fColor;

        void main(void) {
          float distanceFromEdge = clamp(1.0 - 2.0 * length(gl_PointCoord - vec2(0.5, 0.5)), 0.0, 1.0);
          float a = pow(distanceFromEdge, 5.0);
          gl_FragColor.rgb = fColor.rgb;
          gl_FragColor.a = fColor.a * a;
        }
      `;

      const material = new THREE.ShaderMaterial({
        vertexShader: nasaVertexShader,
        fragmentShader: nasaFragmentShader,
        uniforms: {
          particleSize: { value: computeStarParticleSize(1.0) },
          intensity: { value: 1.0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      material.fog = false;

      const nasaPoints = layerPositions
        .map((posArray, idx) => ({ posArray, idx }))
        .filter(({ posArray }) => posArray && posArray.length > 0)
        .map(({ posArray, idx }) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(posArray, 3)
          );
          geometry.setAttribute(
            'starColor',
            new THREE.BufferAttribute(layerColors[idx], 4)
          );
          geometry.setAttribute(
            'starDist',
            new THREE.BufferAttribute(layerDistances[idx], 1)
          );
          geometry.computeBoundingSphere();

          const points = new THREE.Points(geometry, material);
          points.frustumCulled = false;
          points.userData.followCamera = false;
          points.userData.followCameraFactor = followByLayer[idx] ?? 0;
          points.renderOrder = -1000 - idx;
          return points;
        });

      // Replace placeholder star layers.
      kit.starLayers.forEach((layer) => {
        if (layer?.mesh) {
          kit.scene.remove(layer.mesh);
          layer.mesh.geometry?.dispose?.();
          layer.mesh.material?.dispose?.();
        }
      });

      kit.starLayers = nasaPoints.map((points) => ({
        mesh: points,
        speedFactor: 0.0,
        config: { distance: MAX_SKY_RADIUS, pixelSize: 1.0 },
      }));
      nasaPoints.forEach((points) => kit.scene.add(points));

      // The NASA standalone is essentially "stars only". Disable extra overlays
      // so the menu matches the reference more closely.
      if (kit.nebulas) {
        kit.nebulas.forEach((neb) => {
          neb.visible = false;
        });
      }
      if (kit.dustSystem) {
        kit.dustSystem.visible = false;
      }

      nasaStarfieldLoaded = true;

      if (IS_DEV) {
        debugLog(
          `[MenuBackgroundSystem] NASA starfield loaded (${totalStars} stars)`
        );
      }
    } catch (error) {
      console.warn('[MenuBackgroundSystem] NASA starfield load failed:', error);
    } finally {
      nasaStarfieldLoading = false;
    }
  }

  // Per frame: spin with the orbit (`timer`), follow the camera, size points.
  function updateStarLayers(timer, elapsedTime) {
    kit.starLayers.forEach((layer) => {
      layer.mesh.rotation.y = -timer * layer.speedFactor;
      if (kit.camera) {
        const followFactor = layer.mesh?.userData?.followCameraFactor;
        if (typeof followFactor === 'number' && Number.isFinite(followFactor)) {
          layer.mesh.position
            .copy(kit.camera.position)
            .multiplyScalar(Math.max(-1.25, Math.min(1.25, followFactor)));
        } else if (layer.mesh?.userData?.followCamera) {
          layer.mesh.position.copy(kit.camera.position);
        }
      }
      const uniforms = layer.mesh?.material?.uniforms;
      if (uniforms?.particleSize) {
        uniforms.particleSize.value = computeStarParticleSize(
          layer?.config?.pixelSize ?? 1
        );
      }
      if (uniforms?.time) {
        uniforms.time.value = elapsedTime;
      }
    });
  }

  return {
    createFallbackStarLayers,
    computeWorldSpacePointSize,
    updateStarLayerSizes,
    computeStarParticleSize,
    createNasaStarfieldLayers,
    updateStarLayers,
  };
}
