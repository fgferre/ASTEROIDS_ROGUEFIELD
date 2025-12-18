// src/data/ui/hudLayout.js

const AAA_TACTICAL_LAYOUT = {
  id: 'aaa_tactical',
  label: 'AAA Tactical (Mockup)',
  description: 'HUD tático AAA integrado via módulo (layoutmockupstudy.html).',
  plugin: {
    module: 'AAAHudLayout',
    radarRange: 1500,
  },
  items: [],
};

const HUD_LAYOUTS = {
  aaa_tactical: AAA_TACTICAL_LAYOUT,
};

export const DEFAULT_HUD_LAYOUT_ID = 'aaa_tactical';

export const HUD_LAYOUT_IDS = {
  AAA_TACTICAL: 'aaa_tactical',
};

export const HUD_LAYOUT_OPTIONS = [
  {
    id: AAA_TACTICAL_LAYOUT.id,
    value: AAA_TACTICAL_LAYOUT.id,
    label: AAA_TACTICAL_LAYOUT.label,
    description: AAA_TACTICAL_LAYOUT.description,
  },
];

export const HUD_LAYOUT_OPTION_LABELS = {
  [AAA_TACTICAL_LAYOUT.id]: AAA_TACTICAL_LAYOUT.label,
};

export function getHudLayoutDefinition(id = DEFAULT_HUD_LAYOUT_ID) {
  return HUD_LAYOUTS[id] || HUD_LAYOUTS[DEFAULT_HUD_LAYOUT_ID];
}

export function getHudLayoutItems(id = DEFAULT_HUD_LAYOUT_ID) {
  const layout = getHudLayoutDefinition(id);
  return Array.isArray(layout.items) ? layout.items : [];
}

export default HUD_LAYOUTS;
