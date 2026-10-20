// src/modules/collectibles/chests.js
//
// The field's chests (PickupSystem owns them; numbers: CHEST in
// data/pickups.js). A chest waits where it dropped until the ship touches
// it; touched, it is claimed and opens as soon as no card choice is queued
// or on screen and no other chest is opening. The opening slows the world
// the way a Warden's arrival does (EffectsSystem.applyTimeDilation) and
// keeps the ship safe; the lid opens over the hold and bursts in amber at
// its end. Then one card every `cardInterval` s (chestRewards.js), through
// the applyUpgrade a level-up pick uses, each waiting again while a card
// choice is up. Spent, it stays open a moment and is gone. Part of the
// simulation: its draws come from the pickups' own chest stream.
//
// States: closed → claimed → opening → granting → spent.

import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';
import { withAlpha } from '../../data/constants/palette.js';
import { CHEST } from '../../data/pickups.js';
import { describeChestCard, pickChestCard } from './chestRewards.js';

const TAU = Math.PI * 2;
// World seconds of the lid opening (the hold, slowed), and of the ship kept
// safe (the hold and the ease back, at full speed to be sure).
const OPEN_TIME = CHEST.slowHold * CHEST.slowScale;
const SAFE_TIME = OPEN_TIME + CHEST.slowEase;
const BURST = { sparks: 14, speed: 150, radius: 140, duration: 0.5 };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export class Chests {
  /**
   * `random()`: the chest stream (drops and draws). `emit(name, payload)`:
   * the event bus.
   */
  constructor({ player, progression, effects, emit, random }) {
    this.player = player;
    this.progression = progression;
    this.effects = effects;
    this.emit = emit;
    this.random = random;
    this.reset();
  }

  reset() {
    this.list = [];
    this.opening = null;
  }

  /** A chest of `tier` ('elite' or 'warden') at (x, y), kept on the field. */
  spawn(tier, x, y) {
    const jackpot =
      tier === 'warden' && this.random().chance(CHEST.jackpotChance);
    const margin = CHEST.fieldMargin;
    const chest = {
      tier,
      cards: jackpot ? CHEST.jackpotCards : CHEST.cards[tier],
      granted: 0,
      x: clamp(x, margin, GAME_WIDTH - margin),
      y: clamp(y, margin, GAME_HEIGHT - margin),
      age: 0,
      state: 'closed',
      timer: 0,
    };
    this.list.push(chest);
    this.emit('pickup-spawned', { kind: 'chest', x: chest.x, y: chest.y });
    return chest;
  }

  /** `ship`: its position while it can collect, else null. */
  update(deltaTime, ship) {
    if (!this.list.length) return;
    for (const chest of this.list) {
      chest.age += deltaTime;
      chest.timer += deltaTime;
      if (chest.state === 'closed' && ship && touches(chest, ship)) {
        chest.state = 'claimed';
      }
      if (chest.state === 'claimed') {
        if (ship && !this.opening && !this.cardChoiceUp()) this.open(chest);
      } else if (chest.state === 'opening' && chest.timer >= OPEN_TIME) {
        this.burst(chest);
        chest.state = 'granting';
        chest.timer = CHEST.cardInterval;
      }
      if (
        chest.state === 'granting' &&
        chest.timer >= CHEST.cardInterval &&
        ship &&
        !this.cardChoiceUp()
      ) {
        this.grantCard(chest);
      }
    }
    this.list = this.list.filter(
      (chest) => chest.state !== 'spent' || chest.timer < CHEST.spentTime
    );
  }

  // A card choice queued (its screen opens after the level-up slow motion)
  // or on screen: a chest's card must not land under it.
  cardChoiceUp() {
    const { pendingLevelUpScreens, pendingUpgradeOptions } = this.progression;
    return pendingLevelUpScreens.length > 0 || pendingUpgradeOptions.length > 0;
  }

  open(chest) {
    chest.state = 'opening';
    chest.timer = 0;
    this.opening = chest;
    this.effects.applyTimeDilation(CHEST.slowScale, {
      holdDuration: CHEST.slowHold,
      duration: CHEST.slowEase,
    });
    this.player.setInvulnerableTimer(
      Math.max(this.player.invulnerableTimer || 0, SAFE_TIME)
    );
    this.emit('chest-opening', {
      kind: 'chest',
      tier: chest.tier,
      x: chest.x,
      y: chest.y,
    });
  }

  // The lid's burst of amber light: a ring, a flash and a crown of sparks.
  burst({ x, y }) {
    const { color } = CHEST;
    this.effects.createShockwaveEffect({
      position: { x, y },
      radius: BURST.radius,
      duration: BURST.duration,
      baseWidth: 10,
      color: withAlpha(color, 0.75),
    });
    this.effects.addScreenFlash(withAlpha(color, 0.3), 0.3, 0.25);
    for (let i = 0; i < BURST.sparks; i += 1) {
      const angle = (i / BURST.sparks) * TAU;
      const speed = BURST.speed * (i % 2 ? 1.4 : 1);
      this.effects.createParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        color,
        2.2,
        0.6,
        'spark'
      );
    }
  }

  grantCard(chest) {
    chest.timer = 0;
    const card = pickChestCard(this.progression, this.random());
    if (card && this.progression.applyUpgrade(card.id)) {
      chest.granted += 1;
      this.emit('chest-card', {
        ...describeChestCard(this.progression, card),
        index: chest.granted - 1,
        total: chest.cards,
        tier: chest.tier,
      });
      if (chest.granted < chest.cards) return;
    }
    chest.state = 'spent';
    if (this.opening === chest) this.opening = null;
  }

  /** Plain snapshots: `open` 0..1 as the lid opens, `fade` 0..1 once spent. */
  snapshots() {
    return this.list.map((chest) => ({
      kind: 'chest',
      tier: chest.tier,
      x: chest.x,
      y: chest.y,
      radius: CHEST.radius,
      age: chest.age,
      lifetime: Infinity,
      color: CHEST.color,
      claimed: chest.state !== 'closed',
      open:
        chest.state === 'opening'
          ? Math.min(1, chest.timer / OPEN_TIME)
          : chest.state === 'granting' || chest.state === 'spent'
            ? 1
            : 0,
      fade: chest.state === 'spent' ? chest.timer / CHEST.spentTime : 0,
    }));
  }
}

function touches(chest, ship) {
  const dx = chest.x - ship.x;
  const dy = chest.y - ship.y;
  return dx * dx + dy * dy <= CHEST.touch * CHEST.touch;
}
