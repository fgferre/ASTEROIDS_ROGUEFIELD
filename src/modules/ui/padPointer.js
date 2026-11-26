// src/modules/ui/padPointer.js
//
// The pad's pointer on the menus, the owner's "modelo do Halo" (23/11: "o
// mouse vai ser controlado pelo controle, quando o controle tiver"; card
// apontador-1: the round reticle, the middle speed, a light snap). The left
// stick moves it, A clicks what is under it (held, it drags), the right stick
// scrolls what is under it. It sends the mouse's own events where it stands,
// so every screen answers it as it answers the mouse. The d-pad still steps
// item by item (gamepadNav.js) and hides it, as the mouse, the keys and a
// touch do; B and LB/RB keep their jobs. Never during the flight itself.

import { applyStickDeadzone } from '../input/gamepadReading.js';
import { GAMEPAD_FOCUSABLE_SELECTOR } from './gamepadNav.js';

// Full tilt crosses the screen's height in 0.9 s. Not confirmed: felt on
// his pad first.
export const POINTER_SPEED = 1.1;
// Over anything clickable it moves this much slower, so it stops there.
export const POINTER_SNAP = 0.4;
// Full tilt of the right stick, in px per second.
const SCROLL_SPEED = 1400;
// The reticle: a ring, four ticks and a centre dot (the point that clicks),
// each line drawn dark and wide first so it reads on the cyan buttons too.
const HOT = 20;
const RETICLE = `<g fill="none" stroke-linecap="round"><g stroke="rgba(2,8,12,0.9)" stroke-width="5.5"><circle cx="20" cy="20" r="11"/><path d="M20 3 V10 M20 30 V37 M3 20 H10 M30 20 H37"/></g><g stroke="#5ff4ff"><circle cx="20" cy="20" r="11" stroke-width="2"/><path d="M20 3 V10 M20 30 V37 M3 20 H10 M30 20 H37" stroke-width="2.5"/></g></g><circle cx="20" cy="20" r="3.5" fill="rgba(2,8,12,0.9)"/><circle cx="20" cy="20" r="2.2" fill="#ffffff"/>`;

/** Something under `el` that scrolls, or null. */
function scrollerUnder(el) {
  for (
    let node = el;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (
      node.scrollHeight > node.clientHeight + 1 &&
      /(auto|scroll)/.test(getComputedStyle(node).overflowY)
    ) {
      return node;
    }
  }
  return null;
}

/** Built by UISystem with itself (`ui`: padNav, hudEditor, getService). */
export class PadPointer {
  constructor(ui) {
    this.ui = ui;
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.shown = false;
    this.placed = false;
    this.under = null; // the element under the pointer
    this.down = null; // where A went down, while held
    this.slider = null; // a range input A is dragging
    this.held = false;
    this.last = performance.now();
    this.el = document.createElement('div');
    this.el.id = 'pad-pointer';
    this.el.className = 'pad-pointer';
    this.el.hidden = true;
    this.el.innerHTML = `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">${RETICLE}</svg>`;
    document.body.appendChild(this.el);
    // The real mouse, a key or a touch takes over: the pointer goes.
    const leave = (event) => event.isTrusted && this.hide();
    window.addEventListener('mousemove', leave, true);
    window.addEventListener('keydown', leave, true);
    window.addEventListener('touchstart', leave, true);
    requestAnimationFrame(() => this.tick());
  }

  /** A menu or overlay is up (not the flight itself). */
  menuUp() {
    const gate = document.getElementById('loading-screen');
    return Boolean(
      this.ui.padNav.screen() ||
        this.ui.hudEditor.isOpen ||
        document.querySelector('.pilot-screen') ||
        (gate && !gate.classList.contains('hidden'))
    );
  }

  hide() {
    if (!this.shown) return;
    this.shown = false;
    delete document.body.dataset.padPointer;
    this.el.hidden = true;
    this.release(false);
  }

  tick() {
    requestAnimationFrame(() => this.tick());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // The pad the game reads (InputSystem), not the browser's first: a PC
    // can list an idle device before the one in the hand.
    this.step(this.ui.getService('input')?.gamepad, dt);
  }

