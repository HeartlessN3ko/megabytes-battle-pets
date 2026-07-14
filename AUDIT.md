# MEGA-BYTES: Battle Pets — Repository Audit

**Date:** 2026-07-14
**Scope:** Full backend (`src/`, `server.js`) + frontend (`megabytes-frontend/`) sweep, two passes.
**Purpose:** Track everything that needs fixing before public launch, in priority order. Check items off as they land.

---

## How to read this document

- **P0 — Launch blockers.** Exploitable or breaks the product for real users. Fix before any public build.
- **P1 — Pre-launch hardening.** Not exploitable today (solo-dev phase) but must land before strangers have accounts.
- **P2 — Health & scale.** Tech debt, testing, CI, performance. Fix opportunistically; they get more expensive later.
- **P3 — Polish.** Cleanups and nice-to-haves.

Each item lists the file(s) involved and a concrete fix so any future session can pick one up cold.

---

## P0 — Launch blockers

### P0.1 — The app has no account system (biggest migration gap)
**Files:** `megabytes-frontend/services/api.js:9-10`, `megabytes-frontend/app/onboarding/`

The frontend runs on a **hardcoded player and byte ID**:

```js
const PLAYER_ID = process.env.EXPO_PUBLIC_PLAYER_ID || '69d88aea8708c93a264e50f0';
const BYTE_ID   = process.env.EXPO_PUBLIC_BYTE_ID   || '69d88d94770f0c774e9f4808';
```

There is no login or register screen, no auth context, no token storage, and `api.js` never sends an `Authorization` header. Every install of the app would operate on the same shared player document. All of the server-side auth work (P0.2) is moot until this exists.

