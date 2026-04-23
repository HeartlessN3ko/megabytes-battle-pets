/**
 * CARE PATTERN ENGINE
 * Tracks daily care score and pattern classification.
 * Used for XP bonuses, growth penalties, and evolution weighting.
 */

// ─────────────────────────────────────────────────────────────────
// DAILY CARE SCORE COMPONENTS
// ─────────────────────────────────────────────────────────────────
const CARE_SCORE_WEIGHTS = {
  needsUptime: 0.40,      // % of day with avg needs ≥ 60
  actionCompletion: 0.25, // feed, clean, play, rest completed in window
  timingQuality: 0.20,    // % of actions in optimal window
  interactionVariety: 0.10, // variety penalty for spamming one action
  neglectAvoidance: 0.05, // no need stayed critical >30 min continuous
};

// ─────────────────────────────────────────────────────────────────
// CARE PATTERN TIERS (based on daily care score)
// ─────────────────────────────────────────────────────────────────
const CARE_PATTERNS = {
  perfect: {
    scoreMin: 90,
    scoreMax: 100,
    xpBonus: 0.25,
    growthBonus: 0.12,
    evolutionBias: 10,
  },
  good: {
    scoreMin: 75,
    scoreMax: 89,
    xpBonus: 0.08,
    growthBonus: 0.06,
    evolutionBias: 0,
  },
  neutral: {
    scoreMin: 55,
    scoreMax: 74,
    xpBonus: 0,
    growthBonus: 0,
    evolutionBias: 0,
  },
  poor: {
    scoreMin: 30,
    scoreMax: 54,
    xpBonus: -0.10,
    growthBonus: -0.08,
    evolutionBias: 0,
  },
  neglectful: {
    scoreMin: 0,
    scoreMax: 29,
    xpBonus: -0.25,
    growthBonus: -0.15,
    evolutionBias: -15,
  },
};

/**
 * Calculate needs uptime score (40% of daily care score).
 * Tracks what % of the day avg needs was ≥ 60.
 *
 * @param {Array} needsHistory - array of { timestamp, avgNeeds } samples
 * @returns {number} 0–100 (% of checks where avg needs ≥ 60)
 */
function getNeedsUptimeScore(needsHistory = []) {
  if (!Array.isArray(needsHistory) || needsHistory.length === 0) return 0;

  const healthy = needsHistory.filter(h => (h.avgNeeds ?? 0) >= 60).length;
  return (healthy / needsHistory.length) * 100;
}

/**
 * Calculate action completion score (25% of daily care score).
 * Checks if feed, clean, play, rest were each completed at least once.
 *
 * @param {Array} careActions - array of { action, window, timestamp }
 * @returns {number} 0–100 (based on how many action types completed in window)
 */
function getActionCompletionScore(careActions = []) {
  if (!Array.isArray(careActions) || careActions.length === 0) return 0;

  const completed = new Set();
  for (const action of careActions) {
    if (action.window !== 'waste') {
      completed.add(action.action);
    }
  }

  // 4 required actions: feed, clean, play, rest
  const required = ['feed', 'clean', 'play', 'rest'];
  const count = required.filter(r => completed.has(r)).length;
  return (count / 4) * 100;
}

/**
 * Calculate timing quality score (20% of daily care score).
 * % of care actions performed in optimal window.
 *
 * @param {Array} careActions - array of { window, timestamp }
 * @returns {number} 0–100
 */
function getTimingQualityScore(careActions = []) {
  if (!Array.isArray(careActions) || careActions.length === 0) return 0;

  const optimal = careActions.filter(a => a.window === 'optimal').length;
  return (optimal / careActions.length) * 100;
}

/**
 * Calculate interaction variety score (10% of daily care score).
 * Penalize spamming the same action.
 *
 * @param {Array} careActions - array of { action, timestamp }
 * @returns {number} 0–100 (high if variety, low if spam)
 */
function getInteractionVarietyScore(careActions = []) {
  if (!Array.isArray(careActions) || careActions.length === 0) return 100;

  // Count action types
  const actionCounts = {};
  for (const action of careActions) {
    actionCounts[action.action] = (actionCounts[action.action] ?? 0) + 1;
  }

  const types = Object.keys(actionCounts).length;

  // If using only 1–2 actions, heavy penalty
  if (types === 1) return 0;
  if (types === 2) return 33;
  if (types === 3) return 66;
  return 100; // All 4+ action types = no penalty
}

