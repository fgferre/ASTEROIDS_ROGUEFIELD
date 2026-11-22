// The player hull's livery (the owner, 21/11: "quando você olha um avião,
// ele não é liso"): a coat painted from above over the hull's top faces,
// drawn here in a 2D canvas from the hull's own art data, each mark where it
// would come from: paint worn off the leading edges with impact pits,
// service hatches with screws and hand wear round them, grime gathered in
// the seams and dragged aft from the vents, soot behind the nose cannon,
// heat-stained metal round the nozzles, rust only round screws and in seams
// (none on the Interceptor), and the markings (the hull's code on each
// wing, NO STEP on the wing root, warning chevrons by the tip jets, an
// accent stripe down the spine). A second canvas, the mask, tells the
// shader what each mark is made of: bare metal (red: shiny, metallic),
// grime (green: dull), rust (blue: dull, not metal). playerMirror.js and
// MenuHullPreview.js patch their hull materials with patch().
// `visual.livery` per hull: { code, wear 0..1, rust 0..1, chip [r, g, b] }.

import { SHIP_SIZE } from '../../data/constants/physics.js';

const PX = 40; // canvas pixels per hull unit (~1200 × 900 for the Bastion)
const PAD = 2; // hull units round the hull's outline

/** The livery's uniforms for patch(), shared by a hull's materials. */
export function uniforms(THREE) {
  return {
    key: null,
    uLivery: { value: null },
    uLiveryMask: { value: null },
    uLiveryBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  };
}

/**
 * Dresses `uniforms` (from uniforms()) in the livery of a hull `geometry`
 * with its `visual.livery`, painted again only when `key` (the hull and its
 * upgrade levels) changes; only the livery shown is kept, the last one's
 * textures are freed (two canvases of a few MB each). Call inside the
 * caller's seeded wrapper.
 */
export function show(uniforms, THREE, geometry, livery, key) {
  if (uniforms.key === key) return;
  uniforms.uLivery.value?.dispose();
  uniforms.uLiveryMask.value?.dispose();
  const coat = paint(THREE, geometry, livery);
  uniforms.uLivery.value = coat.color;
  uniforms.uLiveryMask.value = coat.mask;
  uniforms.uLiveryBox.value.copy(coat.box);
  uniforms.key = key;
}

/**
 * A material's onBeforeCompile step: the livery over the vertex colour on
 * faces turned up (the sides stay clean), and its mask on the roughness and
 * metalness.
 */
