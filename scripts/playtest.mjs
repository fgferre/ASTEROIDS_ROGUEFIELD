// The bot playtest: sector runs flown headless by the bot with a mortal ship.
//
//   npm run playtest                       all nine sectors, bot 'average'
//   npm run playtest -- good               all nine, bot 'good'
//   npm run playtest -- dense-core [good]  one sector
//   npm run playtest -- dense-core good 3  one sector, world and bot seed 3
//
// Hands the choice to tests/playtest/sectors.playtest.js through the
// environment and runs it under vitest.playtest.config.js.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRESETS = ['average', 'good'];
const args = process.argv.slice(2);
const preset = args.find((arg) => PRESETS.includes(arg)) || 'average';
const [sector = '', seed = ''] = args.filter((arg) => !PRESETS.includes(arg));

const result = spawnSync(
  process.execPath,
  [
    resolve(ROOT, 'node_modules/vitest/vitest.mjs'),
    'run',
    '--config',
    'vitest.playtest.config.js',
  ],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYTEST_PRESET: preset,
      PLAYTEST_SECTOR: sector,
      PLAYTEST_SEED: seed,
    },
  }
);
process.exit(result.status ?? 1);
