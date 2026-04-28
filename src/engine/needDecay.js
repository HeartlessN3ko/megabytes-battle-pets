/**
 * NEED DECAY ENGINE
 * Per-minute decay rates and care action effects are sourced from
 * src/config/gameBalance.js. Timing windows and grade multipliers live here.
 * Applied on server check-ins.
 */

const gameBalance = require('../config/gameBalance');
const lifespanEngine = require('./lifespanEngine');

const NEEDS = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];

// ─────────────────────────────────────────────────────────────────
// DECAY RATES (per minute, awake) — derived from gameBalance.NEED_DECAY_HOURS
// ─────────────────────────────────────────────────────────────────
const DECAY_RATES = NEEDS.reduce((acc, need) => {
  acc[need] = gameBalance.decayRatePerMinute(need);
  return acc;
}, {});

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
// Derived from gameBalance.CARE_GAIN_HOURS — edit that table to tune.
// ─────────────────────────────────────────────────────────────────
const CARE_ACTIONS = [
  'feed', 'clean', 'rest', 'play', 'pet',
  'meal', 'perfect-clean', 'deep_rest', 'deep_play', 'calm',
  'rps',  // minigame win — uses gameBalance.MINIGAME_GAIN_HOURS
];
const CARE_RESTORE = CARE_ACTIONS.reduce((acc, action) => {
  const map = gameBalance.careRestoreMap(action);
  if (map) acc[action] = map;
  return acc;
}, {});

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
function applyDecay(needs, lastNeedsUpdate, now = new Date(), options = {}, decorEffects = {}) {
  const speedMultiplier = Number(options?.speedMultiplier || 1);
  const maxWindowMinutes = Number(options?.maxWindowMinutes || 60);
  const stage = options?.stage || 'adult';  // lifespan stage; per-need multipliers
  const isSleeping = !!options?.isSleeping; // Skye 2026-04-28: sleep cuts decay
  const safeSpeed = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  const safeMaxWindow = Number.isFinite(maxWindowMinutes) && maxWindowMinutes > 0 ? maxWindowMinutes : 60;

  const msElapsed = now - new Date(lastNeedsUpdate);
  const rawMinutesElapsed = (msElapsed / (1000 * 60)) * safeSpeed;
  const minutesElapsed = Math.min(rawMinutesElapsed, safeMaxWindow);

  if (minutesElapsed < 0.1) return { needs, lastNeedsUpdate };

  const loss = calcNeedLoss(minutesElapsed, needs);

  // Neglect scaling: accelerate decay when avg needs are low
  const avgNeed = getAverageNeed(needs);
  let neglectMult = 1.0;
  if (avgNeed < 15) neglectMult = 2.0;      // +100% (death spiral)
  else if (avgNeed < 25) neglectMult = 1.6; // +60%
  else if (avgNeed < 40) neglectMult = 1.25; // +25%

  // Sunset painting: reduce Mood decay rate
  const moodDecayMult = 1 - Math.min(0.5, Number(decorEffects.moodDecayReduction || 0));

  // Sleep decay multiplier: when the byte is asleep, all needs decay at a
  // fraction of the awake rate (gameBalance.SLEEP_DECAY_MULTIPLIER, default 0.3).
  // The flag reflects pre-sync state — by the time the snapshot route runs
  // wake-up logic, decay has already been computed against the sleep window.
  const sleepMult = isSleeping ? Number(gameBalance.SLEEP_DECAY_MULTIPLIER ?? 1) : 1;

  const updated = {};
  for (const need of NEEDS) {
    const current = Number(needs?.[need] ?? 100);
    const stageMult = lifespanEngine.decayMultiplier(stage, need);
    let needLoss = loss[need] * neglectMult * stageMult * sleepMult;
    if (need === 'Mood') needLoss *= moodDecayMult;
    updated[need] = Math.max(0, Math.min(100, current - needLoss));
  }

  return { needs: updated, lastNeedsUpdate: now };
}

// Long-form care variants share the same timing curve as their base action
// (meal uses feed's Hunger window, etc.). `calm` is Mood-focused and isn't
// gated by a timing window — treat as always optimal.
// If future tuning needs per-variant curves, move each key into TIMING_WINDOWS
// with its own bands and delete that key from this map.
const ACTION_TIMING_ALIAS = {
  meal:            'feed',
  'perfect-clean': 'clean',
  deep_rest:       'rest',
  deep_play:       'play',
  calm:            null,
  rps:             null,  // minigame win, always optimal
};

/**
 * Determine timing window quality for a given care action.
 * @param {string} action - base ('feed'|'clean'|'rest'|'play') or long-form variant
 * @param {number} needValue - current value of the target need (0–100)
 * @returns {Object} { window: 'optimal'|'early'|'late'|'waste', restoreMultiplier }
 */
function getTimingWindow(action, needValue) {
  const aliased = Object.prototype.hasOwnProperty.call(ACTION_TIMING_ALIAS, action)
    ? ACTION_TIMING_ALIAS[action]
    : action;

  // Explicit null = no timing curve (e.g. calm → Mood).
  if (aliased === null) return { window: 'optimal', restoreMultiplier: 1.0 };

  const windows = TIMING_WINDOWS[aliased];
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
  // When gameBalance.ACTION_COOLDOWN_HOURS[action] is 0, the action has no spam
  // limit — return neutral multiplier. Otherwise apply the legacy decay schedule.
  if (gameBalance.cooldownMinutes(currentAction) <= 0) return 1.0;

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
function applyCare(needs, action, grade = 'good', timingMult = 1.0, spamMult = 1.0, decorEffects = {}) {
  const restore = CARE_RESTORE[action];
  if (!restore) throw new Error(`[NeedDecay] Unknown care action: "${action}"`);

  const gradeMult = GRADE_MULTIPLIERS[grade]?.restore || 1.0;
  const finalMult = gradeMult * timingMult * spamMult;

  const updated = { ...needs };
  for (const [need, baseAmount] of Object.entries(restore)) {
    const scaledAmount = Math.round(baseAmount * finalMult);
    updated[need] = Math.min(100, (updated[need] ?? 0) + scaledAmount);
  }

  // Pet bed: flat Bandwidth bonus on rest actions (applied after multipliers)
  if (action === 'rest' && decorEffects.restRecoveryBonus) {
    updated.Bandwidth = Math.min(100, (updated.Bandwidth ?? 0) + Number(decorEffects.restRecoveryBonus));
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
