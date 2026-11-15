import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { MainMenu } from '../../../src/modules/ui/MainMenu.js';

// A container that keeps its listeners, so a test can fire them.
function fakeNode(children = []) {
  const listeners = {};
  return {
    children,
    addEventListener: (type, fn) => (listeners[type] = fn),
    fire: (type, event = {}) => listeners[type]?.(event),
    contains(node) {
      return Boolean(node) && children.includes(node);
    },
    querySelector() {
      return children[0];
    },
  };
}

function fakeButton(hint) {
  const button = { dataset: { hint } };
  button.closest = () => button;
  return button;
}

describe('Main menu mode line', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('follows the hovered or focused button and falls back to focus, then the first', () => {
    const [campaign, descent, daily] = ['Campaign', 'Descent', 'Daily'].map(
      fakeButton
    );
    const nav = fakeNode([campaign, descent, daily]);
    const hint = { textContent: '' };
    new MainMenu({ refs: { nav, hint } }).bindModeHints();
    expect(hint.textContent).toBe('Campaign');

    nav.fire('pointerover', { target: descent });
    expect(hint.textContent).toBe('Descent');

    document.activeElement = daily;
    nav.fire('focusin', { target: daily });
    expect(hint.textContent).toBe('Daily');
    nav.fire('pointerover', { target: descent });
    nav.fire('pointerleave');
    expect(hint.textContent).toBe('Daily');

    document.activeElement = null;
    nav.fire('focusout', { relatedTarget: null });
    expect(hint.textContent).toBe('Campaign');
  });
});
