// src/modules/menu/asteroidMaterials.js
//
// What the menu's asteroids are made of: the CPU-deformed rock geometry, the
// single procedural rock material (MeshStandardMaterial with 3D triplanar
// noise injected; the older all-GLSL study material is kept beside it), and
// the knobs that reach every live material: normal intensity (Settings →
// Video), shader detail (adaptive quality), and the per-frame view, light
// and time uniforms. MenuBackgroundSystem keeps the material lists and hands
// this module a kit of live getters; the bodies came from it unchanged.

import {
  createAsteroidGeometry,
  createSeededRandom,
} from '../render3d/asteroidMesh.js';
import { getNoiseGLSL } from './asteroidNoise.js';

/**
 * @param {object} kit - live getters THREE, adaptiveQuality, baseMaterials,
 *   monolithMaterials, activeAsteroids, camera, keyLight, elapsedTime,
 *   normalIntensity and currentShaderDetail (both settable); randomFloat(fork).
 */
export function createMenuAsteroidMaterials(kit) {
  function createRandomGenerator(seed = kit.randomFloat('assets') * 1000) {
    return createSeededRandom(seed);
  }

  function createDeformedIcosahedron(
    detailSeed = kit.randomFloat('assets') * 100
  ) {
    // CPU-deformed geometry needs enough tessellation to read as "rock" and
    // not a low-poly blob. Keep detail ~5 and reduce asteroid count instead.
    const baseDetailByQuality = [4, 5, 6, 6];
    const qualityLevel =
      typeof kit.adaptiveQuality?.currentLevel === 'number'
        ? kit.adaptiveQuality.currentLevel
        : 2;
    const detail =
      baseDetailByQuality[Math.max(0, Math.min(3, qualityLevel))] ?? 5;
    return createAsteroidGeometry(kit.THREE, detailSeed, { detail });
  }

  function applyNormalIntensityToMaterial(
    material,
    targetIntensity = kit.normalIntensity
  ) {
    const { THREE } = kit;
    if (!material || !THREE) {
      return;
    }

    const intensity = Number.isFinite(targetIntensity)
      ? Math.max(0, Math.min(2.5, targetIntensity))
      : 1;

    if (material.userData?.isProceduralAsteroid) {
      const uniforms =
        material.uniforms || material.userData?._shader?.uniforms || null;

      if (uniforms?.u_bumpStrength) {
        const baseStrength =
          typeof material.userData.baseBumpStrength === 'number'
            ? material.userData.baseBumpStrength
            : uniforms.u_bumpStrength?.value ?? 1.0;

        uniforms.u_bumpStrength.value = baseStrength * intensity;
        if (typeof material.uniformsNeedUpdate !== 'undefined') {
          material.uniformsNeedUpdate = true;
        }

        material.userData = material.userData || {};
        material.userData.menuNormalIntensity = intensity;
        return;
      }
    }

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

  function updateNormalIntensity(rawValue) {
    const numeric = Number(rawValue);
    const resolved = Number.isFinite(numeric) ? numeric : kit.normalIntensity;
    const clamped = Math.max(0, Math.min(2.5, resolved));
    kit.normalIntensity = clamped;

    kit.baseMaterials.forEach((material) => {
      applyNormalIntensityToMaterial(material, clamped);
    });

    kit.activeAsteroids.forEach((asteroid) => {
      if (asteroid?.material) {
        applyNormalIntensityToMaterial(asteroid.material, clamped);
      }
    });
  }

  /**
   * Procedural asteroid material (single-technique): MeshStandardMaterial with a
   * shader injection that computes albedo + bump from 3D noise, blended with a
   * triplanar mix to avoid seam-like artifacts.
   *
   * Goals:
   * - No "pintas"/glitter: metalness is forced to 0 and albedo contrast is low.
   * - Reads under a single grazing directional light (dramatic terminator).
   * - Avoids UVs and texture baking entirely (3D procedural).
   */
  function createTriplanarAsteroidMaterial(
    seed = kit.randomFloat('materials') * 100
  ) {
    const { THREE } = kit;
    const noiseGLSL = getNoiseGLSL();

    const rng = createRandomGenerator(seed + 7717);
    const baseBumpStrength = 0.22 + rng() * 0.28;
    const texScale = 0.85 + rng() * 0.75;
    const axisSharpness = 3.0 + rng() * 3.5;

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.0,
      fog: true,
    });

    material.userData = material.userData || {};
    material.userData.isProceduralAsteroid = true;
    material.userData.baseBumpStrength = baseBumpStrength;

    // Keep a single compiled program; vary appearance via uniforms.
    material.customProgramCacheKey = () => 'menu-asteroid-triplanar-v1';

    material.onBeforeCompile = (shader) => {
      shader.uniforms.u_seed = { value: seed };
      shader.uniforms.u_texScale = { value: texScale };
      shader.uniforms.u_axisSharpness = { value: axisSharpness };
      shader.uniforms.u_bumpStrength = {
        value: baseBumpStrength * (material.userData.menuNormalIntensity ?? 1),
      };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vObjPos;
varying vec3 vObjNormal;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
  vObjPos = transformed;`
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
  vObjNormal = normalize( objectNormal );`
        );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vObjPos;
varying vec3 vObjNormal;
uniform float u_seed;
uniform float u_texScale;
uniform float u_axisSharpness;
uniform float u_bumpStrength;

${noiseGLSL}

vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy ) {
  vec3 vSigmaX = dFdx( surf_pos );
  vec3 vSigmaY = dFdy( surf_pos );
  vec3 vN = surf_norm;
  vec3 R1 = cross( vSigmaY, vN );
  vec3 R2 = cross( vN, vSigmaX );
  float fDet = dot( vSigmaX, R1 );
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( fDet ) * vN - vGrad );
}

