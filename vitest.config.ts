import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Most of the suite will be the engine, which is pure. A DOM test opts in
    // with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
