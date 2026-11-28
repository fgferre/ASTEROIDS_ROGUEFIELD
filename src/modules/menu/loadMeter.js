// src/modules/menu/loadMeter.js
//
// ?meter: the loading's numbers, drawn over the opening once it asks for the
// press, big enough to photograph on a phone or a car's screen (Felipe's
// devices, 25/11). index.html's recorder gathers the frame and beat gaps and
// the indicator's path from the first byte; this adds what only the renderer
// knows (programs, the GPU the browser reports) and keeps the panel up until
// it is tapped. Never loaded without the parameter.

// The indicator's last glide after the press is asked (style.css: 1.2 s).
const SETTLE_MS = 1500;
// A frame held this long is a stall the eye sees; the second, a big one.
const STALL_MS = 100;
const BIG_STALL_MS = 500;
// Backward steps smaller than this share of the route are rounding.
const BACK_EPSILON = 0.002;
const VISITS_KEY = 'roguefield.meter.visits';

/** Called once loaded (app.js): reads the recorder and shows the panel. */
export function showLoadMeter(renderer) {
  const recorder = window.__loadMeter;
  recorder.until = performance.now() + SETTLE_MS;
  setTimeout(() => {
    const result = readResult(recorder, renderer);
    recorder.result = result;
    console.info('[meter]', JSON.stringify(result));
    drawPanel(result, recorder);
  }, SETTLE_MS + 100);
}

function readResult(recorder, renderer) {
  const ready = recorder.ready ?? performance.now();
  const guard = performance.getEntriesByName('boot-guard-passed')[0];
  const warm = performance.getEntriesByName('renderer-warm-up')[0];
  const before = (gaps) => gaps.filter(([start]) => start < ready);
  const frames = before(recorder.rafGaps);
  const beats = before(recorder.beatGaps);
  const tasks = before(recorder.tasks);
  const webgl = renderer.three?.renderer;
  const gl = webgl?.getContext();
  return {
    readyMs: ready,
    guardMs: guard?.startTime ?? null,
    domMs: recorder.dom ?? null,
    warmStartMs: warm?.startTime ?? null,
    warmMs: warm?.duration ?? null,
    warmStepMaxMs: longestStep(recorder.loads, warm),
    programs: webgl?.info?.programs?.length ?? null,
    stalls: frames.filter(([, d]) => d >= STALL_MS).length,
    bigStalls: frames.filter(([, d]) => d >= BIG_STALL_MS).length,
    stallMaxMs: maxOf(frames),
    stallSumMs: frames.reduce((sum, [, d]) => sum + d, 0),
    stallTop: [...frames]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([start, d]) => [Math.round(start), Math.round(d)]),
    beatMaxMs: maxOf(beats),
    longtaskMaxMs: recorder.longtask ? maxOf(tasks) : null,
    longtaskBig: recorder.longtask
      ? tasks.filter(([, d]) => d >= BIG_STALL_MS).length
      : null,
    frames: recorder.frames,
    ...indicator(recorder),
    ...gpu(gl),
    quality: renderer.quality
      ? `${renderer.quality.preset}${renderer.quality.auto ? ' (auto)' : ''}`
      : null,
    canvas: gl ? `${gl.drawingBufferWidth}×${gl.drawingBufferHeight}` : null,
    window: `${innerWidth}×${innerHeight} @${devicePixelRatio}`,
    cores: navigator.hardwareConcurrency ?? null,
    memoryGb: navigator.deviceMemory ?? null,
    browser: browserName(navigator.userAgent),
    userAgent: navigator.userAgent,
    visit: countVisit(),
    build: buildName(),
    at: new Date().toLocaleString('pt-BR'),
  };
}

const maxOf = (gaps) => gaps.reduce((max, [, d]) => Math.max(max, d), 0);

