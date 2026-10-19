// A weapon (see lance.js).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'harmonic',
  order: 2,
  name: 'Harmonic Plasma Lance',
  chip: 'HARMONIC',
  description: 'Every 4th shot is a short plasma beam that splits rocks.',
  beam: {
    every: 4, // shots; the 4th is the beam
    length: 220, // logical px from the nose
    width: 10, // logical px
    duration: 0.18, // seconds on screen (damage lands on the first frame)
    damageMultiplier: 2.2, // × lance damage, to everything in the segment
    extraFragments: 1, // large/medium rocks killed by the beam
    cooldownPenalty: 0.25, // seconds added to the next shot's cooldown
    kick: 0.2, // 3D impact pass
    flashRadius: 90, // 3D light flash, as a shockwave of this radius
  },
  colors: {
    glow: PALETTE.shot,
    mid: '#ffe2b0', // WEAPON_COLOR_BEAM_MID: the palette has no such tone
    core: PALETTE.text,
  },
};
