# Education Shell Utilities

This folder contains browser helpers used by the education experience. Firebase authentication is configured dynamically at runtime using the module in `common/firebase.ts`.

## Firebase configuration

Firebase credentials are **not** hard-coded. In production you must supply them in one of the following ways (checked in order):

1. Environment variables prefixed with `VSCODE_EDU_FIREBASE_` when building or starting the web experience. The following keys are supported:
   - `VSCODE_EDU_FIREBASE_API_KEY`
   - `VSCODE_EDU_FIREBASE_AUTH_DOMAIN`
   - `VSCODE_EDU_FIREBASE_PROJECT_ID`
   - `VSCODE_EDU_FIREBASE_APP_ID`
   - `VSCODE_EDU_FIREBASE_STORAGE_BUCKET`
   - `VSCODE_EDU_FIREBASE_MESSAGING_SENDER_ID`
   - `VSCODE_EDU_FIREBASE_DATABASE_URL`
   - `VSCODE_EDU_FIREBASE_MEASUREMENT_ID`
   - Optional: `VSCODE_EDU_FIREBASE_CONFIG_URL`, `VSCODE_EDU_FIREBASE_AUTH_EMULATOR_HOST`, `VSCODE_EDU_FIREBASE_FIRESTORE_EMULATOR_HOST`, `VSCODE_EDU_FIREBASE_AUTH_PERSISTENCE`
2. A global object exposed at runtime as `window.__FIREBASE_CONFIG__` containing an `options` object (with the same keys as above) and optional `auth`/`emulators` sections.
3. A JSON document served from `VSCODE_EDU_FIREBASE_CONFIG_URL` (defaults to `/config/firebase.json`).

The `AuthPanel` UI in `browser/auth/authUi.ts` demonstrates how to wire the `AuthManager` to a login form, provider buttons, and sign-out control. The `AuthManager` ensures Firebase persistence is configured for the browser and that sign-in state flows through route guards and protected features.
