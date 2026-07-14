# MEGA-BYTES — Deep Recon Report (read-only audit)

**Date:** 2026-07-14
**Method:** Full pass over backend (`server.js`, all of `src/`), scripts, all root docs, frontend (`megabytes-frontend/` app, components, services, hooks, config, constants, build configs). Wiring verified by require/import cross-reference; frontend verified by full `tsc --noEmit` + eslint run; backend syntax-checked file-by-file. No files were modified.
**Companions:** `AUDIT.md` (security/testing/infra priorities), `GAME_IMPROVEMENTS.md` (design suggestions). This report focuses on *is-it-actually-wired* and *docs-vs-reality*; overlapping security items are cross-referenced, not repeated.

---

## 1. Executive summary — health by subsystem

| Subsystem | Files | State | ~Complete | Notes |
|---|---|---|---|---|
| Core care loop (needs/decay/sync/care/sleep/hazards) | `routes/byte.js` + 10 engines | **Working, wired** | 90% | Deepest, best-commented code in repo. Main risks: file size (2,353 lines), ungated kill switch (§2.4) |
| Battle system | `routes/battle.js`, `battleEngine`, `aiDecision`, `matchmakingEngine` | Working, wired | 85% | `runBattle` wired; tick-level exports unused (§4.2) |
| Economy (earn/spend/balance) | `routes/economy.js`, `economyEngine` | **Wired but exploitable** | 70% | Client-trusted amounts, negative-spend mint — see AUDIT.md P0.4–P0.6 |
| Shop / inventory | `routes/shop.js` | Working | 85% | Non-atomic currency (AUDIT P0.6); BOM char in file |
| Marketplace / auctions | `routes/marketplace.js` | Working with hazards | 75% | Settlement only runs on GET (AUDIT P1.8/P1.9); bid race |
| Decor system | `routes/decor.js`, `decorCatalog` | **BROKEN** | 0% functional | Equip/unequip always 403 — wrong schema field (§2.1) |
| Arcade minigames (server reward) | `routes/byte.js` arcade-reward | **Half-broken** | 60% | Mood/affection apply; currency never credits — wrong schema field, failure swallowed (§2.2) |
| Campaign / story | `routes/campaign.js` | **Stub** | 25% | Only node 1 exists; rewards hardcoded to 0; 6 unresolved TODOs; leaderboard endpoint unreachable (§2.3) |
| Community events | `routes/communityEvent.js` | **Stub** | 30% | Contribution tracking is an admitted no-op; item rewards never granted (§2.6) |
| Pageants | `routes/pageant.js`, `pageantEngine` | Working, wired | 90% | Spec reference points at a doc that isn't in the repo (§3.3) |
| Onboarding | `routes/onboarding.js`, `onboardingStages` | Working | 85% | No auth middleware (§2.5) |
| Achievements | `routes/achievements.js`, `achievementChecker` | Working-ish | 70% | `unlockedAt` is fabricated (§2.7); no auth middleware |
| Inbox / deliveries | `routes/inbox.js` | Working | 85% | Claim path is properly atomic (best-written route); GET has a write side effect |
| Rooms | `routes/rooms.js` | Working | 85% | `/enter` assumes `behaviorMetrics` exists; BOM char |
| Auth | `middleware/auth.js`, `routes/player.js` | Wired but **not consumed** | 40% | `req.auth` set and never read anywhere; 4 route files skip auth entirely (§2.5, AUDIT P0.2) |
| Tick service | `services/needTickService.js` | Working | 80% | `stop()` exported, never called — no graceful shutdown (AUDIT P2.5) |
| Frontend app (Expo) | `app/`, `components/`, `services/` | Working | 80% | **28 TypeScript errors** (§2.8); no auth/account layer (AUDIT P0.1) |
| Frontend↔backend contract | `services/api.js` (70 exports) | Mostly aligned | 85% | One endpoint calls a dead route (§2.3); hardcoded IDs |
| Training drills (EX1) | `components/minigames/drills/` | Intentionally frozen | n/a | Documented freeze with re-wire notes — not dead code |
| Docs | README/WIRING_GUIDE/DEPLOY_RENDER | **Drifted** | 60% | Wrong env var name, phantom engines, missing referenced docs (§3) |

