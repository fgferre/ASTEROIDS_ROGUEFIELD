// src/modules/ui/hud/editor/editorThumbs.js
//
// The inspector's live thumbnails and the editor's samples. A thumbnail is
// a fresh instance of a model, mounted in its card, given the state the
// HUD's own model of that slot was last given (AAAHudLayout.slotState) and
// shrunk to fit. What may show nothing at the moment — the Warden bar with
// no Warden, the feed between kills, the hull ring and the recharges at
// rest — gets a sample instead; the real HUD wears the Warden and feed
// samples too while the editor is open, so they can be placed.

import { BOSS_CONFIG } from '../../../../data/constants/visual.js';

// On-ship models draw at the ship's screen point: the ship sits in the
// middle of this box (800 × 600 points, as the HUD feeds them).
const SHIP_BOX = { width: 240, height: 180 };
const SHIP_POINT = { x: 400, y: 300 };
// Framed models lay out in this box (the XP line sizes against it); a
// stretched slot spans STRETCH_WIDTH of it.
const FRAME_BOX = { width: 1000, height: 300 };
const STRETCH_WIDTH = 640;
// Thinner than this and a thumbnail shows the start of a wide instrument
// at this scale instead.
const MIN_SCALE = 0.3;
const PAD = 8;
const FEED_ROWS = [
  ['kill', 'Mote', '×3'],
  ['xp', '+48 XP', ''],
  ['kill', 'Seeker', ''],
];

/** The Warden bar's sample: a three-phase Warden in its second phase. */
export function wardenSample(now) {
  return {
    now,
    active: true,
    shown: true,
    name: BOSS_CONFIG.displayName,
    percent: 64,
    phase: 1,
    phaseCount: 3,
    phaseColors: [],
    invulnerable: false,
    herald: false,
    marker: null,
  };
}

/** The feed's sample rows, pushed into a feed model's instance. */
export function pushFeedSample(feed) {
  for (const [tone, label, value] of FEED_ROWS) {
    feed.push(`sample:${label}`, tone, (row) => {
      row.label.textContent = label;
      row.value.textContent = value;
    });
  }
}

// The states a thumbnail of `slot` is given, in order.
function thumbStates(slot, live, wardenLive, now) {
  if (slot === 'hull-ring') {
    // A hit to low hull: the ring and the warning both show.
    const ship = { now, ship: SHIP_POINT, shield: 0, maxShield: 1 };
    return [
      { ...ship, hull: 100, maxHull: 100 },
      { ...ship, hull: 25, maxHull: 100 },
    ];
  }
  if (slot === 'recharges') {
    return [{ now, ship: SHIP_POINT, dash: 0.45, shield: 0.6 }];
  }
  if (slot === 'warden' && !(wardenLive && live)) return [wardenSample(now)];
  return live ? [live] : [];
}

/**
 * Mounts a thumbnail of `model` (a slot's model) in `stage`: `onShip` for
 * the models drawn on the ship, `stretch` for a slot spanning the frame,
 * `live` the HUD's last state for the slot, `wardenLive` a Warden bar is
 * up for real. Returns its destroy().
 */
export function mountThumb(
  model,
  stage,
  { onShip, stretch, live, wardenLive }
) {
  const now = performance.now();
  const size = onShip ? SHIP_BOX : FRAME_BOX;
  const box = document.createElement('div');
  box.className = `hed-thumb__box${onShip ? '' : ' is-frame'}`;
  box.style.width = `${stretch ? STRETCH_WIDTH : size.width}px`;
  box.style.height = `${size.height}px`;
  stage.appendChild(box);
  // A framed model sits in a slot sized as the HUD sizes it: to its content,
  // or across the box when stretched.
  let slot = box;
  if (!onShip) {
    slot = document.createElement('div');
    slot.className = `hed-thumb__slot${stretch ? ' is-stretch' : ''}`;
    box.appendChild(slot);
  }
  const instance = Object.create(model);
  instance.mount(slot, document.createElement('div'));
  thumbStates(model.slot, live, wardenLive, now).forEach((state) =>
    instance.update(state)
  );
  let feedTimer = null;
  if (model.slot === 'feed') {
    const cycle = () => {
      pushFeedSample(instance);
      feedTimer = window.setTimeout(cycle, (instance.life ?? 6000) + 400);
    };
    cycle();
  }

  const bounds = { width: slot.offsetWidth, height: slot.offsetHeight };
  const room = {
    width: stage.clientWidth - PAD * 2,
    height: stage.clientHeight - PAD * 2,
  };
  const fit = Math.min(
    1,
    room.width / Math.max(1, bounds.width),
    room.height / Math.max(1, bounds.height)
  );
  const scale = Math.max(fit, MIN_SCALE);
  const cropped = bounds.width * scale > room.width + 0.5;
  const x = cropped ? PAD : (stage.clientWidth - bounds.width * scale) / 2;
  const y = (stage.clientHeight - bounds.height * scale) / 2;
  box.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;

  return () => {
    window.clearTimeout(feedTimer);
    instance.destroy();
    box.remove();
  };
}
