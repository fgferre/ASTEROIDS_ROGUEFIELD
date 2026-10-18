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
  {
    files: ['src/**/*.{js,mjs}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='NODE_ENV']",
          message: 'Dev mode is one switch: import IS_DEV from src/core/env.js',
        },
        {
          selector:
            "MemberExpression[object.type='MemberExpression'][object.object.type='MetaProperty'][object.property.name='env'][property.name=/^(DEV|PROD|MODE)$/]",
          message: 'Dev mode is one switch: import IS_DEV from src/core/env.js',
        },
      ],
    },
  },
  {
    files: ['src/core/env.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
