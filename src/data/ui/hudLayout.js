// Plan 01.07 Task 5/6: spreadModeIndicator + aimModeIndicator slots are
// declared in src/modules/ui/AAAHudLayout.js (HTML elements `#ui-spread-mode`
// and `#ui-aim-mode`) and updated each frame by UISystem via
// `hud.updateModeIndicators(spreadMode, aimMode)`. The slots live in the
// `systems-area` panel alongside the existing nav telemetry.
const AAA_TACTICAL_LAYOUT = Object.freeze({
  id: 'aaa_tactical',
  label: 'AAA Tactical',
  description: 'AAA tactical HUD integrated via module.',
  plugin: {
    module: 'AAAHudLayout',
    radarRange: 1500,
  },
  items: [],
  // Mode indicators (FIX-05) — read from CombatSystem.getSpreadMode() /
  // .getAimMode(); rendered by AAAHudLayout.updateModeIndicators.
  modeIndicators: {
    spreadModeIndicator: { slotId: 'ui-spread-mode', labels: ['CONC', 'FAN'] },
    aimModeIndicator: { slotId: 'ui-aim-mode', labels: ['AUTO', 'MANUAL'] },
  },
});

export const DEFAULT_HUD_LAYOUT_ID = 'aaa_tactical';

export function getHudLayoutDefinition(id = DEFAULT_HUD_LAYOUT_ID) {
  if (id && id !== DEFAULT_HUD_LAYOUT_ID) {
    console.warn(
      `[hudLayout] Unknown layout "${id}" requested - falling back to "${DEFAULT_HUD_LAYOUT_ID}".`
    );
  }
  return AAA_TACTICAL_LAYOUT;
}
