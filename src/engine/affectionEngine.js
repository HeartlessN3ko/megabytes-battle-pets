'use strict';

/**
 * affectionEngine.js
 * Manages the Affection stat — a long-term relationship meter (0–100).
 * Spec: affection.MD / CARE_SYSTEM_IMPLEMENTATION.md
 *
 * Affection is stored on the Byte document and mutated in-place.
 * It is NOT recomputed from scratch — it persists and changes over time.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_DECAY_PER_MIN   = -0.025;   // Slow baseline drain

// Neglect multipliers (applied on top of base decay per tick)
const NEGLECT_EXTRA_LOW    = -0.04;    // avgNeeds < 30
const NEGLECT_EXTRA_CRIT   = -0.08;    // avgNeeds < 20 (stacked on top of LOW)

// High-needs passive gain
const HIGH_NEEDS_GAIN_PER_MIN = 0.02;  // avgNeeds >= 75
const HIGH_NEEDS_THRESHOLD    = 75;

// Decay modifier thresholds
const DECAY_BOOST_LOW_THRESHOLD  = 40;  // +25% decay
const DECAY_BOOST_CRIT_THRESHOLD = 25;  // +60% decay
const DECAY_REDUCE_THRESHOLD     = 70;  // -20% decay

// Direct praise
const PRAISE_GAIN_BASE    = 8;
const PRAISE_GAIN_2ND     = 5;   // 2nd within 5 min
const PRAISE_GAIN_3RD     = 3;   // 3rd within 5 min
const PRAISE_GAIN_MIN     = 1;   // 4th+ within 5 min
const PRAISE_COOLDOWN_MS  = 2 * 60 * 1000;   // 2 minutes
const PRAISE_WINDOW_MS    = 5 * 60 * 1000;   // 5-minute diminishing window

// Care action bonuses (only when stat was NOT in waste range >85)
const CARE_BONUS = {
  feed:          2,
  clean:         3,
  play:          4,
  rest_complete: 3
};
const WASTE_RANGE_THRESHOLD = 85;

// Session frequency bonuses (once per 6h)
const SESSION_BONUS_2H  = 5;
const SESSION_BONUS_6H  = 8;
const SESSION_BONUS_12H = 12;
const SESSION_BONUS_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Interrupt penalties
const REST_INTERRUPT_PENALTY = -5;
const PLAY_CANCEL_PENALTY    = -3;

// Overcare/spam penalties
const SPAM_CUTOFF_ZERO  = 3;   // after 3 same-action repeats: gain = 0
const SPAM_CUTOFF_NEG   = 5;   // after 5 repeats: -2 per extra action
const SPAM_PENALTY      = -2;

// Behavior threshold boundaries
const THRESHOLD_BONDED   = 80;
const THRESHOLD_NORMAL   = 50;
const THRESHOLD_DISTANT  = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val) {
  return Math.max(0, Math.min(100, val));
}

function getAverageNeeds(needs) {
  const vals = Object.values(needs);
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
}

function getAffectionTier(affection) {
  if (affection >= THRESHOLD_BONDED) return 'bonded';
  if (affection >= THRESHOLD_NORMAL) return 'normal';
  if (affection >= THRESHOLD_DISTANT) return 'distant';
  return 'detached';
}

// ─── Tick Logic (called every need_tick, deltaTime in minutes) ────────────────

/**
 * Apply per-tick affection changes (decay + passive gains/penalties).
 * Mutates byte.affection in place.
 *
 * @param {Object} byte     - Byte document (plain object or Mongoose doc)
 * @param {number} deltaMin - Elapsed time in minutes since last tick
 * @returns {number} delta applied
 */
function tickAffection(byte, deltaMin) {
  const avg = getAverageNeeds(byte.needs);
  let delta = 0;

  // Base decay with modifiers
  let decayRate = BASE_DECAY_PER_MIN;
  if (avg < DECAY_BOOST_CRIT_THRESHOLD) {
    decayRate *= 1.60;
  } else if (avg < DECAY_BOOST_LOW_THRESHOLD) {
    decayRate *= 1.25;
  } else if (avg >= DECAY_REDUCE_THRESHOLD) {
    decayRate *= 0.80;
  }
  delta += decayRate * deltaMin;

  // Passive high-needs gain
  if (avg >= HIGH_NEEDS_THRESHOLD) {
    delta += HIGH_NEEDS_GAIN_PER_MIN * deltaMin;
  }

  // Neglect penalties (extra decay on top)
  if (avg < 20) {
    delta += (NEGLECT_EXTRA_LOW + NEGLECT_EXTRA_CRIT) * deltaMin;
  } else if (avg < 30) {
    delta += NEGLECT_EXTRA_LOW * deltaMin;
  }

  byte.affection = clamp((byte.affection || 50) + delta);
  return delta;
}

// ─── Action Gains ─────────────────────────────────────────────────────────────

/**
 * Apply affection gain for a care action (feed/clean/play/rest_complete).
 * Checks waste range — no gain if stat was already > 85.
 *
 * @param {Object} byte       - Byte document
 * @param {string} actionType - 'feed' | 'clean' | 'play' | 'rest_complete'
 * @param {number} statBefore - The relevant stat value before the action
 * @returns {number} delta applied (0 if in waste range)
 */
