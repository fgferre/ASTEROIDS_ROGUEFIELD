// src/modules/ui/padPointer.js
//
// The pad's pointer on the menus, the owner's "modelo do Halo" (23/11: "o
// mouse vai ser controlado pelo controle, quando o controle tiver"): the left
// stick moves it, A clicks what is under it (held, it drags), the right stick
// scrolls what is under it. It sends the mouse's own events where it stands,
// so every screen answers it as it answers the mouse. The d-pad still steps
// item by item (gamepadNav.js) and hides it, as the mouse and the keys do; B
// and LB/RB keep their jobs.
//
// For him to try first, behind the test address only: ?pointer=a|b|c picks
// its look, ?pointerSpeed=slow|good|fast its speed, ?pointerSnap=1 slows it
// over anything clickable.

import { applyStickDeadzone } from '../InputSystem.js';
import { GAMEPAD_FOCUSABLE_SELECTOR } from './gamepadNav.js';

const params =
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
const LOOK = params.get('pointer');

/** The pointer replaces the left stick's item-by-item steps. */
export const PAD_POINTER_ON = ['a', 'b', 'c'].includes(LOOK);

// Full tilt, in screen heights per second.
export const POINTER_SPEEDS = { slow: 0.7, good: 1.1, fast: 1.6 };
const SPEED = POINTER_SPEEDS[params.get('pointerSpeed')] ?? POINTER_SPEEDS.good;
// Over something clickable, with the snap on, it moves this much slower.
const SNAP_SLOWDOWN = 0.4;
const SNAP = params.get('pointerSnap') === '1';
// Full tilt of the right stick, in px per second.
const SCROLL_SPEED = 1400;

// The three looks; `hot` is the point that clicks, in the 40 px box.
const LOOKS = {
  // Arrow: a ship's chevron, cyan edge on a dark body.
  a: {
    hot: [6, 4],
    svg: `<path d="M6 4 L6 31 L13.5 24 L19 35 L24 32.5 L18.5 22 L29 21 Z" fill="rgba(4,14,20,0.82)" stroke="#5ff4ff" stroke-width="2" stroke-linejoin="round"/><path d="M9 11 L9 24 L13 20.5" fill="none" stroke="#5ff4ff" stroke-opacity="0.45" stroke-width="1.5"/>`,
  },
  // Reticle: a ring with four ticks and a centre dot. Each line is drawn
  // dark and wide first, so it reads on the cyan buttons too.
  b: {
    hot: [20, 20],
    svg: `<g fill="none" stroke-linecap="round"><g stroke="rgba(2,8,12,0.9)" stroke-width="5.5"><circle cx="20" cy="20" r="11"/><path d="M20 3 V10 M20 30 V37 M3 20 H10 M30 20 H37"/></g><g stroke="#5ff4ff"><circle cx="20" cy="20" r="11" stroke-width="2"/><path d="M20 3 V10 M20 30 V37 M3 20 H10 M30 20 H37" stroke-width="2.5"/></g></g><circle cx="20" cy="20" r="3.5" fill="rgba(2,8,12,0.9)"/><circle cx="20" cy="20" r="2.2" fill="#ffffff"/>`,
  },
  // Brackets: four corners round a lit dot, a target lock.
  c: {
    hot: [20, 20],
    svg: `<g fill="none" stroke-linecap="square"><path d="M8 15 V8 H15 M25 8 H32 V15 M32 25 V32 H25 M15 32 H8 V25" stroke="rgba(2,8,12,0.9)" stroke-width="6"/><path d="M8 15 V8 H15 M25 8 H32 V15 M32 25 V32 H25 M15 32 H8 V25" stroke="#5ff4ff" stroke-width="2.5"/></g><circle cx="20" cy="20" r="5.5" fill="rgba(2,8,12,0.9)"/><circle cx="20" cy="20" r="3.8" fill="#5ff4ff"/>`,
  },
};

let shown = false;

/** True while the pointer is on screen: A and the right stick are its. The
 * page carries it too (body data-pad-pointer), for InputSystem. */
export function padPointerShown() {
  return shown;
}

function mark(state) {
  document.body.dataset.padPointer = state;
}

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

/** Started by UISystem with itself (`ui`), only on the test address. */
export class PadPointer {
  constructor(ui) {
    this.ui = ui;
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.placed = false;
    this.under = null; // the element under the pointer
    this.down = null; // where A went down, while held
    this.slider = null; // a range input A is dragging
    this.held = false;
    this.last = performance.now();
    const look = LOOKS[LOOK];
    this.hot = look.hot;
    this.el = document.createElement('div');
    this.el.id = 'pad-pointer';
    this.el.className = 'pad-pointer';
    this.el.hidden = true;
    this.el.innerHTML = `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">${look.svg}</svg>`;
    document.body.appendChild(this.el);
    mark('on');
    // The real mouse or a key takes over: the pointer goes.
    window.addEventListener(
      'mousemove',
      (event) => event.isTrusted && this.hide(),
      true
    );
    window.addEventListener(
      'keydown',
      (event) => event.isTrusted && this.hide(),
      true
    );
    requestAnimationFrame(() => this.frame());
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
    if (!shown) return;
    shown = false;
    mark('on');
    this.el.hidden = true;
    this.release(false);
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(Boolean);
    if (!pad || !this.menuUp()) {
      this.hide();
      return;
    }
    const move = applyStickDeadzone(pad.axes[0], pad.axes[1]);
    const scroll = applyStickDeadzone(pad.axes[2], pad.axes[3]).y;
    const a = Boolean(pad.buttons[0]?.pressed);
    if ((move.x || move.y) && !shown) this.show();
    if (!shown) {
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
    shown = true;
    mark('shown');
    this.el.hidden = false;
    if (!this.placed) {
      // First time: on the highlighted control, else mid-screen.
      const rect = document.activeElement?.getBoundingClientRect?.();
      if (rect && rect.width) {
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
    let step = SPEED * window.innerHeight * Math.hypot(x, y) * dt;
    if (SNAP && this.under?.closest(GAMEPAD_FOCUSABLE_SELECTOR)) {
      step *= SNAP_SLOWDOWN;
    }
    this.x = Math.min(window.innerWidth - 1, Math.max(0, this.x + x * step));
    this.y = Math.min(window.innerHeight - 1, Math.max(0, this.y + y * step));
    this.draw();
    this.hover();
  }

  draw() {
    this.el.style.transform = `translate(${this.x - this.hot[0]}px, ${this.y - this.hot[1]}px)`;
  }

  mouse(type, target, extra = {}) {
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: this.x,
      clientY: this.y,
      button: 0,
      buttons: this.down ? 1 : 0,
      ...extra,
    };
    if (type.startsWith('pointer')) {
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          ...init,
        })
      );
    } else {
      target.dispatchEvent(new MouseEvent(type, init));
    }
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
      // A list: the d-pad changes it, as the highlight's A already does.
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
