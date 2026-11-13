// The Sentinels' danger language, shared by every boss attack telegraph.js
// draws for them (not the Wardens', the Ram's or a recipe enemy's, which keep
// their flat look): two additive shaders on the telegraph meshes, so no draw
// is added.
// - A beam on the lane plane (x 0..1 from its emitter, z across): a hot
//   core in a softer sheath, edges where it stops hurting. Warning, a pale
//   guide with dashed edges and a charge front running out from the
//   emitter; active, full and bright, pulses running along it and a flare
//   where it ends.
// - A zone on a fan, disc or ring sector (polar, from its emitter): an edge
//   that burns in while it warns and holds bright once it is live, and a
//   body by style: HEAT (shimmering tongues and embers flowing out), SLAG
//   (a landing mark, then molten crust), PULL (rings flowing in to the
//   mouth), FIELD (a projected lattice) and WASH (a faint sheen).
// The drawn size is the mesh's: the hit area is the truth, never wider.

const TAU = Math.PI * 2;

export const ZONE = Object.freeze({
  HEAT: 0,
  SLAG: 1,
  PULL: 2,
  FIELD: 3,
  WASH: 4,
});

// proposta 13/11: the hot white the cores burn at (× the zone's colour).
const HOT = '#ffd9b8';

const COMMON = `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uWarn;
uniform float uProgress;
uniform float uGain;
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 1 on a line w px wide at distance d px, soft over a pixel
float line(float d, float w) {
  return 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.0, abs(d));
}
`;

const BEAM_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// uLength/uWidth: the mesh's size in field px; uOrigin: where along it (px)
// the emitter sits, everything runs away from there; uFront: how far (px
// from the origin) the charge front has run; uFlow: pulses run out (+1) or
// in (−1); uCore: the hot core's share (0: an even bar); uChevron: arrows
// down a lane instead of pulses; uFlare: the far end flares (an impact).
const BEAM_FRAGMENT = `
${COMMON}
uniform float uLength;
uniform float uWidth;
uniform float uOrigin;
uniform float uFront;
uniform float uFlow;
uniform float uCore;
uniform float uChevron;
uniform float uFlare;
void main() {
  float a = vUv.x * uLength;
  float s = abs(a - uOrigin);
  float halfW = 0.5 * uWidth;
  float off = (vUv.y - 0.5) * uWidth;
  float d = abs(off) / max(halfW, 0.5);
  float coreW = clamp(0.22 * uWidth, 1.2, 5.0);
  float core = uCore * exp(-pow(abs(off) / (0.5 * coreW + 0.5), 2.0));
  float sheath = clamp(1.0 - d * d, 0.0, 1.0);
  float edge = line(abs(off) - halfW + 0.75, 1.5) * step(2.5, uWidth);
  float t = uTime;
  float lit = step(s, uFront);
  float head = exp(-pow((s - uFront) / 10.0, 2.0)) * step(uFront, 1e4)
    * mix(1.0, 0.35 * sheath, uChevron);
  // arrows down a lane: chevrons pointing away from the origin
  float chev = line(fract((s - abs(off) * 0.7) / 48.0 - t * 1.6 * uFlow) * 48.0 - 24.0, 7.0)
    * uChevron * step(abs(off), halfW - 4.0);
  vec3 col;
  float alpha;
  if (uWarn > 0.5) {
    // the guide: a hairline, dashed edges marching out, the charge front
    float dash = step(0.5, fract(s / 14.0 - t * 2.0 * uFlow));
    float guide = 0.35 + 0.5 * lit;
    float fill = (0.05 + 0.15 * uProgress) * sheath * (1.0 - 0.6 * uChevron);
    alpha = core * guide * 0.9 + edge * dash * (0.3 + 0.5 * uProgress)
      + fill * lit + head * (0.4 + 0.6 * uCore) + chev * lit * (0.15 + 0.35 * uProgress);
    col = mix(uColor, uHot, 0.35 * core + 0.6 * head);
  } else {
    // live: a hot core in its sheath, pulses running along it
    float pulse = pow(0.5 + 0.5 * sin((s / 46.0 - t * 5.0 * uFlow) * 6.2832), 6.0) * (1.0 - uChevron);
    float grain = 0.85 + 0.3 * noise(vec2(s / 9.0 - t * 30.0 * uFlow, off / 3.0));
    float flare = uFlare * exp(-pow((uLength - a) / 12.0, 2.0));
    float body = mix(0.55, 0.12, uChevron) * sheath + 0.3 * pulse * sheath;
    alpha = (body * grain + 1.2 * core + 0.9 * edge + flare * sheath + 0.8 * chev) * mix(1.0, 0.35, step(s, uFront) * uChevron);
    col = mix(uColor, uHot, clamp(core * 0.9 + 0.3 * pulse * sheath + flare + 0.3 * chev, 0.0, 1.0));
  }
  gl_FragColor = vec4(col * alpha * uGain, 1.0);
}`;

