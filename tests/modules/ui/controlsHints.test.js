import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The menu and pause keyboard hints in index.html; style.css shows the
// data-scheme='classic' items only on Classic hull control.
const html = readFileSync(
  new URL('../../../src/index.html', import.meta.url),
  'utf8'
);
const keyboardLists = [
  ...html.matchAll(
    /<ul\s+class="controls-hints"\s+data-device="keyboard"[\s\S]*?<\/ul>/g
  ),
].map(([list]) => list);
const items = (list, scheme) =>
  [...list.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/g)]
    .filter(([, attrs]) =>
      scheme === 'modern'
        ? !attrs.includes('data-scheme="classic"')
        : !attrs.includes('data-scheme="modern"')
    )
    .map(([, , body]) =>
      body
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );

describe('Keyboard controls hints', () => {
  it('describe the modern scheme, the classic one only behind its flag', () => {
    expect(keyboardLists).toHaveLength(2);
    keyboardLists.forEach((list) => {
      const modern = items(list, 'modern');
      expect(modern).toEqual(
        expect.arrayContaining([
          'WASD move',
          'Shift dash',
          'E shield',
          'R reroll',
          'B banish',
          'Turret auto-aims',
        ])
      );
      expect(modern.join(' ')).not.toMatch(/turn|thrust/);
      expect(items(list, 'classic')).toEqual(
        expect.arrayContaining(['W ↑ thrust', 'A D turn'])
      );
    });
  });
});
