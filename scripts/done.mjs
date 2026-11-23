// npm run done: the finish line (lint + format check + tests + build), with
// the tests and the build skipped when exactly this content already passed
// them with the same tools.
//
//   node scripts/done.mjs            (--force: run everything, ignore stamps)
//
// 1. The installed tools must match package-lock.json, or nothing runs.
// 2. Lint, format check and the changelog test always run (that test compares
//    with the point where the branch left main, which the key leaves out).
// 3. Key = the tree as `git add -A` would stage it (built in a temporary copy
//    of the index; *.md left out except under src/public/, which ships) +
//    Node's version + the installed lockfile. A stamp for the key skips the
//    tests and the build. Stamps live in the git common dir, shared by every
//    worktree, one file per key; every run appends a line to done-log there.
// GOLDEN_UPDATE in the environment runs everything and never stamps.

import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
export function keyFromParts(entries, nodeVersion, installedLockText) {
  const kept = entries.filter((e) => inKey(e.slice(e.indexOf('\t') + 1)));
  return sha256(
    [...kept, `node ${nodeVersion}`, `lock ${sha256(installedLockText)}`].join(
      '\0'
    )
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
    readFileSync(join(root, 'node_modules', '.package-lock.json'))
  );
}

function run(command) {
  process.stdout.write(`\n> ${command}\n`);
  return spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true });
}

function main() {
  const started = Date.now();
  const force = process.argv.includes('--force');
  const golden = process.env.GOLDEN_UPDATE !== undefined;
  const common = resolve(
    ROOT,
    git(ROOT, ['rev-parse', '--git-common-dir']).trim()
  );
  let key = '-';

  const finish = (outcome, code) => {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    appendFileSync(
      join(common, 'done-log'),
      `${[new Date().toISOString(), `${seconds}s`, outcome, key.slice(0, 12), basename(ROOT)].join('\t')}\n`
    );
    process.exit(code);
  };

  const diffs = checkInstall(ROOT);
  if (diffs.length) {
    const shown = diffs.slice(0, 5).map((d) => `  ${d}`);
    if (diffs.length > 5) shown.push(`  ... e mais ${diffs.length - 5}`);
    process.stderr.write(`${shown.join('\n')}\n${installMessage(ROOT)}\n`);
    finish('fail at install', 1);
  }

  for (const [step, command] of [
    ['lint', 'npm run lint'],
    ['format', 'npm run format:check'],
    ['changelog', 'npx vitest run tests/process/changelogLine.test.js'],
  ]) {
    const r = run(command);
    if (r.status !== 0) finish(`fail at ${step}`, r.status ?? 1);
  }

  key = contentKey(ROOT);
  const stamp = join(common, 'done-stamps', key);
  if (!force && !golden && existsSync(stamp)) {
    const at = new Date(readFileSync(stamp, 'utf8').split('\n')[0]);
    const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    process.stdout.write(
      `\njá verificado às ${hhmm} para exatamente este conteúdo (testes e build pulados; --force roda tudo)\n`
    );
    finish('hit', 0);
  }

  for (const [step, command] of [
    ['test', 'npm test'],
    ['build', 'npm run build'],
  ]) {
    const r = run(command);
    if (r.status !== 0) finish(`fail at ${step}`, r.status ?? 1);
  }

  if (golden) {
    process.stdout.write(
      '\npassou, não carimbado: GOLDEN_UPDATE está ligado (referências regravadas)\n'
    );
    finish('pass-not-stamped (GOLDEN_UPDATE)', 0);
  }
  let after = null;
  try {
    after = contentKey(ROOT);
  } catch {
    // a file vanished under another edit: the content changed
  }
  if (after !== key) {
    process.stdout.write(
      '\npassou, não carimbado: o conteúdo mudou durante a verificação\n'
    );
    finish('pass-not-stamped (changed)', 0);
  }
  mkdirSync(dirname(stamp), { recursive: true });
  const head = git(ROOT, ['rev-parse', '--short', 'HEAD']).trim();
  const temp = `${stamp}.${process.pid}.tmp`;
  writeFileSync(temp, `${new Date().toISOString()}\n${ROOT}\nHEAD ${head}\n`);
  renameSync(temp, stamp);
  process.stdout.write(`\npassou e carimbado (${key.slice(0, 12)})\n`);
  finish('pass+stamped', 0);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
