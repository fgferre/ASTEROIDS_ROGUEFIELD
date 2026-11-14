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
    updateProceduralMaterialUniforms,
    updateAsteroidShaderDetail,
    updateAsteroidShaderTime,
  };
}
