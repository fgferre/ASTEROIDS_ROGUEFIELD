// The bot playtest: sector runs flown headless by the bot with a mortal ship.
//
//   npm run playtest                       all nine sectors, bot 'average'
//   npm run playtest -- good               all nine, bot 'good'
//   npm run playtest -- dense-core [good]  one sector
//   npm run playtest -- dense-core good 3  one sector, world and bot seed 3
//   npm run playtest -- dense-core good 1-10  seeds 1 to 10, in a row
//   npm run playtest -- debris-wake average 1-10 --difficulty=pressure-5
//                                          difficulty: pilot, veteran, warden,
//                                          pressure-1..5 (none = the game's default)
//   npm run playtest -- --flight=old       the old flight (?direcao=antiga); the
//                                          default is the new one (glide, cannon on the nose)
//   npm run playtest -- --voo=b            Felipe's one-algorithm variant (?voo=a|b|c|d|e)
//   npm run playtest -- debris-wake --table 1-10
//       the comparison table: both skills, the new flight and the old one,
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
const FLIGHTS = ['new', 'old'];
const args = process.argv.slice(2);
const flag = (name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
const flight = flag('flight') || 'new';
if (!FLIGHTS.includes(flight)) {
  throw new Error(
    `playtest: --flight is ${FLIGHTS.join(' or ')} (default new)`
  );
}
const difficulty = flag('difficulty') || '';
const voo = flag('voo') || '';
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
      env: { ...process.env, PLAYTEST_DIFFICULTY: difficulty, ...env },
    }
  );
}

const pad = (text, width) => String(text).padEnd(width);
const median = (list) =>
  [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

const trailText = (r) =>
  [
    ['motor', r.trail.motor],
    ['brake/agil', r.trail.brake],
    ['aim', r.trail.aim],
  ]
    .map(([name, t]) => `${name} ${t ? `L${t.level}@${t.seconds}s` : '-'}`)
    .join('  ');

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
    const old = rows[`${p}/old`];
    const glide = rows[`${p}/new`];
    const med = (list, key) => median(list.map((r) => r[key]));
    const lines = [
      `\n== bot ${p}: ${old[0].sector}, old flight | new flight (glide, nose cannon) ==`,
      `${pad('seed', 5)}${pad('old: time kills wave, death', 46)}new: time kills wave, death`,
      ...old.map(
        (m, i) => `${pad(m.seed, 5)}${pad(runText(m), 46)}${runText(glide[i])}`
      ),
      `${pad('mid', 5)}${pad(`${med(old, 'seconds')}s ${med(old, 'kills')}k w${med(old, 'wave')}`, 46)}${med(glide, 'seconds')}s ${med(glide, 'kills')}k w${med(glide, 'wave')}`,
      `new: Auto Turret taken in ${glide.filter((r) => r.autoAim).length} of ${glide.length} runs, Flight Computer in ${glide.filter((r) => r.flightComputer).length}`,
      `new-flight watch (median): turning ${med(glide, 'turningPct')}%, pushing ${med(glide, 'pushPct')}%, back key ${med(glide, 'reversePct')}%, braking ${med(glide, 'brakePct')}%; aimed at a foe in reach ${med(glide, 'aimedPct')}%, near an edge ${med(glide, 'edgePct')}%, mean speed ${med(glide, 'meanSpeed')} px/s`,
    ];
    const taken = (list, key) => list.filter((r) => r.trail[key]);
    const when = (list, key) => {
      const hit = taken(list, key);
      if (!hit.length) return '-';
      const level = median(hit.map((r) => r.trail[key].level));
      const seconds = median(hit.map((r) => r.trail[key].seconds));
      return `${hit.length}/${list.length}, mid L${level} @${seconds}s`;
    };
    lines.push(
      `trail (${p}), new flight: ${glide.map((r) => `seed ${r.seed}: ${trailText(r)}`).join('\n  ')}`,
      ...[
        ['old', old],
        ['new', glide],
      ].map(
        ([name, list]) =>
          `trail taken, ${name} flight: motor ${when(list, 'motor')}; brake/agility ${when(list, 'brake')}; Auto Turret ${when(list, 'aim')}`
      ),
      `wins: old ${old.filter((r) => r.outcome === 'won').length}/${old.length}, new ${glide.filter((r) => r.outcome === 'won').length}/${glide.length}`
    );
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
  PLAYTEST_VOO: voo,
  PLAYTEST_SECTOR: sector,
  PLAYTEST_SEED: seed,
});
process.exit(result.status ?? 1);
