// src/modules/input/inputLayers.js
//
// The input layer stack (Felipe, 26/11: one router of the active layer, not
// a patch per screen): the screens open over the menu or the flight, last
// opened on top; empty, the menu or the flight has the input. Only the top
// layer hears a key, from the one keydown listener here (window capture,
// bound by InputSystem before any screen's); the pad moves in the top
// layer's screen (ui/gamepadNav.js) and a bus confirm stops at it (UISystem).
// A key a layer takes is not stopped: the listeners that are not screens
// (InputSystem, the audio unlock, F3, F8/F9, the pad pointer) still hear
// it. The game's actions under a layer pass only when it lists them, and
// this is the one place that says when Settings may open: InputSystem asks
// `passes(action, event)`.
//
// A layer: { name, element, onKey, passes }. `name` is its screen's id,
// `element` its `#<name>-screen`; `onKey(event)` returns true when the key
// is the layer's alone (none of the game's actions on it pass) and calls
// preventDefault itself where the browser's own action must not run;
// `passes` lists the game's actions that still reach the game under it.

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
    // The last keydown: the layer on top when it came, and whether it took it.
    this.key = null;
    this.cinematic = null;
    this.window = null;
    this.bus = null;
    this.onKeyDown = (event) => {
      const layer = this.top();
      this.key = { event, layer, taken: Boolean(layer?.onKey(event)) };
    };
    this.onCinematicStarted = (event) => (this.cinematic = event?.kind);
    this.onCinematicEnded = () => (this.cinematic = null);
  }

  /** At boot (InputSystem): the keydown listener, and the cinematics heard
   * on `bus`; the stack starts empty (a second install replaces the first). */
  install(bus) {
    this.window?.removeEventListener('keydown', this.onKeyDown, true);
    this.bus?.off('cinematic-started', this.onCinematicStarted);
    this.bus?.off('cinematic-ended', this.onCinematicEnded);
    this.layers = [];
    this.key = null;
    this.cinematic = null;
    this.window = window;
    this.bus = bus;
    window.addEventListener('keydown', this.onKeyDown, true);
    bus?.on('cinematic-started', this.onCinematicStarted);
    bus?.on('cinematic-ended', this.onCinematicEnded);
  }

  /** A screen opened: its layer goes on top. */
  push(layer) {
    this.remove(layer);
    this.layers.push(layer);
  }

  /** A screen closed: its layer leaves, wherever it is. */
  remove(layer) {
    this.layers = this.layers.filter((entry) => entry !== layer);
  }

  top() {
    return this.layers.at(-1) ?? null;
  }

  /** The layer that was on top when the keydown `event` came (it may have
   * closed since); for no event, or any other, the one on top now. */
  layerFor(event) {
    return event && this.key?.event === event ? this.key.layer : this.top();
  }

  /** Whether the game's `action` ('pause', 'openSettings') from `event` (a
   * keydown; none for the pad) reaches the game. */
  passes(action, event) {
    if (event && this.key?.event === event && this.key.taken) return false;
    if (action === 'openSettings') {
      return !NO_SETTINGS_IN.includes(this.cinematic);
    }
    if (action === 'pause' && this.cinematic) {
      if (!PAUSE_IN.includes(this.cinematic)) return false;
    }
    const layer = this.layerFor(event);
    return !layer || layer.passes.includes(action);
  }
}

export const inputLayers = new InputLayerStack();
