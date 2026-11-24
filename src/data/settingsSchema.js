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

const HULL_OPTION_IDS = getAllShipModels().map((hull) => hull.id);

const SETTINGS_SCHEMA = [
  {
    id: 'gameplay',
    label: 'Gameplay',
    description: 'Visual feedback and game mechanics adjustments.',
    fields: [
      {
        key: 'selectedHull',
        type: 'select',
        // Picked in the menu and the Hangar; kept out of the Settings panel,
        // so its resets leave it alone.
        hidden: true,
        keepOnReset: true,
        default: DEFAULT_HULL_ID,
        options: HULL_OPTION_IDS,
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
        key: 'hitMarkers',
        type: 'toggle',
        label: 'Hit Markers',
        description:
          'Sparks and molten fragments where your shots strike metal.',
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
          'Menu and flight tips on your first visits and runs. Turning this back on shows them again.',
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
        key: 'cameraLead',
        type: 'select',
        control: 'segmented',
        label: 'Camera Lead',
        description:
          'Where the Dynamic camera looks ahead: toward your aim, or along the hull.',
        options: ['aim', 'hull'],
        optionLabels: { aim: 'Aim', hull: 'Hull' },
        default: 'aim',
      },
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
        label: 'Turn Left',
        description: 'Turns the hull. In Modern flight, slides to port.',
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
        label: 'Turn Right',
        description: 'Turns the hull. In Modern flight, slides to starboard.',
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
        key: 'strafeLeft',
        type: 'binding',
        label: 'Strafe Left',
        description:
          'The side jets push the hull to port, the nose held; harder with the RCS System. Holding Space, A does it too.',
        default: {
          keyboard: ['KeyZ'],
          gamepad: [],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'strafeRight',
        type: 'binding',
        label: 'Strafe Right',
        description:
          'The side jets push the hull to starboard, the nose held; harder with the RCS System. Holding Space, D does it too.',
        default: {
          keyboard: ['KeyC'],
          gamepad: [],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'strafeHold',
        type: 'binding',
        label: 'Strafe Hold',
        description:
          'While held (Space on the keys, LB on a pad), left and right strafe instead of turning or steering. In Classic flight the left stick strafes sideways on its own.',
        default: {
          keyboard: ['Space'],
          gamepad: GAMEPAD_BINDINGS.strafeHold,
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
        key: 'toggleFullscreen',
        type: 'binding',
        label: 'Toggle Fullscreen',
        description: 'Enter or leave fullscreen.',
        default: {
          keyboard: ['KeyF'],
          gamepad: [],
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
        description: 'Switch between concentrated and fan burst shape.',
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
          "After the Auto Turret card: switch between the turret's own aim and aiming by the nose.",
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
        key: 'touchControls',
        type: 'select',
        control: 'segmented',
        label: 'Touch Controls',
        description:
          'Auto: the stick and buttons show when a finger touches the screen, and hide when you press a key. Always: they stay, and a mouse can work them, for screens that send touches as a mouse.',
        options: ['auto', 'always'],
        optionLabels: { auto: 'Auto', always: 'Always' },
        default: 'auto',
      },
      {
        key: 'vibration',
        type: 'toggle',
        label: 'Gamepad Vibration',
        description:
          'Rumble on hull hits, dashes and Warden arrivals. Off with Reduce Motion.',
        default: true,
      },
      {
        key: 'stickSensitivity',
        type: 'select',
        control: 'segmented',
        label: 'Stick Sensitivity',
        description:
          'Gamepad: how hard the engines push with the stick part-way. Low: gentler at small tilts, for fine moves. High: the push grows as far as the stick leans. Full tilt is full push on all three.',
        options: ['low', 'medium', 'high'],
        optionLabels: { low: 'Low', medium: 'Medium', high: 'High' },
        default: 'medium',
      },
    ],
  },
  {
    id: 'video',
    label: 'Interface',
    description: 'Customize HUD layout and scaling.',
    fields: [
      {
        key: 'fullscreen',
        type: 'toggle',
        label: 'Fullscreen',
        description: 'Fill the whole screen. Esc leaves it.',
        default: false,
      },
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
      // The active layout: a built-in preset's id (data/ui/hudPresets.js)
      // or one of `hudPresets`' (modules/ui/hud/editor/layoutStore.js).
      {
        key: 'hudLayout',
        type: 'hudLayout',
        label: 'HUD Layout',
        description:
          'Instrument: fine instruments that fade until needed. Classic: the panels from before. Minimal: the least on screen. Then your own layouts.',
        default: 'instrument',
      },
      // The player's own layouts, saved from the HUD editor; a reset of
      // the Interface tab keeps them.
      {
        key: 'hudPresets',
        type: 'hudPresets',
        label: 'HUD Edit Mode',
        description:
          'Move, resize and swap every instrument on the live HUD, then save it as your own layout or share it as a code.',
        default: [],
        keepOnReset: true,
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
        key: 'bloomIntensity',
        type: 'select',
        control: 'segmented',
        label: 'Bloom Intensity',
        description:
          'How strong the glow is. Turn Bloom off above to remove it.',
        options: ['low', 'normal', 'high'],
        optionLabels: { low: 'Low', normal: 'Normal', high: 'High' },
        default: 'normal',
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
      {
        key: 'voiceVolume',
        type: 'range',
        label: 'Voice Volume',
        description: 'The spoken transmissions. At zero the voices are off.',
        default: 1,
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
          'Card rarities, upgrade families and threats in colors that stay apart with color blindness.',
        default: false,
      },
    ],
  },
];

export function getSettingsSchema() {
  return SETTINGS_SCHEMA;
}

export default SETTINGS_SCHEMA;
