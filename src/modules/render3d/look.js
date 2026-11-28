// src/modules/render3d/look.js
//
// The clean engine's look, on the owner's card (27/11): the tone curve both
// post chains end in (impactPass.js SCENE_READ, the menu's opening), their
// exposure and the bloom. `b` keeps today's picture: no curve, only the
// exposure and a clamp, as the old engine left the sky and the glows. `c` is
// bolder: three's Neutral curve at more exposure, richer colour and light. A
// development build picks one with ?visual=b|c, read once at load; the
// published game takes LOOKS.b until the owner chooses.

import { IS_DEV } from '../../core/env.js';

export const LOOKS = {
  b: {
    curve: 'Linear',
    exposure: 1,
    bloom: { strength: 0.9, radius: 0.6, threshold: 0.75 },
  },
  c: {
    curve: 'Neutral',
    exposure: 1.6,
    bloom: { strength: 0.9, radius: 0.7, threshold: 0.75 },
  },
};

function lookFromUrl() {
  if (!IS_DEV) return LOOKS.b;
  try {
    const id = new URLSearchParams(window.location.search).get('visual');
    return LOOKS[id] ?? LOOKS.b;
  } catch {
    return LOOKS.b;
  }
}

export const LOOK = lookFromUrl();
