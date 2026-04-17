/**
 * NEED DECAY ENGINE (REVISED)
 * Flat per-minute decay rates. Care actions with timing windows and spam penalties.
 * Applied on server check-ins.
 */

const NEEDS = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];

// ─────────────────────────────────────────────────────────────────
// DECAY RATES (per minute, awake)
// ─────────────────────────────────────────────────────────────────
const DECAY_RATES = {
  Hunger: 0.055,
  Bandwidth: 0.040, // awake; +0.090 while sleeping
  Hygiene: 0.035,
  Social: 0.025,
  Fun: 0.045,
  Mood: 0.025,
};

// Sleep-time Bandwidth/Mood regen is handled in needInterdependencyEngine.applySleepEffects,
// not here. If restoring decay-side sleep logic, reintroduce a SLEEP_*_GAIN constant.

// ─────────────────────────────────────────────────────────────────
// TIMING WINDOWS FOR CARE ACTIONS
// Expressed as ranges of current need values.
// ─────────────────────────────────────────────────────────────────
const TIMING_WINDOWS = {
  feed: [
    { window: 'optimal', min: 35, max: 70, restoreMultiplier: 1.0 },
    { window: 'early', min: 71, max: 90, restoreMultiplier: 0.75 },
    { window: 'late', min: 10, max: 34, restoreMultiplier: 0.85 },
    { window: 'waste', min: 91, max: 100, restoreMultiplier: 0.5 },
    { window: 'waste', min: 0, max: 9, restoreMultiplier: 0.5 },
  ],
  clean: [
    { window: 'optimal', min: 20, max: 60, restoreMultiplier: 1.0 },
    { window: 'early', min: 61, max: 85, restoreMultiplier: 0.75 },
    { window: 'late', min: 0, max: 19, restoreMultiplier: 0.85 },
    { window: 'waste', min: 86, max: 100, restoreMultiplier: 0.5 },
  ],
  play: [
    { window: 'optimal', min: 25, max: 65, restoreMultiplier: 1.0 },
    { window: 'early', min: 66, max: 85, restoreMultiplier: 0.75 },
    { window: 'late', min: 0, max: 24, restoreMultiplier: 0.85 },
    { window: 'waste', min: 86, max: 100, restoreMultiplier: 0.5 },
  ],
  rest: [
    { window: 'optimal', min: 20, max: 55, restoreMultiplier: 1.0 },
    { window: 'early', min: 56, max: 80, restoreMultiplier: 0.75 },
    { window: 'late', min: 0, max: 19, restoreMultiplier: 0.85 },
    { window: 'waste', min: 81, max: 100, restoreMultiplier: 0.5 },
  ],
};

// ─────────────────────────────────────────────────────────────────
// CARE RESTORE VALUES (base, before timing/grade multipliers)
// ─────────────────────────────────────────────────────────────────
const CARE_RESTORE = {
  feed: { Hunger: 24, Mood: 4 },
  clean: { Hygiene: 26, Mood: 4 },
  'perfect-clean': { Hygiene: 40, Mood: 6 },
  rest: { Bandwidth: 28, Mood: 14 },
  play: { Fun: 20, Social: 8, Mood: 12 },
  pet: { Social: 10, Affection: 10, Mood: 3 },
};

// ─────────────────────────────────────────────────────────────────
// GRADE MULTIPLIERS (from minigames)
// ─────────────────────────────────────────────────────────────────
const GRADE_MULTIPLIERS = {
  perfect: { restore: 1.25, xp: 1.25 },
  good: { restore: 1.0, xp: 1.0 },
  ok: { restore: 0.8, xp: 0.85 },
  fail: { restore: 0.55, xp: 0.5 },
};

// ─────────────────────────────────────────────────────────────────
// SPAM PENALTY SCHEDULE
// Same action repeated within 2 minutes: effectiveness decreases
// ─────────────────────────────────────────────────────────────────
const SPAM_PENALTY = {
  1: 1.0, // first use
  2: 0.7, // second use
  3: 0.4, // third use
  4: 0.15, // fourth+
};

// ─────────────────────────────────────────────────────────────────
// NEED STATE THRESHOLDS (NEW)
// ─────────────────────────────────────────────────────────────────
const NEED_STATES = {
  thriving: { min: 85, max: 100 },
  stable: { min: 60, max: 84 },
  low: { min: 30, max: 59 },
  critical: { min: 0, max: 29 },
};

/**
 * Calculate total need loss for minutes elapsed.
 * Accounts for offline decay cap (50% of real time).
 *
 * @param {number} minutesElapsed - real minutes since last update
 * @param {Object} needs - current needs (to check if sleeping)
 * @param {boolean} [wasOffline=false] - if true, apply 50% decay multiplier
 * @returns {Object} loss per need
 */
function calcNeedLoss(minutesElapsed, needs = {}, wasOffline = false) {
  const multiplier = wasOffline ? 0.5 : 1.0;
  const loss = {};

  for (const need of NEEDS) {
    if (need === 'Bandwidth' && needs[need] !== undefined) {
      // Bandwidth decay changes based on sleep state
      loss[need] = (DECAY_RATES[need] * minutesElapsed * multiplier);
    } else {
      loss[need] = (DECAY_RATES[need] * minutesElapsed * multiplier);
    }
  }

  return loss;
}

