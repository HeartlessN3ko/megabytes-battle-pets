# MD System Implementation Matrix (Demo Build)

Date: 2026-04-14
Owner: Codex + ChaosDesigned
Demo status: 2.0.1
Scope: `V:\Voidworks\scripts\*.md` mapped against current backend/frontend implementation.

## Status Legend
- LIVE: implemented and player-usable in demo flow.
- PARTIAL: scaffolded or simplified, missing full MD behavior.
- PLANNED: spec exists, little/no runtime implementation yet.

## System Matrix
| MD | Current | What Is Live | Missing For Full MD Compliance |
|---|---|---|---|
| `care-mechanics.md` | PARTIAL | Feed/clean/rest/training/social style actions, timed room tasks, needs updates | Full minigame-linked care outcomes, deeper behavior consequences, richer room-specific rule variants |
| `statsystemv1.md` | PARTIAL | Core stats + need modifiers + battle XP/level hooks | Full formula parity, all stat caps/rules surfaced in UI, complete overtraining integrations |
| `overtraining.md` | LIVE | Bandwidth≤0 trigger, spec penalties, severe state at 3 events, recovery at BW≥50 | Player-facing overtraining UI messaging |
| `corruptionstates.md` | LIVE | corruptionEngine.js: spec-compliant gain/decay/tier. Surfaced in home + battle UI. Clinic repair endpoint. | Corruption stat modifiers in battle, AI deviation by tier |
| `softlock.md` | PARTIAL | Softlock engine + default move + recovery patch logic | Full route-level application of all recovery branches + UI messaging coverage |
| `evolutionstats.md` | PARTIAL | Stage progression and persistence in demo | Full stage logic parity, all gates/traits and balancing by spec |
| `effects-temperments-items.md` | PARTIAL | Effects registry + temperament scoring model + item schema support | Full runtime use of all effects/passives/status in battle + UI surfacing |
| `abilities.md` | PARTIAL | Loadout fields exist; demo battle supports basic attacks | Full 54-move roster, element-specific move behavior, full ult system |
| `abilitymovesitems.md` | PARTIAL | Schema supports `teachesMove`; limited catalog items | Full move-teach items, reroll/swap/ult/passive unlock item pipeline |
| `careitems.md` | PARTIAL | Core care items in shop catalog and inventory usage | Full item set parity + balancing + room-context item filtering rules |
| `elementalitems.md` | PLANNED | Minimal elemental placeholders (`fire_core`, `water_core`) | Full infusion/amp/resistance item systems |
| `evolutionitems.md` | PARTIAL | Stage-gate style items exist in catalog | Full evolution item families and conditions |
| `itemforumals.md` | PARTIAL | Item schema and shop catalog baseline | Full master item DB and formula compliance |
| `Battlematching.md` | PARTIAL | Rating engine and battle rating updates | Full matchmaking filters, brackets, and opponent visibility behavior |
| `pagentscoring.md` | PARTIAL | Backend pageant scoring route + rewards | Full leaderboard/result collection and full scoring dimensions |
| `pagentminigamev1.md` | PLANNED | Basic pageant review UI | Full pageant minigame execution + feedback model |
| `marketplace.md` | PARTIAL | Marketplace route + bid/buy-now + inbox delivery | Full economy depth, categories, anti-abuse, listing lifecycle controls |
| `Marketplacedecor.md` | PLANNED | No decor inventory runtime yet | Decor item ownership, placement, room visual application |
| `roomsystem.md` | PARTIAL | Core rooms active + timed tasks | Passive room network and full room family set |
| `notificationv1.md` | PLANNED | Status text and some in-screen messages | Full event notification pipeline and throttling rules |
| `minigames.md` | PARTIAL | 7 room minigames implemented (tap-target, scrub/swipe, trace, match, sequence, timing, rapid-tap, ordered-sequence). Grade pass-through to trainStat live. | Accessibility modes, full scoring parity, pageant minigame |
| `datapersistence.md` | PARTIAL | Persistent player/byte/inventory/evolution data | Account-linking, sync conflict handling, full multi-device flow |
| `lifespandeathcycle.md` | PARTIAL | POST /api/byte/:id/die endpoint live. Generation record + legacy egg pipeline. isDevByte guard. Smoke test written (unverified). | Death trigger automation (scheduled neglect check), full death cycle UX, memorial screen |
| `breeding.md` | PARTIAL | Legacy/inheritance fields exist | Full breeding gameplay flow and egg generation systems |
| `economy.md` | PARTIAL | Currency earn/spend baseline active | Full sink/source balancing and anti-inflation controls |
| `gamesystems.md` | PARTIAL | Tick, needs, battle loop baseline | Full resolution order/timing parity and complete systems integration |
| `assets-animation.md` | PLANNED | Some room/bg assets integrated | Full animation/VFX pipeline and naming/spec enforcement |
| `UIandUX.md` | PARTIAL | Home/rooms/demo UX pass live | Full UX spec parity across all systems/screens |
| `tutorial.md` | PLANNED | Intro bypass for demo mode | Full tutorial flow and progression gates |
| `Achievements.md` | PARTIAL | Static achievements displayed in options | Runtime unlock engine, reward hooks, progress tracking |
| `Petdesignv1.md` | PARTIAL | Shape/element/temperament model hooks exist | Full visual/trait mapping rules and pet identity systems |
| `preformance.md` | PARTIAL | Basic smoke/lint and lightweight UI | Full perf budget instrumentation and regression gates |
| `MegabyteGDD-V1.MD` | PARTIAL | Core demo loop direction aligns | Full product-level parity (campaign, full combat depth, complete content) |

