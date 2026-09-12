import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** Mirrors the "@/*" path alias from tsconfig so tests resolve it too. */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    include: ['{lib,components,app}/**/*.test.ts'],
  },
});
