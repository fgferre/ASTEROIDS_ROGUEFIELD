/**
 * One capture tool for the game (headless Chromium, real GPU), so a session
 * does not write a new Playwright script for each picture.
 *
 *   node scripts/capture.mjs --url <address> [--tamanho 1280x800]
 *     [--vista jogo|perto|topo|orbita] [--content <id>] [--espera <s>]
 *     [--filme <s>] --saida <file>
 *
 * --url      full page address of a running server; desktop=force and
 *            debugLogging=0 (and content=<id> with --content) are added when
 *            the query lacks them.
 * --tamanho  window size, default 1280x800.
 * --vista    jogo (default): the game camera as the player sees it, canvas
 *              only (HUD hidden).
 *            perto: close front-3/4 view of the subject (the biggest enemy
 *              that is not an asteroid, else the player's hull), camera at
 *              4.6x its radius. The sim is paused for the shot.
 *            topo: straight down over the subject, paused.
 *            orbita: one image, a grid of 8 poses of the subject (game view,
 *              front 3/4, side, back 3/4, front low, high diagonal, below,
 *              real game size), composed in the page. Paused.
 * --content  adds ?content=<id> (a registry item in front of the ship).
 * --espera   minimum seconds before shooting, default 4; the tool then also
 *            waits until the game camera stops moving (its opening pull-back).
 * A plain URL shows the menu background, not a run: use --content <id> (a
 * hull, enemy, boss...) to see a ship or enemy in the field.
 * --filme    record this many seconds of the chosen view as a webm video
 *            (MediaRecorder on the game canvas after the settle, no ffmpeg); the sim keeps running and
 *            orbita becomes one slow turn around the subject.
 * --saida    output file: .jpg/.jpeg or .png for pictures, .webm for --filme.
 *
 * Playwright comes from the Homebrew @playwright/cli install (not a project
 * dependency; the owner decided against one). Node built-ins only otherwise.
 */

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const PLAYWRIGHT_PATH =
  '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright';

const HELP =
  'Uso: node scripts/capture.mjs --url <endereco> [--tamanho 1280x800] [--vista jogo|perto|topo|orbita] [--content <id>] [--espera <s>] [--filme <s>] --saida <arquivo>';

function fail(message) {
  console.error(message);
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)(PLAYWRIGHT_PATH));
} catch {
  fail(
    `Playwright nao encontrado. Esta ferramenta espera o @playwright/cli do Homebrew em ${PLAYWRIGHT_PATH} (brew install playwright-cli). Nenhuma outra copia e usada.`
  );
}

const { values: opts } = parseArgs({
  options: {
    url: { type: 'string' },
    tamanho: { type: 'string', default: '1280x800' },
    vista: { type: 'string', default: 'jogo' },
    content: { type: 'string' },
    espera: { type: 'string', default: '4' },
    filme: { type: 'string' },
    saida: { type: 'string' },
  },
});

if (!opts.url || !opts.saida) fail(HELP);
if (!['jogo', 'perto', 'topo', 'orbita'].includes(opts.vista)) fail(HELP);
const sizeMatch = /^(\d+)x(\d+)$/.exec(opts.tamanho);
if (!sizeMatch) fail(`--tamanho invalido: ${opts.tamanho}. ${HELP}`);
const width = Number(sizeMatch[1]);
const height = Number(sizeMatch[2]);
const settle = Number(opts.espera) * 1000;
const filmSeconds = opts.filme === undefined ? 0 : Number(opts.filme);
if (!Number.isFinite(settle) || !Number.isFinite(filmSeconds)) fail(HELP);

const address = new URL(opts.url);
if (!address.searchParams.has('desktop')) {
  address.searchParams.set('desktop', 'force');
}
if (!address.searchParams.has('debugLogging')) {
  address.searchParams.set('debugLogging', '0');
}
if (opts.content) address.searchParams.set('content', opts.content);