/**
 * Calculate neglect avoidance score (5% of daily care score).
 * Check if any need stayed critical (< 30) for >30 min continuous.
 *
 * @param {Array} needsHistory - array of { timestamp, needs } samples
 * @returns {number} 0–100 (100 = no neglect, 0 = severe neglect)
 */
function getNeglectAvoidanceScore(needsHistory = []) {
  if (!Array.isArray(needsHistory) || needsHistory.length === 0) return 100;

  let maxCriticalStreak = 0;
  let currentStreak = 0;
  let streakStart = null;

  for (const entry of needsHistory) {
    const isCritical = Object.values(entry.needs || {}).some(n => n < 30);

    if (isCritical) {
      if (currentStreak === 0) streakStart = entry.timestamp;
      currentStreak++;
    } else {
      if (currentStreak > 0) {
        const duration = (entry.timestamp - streakStart) / (1000 * 60); // minutes
        maxCriticalStreak = Math.max(maxCriticalStreak, duration);
      }
      currentStreak = 0;
    }
  }

  // Final streak check
  if (currentStreak > 0 && streakStart) {
    const duration = (Date.now() - streakStart) / (1000 * 60);
    maxCriticalStreak = Math.max(maxCriticalStreak, duration);
  }

  // Score: 100 if no neglect >30 min, linear decrease
  if (maxCriticalStreak > 30) {
    return Math.max(0, 100 - (maxCriticalStreak - 30) * 2);
  }
  return 100;
}

/**
 * Calculate daily care score (0–100).
 * Weighted sum of all components.
 *
 * @param {Object} dailyData - { needsHistory, careActions }
 * @returns {number} 0–100
 */
function calculateDailyScore(dailyData = {}) {
  const needsHistory = dailyData.needsHistory || [];
  const careActions = dailyData.careActions || [];

  const uptime = getNeedsUptimeScore(needsHistory);
  const completion = getActionCompletionScore(careActions);
  const timing = getTimingQualityScore(careActions);
  const variety = getInteractionVarietyScore(careActions);
  const neglect = getNeglectAvoidanceScore(needsHistory);

  const score =
    (uptime * CARE_SCORE_WEIGHTS.needsUptime) +
    (completion * CARE_SCORE_WEIGHTS.actionCompletion) +
    (timing * CARE_SCORE_WEIGHTS.timingQuality) +
    (variety * CARE_SCORE_WEIGHTS.interactionVariety) +
    (neglect * CARE_SCORE_WEIGHTS.neglectAvoidance);

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Get care pattern classification from daily care score.
 *
 * @param {number} dailyScore - 0–100
 * @returns {Object} { pattern, xpBonus, growthBonus, evolutionBias }
 */
function getCarePattern(dailyScore) {
  for (const [patternName, config] of Object.entries(CARE_PATTERNS)) {
    if (dailyScore >= config.scoreMin && dailyScore <= config.scoreMax) {
      return {
        pattern: patternName,
        xpBonus: config.xpBonus,
        growthBonus: config.growthBonus,
        evolutionBias: config.evolutionBias,
      };
    }
  }
  return CARE_PATTERNS.neutral; // fallback
}

/**
 * Record a care action for tracking.
 * Updates lastCareActions array on byte.
 *
 * @param {string} action - 'feed' | 'clean' | 'play' | 'rest' | 'pet'
 * @param {string} window - 'optimal' | 'early' | 'late' | 'waste'
 * @param {Array} lastCareActions - byte's current action history
 * @returns {Array} updated action history (max 20 entries)
 */
function recordCareAction(action, window, lastCareActions = []) {
  if (!Array.isArray(lastCareActions)) lastCareActions = [];

  const updated = [{ action, window, timestamp: Date.now() }, ...lastCareActions].slice(0, 20);
  return updated;
}

module.exports = {
  CARE_SCORE_WEIGHTS,
  CARE_PATTERNS,
  getNeedsUptimeScore,
  getActionCompletionScore,
  getTimingQualityScore,
  getInteractionVarietyScore,
  getNeglectAvoidanceScore,
  calculateDailyScore,
  getCarePattern,
  recordCareAction,
};
