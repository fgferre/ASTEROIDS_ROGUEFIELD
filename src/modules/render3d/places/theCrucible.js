// The Crucible (docs/ROTEIRO.md "Os lugares" 10): the centre, the collector
// round the star. The star very close under the field, brighter and nearer
// than from the Furnace; round it arcs of the Ring being rebuilt at several
// depths — some stretches whole, some bare frames and gaps — turning
// slowly about it. Their running lights follow the Ring's wake (lit while
// it wakes, dim when it does not).

import { gradientDisc } from './kit.js';
import { lightPoint, under } from './pieces.js';

// proposta 12/11: the star's disc as a share of its corona's radius; the
// arcs (radius, height over the star, tilt, the stretch built and the
// stretch still bare, radians) in two groups turning at `spin` rad/s; the
// lights' level dead (`low`) and at full wake (`high`).
const DISC = 0.4;
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
const LIGHTS = { low: 0.4, high: 1.4 };

// One arc of modules round the star's axis: built decks with a keel, and
// in its bare stretch only the frames and two rails, waiting for plates.
function arc(kit, hull, lights, { radius, from, to, bare }) {
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
  const { tone } = kit;

  // The star: a bright disc, gently limb-darkened, in a wide corona.
  const star = kit.parts();
  kit.put(
    star,
    gradientDisc(
      THREE,
      (r) =>
        r < DISC
          ? 1 - 0.35 * (r / DISC) ** 3
          : 0.38 * Math.exp(-(r - DISC) * 5) + 0.05 * (1 - r),
      { rings: 20, sides: 56 }
    ),
    tone('#ffdca0', 0.7),
    [0, 0, 0],
    3800
  );

  const groups = [0, 1].map((g) => {
    const hull = kit.parts();
    const lights = kit.parts();
    ARCS.filter((spec) => spec.group === g).forEach((spec) => {
      const h = kit.parts();
      const l = kit.parts();
      arc(kit, h, l, spec);
      hull.push(
        ...kit.moved(h, [0, spec.height, 0], [spec.tilt, 0, spec.tilt * 0.6])
      );
      lights.push(
        ...kit.moved(l, [0, spec.height, 0], [spec.tilt, 0, spec.tilt * 0.6])
      );
    });
    const group = new THREE.Group();
    group.add(kit.mesh(hull), kit.mesh(lights, 'glow', 'crucible-lights'));
    return group;
  });
  const object = new THREE.Group();
  object.add(kit.mesh(star, 'glow'), ...groups);
  const lights = kit.materials.get('crucible-lights');
  return {
    layers: [{ object, anchor: under(3600, 250, 250), follow: 0.9 }],
    update(time, wake) {
      groups[0].rotation.y = time * SPIN[0];
      groups[1].rotation.y = time * SPIN[1];
      lights.color.setScalar(LIGHTS.low + (LIGHTS.high - LIGHTS.low) * wake);
    },
  };
}