// The warm-up's longest step: the gap between two --load writes inside it.
function longestStep(loads, warm) {
  if (!warm) return null;
  let last = warm.startTime;
  let longest = 0;
  for (const [t] of loads) {
    if (t <= warm.startTime || t > warm.startTime + warm.duration + 1) continue;
    longest = Math.max(longest, t - last);
    last = t;
  }
  return longest;
}

// Where the indicator went back: the written values, and the ship and trail
// as the main thread computed them frame by frame.
function indicator({ loads, pos }) {
  const backs = (values) => {
    let count = 0;
    let most = 0;
    for (let i = 1; i < values.length; i += 1) {
      const drop = values[i - 1] - values[i];
      if (drop > BACK_EPSILON) {
        count += 1;
        most = Math.max(most, drop);
      }
    }
    return [count, most];
  };
  const [writtenBack] = backs(loads.map(([, v]) => v));
  const [shipBack, shipBackMost] = backs(pos.map(([, ship]) => ship));
  const [trailBack] = backs(pos.map(([, , trail]) => trail));
  return {
    writes: loads.length,
    writtenBack,
    shipBack,
    shipBackMost,
    trailBack,
    samples: pos.length,
  };
}

function gpu(gl) {
  if (!gl) return { gpu: null };
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    gpu: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    gpuVendor: gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
    webgl2:
      typeof WebGL2RenderingContext !== 'undefined' &&
      gl instanceof WebGL2RenderingContext,
    parallelCompile: (gl.getSupportedExtensions() ?? []).includes(
      'KHR_parallel_shader_compile'
    ),
  };
}

function browserName(ua) {
  const tesla = /Tesla/.test(ua) ? 'Tesla ' : '';
  const found =
    ua.match(/(Edg|Firefox|CriOS|FxiOS|Chrome)\/([\d.]+)/) ??
    ua.match(/Version\/([\d.]+).*Safari/);
  if (!found) return `${tesla}${ua.slice(0, 40)}`;
  if (found.length === 2) return `${tesla}Safari ${found[1]}`;
  return `${tesla}${found[1]} ${found[2].split('.')[0]}`;
}

// Which opening this is in this browser: the first one compiles everything,
// later ones may find the browser's own cache of programs.
function countVisit() {
  try {
    const visit = Number(localStorage.getItem(VISITS_KEY) ?? 0) + 1;
    localStorage.setItem(VISITS_KEY, String(visit));
    return visit;
  } catch {
    return null;
  }
}

// The build: the game's version and the bundle's hashed name (dev: app.js).
function buildName() {
  const main = document.querySelector('script[type="module"][src*="main"]');
  const hash = main?.src.match(/main-([\w-]+)\.js/)?.[1];
  return `${__GAME_VERSION__}${hash ? ` · ${hash}` : ' · dev'}`;
}

const seconds = (ms) =>
  ms === null || ms === undefined
    ? '—'
    : `${(ms / 1000).toFixed(2).replace('.', ',')} s`;

