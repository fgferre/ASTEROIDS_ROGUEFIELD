// src/modules/menu/openingMorph.js
//
// The opening's way out (the owner's pick, 19/11): the studio's mark comes
// apart and its strokes re-form as the PRESS START title, in the title's own
// place, while the robot (the mark's "o") hops and flies off. It is a
// throwaway SVG over the screen, animated by SMIL; the gate's real title takes
// over when it ends. The game's letter is drawn here as single strokes (wide,
// rounded corners) only for the way there.

const NS = 'http://www.w3.org/2000/svg';
const POINTS = 48;
const STROKE_S = 1.5;
const SWEEP_S = 0.5;
/** From the press to the gate: the strokes' travel plus their sweep. */
export const MORPH_MS = (STROKE_S + SWEEP_S) * 1000;

/** The points of a path drawn as "M x y L x y ...". */
export function pathPoints(d) {
  const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const out = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
}

/** `count` points evenly spaced along the polyline. */
export function resample(pts, count = POINTS) {
  const seg = pts
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0) || 1e-6;
  const out = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < count; k++) {
    const t = (total * k) / (count - 1);
    while (i < seg.length - 1 && acc + seg[i] < t) acc += seg[i++];
    const u = seg[i] ? Math.min(1, (t - acc) / seg[i]) : 0;
    const a = pts[i];
    const b = pts[i + 1] ?? a;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

// A polyline with its corners (`at`, indices) rounded by radius r.
function rounded(pts, r, at = null, closed = false) {
  const out = [];
  pts.forEach((p, i) => {
    const ends = !closed && (i === 0 || i === pts.length - 1);
    if (ends || (at && !at.includes(i))) {
      out.push(p);
      return;
    }
    const a = pts[(i - 1 + pts.length) % pts.length];
    const c = pts[(i + 1) % pts.length];
    const l1 = Math.hypot(a[0] - p[0], a[1] - p[1]);
    const l2 = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const s = [
      p[0] + ((a[0] - p[0]) / l1) * rr,
      p[1] + ((a[1] - p[1]) / l1) * rr,
    ];
    const e = [
      p[0] + ((c[0] - p[0]) / l2) * rr,
      p[1] + ((c[1] - p[1]) / l2) * rr,
    ];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const q = (1 - t) * (1 - t);
      const m = 2 * (1 - t) * t;
      out.push([
        q * s[0] + m * p[0] + t * t * e[0],
        q * s[1] + m * p[1] + t * t * e[1],
      ]);
    }
  });
  if (closed) out.push(out[0]);
  return out;
}

const W = 96;
const R = 18;
const box = [
  [0, 0],
  [W, 0],
  [W, 100],
  [0, 100],
];
/** The game's letter as strokes, cap height 100; `[strokes, width]`. */
export function gameLetter(ch) {
  const bar = (y, to = W * 0.82) => [
    [0, y],
    [to, y],
  ];
  const strokes = {
    A: [
      rounded(
        [
          [0, 100],
          [0, 0],
          [W, 0],
          [W, 100],
        ],
        R
      ),
      bar(58, W),
    ],
    D: [rounded(box, R, [1, 2], true)],
    E: [
      rounded(
        [
          [W, 0],
          [0, 0],
          [0, 100],
          [W, 100],
        ],
        R
      ),
      bar(50),
    ],
    F: [
      rounded(
        [
          [W, 0],
          [0, 0],
          [0, 100],
        ],
        R
      ),
      bar(50),
    ],
    G: [
      rounded(
        [
          [W, 0],
          [0, 0],
          [0, 100],
          [W, 100],
          [W, 50],
          [W * 0.48, 50],
        ],
        R
      ),
    ],
    I: [
      [
        [0, 0],
        [0, 100],
      ],
    ],
    L: [
      rounded(
        [
          [0, 0],
          [0, 100],
          [W, 100],
        ],
        R
      ),
    ],
    O: [rounded(box, R, null, true)],
    R: [
      rounded(
        [
          [0, 100],
          [0, 0],
          [W, 0],
          [W, 56],
          [0, 56],
        ],
        R
      ),
      [
        [W * 0.5, 56],
        [W, 100],
      ],
    ],
    S: [
      rounded(
        [
          [W, 0],
          [0, 0],
          [0, 50],
          [W, 50],
          [W, 100],
          [0, 100],
        ],
        R
      ),
    ],
    T: [
      [
        [0, 0],
        [W, 0],
      ],
      [
        [W / 2, 0],
        [W / 2, 100],
      ],
    ],
    U: [
      rounded(
        [
          [0, 0],
          [0, 100],
          [W, 100],
          [W, 0],
        ],
        R
      ),
    ],
  }[ch];
  return [strokes, ch === 'I' ? 0 : W];
}

