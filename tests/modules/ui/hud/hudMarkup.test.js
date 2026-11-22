import { describe, expect, it } from 'vitest';
import { getHudHtml } from '../../../../src/modules/ui/hud/hudMarkup.js';

// The skip hint under the story scenes speaks to the device in use
// (style.css shows the span whose data-device matches it).
const hint = (device) =>
  getHudHtml().match(
    new RegExp(
      `id="ui-cinematic-hint">[\\s\\S]*?<span data-device="${device}">([^<]*)<`
    )
  )[1];

describe('the story skip hint', () => {
  it('shows the controller its button, not a key', () => {
    expect(hint('keyboard')).toBe('PRESS ANY KEY TO SKIP');
    expect(hint('gamepad')).toBe('PRESS Ⓐ TO SKIP');
  });
});
