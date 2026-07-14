# MEGA-BYTES: Battle Pets — Gameplay & Marketability Suggestions

**Date:** 2026-07-14
**Nature:** Opinions and suggestions, big to small, based on a full read of the codebase and general knowledge of the mobile pet-sim / auto-battler market. Companion to `AUDIT.md` (which covers defects — this covers direction).

The core premise is genuinely strong and differentiated: *your care behavior — not a gacha roll — determines what your creature becomes*, wrapped in an "AI-born pets vs corrupted internet slop" theme. Most items below are about surfacing systems that already exist in the code but that a player (or an app-store browser) can't currently see or feel.

---

## BIG — Retention & core loop

### 1. Push notifications are the missing organ of a pet game
There is no `expo-notifications` integration. A digital pet lives or dies on re-engagement: "Hunger is getting low," "your egg is ready to hatch," "you were outbid on Fire Core," "a hazard appeared in the play room." The entire needs/decay system (`gameBalance.js` is explicitly tuned for daily check-ins) currently depends on the player *remembering the app exists*. Local scheduled notifications (computable client-side from decay rates — no server push infra needed) would likely be the single highest-impact retention feature you can ship. Cap at 1–2/day and let players tune them; nagging pets get uninstalled.

### 2. A "while you were away" homecoming recap
`behaviorTracker` already records session gaps, and the sync endpoint already computes elapsed decay. Turn that data into a 5-second recap screen on return: what decayed, what your byte did alone, mood shift, anything that spawned. This converts the *punishment* of decay into a *story*, which is the emotional core of the genre (this is the thing people remember about Tamagotchi). Cheap to build — the numbers are already computed at sync.

### 3. Make byte uniqueness shareable — this is your viral loop
The evolution system (shape → animal → element → features → branch → temperament) means every byte is a visual record of how it was raised. That is the marketing asset. Add a "byte card" share feature: a rendered image (name, generation, stage, stats radar — `StatRadar.tsx` exists — personality, care history badges) exportable to camera roll / share sheet. Player screenshots are free acquisition, and yours are *provably unique*, which is the hook competitors can't copy.

### 4. Async PvP against real players' bytes
`matchmakingEngine` and the auto-battle system already exist; the arena is AI-only. Auto-battlers are ideal for **ghost PvP**: fight a snapshot of another player's byte (no realtime infra, no waiting). Because stats are care-driven, this quietly makes *good pet care* the competitive meta — which is a beautiful loop and a store-page bullet point ("your neglect is their win condition"). Requires the account system (AUDIT P0.1) first.

### 5. Tighten the first 15 minutes
D1 retention is decided in session one. The onboarding flow exists, but make sure session one contains: hatch (or near-hatch) → first care actions → first minigame → **first battle** → first evolution *tease*. If the egg takes hours to hatch in real time, session one is an empty room. Consider an accelerated first egg ("prototype byte") so the full loop is felt immediately, with the real generational system starting on egg two.

### 6. Lean into corruption as identity, not just a fail state
The corruption system (progressive glitch/distortion visuals, clinic repair, `CorruptionAura`) is the most visually distinctive thing in the design — glitch-horror pets are memorable and clip well on social. Ideas: a risky "corrupted branch" evolution path for players who *deliberately* ride high corruption (high stats, unstable behavior); community "purge events" (the `CommunityEvent` model already exists) where everyone fights a corruption surge. Don't let the coolest visual system be something players only ever avoid.

