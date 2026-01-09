// src/data/settingsSchema.js

import { DEFAULT_HUD_LAYOUT_ID } from './ui/hudLayout.js';

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

const SETTINGS_SCHEMA = [
  {
    id: 'gameplay',
    label: 'Gameplay',
    description: 'Visual feedback and game mechanics adjustments.',
    fields: [
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
        label: 'Move Up',
        description: 'Accelerate ship forward.',
        default: {
          keyboard: ['KeyW', 'ArrowUp'],
          gamepad: ['axis:1:-', 'button:12'],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'moveDown',
        type: 'binding',
        label: 'Move Down',
        description: 'Engage rear thrusters to decelerate.',
        default: {
          keyboard: ['KeyS', 'ArrowDown'],
          gamepad: ['axis:1:+', 'button:13'],
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
        description: 'Lateral control for aiming adjustment.',
        default: {
          keyboard: ['KeyA', 'ArrowLeft'],
          gamepad: ['axis:0:-', 'button:14'],
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
        description: 'Lateral thrust towards target.',
        default: {
          keyboard: ['KeyD', 'ArrowRight'],
          gamepad: ['axis:0:+', 'button:15'],
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
          keyboard: ['KeyE', 'ShiftLeft'],
          gamepad: ['button:2', 'button:4'],
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
          gamepad: ['button:9'],
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
          gamepad: ['button:8'],
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
          gamepad: ['button:0'],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
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
        key: 'highContrastHud',
        type: 'toggle',
        label: 'High Contrast HUD',
        description: 'Applies stronger colors to key indicators.',
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
