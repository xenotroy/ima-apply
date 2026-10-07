import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: process.env.IMA_BASE_PATH || '/',
  build: { sourcemap: false },
  test: { include: ['src/**/*.test.ts'] },
});
