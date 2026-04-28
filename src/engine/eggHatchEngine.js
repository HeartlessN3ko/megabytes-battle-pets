// src/engine/eggHatchEngine.js
// Egg hatching: animal assignment + temperament calculation.
// Single source of truth for hatch-time behavior → trait mapping.

const { getTemperamentPassive } = require('../data/effectsRegistry');
const { ANIMAL_BIAS, SHAPE_BIAS } = require('./evolutionStatEngine');
const personalityEngine = require('./personalityEngine');

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

// GDD temperament weights — matches src/engine/temperamentEngine.js WEIGHTS
const WEIGHTS = { behavior: 0.60, shape: 0.10, animal: 0.15, element: 0.15 };

// Per-temperament stat affinities (shared across sources)
const TEMPERAMENT_AFFINITIES = {
  Noble:      { Defense: 0.8, Power: 0.3 },
  Kind:       { Special: 0.6, Accuracy: 0.4 },
  Calm:       { Defense: 0.5, Stamina: 0.5 },
  Focused:    { Accuracy: 0.9, Speed: 0.3 },
  Proud:      { Power: 0.8, Speed: 0.5 },
  Fierce:     { Power: 1.0, Defense: -0.3 },
  Energetic:  { Speed: 1.0, Power: 0.5 },
  Alert:      { Speed: 0.7, Accuracy: 0.7 },
  Sneaky:     { Speed: 0.8, Accuracy: 0.6 },
  Mysterious: { Special: 0.8, Accuracy: 0.3 },
  Cold:       { Defense: 0.9, Special: 0.2 },
  Wanderer:   { Speed: 0.6, Stamina: 0.6 },
  Anxious:    { Speed: 0.7, Defense: -0.2 },
  Unstable:   { Power: 0.5, Special: 0.5 },
  Corrupt:    { Power: 1.0, Special: 0.6 },
};

/**
 * Compute one source's affinity score for a given temperament.
 * Normalized 0-1 via simple mean of weighted stat contributions.
 */
function affinityFromBias(bias, affinities) {
  if (!bias) return 0;
  const statEntries = Object.entries(affinities);
  if (statEntries.length === 0) return 0;
  let sum = 0;
  statEntries.forEach(([stat, weight]) => {
    sum += (bias[stat] || 0) * weight;
  });
  return Math.max(0, sum / statEntries.length);
}

/**
 * Calculate weighted temperament score.
 * Formula (GDD-aligned): behavior*0.60 + shape*0.10 + animal*0.15 + element*0.15
 * Matches the split used by temperamentEngine.calcTemperamentScore.
 * @param {number} behaviorScore - 0-1 behavior score from egg metrics
 * @param {Object} shapeBias - Shape-only stat bias
 * @param {Object} animalBias - Animal-only stat bias
 * @param {Object} elementBias - Element-only stat bias (empty at hatch, stage 1)
 * @returns {Object} Temperament scores for each of 15 temperaments
 */
function calculateTemperamentScores(behaviorScore, shapeBias, animalBias, elementBias = {}) {
  shapeBias   = shapeBias   || {};
  animalBias  = animalBias  || {};
  elementBias = elementBias || {};

  const scores = {};
  Object.entries(TEMPERAMENT_AFFINITIES).forEach(([tempName, affinities]) => {
    const shapeAff   = affinityFromBias(shapeBias,   affinities);
    const animalAff  = affinityFromBias(animalBias,  affinities);
    const elementAff = affinityFromBias(elementBias, affinities);

    const finalScore =
      behaviorScore * WEIGHTS.behavior +
      shapeAff      * WEIGHTS.shape +
      animalAff     * WEIGHTS.animal +
      elementAff    * WEIGHTS.element;

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
 * Hatch a byte: transition from egg → baby (v1 lifespan).
 * v1 leaves animal + temperament UNLOCKED — they belong to [EXPANSION 1] (animal)
 * or drift internally over time (temperament). The helpers above (assignAnimal,
 * calculateTemperamentScores, pickTemperament) are kept exported for the
 * Expansion 1 hatch path when it ships.
 *
 * @param {Object} byte - Byte document
 * @param {Object} _eggMetrics - Egg metrics (unused in v1, kept for signature compat)
 * @param {number} _hatchAgeHours - unused in v1
 * @param {Object} _behaviorScores - unused in v1
 * @returns {Object} Updated byte (not saved)
 */
function hatchByte(byte, _eggMetrics, _hatchAgeHours, _behaviorScores = null) {
  if (!byte) return null;
  if (!byte.shape) throw new Error('Byte must have shape before hatching');

  // Transition byte from egg → baby (v1 lifespan stage 1)
  byte.isEgg = false;
  byte.lifespanStage = 'baby';

  // v1: animal + temperament stay null. Animal is [EXPANSION 1].
  // Temperament drifts over time via temperamentEngine, hidden from the player.
  byte.animal = null;
  byte.temperament = null;

  // evolutionStage stays at 0 in v1 (forward-compat field for Expansion 1 only)
  byte.evolutionStage = 0;

  // Clear egg-specific fields
  byte.hatchAt = null;
  byte.eggMetrics = {};

  // Seed personality axes with temperament-baseline + jitter so the byte
  // feels distinct from day one. Temperament is null at v1 hatch, so this
  // pulls the DEFAULT_BASELINE {50, 50, 50} ±8 jitter.
  personalityEngine.initFromHatch(byte, byte.temperament || null);

  return byte;
}

module.exports = {
  assignAnimal,
  calculateBiasScores,
  calculateTemperamentScores,
  pickTemperament,
  hatchByte,
};
