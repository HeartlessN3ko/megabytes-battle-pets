/**
 * FRONTEND TUNABLES
 *
 * Single source of truth for every tweakable visual / interaction / pacing
 * value used by the frontend. Backend tunables (need decay, corruption rates,
 * care gains, cooldowns) live in `megabytes-backend/src/config/gameBalance.js`
 * and are NOT mirrored here — those are server-authoritative.
 *
 * Edit values here, restart, see effect. Component files import via
 * `import { TUNABLES } from '../../config/tunables'` and reference
 * `TUNABLES.home.WAKE_TAP_THRESHOLD` etc. Helpers are exported alongside.
 *
 * Organized top-down by area so a designer can scan the whole tuning
 * surface in one read. Comments explain WHY a value is shaped the way
 * it is so future tweaks are deliberate.
 */

// ─── Home — interaction ─────────────────────────────────────────────────────
const home = {
  /** Taps required to wake a sleeping byte. Was 10 (felt punishing); 3 hits the
   *  "registers intent without being a chore" sweet spot. Swipes count as 2. */
  WAKE_TAP_THRESHOLD: 3,
  /** Total finger movement (px) below this is a tap; above is a swipe.
   *  Tuned for finger-fat tolerance — small accidental moves on a real tap
   *  shouldn't register as a swipe. */
  SWIPE_MOVEMENT_THRESHOLD_PX: 14,

  /** Idle thought bubble cycle length (ms). Status text refreshes inside
   *  this window. Skye 2026-04-27: keep slow — faster feels overwhelming.
   *  Phase 6 (2026-04-28): scaled per-byte by personalityModifiers.expression
   *  (sensitivity-dominant, 0.4–1.6). High-expression bytes hold thoughts
   *  longer; stoic bytes cycle faster. Clamp keeps the timing chain sane. */
  IDLE_THOUGHT_CYCLE_MS: 30_000,
  IDLE_THOUGHT_CYCLE_MIN_MS: 22_000,
  IDLE_THOUGHT_CYCLE_MAX_MS: 45_000,

  /** Random idle sprite variant (wink / lookUp / etc.) cadence range. */
  IDLE_VARIANT_MIN_DELAY_MS: 8_000,
  IDLE_VARIANT_MAX_DELAY_MS: 15_000,
  /** How long a random idle variant sprite stays on screen. */
  IDLE_VARIANT_HOLD_MS: 2_500,

  /** Background data refresh cadence on the home screen. */
  BACKGROUND_SYNC_MS: 60_000,
} as const;

// ─── Home — clutter spawn ───────────────────────────────────────────────────
const clutter = {
  /** Hours between expected ambient clutter spawns at normal hygiene. */
  SPAWN_HOURS: 3,
  /** Spawn-rate multiplier when Hygiene < CLUTTER_DIRTY_HYGIENE_BELOW. */
  DIRTY_MULTIPLIER: 3,
  /** Hygiene threshold (0-100) below which clutter spawns at the dirty rate. */
  DIRTY_HYGIENE_BELOW: 40,
  /** Poll cadence (seconds) for clutter spawn dice rolls. The per-tick
   *  probability is derived so expected time-to-spawn hits SPAWN_HOURS. */
  POLL_SECONDS: 30,
  /** Hard ceiling on simultaneous clutter nodes. */
  MAX_CLUTTER: 8,

  /** ByteBits awarded for tapping a regular trash clutter (range — actual
   *  award is BB_RANGE_MIN + Math.floor(Math.random() * (BB_RANGE_MAX - BB_RANGE_MIN + 1))). */
  CLEAN_BB_RANGE_MIN: 2,
  CLEAN_BB_RANGE_MAX: 5,

  /** ByteBits awarded silently when a poop is fully cleaned (final 3rd tap).
   *  Higher than trash because it took 3 taps to clear. No popup — see
   *  POOP_CLEAN_LINES in poop section for the cute flavor popup. */
  POOP_CLEAN_BB_AWARD: 6,
} as const;

