// src/engine/eggMetricsEngine.js
// Egg care tracking and behavior score calculation for animal assignment.
// Single source of truth for egg metrics → behavior conversion.

/**
 * Record an egg care action and update metrics.
 * @param {Object} eggMetrics - Current egg metrics object
 * @param {string} actionType - 'feed', 'clean', 'praise', or 'inspect'
 * @returns {Object} Updated eggMetrics
 */
function recordEggAction(eggMetrics, actionType) {
  if (!eggMetrics) eggMetrics = {};

  switch (actionType.toLowerCase()) {
    case 'feed':
      eggMetrics.feedCount = (eggMetrics.feedCount || 0) + 1;
      break;
    case 'clean':
      eggMetrics.cleanCount = (eggMetrics.cleanCount || 0) + 1;
      break;
    case 'praise':
      eggMetrics.praiseCount = (eggMetrics.praiseCount || 0) + 1;
      break;
    case 'inspect':
      eggMetrics.inspectCount = (eggMetrics.inspectCount || 0) + 1;
      break;
    default:
      break;
  }

  return eggMetrics;
}

/**
 * Calculate hours of neglect from hatch time.
 * @param {Date} hatchAt - Timestamp when egg was created
 * @returns {number} Hours since hatchAt
 */
function calculateNeglectHours(hatchAt) {
  if (!hatchAt) return 0;
  const now = Date.now();
  const hatchTime = new Date(hatchAt).getTime();
  return (now - hatchTime) / (1000 * 60 * 60);
}

/**
 * Calculate consistency score based on action spacing.
 * Perfect consistency = evenly spaced actions. Poor = all at once, then gap.
 * @param {Object} eggMetrics - Egg metrics
 * @param {number} hatchAgeHours - Hours since egg created
 * @returns {number} Consistency score 0-1
 */
function calculateConsistency(eggMetrics, hatchAgeHours) {
  if (!eggMetrics || hatchAgeHours <= 0) return 0;

  const totalActions =
    (eggMetrics.feedCount || 0) +
    (eggMetrics.cleanCount || 0) +
    (eggMetrics.praiseCount || 0) +
    (eggMetrics.inspectCount || 0);

  if (totalActions === 0) return 0;

  // Ideal: actions spread evenly over time
  // Score: 1 if avg spacing ≤ 4 hours, decay if actions clumped
  const idealSpacingHours = 4;
  const avgSpacingHours = hatchAgeHours / totalActions;

  // Clamp to 0-1: perfect at ideal spacing, worse if too clumped or too sparse
  const consistency = Math.min(1, avgSpacingHours / idealSpacingHours);
  return Math.max(0, consistency);
}

/**
 * Convert egg metrics to normalized behavior scores for animal assignment.
 * Returns scores 0-1 for each of the 20 animals.
 * @param {Object} eggMetrics - Egg metrics from hatch phase
 * @param {number} hatchAgeHours - Total hours egg was active
 * @returns {Object} behavior scores keyed by animal name
 */
function convertToBehaviorScores(eggMetrics, hatchAgeHours) {
  if (!eggMetrics) eggMetrics = {};
  if (!hatchAgeHours || hatchAgeHours <= 0) hatchAgeHours = 1;

  const feed = eggMetrics.feedCount || 0;
  const clean = eggMetrics.cleanCount || 0;
  const praise = eggMetrics.praiseCount || 0;
  const inspect = eggMetrics.inspectCount || 0;
  const neglect = eggMetrics.neglectHours || 0;

  const totalActions = feed + clean + praise + inspect;
  const consistency = calculateConsistency(eggMetrics, hatchAgeHours);

  // Normalize ratios (avoid div by zero)
  const feedRatio = totalActions > 0 ? feed / totalActions : 0;
  const cleanRatio = totalActions > 0 ? clean / totalActions : 0;
  const praiseRatio = totalActions > 0 ? praise / totalActions : 0;
  const inspectRatio = totalActions > 0 ? inspect / totalActions : 0;
  const actionFrequency = Math.min(1, totalActions / (hatchAgeHours / 2)); // 2 actions/hour = max

  // Neglect penalty: high neglect hours = low score
  const neglectPenalty = Math.max(0, 1 - (neglect / 120)); // 120h neglect = 0 score

  return {
    // Speed-dominant: high tap/play, frequent interactions, low neglect
    Bird:   Math.min(1, (actionFrequency * 0.8 + consistency * 0.2) * neglectPenalty),
    Cat:    Math.min(1, (praiseRatio * 0.3 + actionFrequency * 0.4 + consistency * 0.3) * neglectPenalty),
    Rabbit: Math.min(1, (actionFrequency * 0.7 + consistency * 0.3) * neglectPenalty * 0.8), // shorter sessions

    // Power-dominant: sustained engagement
    Lion:   Math.min(1, (actionFrequency * 0.6 + totalActions * 0.1 + consistency * 0.3) * neglectPenalty),
    Shark:  Math.min(1, (feedRatio * 0.4 + actionFrequency * 0.4 + consistency * 0.2) * neglectPenalty),
    Bear:   Math.min(1, (actionFrequency * 0.5 + consistency * 0.5) * neglectPenalty),

    // Defense/Stable: consistent, low action variance
    Turtle: Math.min(1, (consistency * 0.7 + cleanRatio * 0.3) * (1 - actionFrequency * 0.2)),
    Golem:  Math.min(1, (consistency * 0.8 + cleanRatio * 0.2) * neglectPenalty),

    // Special/Intelligent: high inspection, varied engagement
    Octopus: Math.min(1, (inspectRatio * 0.4 + actionFrequency * 0.4 + consistency * 0.2) * neglectPenalty),
    Owl:     Math.min(1, (inspectRatio * 0.3 + consistency * 0.4 + actionFrequency * 0.3) * neglectPenalty),
    Dragon:  Math.min(1, (totalActions * 0.3 + consistency * 0.4 + actionFrequency * 0.3) * neglectPenalty),
    Frog:    Math.min(1, (actionFrequency * 0.5 + inspectRatio * 0.3 + consistency * 0.2) * neglectPenalty),

    // Social/Loyal: high praise, frequent check-ins
    Dog:     Math.min(1, (praiseRatio * 0.5 + inspectRatio * 0.3 + consistency * 0.2) * neglectPenalty),
    Wolf:    Math.min(1, (consistency * 0.6 + praiseRatio * 0.2 + actionFrequency * 0.2) * neglectPenalty),
    Monkey:  Math.min(1, (praiseRatio * 0.3 + actionFrequency * 0.4 + consistency * 0.3) * neglectPenalty),

    // Independent/Neglect-tolerant: high neglect, sparse interaction
    Snake:   Math.min(1, (1 - consistency) * (1 - actionFrequency) * 0.8),
    Fox:     Math.min(1, ((1 - consistency) * 0.4 + (1 - actionFrequency) * 0.4 + (neglect / 120) * 0.2)),

    // Balanced/Adaptive
    Fish:    Math.min(1, (actionFrequency * 0.5 + consistency * 0.3 + praiseRatio * 0.2) * neglectPenalty),
    Deer:    Math.min(1, (consistency * 0.6 + actionFrequency * 0.4) * neglectPenalty * 0.9),
    Boar:    Math.min(1, (feedRatio * 0.6 + actionFrequency * 0.4) * neglectPenalty),
  };
}

module.exports = {
  recordEggAction,
  calculateNeglectHours,
  calculateConsistency,
  convertToBehaviorScores,
};
