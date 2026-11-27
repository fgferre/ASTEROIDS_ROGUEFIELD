import { IS_DEV } from './env.js';

// An owner decision made playable: `?<name>=<value>` in the address (an option
// letter, or `hoje` for the way before the decision), development builds only.
// Returns the value in upper case, else null.
export function devChoice(name) {
  if (!IS_DEV || typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(name);
  return value ? value.toUpperCase() : null;
}
