// src/data/pickups.js

import { deepFreeze } from '../utils/deepFreeze.js';
import { PALETTE } from './constants/palette.js';

// Field pickups: tokens dropped by Elites and Wardens, collected by flying
// over them. Numbers: proposta 17/10 — the owner's play decides.
export const PICKUP_KINDS = deepFreeze({
  magnet: {
    id: 'magnet',
    label: 'MAGNET',
    detail: 'XP inbound',
    color: PALETTE.xp,
    weight: 1, // proposta 17/10
    duration: 2.5, // s of global pull, proposta 17/10
    pullSpeed: 260, // px/s at the start of the pull, proposta 17/10
    pullAcceleration: 900, // px/s added per second of pull, proposta 17/10
  },
  pulse: {
    id: 'pulse',
    label: 'PULSE',
    detail: 'field hit',
    color: PALETTE.player,
    weight: 1, // proposta 17/10
    damage: 120, // to every enemy, proposta 17/10
    bossDamageScale: 0.1, // the Warden takes 10 %, proposta 17/10
    shockwaveRadius: 560, // px, proposta 17/10
  },
  overcharge: {
    id: 'overcharge',
    label: 'OVERCHARGE',
    detail: 'fire ×2 · 8s',
    color: PALETTE.shot,
    weight: 1, // proposta 17/10
    duration: 8, // s, proposta 17/10
    cooldownMultiplier: 0.5, // fire rate ×2, proposta 17/10
  },
});

export const PICKUP_TOKEN = deepFreeze({
  lifetime: 18, // s on the field, proposta 17/10
  blinkTime: 3, // s before expiry the token blinks
  radius: 12, // drawn token radius, px
  pickupRadius: 28, // player overlap distance, px
  driftSpeed: 14, // px/s initial drift, proposta 17/10
  driftDamping: 0.6, // fraction of drift speed lost per second
  fieldMargin: 24, // px kept from the field edge
  wardenSpread: 34, // px between the two Warden drops
});

// Drop rules, proposta 17/10: plain enemies never drop a pickup.
export const PICKUP_DROPS = deepFreeze({
  eliteChance: 0.35,
  wardenGuaranteed: 'magnet', // plus one random kind
});
