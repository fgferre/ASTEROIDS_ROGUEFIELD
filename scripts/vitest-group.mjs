// Runs vitest on this Node (the test scripts already run on the pinned one:
// scripts/pinned-node.mjs) as a process group of its own, and kills the whole
// group when this process exits, Ctrl+C, kill and pkill included: killing the
// playtest launcher once left a vitest worker stuck in a loop spinning a core
// for twelve hours (22/11). SIGKILL, because a worker stuck in a loop never
// runs a handler for a gentler signal. Used by scripts/playtest.mjs and
// scripts/tocados.mjs. Not covered: a kill -9 of this process gives it no
// chance to clean up, and the group runs on.

import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITEST = resolve(ROOT, 'node_modules/vitest/vitest.mjs');

// The running vitest's process group (its pid), or null.
let group = null;
const killGroup = () => {
  try {
    if (group) process.kill(-group, 'SIGKILL');
  } catch {
    // the group is already gone
  }
};

// Installed at the first run, not on import: tests import tocados.mjs.
let guarded = false;
function guard() {
  if (guarded) return;
  guarded = true;
  process.on('exit', killGroup);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => process.exit(128 + constants.signals[signal]));
  }
}

/** `vitest <args>` from the repo root; resolves to its exit code (null when a signal ended it). */
export function runVitest(args, { stdio = 'inherit', env = process.env } = {}) {
  guard();
  const child = spawn(process.execPath, [VITEST, ...args], {
    cwd: ROOT,
    detached: true,
    stdio,
    env,
  });
  group = child.pid;
  return new Promise((done, fail) => {
    child.on('error', fail);
    child.on('exit', (code) => {
      killGroup(); // a worker left behind by vitest
      group = null;
      done(code);
    });
  });
}
