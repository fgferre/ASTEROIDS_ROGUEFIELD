const AAA_TACTICAL_LAYOUT = Object.freeze({
  id: 'aaa_tactical',
  label: 'AAA Tactical',
  description: 'AAA tactical HUD integrated via module.',
  plugin: {
    module: 'AAAHudLayout',
    radarRange: 1500,
  },
  items: [],
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