## Current Placeholder Inventory

### Frontend placeholders
- `Story Mode` tab is intentionally placeholder text (`Campaign terminal is under construction`).
- Pageant screen still uses “mock judge mode” behavior and fallback copy.
- Shop fallback mode copy appears when backend is unavailable.
- Battle fallback copy appears when backend result sync fails.

### Backend placeholders
- Battle route uses a temporary AI opponent generator (`Slopitron.exe`).
- Arena opponent filtering is simplified and not full matchmaking behavior.
- Evolution animal assignment currently marked simplified/TBD in engine comments.
- Pageant leaderboard/result persistence marked placeholder/TBD in route comments.
- Marketplace currently auto-seeds placeholder listings.
- Inbox auto-seeds a welcome system message when empty.

### Content placeholders
- Move catalog is not yet at MD target roster size.
- Many item families defined in MDs are not yet present in runtime catalog.
- Full minigame suite is not connected.
- Full tutorial/new-player onboarding flow not connected.

## Sound Cue Backlog (Design Targets)

### Core UI
- UI hover/focus ping: micro feedback on focusable elements.
- UI confirm click: positive confirm on standard actions.
- UI cancel/back: softer descending cue.
- Tab switch: short digital swipe tone.
- Modal open/close: gated whoosh + soft click.
- Notification pop: high-priority message cue.

### Home + Byte Brain
- Byte idle chirp variations by mood.
- Byte thought update cue (very subtle).
- Praise success cue.
- Scold cue.
- Home clean success cue.
- Demo mode enable cue.

### Rooms (program-execution theme)
- Task start (`Executing ...`) cue.
- Task ticking/processing loop bed.
- Task completion success stinger.
- Task fail/error cue.
- Item inventory panel open.
- Item install progress loop.
- Item install success.
- Item install failure.

### Care/Needs States
- Hunger critical alert.
- Hygiene critical alert.
- Mood critical alert.
- Bandwidth critical alert.
- Multi-need crisis alert.
- Recovery patch applied cue.

### Battle (future replacement set)
- Battle enter stinger.
- Round tick pulse.
- Basic attack light hit.
- Heavy attack hit.
- Miss/evade cue.
- Buff applied.
- Debuff applied.
- Status applied.
- Ult charge.
- Ult release.
- Low HP warning.
- Victory stinger.
- Defeat stinger.
- Cheer interaction.
- Taunt interaction.

### Marketplace + Inbox
- Listing feed refresh.
- Bid submit.
- Bid accepted.
- Bid rejected/outbid.
- Buy-now success.
- Delivery queued.
- Inbox mail received.
- Attachment claim success.

### Evolution + Milestones
- Stage-up evolve pulse.
- Temperament lock-in reveal.
- Achievement unlock.
- Daily reward grant.
- Legacy/death memorial tone.

## Missing After "Best Effort Demo" Pass (Reality Check)
These are the largest remaining blocks after current implementation state and cannot be considered complete yet:
- Full move/ult/passive content roster and balancing from `abilities.md`.
- Full item content families and move-teach economy from `abilitymovesitems.md` and `itemforumals.md`.
- Full minigame suite and pageant minigame linkage.
- Full corruption/overtraining/death lifecycle UX loops. (Backend systems LIVE as of 2026-04-14. UX loops remain.)
- Full tutorial onboarding and progression gates.
- Full performance instrumentation against `preformance.md` targets.

## Execution Plan (Recommended Order)
1. Content foundation: move catalog + item master catalog (placeholder-balanced) + loadout validation.
2. Combat integration: hook real moves/effects/ults/passives into battle runtime and UI.
3. Care depth: implement corruption/overtraining/lifecycle player loops with feedback.
4. Minigame + pageant: connect minigame outcomes to care/pageant scoring.
5. Tutorial + notifications + achievement unlock engine.
6. Perf/QA pass and content tuning.

