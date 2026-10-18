// A faint fresnel rim in the key light's colour on machine hulls (matte mass:
// it only separates a silhouette from the dark field, it never glows). One
// shared strength uniform, so the quality preset turns every rim on or off
// without a recompile. addRimLight() chains after a material's own patch
// (rock seams on the Husk, the hot core), and the dissolve twins chain after
// it in turn.

// proposta 18/10: rim strength (× the key light's colour × intensity) and how
// tight it hugs the silhouette.
export const RIM_STRENGTH = 0.14;
const RIM_POWER = 3;

/** Shared by every rimmed material; Renderer3D sets it per preset. */
export const RIM_UNIFORMS = { uRimStrength: { value: RIM_STRENGTH } };

/** Turns the rim on (preset) or off. */
export function setRimLight(enabled) {
  RIM_UNIFORMS.uRimStrength.value = enabled ? RIM_STRENGTH : 0;
}

// The key light is the scene's first directional light (Renderer3D adds it
// first); its uniform colour already carries the biome tint and intensity.
const RIM_FRAGMENT = `
#if NUM_DIR_LIGHTS > 0
{
  float rimFacing = saturate(dot(normal, normalize(vViewPosition)));
  float rimSide = 0.35 + 0.65 * saturate(dot(normal, directionalLights[0].direction));
  totalEmissiveRadiance += directionalLights[0].color
    * (uRimStrength * pow(1.0 - rimFacing, ${RIM_POWER.toFixed(1)}) * rimSide);
}
#endif`;

function patchRim(shader, renderer) {
  this.userData.rimBase.call(this, shader, renderer);
  shader.uniforms.uRimStrength = RIM_UNIFORMS.uRimStrength;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform float uRimStrength;'
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>${RIM_FRAGMENT}`
    );
}

function rimCacheKey() {
  return `rim:${this.userData.rimBase.toString()}`;
}

/** Adds the rim to a MeshStandardMaterial (after its own onBeforeCompile). */
export function addRimLight(material) {
  material.userData.rimBase = material.onBeforeCompile;
  material.onBeforeCompile = patchRim;
  material.customProgramCacheKey = rimCacheKey;
  return material;
}
