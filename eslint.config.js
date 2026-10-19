// Lint gate (part of `npm run done` and CI). Rules that flag real defects are
// errors; rules about tidiness are warnings until a cleanup round zeroes them
// (BACKLOG.md). Formatting is Prettier's job, not ESLint's.
import js from '@eslint/js';
import globals from 'globals';

const vitestGlobals = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  vi: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
};

const DEV_SWITCH_MESSAGE =
  'Dev mode is one switch: import IS_DEV from src/core/env.js';
// Parents that store or hand on a value: `const x = v`, `x = v`, `{ a } = v`,
// `...v`, `return v`, `f(v)`, `() => v`.
const STORED =
  ":matches([parent.type='VariableDeclarator'], [parent.type='AssignmentExpression'], [parent.type='AssignmentPattern'], [parent.type='SpreadElement'], [parent.type='ReturnStatement'], [parent.type='CallExpression'], [parent.type='ArrowFunctionExpression'])";

// Line cap (PLAN.md, Rodada 0). These files were over it when the cap arrived
// (19/10/2026): the list is the debt scoreboard and only shrinks. A file
// leaves it when it is split, and tests/process/max-lines.test.js fails on a
// name whose file is back under the cap. Never add a name: split the file.
export const MAX_LINES = 1200;
export const OVER_THE_CAP = [
  'src/modules/AudioSystem.js',
  'src/modules/EnemySystem.js',
  'src/modules/PhysicsSystem.js',
  'src/modules/PlayerSystem.js',
  'src/modules/XPOrbSystem.js',
  'src/modules/combat/Targeting.js',
  'src/modules/effects/EnemyEffects.js',
  'src/modules/enemies/managers/WaveManager.js',
  'src/modules/enemies/types/BossEnemy.js',
];

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'exported-assets/**',
      'src/public/libs/**',
      '.planning/**',
      '.claude/**',
    ],
  },
  {
    files: ['**/*.{js,mjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...vitestGlobals,
        // runtime globals the game still relies on (see AGENTS.md traps)
        gameServices: 'readonly',
        gameEvents: 'readonly',
        THREE: 'readonly',
        CANNON: 'readonly',
        lucide: 'readonly',
        Stats: 'readonly',
        __AUDIO_DEBUG_BUILD__: 'readonly',
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-extra-boolean-cast': 'error',
      'max-lines': ['error', { max: MAX_LINES }],
      // Determinism contract: all randomness goes through RandomService.
      // Allowed exceptions disable the rule inline with a reason:
      // MenuBackgroundSystem.withSeededMathRandom, the dev Math.random guard,
      // and the benchmark scripts.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use RandomService (seeded) instead of Math.random.',
        },
      ],
    },
  },
  // Dev mode is one switch: only src/core/env.js may read the build flags.
  // import.meta.env.BASE_URL (asset paths) is not a dev switch and stays legal.
  // Besides the direct reads, storing the env object (alias, destructuring,
  // default value, argument) is flagged: it is how DEV slips past a read check.
  {
    files: ['src/**/*.{js,mjs}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env']:matches([property.name='NODE_ENV'], [property.value='NODE_ENV'])",
          message: DEV_SWITCH_MESSAGE,
        },
        {
          selector:
            "MemberExpression[object.type='MemberExpression'][object.object.type='MetaProperty'][object.property.name='env']:matches([property.name=/^(DEV|PROD|MODE)$/], [property.value=/^(DEV|PROD|MODE)$/])",
          message: DEV_SWITCH_MESSAGE,
        },
        {
          selector: `MemberExpression[object.type='MetaProperty'][property.name='env']${STORED}, MemberExpression[object.name='process'][property.name='env']${STORED}, MetaProperty[property.name='meta']${STORED}`,
          message: `${DEV_SWITCH_MESSAGE} (do not store or destructure import.meta / import.meta.env / process.env)`,
        },
      ],
    },
  },
  {
    files: ['src/core/env.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: OVER_THE_CAP,
    rules: { 'max-lines': 'off' },
  },
];
