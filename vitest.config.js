import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.jsx'],
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    // Pin NODE_ENV for the whole run. Vitest honours an ambient NODE_ENV, so
    // running the suite from a shell that exports NODE_ENV=production (CI
    // images, some sandboxes) resolved React's *production* build. React then
    // refuses `act()` - "act(...) is not supported in production builds of
    // React" - and every React Testing Library suite failed for a reason that
    // has nothing to do with the code under test.
    // Fixing it here keeps the result independent of the caller's shell.
    env: { NODE_ENV: 'test' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
})
