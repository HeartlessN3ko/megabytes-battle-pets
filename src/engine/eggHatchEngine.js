// src/engine/eggHatchEngine.js
// Egg hatching: animal assignment + temperament calculation.
// Single source of truth for hatch-time behavior → trait mapping.

const { getTemperamentPassive } = require('../data/effectsRegistry');
const { ANIMAL_BIAS, SHAPE_BIAS } = require('./evolutionStatEngine');

/**
 * Assign animal based on behavior scores.
 * Returns the animal with highest score.
 * @param {Object} behaviorScores - 20 animal names → scores (0-1)
 * @returns {string} Assigned animal name
 */
function assignAnimal(behaviorScores) {
  if (!behaviorScores || typeof behaviorScores !== 'object') {
    return 'Dog'; // safe default
  }

  let bestAnimal = 'Dog';
  let bestScore = -1;

  Object.entries(behaviorScores).forEach(([animal, score]) => {
    if (score > bestScore) {
      bestScore = score;
      bestAnimal = animal;
    }
  });

  return bestAnimal;
}

/**
 * Calculate stat bias scores for shape and animal.
 * Returns normalized 0-1 scores for each stat.
 * @param {string} shape - Shape name
 * @param {string} animal - Animal name
 * @returns {Object} Bias scores { Power, Speed, etc. }
 */
function calculateBiasScores(shape, animal) {
  const result = {
    Power: 0,
    Speed: 0,
    Defense: 0,
    Special: 0,
    Accuracy: 0,
    Stamina: 0,
  };

  // Shape bias
  const shapeBias = SHAPE_BIAS[shape] || {};
  Object.entries(shapeBias).forEach(([stat, value]) => {
    result[stat] = (result[stat] || 0) + value;
  });

  // Animal bias
  const animalBias = ANIMAL_BIAS[animal] || {};
  Object.entries(animalBias).forEach(([stat, value]) => {
    if (stat === 'All') {
      // Special handling for "All" — add to all stats
      Object.keys(result).forEach((s) => {
        result[s] += value;
      });
    } else {
      result[stat] = (result[stat] || 0) + value;
    }
  });

  // Normalize to 0-1 range (max bias value is 6, so divide by 6 for rough norm)
  Object.keys(result).forEach((stat) => {
    result[stat] = Math.min(1, result[stat] / 6);
  });

  return result;
}

/**
 * Calculate weighted temperament score.
 * Formula: behavior_score * 0.6 + shape_bias * 0.1 + animal_bias * 0.15 + element_bias * 0.15
 * @param {number} behaviorScore - 0-1 behavior score from egg metrics
 * @param {Object} shapeBias - Bias scores from shape
 * @param {Object} animalBias - Bias scores from animal
 * @param {Object} elementBias - Bias scores from element (or empty for hatch)
 * @returns {Object} Temperament scores for each of 15 temperaments
 */
