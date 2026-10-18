// Fast commit gate: run the tests that cover the files you touched.
//
//   node scripts/tocados.mjs
//
// "Touched" = changed since the point where this branch left main (committed,
// staged or unstaged) + untracked; on main itself, or with no local main, since
// HEAD. A touched test runs itself; a touched src file runs every test that
// reaches it by following imports through src/ and the test helpers (tests live
// under tests/, not beside sources, so coverage is found by following imports).
// Touching a shared test helper or fixture runs the whole suite. Any src change
// also runs tests/process/, which watches the whole tree (dev globals leaking to
// prod). A touched src file with no test is reported, so you know it is unguarded.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function baseRef() {
  try {
    const base = git(['merge-base', 'HEAD', 'main']);
    return base === git(['rev-parse', 'HEAD']) ? 'HEAD' : base;
  } catch {
    return 'HEAD';
  }
}

function touched(base) {
  const sinceBase = git(['diff', '--name-only', base]);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  return [
    ...new Set(
      `${sinceBase}\n${untracked}`
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
    else if (name.endsWith('.js')) out.push(full);
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

const SPECIFIER_RES = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bvi\.(?:mock|doMock)\s*\(\s*['"]([^'"]+)['"]/g,
];

// sources: { [repo-relative path]: source text } -> reverse import graph:
// Map(path -> Set of the files that import it), one entry per file given.
export function buildGraph(sources) {
  const importers = new Map(Object.keys(sources).map((p) => [p, new Set()]));
  for (const [file, code] of Object.entries(sources)) {
    for (const re of SPECIFIER_RES) {
      for (const m of code.matchAll(re)) {
        if (!m[1].startsWith('.')) continue;
        const base = posix.join(posix.dirname(file), m[1]);
        const target = [base, `${base}.js`, `${base}/index.js`].find((c) =>
          importers.has(c)
        );
        if (target) importers.get(target).add(file);
      }
    }
  }
  return importers;
}

// Tests selected by the touched paths: touched tests, plus every test that
// reaches a touched src file through the importers (breadth-first).
export function selectTests(graph, touchedPaths) {
  const tests = new Set();
  for (const start of touchedPaths) {
    if (isTest(start)) tests.add(start);
    if (!isSrc(start) || !graph.has(start)) continue;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      for (const importer of graph.get(queue.shift())) {
        if (seen.has(importer)) continue;
        seen.add(importer);
        queue.push(importer);
        if (isTest(importer)) tests.add(importer);
      }
    }
  }
  return [...tests].sort();
}

function readSources() {
  const sources = {};
  for (const dir of ['src', 'tests']) {
    for (const file of walk(resolve(ROOT, dir))) {
      sources[relative(ROOT, file).replace(/\\/g, '/')] = readFileSync(
        file,
        'utf8'
      );
    }
  }
  return sources;
}

function main() {
  const base = baseRef();
  const files = touched(base);
  if (files.length === 0) {
    process.stdout.write(
      `nothing touched vs ${base === 'HEAD' ? 'HEAD' : base.slice(0, 7)}\n`
    );
    process.exit(0);
  }

  if (files.some(isSharedTestInfra)) {
    process.stdout.write(
      'shared test infra touched: running the whole suite\n'
    );
    const r = spawnSync('npx', ['vitest', 'run'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
    process.exit(r.status ?? 1);
  }

  const tests = new Set();
  const unguarded = [];
  const srcTouched = files.filter(isSrc);
  if (srcTouched.length) {
    const sources = readSources();
    const graph = buildGraph(sources);
    for (const f of srcTouched) {
      const covering = selectTests(graph, [f]);
      if (covering.length) covering.forEach((t) => tests.add(t));
      else unguarded.push(f);
    }
    for (const f of Object.keys(sources)) {
      if (f.startsWith('tests/process/') && isTest(f)) tests.add(f);
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
  process.stdout.write(
    `tests for touched files (${list.length}):\n${list.map((t) => `  ${t}`).join('\n')}\n`
  );
  const r = spawnSync('npx', ['vitest', 'run', ...list], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  process.exit(r.status ?? 1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
