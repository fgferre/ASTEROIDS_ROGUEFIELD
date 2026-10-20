// src/modules/ui/hud/instruments/registry.js
//
// HUD instruments. The HUD is slots (the radar, ...) and each slot shows one
// of its models: every file under instruments/<slot>/<model>.js is one model,
// `export default { slot, id, name, mount(container), update(state),
// destroy() }`, with the slot and id equal to its folder and file name;
// creating the file registers it. A layout item (data/ui/hudLayout.js)
// places a slot on the screen and picks its model; mountInstruments mounts a
// fresh instance of it in the slot's container.
//
// The radar slot's state, built each frame by TacticalHud through
// buildRadarState (hud/radar.js) and read by every radar model:
// {
//   range   field units from the ship to the rim (the model's `range`, which
//           Dense Fog shortens)
//   jammed  Sensor Jam: `blips` is noise; the model shows NO SIGNAL
//   mode    'calm' | 'threat' (held 3 s after the last threat) | 'warden'
//   ship    { x, y, angle }: the radar's centre on the field; north is up
//   field   { width, height }: the field's border, from (0, 0)
//   view    { x, y, width, height }: the camera's view on the field, or null
//   blips   [{ kind, x, y, inView, rim, distance, heading?, size?,
//             progress?, phased?, angle?, count? }], at most 80 (8 kept for
//           pickups and Wardens), the most important last:
//           kind      'rock' | 'machine' | 'fast' | 'elite' | 'herald' |
//                     'warden' | 'pickup' | 'shell' (a Caster's landing
//                     point) | 'noise'
//           x, y      offset from the ship ÷ range (length ≤ 1 in range)
//           inView    inside the camera's view: the player already sees it
//           heading   radians, where a machine flies
//           size      ÷ range: a rock's radius, a shell's blast radius
//           progress  a shell's flight, 0..1 (its ring closes)
//           phased    a phased Shade
//           rim       beyond the range: a chevron on the rim toward (x, y),
//                     at `angle`; `count` > 1 is a wedge (more than 6 of a
//                     kind in one direction); `distance` labels Heralds
//   haze    [{ x, y, weight, inView }]: where XP orbs gather (weight: orbs)
// }

const modules = import.meta.glob('./*/*.js', { eager: true });

const models = new Map();
for (const module of Object.values(modules)) {
  const model = module.default;
  models.set(`${model.slot}/${model.id}`, model);
}

/** Every model of a slot. */
export function listInstruments(slot) {
  return [...models.values()].filter((model) => model.slot === slot);
}

/** One model by slot and id, or undefined. */
export function getInstrument(slot, id) {
  return models.get(`${slot}/${id}`);
}

/**
 * Places each layout item's slot (`[data-slot="<slot>"]` under `root`) and
 * mounts its model there when visible; returns slot → mounted instance.
 */
export function mountInstruments(root, items) {
  const mounted = new Map();
  for (const item of items) {
    const container = root.querySelector(`[data-slot="${item.slot}"]`);
    placeSlot(container, item);
    if (!item.visible) continue;
    const instance = Object.create(getInstrument(item.slot, item.model));
    instance.mount(container);
    mounted.set(item.slot, instance);
  }
  return mounted;
}

// `anchor` is the screen corner ('top-right', ...); x and y are px from it.
function placeSlot(container, { anchor, x, y, scale, opacity, visible }) {
  const [vertical, horizontal] = anchor.split('-');
  const { style } = container;
  style.position = 'absolute';
  style[vertical] = `${y}px`;
  style[horizontal] = `${x}px`;
  style.transformOrigin = `${vertical} ${horizontal}`;
  style.transform = scale === 1 ? '' : `scale(${scale})`;
  style.opacity = String(opacity);
  style.display = visible ? '' : 'none';
}