// ─── Home — clutter floor zones (where pieces spawn / drop to) ──────────────
// Each zone defines a percentage range for left placement + bottom (% of
// stage height — byte stands at bottom 20% so clutter sits in 19-21%
// to read as "on the floor"). frontChance is the probability the piece
// renders in front of the byte sprite (creates depth).
const clutterZones = [
  { leftMin: 10, leftMax: 22, bottomMin: 19, bottomMax: 21, frontChance: 0.65 },
  { leftMin: 24, leftMax: 36, bottomMin: 19, bottomMax: 21, frontChance: 1.0 },
  { leftMin: 64, leftMax: 76, bottomMin: 19, bottomMax: 21, frontChance: 1.0 },
  { leftMin: 78, leftMax: 90, bottomMin: 19, bottomMax: 21, frontChance: 0.65 },
] as const;

// ─── Home — poop digestion + clean routine ──────────────────────────────────
const poop = {
  /** Hours after a feed until a poop spawns on the floor (real-time). */
  DIGEST_HOURS: 0.025,           // ≈ 90s
  /** Hunger jump (per /sync delta) that triggers digestion timer arming. */
  FEED_DETECT_MIN: 10,
  /** Cute flavor popup pool fired on the final 3rd-tap clean. Pulled
   *  randomly. ChatGPT-owned per AI_PROTOCOL — drop new lines here. */
  CLEAN_LINES: [
    'All clean!',
    'Sparkly!',
    'Spotless.',
    'Tidy.',
    'Looks better!',
    'So fresh.',
  ] as readonly string[],
} as const;

// ─── Home — clutter interaction (Phase 9A + 9B) ─────────────────────────────
const clutterInteraction = {
  /** Cadence for the misbehavior-driven "byte fiddles with clutter" dice roll. */
  POLL_MS: 75_000,
  /** How long the byte plays with the targeted clutter once an interaction fires. */
  DURATION_MS: 6_500,
  /** Minimum personalityModifiers.misbehaviorChance required to even roll. */
  TRIGGER_THRESHOLD: 0.4,
  /** Base per-tick chance once gates pass; scaled up by surplus over THRESHOLD. */
  BASE_CHANCE: 0.35,

  /** Outcome roll when the interaction window ends. Cumulative thresholds —
   *  the probabilities (10% / 15% / 25% / 50%) match the comments below.
   *  Skye 2026-04-27: low-friction baseline; multiply/destroy are rare moments. */
  OUTCOME_DESTROY_BELOW:  0.10,        // < 0.10 → destroy (10%)
  OUTCOME_MULTIPLY_BELOW: 0.25,        // 0.10–0.25 → multiply (15%)
  OUTCOME_DROP_BELOW:     0.50,        // 0.25–0.50 → drop (25%)
                                       // 0.50+    → inert (50%)

  /** Wiggle amplitude (degrees) on the targeted clutter while interacting. */
  WIGGLE_AMPLITUDE_DEG: 12,
  /** One half-wiggle period in ms (left-right or right-left). */
  WIGGLE_HALF_PERIOD_MS: 180,
} as const;

// ─── Home — fake-need misbehavior (Phase 5) ─────────────────────────────────
const fakeNeed = {
  /** Cadence to roll the fake-need dice. Independent of misbehavior poll
   *  so the byte's "lies" don't always coincide with the clutter mischief. */
  POLL_MS: 45_000,
  /** How long the false need-emote bubble shows. */
  HOLD_MS: 6_000,
  /** Per-tick chance multiplier (× misbehaviorChance). */
  CHANCE_FACTOR: 0.15,
  /** Don't fake-signal if any real need is below this — would feel doubled-up. */
  REAL_NEED_OVERRIDE_BELOW: 40,
} as const;

// ─── Home — extra clutter creation (Phase 5 misbehavior) ────────────────────
const extraClutter = {
  /** Per-30s-tick chance multiplier (× misbehaviorChance) for an extra
   *  clutter to spawn beyond the regular hygiene-driven roll. At
   *  misbehaviorChance = 1.0: ~5% per 30s ≈ 1 extra clutter per 10 min. */
  CHANCE_FACTOR: 0.05,
} as const;

