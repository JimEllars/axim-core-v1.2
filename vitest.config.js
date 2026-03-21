import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/vitest.setup.jsx',
    threads: false, // Run tests sequentially to avoid memory issues
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
    exclude: ['**/node_modules/**', '**/dist/**', '**/.idea/**', '**/.git/**', '**/.cache/**', '**/gcp-backend/**'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
