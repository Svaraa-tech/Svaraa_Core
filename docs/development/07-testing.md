# 7. Testing

## Run

```bash
npm test                 # Jest, watch off by default
npm test -- --ci         # what CI runs
npm test -- news         # one file by name
npm run check            # lint + typecheck + test + i18n:check
```

Setup: `jest-expo` preset, React Native Testing Library, MSW. `jest.config.js` allows 20 s per test (heavy screens time out at 5 s on busy machines).
There are 40 test files in `__tests__/`: auth flow, token refresh, errors, setup (wearer pairing, claim, contacts, drill), chat and history, voice,
music, Spotify, YouTube, one-player rule, news, notes, reminders and alerts, games, i18n, components, routing, and the mock/contract parity.

## What every test starts with

`jest.setup.ts` guarantees **tests use mocks only**, even if your `.env` points at a real server:

- `EXPO_PUBLIC_REAL_AREAS` and `EXPO_PUBLIC_REAL_ENDPOINTS` are cleared.
- `expo-secure-store` is replaced with an in-memory store (with `__reset()`).
- `@/i18n` is loaded.

## Helpers (`test-utils/`)

| Helper                                           | Use                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderApp(ui)` (`render.tsx`)                   | Renders with `SafeAreaProvider` (390x844), a fresh `QueryClient` (no retries) and `ThemeProvider`                                                  |
| `useMockBackend()` (`backend.ts`)                | In `beforeEach`: resets the mock DB and secure store, installs the route-based mock as global `fetch`, records calls, clears session and household |
| `requests`, `calls(path)`                        | Which API calls the app made, and how many times to a path                                                                                         |
| `createWearerHousehold()`, `verifyTestPendant()` | Put the mock server into the state after C1, or after claim + pair                                                                                 |
| `INDIA`                                          | A valid phone number for sign-in tests                                                                                                             |

Minimal screen test:

```tsx
import { screen, userEvent } from '@testing-library/react-native';
import { renderApp } from '@/test-utils/render';
import { useMockBackend } from '@/test-utils/backend';

beforeEach(() => useMockBackend());

it('shows the code screen after sending the number', async () => {
  renderApp(<PhoneVerify />);
  // ... type the number, press Continue, expect the code field
});
```

(Match the style of the nearest existing file, for example `__tests__/phone-verify.test.tsx`.)

## What to test for a feature

1. The service function against the mock (data in, `ApiError` code out for failures).
2. The screen: loading, success, and at least one error from the real code list, in text from `i18n` (not server text).
3. Both languages if the screen has plural or placeholder text (`i18n.test.ts` covers key parity).
4. If you added a mock route: `mocks-parity.test.ts` still passes.
5. Same size buttons in both themes if you add a button-like component (see the `Button` test).

## What is not covered

- No end-to-end tests on a device or in a browser. Maestro is in the plan (FE-17), not set up.
- No tests against the real backend. Try an area against Render by hand using `integration.md`.
- Native modules (Bluetooth, background audio, real push, native Google sign-in, microphone streaming) cannot run in Jest.
- Visual regressions, accessibility audits and performance are manual.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`: `npm ci`, lint, `format:check`, typecheck, `npm test -- --ci`, `i18n:check`, `build:web`.
