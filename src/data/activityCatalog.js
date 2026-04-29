'use strict';

/**
 * ACTIVITY CATALOG
 *
 * Source of truth for the "byte fakes accessing the internet" misbehavior
 * surface. Each entry is one activity the byte can spawn — a pop-up window
 * appears on the home screen with the activity label, runs for `durationMs`,
 * then resolves with its `sideEffect` if the player let it run to completion.
 *
 * Fired from /sync via `pickActivity`. Bias toward `bad` when misbehaviorChance
 * is high, toward `good` when mood + obedience are both high. Otherwise neutral.
 *
 * Labels here are placeholders meant for ChatGPT to swap with proper flavor
 * text. The schema, weights, and side-effects are the engineering surface.
 *
 * Side-effect kinds:
 *   - 'mood_up'       Mood +N (number in `magnitude`)
 *   - 'mood_down'     Mood -N
 *   - 'special_up'    Special +N (light stat nudge)
 *   - 'social_up'     Social +N
 *   - 'corruption_up' Corruption +N
 *   - 'clutter_spawn' Spawn N pieces of clutter (frontend tick handles render)
 *   - 'hazard_spawn'  Spawn 1 hazard (commit 3 — not yet rendered)
 *   - 'none'          No mechanical effect; pure flavor
 *
 * Resistance:
 *   `tapResistance` = number of forced taps required to close before the
 *   side-effect cancels. Force-closing a 'good' activity is mostly free
 *   (player ended a good thing — small mood-). Force-closing a 'bad'
 *   activity is harder (byte resists) and applies a steeper mood penalty.
 */

const ACTIVITY_CATALOG = [
  // ── GOOD pool ───────────────────────────────────────────────────────────
  {
    id: 'edu_videos',
    kind: 'good',
    label: 'Watching educational videos',
    durationMs: 60_000,
    tapResistance: 1,
    sideEffect: { kind: 'mood_up', magnitude: 6 },
    extraEffect: { kind: 'special_up', magnitude: 1 },
  },
  {
    id: 'tutorial_browsing',
    kind: 'good',
    label: 'Reading code documentation',
    durationMs: 50_000,
    tapResistance: 1,
    sideEffect: { kind: 'special_up', magnitude: 2 },
  },
  {
    id: 'wholesome_streams',
    kind: 'good',
    label: 'Watching uplifting streams',
    durationMs: 55_000,
    tapResistance: 1,
    sideEffect: { kind: 'mood_up', magnitude: 5 },
    extraEffect: { kind: 'social_up', magnitude: 4 },
  },

  // ── NEUTRAL pool ────────────────────────────────────────────────────────
  {
    id: 'meme_scrolling',
    kind: 'neutral',
    label: 'Scrolling memes',
    durationMs: 45_000,
    tapResistance: 2,
    sideEffect: { kind: 'none' },
  },
  {
    id: 'idle_browsing',
    kind: 'neutral',
    label: 'Browsing aimlessly',
    durationMs: 40_000,
    tapResistance: 2,
    sideEffect: { kind: 'none' },
  },

  // ── BAD pool ────────────────────────────────────────────────────────────
  {
    id: 'suspicious_sites',
    kind: 'bad',
    label: 'Browsing suspicious websites',
    durationMs: 50_000,
    tapResistance: 3,
    sideEffect: { kind: 'corruption_up', magnitude: 4 },
    extraEffect: { kind: 'clutter_spawn', magnitude: 1 },
  },
  {
    id: 'weird_downloads',
    kind: 'bad',
    label: 'Downloading weird programs',
    durationMs: 60_000,
    tapResistance: 3,
    sideEffect: { kind: 'hazard_spawn', magnitude: 1 },
    extraEffect: { kind: 'corruption_up', magnitude: 2 },
  },
  {
    id: 'pirate_streams',
    kind: 'bad',
    label: 'Streaming pirated content',
    durationMs: 55_000,
    tapResistance: 2,
    sideEffect: { kind: 'corruption_up', magnitude: 2 },
  },
  {
    id: 'dark_forums',
    kind: 'bad',
    label: 'Lurking in dark forums',
    durationMs: 50_000,
    tapResistance: 3,
    sideEffect: { kind: 'mood_down', magnitude: 4 },
    extraEffect: { kind: 'corruption_up', magnitude: 3 },
  },
];

// Cooldown between activities — keeps them feeling deliberate, not spammy.
const ACTIVITY_COOLDOWN_MS = 3 * 60 * 1000; // 3 min

// Per-sync spawn probability scalars. The actual probability scales with
// the byte's misbehaviorChance (0-1) for the bad bias, and with a derived
// "good signal" (mood + obedience) for the good bias.
const SPAWN_BASE_CHANCE = 0.18;       // base per-eligible-sync
const BAD_BIAS_SCALE    = 0.6;        // misbehaviorChance × scale = bad pool weight
const GOOD_BIAS_SCALE   = 0.5;        // goodSignal × scale = good pool weight

function getActivity(id) {
  return ACTIVITY_CATALOG.find((a) => a.id === id) || null;
}

/**
 * Decide whether to spawn an activity this tick, and if so which one.
 * Returns the catalog entry or null. Pure: no mutation.
 *
 * @param {Object} ctx
 * @param {number} ctx.misbehaviorChance  0-1, from personalityEngine.getModifiers
 * @param {number} ctx.mood               0-100
 * @param {number} ctx.obedience          0-100
 * @param {Date|null} ctx.lastActivityEndedAt  cooldown anchor
 * @param {Date} ctx.now                  current time
 */
function pickActivity(ctx) {
  const {
    misbehaviorChance = 0,
    mood = 50,
    obedience = 50,
    lastActivityEndedAt = null,
    now = new Date(),
  } = ctx;

  // Cooldown gate
  if (lastActivityEndedAt) {
    const since = now.getTime() - new Date(lastActivityEndedAt).getTime();
    if (since < ACTIVITY_COOLDOWN_MS) return null;
  }

  // Roll for spawn at all
  if (Math.random() > SPAWN_BASE_CHANCE) return null;

  // Pool selection. Both biases can be present simultaneously — high mood +
  // high impulse byte sometimes does good, sometimes bad. We weight pools
  // and roll once.
  const goodSignal = Math.max(0, ((mood - 50) / 50) * 0.5 + ((obedience - 50) / 50) * 0.5);
  const badWeight  = misbehaviorChance * BAD_BIAS_SCALE;
  const goodWeight = goodSignal * GOOD_BIAS_SCALE;
  const neutralWeight = 0.25; // floor so neutral always has a shot

  const total = badWeight + goodWeight + neutralWeight;
  if (total <= 0) return null;
  const roll = Math.random() * total;

  let pickKind;
  if (roll < badWeight) pickKind = 'bad';
  else if (roll < badWeight + goodWeight) pickKind = 'good';
  else pickKind = 'neutral';

  const pool = ACTIVITY_CATALOG.filter((a) => a.kind === pickKind);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  ACTIVITY_CATALOG,
  ACTIVITY_COOLDOWN_MS,
  getActivity,
  pickActivity,
};