// Poses: azimuth and elevation in degrees (azimuth relative to the subject's
// rotation), distance in subject radii. `null` pose = the game's own camera.
const ORBIT_POSES = [
  { label: 'jogo', pose: null },
  { label: 'frente 3/4', pose: { az: 35, el: 32, d: 4.6 } },
  { label: 'lado', pose: { az: 90, el: 20, d: 4.6 } },
  { label: 'tras 3/4', pose: { az: 215, el: 32, d: 4.6 } },
  { label: 'frente baixo', pose: { az: 20, el: 8, d: 4.6 } },
  { label: 'diagonal alto', pose: { az: 135, el: 55, d: 4.6 } },
  { label: 'de baixo', pose: { az: 35, el: -40, d: 4.6 } },
  { label: 'tamanho real', pose: null, crop: true },
];
const VIEW_POSES = {
  perto: { az: 35, el: 32, d: 4.6 },
  topo: { az: 0, el: 89.5, d: 4.6 },
};

// Runs in the page: wraps the camera rig so a pose can replace the game
// camera each frame, and publishes where the subject is on screen.
async function installRig(page) {
  await page.evaluate(async () => {
    const find = (name) =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => url.includes(`/render3d/${name}.js`));
    const { CameraRig } = await import(find('cameraRig'));
    const { PlayerMirror } = await import(find('playerMirror'));

    // The content-scene ship is invulnerable and would blink white.
    const mirrorUpdate = PlayerMirror.prototype.update;
    PlayerMirror.prototype.update = function (...args) {
      const result = mirrorUpdate.apply(this, args);
      this.blink.value = 0;
      return result;
    };

    const original = CameraRig.prototype.updateCamera;
    CameraRig.prototype.updateCamera = function (t, player, enemies, ...rest) {
      const result = original.call(this, t, player, enemies, ...rest);
      window.__cam = t.camera.position.toArray();
      const enemy = (enemies || [])
        .filter((e) => e.type !== 'asteroid' && !e.destroyed)
        .sort((a, b) => b.radius - a.radius)[0];
      const subject = enemy
        ? { x: enemy.x, y: enemy.y, r: enemy.radius, angle: enemy.rotation }
        : {
            x: player.position.x,
            y: player.position.y,
            r: player.radius || 14,
            angle: player.angle || 0,
          };
      const tx = subject.x - 400;
      const tz = subject.y - 300;
      const pose = window.__pose;
      if (pose) {
        const az = subject.angle + (pose.az * Math.PI) / 180;
        const el = (pose.el * Math.PI) / 180;
        const d = pose.d * subject.r;
        t.camera.position.set(
          tx + d * Math.cos(el) * Math.cos(az),
          d * Math.sin(el),
          tz + d * Math.cos(el) * Math.sin(az)
        );
        t.camera.up.set(0, 1, 0);
        t.camera.lookAt(tx, 0, tz);
        this.aimKeyShadow(t, tx, tz, d);
      }
      t.camera.updateMatrixWorld();
      const p = t.camera.position.clone().set(tx, 0, tz).project(t.camera);
      window.__screen = {
        x: ((p.x + 1) / 2) * innerWidth,
        y: ((1 - p.y) / 2) * innerHeight,
      };
      return result;
    };
  });
}

// Waits for the game camera's opening pull-back to end: at least --espera,
// then until its position stays put for 0.5 s (capped at 20 s).
async function waitForCamera(page, minimum) {
  const start = Date.now();
  let last = null;
  let still = 0;
  while (Date.now() - start < 20000) {
    await page.waitForTimeout(250);
    const now = await page.evaluate(() => window.__cam);
    const moved =
      !now || !last || Math.hypot(...now.map((v, i) => v - last[i])) > 0.05;
    still = moved ? 0 : still + 1;
    last = now;
    if (still >= 2 && Date.now() - start >= minimum - 2000) return;
  }
}

async function setPose(page, pose) {
  await page.evaluate((value) => {
    window.__pose = value;
  }, pose);
  await page.waitForTimeout(450);
}

// Joins the 8 shots into one grid on a 2D canvas inside the page.
function composeSheet(page, tiles, tileW, tileH, mime) {
  return page.evaluate(
    async ({ tiles, tileW, tileH, mime }) => {
      const cols = 4;
      const rows = Math.ceil(tiles.length / cols);
      const canvas = document.createElement('canvas');
      canvas.width = cols * tileW;
      canvas.height = rows * tileH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [i, tile] of tiles.entries()) {
        const image = new Image();
        image.src = tile.data;
        await image.decode();
        const x = (i % cols) * tileW;
        const y = Math.floor(i / cols) * tileH;
        const scale = Math.min(tileW / image.width, tileH / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        ctx.drawImage(image, x + (tileW - w) / 2, y + (tileH - h) / 2, w, h);
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(tile.label, x + 10, y + 22);
      }
      return canvas.toDataURL(mime, 0.92);
    },
    { tiles, tileW, tileH, mime }
  );
}