### 7. Surface the generational legacy system
Death → legacy egg → next generation is rare in the genre and the code already supports it (`Generation` model, lifespan engine, legacy pipeline smoke test). Make it visible: a family-tree screen, inherited "heirloom" traits or keepsake items, generation number on the byte card (#3 above). Generational play converts the genre's biggest churn event — pet death — into the reason to keep playing. Market it: "Gen 4 runs in the family."

---

## MEDIUM — Game feel & fairness

### 8. Vacation mode / pet sitter
Decay is tuned for daily care and death is permanent. Real life happens; a player who leaves for a week and returns to a dead byte usually uninstalls rather than restarting. Add a "sitter" (paid-in-soft-currency daycare, or a scheduled vacation toggle with heavily reduced decay and no death). The `softlockEngine` shows you already think about anti-frustration — this is the biggest remaining rage-quit vector.

### 9. Live-ops calendar on the systems you already built
`CommunityEvent`, pageants, leaderboards, daily tasks, and streaks all exist. What's missing is a *schedule*: weekly pageant themes, weekend arcade double-bits, monthly community purge event, seasonal leaderboard resets with cosmetic rewards. A visible calendar ("Pageant: Neon theme, ends Sunday") gives lapsed players a reason dated *this week* to come back. Content cost is low — these are parameter changes on existing systems.

### 10. Monetization: cosmetic-first, and the design already agrees with you
Currently there's one soft currency and no IAP. When you add monetization, the premise ("your byte reflects how you raised it") makes **pay-for-stats poisonous** — it would break the core fantasy and the PvP meta (#4). Safe lanes that fit: decor (catalog exists), aura/particle cosmetics, room themes, byte-card frames (#3), a modest battle-pass on the daily-task/streak systems, and convenience that isn't power (extra loadout slots, sitter time). One well-priced "supporter pack" typically outperforms aggressive currency bundles at this scale — and "no pay-to-win" is itself a marketable claim in this genre.

### 11. Make the six stats legible in battle
Auto-battlers live on *readable causality*. The design doc says needs modify combat stats; make sure the battle UI shows it ("Speed −12% — tired"). If players can't see the care→combat link, your core differentiator is invisible and battles feel random. Post-battle, one line of "why you won/lost" goes a long way.

### 12. Difficulty/economy telemetry before tuning
`gameBalance.js` comments show hand-tuning from personal play ("Skye 2026-04-28: halved across the board…"). That works for one player; it breaks with a thousand. Before launch, instrument the funnel (see #15) so tuning decisions come from cohort data — e.g., what % of bytes die before first evolution, median bits earned/day vs the 500 hard cap.

### 13. Accessibility basics
Element identity is color-coded; add a color-blind-safe mode (patterns/icons alongside palette). Respect system font scaling in stat/need readouts. Haptics are already wired (`expo-haptics`) — add a toggle. These are cheap now, expensive to retrofit, and app-store reviewers increasingly notice.

---

## MEDIUM — Marketability & store readiness

### 14. Store listing assets from the game's actual strengths
The pitch that differentiates you in a crowded genre, in store-copy form: **"No two are alike — your MEGA-BYTE is shaped by how you raise it, not by a gacha."** Screenshots should show: evolution divergence (same egg, three different adults), a battle with the care→stats readout, the glitch-corruption aesthetic, a pageant. A 15–30s preview video of an egg→adult timelapse is the strongest possible asset for this design.

### 15. Add analytics + crash reporting before any marketing spend
There is currently zero telemetry. Minimum viable: Sentry (crashes) + one product-analytics tool (PostHog/Amplitude free tiers) tracking install → hatch → first battle → D1/D7 return. Without this you cannot know if marketing is failing at acquisition or the game is failing at retention — and they have opposite fixes.

### 16. Compliance homework for a pet game (kids will find it)
Cute pet games attract under-13 players regardless of intent. Before store submission you need: a privacy policy URL, Google Play Data Safety + Apple privacy-nutrition forms, an honest content rating questionnaire, and a decision about COPPA posture (age gate, or design as mixed-audience with no behavioral ads). The marketplace/auction system may also trip "simulated gambling" questions on the rating forms — auction mechanics with randomized outcomes get scrutiny; yours are player-bid, which is fine, but answer the questionnaires carefully.

### 17. Build a beta community before launch
Solo/rev-share indie games live on community: a small Discord + open TestFlight/Play internal track turns your first 50 players into testers, tuners (#12), and your launch-day reviewers. Devlog content (the evolution/corruption visuals are made for short-form video) is the zero-budget acquisition channel that actually works for pet games — #indiegame pet content performs reliably on TikTok/Shorts.

### 18. A web demo is nearly free for you
The app already builds for web (`react-native-web`, `expo start --web`, static output configured). A cut-down browser demo (care loop + one minigame) embedded on a landing page converts social traffic that won't install an app on impulse — and gives press/creators a zero-friction way to try it.

---

## SMALL — Quality of life

19. **"Rate us" prompt at emotional peaks** — after an evolution or pageant win, never after a death or loss (`StoreReview` API is built into Expo).
20. **Streak insurance** — one free "streak repair" per month; streak-loss is a known churn trigger and the `streakEngine` already tracks the state.
21. **Inbox as narrative channel** — the `InboxMessage`/marketplace-email system is charming; extend it to letters *from your byte* keyed off `byteThoughts`/temperament. Cheap content, big attachment payoff.
22. **Byte name generator** — naming friction at hatch is real; offer three themed suggestions (glitchy/cute/elemental) with a reroll.
23. **Photo mode in rooms** — poses + decor + filters; feeds the share loop (#3) with zero systemic cost.
24. **Sound/music toggles per channel** (SFX vs music) in settings; `sfx.ts` is already layered so the plumbing is close.
25. **Onboarding skip for gen-2+** — veterans re-rolling a legacy egg shouldn't re-see the tutorial.
26. **App Store keyword pass** — "virtual pet," "digital pet," "auto battler," "tamagotchi-like" are the search terms that matter; make sure the subtitle/short-description uses them naturally.

---

## If I had to pick five

1. Push notifications (#1) — retention floor.
2. Account system + async ghost PvP (#4, with AUDIT P0.1) — turns a toy into a game.
3. Shareable byte cards (#3) — free acquisition engine.
4. Vacation mode (#8) — closes the biggest uninstall trapdoor.
5. Analytics + crash reporting (#15) — everything else gets easier to decide with data.