function applyCareBonus(byte, actionType, statBefore) {
  const bonus = CARE_BONUS[actionType];
  if (!bonus) return 0;
  if (statBefore > WASTE_RANGE_THRESHOLD) return 0; // waste range — no affection gain

  // Detached tier: 25% gain reduction (spec: affection.MD)
  const finalBonus = getAffectionTier(byte.affection || 50) === 'detached'
    ? Math.max(0, Math.floor(bonus * 0.75))
    : bonus;

  byte.affection = clamp((byte.affection || 50) + finalBonus);
  return finalBonus;
}

/**
 * Apply direct praise affection with diminishing returns.
 * Reads/writes byte.affectionLastPraiseAt and byte.affectionPraiseCount.
 *
 * @param {Object} byte - Byte document
 * @returns {{ delta: number, blocked: boolean, reason: string|null }}
 */
function applyPraise(byte) {
  const now = Date.now();
  const lastPraise = byte.affectionLastPraiseAt ? new Date(byte.affectionLastPraiseAt).getTime() : 0;

  // 2-minute cooldown check
  if (now - lastPraise < PRAISE_COOLDOWN_MS) {
    return { delta: 0, blocked: true, reason: 'cooldown' };
  }

  // Count praises within the 5-minute window
  const windowStart = now - PRAISE_WINDOW_MS;
  const count = byte.affectionPraiseCount || 0;
  const windowCount = lastPraise > windowStart ? count : 0; // reset if outside window

  let gain;
  if (windowCount === 0) gain = PRAISE_GAIN_BASE;
  else if (windowCount === 1) gain = PRAISE_GAIN_2ND;
  else if (windowCount === 2) gain = PRAISE_GAIN_3RD;
  else gain = PRAISE_GAIN_MIN;

  // Detached tier: 25% gain reduction (spec: affection.MD)
  if (getAffectionTier(byte.affection || 50) === 'detached') {
    gain = Math.max(0, Math.floor(gain * 0.75));
  }

  byte.affection = clamp((byte.affection || 50) + gain);
  byte.affectionLastPraiseAt = new Date(now);
  byte.affectionPraiseCount = windowCount + 1;

  return { delta: gain, blocked: false, reason: null };
}

/**
 * Apply session start affection bonus based on time since last login.
 * Max once per 6 hours.
 *
 * @param {Object} byte - Byte document
 * @returns {number} delta applied (0 if on cooldown)
 */
function applySessionBonus(byte) {
  const now = Date.now();
  const lastLogin = byte.lastLoginAt ? new Date(byte.lastLoginAt).getTime() : 0;
  const gap = now - lastLogin;

  // Cooldown: only one bonus per 6h
  if (gap < SESSION_BONUS_COOLDOWN_MS && lastLogin !== 0) return 0;

  let bonus = 0;
  if (gap >= 12 * 60 * 60 * 1000) bonus = SESSION_BONUS_12H;
  else if (gap >= 6 * 60 * 60 * 1000) bonus = SESSION_BONUS_6H;
  else if (gap >= 2 * 60 * 60 * 1000) bonus = SESSION_BONUS_2H;

  if (bonus > 0) {
    byte.affection = clamp((byte.affection || 50) + bonus);
  }

  byte.lastLoginAt = new Date(now);
  return bonus;
}

// ─── Penalty Functions ────────────────────────────────────────────────────────

function applyRestInterruptPenalty(byte) {
  byte.affection = clamp((byte.affection || 50) + REST_INTERRUPT_PENALTY);
  return REST_INTERRUPT_PENALTY;
}

function applyPlayCancelPenalty(byte) {
  byte.affection = clamp((byte.affection || 50) + PLAY_CANCEL_PENALTY);
  return PLAY_CANCEL_PENALTY;
}

/**
 * Apply spam penalty based on how many consecutive same-action repeats.
 * lastCareActions is an array of recent action IDs (most recent first).
 *
 * @param {Object} byte       - Byte document
 * @param {string} actionType - Current action type
 * @returns {number} penalty applied (0 if not spamming)
 */
function applySpamPenalty(byte, actionType) {
  const history = byte.lastCareActions || [];
  const sameCount = history.filter(a => a === actionType).length;

  if (sameCount >= SPAM_CUTOFF_NEG) {
    byte.affection = clamp((byte.affection || 50) + SPAM_PENALTY);
    return SPAM_PENALTY;
  }
  // Between SPAM_CUTOFF_ZERO and SPAM_CUTOFF_NEG: gain suppressed (handled at call site)
  return 0;
}

/**
 * Returns true if an action's affection gain should be zeroed due to spam.
 */
function isSuppressedBySpam(byte, actionType) {
  const history = byte.lastCareActions || [];
  const sameCount = history.filter(a => a === actionType).length;
  return sameCount >= SPAM_CUTOFF_ZERO;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  tickAffection,
  applyCareBonus,
  applyPraise,
  applySessionBonus,
  applyRestInterruptPenalty,
  applyPlayCancelPenalty,
  applySpamPenalty,
  isSuppressedBySpam,
  getAffectionTier,
  getAverageNeeds,
  // Constants exported for use in routes
  WASTE_RANGE_THRESHOLD,
  SPAM_CUTOFF_ZERO,
  SPAM_CUTOFF_NEG,
};
