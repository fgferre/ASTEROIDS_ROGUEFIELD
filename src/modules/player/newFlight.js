// The new flight is the default since 16/11 (the owner: "Será que para as
// outras sessões estarem avançando, isso já não deveria ser a base?"): every
// run starts in classic glide flight with the cannon on the nose; a card
// frees the turret (auto_aim) and the last piloting card brings today's
// modern flight (flight_computer, after the briefing that waits for Enter).
// `?direcao=antiga` is the comparison link: it brings back the old flight.

/** True unless the page was opened with `?direcao=antiga`. */
export function newFlightFromUrl() {
  try {
    return (
      new URLSearchParams(window.location.search).get('direcao') !== 'antiga'
    );
  } catch {
    return true; // no window (Node tests)
  }
}

/**
 * Temporary: the order of the piloting trail for the Auto Turret, `?trilha=b`
 * (after the engine and the brakes), `?trilha=c` (from level 8) or
 * `?trilha=d` (after the engine only), `?trilha=e` (level 6, after the
 * engine, alone in the trail's slot; trail cards without rarity); 'a' (today)
 * when absent or without window. The owner picks one (cartas-trilha, 17/11);
 * then this goes.
 */
export function trailOrderFromUrl() {
  try {
    const order = new URLSearchParams(window.location.search).get('trilha');
    return ['b', 'c', 'd', 'e'].includes(order) ? order : 'a';
  } catch {
    return 'a';
  }
}
