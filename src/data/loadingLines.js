// src/data/loadingLines.js
//
// The opening's loading line (the owner's list, 19/11). The true steps follow
// the real loading (MenuBackgroundSystem's preload, then Renderer3D.warmUp
// from 0.6 on, app.js); the page itself says "Loading the game" before any
// script runs. The jokes take turns with the true step.

/** What the game is doing now, from the loading progress (0..1). */
export function loadingStep(progress) {
  if (progress < 0.3) return 'Building the asteroid field';
  if (progress < 0.6) return 'Lighting the field and painting the nebula';
  const done = Math.round(((progress - 0.6) / 0.4) * 100);
  return `Preparing the battle effects for your graphics card · ${done}%`;
}

export const LOADING_JOKES = [
  'Counting the asteroids. Lost count. Starting again.',
  'Telling the rocks where to drift.',
  'Polishing the hull. Missed a spot.',
  'Topping up the thrusters.',
  'Checking the cannon points the right way.',
  'Sweeping debris off the launch lane.',
  'Reminding the Wardens to look scary.',
  'Shuffling the upgrade cards.',
  'Asking the Ring to hold still.',
  'Teaching the asteroids to tumble properly.',
  "Untangling the Ring's cables.",
  "Warming up the pilot's seat.",
  'Loading courage. Please stand by.',
  'Folding the star charts the right way.',
];
