# Building the Svaraa Android test APK (EAS)

## What you need

1. **Expo access.** Accept the invite to the `svaraa-pragatis-team` account on expo.dev (project: `svaraa-core`).
2. **The code.** Access to the `svaraa_core` repository, on a branch that includes the `extra.eas.projectId` line in `app.json`.
3. **Node and npm** installed. Nothing else: `eas-cli` runs through `npx`.

## Log in to Expo (pick one)

- **Interactive:** `npx eas-cli login`, then check with `npx eas-cli whoami`.
- **Token (for scripts):** create your own at expo.dev → Account settings → Access tokens, then
  `export EXPO_TOKEN=<your token>`.
  Never share a token in chat or commit it. Everyone creates their own. If a token is ever pasted somewhere, delete it on expo.dev and make a new one.

## Build

From the `svaraa_core` folder:

```bash
npm install
npx eas-cli build -p android --profile preview --non-interactive
```

Takes a few minutes to a few hours depending on the EAS queue. The command prints a build page link when done.
Check a build: `npx eas-cli build:list -p android --limit 3` or `npx eas-cli build:view <build-id>`.

## What the `preview` profile does (see `eas.json`)

- Produces an installable **APK** (not a Play Store bundle).
- Builds for **arm64 only** (`-PreactNativeArchitectures=arm64-v8a`), so the APK is about 50 MB. It won't install on x86 emulators.
- Sets `EXPO_PUBLIC_*` values, which are baked in at build time:
  - `EXPO_PUBLIC_API_URL` / `WS_URL`: the Render dev backend.
  - `EXPO_PUBLIC_REAL_AREAS`: which features use the real backend (auth, chat, news, notes, etc.). Anything not listed uses mock data.
  - `EXPO_PUBLIC_USE_MOCKS=true` is the master switch for the rest.
- Android package name: `ai.svaraa`. The signing key is stored by EAS, so everyone builds with the same one.

**Changing `eas.json` or any env value needs a new build.** An installed APK never picks up changes.

## Features still switched off in code

`config/flags.ts` has hard-coded `reminders: false`, `music: false`, and `pendantTransport: 'simulator'`. These are not controlled by `eas.json`.

## Installing the APK on a phone

Open the build page link on the phone (or scan its QR code), or download the APK from it. Uninstall any older Svaraa build first.
If Google Play Protect says "unsafe app blocked": tap **More details → Install anyway**, or temporarily turn off Play Store → Play Protect → Scan apps. If the install is blocked outright, use USB: `adb install app.apk`.

## Gotchas

- The Render backend sleeps on the free tier; the first request can take 30–60 seconds.
- Source files must be saved before building; EAS uploads what is on disk. Check you're building the code you expect.
- Builds are done in the cloud and use the team's EAS build quota.
- Folder name is `svaraa_core` (lowercase). The CLI can fail after a build with a path error if the folder is opened under a different capitalisation. The build itself is still fine.
