/**
 * GAME BALANCE — Single Source of Truth for Tunables
 *
 * ALL VALUES IN HOURS. Scale: 1 (fast, 1 hour) → 168 (slow, 1 week).
 * Change a number here to retune that system. Engines derive rates from these.
 *
 * Semantic:
 *   - NEED_DECAY_HOURS[need]       = hours for need to drain 100 → 0
 *   - CORRUPTION_FULL_HOURS        = hours from 0 → 100 corruption baseline
 *   - CLUTTER_SPAWN_HOURS          = hours between clutter spawns
 *   - POO_SPAWN_HOURS              = hours between poo spawns
 *   - CARE_GAIN_HOURS[action][need]= hours of need-time restored per action
 *   - MINIGAME_GAIN_HOURS[g][need] = hours of need-time restored on minigame win
 *   - ROOM_CARE_FLAT_PERCENT       = flat % of max restored per room use
 *   - ACTION_COOLDOWN_HOURS[action]= hours between uses (0 = no limit)
 */

// ─────────────────────────────────────────────────────────────────
// NEED DECAY
// ─────────────────────────────────────────────────────────────────
const NEED_DECAY_HOURS = {
  Hunger:    16,   // 1–2 meals/day
  Bandwidth: 32,   // one deep rest every 1.5 days
  Hygiene:   28,   // ~1 clean/day
  Fun:       21,
  Social:    40,
  Mood:      40,
};

// ─────────────────────────────────────────────────────────────────
// CORRUPTION
// ─────────────────────────────────────────────────────────────────
// Hours from 0 → 100 corruption if conditions keep accruing.
// Per-minute rate is derived below; existing hygiene/stability modifiers
// in corruptionEngine still scale this.
const CORRUPTION_FULL_HOURS = 110;

// ─────────────────────────────────────────────────────────────────
// CLUTTER / POO SPAWNS
// ─────────────────────────────────────────────────────────────────
const CLUTTER_SPAWN_HOURS = 3;
const POO_SPAWN_HOURS     = 10;

// ─────────────────────────────────────────────────────────────────
// CARE ACTION GAINS (hours of need-time restored)
// ─────────────────────────────────────────────────────────────────
// Example: meal: { Hunger: 7 } means a meal adds 7 hours worth of Hunger.
// Converted to 0–100 points using that need's decay rate.
const CARE_GAIN_HOURS = {
  // Quick / tap actions
  feed:  { Hunger: 4,   Mood: 0.8 },
  clean: { Hygiene: 3.5, Mood: 0.8 },
  rest:  { Bandwidth: 4.5, Mood: 2.8 },
  play:  { Fun: 2.5, Social: 1.5, Mood: 2.4 },
  pet:   { Social: 2, Mood: 1 },

  // Long-form / minigame variants
  meal:            { Hunger: 7, Mood: 2 },
  'perfect-clean': { Hygiene: 11, Mood: 2.4 },
  deep_rest:       { Bandwidth: 14, Mood: 4 },
  deep_play:       { Fun: 6, Social: 4, Mood: 3.6 },
  calm:            { Mood: 9, Social: 3, Bandwidth: 2 },
};

// Flat-point gains for stats that don't have a decay-hours axis (Affection, etc).
// Added directly to CARE_RESTORE_MAP output by careRestoreMap().
const CARE_FLAT_GAINS = {
  pet: { Affection: 10 },
};

// ─────────────────────────────────────────────────────────────────
// ROOM CARE
// ─────────────────────────────────────────────────────────────────
// Flat % of max restored per room use. Does not scale with decay.
const ROOM_CARE_FLAT_PERCENT = 25;

// ─────────────────────────────────────────────────────────────────
// MINIGAME REWARDS
// ─────────────────────────────────────────────────────────────────
const MINIGAME_GAIN_HOURS = {
  rps: { Social: 4, Mood: 4 },
};

