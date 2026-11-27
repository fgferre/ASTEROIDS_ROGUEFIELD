import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomEvents } from '../../../__helpers__/domEvents.js';

// The event imitator the input-layer tests stand on: the browser's order,
// checked here once so a rule pinned there is the game's, not the rig's.
describe('DOM event imitator', () => {
  let dom;
  let heard;
  let button;
  const log = (name) => () => heard.push(name);
  beforeEach(() => {
    dom = installDomEvents();
    heard = [];
    const panel = dom.el('div', { id: 'panel' }, dom.document.body);
    button = dom.el('button', { id: 'go' }, panel);
  });
  afterEach(() => dom.restore());

  it('runs capture from window down, the target, then bubble up', () => {
    const { window, document } = dom;
    const panel = document.getElementById('panel');
    window.addEventListener('keydown', log('window bubble'));
    window.addEventListener('keydown', log('window capture'), true);
    document.addEventListener('keydown', log('document bubble'));
    document.addEventListener('keydown', log('document capture'), true);
    panel.addEventListener('keydown', log('panel bubble'));
    panel.addEventListener('keydown', log('panel capture'), true);
    button.addEventListener('keydown', log('button'));
    button.addEventListener('keydown', log('button capture'), true);
    button.focus();

    dom.tap('Enter');

    expect(heard).toEqual([
      'window capture',
      'document capture',
      'panel capture',
      'button capture',
      'button',
      'panel bubble',
      'document bubble',
      'window bubble',
    ]);
  });

  it('stopPropagation ends the path but not the node and phase it is in', () => {
    const { document } = dom;
    document.addEventListener('keydown', (e) => e.stopPropagation(), true);
    document.addEventListener('keydown', log('same node, same phase'), true);
    document.addEventListener('keydown', log('same node, bubble'));
    button.addEventListener('keydown', log('target'));

    dom.tap('KeyS');

    expect(heard).toEqual(['same node, same phase']);
  });

  it('stopImmediatePropagation also skips the later listeners of that node', () => {
    const { window, document } = dom;
    window.addEventListener('keydown', log('first'), true);
    window.addEventListener(
      'keydown',
      (e) => e.stopImmediatePropagation(),
      true
    );
    window.addEventListener('keydown', log('after it'), true);
    document.addEventListener('keydown', log('below'), true);

    dom.tap('Space');

    expect(heard).toEqual(['first']);
  });

  it('a listener added or removed during a step changes only the next dispatch', () => {
    const { document } = dom;
    const late = log('late');
    const removed = log('removed');
    document.addEventListener('keydown', () => {
      document.addEventListener('keydown', late);
      document.removeEventListener('keydown', removed);
    });
    document.addEventListener('keydown', removed);

    dom.tap('Enter');
    expect(heard).toEqual([]);
    dom.tap('Enter');
    expect(heard).toEqual(['late']);
  });

  it('once runs a listener one time; removal matches its capture flag', () => {
    const { window } = dom;
    const fn = log('fn');
    window.addEventListener('keydown', log('once'), { once: true });
    window.addEventListener('keydown', fn, true);
    window.removeEventListener('keydown', fn);
    dom.tap('Enter');
    window.removeEventListener('keydown', fn, { capture: true });
    dom.tap('Enter');

    expect(heard).toEqual(['fn', 'once']);
  });

  it('preventDefault marks the event; nothing clicks on its own', () => {
    let clicked = 0;
    button.addEventListener('click', () => (clicked += 1));
    button.addEventListener('keydown', (e) => e.preventDefault());
    button.focus();

    const event = dom.tap('Enter');
    expect(event.defaultPrevented).toBe(true);
    expect(clicked).toBe(0);
    button.click();
    expect(clicked).toBe(1);
  });

  it('keys go to the focused element, or the body; markup builds elements', () => {
    const { document } = dom;
    let target = null;
    document.addEventListener('keydown', (e) => (target = e.target));
    dom.tap('Escape');
    expect(target).toBe(document.body);

    const panel = document.getElementById('panel');
    panel.innerHTML =
      '<button type="button" data-ending="a"><kbd>1</kbd>A</button><button data-ending="b" disabled>B</button>';
    expect(panel.querySelectorAll('[data-ending]')).toHaveLength(2);
    expect(panel.querySelectorAll('button:not([disabled])')).toHaveLength(1);
    expect(panel.querySelector('#panel > button kbd').textContent).toBe('1');
    panel.querySelector('[data-ending="a"]').focus();
    dom.tap('Digit1');
    expect(target.dataset.ending).toBe('a');
  });
});
