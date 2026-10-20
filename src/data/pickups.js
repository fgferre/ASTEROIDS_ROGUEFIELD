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
  repair: {
    id: 'repair',
    label: 'REPAIR',
    detail: '+25 hull',
    color: PALETTE.repair,
    weight: 1, // proposta 20/10
    hull: 25, // hull points restored, proposta 20/10
  },
  stasis: {
    id: 'stasis',
    label: 'STASIS',
    detail: 'machines frozen',
    color: PALETTE.stasis,
    weight: 1, // proposta 20/10
    // s every machine but a Warden, and its shots in flight, stand still
    duration: 2.5, // proposta 20/10
    shockwaveRadius: 560, // px
  },
  salvage: {
    id: 'salvage',
    label: 'SALVAGE CACHE',
    detail: '+10 Salvage',
    color: PALETTE.salvage,
    weight: 1, // proposta 20/10
    orbs: 8, // XP orbs it bursts into, proposta 20/10
    burstRadius: 30, // px the orbs land from it
    salvage: 10, // Salvage added at the run's end, proposta 20/10
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
  // An Elite's chance at layer 1; it rises toward `eliteChanceDeep`, half
  // way there `eliteChanceHalfway` layers later (eliteDropChance).
  eliteChance: 0.35,
  eliteChanceDeep: 0.6, // proposta 20/10
  eliteChanceHalfway: 8, // layers, proposta 20/10
  wardenGuaranteed: 'magnet', // plus one random kind
});

/** An Elite's chance to drop a pickup at `layer`: 0.35, 0.43 at 5, 0.51 at 15. */
export function eliteDropChance(layer) {
  const { eliteChance, eliteChanceDeep, eliteChanceHalfway } = PICKUP_DROPS;
  const depth = Math.max(0, (Number(layer) || 1) - 1);
  return (
    eliteChance +
    ((eliteChanceDeep - eliteChance) * depth) / (depth + eliteChanceHalfway)
  );
}

// The chest (PickupSystem): every Warden drops one where it dies, an Elite
// sometimes. It stays until the ship touches it (no magnet pulls it, it
// never expires), then opens in slow motion and grants cards
// (collectibles/chestRewards.js). Numbers: proposta 20/10.
export const CHEST = deepFreeze({
  eliteChance: 0.25, // an Elite's chance to drop one
  cards: { elite: 1, warden: 3 }, // cards it grants, by who dropped it
  jackpotChance: 0.1, // a Warden chest that grants `jackpotCards` instead
  jackpotCards: 5,
  radius: 14, // px, the casing's half width
  touch: 30, // px between the ship's centre and its own to open it
  fieldMargin: 40, // px kept from the field edge
  // The opening: the world at `slowScale` for `slowHold` s on screen, then
  // back to full speed over `slowEase` s (the Warden arrival's slow motion,
  // effects/GameTime.js); the ship is safe meanwhile. The lid opens during
  // the hold and bursts at its end.
  slowScale: 0.25,
  slowHold: 0.6,
  slowEase: 0.3,
  cardInterval: 0.25, // s between the cards it grants
  spentTime: 1.2, // s the open, empty chest stays before it is gone
  color: PALETTE.shot, // its seams, beam and burst
});
