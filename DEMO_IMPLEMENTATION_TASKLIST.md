# MEGA-BYTES Demo Implementation Task List

Last updated: 2026-04-13
Demo status: 2.0.1
Goal: make the internal demo fully testable with real system behavior (not placeholders).

## Phase 1: Core Demo Integrity (Now)
- [x] Frontend UI smoke path (`npm run smoke:frontend`)
- [x] Rapid multi-tap transition guards (home + rooms)
- [x] Demo mode activation + persistence + accelerated room timers
- [x] Dynamic demo profile IDs (no hardcoded ID lock in UI logic)
- [x] Backend smoke preflight and end-to-end loop (`npm run smoke:demo`)
- [x] Battle route ordering fix (`/history/:playerId` before `/:id`)
- [x] Match rating progression baseline (win/loss + streak/underdog hooks)
- [x] Deterministic pageant score model (beauty/talent/presence + temperament)

## Phase 2: System-Doc Alignment (High Priority)
- [ ] Achievements engine (39 achievements + challenge rewards)
- [ ] Pageant minigame scoring feed (perfect/good/combo real input from gameplay)
- [ ] Battle matchmaking queue logic (range expansion + level cap + AI timeout fallback)
- [ ] Arena snapshot rewards and login-time sync
- [ ] Passive room effects (2-slot cap, additive only, non-stack same type)
- [ ] Effect cap enforcement in battle runtime (1 status, max 3 effects hard gate)
- [ ] Item distributions and category behavior from item formula docs

## Phase 3: Mid Systems (Demo-Playable, Not Cosmetic-Only)
- [ ] Corruption state behavior + failsafes
- [ ] Overtraining penalties + clinic repair loop
- [ ] Lifecycle/death->legacy egg pipeline (with carry-over move/stat)
- [ ] Notification scheduler (need critical, training cooldown, lifecycle events)
- [ ] Minigame reward diminishing returns tied to daily play count
- [ ] Data backup/rollback hooks for safe test resets

## Phase 4: Deferred Until Core Is Stable
- [ ] Breeding system
- [ ] Marketplace decor and expanded cosmetic marketplace
- [ ] Patreon/supporter plan features
- [ ] Full public playtest mode (separate from internal demo mode)

## Testing Standards Per System
- Add route-level smoke assertion for each implemented system.
- Add one deterministic test case with known expected output.
- Avoid UI placeholder labels for systems marked implemented.
- Keep demo-mode speedups configurable via env.

## Current Demo Focus
1. Playable and trustworthy early loop (care -> room -> battle/pageant -> economy -> inventory).
2. Fast iteration (accelerated timings + deterministic outcomes where possible).
3. No dead-end states (softlock prevention always leaves a valid action path).
