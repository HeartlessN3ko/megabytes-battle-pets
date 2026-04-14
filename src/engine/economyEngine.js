/**
 * ECONOMY ENGINE
 * Handles all byte.bits income, daily caps, and minigame diminishing returns.
 * Source: economy.md / gamesystems.md balance patch
 */

// Daily income caps (byte.bits)
const DAILY_INCOME = {
  session_5min:  80,
  session_10min: 120,
  hard_cap:      150
};

// Offline rewards multiplier
const OFFLINE_EFFICIENCY = 0.6;

// Minigame diminishing returns
const MINIGAME_PENALTY = {
  after_5:  0.7,
  after_10: 0.5,
  floor:    0.5
};

// Training limits
const TRAINING_LIMITS = {
  effective_sessions: 5,
  post_limit_mult:    0.5
};

// Minigame reward tiers
const MINIGAME_REWARDS = {
  fail:    { multiplier: 0.5, base: 20 },
  good:    { multiplier: 1.0, base: 20 },
  perfect: { multiplier: 1.5, base: 20 }
};

// Battle / pageant rewards
const BATTLE_REWARDS  = { win: 30, loss: 10 };
const PAGEANT_REWARDS = { first: 50, second: 30, third: 15, participation: 5 };

// Daily care reward (steady low income)
const CARE_REWARD_PER_ACTION = 3; // byte.bits per completed care action

/**
 * Calculate minigame reward after diminishing returns.
 *
 * @param {string} tier       — 'fail' | 'good' | 'perfect'
 * @param {number} playsToday — number of minigame plays already completed today
 * @returns {number}          — byte.bits earned
 */
function calcMinigameReward(tier, playsToday) {
  const { base, multiplier } = MINIGAME_REWARDS[tier] || MINIGAME_REWARDS.good;
  let diminish = 1.0;
  if (playsToday >= 10) diminish = MINIGAME_PENALTY.floor;
  else if (playsToday >= 5) diminish = MINIGAME_PENALTY.after_5;

  return Math.round(base * multiplier * diminish);
}

/**
 * Apply income to a player, respecting the daily hard cap.
 * Returns the actual amount added and the new total.
 *
 * @param {number} currentDailyIncome — byte.bits earned today
 * @param {number} amount             — amount to add
 * @returns {{ added: number, newDailyTotal: number }}
 */
function applyIncome(currentDailyIncome, amount) {
  const remaining = Math.max(0, DAILY_INCOME.hard_cap - currentDailyIncome);
  const added = Math.min(amount, remaining);
  return { added, newDailyTotal: currentDailyIncome + added };
}

/**
 * Calculate offline reward for care actions completed while away.
 */
function calcOfflineReward(baseReward) {
  return Math.round(baseReward * OFFLINE_EFFICIENCY);
}

/**
 * Reset daily income tracking. Call at server midnight or per-user daily reset.
 */
function resetDailyIncome(_player) {
  return {
    dailyIncome: 0,
    lastDailyReset: new Date(),
    minigamePlaysToday: 0
  };
}

/**
 * Check if a player's daily income should be reset based on last reset time.
 */
function shouldResetDaily(lastDailyReset) {
  const now = new Date();
  const last = new Date(lastDailyReset);
  return now.getUTCDate() !== last.getUTCDate() || now - last > 24 * 60 * 60 * 1000;
}

module.exports = {
  DAILY_INCOME,
  OFFLINE_EFFICIENCY,
  MINIGAME_PENALTY,
  TRAINING_LIMITS,
  MINIGAME_REWARDS,
  BATTLE_REWARDS,
  PAGEANT_REWARDS,
  CARE_REWARD_PER_ACTION,
  calcMinigameReward,
  applyIncome,
  calcOfflineReward,
  resetDailyIncome,
  shouldResetDaily
};
