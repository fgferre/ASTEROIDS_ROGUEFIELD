// Runs a script on the Node pinned in .nvmrc, whatever Node started it: every
// test path (npm test and the test:* scripts, test:tocados, playtest) comes
// through here, so the tests run on the same Node on this Mac and on GitHub
// (setup-node reads .nvmrc there). Lint, format, build and the dev server stay
// on the system Node.
//
//   node scripts/pinned-node.mjs <script> [args...]
//
// On the pinned Node already (GitHub), the script runs on this binary.
// Otherwise the pinned binary comes from npx's cache (`npx --offline`, ~0.4 s,
// never the network) and runs the script itself: no npx stays in between.
// The exit code is the script's, or 128 + the signal's number when a signal
// ended it; SIGINT, SIGTERM and SIGHUP sent here are passed on to the script,
// and this process exits after it.

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** The version in .nvmrc, written as process.version writes it ('v24.22.3'). */
export function pinnedVersion(root = ROOT) {
  return `v${readFileSync(join(root, '.nvmrc'), 'utf8').trim()}`;
}

/** The pinned Node's binary from npx's cache; throws when it is not there. */
export function cachedBinary(version) {
  const [got, path] = execFileSync(
    'npx',
    [
      ...['--offline', '-y', `node@${version.slice(1)}`],
      ...['-p', 'process.version + "\\n" + process.execPath'],
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  )
    .trim()
    .split('\n');
  if (got !== version) throw new Error(`o npx deu o Node ${got}`);
  return path;
}

// The whole run, its parts injectable for the test. Resolves to the exit code.
export function run({
  args,
  root = ROOT,
  version = process.version,
  execPath = process.execPath,
  resolveBinary = cachedBinary,
  spawnChild = (binary, argv) => spawn(binary, argv, { stdio: 'inherit' }),
  signals = process,
  print = (text) => process.stderr.write(text),
}) {
  const pinned = pinnedVersion(root);
  let binary = execPath;
  if (version !== pinned) {
    try {
      binary = resolveBinary(pinned);
    } catch (error) {
      const why = String(error.stderr || error.message)
        .trim()
        .split('\n')[0];
      print(
        `O Node ${pinned} dos testes (.nvmrc) não está no cache do npx (${why}).\nRode uma vez, com internet: npx -y node@${pinned.slice(1)} -v\n`
      );
      return Promise.resolve(1);
    }
  }
  const child = spawnChild(binary, args);
  const forward = Object.fromEntries(
    SIGNALS.map((signal) => [signal, () => child.kill(signal)])
  );
  for (const signal of SIGNALS) signals.on(signal, forward[signal]);
  return new Promise((done) => {
    const finish = (code) => {
      for (const signal of SIGNALS) signals.off(signal, forward[signal]);
      done(code);
    };
    child.on('error', (error) => {
      print(`Não deu para iniciar ${binary}: ${error.message}\n`);
      finish(1);
    });
    child.on('exit', (code, signal) =>
      finish(code ?? 128 + constants.signals[signal])
    );
  });
}

// import.meta.url is the real path; argv[1] may come through a symlink.
function calledDirectly() {
  try {
    return (
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    );
  } catch {
    return false;
  }
}

if (calledDirectly()) process.exit(await run({ args: process.argv.slice(2) }));