// ─────────────────────────────────────────────────────────────────
// ACTION COOLDOWNS
// ─────────────────────────────────────────────────────────────────
// Hours between uses of the same quick action. 0 = unlimited (no spam penalty).
const ACTION_COOLDOWN_HOURS = {
  feed:  0,
  clean: 0,
  rest:  0,
  play:  0,
  pet:   0,
};

// ─────────────────────────────────────────────────────────────────
// HELPERS — convert hour values to engine units
// ─────────────────────────────────────────────────────────────────

/**
 * Per-minute drain rate for a need (0–100 scale).
 * @param {string} need
 * @returns {number}
 */
function decayRatePerMinute(need) {
  const hours = NEED_DECAY_HOURS[need];
  if (!hours || hours <= 0) return 0;
  return 100 / (hours * 60);
}

/**
 * Convert a care action's hour-gain into 0–100 points for the target need.
 * @param {string} action
 * @param {string} need
 * @returns {number} integer points (floored to 0 if undefined)
 */
function careRestorePoints(action, need) {
  const hours = CARE_GAIN_HOURS[action]?.[need] ?? 0;
  if (hours <= 0) return 0;
  const decayH = NEED_DECAY_HOURS[need];
  if (!decayH || decayH <= 0) return 0;
  return Math.round((hours / decayH) * 100);
}

/**
 * Convert a minigame reward's hour-gain into 0–100 points for the target need.
 * @param {string} game
 * @param {string} need
 * @returns {number}
 */
function minigameRestorePoints(game, need) {
  const hours = MINIGAME_GAIN_HOURS[game]?.[need] ?? 0;
  if (hours <= 0) return 0;
  const decayH = NEED_DECAY_HOURS[need];
  if (!decayH || decayH <= 0) return 0;
  return Math.round((hours / decayH) * 100);
}

/**
 * Build a full {need: points} restore map for a care action from CARE_GAIN_HOURS.
 * Used by needDecay.applyCare in place of the old CARE_RESTORE literal table.
 * @param {string} action
 * @returns {Object}
 */
function careRestoreMap(action) {
  // Minigame rewards (e.g. 'rps') use MINIGAME_GAIN_HOURS. Fall back to it
  // when the action isn't in CARE_GAIN_HOURS.
  const hoursMap = CARE_GAIN_HOURS[action] || MINIGAME_GAIN_HOURS[action];
  const flatMap = CARE_FLAT_GAINS[action];
  if (!hoursMap && !flatMap) return null;
  const out = {};
  if (hoursMap) {
    for (const need of Object.keys(hoursMap)) {
      const hours = hoursMap[need];
      const decayH = NEED_DECAY_HOURS[need];
      if (!decayH || decayH <= 0) continue;
      out[need] = Math.round((hours / decayH) * 100);
    }
  }
  if (flatMap) {
    for (const [stat, pts] of Object.entries(flatMap)) {
      out[stat] = (out[stat] || 0) + Number(pts);
    }
  }
  return out;
}

/**
 * Base corruption per-minute accrual rate, before hygiene/stability modifiers.
 * @returns {number}
 */
function corruptionRatePerMinute() {
  return 100 / (CORRUPTION_FULL_HOURS * 60);
}

/**
 * Cooldown in minutes for a quick action. 0 = no limit.
 * @param {string} action
 * @returns {number}
 */
function cooldownMinutes(action) {
  const h = ACTION_COOLDOWN_HOURS[action];
  if (!h || h <= 0) return 0;
  return h * 60;
}

module.exports = {
  // Raw tunables (edit these)
  NEED_DECAY_HOURS,
  CORRUPTION_FULL_HOURS,
  CLUTTER_SPAWN_HOURS,
  POO_SPAWN_HOURS,
  CARE_GAIN_HOURS,
  CARE_FLAT_GAINS,
  ROOM_CARE_FLAT_PERCENT,
  MINIGAME_GAIN_HOURS,
  ACTION_COOLDOWN_HOURS,

  // Helpers (engines call these)
  decayRatePerMinute,
  careRestorePoints,
  careRestoreMap,
  minigameRestorePoints,
  corruptionRatePerMinute,
  cooldownMinutes,
};
