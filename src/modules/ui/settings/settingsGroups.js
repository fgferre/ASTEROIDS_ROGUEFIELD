// src/modules/ui/settings/settingsGroups.js
//
// How Settings presents the schema: six sections, each a list of groups
// (a small-caps title over rows) and folds (a <details> of rows). Only the
// layout lives here: every field keeps the category it is stored under.
// A field is 'category.key'. `bindings: true` marks the Controls group whose
// rows follow the Keyboard | Gamepad switch. Touch Controls shows only on a
// screen that does not declare touch (a phone or tablet always plays by it).

import { declaresTouch } from '../../../bootstrap/mobileGuard.js';

export const SETTINGS_SECTIONS = [
  {
    id: 'game',
    title: 'Game & camera',
    sub: 'Run and viewpoint',
    intro: 'Prepare the next run and choose how the camera follows you.',
    groups: [
      {
        title: 'Next run',
        fields: ['gameplay.difficulty', 'gameplay.onboardingTips'],
      },
      {
        title: 'Camera',
        fields: ['graphics.cameraMode', 'controls.cameraLead'],
      },
    ],
  },
  {
    id: 'controls',
    title: 'Controls',
    sub: 'Movement and bindings',
    intro: 'Choose how the hull moves, then assign keyboard or gamepad inputs.',
    groups: [
      {
        title: 'Handling',
        fields: [
          'controls.hullControl',
          ...(declaresTouch() ? [] : ['controls.touchControls']),
          'controls.vibration',
        ],
      },
      {
        title: 'Bindings',
        bindings: true,
        folds: [
          {
            title: 'Movement',
            open: true,
            fields: [
              'controls.moveUp',
              'controls.moveDown',
              'controls.moveLeft',
              'controls.moveRight',
            ],
          },
          {
            title: 'Combat',
            fields: [
              'controls.activateShield',
              'controls.dash',
              'controls.toggleSpreadMode',
              'controls.toggleAimMode',
            ],
          },
          {
            title: 'Menus',
            fields: [
              'controls.pause',
              'controls.openSettings',
              'controls.toggleFullscreen',
              'controls.confirm',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'hud',
    title: 'HUD & text',
    sub: 'Readability and layout',
    intro:
      'Size the instruments and text separately. Keep the information you need.',
    groups: [
      {
        title: 'Size & layout',
        fields: [
          'video.hudScale',
          'accessibility.textScale',
          'video.hudLayout',
          'video.hudPresets',
        ],
      },
      {
        title: 'Combat information',
        fields: ['gameplay.hitMarkers'],
      },
    ],
  },
  {
    id: 'graphics',
    title: 'Graphics',
    sub: 'Display and effects',
    intro: 'Choose overall quality first. Individual effects are below.',
    groups: [
      {
        title: 'Display',
        fields: [
          'video.fullscreen',
          'graphics.quality',
          'graphics.reducedParticles',
        ],
        folds: [
          {
            title: 'Individual effects',
            fields: [
              'graphics.postProcessing',
              'graphics.bloom',
              'graphics.bloomIntensity',
              'graphics.chromaticAberration',
              'graphics.antialiasing',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'audio',
    title: 'Audio',
    sub: 'Music, effects and voices',
    intro:
      'Master changes every channel. Use the other sliders to balance the mix.',
    groups: [
      {
        title: 'Output',
        fields: ['audio.muteAll', 'audio.masterVolume'],
      },
      {
        title: 'Mix',
        fields: [
          'audio.musicVolume',
          'audio.effectsVolume',
          'audio.voiceVolume',
        ],
      },
    ],
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    sub: 'Comfort and visual cues',
    intro: 'Adjust movement, flashes and the visibility of game cues.',
    groups: [
      {
        title: 'Motion & flashes',
        fields: [
          'accessibility.reducedMotion',
          'gameplay.screenShake',
          'accessibility.reduceFlashing',
          'video.damageFlash',
        ],
      },
      {
        title: 'Visual cues',
        fields: [
          'accessibility.highContrastHud',
          'accessibility.largeSubtitles',
          'accessibility.colorBlindPalette',
        ],
      },
    ],
  },
];

/** Every 'category.key' a section shows, in order. */
export function sectionFieldRefs(section) {
  return section.groups.flatMap((group) => [
    ...(group.fields ?? []),
    ...(group.folds ?? []).flatMap((fold) => fold.fields),
  ]);
}

export function splitFieldRef(ref) {
  const dot = ref.indexOf('.');
  return { categoryId: ref.slice(0, dot), key: ref.slice(dot + 1) };
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/**
 * Why a field is greyed, or null. `state`: { value(category, key),
 * pressureRung, newFlight, aimByNose }, read afresh at every render.
 */
export function inactiveReason(ref, state) {
  switch (ref) {
    case 'controls.cameraLead':
      return state.value('graphics', 'cameraMode') === 'classic'
        ? 'Only with the Dynamic camera.'
        : null;
    case 'graphics.bloom':
    case 'graphics.chromaticAberration':
    case 'graphics.antialiasing':
      return state.value('graphics', 'postProcessing') === false
        ? 'Needs Post-Processing.'
        : null;
    case 'graphics.bloomIntensity':
      if (state.value('graphics', 'postProcessing') === false) {
        return 'Needs Post-Processing.';
      }
      return state.value('graphics', 'bloom') === false
        ? 'Turn Bloom on to adjust it.'
        : null;
    case 'controls.vibration':
      return state.value('accessibility', 'reducedMotion') === true
        ? 'Off while Reduce Motion is on.'
        : null;
    case 'gameplay.difficulty': {
      const rung = state.pressureRung;
      return rung > 0
        ? `Pressure ${ROMAN[rung] ?? rung} is on, set in the Hangar. Turn it off there to use this.`
        : null;
    }
    case 'controls.hullControl':
      return state.newFlight
        ? 'Your cards choose the flight: every run starts in Classic glide; the Flight Computer card switches to Modern.'
        : null;
    case 'controls.toggleAimMode':
      return state.newFlight && state.aimByNose
        ? 'Works after the Auto Turret card.'
        : null;
    default:
      return null;
  }
}
