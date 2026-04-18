/**
 * XP ENGINE
 * Handles all XP sources: care actions, passive gain, and pattern multipliers.
 */

// ─────────────────────────────────────────────────────────────────
// CARE ACTION XP VALUES
// ─────────────────────────────────────────────────────────────────
const CARE_ACTION_XP = {
  feed: 40,
  clean: 45,
  play: 45,
  rest: 35,
  pet: 25, // cooldown gated, not farmable
};

// ─────────────────────────────────────────────────────────────────
// PASSIVE XP RATES (per minute)
// ─────────────────────────────────────────────────────────────────
const PASSIVE_XP_RATE = 0.45; // per minute when avg needs ≥ 40
// 20% of daily XP target (648 XP/day = 0.45 * 1440)

// Reduced passive if needs declining
const PASSIVE_XP_REDUCED = 0.15; // per minute when avg needs 20–39
const PASSIVE_XP_CRITICAL = 0;   // per minute when avg needs < 20

// ─────────────────────────────────────────────────────────────────
// GRADE MULTIPLIERS (from minigames)
// ─────────────────────────────────────────────────────────────────
const GRADE_XP_MULTIPLIERS = {
  perfect: 1.25,
  good: 1.0,
  ok: 0.85,
  fail: 0.5,
};

// ─────────────────────────────────────────────────────────────────
// LEVEL CURVE
// ─────────────────────────────────────────────────────────────────

/**
 * XP required to reach a level.
 * Sqrt curve: front-loaded (cheap early, expensive late).
 * Level 1: 450 XP, Level 25: 2,250 XP, Level 50: 3,182 XP
 * Total to level 50: ~103,000 XP
 * Cap: level 50 (Phase 3 raises cap when evolution stages 2-6 ship)
 */
function xpRequiredForLevel(level) {
  return Math.round(450 * Math.sqrt(level));
}

/**
 * Calculate cumulative XP needed to reach a specific level from 0.
 */
function cumulativeXpForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += xpRequiredForLevel(i);
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────
// ACTION XP CALCULATION
// ─────────────────────────────────────────────────────────────────

/**
 * Calculate XP gained from a care action.
 * Formula: baseXP * gradeMultiplier * timingMultiplier * spamMultiplier
 *
 * @param {string} action - 'feed' | 'clean' | 'play' | 'rest' | 'pet'
 * @param {string} [grade='good'] - 'perfect' | 'good' | 'ok' | 'fail'
 * @param {number} [timingMult=1.0] - timing window multiplier (0.5–1.0)
 * @param {number} [spamMult=1.0] - spam penalty (0.15–1.0)
 * @returns {number} XP gained
 */
function calculateActionXP(action, grade = 'good', timingMult = 1.0, spamMult = 1.0) {
  const baseXP = CARE_ACTION_XP[action];
  if (baseXP === undefined) throw new Error(`[XPEngine] Unknown action: "${action}"`);

  const gradeMult = GRADE_XP_MULTIPLIERS[grade] || 1.0;
  const xp = Math.round(baseXP * gradeMult * timingMult * spamMult);
  return Math.max(1, xp); // at least 1 XP
}

// ─────────────────────────────────────────────────────────────────
// PASSIVE XP CALCULATION
// ─────────────────────────────────────────────────────────────────

/**
 * Calculate passive XP gain based on time elapsed and need state.
 *
 * @param {number} minutesElapsed - real minutes since last check
 * @param {number} avgNeeds - average need value (0–100)
 * @returns {number} XP gained
 */
function calculatePassiveXP(minutesElapsed, avgNeeds) {
  let rate = PASSIVE_XP_RATE; // default

  if (avgNeeds < 40 && avgNeeds >= 20) {
    rate = PASSIVE_XP_REDUCED;
  } else if (avgNeeds < 20) {
    rate = PASSIVE_XP_CRITICAL;
  }

  return Math.round(rate * minutesElapsed);
}

// ─────────────────────────────────────────────────────────────────
// PATTERN MODIFIERS (applied to total daily XP)
// ─────────────────────────────────────────────────────────────────

/**
 * Apply care pattern multiplier to total XP.
 *
 * @param {number} baseXP - total XP before pattern bonus/penalty
 * @param {string} pattern - 'perfect' | 'good' | 'neutral' | 'poor' | 'neglectful'
 * @returns {number} final XP
 */
function applyPatternMultiplier(baseXP, pattern) {
  const multipliers = {
    perfect: 1.25,
    good: 1.08,
    neutral: 1.0,
    poor: 0.9,
    neglectful: 0.75,
  };

  const mult = multipliers[pattern] || 1.0;
  return Math.round(baseXP * mult);
}

// ─────────────────────────────────────────────────────────────────
// LEVEL UP LOGIC
// ─────────────────────────────────────────────────────────────────

/**
 * Apply XP gain and handle level ups.
 * Returns updated { level, xp } and number of levels gained.
 *
 * @param {number} currentLevel - current level (1–100)
 * @param {number} currentXP - current XP in current level
 * @param {number} xpGain - XP to add
 * @returns {Object} { level, xp, levelsGained }
 */
const LEVEL_CAP = 50; // Phase 3 raises cap when evo stages 2-6 ship

function applyXPGain(currentLevel, currentXP, xpGain) {
  if (currentLevel >= LEVEL_CAP) {
    return { level: LEVEL_CAP, xp: currentXP, levelsGained: 0 };
  }

  let level = currentLevel;
  let xp = currentXP + xpGain;
  let levelsGained = 0;

  while (xp >= xpRequiredForLevel(level) && level < LEVEL_CAP) {
    xp -= xpRequiredForLevel(level);
    level++;
    levelsGained++;
  }

  if (level >= LEVEL_CAP) {
    level = LEVEL_CAP;
    xp = 0;
  }

  return { level, xp, levelsGained };
}

/**
 * Get progress to next level (0–100%).
 *
 * @param {number} level
 * @param {number} xp - current XP in this level
 * @returns {number} 0–100
 */
function getProgressToNextLevel(level, xp) {
  if (level >= LEVEL_CAP) return 100;

  const required = xpRequiredForLevel(level);
  return Math.round((xp / required) * 100);
}

module.exports = {
  CARE_ACTION_XP,
  PASSIVE_XP_RATE,
  GRADE_XP_MULTIPLIERS,
  LEVEL_CAP,
  xpRequiredForLevel,
  cumulativeXpForLevel,
  calculateActionXP,
  calculatePassiveXP,
  applyPatternMultiplier,
  applyXPGain,
  getProgressToNextLevel,
};
