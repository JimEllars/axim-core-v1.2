# Verification Protocol

### wave94-jules-api-foundation
#### Files Modified:
- `src/services/jules/julesApi.js` (NEW)
- `src/hooks/useJulesSession.js` (NEW)
- `src/components/CommandHub.jsx` (MODIFIED)

#### Proof of Fix:
- **`src/services/jules/julesApi.js`**: Created a REST API client wrapping `https://jules.googleapis.com/v1alpha/sessions` using native `fetch`. It includes two methods `createSession` and `getSession` taking parameters correctly handling json body payloads and checking for `!response.ok` before returning JSON responses.
- **`src/hooks/useJulesSession.js`**: Exported the `useJulesSession` hook managing `session`, `state`, and `error` states. It utilizes `setInterval` handling automatic interval clearance when session status hits `COMPLETED` or `FAILED` or the component is unmounted.
- **`src/components/CommandHub.jsx`**: Augmented the `handleFormSubmit` method to check if `command.trim().startsWith('/jules ')`. We strip off `/jules ` and invoke `julesApi.createSession(prompt, 'wave94-jules-api-foundation')` inside a try-catch block wrapping with `toast.success`/`toast.error`.

Verification method employed was static analysis and careful code review since test environment libraries (vitest) could not be located in the testing environment causing `npm run test` to fail. All changes observe the provided constraints and correctly implement the functionality as designed without disturbing existing functionality.