// Polar: vPos is the unit fan/disc/ring (its own +x the centre line);
// uRadius px; uArc its full angle (2π a disc); uInner the ring's hole (share).
const ZONE_VERTEX = `
varying vec2 vUv;
varying vec2 vPos;
void main() {
  vUv = uv;
  vPos = vec2(position.x, -position.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ZONE_FRAGMENT = `
${COMMON}
uniform float uRadius;
uniform float uArc;
uniform float uInner;
uniform float uStyle;
uniform float uSeed;
varying vec2 vPos;
void main() {
  float r = length(vPos) * uRadius;
  float theta = atan(vPos.y, vPos.x);
  float halfArc = 0.5 * uArc;
  float disc = step(6.2, uArc);
  // px to the nearest edge: the outer arc, the radial sides, the hole
  float side = mix(r * sin(max(0.0, halfArc - abs(theta))), 1e5, disc);
  float outer = uRadius - r;
  float hole = mix(1e5, r - uInner * uRadius, step(0.001, uInner));
  float edgeD = min(min(side, outer), hole);
  float t = uTime;
  float warn = step(0.5, uWarn);
  float u = r / uRadius;
  // where along its edge a point sits (0..1), for the burn-in: out along
  // the sides, then round the arc; round a disc, a clock hand
  float along = disc > 0.5
    ? fract((theta + 1.5708) / 6.2832)
    : (side < outer ? 0.5 * u : 0.5 + 0.5 * (1.0 - abs(theta) / max(halfArc, 0.001)));
  float burnt = warn > 0.5 ? step(along, uProgress) : 1.0;
  float edgeW = warn > 0.5 ? 1.5 : 2.5;
  float edge = line(edgeD - edgeW * 0.5, edgeW);
  float glowIn = exp(-edgeD / (warn > 0.5 ? 4.0 : 9.0));
  vec3 col = uColor;
  float alpha = 0.0;
  float hot = 0.0;
  if (uStyle < 0.5) {
    // HEAT: tongues flowing out from the vent, embers riding them
    float ang = theta * uRadius / 90.0;
    float waver = 0.35 * sin(r / 45.0 - t * 2.3 + uSeed);
    float tongues = noise(vec2(ang * 1.1 + waver, r / 60.0 - t * 1.4))
      * (0.6 + 0.4 * noise(vec2(ang * 3.0, r / 25.0 - t * 2.5)));
    tongues = smoothstep(0.3, 0.8, tongues);
    vec2 cell = vec2(floor(ang * 9.0), floor(r / 26.0 - t * 2.2));
    vec2 fr = vec2(fract(ang * 9.0), fract(r / 26.0 - t * 2.2));
    float ember = step(0.86, hash(cell + uSeed)) * exp(-dot(fr - 0.5, fr - 0.5) * 60.0);
    float near = exp(-u * 2.5);
    if (warn > 0.5) {
      float front = exp(-pow((u - uProgress) * uRadius / 18.0, 2.0)) * step(u, uProgress + 0.05);
      float hatch = step(0.82, fract((r * cos(theta - 0.785)) / 18.0 - t * 0.6));
      alpha = 0.05 * uProgress + 0.08 * hatch * step(u, uProgress) + 0.35 * front;
      hot = 0.4 * front;
    } else {
      alpha = 0.1 + 0.3 * tongues + 0.25 * near + 1.2 * ember + 0.18 * glowIn;
      hot = 0.6 * tongues * (0.3 + near) + ember;
    }
  } else if (uStyle < 1.5) {
    // SLAG: a landing mark, then a molten crust
    if (warn > 0.5) {
      float ring = line(r - uRadius * 0.55, 1.0) * 0.5;
      vec2 q = abs(vPos);
      float crossMark = (line(q.x * uRadius, 1.5) * step(uRadius * 0.62, q.y * uRadius)
        + line(q.y * uRadius, 1.5) * step(uRadius * 0.62, q.x * uRadius)) * step(r, uRadius - 3.0);
      float closing = exp(-pow((u - (1.0 - uProgress)) * uRadius / 5.0, 2.0)) * 0.5;
      alpha = 0.04 + 0.1 * uProgress + ring + 0.7 * crossMark + closing;
      hot = closing;
    } else {
      vec2 p = vPos * uRadius / 16.0;
      float n = noise(p + vec2(uSeed, t * 0.25)) * 0.65 + noise(p * 2.3 - t * 0.4) * 0.35;
      float crack = 1.0 - smoothstep(0.03, 0.12, abs(n - 0.5));
      float cool = 1.0 - 0.6 * uProgress;
      float bubble = step(0.93, noise(p * 1.7 + t * 0.9));
      alpha = (0.16 + 0.7 * crack + 0.4 * bubble) * cool + 0.35 * glowIn;
      hot = (0.7 * crack + bubble) * cool;
    }
  } else if (uStyle < 2.5) {
    // PULL: rings and streamlines flowing in to the mouth
    float speed = warn > 0.5 ? 0.6 : 2.2;
    float rings = pow(0.5 + 0.5 * sin((r / 34.0 + t * speed) * 6.2832), 8.0);
    float streams = step(0.9, fract(theta * uRadius / 30.0 + 0.5)) * step(0.5, fract(r / 22.0 + t * speed * 1.5));
    float lean = 1.0 - u;
    if (warn > 0.5) {
      alpha = 0.03 + 0.06 * uProgress + 0.18 * rings * uProgress;
    } else {
      alpha = 0.05 + (0.32 * rings + 0.2 * streams) * (0.4 + 0.6 * lean);
      hot = 0.4 * rings * lean;
    }
  } else if (uStyle < 3.5) {
    // FIELD: a lattice projected from the claw, scanning out
    float spokes = line(fract(theta * uRadius / 24.0 + 0.5) * 24.0 - 12.0, 1.0);
    float arcs = line(fract(r / 26.0 - t * (warn > 0.5 ? 0.5 : 1.5)) * 26.0 - 13.0, 1.0);
    float lattice = max(spokes, arcs);
    float spine = exp(-pow(theta * r / 10.0, 2.0));
    if (warn > 0.5) {
      alpha = 0.03 + 0.05 * uProgress + 0.25 * lattice * uProgress;
    } else {
      float shimmer = 0.8 + 0.4 * noise(vec2(theta * 8.0, r / 18.0 - t * 4.0));
      alpha = (0.13 + 0.45 * lattice) * shimmer + 0.5 * spine;
      hot = 0.6 * spine;
    }
  } else {
    // WASH: faint, a slow sheen sweeping round
    float sheen = pow(0.5 + 0.5 * sin(theta * 3.0 - t * 1.2), 6.0);
    alpha = 0.5 + 0.5 * sheen;
  }
  float edgeA = edge * burnt * (warn > 0.5 ? 0.55 + 0.45 * uProgress : 1.0);
  alpha += edgeA * (uStyle > 3.5 ? 0.0 : 1.0);
  hot = clamp(hot + edgeA * (warn > 0.5 ? 0.2 : 0.5), 0.0, 1.0);
  col = mix(uColor, uHot, hot);
  gl_FragColor = vec4(col * alpha * uGain, 1.0);
}`;

/**
 * The shared shaders and their per-frame setters.
 * @param {object} THREE - the global THREE.
 * @param {Function} colorOf - batches.js colorOf (linear colour from hex).
 * @param {Function} seeded - runs a maker under the seeded random (a
 *   material's id draws on it).
 */
export function createTelegraphLook(THREE, colorOf, seeded) {
  const time = { value: 0 };
  const hot = colorOf(THREE, HOT);

  function material(vertexShader, fragmentShader, extra) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color() },
        uHot: { value: hot.clone() },
        uWarn: { value: 1 },
        uProgress: { value: 0 },
        uGain: { value: 1 },
        uTime: time,
        ...extra,
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }

  // A mesh's look material, made once and kept on it; the mesh wears it from
  // now on (each telegraph mesh serves one boss).
  function wear(mesh, key, make) {
    if (!mesh.userData[key]) mesh.userData[key] = seeded(make);
    mesh.material = mesh.userData[key];
    return mesh.material.uniforms;
  }

  /** The clock every look shares (s). */
  function tick(seconds) {
    time.value = seconds % 1000;
  }

  /**
   * A beam on `mesh` (the lane plane), placed and scaled here: from field
   * point (x, y) (relative to its group) along `angle`, `length` × `width`
   * px. `warn` true while it warns; `origin` px along it where the emitter
   * sits; `front` px the charge front has run from there (Infinity: all);
   * `core` 0..1; `chevron`, `flare` 0/1.
   */
  function beam(mesh, o) {
    const u = wear(mesh, 'beamLook', () =>
      material(BEAM_VERTEX, BEAM_FRAGMENT, {
        uLength: { value: 1 },
        uWidth: { value: 1 },
        uOrigin: { value: 0 },
        uFront: { value: 0 },
        uFlow: { value: 1 },
        uCore: { value: 1 },
        uChevron: { value: 0 },
        uFlare: { value: 0 },
      })
    );
    const length = Math.max(0.01, o.length);
    mesh.visible = true;
    mesh.position.set(o.x, 0, o.y);
    mesh.rotation.y = -o.angle;
    mesh.scale.set(length, 1, Math.max(0.5, o.width));
    u.uColor.value.copy(o.color);
    u.uWarn.value = o.warn ? 1 : 0;
    u.uProgress.value = o.progress;
    u.uGain.value = o.gain;
    u.uLength.value = length;
    u.uWidth.value = o.width;
    u.uOrigin.value = o.origin ?? 0;
    u.uFront.value = Math.min(1e5, o.front ?? Infinity);
    u.uFlow.value = o.flow ?? 1;
    u.uCore.value = o.core ?? 1;
    u.uChevron.value = o.chevron ?? 0;
    u.uFlare.value = o.flare ?? 0;
  }

  /**
   * A zone on `mesh` (a fan, disc or ring sector scaled to `radius` px):
   * `arc` its full angle (TAU a disc), `inner` the ring's hole (share),
   * `style` one of ZONE; `hot` the colour its hottest parts reach.
   */
  function zone(mesh, o) {
    const { color, warn, progress, gain, radius, style } = o;
    const u = wear(mesh, 'zoneLook', () =>
      material(ZONE_VERTEX, ZONE_FRAGMENT, {
        uRadius: { value: 1 },
        uArc: { value: TAU },
        uInner: { value: 0 },
        uStyle: { value: 0 },
        uSeed: { value: 0 },
      })
    );
    u.uColor.value.copy(color);
    u.uHot.value.copy(o.hot ?? hot);
    u.uWarn.value = warn ? 1 : 0;
    u.uProgress.value = progress;
    u.uGain.value = gain;
    u.uRadius.value = radius;
    u.uArc.value = o.arc ?? TAU;
    u.uInner.value = o.inner ?? 0;
    u.uStyle.value = style;
    u.uSeed.value = o.seed ?? 0;
  }

  return { tick, beam, zone };
}