  /** One frame of `pad` (or none) over `dt` seconds. */
  step(pad, dt) {
    if (!pad || !this.menuUp()) {
      this.hide();
      return;
    }
    const move = applyStickDeadzone(pad.axes[0], pad.axes[1]);
    const scroll = applyStickDeadzone(pad.axes[2], pad.axes[3]).y;
    const a = Boolean(pad.buttons[0]?.pressed);
    if ((move.x || move.y) && !this.shown) this.show();
    if (!this.shown) {
      this.held = a;
      return;
    }
    if (move.x || move.y) this.move(move, dt);
    if (scroll) this.scroll(scroll, dt);
    if (a && !this.held) this.press();
    else if (!a && this.held) this.release(true);
    this.held = a;
  }

  show() {
    this.shown = true;
    // InputSystem leaves A and the right stick to the pointer meanwhile.
    document.body.dataset.padPointer = 'shown';
    this.el.hidden = false;
    if (!this.placed) {
      // First time: on the highlighted control, else mid-screen.
      const rect = document.activeElement?.getBoundingClientRect?.();
      if (rect?.width) {
        this.x = rect.left + rect.width / 2;
        this.y = rect.top + rect.height / 2;
      }
      this.placed = true;
    }
    this.draw();
    this.hover();
  }

  move({ x, y }, dt) {
    // Tilt squared: a light lean is fine aim, a full one crosses the screen.
    let step = POINTER_SPEED * window.innerHeight * Math.hypot(x, y) * dt;
    if (this.under?.closest(GAMEPAD_FOCUSABLE_SELECTOR)) step *= POINTER_SNAP;
    this.x = Math.min(window.innerWidth - 1, Math.max(0, this.x + x * step));
    this.y = Math.min(window.innerHeight - 1, Math.max(0, this.y + y * step));
    this.draw();
    this.hover();
  }

  draw() {
    this.el.style.transform = `translate(${this.x - HOT}px, ${this.y - HOT}px)`;
  }

  mouse(type, target) {
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: this.x,
      clientY: this.y,
      button: 0,
      buttons: this.down ? 1 : 0,
    };
    target.dispatchEvent(
      type.startsWith('pointer')
        ? new PointerEvent(type, {
            ...init,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
          })
        : new MouseEvent(type, init)
    );
  }

  /** The element under the pointer hears it come, move and go; the control
   * under it takes the highlight, as a step of the d-pad would give it. */
  hover() {
    const el = document.elementFromPoint(this.x, this.y);
    if (el !== this.under) {
      if (this.under) {
        this.mouse('pointerout', this.under);
        this.mouse('mouseout', this.under);
      }
      this.under = el;
      if (el) {
        this.mouse('pointerover', el);
        this.mouse('mouseover', el);
        const control = el.closest(GAMEPAD_FOCUSABLE_SELECTOR);
        if (control && control !== document.activeElement) {
          control.focus({ preventScroll: true });
        }
      }
    }
    if (!el) return;
    this.mouse('pointermove', el);
    this.mouse('mousemove', el);
    if (this.slider) this.slide();
  }

  press() {
    const el = this.under;
    if (!el) return;
    if (el.tagName === 'INPUT' && el.type === 'range') {
      this.slider = el;
      el.focus({ preventScroll: true });
      this.slide();
      return;
    }
    if (el.tagName === 'SELECT') {
      // A list: A opens it for the d-pad and closes it, as the highlight's A.
      el.focus({ preventScroll: true });
      this.ui.padNav.handle('confirm');
      return;
    }
    this.down = el;
    this.mouse('pointerdown', el);
    this.mouse('mousedown', el);
  }

  /** A up: the click lands where A went down, if the pointer is still on it. */
  release(click) {
    if (this.slider) {
      this.slider.dispatchEvent(new Event('change', { bubbles: true }));
      this.slider = null;
    }
    const down = this.down;
    if (!down) return;
    this.down = null;
    const el = this.under ?? down;
    this.mouse('pointerup', el);
    this.mouse('mouseup', el);
    if (click && (down === el || down.contains(el) || el.contains(down))) {
      this.mouse('click', down);
    }
  }

  /** A held on a slider: its value follows the pointer across it. */
  slide() {
    const el = this.slider;
    const rect = el.getBoundingClientRect();
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const t = Math.min(1, Math.max(0, (this.x - rect.left) / rect.width));
    const value = String(min + t * (max - min));
    if (value === el.value) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  scroll(dy, dt) {
    const box = this.under && scrollerUnder(this.under);
    if (box) box.scrollBy(0, dy * SCROLL_SPEED * dt);
    else this.ui.padNav.scroll(dy);
    this.hover();
  }
}
