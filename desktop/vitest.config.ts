import { defineConfig } from 'vitest/config';

// Unit tests for the Electron main-process modules (engine lifecycle, etc.).
// Kept in tests/unit/ — outside the `electron/**` and `src/**` tsconfig
// includes — so the production build (`tsc -b && vite build`) never pulls in
// vitest types or the test files themselves. Run with `npm run test:unit`.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
