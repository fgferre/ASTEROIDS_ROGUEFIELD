// src/data/ui/hudLayout.js

const HUD_LAYOUTS = {
  aaa_tactical: {
    id: 'aaa_tactical',
    label: 'AAA Tactical',
    description: 'HUD tático AAA integrado via módulo.',
    plugin: {
      module: 'AAAHudLayout',
      radarRange: 1500,
    },
    items: [],
  },
};

export const DEFAULT_HUD_LAYOUT_ID = 'aaa_tactical';

export const HUD_LAYOUT_IDS = {
  AAA_TACTICAL: 'aaa_tactical',
};

export const HUD_LAYOUT_OPTIONS = Object.values(HUD_LAYOUTS).map(
  ({ id, label, description }) => ({
    id,
    value: id,
    label,
    description,
  })
);

export const HUD_LAYOUT_OPTION_LABELS = HUD_LAYOUT_OPTIONS.reduce(
  (accumulator, option) => {
    accumulator[option.value] = option.label;
    return accumulator;
  },
  {}
);

export function getHudLayoutDefinition(id = DEFAULT_HUD_LAYOUT_ID) {
  return HUD_LAYOUTS[id] || HUD_LAYOUTS[DEFAULT_HUD_LAYOUT_ID];
}

export function getHudLayoutItems(id = DEFAULT_HUD_LAYOUT_ID) {
  const layout = getHudLayoutDefinition(id);
  return Array.isArray(layout.items) ? layout.items : [];
}

export default HUD_LAYOUTS;
