// The headless test game (tests/__helpers__/headlessGame.js) builds the
// simulation with doubles for the systems that show, sound and draw it, so it
// never loads them: editing a screen, a sound or a model then does not select
// its full-game tests in test:tocados, nor make them import that code. This
// walks every file the headless game reaches, starting from the harness
// itself, and fails on each import that crosses into presentation code unless
// the edge is listed below with its reason, and on any of the four systems
// reached at all, even through a listed edge.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../../scripts/tocados.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const HARNESS = 'tests/__helpers__/headlessGame.js';

const PRESENTATION_DIRS = [
  'src/modules/ui/',
  'src/modules/render3d/',
  'src/modules/audio/',
];
const PRESENTATION_FILES = [
  'src/modules/UISystem.js',
  'src/modules/AudioSystem.js',
  'src/modules/MenuBackgroundSystem.js',
];
const isPresentation = (file) =>
  PRESENTATION_FILES.includes(file) ||
  PRESENTATION_DIRS.some((dir) => file.startsWith(dir));

// The systems the headless game replaces with doubles.
const SYSTEMS = [
  'src/modules/UISystem.js',
  'src/modules/AudioSystem.js',
  'src/modules/render3d/Renderer3D.js',
  'src/modules/MenuBackgroundSystem.js',
];

// importer → target: why the simulation may load that presentation file.
const ALLOWED = {
  'src/modules/WorldSystem.js → src/modules/ui/upgradeCard.js':
    'familyForm names the evolution a run summary records',
  'src/services/GameSessionService.js → src/modules/ui/remoteLink.js':
    'playRemoteLink and remoteLinkLines play the link into a run from the menu',
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

// The same files tocados reads: every .js under src/ and tests/.
const sources = {};
for (const dir of ['src', 'tests']) {
  for (const file of walk(resolve(ROOT, dir))) {
    sources[relative(ROOT, file).replace(/\\/g, '/')] = readFileSync(
      file,
      'utf8'
    );
  }
}

// buildGraph gives each file's importers; turned round: each file's imports.
const imports = new Map(Object.keys(sources).map((file) => [file, []]));
for (const [target, importers] of buildGraph(sources)) {
  for (const importer of importers) imports.get(importer).push(target);
}

// Every file reached from `root`, mapped to the file that first imported it.
function closure(root) {
  if (!imports.has(root)) {
    throw new Error(`${root} is gone: point HARNESS at the headless game`);
  }
  const via = new Map([[root, null]]);
  const queue = [root];
  while (queue.length) {
    const file = queue.shift();
    for (const target of imports.get(file)) {
      if (via.has(target)) continue;
      via.set(target, file);
      queue.push(target);
    }
  }
  return via;
}

function chain(via, file) {
  const path = [];
  for (let at = file; at; at = via.get(at)) path.unshift(at);
  return path.join(' → ');
}

describe('the headless game loads no presentation code', () => {
  it('crosses into presentation only by the listed imports', () => {
    const reached = closure(HARNESS);
    const crossings = [];
    for (const file of reached.keys()) {
      if (isPresentation(file)) continue;
      for (const target of imports.get(file)) {
        if (isPresentation(target)) crossings.push(`${file} → ${target}`);
      }
    }
    const unexpected = crossings.filter((edge) => !(edge in ALLOWED)).sort();
    expect(
      unexpected,
      `The simulation the headless game builds now imports presentation code:\n` +
        unexpected.map((edge) => `  ${edge}`).join('\n') +
        `\nMove what it needs (usually a constant) to a data file under src/data/, ` +
        `or add the edge to ALLOWED in this test with its reason.`
    ).toEqual([]);
  });

  it('never reaches the systems it replaces with doubles', () => {
    const reached = closure(HARNESS);
    const loaded = SYSTEMS.filter((system) => reached.has(system));
    expect(
      loaded,
      `The headless game loads a system it replaces with a double:\n` +
        loaded.map((system) => `  ${chain(reached, system)}`).join('\n') +
        `\nCut that import chain: the headless game builds createSimulationManifest, ` +
        `and only serviceManifest.js may import the four systems.`
    ).toEqual([]);
  });
});
