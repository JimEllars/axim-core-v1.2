import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': '/app/src'
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.jsx'],
    globals: true,
  },
});