**Fix:**
1. Add register/login screens (onboarding already has a flow shell to extend).
2. On login, store the JWT + playerId in `expo-secure-store` (not AsyncStorage — it's the token).
3. `api.js`: attach `Authorization: Bearer <token>` to every request; replace `activeIds()` with values from the auth session; add a 401 → logout/re-login path.
4. Delete the hardcoded ID fallbacks entirely — a build without a session should land on the login screen, not someone's pet.

### P0.2 — No ownership checks on any route
**Files:** all of `src/routes/*.js`, `src/middleware/auth.js`

`optionalAuth` verifies the JWT and sets `req.auth.userId`, but **zero routes ever read `req.auth`**. Any authenticated user (or anyone at all while `AUTH_REQUIRED` is unset — see P0.3) can read/modify any player or byte by changing the ID in the URL or body: patch another player's settings, spend their currency, scold their pet, reset their byte.

**Fix:** Add middleware:
- `requireOwner` — 403 unless `req.auth.userId === req.params.id` (or the `playerId` in the body).
- `requireByteOwner` — load the byte, 403 unless `byte.playerId` matches `req.auth.userId`; stash the loaded byte on `req` so handlers don't re-fetch.
Apply across every route file. This is the single largest code change in the audit — budget a focused day and land it with tests (P2.1).

### P0.3 — Auth is opt-in; default is wide open
**File:** `src/middleware/auth.js:3-5`

`AUTH_REQUIRED` must be explicitly `"true"` or every endpoint skips auth entirely. A production deploy that forgets one env var ships an open API.

**Fix:** Invert the default — auth on unless `AUTH_REQUIRED=false`. Fail loudly at startup if `JWT_SECRET` is missing while auth is on.

### P0.4 — `/api/economy/earn` trusts a client-supplied amount
**File:** `src/routes/economy.js` (`POST /earn`)

The client sends `{ amount }` and the server credits it, bounded only by the daily income cap. Anyone with the API URL can max their daily cap with one curl per day, forever. Minigame results should never be self-reported as raw currency.

**Fix:** Server-authoritative rewards. The client reports *what happened* (`game`, `outcome`, ideally a server-issued session token from a "start game" call); the server computes the payout from `gameBalance` tables — exactly the pattern `POST /byte/:id/arcade-reward` already uses. Migrate all `/earn` callers to that pattern, then remove the raw-amount path.

### P0.5 — Negative-amount spend mints currency
**File:** `src/routes/economy.js` (`POST /spend`)

`amount` is never validated. With `amount = -1000`: the balance check `byteBits < -1000` passes, then `byteBits -= -1000` **adds** 1000. Same class of bug risk anywhere a body-supplied number feeds arithmetic.

**Fix:** Validate `Number.isInteger(amount) && amount > 0` (and an upper bound) on `/spend` and `/earn`. Marketplace `/bid` already does this correctly — copy that guard. Better: a shared `validatePositiveInt()` helper or zod schemas (P1.2).

### P0.6 — Non-atomic currency mutations (race → duplication)
**Files:** `src/routes/economy.js`, `src/routes/shop.js` (`POST /buy/item`), `src/routes/marketplace.js` (`POST /bid`)

All currency flows are read-modify-write on a loaded document. Two concurrent requests both read `byteBits: 100`, both pass the balance check, both save — double-spend or double-earn. Marketplace bidding additionally refunds the previous leader with `$inc` *before* the listing save; if that save then fails, the refund persists and the listing state doesn't → free money.

**Fix:** Use atomic conditional updates for currency:
```js
const r = await Player.updateOne(
  { _id: playerId, byteBits: { $gte: cost } },
  { $inc: { byteBits: -cost } }
);
if (r.modifiedCount === 0) return res.status(400).json({ error: 'Insufficient byte.bits' });
```
For multi-document flows (bid = refund + charge + listing update), use a Mongoose session/transaction (Atlas supports them), or restructure so a single conditional update is the commit point.

---

## P1 — Pre-launch hardening

### P1.1 — Error responses leak internals
**Files:** nearly every route (`res.status(500).json({ error: err.message })`)

Mongo/Mongoose errors (duplicate keys, cast errors, connection strings in some driver messages) go straight to the client.

**Fix:** One Express error-handling middleware; routes call `next(err)`. Log the full error server-side, return `{ error: 'Internal server error' }` (plus a request ID) to clients. Keep 4xx messages hand-written.

### P1.2 — No input validation layer
**Files:** all routes; worst offenders `src/routes/player.js` (`/register` accepts empty password; `PATCH /:id/settings` writes `req.body` wholesale into `settings`)

**Fix:** Add `zod` (or `express-validator`) schemas per route: username/email/password rules on register, explicit allowed keys on settings patch, integer bounds on every numeric field. Reject unknown keys.

### P1.3 — Login user-enumeration + no brute-force limiter
**File:** `src/routes/player.js` (`/login` returns 404 "Player not found" vs 401 "Invalid credentials")

**Fix:** Return 401 with the same message for both cases. Add a strict `express-rate-limit` bucket on `/login` and `/register` (e.g. 10/15min/IP) — the global 2000/15min limiter is no protection here.

### P1.4 — Null-dereference 500s on missing documents
**Files:** `src/routes/player.js` (`/:id/currency`, `/:id/settings`), `src/routes/economy.js` (`/daily-status/:playerId`), and similar spots elsewhere

Handlers use `player.field` without a null check → unknown ID = 500 instead of 404, and an invalid ObjectId = 500 CastError.

**Fix:** Null-check after every `findById` → 404. Add a tiny `validateObjectId` param middleware so bad IDs 400 early.

### P1.5 — CORS wide open, JWT 30-day with no revocation
**Files:** `server.js` (`app.use(cors())`), `src/routes/player.js` (`expiresIn: '30d'`)

Acceptable now. Before launch: CORS allowlist for web builds (native apps don't need CORS), shorter access tokens + refresh flow (or at minimum a `tokenVersion` field on Player so you can invalidate all sessions).

### P1.6 — Dev surface shipping in production builds
**Files:** `megabytes-frontend/app/dev-menu.tsx`, `src/routes/byte.js` dev endpoints, `requireDevMode`

Server-side gating (`DEV_MODE` unset → 403) is correct. But the dev-menu screen and its API bindings still ship in the app bundle, and `DEV_MODE_KEY` is optional. **Fix:** exclude the route in production builds (`__DEV__` guard around the route registration or `expo-router` group), and make `DEV_MODE_KEY` mandatory whenever `DEV_MODE=1` on a deployed server.

### P1.7 — Home-network artifacts in shipped code
**Files:** `server.js:2` (hardcoded Comcast/Cloudflare DNS servers), `megabytes-frontend/services/api.js:4` (`http://10.0.0.45:5000` fallback)

The `dns.setServers` line is a local-ISP workaround running in production on Render. The LAN fallback means an EAS build missing `EXPO_PUBLIC_API_BASE_URL` ships pointing at a living-room IP, and iOS ATS will block plain `http://` anyway.

**Fix:** Gate `dns.setServers` behind `NODE_ENV !== 'production'` (or delete it). In `api.js`, keep the LAN default only when `__DEV__`; in release builds, throw at startup if `EXPO_PUBLIC_API_BASE_URL` is unset. Set the production URL via `eas.json` build-profile `env` so it's baked into every EAS build.

### P1.8 — GET endpoints with heavy write side effects
**File:** `src/routes/marketplace.js` (`GET /listings` runs `ensureSeedListings` + `ensureDecorListings` + `settleExpiredOpenListings` on every call)

Seeding/settlement inside a GET is a concurrency trap (two simultaneous GETs can double-seed — `countDocuments` then `insertMany` is not atomic) and makes list reads slow. **Fix:** move settlement into the existing `needTickService` cadence (or a second interval job), and make seeding a startup/seed-script concern (`scripts/seedCatalog.js` already exists).

### P1.9 — Auction settlement only happens if someone browses
**File:** `src/routes/marketplace.js` (`settleExpiredOpenListings`)

Wins/refunds for expired listings trigger lazily from `GET /listings`. If nobody opens the marketplace, winners never get their delivery email. Same fix as P1.8: settle on a server timer.

---

## P2 — Health, testing, scale

### P2.1 — Zero automated tests
There is no test runner in either package. Two smoke scripts exist; one (`runSmokeFrontend.ps1`) is PowerShell-only. The `src/engine/` directory (~30 modules, ~6k lines) is deterministic game math with no I/O — ideal unit-test targets.

**Plan, in order of payoff:**
1. Add `vitest` to the backend. Unit-test: `economyEngine` (caps/reset math — currency bugs are the #1 thing players find), `battleEngine` (damage/hit/status), `xpEngine` + `evolutionEngine` (progression bugs ruin saves), `needDecay`/`neglectEngine`/`lifespanEngine` (elapsed-time math, timezone/DST edges).
2. Inject randomness: engines call `Math.random()` directly (`battleEngine`, `evolutionEngine`, `personalityEngine`, …). Accept an optional `rng` param defaulting to `Math.random` so tests are deterministic. (Also fix the biased `sort(() => Math.random() - 0.5)` shuffles in `dailyCareEngine.js:43` and `pageantEngine.js:266` with Fisher-Yates while there.)
3. Route/integration tests with `supertest` + `mongodb-memory-server` — first targets: the P0 ownership + currency fixes, so they can't regress.
4. Frontend: unit-test the pure TS helpers (`connect4Engine.ts`, `arcadeRewards.ts`, `minigameRuntime.ts`, `config/tunables.ts`) — no React Native tooling needed.

### P2.2 — No CI
No `.github/` directory. **Fix:** one GitHub Actions workflow: install both packages, run `npm run lint` (backend + frontend), run tests once P2.1 lands. Also replace/duplicate the PowerShell smoke script with a cross-platform Node version so CI can run it.

### P2.3 — `src/routes/byte.js` is 2,353 lines
32 endpoints in one file (care, training, sleep, hazards, dev tools, arcade, daily-care…). **Fix:** split into `byteCare.js`, `byteTraining.js`, `byteLifecycle.js`, `byteDev.js`, `byteArcade.js` mounted under the same prefix. Do this *after* the ownership middleware lands so the split doesn't churn twice.

### P2.4 — `needTickService` scaling + multi-instance hazard
**File:** `src/services/needTickService.js`

Every minute it loads all qualifying bytes and saves changed ones one-by-one. Linear in players; fine now, slow at thousands. More urgent: it runs unconditionally in-process — **two Render instances would double-tick every byte**. **Fix now:** env guard (`ENABLE_TICK_SERVICE`) so only one instance runs it. **Fix later:** `bulkWrite` for saves.

### P2.5 — Graceful shutdown & startup ordering
**File:** `server.js`

`connectDB()` is fire-and-forget — the HTTP server starts accepting requests before Mongo is connected. No `SIGTERM` handling, so Render deploys hard-kill mid-tick. **Fix:** `await connectDB()` before `listen`; on SIGTERM stop the tick service, close the server, disconnect Mongoose.

### P2.6 — Arcade/daily reward caps are per-byte, resets are rolling
**File:** `src/routes/byte.js` (`/arcade-reward`: cap tracked on the byte, reset `now + 24h` rolling)

If players can ever own multiple bytes, the arcade cap multiplies per byte. Rolling resets also drift from the fixed daily reset used by `economyEngine.shouldResetDaily`, so "daily" means two different things in the codebase. **Fix:** track earn caps on the Player, and standardize one daily-reset definition (fixed UTC boundary) shared by both systems.

### P2.7 — Outcome self-reporting in arcade rewards
**File:** `src/routes/byte.js` (`/arcade-reward` trusts `{ game, outcome }`)

Bounded by the daily cap, so lower severity than P0.4 — but the same trust problem. Long-term fix is the same server-issued game-session pattern as P0.4; acceptable to defer until after launch given the cap.

---

## P3 — Polish / cleanups

- **`typescript` listed as a backend production dependency** (`package.json`) in a plain-JS backend, with a version (`^6.0.3`) that doesn't correspond to a stable TS line. Remove it.
- **BOM character** at the start of `src/routes/shop.js` (`﻿const express…`). Harmless but trips some tooling; strip it.
- **`render.yaml` env list is incomplete** — deploys rely on manually-set `JWT_SECRET`, `AUTH_REQUIRED`, `DEV_MODE*`; declare them (`sync: false`) so a fresh deploy can't silently miss one. Same for `.env.example`, which lists only `MONGODB_URI`/`PORT`/`NODE_ENV`.
- **Duplicate rate-limit consideration:** `/health` bypasses the limiter (good); consider also exempting nothing else and lowering the global 2000/15min once real traffic data exists.
- **`eas.json` production profile has no iOS block.** iOS builds work by default, but be explicit (mirrors the Android `app-bundle` entry) and confirm `autoIncrement` covers `buildNumber`.
- **Docs drift risk:** README / WIRING_GUIDE / DEPLOY_RENDER are good — update them when the auth contract changes (P0.1–P0.3), since every documented curl example will need a Bearer token.

---

## iOS build path (no Mac required) — reference

The project is Expo SDK 54 with no checked-in native folders, i.e. a clean **EAS Build** case:

1. Apple Developer Program account ($99/yr) — the only hard requirement.
2. `npx eas build --platform ios --profile production` — compiles on Expo's cloud Macs; EAS creates/manages the distribution cert + provisioning profile (no Xcode/Keychain).
3. `npx eas submit --platform ios` — uploads to App Store Connect / TestFlight from any OS.
4. Test on any physical iPhone via TestFlight. (`preview-sim` builds only help someone with a Mac simulator.)

Pre-flight items already flagged above: P1.7 (production API URL baked via `eas.json` env; HTTPS only — ATS blocks `http://`), P1.6 (dev menu out of release builds), and `app.json` iOS `bundleIdentifier` is already set (`com.voidworks.megabytes`).

---

## Suggested execution order

| Step | Items | Why first |
|------|-------|-----------|
| 1 | P0.4, P0.5, P0.6 (economy) | Small, self-contained, worst exploits |
| 2 | P0.2 + P0.3 (ownership + auth default) | Largest change; unblocks everything auth-shaped |
| 3 | P0.1 (app login flow) | Client half of step 2; required for any real multi-user testing |
| 4 | P2.1 tests + P2.2 CI | Lock in steps 1–3 against regression |
| 5 | P1.x hardening batch | Mechanical once validation/error middleware exist |
| 6 | P2.3–P2.7, P3 | Ongoing health |
