// npm run done: the finish line (lint + format check + tests + build), with
// the tests and the build skipped when exactly this content already passed
// them with the same tools.
//
//   node scripts/done.mjs            (--force: run everything, ignore stamps)
//
// 1. The installed tools must match package-lock.json, or nothing runs.
// 2. Lint, format check and the changelog test always run (that test compares
//    with the point where the branch left main, which the key leaves out).
//    Lint, format and build run on this Node; the tests, through npm test, on
//    the one pinned in .nvmrc (scripts/pinned-node.mjs).
// 3. Key = the tree as `git add -A` would stage it (built in a temporary copy
//    of the index; *.md left out except under src/public/, which ships) +
//    this Node's version + the tests' pinned one + the installed lockfile. A
//    stamp for the key skips the tests and the build. Stamps live in the git
//    common dir, shared by every worktree, one file per key; every run
//    appends a line to done-log there.
// GOLDEN_UPDATE in the environment runs everything and never stamps.

import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pinnedVersion } from './pinned-node.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(root, args, env = process.env) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    cwd: root,
    env,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// Every lock entry but the root and the optional ones (other systems' builds,
// never installed here) is installed with the same version and integrity, and
// every installed entry is in the lock the same way (this machine's optional
// builds). `installed` is null when node_modules/.package-lock.json is missing.
export function lockDifferences(lock, installed) {
  if (!installed) return ['node_modules/.package-lock.json não existe'];
  const same = (a, b) => a.version === b.version && a.integrity === b.integrity;
  const mismatch = (name, want, got) =>
    want.version === got.version
      ? `${name}: ${got.version} instalado com outra integrity`
      : `${name}: o lock pede ${want.version}, instalado ${got.version}`;
  const diffs = [];
  for (const [name, want] of Object.entries(lock)) {
    if (name === '' || want.optional) continue;
    const got = installed[name];
    if (!got) diffs.push(`${name}: falta instalar ${want.version}`);
    else if (!same(want, got)) diffs.push(mismatch(name, want, got));
  }
  for (const [name, got] of Object.entries(installed)) {
    const want = lock[name];
    if (!want) diffs.push(`${name}: instalado ${got.version}, fora do lock`);
    else if ((name === '' || want.optional) && !same(want, got)) {
      diffs.push(mismatch(name, want, got));
    }
  }
  return diffs;
}

export function checkInstall(root) {
  const read = (file) => JSON.parse(readFileSync(file, 'utf8')).packages;
  const hidden = join(root, 'node_modules', '.package-lock.json');
  return lockDifferences(
    read(join(root, 'package-lock.json')),
    existsSync(hidden) ? read(hidden) : null
  );
}

export function installMessage(root) {
  let shortcut = false;
  try {
    shortcut = lstatSync(join(root, 'node_modules')).isSymbolicLink();
  } catch {
    // no node_modules at all: not a shortcut
  }
  return shortcut
    ? 'As ferramentas instaladas não batem com o package-lock.json. Aqui node_modules é um atalho para o da pasta principal: atualize lá (npm ci na pasta principal, com as outras conversas paradas). NUNCA rode npm ci nesta pasta.'
    : 'As ferramentas instaladas não batem com o package-lock.json: rode npm ci com as conversas paradas.';
}

// No test reads a .md; the ones under src/public/ ship to the site.
export function inKey(path) {
  return !path.endsWith('.md') || path.startsWith('src/public/');
}

// entries: `git ls-files -s` records ("mode blob stage\tpath").
export function keyFromParts(
  entries,
  nodeVersion,
  pinnedNode,
  installedLockText
) {
  const kept = entries.filter((e) => inKey(e.slice(e.indexOf('\t') + 1)));
  return sha256(
    [
      ...kept,
      `node ${nodeVersion}`,
      `tests on node ${pinnedNode}`,
      `lock ${sha256(installedLockText)}`,
    ].join('\0')
  );
}

