// npm run done (scripts/done.mjs) skips the tests and the build only for
// content that already passed them with the same tools: the installed tools
// must match the lock, and the key follows every staged byte but the .md
// files that never reach a test or the site. Temp dirs only; the real
// done-stamps and done-log are never touched.

import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkInstall,
  contentKey,
  inKey,
  installMessage,
  keyFromParts,
  lockDifferences,
} from '../../scripts/done.mjs';

const dirs = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'done-test-'));
  dirs.push(dir);
  return dir;
}
afterAll(() =>
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }))
);

const a = { version: '1.0.0', integrity: 'sha512-a' };
const lock = {
  '': { name: 'game', version: '0.7.0' },
  'node_modules/a': a,
  'node_modules/@esbuild/linux-x64': {
    version: '0.25.0',
    integrity: 'sha512-linux',
    optional: true,
  },
  'node_modules/@esbuild/darwin-arm64': {
    version: '0.25.0',
    integrity: 'sha512-darwin',
    optional: true,
  },
};

describe('done: installed tools against the lock', () => {
  it("ignores other systems' optional builds and checks this one's", () => {
    const installed = {
      'node_modules/a': a,
      'node_modules/@esbuild/darwin-arm64': {
        version: '0.25.0',
        integrity: 'sha512-darwin',
      },
    };
    expect(lockDifferences(lock, installed)).toEqual([]);
    installed['node_modules/@esbuild/darwin-arm64'].version = '0.24.0';
    expect(lockDifferences(lock, installed)).toHaveLength(1);
  });

  it('fails on another version, a missing package or an extra one', () => {
    expect(
      lockDifferences(lock, { 'node_modules/a': { ...a, version: '1.0.1' } })
    ).toEqual(['node_modules/a: o lock pede 1.0.0, instalado 1.0.1']);
    expect(lockDifferences(lock, {})).toHaveLength(1);
    expect(
      lockDifferences(lock, { 'node_modules/a': a, 'node_modules/x': a })
    ).toHaveLength(1);
  });

  it('fails when node_modules/.package-lock.json is missing', () => {
    const root = tempDir();
    writeFileSync(
      join(root, 'package-lock.json'),
      JSON.stringify({ packages: lock })
    );
    expect(checkInstall(root)).toEqual([
      'node_modules/.package-lock.json não existe',
    ]);
  });

  it('tells a shortcut node_modules to update the main folder', () => {
    const main = tempDir();
    const worktree = tempDir();
    const plain = tempDir();
    mkdirSync(join(main, 'node_modules'));
    mkdirSync(join(plain, 'node_modules'));
    symlinkSync(join(main, 'node_modules'), join(worktree, 'node_modules'));
    expect(installMessage(worktree)).toMatch(/NUNCA rode npm ci nesta pasta/);
    expect(installMessage(plain)).toMatch(/rode npm ci com as conversas/);
    expect(installMessage(tempDir())).toBe(installMessage(plain));
  });
});

describe('done: the content key', () => {
  it('leaves .md out except under src/public/', () => {
    expect(inKey('README.md')).toBe(false);
    expect(inKey('docs/PENDENCIAS.md')).toBe(false);
    expect(inKey('src/public/notes.md')).toBe(true);
    expect(inKey('src/main.js')).toBe(true);
  });

  it("follows Node's version and the installed lock", () => {
    const entries = [`100644 ${'1'.repeat(40)} 0\tsrc/a.js`];
    const key = keyFromParts(entries, 'v25.0.0', '{}');
    expect(keyFromParts(entries, 'v22.0.0', '{}')).not.toBe(key);
    expect(keyFromParts(entries, 'v25.0.0', '{ }')).not.toBe(key);
    expect(
      keyFromParts(
        [...entries, `100644 ${'2'.repeat(40)} 0\tREADME.md`],
        'v25.0.0',
        '{}'
      )
    ).toBe(key);
  });

  it('changes with one byte of a .js, not with a .md, and spares the real index', () => {
    const repo = tempDir();
    const gitHere = (...args) =>
      execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
    gitHere('init', '-q');
    mkdirSync(join(repo, 'node_modules'));
    mkdirSync(join(repo, 'src', 'public'), { recursive: true });
    writeFileSync(join(repo, '.gitignore'), 'node_modules\n');
    writeFileSync(join(repo, 'node_modules', '.package-lock.json'), '{}');
    const js = join(repo, 'src', 'a.js');
    // The index is written in the same second as a.js, which is then edited
    // to the same size: only that second's recheck can see the edit.
    const second = Math.floor(Date.now() / 1000) - 10;
    writeFileSync(js, 'export const a = 1;\n');
    utimesSync(js, second, second);
    writeFileSync(join(repo, 'README.md'), '# one\n');
    writeFileSync(join(repo, 'src', 'public', 'notes.md'), 'one\n');
    gitHere('add', '-A');
    utimesSync(join(repo, '.git', 'index'), second, second);
    const index = readFileSync(join(repo, '.git', 'index'));

    writeFileSync(js, 'export const a = 2;\n');
    utimesSync(js, second, second);
    const key = contentKey(repo);
    expect(contentKey(repo)).toBe(key);
    writeFileSync(js, 'export const a = 1;\n');
    utimesSync(js, second, second);
    const before = contentKey(repo);
    expect(before).not.toBe(key);

    writeFileSync(join(repo, 'README.md'), '# two\n');
    expect(contentKey(repo)).toBe(before);
    writeFileSync(join(repo, 'src', 'public', 'notes.md'), 'two\n');
    expect(contentKey(repo)).not.toBe(before);
    expect(readFileSync(join(repo, '.git', 'index'))).toEqual(index);
  });
});
