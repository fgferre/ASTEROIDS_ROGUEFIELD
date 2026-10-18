// src/modules/ui/levelUpTransition.js

// The level-up cards' motion. In: each card rises in CARD_STAGGER_MS after
// the previous one (CSS `levelup-card-rise`, delay from --enter-delay); the
// whole entry ends before the input lockout does. Out: the picked card
// shrinks toward the HUD weapon block, the others fall away and the
// backdrop clears, then `done` resumes the run — LEVELUP_EXIT_MS in all
// (the --motion-slow token). Reduced motion skips both.

export const CARD_STAGGER_MS = 60;
export const LEVELUP_EXIT_MS = 350;

export function staggerCardEntry(cards) {
  cards.forEach((card, index) => {
    card.style.setProperty('--enter-delay', `${index * CARD_STAGGER_MS}ms`);
    card.classList.add('is-entering');
  });
}

// Offset from the card's centre to the target's (the HUD weapon chip), or
// straight down off the card when the HUD isn't laid out.
function flyOffset(card, target) {
  const from = card.getBoundingClientRect();
  const to = target?.getBoundingClientRect();
  if (!to || !to.width) {
    return { x: 0, y: from.height };
  }
  return {
    x: to.left + to.width / 2 - (from.left + from.width / 2),
    y: to.top + to.height / 2 - (from.top + from.height / 2),
  };
}

/**
 * Plays the exit and calls `done` when it ends (at once with reduced
 * motion). Returns the timer id, or null when `done` already ran.
 */
export function playLevelUpExit({
  screen,
  cards,
  picked,
  target,
  reducedMotion,
  done,
}) {
  if (reducedMotion || !picked) {
    done();
    return null;
  }
  const offset = flyOffset(picked, target);
  picked.style.setProperty('--fly-x', `${Math.round(offset.x)}px`);
  picked.style.setProperty('--fly-y', `${Math.round(offset.y)}px`);
  cards.forEach((card) => {
    card.classList.remove('is-entering');
    card.classList.add(card === picked ? 'is-picked' : 'is-dismissed');
  });
  screen.classList.add('is-leaving');
  return setTimeout(() => {
    screen.classList.remove('is-leaving');
    done();
  }, LEVELUP_EXIT_MS);
}
