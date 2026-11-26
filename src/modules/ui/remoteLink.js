// src/modules/ui/remoteLink.js
//
// The way into a run from the menu (the owner's card, 17/11): the pressed
// button lights, the screen goes dark with static while the Wake's link writes
// its lines, then the run starts behind the static and the signal clears onto
// it (about 2 s). The skip key, held or tapped, connects at once
// (ui/skipHold.js); any other press only shows how. Styles: style.css
// .remote-link.

import { listenForHold } from './skipHold.js';

const LINE_STEP_MS = 250;
const CONNECT_MS = 1400;
const CLEAR_MS = 800;
const QUICK_CLEAR_MS = 300;

let noiseUrl = null;

// One frame of grey static, made once (a hash, not a random draw).
function noise() {
  if (noiseUrl) return noiseUrl;
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 120;
  const context = canvas.getContext('2d');
  const image = context.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    let hash = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    const value = (hash ^ (hash >>> 16)) & 255;
    image.data.set([value, value, value, 255], i);
  }
  context.putImageData(image, 0, 0);
  noiseUrl = canvas.toDataURL();
  return noiseUrl;
}

/**
 * The link's lines for a run from the menu in `mode` (src/core/runMode.js),
 * flown by the hull `hullName`.
 */
export function remoteLinkLines(mode, hullName = '') {
  return [
    ['WAKE · REMOTE LINK'],
    ['HULL', hullName.toUpperCase()],
    ['SECTOR', mode.linkPlace],
    ['SIGNAL', 'CLEAN'],
  ];
}

/**
 * Plays the link and starts the run under it.
 * `lines`: [label, value] rows (a row without a value is the heading).
 * `button`: the pressed button, lit until the run starts.
 * `onConnect`: starts the run. `eventBus`: hears 'remote-link-opened'.
 */
export function playRemoteLink({ lines, button, onConnect, eventBus }) {
  const root = document.createElement('div');
  root.className = 'remote-link';
  root.style.setProperty('--noise', `url(${noise()})`);
  const panel = document.createElement('div');
  panel.className = 'remote-link__lines';
  lines.forEach(([label, value], index) => {
    const row = document.createElement('div');
    row.className = 'remote-link__line';
    row.style.animationDelay = `${(index + 1) * LINE_STEP_MS}ms`;
    row.textContent = value
      ? `${label} ${'.'.repeat(Math.max(3, 13 - label.length))} `
      : label;
    if (value) {
      const shown = document.createElement('span');
      shown.textContent = value;
      row.append(shown);
    }
    panel.append(row);
  });
  root.append(panel);
  button?.classList.add('is-launching');
  // The menu stays under the static but takes no input until the run
  // starts: its way back (Escape, pad B) would bring the title over the run.
  const menu = button?.closest('.screen');
  if (menu) menu.inert = true;
  document.body.append(root);
  eventBus?.emit('remote-link-opened');

  let connected = false;
  const timer = setTimeout(() => connect(CLEAR_MS), CONNECT_MS);
  const skip = () => connect(QUICK_CLEAR_MS);
  const unbindSkip = listenForHold(skip, skip);

  function connect(clearMs) {
    if (connected) return;
    connected = true;
    clearTimeout(timer);
    unbindSkip();
    button?.classList.remove('is-launching');
    if (menu) menu.inert = false;
    onConnect();
    root.style.setProperty('--clear', `${clearMs}ms`);
    root.classList.add('remote-link--clearing');
    setTimeout(() => root.remove(), clearMs);
  }
}
