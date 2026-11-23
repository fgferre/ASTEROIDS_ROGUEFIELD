// scripts/pinned-node.mjs runs the tests on the Node pinned in .nvmrc: on this
// binary when it is that one, otherwise on npx's cached copy, and it fails at
// once without one. Signals pass to the script, whose exit code it returns.
// Fake spawn, resolve and signals: no process is started.

import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { run } from '../../scripts/pinned-node.mjs';

const root = mkdtempSync(join(tmpdir(), 'pinned-node-'));
writeFileSync(join(root, '.nvmrc'), '24.22.3\n');
afterAll(() => rmSync(root, { recursive: true, force: true }));

function start({ version, resolveBinary = () => '/cache/node' } = {}) {
  const child = Object.assign(new EventEmitter(), { killed: [] });
  child.kill = (signal) => child.killed.push(signal);
  const spawned = [];
  const resolved = [];
  const printed = [];
  const signals = new EventEmitter();
  const code = run({
    args: ['script.mjs', 'run'],
    root,
    version,
    execPath: '/this/node',
    resolveBinary: (v) => {
      resolved.push(v);
      return resolveBinary(v);
    },
    spawnChild: (binary, args) => {
      spawned.push([binary, ...args]);
      return child;
    },
    signals,
    print: (text) => printed.push(text),
  });
  return { code, child, spawned, resolved, printed, signals };
}

describe('the pinned Node', () => {
  it('runs the script on this Node when it is the pinned one', () => {
    const { spawned, resolved } = start({ version: 'v24.22.3' });
    expect(resolved).toEqual([]);
    expect(spawned).toEqual([['/this/node', 'script.mjs', 'run']]);
  });

  it("runs it on npx's cached copy on any other Node", () => {
    const { spawned, resolved } = start({ version: 'v25.8.1' });
    expect(resolved).toEqual(['v24.22.3']);
    expect(spawned).toEqual([['/cache/node', 'script.mjs', 'run']]);
  });

  it('fails at once, saying what to do, when the cache lacks it', async () => {
    const { code, spawned, printed } = start({
      version: 'v25.8.1',
      resolveBinary: () => {
        throw new Error('ENOTCACHED');
      },
    });
    expect(await code).toBe(1);
    expect(spawned).toEqual([]);
    expect(printed.join('')).toMatch(/npx -y node@24\.22\.3 -v/);
  });

  it('passes signals on and exits with the script', async () => {
    const done = start({ version: 'v24.22.3' });
    done.signals.emit('SIGTERM');
    done.signals.emit('SIGINT');
    expect(done.child.killed).toEqual(['SIGTERM', 'SIGINT']);
    done.child.emit('exit', 3, null);
    expect(await done.code).toBe(3);
    expect(done.signals.listenerCount('SIGTERM')).toBe(0);

    const killed = start({ version: 'v24.22.3' });
    killed.child.emit('exit', null, 'SIGTERM');
    expect(await killed.code).toBe(143);
  });
});
