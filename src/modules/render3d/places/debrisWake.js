// Debris Wake (docs/ROTEIRO.md "Os lugares" 1): far outside the Ring, in the
// tail of its wreckage. The whole Ring small and broken in the distance, a
// cold small star, and wreck plates drifting between them and the field.

import { gradientDisc } from './kit.js';
import { ringBand, under } from './pieces.js';

export function buildDebrisWake(THREE, kit) {
  const { tone, random } = kit;

  // The whole Ring, its gap open, leaning so it reads as a ring.
  const hull = kit.parts();
  const lights = kit.parts();
  ringBand(kit, hull, lights, {
    radius: 900,
    count: 110,
    width: 90,
    thick: 22,
    gap: [2.05, 2.45],
    tones: [tone('#3a414c'), tone('#465060'), tone('#343a44')],
    light: tone('#ffb060', 1.1),
    lightEvery: 17,
  });
  const ring = new THREE.Group();
  ring.add(kit.mesh(hull), kit.mesh(lights, 'glow'));
  ring.rotation.set(1.05, 0.35, 0.2, 'YXZ');

  // The cold star: a hard point in a wide faint halo.
  const star = kit.parts();
  kit.put(
    star,
    gradientDisc(
      THREE,
      (r) => (r < 0.035 ? 1.6 : 0.3 * Math.exp(-(r - 0.035) * 6)),
      { rings: 14, sides: 40 }
    ),
    tone('#d6e4ff', 2.2),
    [0, 0, 0],
    800
  );

  // Wreck plates and a torn module or two, tumbling, nearer.
  const wreck = kit.parts();
  const plates = [tone('#1d2025'), tone('#24272c'), tone('#181a1e')];
  for (let i = 0; i < 22; i += 1) {
    const size = 30 + random() ** 2 * 80;
    const at = [
      (random() - 0.5) * 2400,
      (random() - 0.5) * 400,
      (random() - 0.5) * 1700,
    ];
    const turn = [random() * 6, random() * 6, random() * 6];
    const plate = plates[i % plates.length];
    if (i % 6 === 0) {
      kit.box(wreck, plate, at, [size, size * 0.28, size * 0.6], turn);
      kit.box(
        wreck,
        plates[2],
        [at[0], at[1] - size * 0.2, at[2]],
        [size * 0.7, size * 0.25, size * 0.3],
        turn
      );
    } else {
      kit.box(
        wreck,
        plate,
        at,
        [size, size * 0.06, size * (0.3 + random() * 0.5)],
        turn
      );
    }
  }

  return {
    layers: [
      {
        object: kit.mesh(star, 'glow'),
        anchor: under(4100, -1250, -450),
        follow: 0.96,
      },
      { object: ring, anchor: under(3000, 420, 120), follow: 0.9 },
      { object: kit.mesh(wreck), anchor: under(1400), follow: 0.3 },
    ],
  };
}
