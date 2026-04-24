process.env.VITE_SUPABASE_URL = 'http://localhost:8000';
process.env.VITE_SUPABASE_ANON_KEY = 'fake-anon-key';
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