/**
 * Apply decay to a needs object based on time elapsed since lastNeedsUpdate.
 * Returns updated needs and new lastNeedsUpdate timestamp.
 *
 * @param {Object} needs - current need values { Hunger, Bandwidth, ... }
 * @param {Date} lastNeedsUpdate - timestamp of last update
 * @param {Date} [now] - override current time (for testing)
 * @param {Object} [options] - { speedMultiplier, maxWindowMinutes }
 * @returns {{ needs: Object, lastNeedsUpdate: Date }}
 */
function applyDecay(needs, lastNeedsUpdate, now = new Date(), options = {}) {
  const speedMultiplier = Number(options?.speedMultiplier || 1);
  const maxWindowMinutes = Number(options?.maxWindowMinutes || 60);
  const safeSpeed = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  const safeMaxWindow = Number.isFinite(maxWindowMinutes) && maxWindowMinutes > 0 ? maxWindowMinutes : 60;

  const msElapsed = now - new Date(lastNeedsUpdate);
  const rawMinutesElapsed = (msElapsed / (1000 * 60)) * safeSpeed;
  const minutesElapsed = Math.min(rawMinutesElapsed, safeMaxWindow);

  if (minutesElapsed < 0.1) return { needs, lastNeedsUpdate };

  const loss = calcNeedLoss(minutesElapsed, needs);

  const updated = {};
  for (const need of NEEDS) {
    const current = Number(needs?.[need] ?? 100);
    updated[need] = Math.max(0, Math.min(100, current - loss[need]));
  }

  return { needs: updated, lastNeedsUpdate: now };
}

/**
 * Determine timing window quality for a given care action.
 * @param {string} action - 'feed' | 'clean' | 'rest' | 'play'
 * @param {number} needValue - current value of the target need (0–100)
 * @returns {Object} { window: 'optimal'|'early'|'late'|'waste', restoreMultiplier }
 */
function getTimingWindow(action, needValue) {
  const windows = TIMING_WINDOWS[action];
  if (!windows) throw new Error(`[NeedDecay] Unknown action: "${action}"`);

  for (const w of windows) {
    if (needValue >= w.min && needValue <= w.max) {
      return { window: w.window, restoreMultiplier: w.restoreMultiplier };
    }
  }
  return { window: 'waste', restoreMultiplier: 0.5 };
}

/**
 * Calculate spam penalty multiplier based on recent action history.
 * Same action repeated within 2 min = reduced effectiveness.
 *
 * @param {Array} lastCareActions - array of action IDs, most recent first
 * @param {string} currentAction - action being performed
 * @returns {number} multiplier (1.0 = no penalty, 0.15 = heavy penalty)
 */
function applySpamPenalty(lastCareActions = [], currentAction) {
  if (!Array.isArray(lastCareActions)) lastCareActions = [];

  let count = 1; // Count the current action as the first
  for (let i = 0; i < Math.min(lastCareActions.length, 3); i++) {
    if (lastCareActions[i] === currentAction) count++;
    else break; // Stop at first different action
  }

  return SPAM_PENALTY[Math.min(count, 4)] || 0.15;
}

/**
 * Apply a care action to needs with timing + grade multipliers.
 *
 * @param {Object} needs - current needs
 * @param {string} action - 'feed' | 'clean' | 'rest' | 'play' | 'pet'
 * @param {string} [grade='good'] - 'perfect' | 'good' | 'ok' | 'fail'
 * @param {number} [timingMult=1.0] - timing window multiplier
 * @param {number} [spamMult=1.0] - spam penalty multiplier
 * @returns {Object} - updated needs
 */
function applyCare(needs, action, grade = 'good', timingMult = 1.0, spamMult = 1.0) {
  const restore = CARE_RESTORE[action];
  if (!restore) throw new Error(`[NeedDecay] Unknown care action: "${action}"`);

  const gradeMult = GRADE_MULTIPLIERS[grade]?.restore || 1.0;
  const finalMult = gradeMult * timingMult * spamMult;

  const updated = { ...needs };
  for (const [need, baseAmount] of Object.entries(restore)) {
    const scaledAmount = Math.round(baseAmount * finalMult);
    updated[need] = Math.min(100, (updated[need] ?? 0) + scaledAmount);
  }
  return updated;
}

/**
 * Returns a summary of need states for UI display.
 * Uses new thresholds: thriving (85+), stable (60+), low (30+), critical (0–29)
 */
function getNeedStates(needs) {
  const states = {};
  for (const need of NEEDS) {
    const v = needs[need] ?? 100;
    if (v >= 85) states[need] = 'thriving';
    else if (v >= 60) states[need] = 'stable';
    else if (v >= 30) states[need] = 'low';
    else states[need] = 'critical';
  }
  return states;
}

/**
 * Calculate average need value for care patterns + battle lock checks.
 */
function getAverageNeed(needs = {}) {
  const values = NEEDS.map(n => Number(needs?.[n] ?? 0));
  return values.reduce((a, b) => a + b, 0) / values.length;
}

module.exports = {
  NEEDS,
  DECAY_RATES,
  TIMING_WINDOWS,
  CARE_RESTORE,
  GRADE_MULTIPLIERS,
  SPAM_PENALTY,
  NEED_STATES,
  applyDecay,
  calcNeedLoss,
  getTimingWindow,
  applySpamPenalty,
  applyCare,
  getNeedStates,
  getAverageNeed,
};