/** `text` in the game's letter, its outer edges spanning the ink box. */
export function fitWord(text, { x0, x1, top, cap }, stroke) {
  const letters = [...text].map(gameLetter);
  const inner = cap - stroke;
  const s = inner / 100;
  const natural = letters.reduce((sum, [, w]) => sum + w, 0) * s;
  const gap = (x1 - x0 - stroke - natural) / (letters.length - 1);
  let x = x0 + stroke / 2;
  return letters.flatMap(([strokes, w]) => {
    const at = x;
    x += w * s + gap;
    return strokes.map((k) =>
      k.map(([px, py]) => [at + px * s, top + stroke / 2 + py * s])
    );
  });
}

/** Every source stroke meets a target one, left to right (some split). */
export function pairStrokes(src, tgt) {
  const mid = (k) => k.reduce((sum, [x]) => sum + x, 0) / k.length;
  const a = [...src].sort((p, q) => mid(p) - mid(q));
  const b = [...tgt].sort((p, q) => mid(p) - mid(q));
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => [
    a[Math.floor((i * a.length) / n)],
    b[Math.floor((i * b.length) / n)],
  ]);
}

/** The ink box of a title line from its text box and type. */
function inkBox(el) {
  const r = el.getBoundingClientRect();
  const css = getComputedStyle(el);
  const size = parseFloat(css.fontSize);
  const spacing = parseFloat(css.letterSpacing) || 0;
  const cap = size * 0.7;
  const middle = r.top + r.height / 2;
  return {
    x0: r.left + (parseFloat(css.paddingLeft) || 0) + size * 0.05,
    x1: r.right - spacing - size * 0.05,
    top: middle - cap / 2,
    cap,
  };
}

const d = (pts) =>
  'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L');

function svg(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
}