// ─── Byte sprite — render scale ─────────────────────────────────────────────
const byteRender = {
  /** Sprite container width as fraction of screen width (the visual base
   *  size before stage and stat multipliers). */
  FOOTPRINT_WIDTH_FRACTION: 0.3,
  /** Per-stage native scale. Most stages render at 1.0 (sprite art carries
   *  size); elder withers slightly per Skye 2026-04-26. */
  STAGE_BASE_SCALE: {
    baby:  1.00,
    child: 1.00,
    teen:  1.00,
    adult: 1.00,
    elder: 0.95,
  } as const,
  /** Strength stat → render scale. Multiplier = clamp(0.7, 1.4, 1 + (Strength - 10) × 0.015). */
  STRENGTH_MULT_PER_POINT: 0.015,
  STRENGTH_MULT_MIN: 0.7,
  STRENGTH_MULT_MAX: 1.4,
} as const;

// ─── Byte movement (useByteRoaming defaults) ────────────────────────────────
const byteRoaming = {
  /** Travel duration range for one walk segment. Slowed dramatically
   *  2026-04-26 so the squish-walk GIF frames drive the visual. */
  TRAVEL_MIN_MS: 8_000,
  TRAVEL_MAX_MS: 13_000,
  /** Pause duration range between walks (non-bored byte). */
  PAUSE_MIN_MS: 6_000,
  PAUSE_MAX_MS: 12_000,
  /** Bored byte pace — narrower pause, deliberate edge-walking. */
  BORED_PAUSE_MIN_MS: 3_000,
  BORED_PAUSE_MAX_MS: 5_000,
  /** Min travel distance for a new target as fraction of halfSpread. Lower
   *  values allow small step-overs alongside long crossings. */
  MIN_TRAVEL_FRACTION: 0.15,
  /** Probability that a non-bored byte skips travel and chains another pause.
   *  Breaks the patrol cadence so the byte feels alive, not programmed. */
  SKIP_TRAVEL_CHANCE: 0.5,
  /** Skip-chance flex per unit of personality movement multiplier
   *  (high impulse → skips less). */
  SKIP_TRAVEL_PERSONALITY_FACTOR: 0.4,
  /** Skip-chance clamp range after personality flex. */
  SKIP_TRAVEL_MIN: 0.15,
  SKIP_TRAVEL_MAX: 0.85,

  /** Glance dice during a rest pause. */
  GLANCE_CHANCE: 0.4,
  GLANCE_HOLD_MIN_MS: 1_200,
  GLANCE_HOLD_MAX_MS: 2_000,
  /** Direction weights — must sum to 1.0. lookUp deliberately light so it
   *  reads as a deliberate peek rather than constant ceiling-staring. */
  GLANCE_WEIGHTS: [
    ['look-left',  0.30],
    ['look-right', 0.30],
    ['look-down',  0.25],
    ['look-up',    0.15],
  ] as const,

  /** Threshold (px of dx) for facing direction detection on a new walk. */
  FACING_DETECT_PX: 6,
  /** Personality movement multiplier hard clamp (matches engine's range). */
  MOVEMENT_MULT_MIN: 0.5,
  MOVEMENT_MULT_MAX: 1.5,
} as const;

// ─── Need-request bubble (above the byte) ───────────────────────────────────
const needRequest = {
  /** Base threshold (need value) below which the bubble surfaces. */
  THRESHOLD_BASE: 30,
  /** Threshold clamp after personality demand multiplier scales it. */
  THRESHOLD_MIN: 10,
  THRESHOLD_MAX: 60,
} as const;

// ─── Emote durations (praise + scold reactions) ─────────────────────────────
const emote = {
  /** Default emote hold (ms) before reactionAmplitude scales it. */
  BASE_MS: 2_000,
  /** Hard clamp on the post-amplitude duration so timing chains stay predictable. */
  CLAMP_MIN_MS: 1_500,
  CLAMP_MAX_MS: 3_200,
} as const;

