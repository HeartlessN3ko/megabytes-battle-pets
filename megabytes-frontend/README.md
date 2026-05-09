# megabytes-frontend

React Native + Expo. Part of the MEGA-BYTES monorepo. Canonical onboarding docs live in `../AI documents/` (start with `CLAUDE.md`).

## Dev

```bash
npm install
npx expo start
```

`npm run smoke:frontend` runs the frontend smoke test.

## Standalone builds (EAS)

Expo Go disconnects after ~8 hours and does not persist state overnight, which makes the 72-hour care loop impossible to playtest. Real devices need a standalone build via [EAS Build](https://docs.expo.dev/eas/).

### One-time setup (per machine / per Expo account)

```powershell
npm install -g eas-cli
eas login
cd V:\Voidworks\Megabytes\megabytes-frontend
eas init                # creates extra.eas.projectId in app.json
```

`eas init` is interactive and links the project to the logged-in Expo account. Run it once. After it succeeds, `app.json` will have `extra.eas.projectId` populated.

### Bundle identifiers

Set in `app.json` (already present):

- `android.package`: `com.voidworks.megabytes`
- `ios.bundleIdentifier`: `com.voidworks.megabytes`

These are **permanent** once the app is published to a store. Change them now if a different reverse-DNS scheme is wanted (e.g. `com.voidworksinteractive.megabytes`).

### Profiles (defined in `eas.json`)

| Profile | Output | Use |
|---------|--------|-----|
| `development` | dev-client APK / IPA | local dev with native modules; pairs with `npx expo start --dev-client` |
| `preview` | release APK (Android) / ad-hoc IPA (iOS) | sideloadable testing build for Skye's phone |
| `preview-sim` | iOS simulator build | desktop iOS testing only |
| `production` | AAB (Android) / archive (iOS) | store submission |

### Build for Skye's phone

**Android (sideload-friendly, no developer account needed):**

```powershell
eas build --profile preview --platform android
```

When the build finishes, EAS prints a URL and a QR. Scan the QR on the device, tap install, allow installs from this source, done. The artifact is also downloadable from `expo.dev` under the project's Builds tab.

**iOS (requires Apple Developer account or device UDID registration via EAS):**

```powershell
eas build --profile preview --platform ios
```

EAS will walk through provisioning. Without an Apple Developer account, route through Android instead.

### Build limits

Free EAS tier has a monthly build cap. Don't burn builds on cosmetic iteration. Build, test for a week, iterate in the dev preview / Expo Go between builds, then build again.

### After install — verification checklist

1. App icon shows as a normal installed app, not as an Expo Go entry.
2. Force-close the app. Reopen. Byte state, needs, corruption all persist.
3. Leave installed overnight. In the morning the byte has aged correctly per real elapsed wall-clock time.

## Versioning

`app.json` `expo.version` is bumped on every push that touches frontend code. See `../AI documents/CLAUDE.md` Build versioning section for the rules.
