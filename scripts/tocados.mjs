// Fast commit gate: run the tests that cover the files you touched.
//
//   node scripts/tocados.mjs
//
// "Touched" = changed vs HEAD + untracked. A touched test runs itself; a
// touched src file runs every test that imports it (tests live under tests/,
// not beside sources, so coverage is found by following imports). Touching a
// shared test helper or fixture runs the whole suite. Any src change also runs
// tests/process/, which watches the whole tree (dev globals leaking to prod).
// A touched src file with no test is reported, so you know it is unguarded.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', cwd: ROOT }).trim();
}

function touched() {
  const vsHead = git(['diff', '--name-only', 'HEAD']);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  return [
    ...new Set(
      `${vsHead}\n${untracked}`
        .split('\n')
        .map((s) => s.trim().replace(/\\/g, '/'))
        .filter((s) => s && existsSync(resolve(ROOT, s)))
    ),
  ];
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(test|spec)\.js$/.test(name)) out.push(full);
  }
  return out;
}

const isTest = (f) => /^tests\/.*\.(test|spec)\.js$/.test(f);
const isSrc = (f) => f.startsWith('src/') && f.endsWith('.js');
const isSharedTestInfra = (f) =>
  f.startsWith('tests/__helpers__/') ||
  f.startsWith('tests/__fixtures__/') ||
  f.startsWith('tests/fixtures/') ||
  f === 'vite.config.js';

// map: src path (repo-relative) -> set of test files importing it
function importMap() {
  const map = new Map();
  const importRe = /from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const testFile of walk(resolve(ROOT, 'tests'))) {
    const code = readFileSync(testFile, 'utf8');
    for (const m of code.matchAll(importRe)) {
      const spec = m[1] ?? m[2];
      if (!spec || !spec.startsWith('.')) continue;
      const target = relative(ROOT, resolve(dirname(testFile), spec)).replace(/\\/g, '/');
      if (!target.startsWith('src/')) continue;
      if (!map.has(target)) map.set(target, new Set());
      map.get(target).add(relative(ROOT, testFile).replace(/\\/g, '/'));
    }
  }
  return map;
}

const files = touched();
if (files.length === 0) {
  process.stdout.write('nothing touched vs HEAD\n');
  process.exit(0);
}

if (files.some(isSharedTestInfra)) {
  process.stdout.write('shared test infra touched: running the whole suite\n');
  const r = spawnSync('npx', ['vitest', 'run'], { cwd: ROOT, stdio: 'inherit', shell: true });
  process.exit(r.status ?? 1);
}

const tests = new Set();
const unguarded = [];
const srcTouched = files.filter(isSrc);
if (srcTouched.length) {
  const map = importMap();
  for (const f of srcTouched) {
    const covering = map.get(f);
    if (covering) covering.forEach((t) => tests.add(t));
    else unguarded.push(f);
  }
  for (const t of walk(resolve(ROOT, 'tests/process'))) {
    tests.add(relative(ROOT, t).replace(/\\/g, '/'));
  }
}
files.filter(isTest).forEach((t) => tests.add(t));

if (unguarded.length) {
  process.stdout.write(
    `no test imports these touched files (unguarded):\n${unguarded.map((f) => `  ${f}`).join('\n')}\n`
  );
}

const list = [...tests].sort();
if (list.length === 0) {
  process.stdout.write('no tests cover the touched files\n');
  process.exit(0);
}
process.stdout.write(`tests for touched files (${list.length}):\n${list.map((t) => `  ${t}`).join('\n')}\n`);
const r = spawnSync('npx', ['vitest', 'run', ...list], { cwd: ROOT, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
