// The Crucible (docs/ROTEIRO.md "Os lugares" 10): the centre, the collector
// round the star. The star very close under the field, nearer than from the
// Furnace: a surface that boils slowly, a few spots, a limb going to red
// and a short corona with tongues of fire; round it arcs of the Ring being rebuilt at several
// depths — some stretches whole, some bare frames and gaps — turning
// slowly about it. Their running lights follow the Ring's wake (lit while
// it wakes, dim when it does not), and the set answers the campaign's
// ending (render3d/endingScene.js): past a full wake (Stewardship) the bare
// stretches are plated over in light; a wake that falls back from full
// (Severance) puts the lights out, stops the arcs and dims the star, until
// the set has been out of view — or at once, whatever came before, while
// the ending holds the set (`ending(true)`). The last image's slip
// (crucibleSlip.js) is built on one arc on the loading screen (`slip()`,
// endingTwin.js warm).

import { bakeStarMap } from '../bakedMaps.js';
import { buildSlip } from './crucibleSlip.js';
import { lightPoint, under } from './pieces.js';

// proposta 12/11: the arcs (radius, height over the star, tilt, the stretch built and the
// stretch still bare, radians) in two groups turning at `spin` rad/s; the
// lights' level dead (`low`) and at full wake (`high`).
const ARCS = [
  {
    group: 0,
    radius: 1700,
    height: 350,
    tilt: 0.22,
    from: 0.4,
    to: 4.2,
    bare: [2.6, 3.4],
  },
  {
    group: 1,
    radius: 2350,
    height: 1100,
    tilt: -0.16,
    from: 2.2,
    to: 7.4,
    bare: [5.6, 6.5],
  },
  {
    group: 0,
    radius: 2900,
    height: 1750,
    tilt: 0.1,
    from: 4.0,
    to: 6.6,
    bare: [4.0, 4.7],
  },
  {
    group: 1,
    radius: 1350,
    height: -150,
    tilt: -0.3,
    from: 5.0,
    to: 8.6,
    bare: [7.2, 7.9],
  },
];
const SPIN = [0.012, -0.008];
// proposta 21/11 ("Estrela de verdade"): the star's disc (its corona
// reaches `size`, the surface a `disc` share of it), its colours at the
// centre, the limb and in the corona (the shader's own levels), how much
// the cells show, the corona's fall and the whole's level (kept well under
// the field: it was a cream that washed out the gold boss and the orbs).
// The colours are sRGB hexes, read to the linear values they were tuned at.
const STAR = {
  size: 3800,
  disc: 0.4,
  core: ['#ffcc71', 1],
  edge: ['#e97132', 0.9],
  corona: ['#ffa04f', 0.9],
  grain: 0.45,
  fall: 7,
  level: 0.23,
};
const LIGHTS = { low: 0.4, high: 1.4 };
// proposta 12/11: the wake past 1 that plates every bare stretch (the
// Stewardship's own), the new plates' glow (proposta 24/11: brighter, so
// the answer reads in the ending's wide view), the star's level once
// severed and the seconds out of view after which a severed set is whole
// again.
const PLATED_AT = 1.25;
const PLATING = 1.6;
const SEVERED_STAR = 0.45;
const FORGET = 1;
// The arc the last image's slip is built on (crucibleSlip.js).
const SLIP_ARC = 1;

const STAR_VERTEX = `
varying vec2 vAt;
void main() {
  vAt = position.xz / ${STAR.size.toFixed(1)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// Two reads of the cells drifting apart make them seem to boil; the limb
// darkens toward red; past it a corona with a few tongues standing off it.
const STAR_FRAGMENT = `
precision highp float;
uniform sampler2D uMap;
uniform float uTime;
uniform float uLevel;
uniform float uOpacity;
uniform vec3 uCore;
uniform vec3 uEdge;
uniform vec3 uCorona;
varying vec2 vAt;
void main() {
  float disc = ${STAR.disc.toFixed(2)};
  float r = length(vAt);
  vec3 color;
  if (r < disc) {
    float mu = sqrt(max(0.0, 1.0 - (r / disc) * (r / disc)));
    vec2 p = vAt / disc;
    float a = texture2D(uMap, p + vec2(uTime * 0.004, uTime * 0.0025)).r;
    float b = texture2D(uMap, p * 1.37 + vec2(-uTime * 0.003, uTime * 0.0035)).r;
    float cells = mix(1.0, a * 0.6 + b * 0.4, ${STAR.grain.toFixed(2)});
    color = mix(uEdge, uCore, pow(mu, 0.6)) * (0.35 + 0.65 * sqrt(mu)) * cells;
  } else {
    float t = (r - disc) / disc;
    float angle = atan(vAt.y, vAt.x);
    float tongue = pow(max(0.0, sin(angle * 5.0 + 1.3) * sin(angle * 3.0 - 0.4)), 6.0);
    color = uCorona * (0.42 * exp(-t * ${STAR.fall.toFixed(1)}) + 0.5 * tongue * exp(-t * 14.0));
  }
  gl_FragColor = vec4(color * ${STAR.level.toFixed(2)} * uLevel * uOpacity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// The star, faded with the set like its other materials (PlaceSets.apply
// sets `opacity`; the mesh hands it to the shader as it draws).
function star(THREE, kit) {
  const color = ([css, k]) => new THREE.Color(css).multiplyScalar(k);
  const material = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uMap: { value: bakeStarMap(THREE, 5) },
      uTime: { value: 0 },
      uLevel: { value: 1 },
      uOpacity: { value: 1 },
      uCore: { value: color(STAR.core) },
      uEdge: { value: color(STAR.edge) },
      uCorona: { value: color(STAR.corona) },
    },
  });
  kit.materials.set('crucible-star', material);
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(STAR.size, 96).rotateX(-Math.PI / 2),
    material
  );
  mesh.onBeforeRender = () => {
    material.uniforms.uOpacity.value = material.opacity;
  };
  return mesh;
}

