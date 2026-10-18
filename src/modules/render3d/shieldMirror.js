// The ship's shield in 3D: a low dome of hexagonal tiles over the hull,
// additive cyan, brightest at the silhouette. It grows in when raised, a hit
// lights the tiles facing the impact and sends a ripple across the shell, and
// a break cracks it: every tile flares and drops out on its own beat. One
// mesh, one draw call; driven by Renderer3D from the PlayerSystem events
// (the hull mirror's flat ring stays hidden while this one draws).

// proposta 18/10: look and timing.
const DOME_HEIGHT = 0.55; // dome height / radius
const HEX_CELLS = 5.5; // tiles across the radius
const BASE_GAIN = 0.55;
const APPEAR_TIME = 0.25; // s
const HIT_TIME = 0.6; // s, ripple and tile flash
const BREAK_TIME = 0.55; // s, until the last tile is gone

const SHIELD_VERTEX = `
varying vec3 vLocal;
varying vec3 vNormalView;
varying vec3 vViewDir;
void main() {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalView = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const SHIELD_FRAGMENT = `
uniform vec3 uColor;
uniform float uCells;
uniform float uLevel;
uniform float uAppear;
uniform vec2 uHitDir;
uniform float uHitAge;
uniform float uBreakAge;
uniform float uBreakFlare;
varying vec3 vLocal;
varying vec3 vNormalView;
varying vec3 vViewDir;
float shieldHash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}
void main() {
  // hex grid on the dome's top-down projection (the camera looks down)
  vec2 uv = vLocal.xz * uCells;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 a = mod(uv, r) - r * 0.5;
  vec2 b = mod(uv - r * 0.5, r) - r * 0.5;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = uv - gv;
  vec2 p = abs(gv);
  float hexD = max(dot(p, vec2(0.5, 0.8660254)), p.x);
  float edge = smoothstep(0.38, 0.49, hexD);
  vec2 cell = id / uCells;

  float facing = abs(dot(normalize(vNormalView), normalize(vViewDir)));
  float fresnel = pow(1.0 - facing, 2.0);
  // grows out from the centre while raised
  float reach = uAppear * 1.2;
  float shown = 1.0 - smoothstep(reach - 0.15, reach, length(cell));
  float light = (0.05 + 0.5 * edge) * (0.35 + 0.65 * fresnel) * (0.45 + 0.55 * uLevel);

  // hit: tiles facing the impact light up; a ripple runs over the shell
  if (uHitAge >= 0.0) {
    float k = uHitAge / ${HIT_TIME.toFixed(2)};
    float d = length(cell - uHitDir * 0.85);
    float tiles = (1.0 - smoothstep(0.1, 0.7, d)) * (1.0 - k) * (1.0 - k);
    float ring = exp(-pow((d - k * 1.6) / 0.12, 2.0)) * (1.0 - k);
    light += tiles * (0.25 + 0.9 * edge) + ring * (0.15 + 0.6 * edge);
  }

  // break: every tile flares, then drops out on its own beat
  if (uBreakAge >= 0.0) {
    float k = uBreakAge / ${BREAK_TIME.toFixed(2)};
    float beat = 0.15 + 0.85 * shieldHash(id);
    if (k > beat) discard;
    light += (0.4 + 1.2 * edge) * (1.0 - k / beat) * uBreakFlare;
  }
  gl_FragColor = vec4(uColor * light * shown, 1.0);
}`;

export class ShieldMirror {
  /** `rgb`: linear cyan (already scaled for the additive look). */
  constructor(THREE, scene, rgb) {
    this.uniforms = {
      uColor: { value: new THREE.Color(rgb[0], rgb[1], rgb[2]) },
      uCells: { value: HEX_CELLS },
      uLevel: { value: 1 },
      uAppear: { value: 0 },
      uHitDir: { value: new THREE.Vector2(1, 0) },
      uHitAge: { value: -1 },
      uBreakAge: { value: -1 },
      uBreakFlare: { value: 1 },
    };
    this.uniforms.uColor.value.multiplyScalar(BASE_GAIN);
    // the upper hemisphere, squashed into a low dome
    const geometry = new THREE.SphereGeometry(
      1,
      40,
      12,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    );
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: SHIELD_VERTEX,
        fragmentShader: SHIELD_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.raisedAt = -Infinity;
    this.hitAt = -Infinity;
    this.brokenAt = -Infinity;
  }

  activate(time) {
    this.raisedAt = time;
    this.brokenAt = -Infinity;
  }

  /** `dx, dy`: logical direction from the ship toward the hit (any length). */
  hit(time, dx, dy) {
    this.hitAt = time;
    const len = Math.hypot(dx, dy);
    if (len > 0) this.uniforms.uHitDir.value.set(dx / len, dy / len);
  }

  /** `flare`: the break flare's strength (Reduce Flashing lowers it). */
  break(time, flare = 1) {
    this.brokenAt = time;
    this.uniforms.uBreakFlare.value = flare;
  }

  /**
   * `active`: the shield is up; `level` its remaining share 0..1; `x, z`
   * world position and `radius` world units. Returns whether it draws.
   */
  update(time, active, level, x, z, radius) {
    const breaking = time - this.brokenAt < BREAK_TIME;
    const visible = (active || breaking) && radius > 0;
    this.mesh.visible = visible;
    if (!visible) return false;
    const u = this.uniforms;
    u.uLevel.value = Math.max(0, Math.min(1, level));
    u.uAppear.value = breaking
      ? 1
      : Math.min(1, (time - this.raisedAt) / APPEAR_TIME);
    const hitAge = time - this.hitAt;
    u.uHitAge.value = hitAge < HIT_TIME ? hitAge : -1;
    u.uBreakAge.value = breaking ? time - this.brokenAt : -1;
    this.mesh.position.set(x, 0, z);
    this.mesh.scale.set(radius, radius * DOME_HEIGHT, radius);
    return true;
  }

  reset() {
    this.raisedAt = -Infinity;
    this.hitAt = -Infinity;
    this.brokenAt = -Infinity;
    this.mesh.visible = false;
  }
}
