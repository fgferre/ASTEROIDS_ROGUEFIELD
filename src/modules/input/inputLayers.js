// src/modules/input/inputLayers.js
//
// The input layer stack (Felipe, 26/11: one router of the active layer, not
// a patch per screen): the screens open over the menu or the flight, last
// opened on top; empty, the menu or the flight has the input (the menu's
// own keys: `addBase`). Only the top layer hears a key, from the one keydown
// and one keyup listener here (window capture, bound by InputSystem before
// any screen's); the pad moves in the top layer's screen (ui/gamepadNav.js)
// and the bus confirm goes to it alone (`confirm`).
// A key a layer takes is not stopped: the listeners that are not screens
// (InputSystem, the audio unlock, F3, F8/F9, the pad pointer) still hear
// it, and InputSystem acts on none it took (`took`). The game's actions
// under a layer pass only when it lists them, and this is the one place
// that says when Settings may open: InputSystem asks `passes(action, event)`.
//
// A layer: { name, element, onKey, onKeyUp, onPad, onConfirm, passes }.
// `name` is its screen's id, `element` its `#<name>-screen` (null: nothing
// there for the pad to move in); `onKey(event)` returns true when the key is
// the layer's alone (none of the game's actions on it) and calls
// preventDefault itself where the browser's own action must not run;
// `onKeyUp(event)` hears a release; `onPad(action)` takes the pad's menu
// presses instead of the focus moving in `element`; `onConfirm()` the bus
// confirm; `passes` lists the game's actions that still reach the game
// under it. `staysOnTop` (Settings): a screen that opens while it is up goes
// under it; `noSettings`: Settings does not open over it (the loading
// screen: the game is not ready, the gate wakes on any key; the HUD editor:
// Settings' own page, drawn above it; the link into a run, drawn over every
// screen); `pointer`: the pad's pointer works
// over it without `element` (ui/padPointer.js). All but `name` and `passes`
// may be left out. While any layer is up, nothing held moves the ship
// (InputSystem.sampleInputFrame).

// Settings opens over any screen but the ending's acts: they do not hold the
// run and play on wall-clock time (their beats, the renderer's beat
// animation, the voice queue), so they would go on under Settings and the
// end of act 1 would open the choice under it. Pausing them is a larger
// change that reaches into render3d.
const NO_SETTINGS_IN = ['revelation', 'ending'];
// A cinematic that holds the run takes Start as its skip key: the pause
// passes only in the ones that play on, the epilogue and a Warden's arrival.
const PAUSE_IN = ['epilogue', 'arrival'];

class InputLayerStack {
  constructor() {
    this.layers = [];
    // The menu's own keys, heard with no layer on top (`addBase`).
    this.base = [];
    // The last keydown: the layer on top when it came, and whether it took it.
    this.key = null;
    this.cinematic = null;
    this.window = null;
    this.bus = null;
    this.onKeyDown = (event) => {
      const layer = this.top();
      if (!layer) this.base.forEach((onKey) => onKey(event));
      this.key = { event, layer, taken: Boolean(layer?.onKey?.(event)) };
    };
    this.onKeyUp = (event) => this.top()?.onKeyUp?.(event);
    this.onCinematicStarted = (event) => (this.cinematic = event?.kind);
    this.onCinematicEnded = () => (this.cinematic = null);
  }

  /** At boot (InputSystem): the key listeners, and the cinematics heard on
   * `bus`; the stack starts empty (a second install replaces the first). */
  install(bus) {
    this.window?.removeEventListener('keydown', this.onKeyDown, true);
    this.window?.removeEventListener('keyup', this.onKeyUp, true);
    this.bus?.off('cinematic-started', this.onCinematicStarted);
    this.bus?.off('cinematic-ended', this.onCinematicEnded);
    this.layers = [];
    this.base = [];
    this.key = null;
    this.cinematic = null;
    this.window = window;
    this.bus = bus;
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    bus?.on('cinematic-started', this.onCinematicStarted);
    bus?.on('cinematic-ended', this.onCinematicEnded);
  }

  /** A screen opened: its layer goes on top, or under Settings when that
   * is up (the cards after a scene, the victory after the epilogue): what
   * is shown under Settings hears nothing until it closes. */
  push(layer) {
    this.remove(layer);
    const under = this.top()?.staysOnTop ? 1 : 0;
    this.layers.splice(this.layers.length - under, 0, layer);
  }

  /** The menu's own keys (the campaign map, Escape back to the title):
   * `onKey(event)` hears each key while no layer is on top. */
  addBase(onKey) {
    this.base.push(onKey);
  }

  /** A screen closed: its layer leaves, wherever it is. */
  remove(layer) {
    this.layers = this.layers.filter((entry) => entry !== layer);
  }

  top() {
    return this.layers.at(-1) ?? null;
  }

  /** Another screen is on top of `layer` (Settings): `layer` must not take
   * the focus, or Enter would press its button unseen. */
  covered(layer) {
    const top = this.top();
    return Boolean(top) && top !== layer;
  }

  /** The keydown `event` was the top layer's alone. */
  took(event) {
    return Boolean(event) && this.key?.event === event && this.key.taken;
  }

  /** The layer that was on top when the keydown `event` came (it may have
   * closed since); for no event, or any other, the one on top now. */
  layerFor(event) {
    return event && this.key?.event === event ? this.key.layer : this.top();
  }

  /** The bus confirm (Enter, Space, the pad's A; UISystem): the top
   * layer's alone. One card screen is up at a time (the chest and the
   * briefing wait for the cards: UISystem.showGameUI), each with its 400 ms
   * lockout, so the confirm that closes one never also takes the next. */
  confirm() {
    this.top()?.onConfirm?.();
  }

  /** Whether the game's `action` (the pause, Settings, a flight press) from
   * `event` (a keydown; none for the pad or touch) reaches the game. */
  passes(action, event) {
    if (action === 'openSettings') {
      return (
        !NO_SETTINGS_IN.includes(this.cinematic) && !this.top()?.noSettings
      );
    }
    if (action === 'pause' && this.cinematic) {
      if (!PAUSE_IN.includes(this.cinematic)) return false;
    }
    const layer = this.layerFor(event);
    return !layer || layer.passes.includes(action);
  }
}

export const inputLayers = new InputLayerStack();
