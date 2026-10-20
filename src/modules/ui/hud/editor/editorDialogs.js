// src/modules/ui/hud/editor/editorDialogs.js
//
// The HUD editor's dialogs and toast. One dialog at a time over the editor
// (editorView.js dialogMarkup): its buttons run the handlers it was opened
// with (one returning false keeps it open), Esc cancels, Enter confirms,
// and the focus stays inside it until it closes.

import { dialogMarkup } from './editorView.js';
import { cleanName } from './layoutStore.js';

const TOAST_MS = 2600;

export class EditorDialogs {
  /**
   * `scrim`: the dialog host; `toast`: the toast line; `refocus()`: the
   * focus back to the editor once a dialog closes.
   */
  constructor({ scrim, toast, refocus }) {
    this.scrim = scrim;
    this.toastLine = toast;
    this.refocus = refocus;
    this.current = null;
    this.toastTimer = null;
  }

  get isOpen() {
    return Boolean(this.current);
  }

  /** A dialog of `kind` with `data`; `handlers[action]` run on its buttons. */
  open(kind, data, handlers = {}) {
    this.current = { kind, handlers };
    this.scrim.innerHTML = dialogMarkup(kind, data);
    this.scrim.hidden = false;
    const input = this.scrim.querySelector('[data-dialog-input]');
    const primary = this.scrim.querySelector('.hed-btn--primary');
    (input ?? primary)?.focus({ preventScroll: true });
    if (input?.type === 'text') input.select();
  }

  /** The dialog's `action` button ('cancel', 'ok', 'save'…). */
  run(action) {
    const dialog = this.current;
    if (!dialog) return;
    if (action === 'cancel') {
      this.close();
      dialog.handlers.cancel?.();
      return;
    }
    const handler = dialog.handlers[action];
    if (!handler) return;
    const value = this.scrim.querySelector('[data-dialog-input]')?.value;
    if (handler(value) === false) return;
    if (this.current === dialog) this.close();
  }

  close() {
    if (!this.current) return;
    this.current = null;
    this.scrim.hidden = true;
    this.scrim.innerHTML = '';
    this.refocus();
  }

  /** The red line under the field. */
  error(text) {
    const line = this.scrim.querySelector('[data-dialog-error]');
    if (line) line.textContent = text;
  }

  /** The dialog's text line, replaced. */
  text(text) {
    const line = this.scrim.querySelector('.hed-dialog__text');
    if (line) line.textContent = text;
  }

  /** A name for a layout: `done(name)` runs with a clean, non-empty one. */
  askName(options, done) {
    this.open('name', options, {
      ok: (value) => {
        const name = cleanName(value);
        if (!name) {
          this.error('Give the layout a name.');
          return false;
        }
        this.close();
        done(name);
        return true;
      },
    });
  }

  /** A key while a dialog is open: Esc, Tab (kept inside) and Enter. */
  handleKey(event) {
    const { key, target } = event;
    if (key === 'Escape') {
      event.preventDefault();
      this.run('cancel');
    } else if (key === 'Tab') {
      event.preventDefault();
      const stops = [...this.scrim.querySelectorAll('button, input, textarea')];
      const at = stops.indexOf(target);
      const step = event.shiftKey ? -1 : 1;
      stops[at < 0 ? 0 : (at + step + stops.length) % stops.length]?.focus();
    } else if (key === 'Enter' && !(target instanceof HTMLButtonElement)) {
      const area = target instanceof HTMLTextAreaElement;
      if (area && !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      this.run('ok');
    }
  }

  /** A short line under the toolbar. */
  toast(text) {
    this.toastLine.textContent = text;
    this.toastLine.classList.add('is-on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(
      () => this.toastLine.classList.remove('is-on'),
      TOAST_MS
    );
  }

  dispose() {
    window.clearTimeout(this.toastTimer);
  }
}