float asteroidMacro( vec3 p ) {
  vec3 q = p * 0.28 + vec3( u_seed * 0.07, u_seed * 0.11, u_seed * 0.05 );
  float base = fbm3( q, 4 );
  float ridges = ridgedMF( q * 2.1 + vec3( 12.3, 45.6, 78.9 ), 4, 2.0, 0.55 );
  float h = base * 0.7 + (ridges - 0.5) * 0.55;
  return clamp( h, -1.0, 1.0 );
}

float asteroidMicro( vec3 p ) {
  vec3 q = p * 1.75 + vec3( u_seed * 0.9, u_seed * 0.6, u_seed * 1.1 );
  float m = fbm3( q, 4 );
  float r = ridgedMF( q * 1.35 + vec3( 7.1, 3.7, 9.2 ), 4, 2.0, 0.55 );
  return m * 0.55 + (r - 0.5) * 0.35;
}

float procHeight = 0.0;
float procCavity = 0.0;
float procRoughness = 0.95;

void sampleAsteroid( vec3 objPos, vec3 objNorm, out vec3 albedo, out float bumpHeight, out float cavityOut, out float roughOut ) {
  vec3 p = objPos * u_texScale;
  vec3 n = normalize( objNorm );
  vec3 w = pow( abs( n ), vec3( u_axisSharpness ) );
  w /= max( 1e-5, w.x + w.y + w.z );

  vec3 px = vec3( p.y, p.z, p.x );
  vec3 py = vec3( p.x, p.z, p.y );
  vec3 pz = vec3( p.x, p.y, p.z );

  float macro = asteroidMacro( px ) * w.x + asteroidMacro( py ) * w.y + asteroidMacro( pz ) * w.z;
  float micro = asteroidMicro( px ) * w.x + asteroidMicro( py ) * w.y + asteroidMicro( pz ) * w.z;

  // Subtle 3D crack network (Voronoi edges). Keep it restrained to avoid
  // "pintas": only deep crevices get noticeable cracks.
  vec3 v = voronoiLCSN( p * 1.85 + vec3( u_seed * 0.07, u_seed * 0.11, u_seed * 0.05 ) );
  float edge = clamp( v.z - v.x, 0.0, 1.0 );
  float cracks = 1.0 - smoothstep( 0.03, 0.08, edge );

  float t = macro * 0.5 + 0.5;
  vec3 rockDark = vec3( 0.12, 0.11, 0.11 );
  vec3 rockLite = vec3( 0.24, 0.22, 0.20 );
  vec3 rock = mix( rockDark, rockLite, t );

  float cavity = smoothstep( 0.05, 0.55, -macro );
  float ridge = smoothstep( 0.35, 0.85, macro );
  vec3 dust = vec3( 0.09, 0.085, 0.09 );

  // Cracks concentrate into cavities (weathering) and gently darken the albedo.
  cracks *= smoothstep( 0.15, 0.6, cavity ) * 0.55;
  rock *= 1.0 - cracks * 0.18;

  rock = mix( rock, dust, cavity * 0.55 );
  rock = mix( rock, rock + vec3( 0.04, 0.035, 0.03 ), ridge * 0.25 );

  rock *= 0.90 + 0.10 * (micro * 0.5 + 0.5);
  rock *= 1.0 - cavity * 0.22;

  albedo = clamp( rock, 0.0, 0.55 );
  bumpHeight = micro + macro * 0.18;
  cavityOut = clamp( cavity + cracks * 0.7, 0.0, 1.0 );
  roughOut = clamp( 0.96 - ridge * 0.10 + cavityOut * 0.06 + cracks * 0.05, 0.72, 1.0 );
}
`
      );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );

  vec3 procAlbedo = vec3( 1.0 );
  sampleAsteroid( vObjPos, vObjNormal, procAlbedo, procHeight, procCavity, procRoughness );
  diffuseColor.rgb = procAlbedo;
`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
  vec2 dHdxy = vec2( dFdx( procHeight ), dFdy( procHeight ) );
  float bumpAtten = 1.0 / ( 1.0 + 10.0 * max( abs( dHdxy.x ), abs( dHdxy.y ) ) );
  bumpAtten = clamp( bumpAtten, 0.35, 1.0 );
  normal = perturbNormalArb( -vViewPosition, normal, dHdxy * u_bumpStrength * bumpAtten );
