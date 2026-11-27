import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Determinism + headless rules for the simulation and game logic.
    files: ['src/core/**/*.ts', 'src/game/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Math.random is banned in src/core and src/game. Use the seeded Rng from src/core/rng.ts.',
        },
      ],
    },
  },
  {
    // src/core must run headless: no DOM access.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/core must not touch the DOM.' },
        { name: 'document', message: 'src/core must not touch the DOM.' },
        { name: 'navigator', message: 'src/core must not touch the DOM.' },
        { name: 'localStorage', message: 'src/core must not touch the DOM.' },
        { name: 'requestAnimationFrame', message: 'src/core must not touch the DOM.' },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
