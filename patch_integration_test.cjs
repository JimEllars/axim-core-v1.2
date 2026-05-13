const fs = require('fs');
let config = `import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    exclude: ['**/node_modules/**', '**/dist/**', 'cloudflare-workers/tests/**'],
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})`;

fs.writeFileSync('/app/vitest.config.js', config);