// The tree as `git add -A` would stage it, staged into a copy of the real
// index (its stat data spares rehashing unchanged files); the real index is
// never written.
export function stagedEntries(root) {
  const index = resolve(
    root,
    git(root, ['rev-parse', '--git-path', 'index']).trim()
  );
  const dir = mkdtempSync(join(tmpdir(), 'done-index-'));
  const copy = join(dir, 'index');
  try {
    if (existsSync(index)) {
      const st = statSync(index);
      copyFileSync(index, copy);
      // Git rechecks the entries written in the same second as the index (its
      // mtime); a fresh copy's mtime would hide a same-size edit made then.
      utimesSync(copy, st.atime, Math.floor(st.mtimeMs / 1000));
    }
    const env = { ...process.env, GIT_INDEX_FILE: copy };
    git(root, ['add', '-A'], env);
    return git(root, ['ls-files', '-s', '-z'], env).split('\0').filter(Boolean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function contentKey(root) {
  return keyFromParts(
    stagedEntries(root),
    process.version,
    pinnedVersion(root),
    readFileSync(join(root, 'node_modules', '.package-lock.json'))
  );
}

function runCommand(step, command, root) {
  process.stdout.write(`\n> ${command}\n`);
  return (
    spawnSync(command, { cwd: root, stdio: 'inherit', shell: true }).status ?? 1
  );
}

// The whole run, steps injectable for the test: run(step, command, root)
// returns the command's exit status. Returns { outcome, code }; the CLI below
// exits with code.
export function main({
  root = ROOT,
  argv = process.argv.slice(2),
  env = process.env,
  run = runCommand,
  print = (text, stream = process.stdout) => stream.write(text),
} = {}) {
  const started = Date.now();
  const force = argv.includes('--force');
  const golden = env.GOLDEN_UPDATE !== undefined;
  const common = resolve(
    root,
    git(root, ['rev-parse', '--git-common-dir']).trim()
  );
  let key = '-';

  const finish = (outcome, code) => {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    appendFileSync(
      join(common, 'done-log'),
      `${[new Date().toISOString(), `${seconds}s`, outcome, key.slice(0, 12), basename(root)].join('\t')}\n`
    );
    return { outcome, code };
  };

  const diffs = checkInstall(root);
  if (diffs.length) {
    const shown = diffs.slice(0, 5).map((d) => `  ${d}`);
    if (diffs.length > 5) shown.push(`  ... e mais ${diffs.length - 5}`);
    print(`${shown.join('\n')}\n${installMessage(root)}\n`, process.stderr);
    return finish('fail at install', 1);
  }

  for (const [step, command] of [
    ['lint', 'npm run lint'],
    ['format', 'npm run format:check'],
    ['changelog', 'npm test -- tests/process/changelogLine.test.js'],
  ]) {
    const status = run(step, command, root);
    if (status !== 0) return finish(`fail at ${step}`, status);
  }

  key = contentKey(root);
  const stamp = join(common, 'done-stamps', key);
  if (!force && !golden && existsSync(stamp)) {
    const at = new Date(readFileSync(stamp, 'utf8').split('\n')[0]);
    const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    print(
      `\njá verificado às ${hhmm} para exatamente este conteúdo (testes e build pulados; --force roda tudo)\n`
    );
    return finish('hit', 0);
  }

  for (const [step, command] of [
    ['test', 'npm test'],
    ['build', 'npm run build'],
  ]) {
    const status = run(step, command, root);
    if (status !== 0) return finish(`fail at ${step}`, status);
  }

  if (golden) {
    print(
      '\npassou, não carimbado: GOLDEN_UPDATE está ligado (referências regravadas)\n'
    );
    return finish('pass-not-stamped (GOLDEN_UPDATE)', 0);
  }
  let after = null;
  try {
    after = contentKey(root);
  } catch {
    // a file vanished under another edit: the content changed
  }
  if (after !== key) {
    print('\npassou, não carimbado: o conteúdo mudou durante a verificação\n');
    return finish('pass-not-stamped (changed)', 0);
  }
  mkdirSync(dirname(stamp), { recursive: true });
  const head = git(root, ['rev-parse', '--short', 'HEAD']).trim();
  const temp = `${stamp}.${process.pid}.tmp`;
  writeFileSync(temp, `${new Date().toISOString()}\n${root}\nHEAD ${head}\n`);
  renameSync(temp, stamp);
  print(`\npassou e carimbado (${key.slice(0, 12)})\n`);
  return finish('pass+stamped', 0);
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

if (calledDirectly()) process.exit(main().code);