function reducedMotion() {
  return (
    document.body.classList.contains('motion-reduced') ||
    document.documentElement.dataset.motion === 'reduced' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Starts the morph over `loadingScreen` and returns its overlay (the caller
 * fades and removes it once the gate shows), or null when it cannot run: no
 * mark, reduced motion, or the game's font not in yet (the title would be
 * measured in the fallback font).
 */
export function morphIntoTitle(loadingScreen) {
  const symbol = document.getElementById('pipo-brand');
  const brand = loadingScreen.querySelector('.opening__brand');
  if (!symbol || !brand || reducedMotion()) return null;
  if (!document.fonts.check('600 16px Orbitron')) return null;

  // The gate's title, laid out unseen for one measurement.
  loadingScreen.classList.add('loading-screen--measure');
  const small = inkBox(
    loadingScreen.querySelector('.loading-screen__gate-title span')
  );
  const big = inkBox(
    loadingScreen.querySelector('.loading-screen__gate-title strong')
  );
  loadingScreen.classList.remove('loading-screen--measure');

  // The mark's units to the screen (the symbol's viewBox, centred, fitted).
  const vb = symbol.viewBox.baseVal;
  const at = brand.getBoundingClientRect();
  const s = Math.min(at.width / vb.width, at.height / vb.height);
  const ox = at.left + (at.width - vb.width * s) / 2 - vb.x * s;
  const oy = at.top + (at.height - vb.height * s) / 2 - vb.y * s;
  const toScreen = (pts) => pts.map(([x, y]) => [ox + x * s, oy + y * s]);
  const strokes = (sel) =>
    [...symbol.querySelectorAll(`${sel} path`)].map((p) =>
      toScreen(pathPoints(p.getAttribute('d')))
    );
  const width = (sel) =>
    parseFloat(symbol.querySelector(sel).getAttribute('stroke-width')) * s;

  const overlay = svg('svg', {
    class: 'opening-morph',
    viewBox: `0 0 ${innerWidth} ${innerHeight}`,
    'aria-hidden': 'true',
  });
  document.body.appendChild(overlay);
  const anims = [];
  const animate = (el, attrs, delay = 0) =>
    anims.push([
      svg('animate', { begin: 'indefinite', fill: 'freeze', ...attrs }, el),
      delay,
    ]);
  const ease = {
    calcMode: 'spline',
    keyTimes: '0;1',
    keySplines: '0.65 0 0.25 1',
  };

  const travel = (pairs, from, to, color, start) => {
    const mids = pairs.map(
      ([a]) => a.reduce((sum, [x]) => sum + x, 0) / a.length
    );
    const lo = Math.min(...mids);
    const span = Math.max(1, Math.max(...mids) - lo);
    pairs.forEach(([a, b], i) => {
      const da = d(resample(a));
      const db = d(resample(b));
      const path = svg(
        'path',
        {
          d: da,
          fill: 'none',
          stroke: '#eaf3f7',
          'stroke-width': from,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
        overlay
      );
      const delay = start + ((mids[i] - lo) / span) * SWEEP_S;
      const dur = `${STROKE_S}s`;
      animate(
        path,
        { attributeName: 'd', values: `${da};${db}`, dur, ...ease },
        delay
      );
      animate(
        path,
        {
          attributeName: 'stroke-width',
          values: `${from};${to}`,
          dur,
          ...ease,
        },
        delay
      );
      animate(
        path,
        { attributeName: 'stroke', values: `#eaf3f7;${color}`, dur },
        delay
      );
    });
  };
  const bigStroke = big.cap * 0.17;
  const smallStroke = small.cap * 0.15;
  travel(
    pairStrokes(strokes('.pipo-word'), fitWord('ROGUEFIELD', big, bigStroke)),
    width('.pipo-word'),
    bigStroke,
    '#e3f2f7',
    0
  );
  travel(
    pairStrokes(strokes('.pipo-tag'), fitWord('ASTEROID', small, smallStroke)),
    width('.pipo-tag'),
    smallStroke,
    '#a7c9d7',
    0.1
  );

  // The dots go out; the robot hops, then flies off the top right.
  const mark = `matrix(${s} 0 0 ${s} ${ox} ${oy})`;
  const dots = svg('g', { transform: mark }, overlay);
  symbol
    .querySelectorAll('.pipo-dot')
    .forEach((c) => dots.appendChild(c.cloneNode()));
  animate(dots, { attributeName: 'opacity', values: '1;0', dur: '0.35s' });
  const flight = svg('g', {}, overlay);
  const robot = svg('g', { transform: mark }, flight);
  [...symbol.querySelector('.pipo-robot').children].forEach((c) =>
    robot.appendChild(c.cloneNode(true))
  );
  const fly = svg(
    'animateTransform',
    {
      attributeName: 'transform',
      type: 'translate',
      values: `0 0;-6 14;${innerWidth * 0.45} ${-innerHeight * 0.5}`,
      keyTimes: '0;0.25;1',
      calcMode: 'spline',
      keySplines: '0.3 0 0.6 1;0.5 0 0.9 0.6',
      dur: '1.6s',
      begin: 'indefinite',
      fill: 'freeze',
    },
    flight
  );
  anims.push([fly, 0]);
  animate(flight, {
    attributeName: 'opacity',
    values: '1;1;0',
    keyTimes: '0;0.7;1',
    dur: '1.6s',
  });

  loadingScreen.classList.add('loading-screen--morphing');
  for (const [a, delay] of anims) a.beginElementAt(delay);
  return overlay;
}
