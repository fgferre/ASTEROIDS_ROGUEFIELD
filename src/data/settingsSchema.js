import { DEFAULT_HULL_ID, getAllShipModels } from './shipModels.js';
// Plan 01.07 FIX-05 (fix-pass-2 C7a): import the keybind default constants
// from gameplay.js so the toggle bindings live in a single source of truth.
// The first fix-pass exported these but left settingsSchema.js with the
// hardcoded literals 'KeyG' / 'KeyT'; a future designer change would have
// silently drifted between the two files.
import {
  COMBAT_DEFAULT_KEYBIND_TOGGLE_SPREAD,
  COMBAT_DEFAULT_KEYBIND_TOGGLE_AIM,
} from './constants/gameplay.js';
import { GAMEPAD_BINDINGS } from './constants/gamepad.js';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_IDS,
  DIFFICULTY_LABELS,
} from './difficulty.js';

const DEFAULT_BINDING_METADATA = {
  keyboard: {
    max: 2,
    label: 'Keyboard',
  },
  gamepad: {
    max: 2,
    label: 'Gamepad',
    allowAxis: true,
    threshold: 0.45,
  },
};

const HULL_OPTIONS = getAllShipModels();
const HULL_OPTION_IDS = HULL_OPTIONS.map((hull) => hull.id);
const HULL_OPTION_LABELS = Object.fromEntries(
  HULL_OPTIONS.map((hull) => [hull.id, hull?.name || hull?.id || ''])
);

