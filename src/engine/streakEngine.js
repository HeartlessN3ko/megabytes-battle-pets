/**
 * STREAK ENGINE
 * Tracks perfect days streak and applies bonuses.
 */

// ─────────────────────────────────────────────────────────────────
// STREAK MILESTONES & BONUSES
// ─────────────────────────────────────────────────────────────────
const STREAK_MILESTONES = {
  3: {
    days: 3,
    growthBonus: 0.05, // +5% growth
    cosmetic: null,
    evolutionBias: 0,
  },
  7: {
    days: 7,
    growthBonus: 0.05,
    cosmetic: 'aura_unlock', // visual aura variant unlock
    evolutionBias: 0,
  },
  14: {
    days: 14,
    growthBonus: 0.05,
    cosmetic: null,
    evolutionBias: 10, // +10% evolution bias weight
  },
  30: {
    days: 30,
    growthBonus: 0.05,
    cosmetic: 'lineage_badge', // special title / memorial ribbon
    evolutionBias: 0,
  },
};

// ─────────────────────────────────────────────────────────────────
// STREAK RULES
// ─────────────────────────────────────────────────────────────────

/**
 * Check if streak should continue or reset.
 *
 * @param {number} dailyScore - today's daily care score (0–100)
 * @param {number} maxCriticalMinutes - longest critical need duration today
 * @returns {Object} { shouldBreak, shouldDowngrade }
 */
function checkStreakBreakCondition(dailyScore, maxCriticalMinutes = 0) {
  const result = {
    shouldBreak: false,
    shouldDowngrade: false, // converts perfect to good, not full reset
  };

  // Streak breaks if daily care score < 75
  if (dailyScore < 75) {
    result.shouldBreak = true;
    return result;
  }

  // Streak breaks if any need remained critical > 60 minutes cumulative
  if (maxCriticalMinutes > 60) {
    result.shouldBreak = true;
    return result;
  }

  return result;
}

/**
 * Apply grace rule: allow 1 "slip day" every 7 days.
 * Converts perfect streak to good streak instead of full reset.
 *
 * @param {number} currentStreak - current perfect days count
 * @param {number} lastSlipDayUsed - days since last grace use (null = unused)
 * @returns {Object} { canUseGrace, daysUntilNextGrace }
 */
function canUseGraceRule(_currentStreak = 0, lastSlipDayUsed = null) {
  if (!lastSlipDayUsed) {
    // Never used grace, can use now
    return { canUseGrace: true, daysUntilNextGrace: 0 };
  }

  const daysSinceGrace = Math.floor((Date.now() - lastSlipDayUsed) / (1000 * 60 * 60 * 24));
  if (daysSinceGrace >= 7) {
    // 7+ days since last use, can use again
    return { canUseGrace: true, daysUntilNextGrace: 0 };
  }

  return {
    canUseGrace: false,
    daysUntilNextGrace: 7 - daysSinceGrace,
  };
}

/**
 * Update streak based on today's score.
 *
 * @param {Object} streakData - { count, lastDate, milestones, lastSlipDayUsed }
 * @param {number} dailyScore - today's care score
 * @param {number} maxCriticalMinutes - longest critical neglect today
 * @returns {Object} updated streak data + milestone info
 */
function updateStreak(streakData = {}, dailyScore = 0, maxCriticalMinutes = 0) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const lastDate = streakData.lastDate || today;

  // Check if this is a new day
  if (lastDate === today) {
    // Already updated today
    return { ...streakData, noUpdate: true };
  }

  // Check break condition
  const { shouldBreak } = checkStreakBreakCondition(dailyScore, maxCriticalMinutes);

  let count = streakData.count || 0;
  let slipDayUsed = null;

  if (shouldBreak) {
    // Try to use grace rule
    const grace = canUseGraceRule(count, streakData.lastSlipDayUsed);
    if (grace.canUseGrace) {
      // Downgrade to good streak (convert current count to "good days")
      count = Math.max(0, count - 1); // lose today but keep streak
      slipDayUsed = Date.now();
    } else {
      // Full reset
      count = 0;
    }
  } else {
    // Perfect day, increment streak
    count++;
  }

  // Check for milestones
  const milestoneReached = Object.entries(STREAK_MILESTONES).find(
    ([days, config]) => count >= config.days && (!streakData.milestones?.[days] || streakData.milestones[days] === false)
  );

  const result = {
    count,
    lastDate: today,
    lastSlipDayUsed: slipDayUsed || streakData.lastSlipDayUsed,
    milestones: streakData.milestones || {},
  };

  if (milestoneReached) {
    const [days] = milestoneReached;
    result.milestones[days] = true;
    result.milestoneName = days;
    result.milestone = STREAK_MILESTONES[days];
  }

  return result;
}

/**
 * Get bonus multiplier from current streak.
 *
 * @param {number} streakDays
 * @returns {Object} { growthBonus, evolutionBias }
 */
function getStreakBonuses(streakDays = 0) {
  const bonuses = {
    growthBonus: 1.0,
    evolutionBias: 0,
  };

  // Accumulate bonuses from all passed milestones
  for (const [days, config] of Object.entries(STREAK_MILESTONES)) {
    if (streakDays >= Number(days)) {
      bonuses.growthBonus += config.growthBonus;
      bonuses.evolutionBias += config.evolutionBias;
    }
  }

  return bonuses;
}

/**
 * Format streak data for display.
 *
 * @param {Object} streakData
 * @returns {Object} display-ready data
 */
function formatStreakDisplay(streakData = {}) {
  const count = streakData.count || 0;
  const bonuses = getStreakBonuses(count);

  let title = 'No streak';
  let description = 'Start a perfect day to begin!';

  if (count === 1) {
    title = '🔥 On a roll!';
    description = `1 perfect day`;
  } else if (count < 3) {
    title = '🔥 Building!';
    description = `${count} perfect days (${3 - count} to bonus)`;
  } else if (count < 7) {
    title = '⭐ Strong care!';
    description = `${count} perfect days (milestone: +5% growth)`;
  } else if (count < 14) {
    title = '✨ Aura unlocked!';
    description = `${count} perfect days`;
  } else if (count < 30) {
    title = '🏆 Master caretaker!';
    description = `${count} perfect days (milestone: +10% evolution bias)`;
  } else {
    title = '👑 Legendary streak!';
    description = `${count} perfect days (special title unlocked)`;
  }

  return {
    count,
    title,
    description,
    growthBonus: bonuses.growthBonus,
    evolutionBias: bonuses.evolutionBias,
  };
}

module.exports = {
  STREAK_MILESTONES,
  checkStreakBreakCondition,
  canUseGraceRule,
  updateStreak,
  getStreakBonuses,
  formatStreakDisplay,
};