**Overall:** the care loop — the heart of the game — is in genuinely good shape. The failures cluster in (a) one repeated schema-field bug (`byte.playerId` vs `byte.ownerId`) that silently breaks two features, (b) systems scaffolded but never finished (campaign, community events), and (c) docs that describe a codebase two refactors ago.

---

## 2. Critical issues (broken / non-functional)

### 2.1 Decor equip/unequip is 100% broken — wrong schema field
- **Files:** `src/routes/decor.js:57` (equip), `src/routes/decor.js:105` (unequip)
- **What's wrong:** Ownership check is `String(byte.playerId) !== String(player._id)`. The Byte schema (`src/models/Byte.js:93`) has **`ownerId`**, not `playerId`. `byte.playerId` is always `undefined`, so the check always fails → **403 "Byte does not belong to player" on every equip/unequip call**, for the legitimate owner.
- **Should be (per docs):** decor.js's own header says equip "Adds itemId to byte.decorItems" for the owning player.
- **Fix direction:** replace both occurrences with `byte.ownerId`. Then verify end-to-end: buy decor on marketplace → claim from inbox → equip. Note the *rest* of the pipeline (catalog, `getActiveDecorEffects` consumed in `byte.js` snapshot, RoomScene rendering) is wired and waiting — this one comparison bricks the feature.

### 2.2 Arcade winnings never credit the player — same bug, swallowed
- **File:** `src/routes/byte.js:2321`
- **What's wrong:** `const player = await Player.findById(byte.playerId);` → `undefined` → `findById(undefined)` returns null → the `if (player)` block silently skips → **`paidBits` are reported in the response but never added to `player.byteBits`**. The surrounding try/catch (byte.js:2318–2330) logs and continues, so nothing surfaces. Mood/affection changes DO apply, masking the failure.
- **Fix direction:** `byte.ownerId`. Then grep-audit: these are the only two `byte.playerId` sites (`decor.js` ×2, `byte.js:2321`) — everywhere else correctly uses `ownerId`. Add a regression test asserting balance increases after an arcade win.

### 2.3 Campaign leaderboard endpoint is unreachable (route shadowing)
- **File:** `src/routes/campaign.js` — `GET /leaderboard` (~line 148) is declared **after** `GET /:byteId` (line 9)
- **What's wrong:** Express matches in declaration order, so `/api/campaign/leaderboard` hits the `/:byteId` handler, which runs `Campaign.findOne({ byteId: 'leaderboard' })` → Mongoose CastError → **500 on every call**. The frontend calls it: `megabytes-frontend/services/api.js:243` (`getCampaignLeaderboard`).
- **Fix direction:** move the `/leaderboard` (and `/:byteId/stats`, which is safe but same family) declarations above `GET /:byteId`. General rule for every router in this repo: static paths before param paths.

### 2.4 Any client can kill any byte instantly — ungated force-death
- **File:** `src/routes/byte.js:1635` (`POST /:id/die`), force path ~line 1706
- **What's wrong:** The handler honors `req.body.force === true` ("Use force:true to override **in tests**") and `req.body.deathType === 'oldage'` from *any* caller — no `requireDevMode`, no ownership check. Combined with open auth, anyone with a byte ID can permanently kill it (neglect path: no legacy egg — total loss).
- **Fix direction:** gate `force` behind `requireDevMode` (move to the `/dev/` family like the other test hooks); make `deathType: 'oldage'` server-verified (`byte.level >= DEATH_LEVEL` is already checked — drop the client override); add ownership check.

