// src/data/ui/hudPresets.js
//
// The HUD's built-in presets (Settings → Interface → HUD Layout; the
// player's own, made in Edit HUD Layout, live in the settings: see
// modules/ui/hud/editor/layoutStore.js). A preset is the
// list of layout items: each places one slot and picks its model, a file
// under src/modules/ui/hud/instruments/<slot>/ (see that folder's
// registry.js for the slots, the anchors and what each model is fed).
//   anchor   'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' |
//            'top-center' | 'bottom-center' | 'top-stretch' | 'bottom-stretch'
//            (from both side edges, x in) inside the HUD's 16:9 frame, or
//            'screen': the whole window (instruments drawn on the ship)
//   x, y     px from the anchor at a 1080p window, scaled with the HUD
//   scale    0.6..1.6, grown from the anchored edge; opacity 0.2..1
//   plate   a soft dark plate behind the slot: the field's glowing border
//            fades out under it (HUD.md, Layout)
//   visible  false leaves the slot empty

import { deepFreeze } from '../../utils/deepFreeze.js';

const item = (slot, model, anchor, x = 0, y = 0, more = {}) => ({
  slot,
  model,
  anchor,
  x,
  y,
  scale: 1,
  opacity: 1,
  visible: true,
  plate: false,
  ...more,
});

const plated = { plate: true };

export const HUD_PRESETS = deepFreeze({
  // The owner's approved mock-ups of 20/10 (HUD.md) and his pick for the
  // vitals (the hull capsule wrapped in the shield).
  instrument: {
    id: 'instrument',
    label: 'Instrument',
    items: [
      item('hull-ring', 'instrument', 'screen'),
      item('recharges', 'instrument', 'screen'),
      item('run-info', 'instrument', 'top-left', 32, 24, plated),
      item('warden', 'instrument', 'top-center', 0, 24, plated),
      item('radar', 'tactical', 'top-right', 24, 24, plated),
      item('feed', 'instrument', 'top-right', 24, 228, plated),
      item('vitals', 'instrument', 'bottom-left', 32, 24, plated),
      item('xp', 'instrument', 'bottom-center', 0, 24, plated),
      item('build', 'instrument', 'bottom-right', 32, 24, plated),
    ],
  },
  // The HUD until 20/10, panel for panel where it sat in its old grid
  // (16 px margins, 220 px side columns).
  classic: {
    id: 'classic',
    label: 'Classic',
    items: [
      item('hull-ring', 'classic', 'screen'),
      item('recharges', 'instrument', 'screen', 0, 0, { visible: false }),
      item('run-info', 'classic', 'top-left', 16, 16),
      item('warden', 'classic', 'top-stretch', 236, 16),
      item('radar', 'classic', 'top-right', 16, 16),
      item('feed', 'classic', 'top-right', 16, 252),
      item('vitals', 'classic', 'bottom-left', 16, 16),
      item('xp', 'classic', 'bottom-stretch', 236, 16),
      item('build', 'classic', 'bottom-right', 16, 16),
    ],
  },
  // Less on screen: the vitals small just above the XP line at the bottom
  // centre, a smaller radar, no run info and no feed.
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    items: [
      item('hull-ring', 'instrument', 'screen'),
      item('recharges', 'instrument', 'screen'),
      item('run-info', 'instrument', 'top-left', 32, 24, { visible: false }),
      item('warden', 'instrument', 'top-center', 0, 24, plated),
      item('radar', 'tactical', 'top-right', 24, 24, {
        ...plated,
        scale: 0.75,
      }),
      item('feed', 'instrument', 'top-right', 24, 228, { visible: false }),
      item('vitals', 'instrument', 'bottom-center', 0, 56, {
        ...plated,
        scale: 0.8,
      }),
      item('xp', 'instrument', 'bottom-center', 0, 24, plated),
      item('build', 'instrument', 'bottom-right', 32, 24, plated),
    ],
  },
});

export const DEFAULT_HUD_PRESET = 'instrument';

/** A preset by id; an unknown id is the default one. */
export function getHudPreset(id) {
  return HUD_PRESETS[id] ?? HUD_PRESETS[DEFAULT_HUD_PRESET];
}
