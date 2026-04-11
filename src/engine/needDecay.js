/**
 * NEED DECAY ENGINE
 * Progressive decay over 72 hours — slow → medium → fast.
 * All needs use the same curve. Applied on every server check-in.
 * Source: gamesystems.md / need decay system final
 */

const NEEDS = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];

// Base loss per hour to drain 100 → 0 over 72 hours
const BASE_LOSS_PER_HOUR = 100 / 72; // ≈ 1.389

// Phase multipliers (decay accelerates over time)
const DECAY_PHASES = [
  { upToHours: 24, rate: 0.25 },
  { upToHours: 48, rate: 0.35 },
  { upToHours: 72, rate: 0.40 }
];

/**
 * Calculate total need loss for a given number of hours elapsed.
 * Handles phase transitions correctly.
 *
 * @param {number} hoursElapsed — real hours since last update
 * @returns {number} totalLoss  — points to subtract from each need
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

  // Any overflow beyond 72h — continue at 0.40 rate
  if (remaining > 0) {
    loss += BASE_LOSS_PER_HOUR * 0.40 * remaining;
  }

  return loss;
}

/**
 * Apply decay to a needs object based on time elapsed since lastNeedsUpdate.
 * Returns updated needs and new lastNeedsUpdate timestamp.
 *
 * @param {Object} needs           — current need values { Hunger, Bandwidth, ... }
 * @param {Date}   lastNeedsUpdate — timestamp of last update
 * @param {Date}   [now]           — override current time (for testing)
 * @returns {{ needs: Object, lastNeedsUpdate: Date }}
 */
function applyDecay(needs, lastNeedsUpdate, now = new Date()) {
  const msElapsed = now - new Date(lastNeedsUpdate);
  const hoursElapsed = msElapsed / (1000 * 60 * 60);

  if (hoursElapsed < 0.01) return { needs, lastNeedsUpdate }; // too short to bother

  const loss = calcNeedLoss(hoursElapsed);

  const updated = {};
  for (const need of NEEDS) {
    updated[need] = Math.max(0, Math.min(100, (needs[need] ?? 100) - loss));
  }

  return { needs: updated, lastNeedsUpdate: now };
}

/**
 * Care restore values — applied when player feeds, cleans, rests, plays.
 */
const CARE_RESTORE = {
  feed:  { Hunger: 30 },
  clean: { Hygiene: 30 },
  rest:  { Bandwidth: 40, Mood: 10 },
  play:  { Fun: 25, Social: 15, Mood: 10 }
};

/**
 * Apply a care action to needs.
 * @param {Object} needs   — current needs
 * @param {string} action  — 'feed' | 'clean' | 'rest' | 'play'
 * @returns {Object}       — updated needs
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