### 2.5 Four route files have no auth middleware at all
- **Files:** `src/routes/achievements.js`, `src/routes/campaign.js`, `src/routes/communityEvent.js`, `src/routes/onboarding.js` (none import `optionalAuth`)
- **What's wrong:** Even after `AUTH_REQUIRED=true` is flipped on (AUDIT P0.3), these four remain fully unauthenticated. `POST /api/achievements/:achievementId/unlock` takes a bare `playerId` in the body — free achievement grants; `POST /api/community-event/:eventId/claim` pays out `byteBits` on a client-supplied `playerContribution`.
- **Fix direction:** `router.use(optionalAuth)` in all four, then ownership checks per AUDIT P0.2. The community-event claim also needs server-side contribution tracking before it can be trusted at all (§2.6).

### 2.6 Community events: contribution system doesn't exist
- **Files:** `src/routes/communityEvent.js:78` (claim gate), `:107–121` (`POST /contribute` — self-described "placeholder... Currently does nothing"), `:91` (item rewards: "TODO: Add items to player inventory" — **items are silently never granted**)
- **What's wrong vs docs:** the route surface implies a working community-goal system; in reality progress can only move via direct DB edits, the claim gate trusts a client-sent `playerContribution`, and item rewards vanish.
- **Fix direction:** either (a) finish it — hook contribution increments into battle/campaign completion, track per-player contribution in a subdocument, grant items via the inbox-attachment pipeline (which already works, see `inbox.js` claim); or (b) hide the feature from the client until then. The events tab exists in the app (`app/(tabs)/events.tsx`), so today players can see events they can't meaningfully participate in.

### 2.7 Campaign completion is hollow
- **File:** `src/routes/campaign.js:99–104` (six TODOs: grade validation, XP/reward calc, node history, city liberation, challenge mode, progression), `:137` (`reward: { xp: 0, byteBits: 0, items: [] } // TODO`)
- **What's wrong:** node-1-only is a deliberate TEMP gate (`:66–69`, fine), but `POST /:byteId/node/:nodeId/complete` accepts **any** nodeId — you can "complete" node 50 without starting it, inflating `nodesCompleted`/`highestNodeReached` (the leaderboard metric). Rewards are always zero, so the story tab (`app/(tabs)/story.tsx`, 397 lines, fully built) pays nothing.
- **Fix direction:** validate `nodeId` against `currentNode`/the same gate as `/start`; compute rewards from the node config already returned by `/start`; award via the economy engine's capped-income path.
- **Related fake data:** `src/routes/achievements.js:31` — player achievement progress reports `unlockedAt: new Date()` (i.e., "now") for every unlocked achievement because unlock timestamps are never stored. Either store `{ id, unlockedAt }` pairs on the player or return `null`.