`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
  roughnessFactor = clamp( procRoughness, 0.05, 1.0 );
`
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
  float procOcc = 1.0 - procCavity * 0.38;
  reflectedLight.directDiffuse *= procOcc;
  reflectedLight.directSpecular *= procOcc;
  reflectedLight.indirectDiffuse *= mix( 1.0, procOcc, 0.65 );
  reflectedLight.indirectSpecular *= mix( 1.0, procOcc, 0.65 );
`
        );

      material.userData._shader = shader;
    };

    material.needsUpdate = true;
    return material;
  }

  /**
   * Creates a fully procedural ShaderMaterial based on the original procedural study.
   * This bypasses MeshStandardMaterial entirely for guaranteed shader execution.
   * Uses a self-contained GLSL300 pipeline (RawShaderMaterial) to match the study
   * and avoid Three.js shader chunk injection (fog/dithering/tonemapping).
   *
   * Effects include:
   * - Procedural warped noise texture (flow patterns)
   * - Voronoi-based crack network
   * - Mineral spots (mottled appearance via Worley)
   * - Central difference bump mapping (7 samples)
   * - Layered material system (dust, rock, mineral, metal)
   */
  function createProceduralAsteroidMaterial(
    seed = kit.randomFloat('materials') * 100
  ) {
    const { THREE } = kit;

    const noiseGLSL = getNoiseGLSL();

    const rng = createRandomGenerator(seed + 1337);
    // Keep parameters close to the study defaults to avoid "ugly" extremes.
    const baseBumpStrength = 0.35 + rng() * 0.45; // keep micro detail without glitter
    const textureScale = 8.0 + rng() * 8.0; // study default: 12.0
    const crackIntensity = 0.5 + rng() * 0.6; // study default: 0.8
    const metalAmount = 0.08 + rng() * 0.18; // reduce bright "silver dots"
    const darkness = 0.6 + rng() * 0.4; // study default: 0.8
    const patchiness = 0.25 + rng() * 0.35; // reduce "pintas"

    const shapeDisplacement = 0.9 + rng() * 0.6; // study default: 1.2
    const ridgeStrength = 0.7 + rng() * 0.6; // study default: 1.0
    const scrapeStrength = 0.4 + rng() * 0.8; // study default: 0.8
    const craterStrength = 0.4 + rng() * 0.6; // study default: 0.7
    const craterDensity = 2.5 + rng() * 2.0; // study default: 3.5

    // Use GLSL300 + RawShaderMaterial to avoid Three.js chunk injection.
    const vertexShader = `
      precision highp float;
      precision highp int;

      in vec3 position;
      in vec3 normal;

      uniform mat4 modelMatrix;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      uniform mat3 normalMatrix;

      uniform float u_seed;
      uniform float u_displacement;
      uniform float u_ridgeStrength;
      uniform float u_scrapeStrength;
      uniform float u_craterStrength;
      uniform float u_craterDensity;
      uniform float u_erosion;
      uniform float u_cpuGeometry;
      uniform float detailLevel;

      out vec3 v_position;
      out vec3 v_normal;
      out vec3 v_objPos;
      out float v_ao;
      out float v_cavity;

      ${noiseGLSL}

      float getAsteroidShape(vec3 p) {
        vec3 pSeed = p + vec3(u_seed * 5.0);

        // Slightly smoother base to avoid needle-like macro spikes.
        float base = fbm3(pSeed * 0.35, 3);

        // Lower frequency ridges read more like erosion than "spines".
        float ridges = ridgedMF(pSeed * 1.25, 4, 2.0, 0.55);
        ridges *= u_ridgeStrength * 0.5;

        float cutNoise = snoise3(pSeed * 0.5 + vec3(12.0));
        float cuts = smoothstep(0.3, 0.9, cutNoise);
        cuts *= u_scrapeStrength * 0.6;

        vec3 vData = voronoiLCSN(pSeed * u_craterDensity);
        float dist = vData.x;
        float id = vData.y;

        float features = 0.0;

        if (id < 0.4) {
          float rim = smoothstep(0.7, 0.5, dist);
          float bowl = smoothstep(0.5, 0.0, dist);
          float peak = (id < 0.1) ? smoothstep(0.15, 0.0, dist) * 0.3 : 0.0;
          float shape = (rim * 0.2) - (bowl * 1.2) + peak;
          features += shape;
        } else if (id > 0.65) {
          float rock = smoothstep(0.55, 0.0, dist);
          rock = pow(rock, 0.7);
          features += rock * 0.8;
        }

        features *= u_craterStrength;
        float total = base + ridges - cuts + features;

        // Erosion-like conditioning: compress peaks, preserve/boost cavities.
        total = clamp(total, -1.4, 0.8);
        float valleys = min(total, 0.0) * 1.25;
        float peaks = max(total, 0.0) * 0.55;
        total = valleys + peaks;

        return total * u_displacement;
      }

      void main() {
        float useCpu = step(0.5, u_cpuGeometry);
        vec3 p_final = position;

        float h = length(position) - 1.0;
        v_ao = smoothstep(-0.5, 0.5, h * 0.5 + 0.3);
        v_cavity = 0.0;

        vec3 n_obj = normalize(normal);

        if (useCpu < 0.5) {
          vec3 p = normalize(position);

          // Finite Difference Normal (study parity).
          float eps = 0.015;
          vec3 t1 = normalize(cross(p, vec3(0.0, 1.0, 0.0)));
          if (length(t1) < 0.001) {
            t1 = normalize(cross(p, vec3(0.0, 0.0, 1.0)));
          }
          vec3 t2 = normalize(cross(p, t1));

          // Height + erosion smoothing (simple spherical blur).
          float h0 = getAsteroidShape(p);
          float h1 = getAsteroidShape(normalize(p + t1 * eps));
          float h2 = getAsteroidShape(normalize(p + t2 * eps));
          float hm1 = getAsteroidShape(normalize(p - t1 * eps));
          float hm2 = getAsteroidShape(normalize(p - t2 * eps));

          float erosion = clamp(u_erosion, 0.0, 1.0);
          float tunedDetail = clamp(detailLevel, 0.0, 2.0);
          // On lower quality, reduce erosion to keep the shape more stable/cheap.
          erosion *= smoothstep(0.25, 1.0, tunedDetail);

          float hAvg = (h0 + h1 + h2 + hm1 + hm2) * 0.2;
          h = mix(h0, hAvg, erosion);
          // Second smoothing pass (stronger erosion, fewer spikes).
          h = mix(h, hAvg, erosion * 0.4);

          // Cavity proxy from Laplacian in height field (macro crevice shading).
          float lap = hAvg - h0;
          v_cavity = smoothstep(0.01, 0.08, lap);

          float h1Avg = (h1 + h0 + hm1) / 3.0;
          float h2Avg = (h2 + h0 + hm2) / 3.0;
          float h1E = mix(h1, h1Avg, erosion);
          float h2E = mix(h2, h2Avg, erosion);
          h1E = mix(h1E, h1Avg, erosion * 0.35);
          h2E = mix(h2E, h2Avg, erosion * 0.35);

          float radius = max(0.01, 1.0 + h);
          p_final = p * radius;

          float r1 = max(0.01, 1.0 + h1E);
          float r2 = max(0.01, 1.0 + h2E);

          vec3 v1 = (p + t1 * eps) * r1 - p_final;
          vec3 v2 = (p + t2 * eps) * r2 - p_final;
          n_obj = normalize(cross(v2, v1));
        }

        v_normal = normalize(normalMatrix * n_obj);
        v_objPos = p_final;

        vec4 worldPos = modelMatrix * vec4(p_final, 1.0);
        v_position = worldPos.xyz;

        gl_Position = projectionMatrix * (modelViewMatrix * vec4(p_final, 1.0));
      }
     `;

    const fragmentShader = `
      precision highp float;
      precision highp int;

      in vec3 v_position;
      in vec3 v_normal;
      in vec3 v_objPos;
      in float v_ao;
      in float v_cavity;

      out vec4 fragColor;

      uniform vec3 u_lightDir;
      uniform vec3 u_viewPos;

      uniform float u_seed;
      uniform float u_textureScale;
      uniform float u_bumpStrength;
      uniform float u_crackIntensity;
      uniform float u_metalAmount;
      uniform float u_darkness;
      uniform float u_patchiness;
      uniform float detailLevel;
      uniform float time;

      ${noiseGLSL}

      float getSurfaceDetail(vec3 p) {
        float tunedDetail = clamp(detailLevel, 0.0, 2.0);
        float flowScale = mix(0.22, 0.3, smoothstep(0.0, 1.0, tunedDetail));
        float grainScale = mix(3.0, 4.0, smoothstep(0.0, 1.0, tunedDetail));
        float crackScale = mix(1.6, 2.0, smoothstep(0.0, 1.0, tunedDetail));

        float flow = warpedNoise(p * u_textureScale * flowScale + vec3(u_seed));
        float grain = snoise3(p * u_textureScale * grainScale) * 0.2;
        float cells = getCracks(p * crackScale + vec3(u_seed));
        float cracks = smoothstep(0.05, 0.1, cells);
        float crackLayer = (1.0 - cracks) * u_crackIntensity * 1.5;
        return flow + grain - crackLayer;
      }

      void main() {
        vec3 N_macro = normalize(v_normal);
        if (!gl_FrontFacing) {
          N_macro = -N_macro;
        }

        vec3 p = v_objPos;

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

        grad -= N_macro * dot(grad, N_macro);
        vec3 N = normalize(N_macro - grad * u_bumpStrength * 0.22);

        // --- 2. MATERIALS (Mottled & Diverse - from study) ---
        float h_norm = h_center * 0.5 + 0.5;

        // MINERAL SPOTS (Worley-based patches)
        vec3 cellData = voronoiLCSN(p * 1.5 + vec3(u_seed));
        float spots = smoothstep(0.65, 0.25, cellData.x);

        // MACRO COLOR VARIATION
        float macroVar = fbm3(p * 0.5 + vec3(u_seed + 10.0), 3);

        // --- PALETTE (from study) ---
        vec3 colRegolith = vec3(0.05, 0.05, 0.06);
        vec3 colRockBase = vec3(0.20, 0.19, 0.18);
        vec3 colRockVar  = vec3(0.35, 0.34, 0.32);
        vec3 colMineral  = vec3(0.40, 0.38, 0.35);
        vec3 colSilver   = vec3(0.70, 0.72, 0.75);

        vec3 albedo = mix(colRockBase, colRockVar, macroVar);
        albedo = mix(albedo, colMineral, spots * u_patchiness);

        // Layer Masks
        float dustMask = smoothstep(0.4, 0.0, h_norm) * (1.0 - v_ao);
        dustMask = clamp(dustMask, 0.0, 1.0);

        // Avoid "glitter dots": drive metalness from macro variation, not micro height.
        float metalThreshold = 1.0 - u_metalAmount;
        float macroNorm = macroVar * 0.5 + 0.5;
        float metalMask = smoothstep(metalThreshold, 1.0, macroNorm);

        albedo = mix(albedo, colSilver, metalMask);
        albedo = mix(albedo, colRegolith, dustMask);

        // Cracks darker
        float crackCells = getCracks(p * 2.0 + vec3(u_seed));
        float crackVis = (1.0 - smoothstep(0.0, 0.05, crackCells)) * u_crackIntensity;
        albedo *= (1.0 - crackVis * 0.95);

        // Apply Darkness
        albedo *= (1.5 - u_darkness);

        float roughness = 0.7;
        roughness = mix(roughness, 0.25, metalMask);
        roughness = mix(roughness, 0.98, dustMask);
        roughness = mix(roughness, 1.0, crackVis);
        roughness = mix(roughness, 0.8, spots * u_patchiness * 0.5);

        // --- 3. LIGHTING ---
        vec3 V = normalize(u_viewPos - v_position);
        vec3 L = normalize(u_lightDir);
        vec3 H = normalize(L + V);

        float NdotL = max(dot(N, L), 0.0);
        float NdotH = max(dot(N, H), 0.0);
        float NdotV = max(dot(N, V), 0.0);

        // Cheap directional self-shadowing using micro heightfield horizon occlusion.
        float microShadow = 1.0;
        float tunedDetail = clamp(detailLevel, 0.0, 2.0);
        if (tunedDetail > 0.75) {
          vec3 Lt = L - N * dot(L, N);
          float LtLen = length(Lt);
          if (LtLen > 1e-4) {
            Lt /= LtLen;
            float bias = 0.03;
            float occ = 0.0;
            float hs1 = getSurfaceDetail(p + Lt * 0.03);
            float hs2 = getSurfaceDetail(p + Lt * 0.06);
            float hs3 = getSurfaceDetail(p + Lt * 0.10);
            occ += smoothstep(bias, bias + 0.08, hs1 - h_center) * 0.45;
            occ += smoothstep(bias, bias + 0.08, hs2 - h_center) * 0.35;
            occ += smoothstep(bias, bias + 0.08, hs3 - h_center) * 0.20;
            microShadow = clamp(1.0 - occ, 0.2, 1.0);
          }
        }

        // Contrast curve for a dramatic terminator (but still readable).
        float diff = pow(NdotL, 1.55);

        // Limit shininess to avoid glittery specular aliasing on noisy normals.
        float shininess = mix(8.0, 56.0, clamp(1.0 - roughness, 0.0, 1.0));
        float spec = pow(NdotH, shininess) * pow(1.0 - roughness, 1.6) * NdotL;
        spec *= 0.55;

        float specOcc = smoothstep(0.2, 1.0, v_ao);
        spec *= specOcc;

        float rim = pow(1.0 - NdotV, 3.0) * 0.10 * roughness * smoothstep(0.0, 0.6, NdotL);

        // Keep some ambient so the surface detail reads (menu background).
        vec3 ambient = vec3(0.006, 0.006, 0.010);
        vec3 sunColor = vec3(1.15, 1.10, 1.05);

        vec3 finalColor = albedo * ((diff * microShadow) * sunColor + ambient);
        finalColor += vec3(spec) * sunColor;
        finalColor += vec3(rim);

        finalColor *= (v_ao * 0.6 + 0.4);
        // Extra cavity shading to avoid the "flat and bright" look.
        finalColor *= (1.0 - v_cavity * 0.65);

        fragColor = vec4(finalColor, 1.0);
      }
     `;

    const material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_lightDir: { value: new THREE.Vector3(1.0, 0.6, 0.4).normalize() },
        u_viewPos: { value: new THREE.Vector3(0, 0, 100) },
        u_seed: { value: seed },

        u_displacement: { value: shapeDisplacement },
        u_ridgeStrength: { value: ridgeStrength },
        u_scrapeStrength: { value: scrapeStrength },
        u_craterStrength: { value: craterStrength },
        u_craterDensity: { value: craterDensity },
        // Higher erosion removes spikes and reads more like weathered rock.
        u_erosion: { value: 0.82 + rng() * 0.12 },
        u_cpuGeometry: { value: 0.0 },

        u_textureScale: { value: textureScale },
        u_bumpStrength: { value: baseBumpStrength },
        u_crackIntensity: { value: crackIntensity },
        u_metalAmount: { value: metalAmount },
        u_darkness: { value: darkness },
        u_patchiness: { value: patchiness },
        detailLevel: { value: kit.currentShaderDetail ?? 1.0 },
        time: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      side: THREE.FrontSide,
    });

    material.toneMapped = false;
    material.fog = false;
    material.dithering = false;

    material.userData.isProceduralAsteroid = true;
    material.userData.seed = seed;
    material.userData.baseBumpStrength = baseBumpStrength;
    material.userData.shaderUniforms = material.uniforms;

    return material;
  }

  /**
   * Updates procedural material uniforms for camera position.
   */
  function updateProceduralMaterialUniforms() {
    if (!kit.camera) return;

    const viewPos = kit.camera.position;
    const lightDir = kit.keyLight
      ? kit.keyLight.position.clone().normalize()
      : new kit.THREE.Vector3(0.9, 0.35, 0.12).normalize();

    kit.activeAsteroids.forEach((asteroid) => {
      const material = asteroid.material;
      if (!material?.userData?.isProceduralAsteroid) {
        return;
      }

      // Support both RawShaderMaterial (has `material.uniforms`) and injected
      // MeshStandardMaterial shaders (stored at `material.userData._shader`).
      const uniforms =
        material.uniforms || material.userData?._shader?.uniforms || null;
      if (!uniforms) {
        return;
      }

      if (uniforms.u_viewPos?.value?.copy) {
        uniforms.u_viewPos.value.copy(viewPos);
      }
      if (uniforms.u_lightDir?.value?.copy) {
        uniforms.u_lightDir.value.copy(lightDir);
      }

      // Optional time/detail uniforms (used by the RawShader study material).
      if (uniforms.time && typeof uniforms.time.value === 'number') {
        uniforms.time.value = kit.elapsedTime;
      }
      if (
        uniforms.detailLevel &&
        typeof uniforms.detailLevel.value === 'number'
      ) {
        uniforms.detailLevel.value = kit.currentShaderDetail ?? 1.0;
      }
    });
  }

  /**
   * Legacy patch method - now creates procedural material instead.
   */
  function patchAsteroidMaterial(material) {
    // This method is kept for compatibility but no longer patches
    // The actual procedural material is created in activateAsteroid
    return material;
  }

  /**
   * Updates the shader detail level for all asteroid materials.
   * This controls the complexity of fragment shader effects.
   */
  function updateAsteroidShaderDetail(detailLevel) {
    // Store current detail level for new asteroids
    kit.currentShaderDetail = detailLevel;

    // Update all active asteroid materials
    kit.activeAsteroids.forEach((asteroid) => {
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
    kit.baseMaterials.forEach((material) => {
      if (material.userData) {
        material.userData.shaderDetail = detailLevel;
        const uniforms = material.userData.shaderUniforms;
        if (uniforms && uniforms.detailLevel) {
          uniforms.detailLevel.value = detailLevel;
        }
      }
    });

    // Update monolith shader materials (if present)
    kit.monolithMaterials?.forEach?.((material) => {
      if (material?.userData) {
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
  function updateAsteroidShaderTime(time) {
    kit.activeAsteroids.forEach((asteroid) => {
      if (asteroid.material && asteroid.material.userData) {
        const uniforms = asteroid.material.userData.shaderUniforms;
        if (uniforms && uniforms.time) {
          uniforms.time.value = time;
        }
      }
    });
  }

  return {
    createRandomGenerator,
    createDeformedIcosahedron,
    applyNormalIntensityToMaterial,
    updateNormalIntensity,
    createTriplanarAsteroidMaterial,
    createProceduralAsteroidMaterial,
    updateProceduralMaterialUniforms,
    patchAsteroidMaterial,
    updateAsteroidShaderDetail,
    updateAsteroidShaderTime,
  };
}
