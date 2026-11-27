import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the production build works from any folder (itch.io zip in M10).
  base: './',
  build: { target: 'es2022' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
