// src/modules/render3d/story/storySky.js
//
// The story scene's sky (storyScene.js): where the Wake waits, at the Field's
// edge, a low orange star sets behind a sea of the Field's dust lying under
// the ship — the owner's concept (a freighter over clouds at sunset) told in
// space. One dome round the camera, drawn first: a violet-to-orange sky, the
// star and its glow, the dust sea below (lit on its tops toward the star,
// violet in its troughs, hazing out to the horizon), thin streaks of dust
// above the horizon, and a few stars high up. Everything is a function of
// the view direction and the camera's place over the sea: no texture.

// proposta 18/11: the sky's colours (sRGB), the star's direction (world,
// from the ship), the sea `floor` world units under the scene's origin, its
// clouds `scale` wide.
export const STORY_SKY = {
  zenith: '#060818',
  high: '#22183f',
  horizon: '#6b3456',
  warm: '#ff8a4a',
  star: '#fff0d8',
  shade: '#1d1430',
  lit: '#ff9a5c',
  void: '#04050d',
  sun: [-0.84, 0.14, 0.53],
  floor: 2600,
  scale: 5200,
};

const VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAGMENT = `
uniform vec3 uZenith;
uniform vec3 uHigh;
uniform vec3 uHorizon;
uniform vec3 uWarm;
uniform vec3 uStar;
uniform vec3 uShade;
uniform vec3 uLit;
uniform vec3 uVoid;
uniform vec3 uSun;
uniform vec3 uEye;
uniform float uFloor;
uniform float uScale;
uniform float uLevel;
varying vec3 vDir;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 sun = normalize(uSun);
  float facing = dot(dir, sun);
  vec2 level = normalize(dir.xz + 1e-5);
  float toward = max(0.0, dot(level, normalize(sun.xz)));
  float e = dir.y;

  // The sky: violet overhead, warming to orange low toward the star.
  vec3 sky = mix(uHigh, uZenith, smoothstep(0.15, 0.85, e));
  vec3 low = mix(uHorizon, uWarm, pow(toward, 9.0));
  sky = mix(low, sky, smoothstep(-0.02, 0.32, e));
  // Thin streaks of dust above the horizon, lit toward the star.
  float az = atan(dir.z, dir.x);
  float streak = fbm(vec2(az * 3.0, e * 28.0)) * smoothstep(0.32, 0.02, e)
    * smoothstep(-0.02, 0.04, e);
  sky = mix(sky, mix(uShade * 1.6, uLit, pow(toward, 3.0)), smoothstep(0.45, 0.8, streak) * 0.85);
  // A few stars high up.
  vec2 cell = floor(vec2(az * 260.0, e * 260.0));
  float twinkle = step(0.997, hash(cell)) * smoothstep(0.25, 0.6, e);
  sky += vec3(twinkle * 0.6);

  // The dust sea under the ship, seen down to its horizon.
  vec3 color = sky;
  if (e < 0.0) {
    float d = (uEye.y + uFloor) / max(-e, 1e-3);
    vec2 at = (uEye.xz + dir.xz * d) / uScale;
    float n = fbm(at);
    float ahead = fbm(at + normalize(sun.xz) * 0.06);
    // Tops facing the star catch it; troughs stay violet.
    float rim = clamp((n - ahead) * 9.0 + 0.35, 0.0, 1.0);
    float cover = smoothstep(0.32, 0.62, n);
    vec3 cloud = mix(uShade, uLit, rim * (0.35 + 0.65 * toward));
    vec3 sea = mix(uVoid, cloud, cover);
    // The far sea melts into the horizon's haze.
    float haze = 1.0 - exp(-d / (uScale * 9.0));
    sea = mix(sea, low, haze);
    color = mix(sea, sky, smoothstep(-0.006, 0.0, e));
  }

  // The star and its light on the air (a soft fall-off, no ring).
  float disc = smoothstep(0.99986, 0.99993, facing);
  float glow = pow(max(facing, 0.0), 900.0) * 0.8 + pow(max(facing, 0.0), 24.0) * 0.3;
  color += uWarm * glow + uStar * disc * 3.0;
  gl_FragColor = vec4(color * uLevel, 1.0);
}`;

/** The sky dome: { mesh, uniforms }; `place(camera)` each frame. */
export function buildStorySky(THREE) {
  const tint = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const uniforms = {
    uZenith: { value: tint(STORY_SKY.zenith) },
    uHigh: { value: tint(STORY_SKY.high) },
    uHorizon: { value: tint(STORY_SKY.horizon) },
    uWarm: { value: tint(STORY_SKY.warm) },
    uStar: { value: tint(STORY_SKY.star) },
    uShade: { value: tint(STORY_SKY.shade) },
    uLit: { value: tint(STORY_SKY.lit) },
    uVoid: { value: tint(STORY_SKY.void) },
    uSun: { value: new THREE.Vector3(...STORY_SKY.sun).normalize() },
    uEye: { value: new THREE.Vector3() },
    uFloor: { value: STORY_SKY.floor },
    uScale: { value: STORY_SKY.scale },
    uLevel: { value: 1 },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.visible = false;
  return {
    mesh,
    uniforms,
    /** Centres the dome on `camera` (its eye over the sea). */
    place(camera, origin) {
      mesh.position.copy(camera.position);
      uniforms.uEye.value.copy(camera.position).sub(origin);
    },
  };
}
