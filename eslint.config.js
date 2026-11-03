import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist", "coverage", "cloudflare-workers"] },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
        process: 'readonly',
        globalThis: 'readonly',
      },
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    settings: { react: { version: "18.3" } },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/jsx-no-target-blank": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "react/prop-types": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
      "react/display-name": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "no-unused-vars": "off",
      "no-useless-escape": "off",
      "no-empty": "off",
      "no-cond-assign": "off",
    },
  },
  {
    files: ["src/**/*.{js,jsx}", "tests/**/*.{js,jsx}"],
    rules: {
      "no-unused-vars": "off"
    }
  },
  {
    // Context modules intentionally co-locate a Provider component with its
    // `useX()` hook and, in some cases, the raw React context object. The
    // react-refresh rule guards HMR boundaries for component-only modules and
    // reports a warning for every one of those legitimate hook exports. Moving
    // the hooks into separate files would touch every import site for no
    // runtime benefit, so the rule is scoped off for this directory only.
    files: ["src/contexts/**/*.{js,jsx}"],
    rules: {
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: ["cloudflare-workers/src/**/*.{js,ts}"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        Response: 'readonly',
        Request: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        caches: 'readonly'
      }
    }
  }
];
