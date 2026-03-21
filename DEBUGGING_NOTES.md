# AXiM Core Debugging Notes - 2025-09-23

This document outlines the debugging process undertaken to resolve an application rendering failure. While the issue was not ultimately resolved, these notes are intended to provide a comprehensive overview of the steps taken, the errors encountered, and the solutions attempted.

## Initial Problem

The application fails to render the login page, preventing any user interaction. The initial goal was to get the application running to a state where further development could continue.

## Investigation and Fixes Attempted

### 1. Routing Issues in `App.jsx`

*   **Observation**: The `App.jsx` file contained a nested `<Routes>` component, which is not supported in `react-router-dom` v6 and was causing a critical routing issue.
*   **Action**: Refactored the routing logic in `App.jsx` to use a single, flat `<Routes>` component with a `ProtectedLayout` component to handle the sidebar and protected content.
*   **Result**: This fixed the routing issue, but the application still failed to render.

### 2. Vite Server Error (`500 Internal Server Error`)

*   **Observation**: The browser console showed a `500 Internal Server Error`. The `dev.log` file revealed that Vite was unable to import `/wink-model/model.js` from the `/public` directory.
*   **Action**:
    1.  Moved the `wink-model` directory from `/public` to `/src`.
    2.  Updated the import path in `src/services/onyxAI/nlp.js` to `../../wink-model/model.js`.
*   **Result**: This resolved the 500 error, but the application still failed to render.

### 3. CommonJS vs. ES Modules (`require is not defined`)

*   **Observation**: After fixing the server error, a new error appeared in the browser console: `ReferenceError: require is not defined`. This was caused by the `wink-model` files using CommonJS syntax (`require`/`module.exports`) in a Vite/ESM environment.
*   **Action**:
    1.  Attempted to manually convert the `wink-model` files to ESM syntax. This was deemed too complex and error-prone.
    2.  Used the `wink-nlp` model installation script (`node -e "require( 'wink-nlp/models/install' )"`) to install a supposedly compatible model.
    3.  Updated `nlp.js` to import the model directly from `wink-eng-lite-model`.
*   **Result**: The error changed to `TypeError: __require.resolve is not a function`, indicating a deeper incompatibility between `wink-nlp` and Vite.

### 4. Vite CommonJS Plugin

*   **Observation**: The `wink-nlp` package seemed to be the root cause of the issue.
*   **Action**:
    1.  Installed `vite-plugin-commonjs`.
    2.  Configured `vite.config.js` to process the `wink-nlp` and `wink-eng-lite-model` packages.
*   **Result**: The server crashed with a `SyntaxError` related to the plugin's import. After fixing the import statement, the `__require.resolve is not a function` error returned.

### 5. Removal of NLP Functionality

*   **Observation**: The `wink-nlp` library was deemed incompatible with the project's setup.
*   **Action**:
    1.  Uninstalled `wink-nlp` and `wink-eng-lite-model`.
    2.  Removed all NLP-related code from `src/services/onyxAI/nlp.js` and `src/main.jsx`.
*   **Result**: The application still failed to render.

### 6. Supabase Context and Client Initialization

*   **Observation**: The user provided a detailed analysis pointing to issues with the Supabase client initialization and context consumption.
*   **Action**:
    1.  Refactored `SupabaseContext.jsx` to use the `useMemo` hook.
    2.  Updated `AuthContext.jsx` to consume the Supabase client from the context.
    3.  Simplified `main.jsx` to remove unnecessary async initialization.
    4.  Corrected the provider order in `App.jsx` (`SupabaseProvider` must wrap `AuthProvider`).
*   **Result**: The login page now renders successfully! However, the login functionality is still broken.

### 7. Login Failure (`400 Bad Request`)

*   **Observation**: The login request was failing with a `400 Bad Request`.
*   **Action**:
    1.  Investigated the `setup.sql` file and discovered that the seed user's email was `seeduser@example.com` and the password was `password`.
    2.  Updated the Playwright script to use the correct credentials.
*   **Result**: The login still fails. The application stays on the login page.

## Current Status

The application now renders the login page, but the login functionality is still broken. The root cause is unknown, but it's likely related to the Supabase setup or the seed data.

## Recommendations for Future Work

*   **Verify the Supabase setup**: Double-check the Supabase project settings, including the authentication configuration and the database schema.
*   **Re-run the `setup.sql` script**: It's possible that the database was not seeded correctly.
*   **Simplify the login process**: For debugging purposes, consider creating a very simple login component with hardcoded credentials to isolate the issue.
*   **Add more logging**: Add more detailed logging to the `AuthContext` and `Login` component to trace the authentication flow.


## Deprecation Warnings Analysis (Mar 2026)

During `npm install`, several deprecation warnings are visible:
- `lodash.isequal@4.5.0` (Used by `electron-updater`)
- `inflight@1.0.6` and `glob@7.2.3` (Used extensively by `electron-builder@24` and `electron@38`)
- `boolean@3.2.0` (Used by `@electron/get` inside `electron`)
- `node-domexception@1.0.0` (Used by `node-fetch` inside `@google-cloud/pubsub`)
- `@types/react-select@5.0.1` (Stub definition inside `@questlabs/react-sdk`)

**Action Taken:**
- We ran `npm audit fix` to safely address critical CVEs (e.g., updating `react-router-dom` to `6.30.3` to resolve open redirect vulnerabilities).
- We avoided forcing `overrides` for these deprecated packages (like swapping `inflight` for `lru-cache`) because their internal APIs differ significantly, which breaks the application at runtime.
- We deferred major version bumps of `electron` (to v41) and `electron-builder` (to v26) to a future, dedicated upgrade cycle, as jumping 2-3 major versions introduces significant breaking changes to the main application.