const SETTINGS_SCHEMA = [
  {
    id: 'gameplay',
    label: 'Gameplay',
    description: 'Visual feedback and game mechanics adjustments.',
    fields: [
      {
        key: 'selectedHull',
        type: 'select',
        label: 'Ship Hull',
        description: 'Choose the playable hull used for the next run.',
        default: DEFAULT_HULL_ID,
        options: HULL_OPTION_IDS,
        optionLabels: HULL_OPTION_LABELS,
      },
      {
        key: 'difficulty',
        type: 'select',
        control: 'segmented',
        label: 'Difficulty',
        description:
          'Pilot: softer enemies and hits, thinner fields. Warden: tougher, harder-hitting enemies, denser fields, more XP. Applies from the next run.',
        options: [...DIFFICULTY_IDS],
        optionLabels: { ...DIFFICULTY_LABELS },
        default: DEFAULT_DIFFICULTY,
      },
      {
        key: 'damageNumbers',
        type: 'toggle',
        label: 'Damage Numbers',
        description: 'Display floating numeric values when hitting enemies.',
        default: true,
      },
      {
        key: 'hitMarkers',
        type: 'toggle',
        label: 'Hit Markers',
        description: 'Visual crosshair feedback when shots connect.',
        default: true,
      },
      {
        key: 'screenShake',
        type: 'range',
        label: 'Screen Shake Intensity',
        description:
          'Controls camera shake intensity during explosions and collisions.',
        default: 1,
        min: 0,
        max: 1,
        step: 0.1,
      },
      {
        key: 'onboardingTips',
        type: 'toggle',
        label: 'Show Onboarding Tips',
        description:
          'Short in-play tips on your first run. Turning this back on shows them again.',
        default: true,
      },
    ],
  },
  {
    id: 'controls',
    label: 'Controls',
    description:
      'Remap main actions for keyboard and gamepad. Changes are saved immediately.',
    fields: [
      {
        key: 'moveUp',
        type: 'binding',
        label: 'Thrust Forward',
        description: 'Thrust along the nose.',
        default: {
          keyboard: ['KeyW', 'ArrowUp'],
          gamepad: GAMEPAD_BINDINGS.moveUp,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'moveDown',
        type: 'binding',
        label: 'Thrust Back',
        description: 'Reverse thrust along the nose.',
        default: {
          keyboard: ['KeyS', 'ArrowDown'],
          gamepad: GAMEPAD_BINDINGS.moveDown,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'moveLeft',
        type: 'binding',
        label: 'Strafe Left',
        description: 'Slide to port; the nose stays on the target.',
        default: {
          keyboard: ['KeyA', 'ArrowLeft'],
          gamepad: GAMEPAD_BINDINGS.moveLeft,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'moveRight',
        type: 'binding',
        label: 'Strafe Right',
        description: 'Slide to starboard; the nose stays on the target.',
        default: {
          keyboard: ['KeyD', 'ArrowRight'],
          gamepad: GAMEPAD_BINDINGS.moveRight,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'activateShield',
        type: 'binding',
        label: 'Activate Shield',
        description: 'Deploys energy protection when available.',
        default: {
          keyboard: ['KeyE'],
          gamepad: GAMEPAD_BINDINGS.activateShield,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'dash',
        type: 'binding',
        label: 'Dash',
        description: 'Short burst forward (or backward while braking).',
        default: {
          keyboard: ['ShiftLeft', 'ShiftRight'],
          gamepad: GAMEPAD_BINDINGS.dash,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'pause',
        type: 'binding',
        label: 'Pause / Resume',
        description: 'Freezes game and opens quick menu.',
        default: {
          keyboard: ['Escape', 'KeyP'],
          gamepad: GAMEPAD_BINDINGS.pause,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'openSettings',
        type: 'binding',
        label: 'Open Settings',
        description: 'Direct shortcut to settings panel.',
        default: {
          keyboard: ['F10'],
          gamepad: GAMEPAD_BINDINGS.openSettings,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'confirm',
        type: 'binding',
        label: 'Confirm / Interact',
        description: 'Confirm selections in menus and dialogs.',
        default: {
          keyboard: ['Enter', 'Space'],
          gamepad: GAMEPAD_BINDINGS.confirm,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'toggleSpreadMode',
        type: 'binding',
        label: 'Toggle Spread Mode',
        description:
          'Switch between concentrated and fan burst shape (FIX-05).',
        default: {
          keyboard: [COMBAT_DEFAULT_KEYBIND_TOGGLE_SPREAD],
          gamepad: GAMEPAD_BINDINGS.toggleSpreadMode,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'toggleAimMode',
        type: 'binding',
        label: 'Toggle Aim Mode',
        description:
          'Switch between auto-aim and manual ship-nose aim (FIX-05).',
        default: {
          keyboard: [COMBAT_DEFAULT_KEYBIND_TOGGLE_AIM],
          gamepad: GAMEPAD_BINDINGS.toggleAimMode,
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'vibration',
        type: 'toggle',
        label: 'Gamepad Vibration',
        description:
          'Rumble on hull hits, dashes and Warden arrivals. Off with Reduce Motion.',
        default: true,
      },
    ],
  },
  {
    id: 'video',
    label: 'Interface',
    description: 'Customize HUD layout and scaling.',
    fields: [
      {
        key: 'hudScale',
        type: 'range',
        label: 'HUD Scale',
        description: 'Adjust size of interface elements.',
        default: 1,
        min: 0.8,
        max: 1.3,
        step: 0.05,
      },
      {
        key: 'damageFlash',
        type: 'toggle',
        label: 'Damage Flash',
        description: 'Enable/disable white screen flash when taking damage.',
        default: true,
      },
    ],
  },
  {
    id: 'graphics',
    label: 'Graphics',
    description: 'Visual quality and post-processing effects.',
    fields: [
      {
        key: 'quality',
        type: 'select',
        control: 'segmented',
        label: 'Quality',
        description:
          'Auto lowers the 3D detail when frames get slow and raises it back when they recover.',
        options: ['auto', 'ultra', 'high', 'medium', 'low'],
        optionLabels: {
          auto: 'Auto',
          ultra: 'Ultra',
          high: 'High',
          medium: 'Medium',
          low: 'Low',
        },
        default: 'auto',
      },
      {
        key: 'postProcessing',
        type: 'toggle',
        label: 'Post-Processing',
        description: 'Enable advanced visual effects pipeline.',
        default: true,
      },
      {
        key: 'bloom',
        type: 'toggle',
        label: 'Bloom',
        description:
          'Intense glow effect on lasers, thrusters, and explosions.',
        default: true,
      },
      {
        key: 'chromaticAberration',
        type: 'toggle',
        label: 'Chromatic Aberration',
        description: 'Simulates lens distortion at screen edges.',
        default: true,
      },
      {
        key: 'antialiasing',
        type: 'select',
        label: 'Anti-aliasing',
        description: 'Reduces jagged edges.',
        options: ['None', 'SMAA'],
        default: 'SMAA',
      },
      {
        key: 'cameraMode',
        type: 'select',
        control: 'segmented',
        label: 'Camera',
        description:
          'Dynamic leads toward your aim, pulls out in crowds and frames bosses; Classic is the plain follow.',
        options: ['dynamic', 'classic'],
        optionLabels: { dynamic: 'Dynamic', classic: 'Classic' },
        default: 'dynamic',
      },
      {
        key: 'reducedParticles',
        type: 'toggle',
        label: 'Reduced Particles',
        description:
          'Simplifies intense visual effects like sparks and debris.',
        default: false,
      },
    ],
  },
  {
    id: 'audio',
    label: 'Audio',
    description: 'Adjust game audio mix, individual volumes, and mute options.',
    fields: [
      {
        key: 'muteAll',
        type: 'toggle',
        label: 'Mute All',
        description: 'Immediately stop all sound output.',
        default: false,
      },
      {
        key: 'masterVolume',
        type: 'range',
        label: 'Master Volume',
        description: 'Controls global volume for all channels.',
        default: 0.7,
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        key: 'musicVolume',
        type: 'range',
        label: 'Music Volume',
        description: 'Sets intensity of ambient music and thematic tracks.',
        default: 0.6,
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        key: 'effectsVolume',
        type: 'range',
        label: 'SFX Volume',
        description:
          'Affects shots, explosions, XP collection, and instant effects.',
        default: 0.85,
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    description: 'Options to reduce visual discomfort and reinforce game cues.',
    fields: [
      {
        key: 'reducedMotion',
        type: 'toggle',
        label: 'Reduce Motion',
        description: 'Attenuates effects like screen shake and rapid flashes.',
        default: false,
      },
      {
        key: 'reduceFlashing',
        type: 'toggle',
        label: 'Reduce Flashing',
        description:
          'Softens screen flashes, lens kicks and the shield break to under a third, and never strobes.',
        default: false,
      },
      {
        key: 'textScale',
        type: 'select',
        control: 'segmented',
        label: 'Text Size',
        description:
          'Scales HUD text and the level-up, pause and recap screens.',
        options: ['0.9', '1', '1.15', '1.3'],
        optionLabels: { 0.9: '90%', 1: '100%', 1.15: '115%', 1.3: '130%' },
        default: '1',
      },
      {
        key: 'highContrastHud',
        type: 'toggle',
        label: 'High Contrast HUD',
        description: 'Opaque HUD panels, thicker outlines and brighter labels.',
        default: false,
      },
      {
        key: 'largeSubtitles',
        type: 'toggle',
        label: 'Large Subtitles',
        description: 'Makes transmission lines bigger, on top of Text Size.',
        default: false,
      },
      {
        key: 'colorBlindPalette',
        type: 'toggle',
        label: 'Colorblind Mode',
        description:
          'Activates alternative palette with better distinction between categories.',
        default: false,
      },
    ],
  },
];

export function getSettingsSchema() {
  return SETTINGS_SCHEMA;
}

export default SETTINGS_SCHEMA;
