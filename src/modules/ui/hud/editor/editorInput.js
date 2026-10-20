// src/modules/ui/hud/editor/editorInput.js
//
// How the HUD editor is driven from the keyboard and the pad (HudEditor.js
// owns what the presses do). Keys: Tab / Shift+Tab select the next or the
// previous instrument, the arrows nudge it 1 px (Shift 10; with nothing
// selected they select toward that side), Ctrl+Z / Ctrl+Shift+Z (or
// Ctrl+Y) undo and redo, G the grid, H shows or hides, Esc steps back
// (out of a control, the move, the selection, then the editor). Pad: the
// d-pad selects, A picks the instrument up to move it 10 px a press, LB /
// RB switch its model, X shows or hides, Y hands the d-pad to the panels,
// B steps back.

const DIRECTIONS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};
const STEPS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const PAD_STEP = 10;

/** A key on the window while the editor is open (capture phase). */
export function editorKey(editor, event) {
  const s = editor.state;
  if (!s) return;
  // Nothing reaches the game or the other screens while editing.
  event.stopImmediatePropagation();
  const { target, key } = event;
  const mod = event.ctrlKey || event.metaKey;
  const typing =
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type === 'text');

  if (editor.dialogs.isOpen) {
    editor.dialogs.handleKey(event);
    return;
  }
  if (s.menu && key === 'Escape') {
    event.preventDefault();
    editor.closeMenu();
    editor.el.menuButton.focus();
    return;
  }
  if (mod && (key === 'z' || key === 'Z')) {
    event.preventDefault();
    if (event.shiftKey) editor.redo();
    else editor.undo();
    return;
  }
  if (mod && (key === 'y' || key === 'Y')) {
    event.preventDefault();
    editor.redo();
    return;
  }
  if (typing) return;
  const onControl = target !== editor.chrome && editor.chrome.contains(target);
  const ownsArrows =
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement && target.type === 'range');

  if (key === 'Escape') {
    event.preventDefault();
    if (onControl) editor.chrome.focus({ preventScroll: true });
    else if (s.grab) editor.setGrab(false);
    else if (s.selected) editor.select(null);
    else editor.requestClose();
    return;
  }
  if (key === 'Tab' && !onControl) {
    event.preventDefault();
    editor.cycle(event.shiftKey ? -1 : 1);
    return;
  }
  const direction = DIRECTIONS[key];
  if (direction && !ownsArrows) {
    event.preventDefault();
    if (!s.selected) {
      editor.selectToward(direction);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const [dx, dy] = STEPS[direction];
    editor.nudge(dx * step, dy * step);
    return;
  }
  if (mod || event.altKey || onControl) return;
  if (key === 'g' || key === 'G') editor.toggle('grid');
  else if ((key === 'h' || key === 'H') && s.selected) {
    editor.setVisible(!editor.item(s.selected).visible);
  }
}

/** A pad menu press: 'up' … 'right', 'confirm', 'back', 'tabPrev', 'tabNext', 'reroll', 'banish'. */
export function editorPad(editor, action) {
  const s = editor.state;
  if (!s) return;
  if (editor.dialogs.isOpen) {
    if (action === 'back') editor.dialogs.run('cancel');
    return;
  }
  if (s.padPanel) {
    if (action === 'back' || action === 'banish') {
      s.padPanel = false;
      editor.chrome.focus({ preventScroll: true });
      editor.render();
    }
    return;
  }
  if (STEPS[action]) {
    if (s.grab) {
      const [dx, dy] = STEPS[action];
      editor.nudge(dx * PAD_STEP, dy * PAD_STEP);
    } else {
      editor.selectToward(action);
    }
    return;
  }
  const item = s.selected && editor.item(s.selected);
  switch (action) {
    case 'confirm':
      if (!item) editor.cycle(1);
      else if (item.anchor !== 'screen') editor.setGrab(!s.grab);
      break;
    case 'back':
      if (s.grab) editor.setGrab(false);
      else if (item) editor.select(null);
      else editor.requestClose();
      break;
    case 'tabPrev':
    case 'tabNext':
      if (item) editor.stepModel(action === 'tabNext' ? 1 : -1);
      break;
    case 'reroll':
      if (item) editor.setVisible(!item.visible);
      break;
    case 'banish': {
      s.padPanel = true;
      s.grab = false;
      editor.render();
      const first = editor.el.insp.querySelector('button, input');
      (first ?? editor.el.select).focus({ preventScroll: true });
      break;
    }
    default:
      break;
  }
}