function calculateTemperamentScores(behaviorScore, shapeBias, animalBias, elementBias = {}) {
  if (!shapeBias) shapeBias = {};
  if (!animalBias) animalBias = {};
  if (!elementBias) elementBias = {};

  // Map temperaments to their stat affinities (simplified)
  const temperamentAffinities = {
    Noble: { Defense: 0.8, Power: 0.3 },
    Kind: { Special: 0.6, Accuracy: 0.4 },
    Calm: { Defense: 0.5, Stamina: 0.5 },
    Focused: { Accuracy: 0.9, Speed: 0.3 },
    Proud: { Power: 0.8, Speed: 0.5 },
    Fierce: { Power: 1.0, Defense: -0.3 },
    Energetic: { Speed: 1.0, Power: 0.5 },
    Alert: { Speed: 0.7, Accuracy: 0.7 },
    Sneaky: { Speed: 0.8, Accuracy: 0.6 },
    Mysterious: { Special: 0.8, Accuracy: 0.3 },
    Cold: { Defense: 0.9, Special: 0.2 },
    Wanderer: { Speed: 0.6, Stamina: 0.6 },
    Anxious: { Speed: 0.7, Defense: -0.2 },
    Unstable: { Power: 0.5, Special: 0.5 },
    Corrupt: { Power: 1.0, Special: 0.6 },
  };

  const scores = {};

  Object.entries(temperamentAffinities).forEach(([tempName, affinities]) => {
    let affinity = 0;
    let count = 0;

    Object.entries(affinities).forEach(([stat, weight]) => {
      const biasValue =
        (shapeBias[stat] || 0) * 0.1 +
        (animalBias[stat] || 0) * 0.15 +
        (elementBias[stat] || 0) * 0.15;

      affinity += biasValue * weight;
      count += 1;
    });

    // Weighted formula: 60% behavior, 25% stat bias affinity
    const finalScore =
      behaviorScore * 0.6 +
      (Math.max(0, affinity / count) || 0) * 0.4;

    scores[tempName] = Math.min(1, Math.max(0, finalScore));
  });

  return scores;
}

/**
 * Pick temperament from score object.
 * Returns the temperament with highest score.
 * @param {Object} temperamentScores - Temperament names → scores
 * @returns {string} Assigned temperament name
 */
function pickTemperament(temperamentScores) {
  if (!temperamentScores || typeof temperamentScores !== 'object') {
    return 'Kind'; // safe default
  }

  let bestTemp = 'Kind';
  let bestScore = -1;

  Object.entries(temperamentScores).forEach(([temp, score]) => {
    if (score > bestScore) {
      bestScore = score;
      bestTemp = temp;
    }
  });

  return bestTemp;
}

/**
 * Hatch a byte: assign animal + temperament, transition from egg, advance stage.
 * @param {Object} byte - Byte document
 * @param {Object} eggMetrics - Egg metrics (with feedCount, cleanCount, etc.)
 * @param {number} hatchAgeHours - Total hours egg was active
 * @param {Object} behaviorScores - Pre-calculated behavior scores (optional, will recalc if missing)
 * @returns {Object} Updated byte (not saved)
 */
function hatchByte(byte, eggMetrics, hatchAgeHours, behaviorScores = null) {
  if (!byte) return null;
  if (!byte.shape) throw new Error('Byte must have shape before hatching');

  const eggMetricsEngine = require('./eggMetricsEngine');

  // Calculate behavior scores if not provided
  if (!behaviorScores) {
    behaviorScores = eggMetricsEngine.convertToBehaviorScores(eggMetrics, hatchAgeHours);
  }

  // Assign animal from behavior scores
  const animal = assignAnimal(behaviorScores);

  // Calculate bias scores from shape + animal
  const shapeBias = calculateBiasScores(byte.shape, animal);
  const animalBias = calculateBiasScores(byte.shape, animal);

  // Average behavior score across all actions (simple heuristic)
  const behaviorScore = Object.values(behaviorScores).reduce((a, b) => a + b, 0) / 20;

  // Calculate temperament scores
  const tempScores = calculateTemperamentScores(behaviorScore, shapeBias, animalBias, {});

  // Pick temperament
  const temperament = pickTemperament(tempScores);

  // Verify temperament is valid
  try {
    getTemperamentPassive(temperament);
  } catch (e) {
    console.warn(`[eggHatchEngine] Invalid temperament ${temperament}, defaulting to Kind`);
    temperament = 'Kind';
  }

  // Transition byte from egg to hatched state
  byte.isEgg = false;
  byte.animal = animal;
  byte.temperament = temperament;
  byte.evolutionStage = 1; // Stage 1: shape + animal + temperament locked

  // Clear egg-specific fields
  byte.hatchAt = null;
  byte.eggMetrics = {};

  return byte;
}

module.exports = {
  assignAnimal,
  calculateBiasScores,
  calculateTemperamentScores,
  pickTemperament,
  hatchByte,
};