### 2.8 Frontend does not typecheck — 28 errors in `tsc --noEmit`
Not cosmetic; several are latent runtime bugs. Full list reproducible with `cd megabytes-frontend && npx tsc --noEmit`. Highlights:
- `app/(tabs)/index.tsx:1770, 1861` — style object uses `bottom: string` where React Native needs a `DimensionValue`; percentage strings must be typed as such or this can misrender.
- `components/RoomScene.tsx:143, 400, 434` — `null` passed to a state setter typed `'default' | 'purge' | 'stabilize' | undefined`; `:281` number into a `0|1|2` setter; `:352–354` property access on `{}` (hazard/item modal will show `undefined` fields).
- `components/AgedByteRender.tsx:61` — `pointerEvents` prop passed to `Image` (not a valid prop; RN silently ignores it, meaning the intended tap-through behavior may not be happening).
- `app/(tabs)/achievements-sheet.tsx:128` — references `styles.bottomSpacer`, which doesn't exist in the stylesheet → style is `undefined` at runtime (spacer renders unstyled).
- `app/campaign/_layout.tsx:5` — `animationEnabled` is not a valid native-stack option (ignored at runtime; the intended animation suppression isn't happening).
- `services/byteThoughts.ts:478–560` — a block of implicit-`any`/index errors; also has a BOM and an unused `RESOLVER_TONE_PRIORITY` (eslint).
- **Fix direction:** burn the list down to zero, then add `tsc --noEmit` to CI (AUDIT P2.2) so it stays at zero. eslint is already clean (7 warnings, 0 errors).

### 2.9 Carried from AUDIT.md (still open, listed for completeness)
Economy client-trusted `amount` + negative-spend mint + non-atomic currency (P0.4–P0.6); no ownership checks anywhere `req.auth` (P0.2 — confirmed: **zero** reads of `req.auth` in `src/routes/`); auth off by default (P0.3); marketplace settlement only on GET (P1.8/P1.9); no account system in the app (P0.1).

---

## 3. Drift issues (docs vs code)

### 3.1 README setup instructions produce a broken server
- **File:** `README.MD:23` — "Create a `.env` with **`MONGO_URI`**, `JWT_SECRET`..."
- **Reality:** `src/config/db.js:5` reads **`MONGODB_URI`**. Following the README verbatim → `mongoose.connect(undefined)` → `process.exit(1)` on boot.
- Also: `.env.example` lists only `MONGODB_URI`/`PORT`/`NODE_ENV` — missing `JWT_SECRET`, `AUTH_REQUIRED`, `DEV_MODE`, `DEV_MODE_KEY` which the code reads. `DEPLOY_RENDER.md:5` likewise omits `JWT_SECRET`/`AUTH_REQUIRED`. `render.yaml` declares only `NODE_ENV` + `MONGODB_URI`.
- **Fix direction:** standardize on `MONGODB_URI` everywhere in prose; make `.env.example`, `DEPLOY_RENDER.md`, and `render.yaml` list the full env surface (values `sync: false`).

### 3.2 WIRING_GUIDE.md describes a codebase that no longer exists
- **File:** `WIRING_GUIDE.md` (all 211 lines)
- **Mismatches:**
  - Instructs importing `../engine/decorSystem` and `../engine/dailyCareGuideEngine` — **neither file exists** (decor lives in `data/decorCatalog.js` + `routes/decor.js`; daily care guide became `engine/dailyCareEngine.js`).
  - Instructs *removing* the `corruptionEngine` import — it's imported and actively used (`byte.js:8`, corruption pipeline in `computeLiveByteSnapshot`).
  - Describes routes `POST /:id/feed|clean|play|rest` — the actual implementation is a single `PATCH /:id/care` (byte.js:797).
  - References engine functions that don't exist under those names (`needDecay.getTimingWindow`, `needDecay.applySpamPenalty` as documented) and model fields with typos (`dailyCareSCore`).
  - Ends with "daily guide endpoints (TODO), decor endpoints (TODO)" — both have since shipped.
- **Fix direction:** the guide served its purpose and is now actively misleading (an AI session or collaborator following it would *regress* the codebase). Delete it, or replace with a short "current architecture" doc generated from reality. **This is the single most dangerous doc in the repo** given the AI-assisted workflow visible in commit history.

### 3.3 References to docs that aren't in the repository
- `src/routes/pageant.js:9` — "Spec: docs/CLAUDE.md ..." — there is **no `docs/` directory** in the repo.
- `megabytes-frontend/README.md:3` — "Canonical onboarding docs live in `../AI documents/` (start with `CLAUDE.md`)" — **no `AI documents/` directory** in the repo. These docs evidently live only on the local dev machine (`V:\Voidworks\...` paths appear in the same README). Any fresh clone — including cloud sessions like this one — loses the project's canonical context.
- **Fix direction:** commit the design docs (or a sanitized subset) into the repo, or update the references. For AI-assisted development specifically, a checked-in root `CLAUDE.md` would materially improve every future session.

### 3.4 GDD claims vs implementation
- `README.MD` (GDD section): "All systems are **deterministic** and interconnected" — 20+ `Math.random()` call sites across engines/routes (battle hit rolls, evolution rarity, personality jitter, hazard spawns). Interconnected: yes. Deterministic: no. Not a bug, but the design principle and the code disagree; matters if replay/verification (server-authoritative battles) is ever intended.
- `README.MD` "6 Core Stats: Power, Speed, Defense, Special, Stamina, Accuracy" — matches code, but note the stats/training surface is currently frozen behind EX1 (commit `917d91a`), and the GET /:id sync response intentionally omits `computedStats` (byte.js ~line 420 comment). Doc reader would expect stats to be live.
- Windows-only smoke: `megabytes-frontend/package.json` `smoke:frontend` runs PowerShell (`runSmokeFrontend.ps1`) — dead on any non-Windows machine/CI, though a portable `scripts/smokeFrontend.js` exists right next to it. Point the npm script at the .js version.
- Version drift: `app.json` says `"version": "3.21.0"`, `megabytes-frontend/package.json` says `1.0.0`. EAS uses `appVersionSource: "local"` → app.json wins, but pick one truth.
- `eas.json` production profile configures Android only; README/GDD describe an Android+iOS game. Add the iOS production block (works by default, but explicit beats implicit — see AUDIT.md iOS section).

---

## 4. Dead weight (safe to cut or consciously keep)

### 4.1 Fully orphaned files
- `src/models/Effect.js` — **zero** requires anywhere (effects actually flow through `src/data/effectsRegistry.js`). Safe to delete.
- Expo template leftovers, never imported by any app code: `components/external-link.tsx`, `components/haptic-tab.tsx`, `components/hello-wave.tsx`, `components/parallax-scroll-view.tsx`, `components/ui/collapsible.tsx`. Safe to delete. *(Do **not** delete `components/ui/icon-symbol.ios.tsx` or `hooks/use-color-scheme.web.ts` — they look orphaned to grep but are Metro platform-variant resolutions of their base files.)*

### 4.2 Unused exports (module used, function isn't)
- `src/engine/battleEngine.js`: `resolveTick`, `buildCombatant`, `applyEffect`, `BATTLE_DURATION`, `MERCY_PROC_CHANCE` — only `runBattle` is consumed (`routes/battle.js:114`). Either these are internal (unexport them) or a planned tick-streamed battle API (comment the intent).
- `src/engine/aiDecision.js`: `getUltCompliance`, `TEMPERAMENT_PROFILES` exported, unconsumed externally.
- `src/engine/temperamentEngine.js`: `scoreBehavior`, `ALL_TEMPERAMENTS` unconsumed (only `calcTemperamentScore` is used).
- `src/services/achievementChecker.js`: `resolveValue` unconsumed.
- `src/services/needTickService.js`: `stop()` and `runTick()` exported, never called — `stop` is exactly what the missing SIGTERM handler (AUDIT P2.5) should call. Keep, wire it.

### 4.3 Consciously frozen (keep, don't confuse with dead)
- `components/minigames/drills/*` (7 drills + `primitives/SweetSpotTimer.tsx`) — deliberately unplugged for EX1 with re-wire instructions at `app/minigames/[id].tsx:11–12, 239–240`. Leave in place.
- `deriveFavoriteRoom` removal note at `byte.js:44–46` — data still collected by `behaviorTracker.recordRoomTime` (`rooms.js:/enter`) with no consumer. Fine, but it's write-only data right now; if EX-something won't resurrect it, stop collecting.

### 4.4 Misc
- `typescript@^6.0.3` as a **production dependency** of the plain-JS backend (`package.json`) — unused; remove.
- BOM characters at byte 0 of `src/routes/shop.js`, `src/routes/rooms.js`, `scripts/seedCatalog.js`, `megabytes-frontend/services/byteThoughts.ts` (eslint flags the last). Harmless to Node, trips diff/tooling; strip.
- `services/byteThoughts.ts:353` — `RESOLVER_TONE_PRIORITY` assigned, never used.
- `megabytes-frontend/context/EvolutionContext.tsx:5–6` — duplicate React import lines (eslint warning).

---

## 5. Silent failures & error-swallowing inventory

| Where | Behavior | Verdict |
|---|---|---|
| `byte.js:2318–2330` (arcade credit) | try/catch logs to console, response still reports bits "applied" | **Masking a real bug** (§2.2). After fixing the field, make a credit failure fail the request or at least flag the response. |
| `routes/*.js` global pattern | `catch (err) → 500 {error: err.message}` | Leaks internals (AUDIT P1.1) and converts null-derefs into opaque 500s (AUDIT P1.4) |
| `communityEvent.js:91` | Item rewards: comment says "just log that items should be awarded" — **nothing is even logged**; items silently vanish | Broken promise to the player (§2.6) |
| `achievements.js:31` | Fabricated `unlockedAt` timestamps | Fake data presented as real (§2.7) |
| `marketplace.js` GET /listings | Seeding + settlement writes inside a read endpoint, non-atomic seed check | Concurrency trap (AUDIT P1.8) |
| `inbox.js` GET /:playerId | Seeds a welcome message on first read | Minor: write-in-GET, but idempotent-ish; acceptable |
| `api.js` (frontend) `warmServerIfNeeded` | Best-effort fetch, errors swallowed | Fine — genuinely optional |
| `server.js` `connectDB()` | Fire-and-forget; server accepts traffic before DB is up | Requests 500 during cold start (AUDIT P2.5) |

---

## 6. Per-issue quick index (file:line → action)

| # | Location | Problem | Fix |
|---|---|---|---|
| C1 | `src/routes/decor.js:57,105` | `byte.playerId` undefined → all equips 403 | → `byte.ownerId` |
| C2 | `src/routes/byte.js:2321` | Arcade bits never credited, swallowed | → `byte.ownerId`; surface credit failure |
| C3 | `src/routes/campaign.js` (route order) | `/leaderboard` shadowed by `/:byteId` → 500; called by `api.js:243` | Declare static routes first |
| C4 | `src/routes/byte.js:1635,~1706` | Client `force:true` kills any byte | Dev-gate force; server-verify oldage; ownership check |
| C5 | `achievements/campaign/communityEvent/onboarding.js` | No auth middleware at all | `router.use(optionalAuth)` + ownership |
| C6 | `src/routes/communityEvent.js:78,91,107` | Contribution no-op; item rewards vanish | Finish or hide feature; grant items via inbox pipeline |
| C7 | `src/routes/campaign.js:99–137` | Rewards always 0; any nodeId completable | Validate node; compute rewards from node config |
| C8 | `megabytes-frontend` (28 tsc errors) | See §2.8 list | Fix all; add tsc to CI |
| D1 | `README.MD:23` | `MONGO_URI` ≠ code's `MONGODB_URI` | Correct README; complete `.env.example`/`render.yaml` |
| D2 | `WIRING_GUIDE.md` | Describes nonexistent engines/routes; says to remove a live import | Delete or rewrite |
| D3 | `pageant.js:9`, `megabytes-frontend/README.md:3` | Reference docs not in repo (`docs/CLAUDE.md`, `AI documents/`) | Commit docs or fix refs |
| D4 | `megabytes-frontend/package.json` | `smoke:frontend` is PowerShell-only | Point at `scripts/smokeFrontend.js` |
| D5 | `app.json` 3.21.0 vs `package.json` 1.0.0 | Version drift | Pick one source |
| D6 | `eas.json` | No iOS production block | Add it (see AUDIT iOS section) |
| W1 | `src/models/Effect.js` | Orphaned | Delete |
| W2 | Expo template components (§4.1 list) | Orphaned | Delete (keep `.ios.tsx`/`.web.ts` variants) |
| W3 | backend `package.json` | `typescript` prod dep unused | Remove |
| W4 | 4 files with BOM (§4.4) | Tooling noise | Strip |
| W5 | `needTickService.stop` | Exported, never called | Wire into SIGTERM handler |

---

## 7. Suggested repair order (recon items only — merge with AUDIT.md order)

1. **The two-character fixes with feature-sized payoff:** C1, C2 (`playerId`→`ownerId`), C3 (route order). Three small diffs; decor system, arcade payouts, and campaign leaderboard go from broken → working.
2. **C4 + C5** alongside AUDIT P0.2's ownership middleware (same PR).
3. **D1/D2/D3 doc truth pass** — cheap, and prevents any future session (human or AI) from being misled by WIRING_GUIDE.
4. **C8 typecheck burn-down**, then CI gate.
5. **C6/C7** when campaign/community events come off the back burner — or client-hide them for launch.
6. **Dead-weight sweep (W1–W5)** as a single cleanup commit.