// ─── Fidget overlay (resolver-driven ambient sprite swaps) ──────────────────
const fidget = {
  /** How long an ambient fidget sprite stays on screen. */
  HOLD_MS: 2_500,
  /** Per-second interrupt roll while a fidget is active. Multiplied by the
   *  byte's personalityModifiers.interruptChance (0–1). At chance=0.3 and
   *  scale=0.3, each second rolls 9% — roughly 1 in 5 fidgets gets cut
   *  short for a moderately impulsive byte. Lower this if cuts feel too
   *  frequent; raise to make high-impulse bytes feel more jittery. */
  INTERRUPT_ROLL_SCALE: 0.3,
} as const;

// ─── Wake reactions (tap / praise / scold / natural) ────────────────────────
// When the byte wakes up, a brief sprite override plays so waking is
// visibly different from "byte snaps to idle." Each source has a weighted
// pool so two consecutive scold-wakes don't always look the same. Skye
// 2026-04-28: "should not be so A and B."
const wakeReaction = {
  /** How long the wake-reaction sprite holds on screen before the priority
   *  chain returns to normal. */
  HOLD_MS: 2_500,

  /** Sprite weights per wake source. Sum should be ~1.0 per row. Format:
   *  Array<[spriteKey, weight]>. Weighted random pick on each wake event. */
  POOLS: {
    /** Tap-wake — drowsy / groggy reads. The byte was just poked awake. */
    tap: [
      ['tired',      0.35],
      ['sleepy',     0.30],
      ['confused',   0.15],
      ['blinkBounce', 0.10],
      ['lookUp',     0.10],
    ],
    /** Praise-wake — mostly happy, but sometimes annoyed at being disturbed. */
    praise: [
      ['happyblush', 0.30],
      ['smile',      0.25],
      ['blush',      0.15],
      ['idleHappy',  0.15],
      ['confused',   0.10],
      ['angry',      0.05],
    ],
    /** Scold-wake — mostly hurt / startled, occasionally still groggy. */
    scold: [
      ['cry',        0.30],
      ['angry',      0.30],
      ['xEyes',      0.15],
      ['confused',   0.15],
      ['sleepy',     0.10],
    ],
    /** Natural wake (sync-driven, no explicit player action) — rested feel. */
    natural: [
      ['wink',       0.35],
      ['smile',      0.25],
      ['blinkBounce', 0.20],
      ['lookUp',     0.20],
    ],
  } as Readonly<Record<'tap' | 'praise' | 'scold' | 'natural', ReadonlyArray<readonly [string, number]>>>,
} as const;

// ─── Lifespan / level ──────────────────────────────────────────────────────
const lifespan = {
  /** Hard level cap. Death gate per backend. */
  LEVEL_CAP: 50,
  /** Levels at which the GDD-style evolution gates would fire. v1 uses
   *  lifespan stages instead, but the gate values are exposed for the
   *  StatsModal display. */
  EVOLUTION_GATES: [5, 10, 20, 35, 50, 75] as readonly number[],
} as const;

// ─── Public export ──────────────────────────────────────────────────────────
export const TUNABLES = {
  home,
  clutter,
  clutterZones,
  poop,
  clutterInteraction,
  fakeNeed,
  extraClutter,
  byteRender,
  byteRoaming,
  needRequest,
  emote,
  fidget,
  wakeReaction,
  lifespan,
} as const;

// ─── Derived helpers ────────────────────────────────────────────────────────
// Migrated from the old config/gameBalance.ts. Importers should now pull
// these from tunables.ts directly.

/**
 * Per-tick clutter spawn probability at normal hygiene. Expected-value math:
 * P = pollSeconds / (hours × 3600). Caller passes its poll cadence.
 */
export function clutterSpawnProbability(pollSeconds: number): number {
  return Math.min(1, pollSeconds / (TUNABLES.clutter.SPAWN_HOURS * 3600));
}

/** Per-tick clutter spawn probability when the room is dirty (× DIRTY_MULTIPLIER). */
export function clutterSpawnProbabilityDirty(pollSeconds: number): number {
  return Math.min(1, clutterSpawnProbability(pollSeconds) * TUNABLES.clutter.DIRTY_MULTIPLIER);
}

/** Poop digestion delay in ms. Fed to setPendingPoopAt as an absolute timestamp + this. */
export function poopDigestMs(): number {
  return TUNABLES.poop.DIGEST_HOURS * 3600 * 1000;
}