function drawPanel(r, recorder) {
  const panel = document.createElement('div');
  panel.className = 'load-meter';
  panel.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'overflow:auto',
    'padding:2vmin 3vmin',
    'background:rgba(2,4,8,0.93)',
    'color:#e3f2f7',
    'font:clamp(11px,2.3vmin,22px)/1.3 system-ui,sans-serif',
  ].join(';');
  // A phone held upright waits at the turn door before anything loads.
  const guardWait = r.guardMs - (r.domMs ?? r.guardMs) > 300;
  const big = (label, value) =>
    `<div><div style="opacity:.7">${label}</div><div style="font-size:2.3em;font-weight:700">${value}</div></div>`;
  const backs =
    r.shipBack > 0
      ? `${r.shipBack} vezes (até ${(r.shipBackMost * 100).toFixed(1)}%)`
      : 'nenhuma vez';
  panel.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1.5vmin 3vmin">
      ${big('Até pedir o toque', seconds(r.readyMs))}
      ${big('Travadas (0,1 s ou mais)', `${r.stalls} · ${r.bigStalls} &gt; 0,5 s`)}
      ${big('Maior travada', seconds(r.stallMaxMs))}
      ${big('Aquecimento', seconds(r.warmMs))}
      ${big('Programas', r.programs ?? '—')}
      ${big('Indicador voltou', backs)}
      ${big('Compilação em paralelo', r.parallelCompile ? 'sim' : 'não')}
      ${big('Abertura nº', r.visit ?? '—')}
    </div>
    <div style="margin-top:1.5vmin;font-size:1.15em"><b>Placa:</b> ${toHtml(r.gpu)} <span style="opacity:.7">(${toHtml(r.gpuVendor)}, ${r.webgl2 ? 'WebGL 2' : 'WebGL 1'})</span></div>
    <canvas style="display:block;width:100%;height:24vmin;margin-top:1.5vmin"></canvas>
    <div style="opacity:.75;margin-top:1vmin">
      ${guardWait ? `Depois da porta de virar: ${seconds(r.readyMs - r.guardMs)} · ` : ''}travado ao todo ${seconds(r.stallSumMs)} ·
      maior passo do aquecimento ${seconds(r.warmStepMaxMs)} · linha principal parada no máximo ${seconds(r.beatMaxMs)}
      ${r.longtaskMaxMs !== null ? ` · maior tarefa ${seconds(r.longtaskMaxMs)}` : ''}<br />
      ${toHtml(r.browser)} · janela ${r.window} · imagem ${r.canvas} · qualidade ${r.quality} · ${r.cores ?? '?'} núcleos${r.memoryGb ? ` · ${r.memoryGb} GB` : ''}<br />
      versão ${toHtml(r.build)} · ${r.at} · toque para fechar
    </div>`;
  panel.addEventListener('click', (event) => {
    event.stopPropagation();
    panel.remove();
  });
  document.body.appendChild(panel);
  drawChart(panel.querySelector('canvas'), r, recorder);
}

function toHtml(text) {
  return String(text ?? '—').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}

// The indicator over time: amber steps are the values written, the cyan line
// is where the ship was each frame, red bands are the frames held.
function drawChart(canvas, r, { loads, pos, rafGaps }) {
  const ratio = devicePixelRatio || 1;
  const width = canvas.clientWidth * ratio;
  const height = canvas.clientHeight * ratio;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const end = r.readyMs + SETTLE_MS;
  const pad = 4 * ratio;
  const x = (t) => (t / end) * width;
  const y = (v) => height - pad - v * (height - 2 * pad);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,70,70,0.45)';
  for (const [start, d] of rafGaps) {
    if (d >= STALL_MS && start < end) ctx.fillRect(x(start), 0, x(d), height);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `${10 * ratio}px system-ui`;
  for (let s = 1; s * 1000 < end; s += 1) {
    ctx.fillRect(x(s * 1000), height - 6 * ratio, ratio, 6 * ratio);
    ctx.fillText(`${s}`, x(s * 1000) + 2 * ratio, height - 2 * ratio);
  }
  ctx.fillStyle = '#e3f2f7';
  ctx.fillRect(x(r.readyMs), 0, 2 * ratio, height);
  ctx.lineWidth = 2 * ratio;
  ctx.strokeStyle = '#ffb347';
  ctx.beginPath();
  let last = 0;
  ctx.moveTo(0, y(0));
  for (const [t, v] of loads) {
    ctx.lineTo(x(t), y(last));
    ctx.lineTo(x(t), y(v));
    last = v;
  }
  ctx.lineTo(width, y(last));
  ctx.stroke();
  ctx.strokeStyle = '#00f2ff';
  ctx.beginPath();
  pos.forEach(([t, ship], i) =>
    i ? ctx.lineTo(x(t), y(ship)) : ctx.moveTo(x(t), y(ship))
  );
  ctx.stroke();
}
