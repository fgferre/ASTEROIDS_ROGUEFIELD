// src/modules/ui/onboardingTips.js
//
// The onboarding on screen (its lessons and their order: onboarding.js):
// the in-play tip, or the timed notice of a mode toggle, with the keys or
// pad buttons bound on the device in use; the cards tip under the first
// level-up; the menu's first-visit lines; what the flight feeds the lessons
// each step; and the bus events that answer them.

import { resolveService } from '../../core/serviceUtils.js';
import { TIP_ACTIONS, isStrafing, onboardingPrompts } from './onboarding.js';

export function isOnboardingEnabled(ui) {
  return (
    !ui.onboardingDisabled &&
    ui.resolveSettingsService()?.getSetting('gameplay', 'onboardingTips') !==
      false
  );
}

/** The in-play tip `id` (or the timed toggle notice) with the bound keys. */
export function showOnboardingTip(ui, id, toggled = null) {
  const controls =
    ui.resolveSettingsService()?.getCategoryValues('controls') || {};
  const device = resolveService('input', ui.dependencies).getActiveDevice();
  const keys = {};
  TIP_ACTIONS.forEach((action) => {
    keys[action] = ui.settingsPanel.formatBindingLabel(
      controls[action]?.[device]?.[0],
      device
    );
  });
  const prompt = onboardingPrompts(
    keys,
    resolveService('player', ui.dependencies)?.controlScheme,
    device,
    toggled
  )[id];
  const show = toggled ? 'showTimedNotice' : 'showOnboardingTip';
  ui.tacticalHud.layout?.[show](prompt.keys, prompt.text);
}

/** The cards tip in the level-up footer, on the first level-up only. */
export function showOnboardingCardsTip(ui, headStart) {
  const device = resolveService('input', ui.dependencies).getActiveDevice();
  const text = ui.onboarding.cardsTip(device, headStart);
  const content = document.querySelector('#levelup-screen .levelup-content');
  if (!text || !content || content.querySelector('.onboarding-cards-tip')) {
    return;
  }
  const tip = document.createElement('p');
  tip.className = 'levelup-hint onboarding-cards-tip';
  tip.setAttribute('role', 'status');
  tip.textContent = text;
  content.appendChild(tip);
}

export function removeOnboardingCardsTip() {
  document.querySelector('.onboarding-cards-tip')?.remove();
}

/**
 * The menu's first-visit lines (onboarding.js MENU_TIPS). Mission Control
 * shows one at a time: the Launch line before the first flight, then, with
 * nothing bought yet, the Hangar button's once Salvage buys something; the
 * open Hangar shows its own, true for any pilot.
 */
export function refreshMenuTips(
  ui,
  hangarOpen = ui.hangarScreen.hangarState.isOpen
) {
  const on = ui.isOnboardingEnabled();
  const { bought = true, affordable = false } =
    resolveService('hangar', ui.dependencies)?.purchaseState() ?? {};
  const tip = (id, ready) => ui.onboarding.menuTip(id, on && ready);
  const launch = tip('menu', !ui.onboarding.flown);
  const salvage = tip(
    'salvage',
    !launch && !hangarOpen && !bought && affordable
  );
  const hangar = tip('hangar', hangarOpen);
  const { menu, hangar: hangarRefs } = ui.domRefs;
  showMenuTip(menu.tip, launch);
  showMenuTip(menu.hangarTip, salvage);
  menu.hangarBtn?.classList.toggle('is-pointed', Boolean(salvage));
  showMenuTip(hangarRefs.tip, hangar);
}

function showMenuTip(node, tip) {
  if (!node || node.dataset.tip === (tip?.text ?? '')) return;
  node.dataset.tip = tip?.text ?? '';
  node.hidden = !tip;
  node.innerHTML = tip
    ? `<span class="menu-tip__label">${tip.label}</span> <span class="menu-tip__text">${tip.text}</span>`
    : '';
}

/** Each step of a run: while active, a strafe tip set aside this run still
 * counts when used. */
export function updateOnboarding(ui, deltaTime) {
  if (!ui.onboarding.active) return;
  const input = resolveService('input', ui.dependencies);
  const player = resolveService('player', ui.dependencies);
  const moving = input.getMovementInput();
  ui.onboarding.update(deltaTime, {
    moving: moving.up || moving.down || moving.left || moving.right,
    strafing: isStrafing(input.stepFrame, player.controlScheme),
    shieldReady: player.getShieldState().maxHits > 0,
    bannerBusy: Boolean(ui.tacticalHud.layout?.isBannerBusy()),
    tipCovered: Boolean(ui.tacticalHud.layout?.isNoticeShowing()),
  });
}

/** What the player does that answers a lesson or a menu line. */
export function listenForLessons(ui) {
  ui.registerEventListener('combat-mode-toggled', (toggled) => {
    showOnboardingTip(ui, 'mode', toggled);
    ui.eventBus?.emit('onboarding-step', { id: 'mode' });
  });
  ui.registerEventListener('player-dashed', () => {
    ui.onboarding.dashed();
  });
  ui.registerEventListener('shield-activated', () => {
    ui.onboarding.shieldRaised();
  });
  ui.registerEventListener('upgrade-applied', () => {
    ui.onboarding.cardPicked();
    removeOnboardingCardsTip();
  });
  // Opening the Hangar answers the line by its button; closing it, its own.
  ui.registerEventListener(
    'ui-overlay-visibility-changed',
    ({ overlay, isOpen } = {}) => {
      if (overlay !== 'hangar') return;
      ui.onboarding.menuActed(isOpen ? 'salvage' : 'hangar');
      refreshMenuTips(ui, isOpen);
    }
  );
}
