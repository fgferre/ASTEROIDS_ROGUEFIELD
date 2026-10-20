// src/modules/ui/ChestCeremony.js
//
// A chest's cards, shown big once it has granted them all (collectibles/
// chests.js; the owner chose a paused ceremony, 20/10): the run stops, the
// cards come up one by one with a short reveal (all at once with Reduce
// Motion), the level-up card face without the choice (ui/upgradeCard.js),
// and Continue (the confirm key or pad button, or a click) goes back to play.
// A chest that finishes while a card choice is open waits for it; chests
// that finish together show one after the other.

import {
  SCREEN_INPUT_LOCKOUT_MS,
  liftHudInstruments,
} from './LevelUpScreen.js';
import {
  cardClasses,
  cardMarkup,
  cardState,
  familyColor,
} from './upgradeCard.js';

// One card's reveal; the next starts when it ends.
export const CHEST_REVEAL_MS = 420;
// A chest of this many cards is the Warden's jackpot.
const JACKPOT_CARDS = 5;

export class ChestCeremony {
  /**
   * `refs`: { screen, title, count, cards, continueBtn }.
   * `progression()`, `combat()`: the services a card's face reads.
   * `showScreen(name, options)`: shows or hides the chest overlay.
   * `showGameUI()`: back to play, or to the next card screen waiting.
   * `cardChoiceOpen()`: a level-up's cards are on screen.
   * `prefersReducedMotion()`: no reveal animation.
   */
  constructor({
    refs,
    progression,
    combat,
    showScreen,
    showGameUI,
    cardChoiceOpen,
    prefersReducedMotion,
  }) {
    this.refs = refs;
    this.progression = progression;
    this.combat = combat;
    this.showScreen = showScreen;
    this.showGameUI = showGameUI;
    this.cardChoiceOpen = cardChoiceOpen;
    this.prefersReducedMotion = prefersReducedMotion;
    this.collecting = [];
    this.queue = [];
    this.current = null;
  }

  bindControls() {
    this.refs.continueBtn?.addEventListener('click', () => this.continue());
  }

  /** A card the chest has just applied ('chest-card'): its face as of now. */
  addCard({ id }) {
    const state = cardState(this.progression(), id, { granted: true });
    this.collecting.push({
      className: cardClasses(state.definition),
      color: familyColor(state.definition.family),
      html: cardMarkup(state.definition, state, {
        weapon: this.combat().getWeaponState(),
      }),
    });
  }

  /** The chest has no card left to give ('chest-spent'): its turn comes. */
  chestSpent() {
    if (this.collecting.length) this.queue.push(this.collecting);
    this.collecting = [];
    this.openNext();
  }

  /** Shows the next chest waiting, unless one is up or cards are; true if it did. */
  openNext() {
    if (this.current || !this.queue.length || this.cardChoiceOpen()) {
      return false;
    }
    this.show(this.queue.shift());
    return true;
  }

  get isVisible() {
    return Boolean(this.current);
  }

  show(cards) {
    const { screen, title, count, cards: row, continueBtn } = this.refs;
    title.textContent = cards.length >= JACKPOT_CARDS ? 'Jackpot' : 'Chest';
    count.textContent = `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`;
    row.innerHTML = '';
    row.classList.toggle('is-many', cards.length > 3);
    const elements = cards.map(({ className, color, html }) => {
      const card = document.createElement('article');
      card.className = `${className} is-waiting`;
      card.style.setProperty('--fam', color);
      card.innerHTML = html;
      row.appendChild(card);
      return card;
    });
    this.current = {
      elements,
      revealed: 0,
      timer: null,
      lockedUntil: Date.now() + SCREEN_INPUT_LOCKOUT_MS,
    };
    continueBtn.classList.remove('is-ready');
    this.showScreen('chest', { overlay: true, show: true });
    liftHudInstruments(screen);
    // The screen holds the focus: Enter is the confirm key, not a click.
    screen.focus({ preventScroll: true });
    if (this.prefersReducedMotion()) this.revealAll();
    else this.revealNext();
  }

  revealNext() {
    const current = this.current;
    const card = current.elements[current.revealed];
    card.classList.replace('is-waiting', 'is-revealing');
    current.revealed += 1;
    if (current.revealed < current.elements.length) {
      current.timer = setTimeout(() => this.revealNext(), CHEST_REVEAL_MS);
    } else {
      this.refs.continueBtn.classList.add('is-ready');
    }
  }

  revealAll() {
    const current = this.current;
    clearTimeout(current.timer);
    current.elements.forEach((card) => {
      card.classList.remove('is-waiting', 'is-revealing');
    });
    current.revealed = current.elements.length;
    this.refs.continueBtn.classList.add('is-ready');
  }

  /** Continue: the rest of the reveal at once, then back to play. */
  continue() {
    const current = this.current;
    if (!current || Date.now() < current.lockedUntil) return;
    if (current.revealed < current.elements.length) {
      this.revealAll();
      return;
    }
    this.hide();
    this.showGameUI();
  }

  hide() {
    clearTimeout(this.current?.timer);
    this.current = null;
    this.showScreen('chest', { overlay: true, show: false, emitEvent: false });
  }

  /** A run starts or ends: nothing waits, nothing shows. */
  clear() {
    if (this.current) this.hide();
    this.collecting = [];
    this.queue = [];
  }
}
