// Every branch that changes the game says so in the changelog (Felipe, 21/11:
// "Tinha que ser meio que um processo forçado"). Part of npm run done and of
// GitHub's check on a pull request: a branch whose changes reach the site
// (src/, apart from documents and src/exported-assets/) also changes
// src/data/changelog.js, with a line a player would notice or, when nobody
// notices anything, a sentence in NEXT.unseen saying why. "Changed" is what
// npm run test:tocados uses: since the point where the branch left main.

import { describe, expect, it } from 'vitest';
import { baseRef, touched } from '../../scripts/tocados.mjs';

const CHANGELOG = 'src/data/changelog.js';
const reachesTheSite = (f) =>
  f.startsWith('src/') &&
  f !== CHANGELOG &&
  !f.startsWith('src/exported-assets/') &&
  !f.endsWith('.md');

/** The game files changed with no word in the changelog (none: nothing to say). */
function gameFilesWithoutLine(files) {
  if (files.includes(CHANGELOG)) return [];
  return files.filter(reachesTheSite);
}

function message(files) {
  const shown = files.slice(0, 5).join(', ');
  return [
    '',
    `Este ramo mudou o jogo (${files.length} arquivo(s): ${shown}${files.length > 5 ? ', ...' : ''}),`,
    `mas não escreveu nada no registro do que mudou, ${CHANGELOG}.`,
    'Abra esse arquivo e, dentro de NEXT (no topo), faça UMA das duas coisas:',
    '  1. Se quem joga percebe a mudança: acrescente uma linha em new (coisa nova),',
    '     improved (algo melhorou) ou fixed (algo consertado), em inglês, como o jogador',
    "     diria, com os nomes que a tela mostra. Ex.: 'The pause menu opens at once.'",
    '  2. Se quem joga não percebe nada: acrescente em unseen uma frase dizendo o que',
    "     mudou e por que ninguém vê. Ex.: 'Split the hull code in two files; the game",
    "     looks and plays the same.' Isso não aparece no jogo; vai para o Felipe na",
    '     pergunta de publicar.',
    'Uma linha por mudança, entre aspas simples e com vírgula no fim. Depois rode de novo.',
  ].join('\n');
}

describe('the changelog line every game change carries', () => {
  it('stops a branch that changed the game and left the changelog alone', () => {
    expect(gameFilesWithoutLine(['src/modules/ui/PauseScreen.js'])).toEqual([
      'src/modules/ui/PauseScreen.js',
    ]);
    expect(gameFilesWithoutLine(['src/public/audio/x.mp3'])).toHaveLength(1);
  });

  it('lets it through with a line or an unseen sentence (both live in the changelog)', () => {
    expect(
      gameFilesWithoutLine(['src/modules/ui/PauseScreen.js', CHANGELOG])
    ).toEqual([]);
  });

  it('asks nothing of tests, documents, tools, workflows or the decision pages', () => {
    expect(
      gameFilesWithoutLine([
        'tests/modules/ui/pause.test.js',
        'docs/PENDENCIAS.md',
        'src/README.md',
        'scripts/tocados.mjs',
        '.github/workflows/deploy.yml',
        'package.json',
        'src/exported-assets/quadro/cartoes/x.html',
      ])
    ).toEqual([]);
  });

  it('lets a publication through: its list moved from NEXT into the new version', () => {
    expect(
      gameFilesWithoutLine([
        'src/modules/MainMenu.js',
        'package.json',
        CHANGELOG,
      ])
    ).toEqual([]);
  });

  it('holds for this branch, against the point where it left main', () => {
    const base = baseRef();
    if (process.env.GITHUB_BASE_REF) {
      // A shallow checkout finds no base and would compare nothing.
      expect(base, 'no base: the workflow needs fetch-depth 0').not.toBe(
        'HEAD'
      );
    }
    const missing = gameFilesWithoutLine(touched(base));
    if (missing.length) throw new Error(message(missing));
  });
});
