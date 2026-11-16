// The bot playtest: sector runs flown headless by the bot with a mortal ship.
//
//   npm run playtest                       all nine sectors, bot 'average'
//   npm run playtest -- good               all nine, bot 'good'
//   npm run playtest -- dense-core [good]  one sector
//   npm run playtest -- dense-core good 3  one sector, world and bot seed 3
//   npm run playtest -- dense-core good 1-10  seeds 1 to 10, in a row
//   npm run playtest -- --flight=glide     the classic glide, cannon on the nose
//   npm run playtest -- debris-wake --table 1-10
//       the comparison table: both skills, today's flight and the glide,
//       seeds 1 to 10, one sector (default debris-wake)
//
// Hands the choice to tests/playtest/sectors.playtest.js through the
// environment and runs it under vitest.playtest.config.js.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRESETS = ['average', 'good'];
const FLIGHTS = ['modern', 'glide'];
const args = process.argv.slice(2);
const flag = (name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
const flight = flag('flight') || 'modern';
if (!FLIGHTS.includes(flight)) {
  throw new Error(`playtest: --flight is ${FLIGHTS.join(' or ')}`);
}
const table = args.includes('--table');
const preset = args.find((arg) => PRESETS.includes(arg)) || 'average';
const [sector = '', seed = ''] = args.filter(
  (arg) => !PRESETS.includes(arg) && !arg.startsWith('--')
);

function run(env) {
  return spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      'vitest.playtest.config.js',
    ],
    {
      cwd: ROOT,
      stdio: table ? 'ignore' : 'inherit',
      env: { ...process.env, ...env },
    }
  );
}

const pad = (text, width) => String(text).padEnd(width);
const median = (list) =>
  [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

const runText = (r) =>
  `${r.seconds}s ${r.kills}k w${r.wave} ${r.outcome === 'died' ? (r.cause || '?').replace(/^shot /, 'tiro ') : r.outcome}`;

/** Both skills, both ways of flying, one after the other: the side-by-side table. */
function compare() {
  const dir = mkdtempSync(join(tmpdir(), 'playtest-'));
  const rows = {};
  for (const p of PRESETS) {
    for (const f of FLIGHTS) {
      const out = join(dir, `${p}-${f}.json`);
      process.stdout.write(`running ${p} / ${f}...\n`);
      run({
        PLAYTEST_PRESET: p,
        PLAYTEST_FLIGHT: f,
        PLAYTEST_SECTOR: sector || 'debris-wake',
        PLAYTEST_SEED: seed || '1-10',
        PLAYTEST_OUT: out,
      });
      rows[`${p}/${f}`] = JSON.parse(readFileSync(out, 'utf8'));
    }
  }
  for (const p of PRESETS) {
    const modern = rows[`${p}/modern`];
    const glide = rows[`${p}/glide`];
    const med = (list, key) => median(list.map((r) => r[key]));
    const lines = [
      `\n== bot ${p}: ${modern[0].sector}, today's flight | classic glide, nose aim ==`,
      `${pad('seed', 5)}${pad('today: time kills wave, death', 46)}glide: time kills wave, death`,
      ...modern.map(
        (m, i) => `${pad(m.seed, 5)}${pad(runText(m), 46)}${runText(glide[i])}`
      ),
      `${pad('mid', 5)}${pad(`${med(modern, 'seconds')}s ${med(modern, 'kills')}k w${med(modern, 'wave')}`, 46)}${med(glide, 'seconds')}s ${med(glide, 'kills')}k w${med(glide, 'wave')}`,
      `glide: Auto Turret taken in ${glide.filter((r) => r.autoAim).length} of ${glide.length} runs, Flight Computer in ${glide.filter((r) => r.flightComputer).length}`,
      `glide watch (median): turning ${med(glide, 'turningPct')}%, pushing ${med(glide, 'pushPct')}%, back key ${med(glide, 'reversePct')}%, braking ${med(glide, 'brakePct')}%; aimed at a foe in reach ${med(glide, 'aimedPct')}%, near an edge ${med(glide, 'edgePct')}%, mean speed ${med(glide, 'meanSpeed')} px/s`,
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
  }
}

if (table) {
  compare();
  process.exit(0);
}

const result = run({
  PLAYTEST_PRESET: preset,
  PLAYTEST_FLIGHT: flight,
  PLAYTEST_SECTOR: sector,
  PLAYTEST_SEED: seed,
});
process.exit(result.status ?? 1);
