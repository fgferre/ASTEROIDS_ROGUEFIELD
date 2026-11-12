// Resonance Chamber (dense-core; docs/ROTEIRO.md "Os lugares" 6): a vast
// chamber inside the Ring. Its ribs arch under the field from side to side,
// one after another into the distance, the hull plates between them cracked
// and missing; the cracks and the holes glow with the light underneath.

import { gradientDisc } from './kit.js';
import { under } from './pieces.js';

// proposta 12/11: the ribs' arc (centre height, radius, angles from the
// side to the bottom and back), their count and spacing along the chamber.
const RIBS = {
  centre: 300,
  radius: 1700,
  from: 200,
  to: 340,
  count: 9,
  gap: 430,
  segments: 14,
};

export function buildDenseCore(THREE, kit) {
  const { tone, random } = kit;
  const frame = kit.parts();
  const glow = kit.parts();
  const ribTones = [tone('#2a2520'), tone('#25211d'), tone('#2f2923')];
  const plateTones = [tone('#1f1b18'), tone('#24201c'), tone('#1a1714')];
  const ember = tone('#ff9a3a', 0.25);
  const DEG = Math.PI / 180;
  const { centre, radius: R, segments } = RIBS;
  const a0 = RIBS.from * DEG;
  const a1 = RIBS.to * DEG;
  const da = (a1 - a0) / segments;
  const seg = R * da;
  const arc = (a, r) => [Math.cos(a) * r, centre + Math.sin(a) * r];
  const z0 = (-(RIBS.count - 1) / 2) * RIBS.gap;

  for (let i = 0; i < RIBS.count; i += 1) {
    const z = z0 + i * RIBS.gap;
    const tone0 = ribTones[i % ribTones.length];
    for (let j = 0; j < segments; j += 1) {
      const a = a0 + (j + 0.5) * da;
      const turn = [0, 0, a + Math.PI / 2];
      // The rib: a deep web and a broad inner flange (a T in section).
      const [x, y] = arc(a, R);
      kit.box(frame, tone0, [x, y, z], [seg * 1.02, 120, 110], turn);
      const [fx, fy] = arc(a, R - 70);
      kit.box(frame, ribTones[2], [fx, fy, z], [seg * 1.02, 26, 230], turn);
      // The hull plates behind, to the next rib; some gone, some cracked.
      if (i === RIBS.count - 1 || random() < 0.22) continue;
      const [px, py] = arc(a, R + 75);
      kit.box(
        frame,
        plateTones[Math.floor(random() * plateTones.length)],
        [px, py, z + RIBS.gap / 2],
        [seg * 0.98, 30, RIBS.gap - 120],
        turn
      );
      if (random() < 0.3) {
        // A crack across the plate: a short zigzag of light on its face.
        const [cx, cy] = arc(a, R + 58);
        let w = -RIBS.gap * 0.35;
        let off = (random() - 0.5) * seg * 0.5;
        while (w < RIBS.gap * 0.35) {
          const step = 50 + random() * 60;
          const next = (random() - 0.5) * seg * 0.6;
          const dx = next - off;
          kit.box(
            glow,
            ember,
            [
              cx + (Math.cos(a + Math.PI / 2) * (off + next)) / 2,
              cy + (Math.sin(a + Math.PI / 2) * (off + next)) / 2,
              z + RIBS.gap / 2 + w + step / 2,
            ],
            [3, 2, Math.hypot(dx, step)],
            [0, Math.atan2(dx, step), a + Math.PI / 2, 'ZYX']
          );
          off = next;
          w += step;
        }
      }
    }
  }
  // The light underneath, seen through the gaps.
  kit.put(
    glow,
    gradientDisc(THREE, (r) => 0.5 * (1 - r) ** 1.5, { rings: 8, sides: 32 }),
    tone('#ff8a30', 0.32),
    [0, centre - R - 600, 0],
    [2600, 1, RIBS.count * RIBS.gap * 0.7]
  );

  const object = new THREE.Group();
  object.add(kit.mesh(frame), kit.mesh(glow, 'glow'));
  object.rotation.set(0, 0.22, 0);
  return { layers: [{ object, anchor: under(250), follow: 0.3 }] };
}
