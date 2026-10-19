// A weapon (see lance.js).
import { PALETTE } from '../../data/constants/palette.js';

export default {
  id: 'scatter',
  order: 3,
  name: 'Scatter Coil',
  chip: 'SCATTER',
  description: 'A fan of short flak bolts that burst into shrapnel.',
  // proposta 18/10: the flak volley, for the owner to judge by playing.
  flak: {
    bolts: 5, // per volley; each Multishot shot past the first adds one
    maxBolts: 9,
    fan: 26, // degrees, edge bolt to edge bolt
    speedMultiplier: 0.9, // × lance speed
    range: 180, // logical px from the muzzle, where a bolt that hit nothing bursts
    damageMultiplier: 0.45, // × lance damage, a bolt's direct hit
    burstRadius: 40, // logical px, to the enemy's rim
    burstDamageMultiplier: 0.6, // × lance damage, once per enemy per volley
    cooldownMultiplier: 1.6, // × the lance's cooldown between volleys
    burstDuration: 0.22, // seconds on screen
    trailPoints: 4, // a short tracer, not a lance trail
  },
  // Core and burst are warmer than PALETTE.text, so they read as the amber
  // family: the white-hot core of a flak tracer and the flash of its burst.
  colors: {
    tracer: PALETTE.shot,
    core: '#fff3dc', // WEAPON_COLOR_FLAK_CORE
    burst: '#ffd28f', // WEAPON_COLOR_FLAK_BURST
  },
};
