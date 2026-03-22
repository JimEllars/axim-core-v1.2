import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'public/wink-model/**'] },
  js.configs.recommended,

  // Configuration for React source files
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        React: true,
        JSX: true,
        webkitSpeechRecognition: 'readonly',
        SpeechRecognition: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
      'no-unused-vars': 'off',
      'no-case-declarations': 'off',
    },
  },

  // Configuration for root-level config files and electron main process
  {
    files: ['*.js', '*.cjs', 'electron/**/*.js', 'electron/**/*.cjs', 'cloud/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        __dirname: 'readonly',
      },
    },
  },

  // Configuration for GCP service file which requires Node.js globals
  {
    files: ['src/services/gcpApiService.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Configuration for the standalone GCP backend service and Satellite SDK
  {
    files: ['gcp-backend/**/*.js', 'satellite/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Configuration for Cloudflare Workers
  {
    files: ['cloudflare-workers/src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        env: 'readonly',
        ctx: 'readonly',
      },
    },
  },

  // Configuration for test files
  {
    files: ['**/*.test.js', '**/*.test.jsx', 'src/vitest.setup.jsx'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        vi: 'readonly',
        global: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
  },
];