// One arc of modules round the star's axis: built decks with a keel, and
// in its bare stretch only the frames and two rails, waiting for plates.
function arc(kit, hull, lights, plating, { radius, from, to, bare }) {
  const { tone, random } = kit;
  const decks = [tone('#3a3630'), tone('#423d36'), tone('#35312c')];
  const frame = tone('#4a443b');
  const lamp = tone('#ffd890', 1);
  const width = 110;
  const thick = 26;
  const step = 70 / radius;
  for (let a = from; a < to; a += step) {
    const mid = a + step / 2;
    const at = (r, y) => [Math.cos(mid) * r, y, Math.sin(mid) * r];
    const turn = [0, -(mid + Math.PI / 2), 0];
    const along = radius * step;
    if (mid > bare[0] && mid < bare[1]) {
      kit.box(
        hull,
        frame,
        at(radius, 0),
        [along * 0.18, thick * 2.4, width * 1.2],
        turn
      );
      [-1, 1].forEach((side) =>
        kit.box(
          hull,
          frame,
          at(radius + (side * width) / 2, thick),
          [along * 1.02, 8, 8],
          turn
        )
      );
      // the deck this frame waits for, laid in light by the Stewardship
      kit.box(plating, lamp, at(radius, 0), [along * 0.95, thick, width], turn);
      continue;
    }
    kit.box(
      hull,
      decks[Math.floor(random() * 3)],
      at(radius, 0),
      [along * 0.95, thick, width],
      turn
    );
    kit.box(
      hull,
      decks[2],
      at(radius, -thick),
      [along * 0.7, thick, width * 0.45],
      turn
    );
    if (random() < 0.22) {
      const side = random() < 0.5 ? -1 : 1;
      lightPoint(
        kit,
        lights,
        lamp,
        at(radius + side * width * 0.5, thick * 0.7),
        9
      );
    }
  }
}

export function buildTheCrucible(THREE, kit) {
  const sun = star(THREE, kit);

  const groups = [0, 1].map((g) => {
    const lists = [kit.parts(), kit.parts(), kit.parts()];
    ARCS.filter((spec) => spec.group === g).forEach((spec) => {
      const own = [kit.parts(), kit.parts(), kit.parts()];
      arc(kit, ...own, spec);
      own.forEach((parts, i) =>
        lists[i].push(
          ...kit.moved(
            parts,
            [0, spec.height, 0],
            [spec.tilt, 0, spec.tilt * 0.6]
          )
        )
      );
    });
    const [hull, lights, plating] = lists;
    const group = new THREE.Group();
    group.add(
      kit.mesh(hull),
      kit.mesh(lights, 'glow', 'crucible-lights'),
      kit.mesh(plating, 'glow', 'crucible-plating')
    );
    return group;
  });
  const object = new THREE.Group();
  object.add(sun, ...groups);
  const lights = kit.materials.get('crucible-lights');
  const plating = kit.materials.get('crucible-plating');
  const starLight = sun.material.uniforms;
  plating.color.setScalar(0);
  // The ending's memory: the wake has been full, and how far it fell since.
  let woke = false;
  let severed = 0;
  let last = 0;
  const turned = [0, 0];
  let held = false;
  let slip = null;
  return {
    layers: [{ object, anchor: under(3600, 250, 250), follow: 0.9 }],
    /** Whether the ending holds the set: a wake under full severs it. */
    ending(on) {
      held = on;
    },
    /**
     * The last image's slip, built on its arc on the first call, its twin
     * drawn from `wake` (the opening's, buildWake's).
     */
    slip(wake) {
      if (!slip) {
        const spec = ARCS[SLIP_ARC];
        slip = buildSlip(THREE, kit, spec, wake);
        groups[spec.group].add(slip.object);
      }
      return slip;
    },
    update(time, wake) {
      const dt = Math.max(0, time - last);
      if (held) woke = true;
      else if (dt > FORGET) {
        woke = false;
        severed = 0;
      }
      last = time;
      if (wake >= 1) woke = true;
      if (woke) severed = Math.max(0, 1 - wake);
      const run = Math.min(dt, 0.1) * (1 - severed);
      groups.forEach((group, g) => {
        turned[g] += SPIN[g] * run;
        group.rotation.y = turned[g];
      });
      const lit = LIGHTS.low + (LIGHTS.high - LIGHTS.low) * wake;
      lights.color.setScalar(lit * (1 - severed));
      starLight.uTime.value = time;
      starLight.uLevel.value = 1 - (1 - SEVERED_STAR) * severed;
      const plated = Math.min(1, Math.max(0, (wake - 1) / (PLATED_AT - 1)));
      plating.color.setScalar(PLATING * plated);
    },
  };
}