const asPicture = (buffer, type) =>
  `data:image/${type};base64,${buffer.toString('base64')}`;

let browser;
try {
  browser = await chromium.launch({
    args: [
      '--use-angle=metal',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--mute-audio',
    ],
  });
  const context = await browser.newContext({
    viewport: { width, height },
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('pageerror:', error.message));
  await page.addInitScript(() =>
    performance.setResourceTimingBufferSize(20000)
  );
  await page.goto(address.href, { waitUntil: 'load' });
  await page.waitForTimeout(Math.min(settle, 2000));
  await installRig(page);
  await waitForCamera(page, settle);
  await page.addStyleTag({
    content:
      'body * { visibility: hidden !important } canvas { visibility: visible !important }',
  });

  const jpeg = /\.jpe?g$/i.test(opts.saida);
  const type = jpeg ? 'jpeg' : 'png';

  if (filmSeconds > 0) {
    await page.evaluate(() => {
      const stream = document.getElementById('game-canvas').captureStream(30);
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8'].find(
        (type) => MediaRecorder.isTypeSupported(type)
      );
      const chunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8e6,
      });
      recorder.ondataavailable = (event) => chunks.push(event.data);
      window.__recording = new Promise((resolve) => {
        recorder.onstop = () =>
          resolve(new Blob(chunks, { type: 'video/webm' }));
      });
      window.__recorder = recorder;
      recorder.start(250);
    });
    const start = Date.now();
    const turnMs = filmSeconds * 1000;
    if (opts.vista === 'orbita') {
      while (Date.now() - start < turnMs) {
        const az = ((Date.now() - start) / turnMs) * 360;
        await page.evaluate((a) => {
          window.__pose = { az: a, el: 30, d: 4.6 };
        }, az);
        await page.waitForTimeout(50);
      }
    } else {
      await setPose(page, VIEW_POSES[opts.vista] ?? null);
      await page.waitForTimeout(Math.max(0, turnMs - (Date.now() - start)));
    }
    const base64 = await page.evaluate(async () => {
      window.__recorder.stop();
      const blob = await window.__recording;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let text = '';
      for (let i = 0; i < bytes.length; i += 32768) {
        text += String.fromCharCode(...bytes.subarray(i, i + 32768));
      }
      return btoa(text);
    });
    writeFileSync(opts.saida, Buffer.from(base64, 'base64'));
  } else {
    if (opts.vista !== 'jogo') {
      await page.keyboard.press('Escape'); // sim stops, 3D keeps drawing
      await page.waitForTimeout(800);
    }
    if (opts.vista === 'orbita') {
      const tileW = 640;
      const tileH = 400;
      const tiles = [];
      for (const { label, pose, crop } of ORBIT_POSES) {
        await setPose(page, pose);
        let shot;
        if (crop) {
          const at = await page.evaluate(() => window.__screen);
          const w = Math.min(width, tileW);
          const h = Math.min(height, tileH);
          const x = Math.max(0, Math.min(width - w, Math.round(at.x - w / 2)));
          const y = Math.max(0, Math.min(height - h, Math.round(at.y - h / 2)));
          shot = await page.screenshot({
            type: 'png',
            clip: { x, y, width: w, height: h },
          });
        } else {
          shot = await page.screenshot({ type: 'png' });
        }
        tiles.push({ label, data: asPicture(shot, 'png') });
      }
      const sheet = await composeSheet(
        page,
        tiles,
        tileW,
        tileH,
        `image/${type}`
      );
      writeFileSync(opts.saida, Buffer.from(sheet.split(',')[1], 'base64'));
    } else {
      await setPose(page, VIEW_POSES[opts.vista] ?? null);
      await page.screenshot({ path: opts.saida, type });
    }
  }
} catch (error) {
  console.error('Falha na captura:', error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
