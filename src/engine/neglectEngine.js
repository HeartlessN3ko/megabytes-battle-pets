/**
 * NEGLECT ENGINE
 * Tracks neglect timer and death stages.
 * Separate from old-age death (level 100).
 */

// ─────────────────────────────────────────────────────────────────
// NEGLECT STAGES
// ─────────────────────────────────────────────────────────────────
const NEGLECT_STAGES = {
  0: { name: 'Healthy', minAvgNeeds: 40, behavior: 'normal' },
  1: { name: 'Warning', minAvgNeeds: 25, behavior: 'anxious', timeToDeath: null },
  2: { name: 'Neglect', minAvgNeeds: 15, behavior: 'withdrawn', timeToDeath: '5–7 days' },
  3: { name: 'Critical', minAvgNeeds: 5, behavior: 'distressed', timeToDeath: '2–3 days' },
  4: { name: 'Terminal', minAvgNeeds: -1, behavior: 'dying', timeToDeath: '6–12 hours' },
};

// ─────────────────────────────────────────────────────────────────
// NEGLECT TIMER LOGIC
// ─────────────────────────────────────────────────────────────────

/**
 * Get current neglect stage based on avg needs.
 *
 * @param {number} avgNeeds - average of all needs (0–100)
 * @returns {number} stage (0–4)
 */
function getNegelectStage(avgNeeds) {
  if (avgNeeds >= 40) return 0;
  if (avgNeeds >= 25) return 1;
  if (avgNeeds >= 15) return 2;
  if (avgNeeds >= 5) return 3;
  return 4;
}

/**
 * Update neglect timer based on current state.
 * Timer accumulates while in low-need states.
 * Decays slowly when needs recover.
 *
 * @param {number} neglectTimer - current timer (milliseconds)
 * @param {number} avgNeeds - average needs
 * @param {number} minutesElapsed - time since last check
 * @returns {number} updated timer
 */
function updateNeglectTimer(neglectTimer = 0, avgNeeds, minutesElapsed = 1) {
  const msElapsed = minutesElapsed * 60 * 1000;

  if (avgNeeds < 20) {
    // In critical zone: timer accumulates
    return neglectTimer + msElapsed;
  } else if (avgNeeds >= 25) {
    // Recovered: timer decays slowly (5% per minute)
    return Math.max(0, neglectTimer - (msElapsed * 0.05));
  } else {
    // Gray zone (20–24): no change
    return neglectTimer;
  }
}

/**
 * Check if byte should die from neglect.
 * Requires: avg needs < 10 + sustained neglect duration.
 *
 * @param {number} avgNeeds
 * @param {number} neglectTimer - milliseconds spent in critical state
 * @returns {boolean} should die
 */
function shouldDieFromNeglect(avgNeeds, neglectTimer = 0) {
  // Only eligible if avg needs is VERY low
  if (avgNeeds >= 10) return false;

  // And only if accumulated significant neglect time
  const daysSinceCritical = neglectTimer / (1000 * 60 * 60 * 24);
  return daysSinceCritical >= 2; // 2+ days in critical neglect
}

/**
 * Format neglect state for display.
 *
 * @param {number} avgNeeds
 * @param {number} neglectTimer - milliseconds
 * @returns {Object} display data
 */
function formatNeglectDisplay(avgNeeds, neglectTimer = 0) {
  const stage = getNegelectStage(avgNeeds);
  const config = NEGLECT_STAGES[stage];
  const daysSinceCritical = neglectTimer / (1000 * 60 * 60 * 24);

  return {
    stage,
    stageName: config.name,
    behavior: config.behavior,
    warningColor: stage === 0 ? 'green' : stage === 1 ? 'yellow' : stage === 2 ? 'orange' : 'red',
    neglectDays: daysSinceCritical.toFixed(1),
    isTerminal: stage >= 4,
  };
}

module.exports = {
  NEGLECT_STAGES,
  getNegelectStage,
  updateNeglectTimer,
  shouldDieFromNeglect,
  formatNeglectDisplay,
};
