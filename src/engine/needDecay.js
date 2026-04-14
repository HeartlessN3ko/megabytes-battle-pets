/**
 * NEED DECAY ENGINE
 * Progressive decay over time with staged rates.
 * Applied on server check-ins.
 */

const NEEDS = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];
const MAX_DECAY_WINDOW_HOURS = 1;

// Tuned for demo responsiveness while keeping short sessions manageable.
const BASE_LOSS_PER_HOUR = 100 / 64;

// Decay accelerates over time. Rates sourced from care-mechanics.md / gamesystems.md.
// Demo mode uses speedMultiplier option below — do not retune these base rates for demo pacing.
const DECAY_PHASES = [
  { upToHours: 24, rate: 0.25 },
  { upToHours: 48, rate: 0.35 },
  { upToHours: 72, rate: 0.40 },
];

/**
 * Calculate total need loss for a given number of hours elapsed.
 * Handles phase transitions correctly.
 *
 * @param {number} hoursElapsed - real hours since last update
 * @returns {number} totalLoss - points to subtract from each need
 */
function calcNeedLoss(hoursElapsed) {
  let remaining = hoursElapsed;
  let loss = 0;
  let elapsed = 0;

  for (const phase of DECAY_PHASES) {
    const phaseHours = phase.upToHours - elapsed;
    const hoursInPhase = Math.min(remaining, phaseHours);
    if (hoursInPhase <= 0) break;

    loss += BASE_LOSS_PER_HOUR * phase.rate * hoursInPhase;
    remaining -= hoursInPhase;
    elapsed = phase.upToHours;

    if (remaining <= 0) break;
  }

  // Any overflow beyond 72h: continue at final phase rate.
  if (remaining > 0) {
    loss += BASE_LOSS_PER_HOUR * 0.40 * remaining;
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
 * @returns {{ needs: Object, lastNeedsUpdate: Date }}
 */
function applyDecay(needs, lastNeedsUpdate, now = new Date(), options = {}) {
  const speedMultiplier = Number(options?.speedMultiplier || 1);
  const maxWindowHours = Number(options?.maxWindowHours || MAX_DECAY_WINDOW_HOURS);
  const safeSpeed = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  const safeMaxWindow = Number.isFinite(maxWindowHours) && maxWindowHours > 0 ? maxWindowHours : MAX_DECAY_WINDOW_HOURS;

  const msElapsed = now - new Date(lastNeedsUpdate);
  const rawHoursElapsed = (msElapsed / (1000 * 60 * 60)) * safeSpeed;
  const hoursElapsed = Math.min(rawHoursElapsed, safeMaxWindow);

  if (hoursElapsed < 0.01) return { needs, lastNeedsUpdate };

  const loss = calcNeedLoss(hoursElapsed);

  const updated = {};
  for (const need of NEEDS) {
    updated[need] = Math.max(0, Math.min(100, (needs[need] ?? 100) - loss));
  }

  return { needs: updated, lastNeedsUpdate: now };
}

/**
 * Care restore values applied when player feeds, cleans, rests, plays.
 * Tuned to avoid over-correction while keeping care loop satisfying.
 */
const CARE_RESTORE = {
  feed: { Hunger: 24, Mood: 4 },
  clean: { Hygiene: 26, Mood: 4 },
  rest: { Bandwidth: 32, Mood: 14 },
  play: { Fun: 24, Social: 18, Mood: 12 },
};

/**
 * Apply a care action to needs.
 * @param {Object} needs - current needs
 * @param {string} action - 'feed' | 'clean' | 'rest' | 'play'
 * @returns {Object} - updated needs
 */
function applyCare(needs, action) {
  const restore = CARE_RESTORE[action];
  if (!restore) throw new Error(`[NeedDecay] Unknown care action: "${action}"`);

  const updated = { ...needs };
  for (const [need, amount] of Object.entries(restore)) {
    updated[need] = Math.min(100, (updated[need] ?? 0) + amount);
  }
  return updated;
}

/**
 * Returns a summary of need states (full / stable / low / critical) for UI display.
 */
function getNeedStates(needs) {
  const states = {};
  for (const need of NEEDS) {
    const v = needs[need] ?? 100;
    if (v >= 75) states[need] = 'full';
    else if (v >= 50) states[need] = 'stable';
    else if (v >= 25) states[need] = 'low';
    else states[need] = 'critical';
  }
  return states;
}

module.exports = { NEEDS, BASE_LOSS_PER_HOUR, calcNeedLoss, applyDecay, applyCare, CARE_RESTORE, getNeedStates };
