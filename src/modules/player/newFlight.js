// The new flight (`?direcao=nova`, the owner's pick 16/11, PLAN.md): every
// run starts in classic glide flight with the cannon on the nose; a card
// frees the turret (auto_aim) and the last piloting card brings today's
// modern flight (flight_computer, after the briefing that waits for Enter).
// Without the flag the game is today's, cards included.

/** True when the page was opened with `?direcao=nova`. */
export function newFlightFromUrl() {
  try {
    return (
      new URLSearchParams(window.location.search).get('direcao') === 'nova'
    );
  } catch {
    return false; // no window (Node tests)
  }
}
