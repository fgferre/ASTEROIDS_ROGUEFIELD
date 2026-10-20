// src/modules/ui/hud/instruments/registry.js
//
// HUD instruments. The HUD is slots (the radar, the XP line, ...) and each
// slot shows one of its models: every file under instruments/<slot>/<model>.js
// is one model, `export default { slot, id, name, mount(container, screen),
// update(state), destroy() }`, with the slot and id equal to its folder and
// file name; creating the file registers it. `screen` is the full-window
// layer over the field (edge markers). A layout item (data/ui/hudPresets.js)
// places a slot on the screen and picks its model; mountInstruments mounts a
// fresh instance of it in the slot's container. AAAHudLayout builds each
// slot's state and calls update; every model of a slot reads the same state.
// `now` is performance.now() in ms; a `ship` is the ship's screen point as
// last drawn (800 × 600 whatever the window: Renderer3D.shipOnScreen) or
// null, fed again after every drawn frame (AAAHudLayout.placeOnShip);
// fractions are 0..1.
//
// radar      built each frame by TacticalHud through buildRadarState
//            (hud/radar.js); the model's `range` is how far it reaches:
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
// run-info   { now, clock ('HH:MM:SS'), seconds, layer, kills, combo,
//            multiplier }
// xp         { level, current, required, layer }
// vitals     { now, shield, maxShield, hull, maxHull, shieldMode ('locked':
//            no shield card yet | 'ready' | 'active' | 'cooldown'),
//            shieldSeconds and shieldCooldown (fraction) of the cooldown
//            left, shieldKey (the bound key's label while ready) }
// hull-ring  { now, ship, shield, maxShield, hull, maxHull }
// recharges  { now, ship, dash (1 right after a dash, 0 ready), shield (the
//            broken shield's cooldown left, 0 when up or none) }
// build      { now, weapon (CombatSystem.getWeaponState()), families
//            ({ family: distinct cards }), spreadMode, aimMode, dash, buffs
//            ([{ kind, label, color, remaining, duration }]), beams (counts
//            up once per beam fired) }
// warden     { now, active, shown (false while the intro holds it), name,
//            percent, phase, phaseCount, phaseColors, invulnerable, herald,
//            marker ({ left, top (% of the screen), angle, edge, distance }:
//            the Warden off screen, or null) }; a model with `edgeMarker`
//            draws the marker itself, so the HUD's edge arrows skip Wardens
// feed       no per-frame state: `push(key, tone, render)` adds a row (or
//            refreshes the row with that key) and calls render(row) with
//            { el, label, value, count } to fill it

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
 * mounts its model there when visible; `screen` is handed to every model.
 * Returns slot → mounted instance.
 */
export function mountInstruments(root, items, screen) {
  const mounted = new Map();
  for (const item of items) {
    const container = root.querySelector(`[data-slot="${item.slot}"]`);
    placeSlot(container, item);
    if (!item.visible) continue;
    const instance = Object.create(getInstrument(item.slot, item.model));
    instance.mount(container, screen);
    mounted.set(item.slot, instance);
  }
  return mounted;
}

/** What a layout mounts: equal for two layouts that only move instruments. */
export function mountKey(items) {
  return items
    .map(({ slot, model, visible }) => `${slot}/${model}/${visible}`)
    .join();
}

/**
 * Moves each item's slot to its place, keeping what is mounted (the HUD
 * editor's drags): only for items with the mounted ones' mountKey.
 */
export function placeInstruments(root, items) {
  for (const item of items) {
    placeSlot(root.querySelector(`[data-slot="${item.slot}"]`), item);
  }
}

// Offsets scale with the HUD (--hud-u, hudStyles.js).
const px = (n) => `calc(${n}px * var(--hud-u, 1))`;

// `anchor` is '<top|bottom>-<left|right|center|stretch>' inside the HUD's
// frame or 'screen' (the whole layer); x and y are px from that corner or
// edge. Every call writes every placement property: a preset switch reuses
// the container.
function placeSlot(
  container,
  { anchor, x, y, scale, opacity, visible, plate }
) {
  const { style } = container;
  const zoom = scale === 1 ? '' : `scale(${scale})`;
  style.position = 'absolute';
  style.top = style.bottom = style.left = style.right = '';
  style.transform = zoom;
  container.classList.toggle('hud-plate', Boolean(plate));
  style.opacity = String(opacity);
  style.display = visible ? '' : 'none';
  if (anchor === 'screen') {
    // Drawn at the ship in screen pixels: a scale would pull it off the ship.
    style.transform = '';
    style.top = style.bottom = style.left = style.right = '0';
    return;
  }
  const [vertical, horizontal] = anchor.split('-');
  style[vertical] = px(y);
  if (horizontal === 'stretch') {
    style.left = style.right = px(x);
  } else if (horizontal === 'center') {
    style.left = `calc(50% + ${px(x)})`;
    style.transform = `translateX(-50%) ${zoom}`.trim();
  } else {
    style[horizontal] = px(x);
  }
  style.transformOrigin = `${vertical} ${horizontal === 'stretch' ? 'center' : horizontal}`;
}
