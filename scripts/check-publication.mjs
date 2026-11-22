// Part of the deploy (.github/workflows/deploy.yml): every publication gets its
// own version number and its list (src/data/changelog.js). The site goes up only
// if the number in package.json differs from the one the previous main had and
// NEXT, the list of the coming version, was moved into RELEASES. The messages are
// in Portuguese for whoever publishes.
//
//   node scripts/check-publication.mjs   (needs the previous commit: fetch-depth 2)

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { NEXT } from '../src/data/changelog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function publicationProblems({ version, previousVersion, next }) {
  const problems = [];
  if (version === previousVersion) {
    problems.push(
      `O número da versão não mudou (continua ${version}). Toda publicação ganha um número novo: ` +
        'rode "npm version <número novo> --no-git-tag-version" e publique de novo.'
    );
  }
  const waiting = ['new', 'improved', 'fixed', 'unseen'].flatMap(
    (g) => next[g] ?? []
  );
  if (waiting.length > 0) {
    problems.push(
      `A lista da próxima versão (NEXT, em src/data/changelog.js) ainda tem ${waiting.length} linha(s). ` +
        'Passe-as para uma versão nova no topo de RELEASES, com o número e a data (as de unseen vão junto, em unseen), e deixe NEXT vazio.'
    );
  }
  return problems;
}

function main() {
  const version = JSON.parse(
    readFileSync(resolve(ROOT, 'package.json'), 'utf8')
  ).version;
  const previousVersion = JSON.parse(
    execFileSync('git', ['show', 'HEAD^1:package.json'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
  ).version;
  const problems = publicationProblems({
    version,
    previousVersion,
    next: NEXT,
  });
  if (problems.length === 0) {
    process.stdout.write(
      `Publicação ${version} (antes ${previousVersion}): número e lista em ordem.\n`
    );
    return;
  }
  process.stderr.write(
    `O site não foi publicado:\n- ${problems.join('\n- ')}\n`
  );
  process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
