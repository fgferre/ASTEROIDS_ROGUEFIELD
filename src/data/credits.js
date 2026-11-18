// src/data/credits.js
//
// The Pipo Labs address a player writes to about supporting the game: the
// one place it lives (the credits window and the end credits show it, see
// ui/CreditsOverlay.js).

export const SUPPORT_EMAIL = 'pipostudiolabs@gmail.com';

// Whether the game asks for support: the menu's ♥ Support button, the credits'
// support section and the end credits' line (every `[data-support]` node). Off
// until the old generator's sounds are all swapped (Felipe, 18/11/2026);
// showing them again is setting this to true.
export const SUPPORT_SHOWN = false;
