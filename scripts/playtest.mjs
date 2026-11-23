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
//   npm run playtest -- debris-wake --table 1-10
//       the table: both skills, seeds 1 to 10, one sector (default debris-wake)
//
// Hands the choice to tests/playtest/sectors.playtest.js through the
// environment and runs it under vitest.playtest.config.js, as a process group
// that dies with the launcher (scripts/vitest-group.mjs).

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runVitest } from './vitest-group.mjs';

const PRESETS = ['average', 'good'];
const args = process.argv.slice(2);
const flag = (name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
const difficulty = flag('difficulty') || '';
const table = args.includes('--table');
const preset = args.find((arg) => PRESETS.includes(arg)) || 'average';
const [sector = '', seed = ''] = args.filter(
  (arg) => !PRESETS.includes(arg) && !arg.startsWith('--')
);

/** One vitest run; resolves to its exit code (null when a signal ended it). */
function run(env) {
  return runVitest(['run', '--config', 'vitest.playtest.config.js'], {
    stdio: table ? 'ignore' : 'inherit',
    env: { ...process.env, PLAYTEST_DIFFICULTY: difficulty, ...env },
  });
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

/** Both skills, one after the other: the table. */
async function compare() {
  const dir = mkdtempSync(join(tmpdir(), 'playtest-'));
  for (const p of PRESETS) {
    const out = join(dir, `${p}.json`);
    process.stdout.write(`running ${p}...\n`);
    await run({
      PLAYTEST_PRESET: p,
      PLAYTEST_SECTOR: sector || 'debris-wake',
      PLAYTEST_SEED: seed || '1-10',
      PLAYTEST_OUT: out,
    });
    const runs = JSON.parse(readFileSync(out, 'utf8'));
    const med = (list, key) => median(list.map((r) => r[key]));
    const lines = [
      `\n== bot ${p}: ${runs[0].sector} ==`,
      `${pad('seed', 5)}time kills wave, death`,
      ...runs.map((m) => `${pad(m.seed, 5)}${runText(m)}`),
      `${pad('mid', 5)}${med(runs, 'seconds')}s ${med(runs, 'kills')}k w${med(runs, 'wave')}`,
      `Auto Turret taken in ${runs.filter((r) => r.autoAim).length} of ${runs.length} runs, Flight Computer in ${runs.filter((r) => r.flightComputer).length}`,
      `flight watch (median): turning ${med(runs, 'turningPct')}%, pushing ${med(runs, 'pushPct')}%, back key ${med(runs, 'reversePct')}%, braking ${med(runs, 'brakePct')}%; aimed at a foe in reach ${med(runs, 'aimedPct')}%, near an edge ${med(runs, 'edgePct')}%, mean speed ${med(runs, 'meanSpeed')} px/s`,
    ];
    const when = (key) => {
      const hit = runs.filter((r) => r.trail[key]);
      if (!hit.length) return '-';
      const level = median(hit.map((r) => r.trail[key].level));
      const seconds = median(hit.map((r) => r.trail[key].seconds));
      return `${hit.length}/${runs.length}, mid L${level} @${seconds}s`;
    };
    lines.push(
      `trail (${p}): ${runs.map((r) => `seed ${r.seed}: ${trailText(r)}`).join('\n  ')}`,
      `trail taken: motor ${when('motor')}; brake/agility ${when('brake')}; Auto Turret ${when('aim')}`,
      `wins: ${runs.filter((r) => r.outcome === 'won').length}/${runs.length}`
    );
    process.stdout.write(`${lines.join('\n')}\n`);
  }
}

if (table) {
  await compare();
  process.exit(0);
}

const status = await run({
  PLAYTEST_PRESET: preset,
  PLAYTEST_SECTOR: sector,
  PLAYTEST_SEED: seed,
});
process.exit(status ?? 1);
