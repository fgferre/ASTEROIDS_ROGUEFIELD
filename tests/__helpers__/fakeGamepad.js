/**
 * A standard-mapping gamepad behind `navigator.getGamepads()`. `set({ axes,
 * pressed })` changes what the next poll reads; `restore()` puts the real
 * navigator back.
 */
export function installFakeGamepad() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const effects = [];
  const pad = {
    index: 0,
    id: 'Fake standard pad',
    mapping: 'standard',
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    vibrationActuator: {
      playEffect(type, params) {
        effects.push({ type, ...params });
        return Promise.resolve('complete');
      },
    },
  };
  let connected = true;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => (connected ? [pad] : []) },
  });

  return {
    pad,
    effects,
    set({ axes = [0, 0, 0, 0], pressed = [] } = {}) {
      pad.axes = [...axes];
      pad.buttons = pad.buttons.map((_, index) => ({
        pressed: pressed.includes(index),
        value: pressed.includes(index) ? 1 : 0,
      }));
    },
    disconnect() {
      connected = false;
    },
    restore() {
      if (previous) Object.defineProperty(globalThis, 'navigator', previous);
      else delete globalThis.navigator;
    },
  };
}
