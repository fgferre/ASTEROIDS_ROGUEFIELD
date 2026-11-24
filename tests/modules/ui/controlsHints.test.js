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
          'Z C strafe',
          'R reroll',
          'B banish',
          'Shooting is automatic',
        ])
      );
      expect(modern.join(' ')).not.toMatch(/turn|thrust/);
      expect(items(list, 'classic')).toEqual(
        expect.arrayContaining(['W ↑ thrust', 'S ↓ brake', 'A D turn'])
      );
    });
  });
});

describe('Gamepad controls hints', () => {
  it('name the stick scheme per flight mode, the strafe, and RB/LT for dash and shield', () => {
    const lists = [
      ...html.matchAll(
        /<ul\s+class="controls-hints"\s+data-device="gamepad"[\s\S]*?<\/ul>/g
      ),
    ].map(([list]) => list);
    expect(lists).toHaveLength(2);
    lists.forEach((list) => {
      expect(items(list, 'classic')).toEqual(
        expect.arrayContaining([
          'L-Stick ↑ thrust ↓ brake',
          'R-Stick ← → turn',
          'L-Stick ← → strafe',
          'RB dash',
          'LT shield',
        ])
      );
      expect(items(list, 'modern')).toEqual(
        expect.arrayContaining([
          'L-Stick move',
          'R-Stick aim',
          'LB + L-Stick strafe',
          'RB dash',
          'LT shield',
        ])
      );
      expect(list).not.toMatch(/<kbd>LB<\/kbd> shield/);
    });
  });
});
