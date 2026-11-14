// Resonance Chamber (dense-core; docs/ROTEIRO.md "Os lugares" 6): a vast
// chamber inside the Ring. Massive ribs arch under the field from wall to
// wall, one after another into the distance, deep dark between them; the
// chamber's wall plates cling to the high sides and fall away into the dark
// below; the amber comes from thin cracks along the ribs and from deep
// under them, seen between. Deeper still, cold light shows through long
// cracks in the chamber's floor: what the Choir sings shut. They gape when
// the hymn breaks.

import { gradientDisc } from './kit.js';
import { SEAM_LIGHT, crack, seams, under } from './pieces.js';

// proposta 12/11: the ribs' arc (centre height, radius, angles from wall
// to wall through the bottom), their count, spacing and section; the wall
// plates reach from each end down to `wallDown` (angle, from the end).
const RIBS = {
  centre: 420,
  radius: 1900,
  from: 192,
  to: 348,
  count: 8,
  gap: 520,
  segments: 22,
  web: 190,
  depth: 150,
  flange: 330,
  wallDown: 34,
};

export function buildDenseCore(THREE, kit) {
  const { tone, random } = kit;
  const frame = kit.parts();
  const glow = kit.parts();
  const ribTones = [tone('#332c25'), tone('#2d2721'), tone('#38302a')];
  const flangeTone = tone('#3d342c');
  const plateTones = [tone('#211c18'), tone('#1c1815'), tone('#251f1a')];
  const ember = tone('#ff9a3a', 0.4);
  const DEG = Math.PI / 180;
  const { centre, radius: R, segments } = RIBS;
  const a0 = RIBS.from * DEG;
  const a1 = RIBS.to * DEG;
  const da = (a1 - a0) / segments;
  const seg = R * da;
  const arc = (a, r) => [Math.cos(a) * r, centre + Math.sin(a) * r];
  const z0 = (-(RIBS.count - 1) / 2) * RIBS.gap;
  const along = (a) => a + Math.PI / 2;

  for (let i = 0; i < RIBS.count; i += 1) {
    const z = z0 + i * RIBS.gap;
    const ribTone = ribTones[i % ribTones.length];
    for (let j = 0; j < segments; j += 1) {
      const a = a0 + (j + 0.5) * da;
      const turn = [0, 0, along(a)];
      // The rib: a deep web, a broad inner flange, an outer cap (an I).
      const [x, y] = arc(a, R);
      kit.box(
        frame,
        ribTone,
        [x, y, z],
        [seg * 1.03, RIBS.web, RIBS.depth],
        turn
      );
      const [fx, fy] = arc(a, R - RIBS.web / 2);
      kit.box(
        frame,
        flangeTone,
        [fx, fy, z],
        [seg * 1.03, 28, RIBS.flange],
        turn
      );
      const [cx, cy] = arc(a, R + RIBS.web / 2);
      kit.box(
        frame,
        ribTone,
        [cx, cy, z],
        [seg * 1.03, 24, RIBS.flange * 0.7],
        turn
      );
      // A crack of light along the flange's face, here and there.
      if (random() < 0.1) {
        const [gx, gy] = arc(a, R - RIBS.web / 2 - 16);
        const off = (random() - 0.5) * RIBS.flange * 0.6;
        kit.box(
          glow,
          ember,
          [gx, gy, z + off],
          [seg * (0.25 + random() * 0.3), 2, 3],
          [0, (random() - 0.5) * 0.5, along(a), 'ZYX']
        );
      }
      // The wall between this rib and the next: plates high on the sides
      // only, thinning out as the wall falls away.
      if (i === RIBS.count - 1) continue;
      const fromEnd = Math.min(a - a0, a1 - a) / DEG;
      if (fromEnd > RIBS.wallDown || random() < fromEnd / RIBS.wallDown)
        continue;
      const [px, py] = arc(a, R + RIBS.web / 2 + 30);
      kit.box(
        frame,
        plateTones[Math.floor(random() * plateTones.length)],
        [px, py, z + RIBS.gap / 2],
        [seg * 0.96, 34, RIBS.gap - RIBS.depth - 20],
        turn
      );
    }
  }
  // The deep light under the chamber, seen between the ribs: soft pools.
  for (let k = 0; k < 3; k += 1) {
    kit.put(
      glow,
      gradientDisc(THREE, (r) => (1 - r) ** 2, { rings: 8, sides: 32 }),
      tone('#ff8a30', 0.35 - k * 0.08),
      [(random() - 0.5) * 900, centre - R - 700 - k * 300, (k - 1) * 1200],
      [1500 + k * 300, 1, 1100]
    );
  }

  // proposta 12/11: the cracks in the floor, running down the chamber
  // under the ribs. Built along x, then turned along the chamber.
  const cracked = kit.parts();
  const gaping = kit.parts();
  const cold = tone(SEAM_LIGHT);
  [-520, 60, 610].forEach((x, i) =>
    crack(kit, cracked, gaping, cold, [(i - 1) * 500, centre - R - 420, x], {
      length: 2600 + random() * 900,
      width: 15,
      jag: 150,
      steps: 20,
      branches: 6,
    })
  );
  const cracks = seams(kit, cracked, gaping, 'chamber-seams', {
    rest: 0.2,
    open: 0.95,
  });
  cracks.object.rotation.y = Math.PI / 2;

  const object = new THREE.Group();
  object.add(kit.mesh(frame), kit.mesh(glow, 'glow'), cracks.object);
  object.rotation.set(0, 0.22, 0);
  return {
    layers: [{ object, anchor: under(380), follow: 0.3 }],
    update: cracks.give,
  };
}
