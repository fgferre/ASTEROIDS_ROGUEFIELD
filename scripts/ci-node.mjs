// Run by hand (no longer part of npm run done): GitHub tests on older Node versions than this Mac's
// (PR 318 passed here and failed there: Node 21+ has a global `navigator`).
// When this machine's Node is newer than the oldest one any workflow names,
// the suite runs again on that version through npx, without installing
// anything in the project. The golden trace stays out: its reference was
// recorded on this Mac's Node and differs from the first second on 20 and 22.
//
//   node scripts/ci-node.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

export function oldestCiNode(workflowTexts) {
  const majors = workflowTexts.flatMap((text) =>
    [...text.matchAll(/node-version:([^#\n]*)/g)].flatMap(([, value]) =>
      [...value.matchAll(/\b(\d+)\.x\b|\b(\d+)(?:\.\d+)*\b/g)].map(([, x, n]) =>
        Number(x ?? n)
      )
    )
  );
  return majors.length ? Math.min(...majors) : null;
}

function main() {
  const texts = readdirSync(WORKFLOWS)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => readFileSync(join(WORKFLOWS, name), 'utf8'));
  const ci = oldestCiNode(texts);
  const here = Number(process.versions.node.split('.')[0]);
  if (ci === null || here <= ci) {
    process.stdout.write(`Node ${here} here, GitHub's oldest is ${ci}\n`);
    return;
  }
  process.stdout.write(
    `Node ${here} here, GitHub tests on ${ci}: running the suite on Node ${ci} too (golden trace aside)\n`
  );
  const r = spawnSync(
    'npx',
    [
      '-y',
      `node@${ci}`,
      'node_modules/vitest/vitest.mjs',
      'run',
      '--exclude',
      'tests/integration/golden-trace.test.js',
    ],
    { cwd: ROOT, stdio: 'inherit', shell: true }
  );
  process.exit(r.status ?? 1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
