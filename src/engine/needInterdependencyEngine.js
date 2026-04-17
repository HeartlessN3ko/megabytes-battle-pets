/**
 * NEED INTERDEPENDENCY ENGINE
 * Applies cross-effects between needs.
 * E.g., low energy increases hunger decay, low hygiene reduces affection gain.
 */

// ─────────────────────────────────────────────────────────────────
// CROSS-EFFECT DEFINITIONS
// ─────────────────────────────────────────────────────────────────

/**
 * Apply need interdependency modifiers to decay rates.
 * Low needs in one area make others decay faster.
 *
 * @param {Object} decayLoss - current decay loss per need (from needDecay.calcNeedLoss)
 * @param {Object} needs - current needs state
 * @returns {Object} adjusted decay loss
 */
function applyDecayInterdependency(decayLoss = {}, needs = {}) {
  let adjusted = { ...decayLoss };

  // Low energy (<30) increases hunger decay by 20%, reduces fun gains by 15%, play score -10%
  if ((needs.Bandwidth ?? 0) < 30) {
    adjusted.Hunger *= 1.2; // +20% decay
  }

  // Critical energy (<15): +35% hunger decay, -25% affection gain
  if ((needs.Bandwidth ?? 0) < 15) {
    adjusted.Hunger *= 1.35; // cumulative: 1.2 * 1.35
  }

  // Low hygiene (<30): -20% affection gain, +10% irritated mood, -10% passive XP
  // (Affection not in decay loss, handled in care actions)
  if ((needs.Hygiene ?? 0) < 30) {
    // Mood decays faster
    adjusted.Mood *= 1.1; // +10% mood decay (irritability)
  }

  // Critical hygiene (<15): -35% affection gain, +15% corruption sensitivity
  if ((needs.Hygiene ?? 0) < 15) {
    adjusted.Mood *= 1.15; // +15% mood decay
  }

  // Low fun (<30): -15% energy regen, -10% affection gain
  // (Energy regen = recovery during sleep, handled separately)
  if ((needs.Fun ?? 0) < 30) {
    // Social decays faster (loneliness from low fun)
    adjusted.Social *= 1.15; // +15% social decay
  }

  // Critical fun (<15): -25% energy regen, +10% distress rolls
  if ((needs.Fun ?? 0) < 15) {
    adjusted.Social *= 1.25; // +25% social decay
    adjusted.Mood *= 1.2; // mood also affects distress
  }

  // Low hunger (<30): -15% play performance, -10% passive XP, -10% energy recovery
  if ((needs.Hunger ?? 0) < 30) {
    adjusted.Bandwidth *= 1.1; // energy doesn't recover as well
  }

  // Critical hunger (<15): -25% performance, +10% irritability
  if ((needs.Hunger ?? 0) < 15) {
    adjusted.Bandwidth *= 1.25;
    adjusted.Mood *= 1.1; // irritability
  }

  return adjusted;
}

/**
 * Apply care action modifiers based on other need states.
 * E.g., if affection is low, petting is less effective.
 *
 * @param {Object} restoreValues - base restore from care action (e.g., { Hunger: 24 })
 * @param {Object} needs - current needs
 * @param {string} action - which care action is being performed
 * @returns {Object} adjusted restore values
 */
function applyCareInterdependency(restoreValues = {}, needs = {}, action = '') {
  let adjusted = { ...restoreValues };

  // Low affection affects all care action effectiveness
  const affectionMult = Math.max(0.5, 1.0 - (Math.max(0, 30 - (needs.Social ?? 0)) / 30) * 0.5);

  for (const key of Object.keys(adjusted)) {
    // Scale all restores by affection factor (lower affection = less effective)
    adjusted[key] *= affectionMult;
  }

  return adjusted;
}

/**
 * Calculate modifiers to stat growth based on need states.
 * E.g., critical needs reduce growth %.
 *
 * @param {Object} needs - current needs
 * @returns {number} multiplier (0.5–1.2)
 */
function getGrowthMultiplierFromNeeds(needs = {}) {
  const avg = (
    (needs.Hunger ?? 0) +
    (needs.Bandwidth ?? 0) +
    (needs.Hygiene ?? 0) +
    (needs.Social ?? 0) +
    (needs.Fun ?? 0)
  ) / 5;

  if (avg >= 75) return 1.2; // thriving
  if (avg >= 60) return 1.0; // stable
  if (avg >= 30) return 0.8; // low
  return 0.5; // critical
}

/**
 * Check for distress/refusal behaviors based on need states.
 * Returns { shouldRefuse, distressLevel }.
 *
 * @param {Object} needs
 * @returns {Object} { shouldRefuse, distressLevel, affectionPenalty }
 */
function checkBehaviorImpact(needs = {}) {
  const result = {
    shouldRefuse: false,
    distressLevel: 0,
    affectionPenalty: 0,
    moodShift: 0,
  };

  // Low affection: 20% refusal chance
  if ((needs.Social ?? 0) < 30) {
    result.shouldRefuse = Math.random() < 0.2;
    result.affectionPenalty = 5;
  }

  // Critical affection: 35% refusal chance, withdrawn
  if ((needs.Social ?? 0) < 15) {
    result.shouldRefuse = Math.random() < 0.35;
    result.affectionPenalty = 15;
    result.distressLevel = 2; // withdrawn behavior
  }

  // Low mood: increased irritability
  if ((needs.Mood ?? 0) < 30) {
    result.moodShift = -5;
  }

  // Critical mood: distress visible
  if ((needs.Mood ?? 0) < 15) {
    result.moodShift = -15;
    result.distressLevel = 3; // visible distress
  }

  return result;
}

/**
 * Apply sleep state benefits/penalties.
 * While sleeping, energy recovers but other needs don't decay.
 *
 * @param {Object} needs - current needs
 * @param {boolean} isSleeping - is byte currently sleeping
 * @param {number} minutesAsleep - how long byte has been sleeping
 * @returns {Object} adjusted needs
 */
function applySleepModifiers(needs = {}, isSleeping = false, minutesAsleep = 0) {
  if (!isSleeping) return needs;

  let adjusted = { ...needs };

  // Sleep recovery: +0.09 Bandwidth per minute (defined in needDecay)
  // But other needs still decay during sleep (reduced by ~50%)
  adjusted.Bandwidth = Math.min(100, (needs.Bandwidth ?? 0) + (0.09 * minutesAsleep));

  // Mood improves during sleep
  adjusted.Mood = Math.min(100, (needs.Mood ?? 0) + (0.02 * minutesAsleep));

  // Hunger still decays but slower during sleep
  // (handled in needDecay, not here)

  return adjusted;
}

module.exports = {
  applyDecayInterdependency,
  applyCareInterdependency,
  getGrowthMultiplierFromNeeds,
  checkBehaviorImpact,
  applySleepModifiers,
};