export function patch(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\nvarying vec2 vLiveryPos;\nvarying float vLiveryUp;'
    )
    .replace(
      '#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\nvLiveryUp = objectNormal.y;'
    )
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvLiveryPos = position.xz;'
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      varying vec2 vLiveryPos;
      varying float vLiveryUp;
      uniform sampler2D uLivery;
      uniform sampler2D uLiveryMask;
      uniform vec4 uLiveryBox;
      vec4 liveryMask;`
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 liveryUv = (vLiveryPos - uLiveryBox.xy) / uLiveryBox.zw;
      liveryUv.y = 1.0 - liveryUv.y;
      float liveryFace = smoothstep(0.3, 0.7, vLiveryUp);
      vec4 livery = texture2D(uLivery, liveryUv);
      liveryMask = texture2D(uLiveryMask, liveryUv) * liveryFace;
      diffuseColor.rgb = mix(diffuseColor.rgb, pow(livery.rgb, vec3(2.2)),
        livery.a * liveryFace);`
    )
    .replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.2, liveryMask.r);
      metalnessFactor = mix(metalnessFactor, 1.0, liveryMask.r);
      roughnessFactor = mix(roughnessFactor, 0.85, max(liveryMask.g, liveryMask.b));
      metalnessFactor = mix(metalnessFactor, 0.1, liveryMask.b);`
    );
}

// The livery of a hull `geometry` (hullArt.js) with its `visual.livery`:
// { color, mask } textures and `box` (x, z of the canvas's corner and its
// size, hull units).
function paint(THREE, geometry, livery) {
  const { code, wear, rust, chip } = livery;
  const rows = geometry.form.body.map((row) => row.map((v) => v * SHIP_SIZE));
  const halfAt = (x) => {
    const i = rows.findIndex((row) => row[0] <= x);
    if (i <= 0) return rows[Math.max(0, i)][1];
    const [a, b] = [rows[i - 1], rows[i]];
    return a[1] + ((b[1] - a[1]) * (a[0] - x)) / (a[0] - b[0] || 1);
  };
  const nose = rows[0][0];
  const tail = rows[rows.length - 1][0];
  const minX = geometry.minX - PAD;
  const maxX = geometry.maxX + PAD;
  const maxZ = geometry.maxY + PAD;
  const width = Math.ceil((maxX - minX) * PX);
  const height = Math.ceil(2 * maxZ * PX);
  const canvasOf = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const colorCanvas = canvasOf();
  const maskCanvas = canvasOf();
  const c = colorCanvas.getContext('2d');
  const m = maskCanvas.getContext('2d');
  m.globalCompositeOperation = 'lighter';
  const X = (x) => (x - minX) * PX;
  const Z = (z) => (z + maxZ) * PX;
  let seed = 4721;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const [cr, cg, cb] = chip;
  const BARE = 'rgba(255,0,0,0.9)';
  const GRIME = 'rgba(0,110,0,0.6)';
  const RUST = 'rgba(0,0,220,0.8)';

  // an oval mark on the colour and, when given, the mask
  const dab = (x, z, w, h, colour, mark, turn = 0) => {
    for (const [ctx, fill] of [
      [c, colour],
      [m, mark],
    ]) {
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(X(x), Z(z), w * PX, h * PX, turn, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  // a trail fading aft from (x, z)
  const streak = (x, z, length, thick, rgb, alpha, mark) => {
    const y = Z(z) - (thick * PX) / 2;
    const fade = (ctx, from) => {
      const gradient = ctx.createLinearGradient(X(x), 0, X(x - length), 0);
      gradient.addColorStop(0, from);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(X(x - length), y, length * PX, thick * PX);
    };
    fade(c, `rgba(${rgb},${alpha})`);
    if (mark) fade(m, mark);
  };

  // Leading edges (the panels' forward-facing sides and the nose): paint
  // worn to bare metal by the dust, most chips right on the edge, and pits.
  const leading = [
    [
      { x: nose - 0.2, y: -halfAt(nose - 1) },
      { x: nose - 0.2, y: halfAt(nose - 1) },
    ],
  ];
  geometry.panels.forEach(({ points }) => {
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      if ((a.x + b.x) / 2 >= cx && Math.abs(b.y - a.y) / length >= 0.25) {
        leading.push([a, b]);
      }
    });
  });
  leading.forEach(([a, b]) => {
    const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 9 * wear);
    for (let k = 0; k < count; k += 1) {
      const t = random();
      const x = a.x + (b.x - a.x) * t - random() ** 2 * 0.45;
      const z = a.y + (b.y - a.y) * t;
      const size = 0.03 + random() * 0.1;
      const colour = `rgba(${cr},${cg},${cb},0.9)`;
      dab(x, z, size * (1 + random()), size, colour, BARE, random() * 3);
    }
    for (let k = 0; k < count / 2; k += 1) {
      const t = random();
      const x = a.x + (b.x - a.x) * t - random() * 1.2;
      dab(x, a.y + (b.y - a.y) * t, 0.035, 0.035, 'rgba(25,25,28,0.7)', null);
    }
  });

  // Service hatches on the fuselage's flanks: an outline, four screws
  // (rusting on worn hulls), hand wear round them, grime dragged aft.
  c.lineWidth = Math.max(1, 0.05 * PX);
  [nose * 0.25, tail * 0.35].forEach((x) => {
    [-1, 1].forEach((side) => {
      const z = side * halfAt(x) * 0.62;
      const [w, h] = [1.6, 0.9];
      for (let k = 0; k < 26 * wear; k += 1) {
        const turn = random() * Math.PI * 2;
        const colour = `rgba(${cr},${cg},${cb},0.7)`;
        const at = [
          x + Math.cos(turn) * w * 0.6,
          z + Math.sin(turn) * h * 0.65,
        ];
        dab(...at, 0.05, 0.035, colour, BARE, turn);
      }
      c.strokeStyle = 'rgba(20,22,26,0.75)';
      c.strokeRect(X(x - w / 2), Z(z - h / 2), w * PX, h * PX);
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].forEach(([sx, sz]) => {
        const [qx, qz] = [x + sx * (w / 2 - 0.15), z + sz * (h / 2 - 0.15)];
        dab(qx, qz, 0.06, 0.06, 'rgba(160,165,170,0.95)', BARE);
        if (random() < rust) {
          dab(qx, qz, 0.11, 0.11, 'rgba(120,58,26,0.75)', RUST);
          streak(qx, qz, 0.6 + random() * 1.6, 0.05, '110,52,24', 0.6, RUST);
        }
      });
      for (let k = 0; k < 6; k += 1) {
        const at = [x - w / 2, z + (random() - 0.5) * h];
        streak(...at, 0.8 + random() * 2, 0.04, '30,26,22', 0.35 * wear, GRIME);
      }
    });
  });

  // Seams: grime gathered along the panel outlines, rust in them on worn
  // hulls.
  geometry.panels.forEach(({ points }) => {
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      for (let k = 0; k < length * 3; k += 1) {
        const t = random();
        const [x, z] = [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
        if (random() < 0.5) {
          const long = 0.3 + random() * 1.2;
          streak(x, z, long, 0.04, '28,24,20', 0.35 * wear, GRIME);
        }
        if (random() < 0.18 * rust) {
          dab(x, z, 0.09, 0.05, 'rgba(116,56,24,0.7)', RUST);
          streak(x, z, 0.4 + random(), 0.04, '110,52,24', 0.5, RUST);
        }
      }
    });
  });

  // Soot trails behind the spine's vents and behind the nose cannon.
  [0.72, 0.56, 0.4].forEach((t) => {
    for (let k = 0; k < 5; k += 1) {
      const at = [tail * t - 0.3, (random() - 0.5) * 1.4];
      const alpha = 0.45 * wear + 0.1;
      streak(...at, 1 + random() * 1.8, 0.06, '22,20,18', alpha, GRIME);
    }
  });
  for (let k = 0; k < 10; k += 1) {
    const at = [nose - 0.6, (random() - 0.5) * 0.7];
    streak(...at, 1 + random() * 2.5, 0.05, '18,16,14', 0.5, GRIME);
  }

  // Heat: blued, bronzed metal and soot round each nozzle's housing.
  m.globalCompositeOperation = 'source-over';
  geometry.nozzles.forEach((nozzle) => {
    const r = nozzle.r * 1.6 * PX;
    const [x, z] = [X(nozzle.x + 0.6), Z(nozzle.y)];
    const gradient = c.createRadialGradient(x, z, 0, x, z, r * 1.4);
    gradient.addColorStop(0, 'rgba(60,70,100,0.35)');
    gradient.addColorStop(0.45, 'rgba(130,92,58,0.3)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gradient;
    c.fillRect(x - r * 1.5, z - r * 1.5, r * 3, r * 3);
    for (let k = 0; k < 8; k += 1) {
      const at = [nozzle.x + 1.2, nozzle.y + (random() - 0.5) * nozzle.r * 2.6];
      streak(...at, 1 + random() * 1.5, 0.08, '14,12,12', 0.5, null);
    }
  });

  // Markings.
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  geometry.panels
    .filter((panel) => panel.rcsPort)
    .forEach(({ points, rcsPort }) => {
      const mx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const mz = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      // the code on the wing's exposed part, NO STEP by its root
      c.fillStyle = 'rgba(232,234,228,0.9)';
      c.font = `bold ${Math.round(PX)}px "Arial Black", Arial, sans-serif`;
      const cx = mx + (rcsPort.x - mx) * 0.3 + 0.6;
      c.fillText(code, X(cx), Z(mz + (rcsPort.y - mz) * 0.42));
      const root = points.reduce((best, p) =>
        Math.abs(p.y) < Math.abs(best.y) ? p : best
      );
      c.fillStyle = 'rgba(232,234,228,0.8)';
      c.font = `bold ${Math.round(0.3 * PX)}px Arial, sans-serif`;
      const below = root.y + Math.sign(root.y) * 1.1;
      c.fillText('NO STEP', X(root.x - 1.4), Z(below));
      // warning chevrons by the tip jet
      for (let k = 0; k < 4; k += 1) {
        const [bx, bz] = [rcsPort.x - 1.6 + k * 0.32, rcsPort.y * 0.93];
        c.fillStyle = k % 2 ? 'rgba(20,20,20,0.85)' : 'rgba(236,186,40,0.9)';
        c.beginPath();
        c.moveTo(X(bx), Z(bz - 0.25));
        c.lineTo(X(bx + 0.32), Z(bz - 0.25));
        c.lineTo(X(bx + 0.12), Z(bz + 0.25));
        c.lineTo(X(bx - 0.2), Z(bz + 0.25));
        c.fill();
      }
    });
  // the accent stripe down the spine, broken where it wore through
  c.fillStyle = geometry.accent;
  c.globalAlpha = 0.8;
  for (let x = nose * 0.5; x > tail * 0.95; x -= 0.4) {
    if (random() < 0.08 * wear) continue;
    c.fillRect(X(x), Z(-0.85), 0.4 * PX + 1, 0.16 * PX);
    c.fillRect(X(x), Z(0.69), 0.4 * PX + 1, 0.16 * PX);
  }
  c.globalAlpha = 1;

  const texture = (canvas) => {
    const map = new THREE.CanvasTexture(canvas);
    map.anisotropy = 8;
    return map;
  };
  return {
    color: texture(colorCanvas),
    mask: texture(maskCanvas),
    box: new THREE.Vector4(minX, -maxZ, maxX - minX, 2 * maxZ),
  };
}

// Navigation lights' materials, one set per THREE: red to port, green to
// starboard, the white strobe, the sensor's cyan under its glass. Bright
// points the bloom haloes, not lights: a light would change the scene's
// light count whenever the ship hides (playerMirror.js standIn).
const bulbs = new WeakMap();
function bulbsOf(THREE) {
  if (!bulbs.has(THREE)) {
    const bulb = (hex, gain) =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex).multiplyScalar(gain),
        toneMapped: false,
      });
    bulbs.set(THREE, {
      port: bulb('#ff2a1a', 3),
      starboard: bulb('#19ff5a', 3),
      strobe: bulb('#ffffff', 3),
      sensor: bulb('#5ff4ff', 2),
    });
  }
  return bulbs.get(THREE);
}

/**
 * Adds a built hull `model`'s (hullModel.js) navigation lights to `parent`,
 * in hull units: one at each wingtip (port −z red, starboard green), the
 * strobe on the antenna's tip, the sensor's glow under the glass. Returns
 * the strobe (strobeOn says when it is lit).
 */
export function lights(THREE, model, geometry, parent) {
  const materials = bulbsOf(THREE);
  const tail = geometry.form.body[geometry.form.body.length - 1][0];
  model.canopy.computeBoundingBox();
  const glass = model.canopy.boundingBox;
  const mesh = (size, material, at) => {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(size, 10, 8),
      material
    );
    bulb.position.set(...at);
    parent.add(bulb);
    return bulb;
  };
  model.tips.forEach(([x, , z]) =>
    mesh(0.22, z < 0 ? materials.port : materials.starboard, [x + 0.4, 3, z])
  );
  mesh(0.3, materials.sensor, [
    (glass.min.x + glass.max.x) / 2,
    glass.min.y + 0.12,
    0,
  ]);
  return mesh(0.16, materials.strobe, [tail * SHIP_SIZE * 0.86, 6.3, 0]);
}

// The antenna's strobe: one flash per period (s). proposta 21/11.
const STROBE_PERIOD = 1.2;
const STROBE_FLASH = 0.08;

/** Whether the strobe is lit at `time` (s). */
export function strobeOn(time) {
  return time % STROBE_PERIOD < STROBE_FLASH;
}
