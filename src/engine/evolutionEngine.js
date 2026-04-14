/**
 * EVOLUTION ENGINE
 * Handles stage progression, stat accumulation, egg shape assignment.
 * Sequential stages: shape → animal → element → feature → branch → temperament
 * Source: evolutionstats.md
 */

const { applyEvolutionBiases } = require('./statEngine');
const { calcTemperamentScore } = require('./temperamentEngine');

// Stage index map
const STAGES = ['shape', 'animal', 'element', 'feature', 'branch', 'temperament'];

// Evolution pacing (days per stage transition)
const EVO_PACING = {
  stage_0_to_1: 2,   // shape → animal
  stage_1_to_2: 4,   // animal → element
  stage_2_to_3: 7,   // element → feature
  stage_3_to_4: 10,  // feature → branch
  stage_4_to_5: 10   // branch → temperament
};

// Items required to trigger certain stages
const EVOLUTION_ITEM_GATES = {
  2: 'elemental_extension.pkg', // element stage
  3: 'feature_item.pkg',        // feature stage
  4: ['battlepatch.exe', 'carepatch.exe'] // branch stage — which one used determines Battle vs Nurture
};

// Shape assigned from egg care metrics
const SHAPE_RULES = {
  Triangle: (m) => m.neglectHours > 12 && m.feedCount < 3,
  Circle:   (m) => m.feedCount >= 5 && m.playCount >= 3,
  Square:   (m) => Math.abs(m.feedCount - m.playCount) <= 1 && m.trainingCount >= 2,
  Diamond:  (m) => m.consistency >= 0.8 && m.neglectHours < 2,
  Hexagon:  () => true // fallback / erratic behavior
};

/**
 * Assign shape from egg care metrics.
 * Priority: Triangle → Circle → Square → Diamond → Hexagon (fallback)
 */
function assignShape(eggMetrics) {
  for (const [shape, condition] of Object.entries(SHAPE_RULES)) {
    if (shape === 'Hexagon') continue;
    if (condition(eggMetrics)) return shape;
  }
  return 'Hexagon';
}

/**
 * Check whether a byte is eligible to evolve to the next stage.
 *
 * @param {Object} byte         — Byte document (plain object or Mongoose doc)
 * @param {string} itemUsed     — item ID used to trigger evolution (if any)
 * @returns {{ eligible: boolean, reason: string }}
 */
function checkEvolutionEligibility(byte, itemUsed = null) {
  const currentStage = byte.evolutionStage;

  if (currentStage >= 5) return { eligible: false, reason: 'Fully evolved' };

  // Level threshold: must be at least 5 levels into current stage bracket
  const stageLevel = getLevelForStage(currentStage);
  if (byte.level < stageLevel) {
    return { eligible: false, reason: `Need level ${stageLevel} for stage ${currentStage + 1}` };
  }

  // Item gate
  const requiredItem = EVOLUTION_ITEM_GATES[currentStage + 1];
  if (requiredItem) {
    if (Array.isArray(requiredItem)) {
      if (!requiredItem.includes(itemUsed)) {
        return { eligible: false, reason: `Requires one of: ${requiredItem.join(', ')}` };
      }
    } else if (itemUsed !== requiredItem) {
      return { eligible: false, reason: `Requires item: ${requiredItem}` };
    }
  }

  return { eligible: true, reason: null };
}

/**
 * Minimum level required to enter each stage gate.
 */
function getLevelForStage(currentStage) {
  const gates = [5, 10, 20, 35, 50, 75];
  return gates[currentStage] || 5;
}

/**
 * Execute evolution to the next stage.
 * Returns the updated byte fields to apply.
 *
 * @param {Object} byte      — current Byte document (plain object)
 * @param {Object} options   — { itemUsed, playerChoiceAnimal, playerChoiceElement, playerChoiceFeature }
 * @returns {Object}         — fields to $set on the Byte document
 */
function evolve(byte, options = {}) {
  const { eligible, reason } = checkEvolutionEligibility(byte, options.itemUsed);
  if (!eligible) throw new Error(`[EvolutionEngine] Cannot evolve: ${reason}`);

  const nextStage = byte.evolutionStage + 1;
  const updates = { evolutionStage: nextStage };

  switch (nextStage) {
    case 1: // Assign animal (random weighted by rarity — implement full rarity table separately)
      updates.animal = options.playerChoiceAnimal || assignAnimalByPlaystyle(byte.behaviorMetrics);
      break;

    case 2: // Assign element (driven by care habits & training patterns)
      updates.element = options.playerChoiceElement || assignElement(byte.behaviorMetrics);
      break;

    case 3: // Assign feature
      updates.feature = options.playerChoiceFeature || assignFeature(byte.behaviorMetrics, byte.element);
      break;

    case 4: // Branch — determined by item used
      if (options.itemUsed === 'battlepatch.exe') updates.branch = 'Battle';
      else if (options.itemUsed === 'carepatch.exe') updates.branch = 'Nurture';
      else updates.branch = assignBranchFromMetrics(byte.behaviorMetrics);
      break;

    case 5: // Temperament — locked in from full lifecycle metrics
      updates.temperament = calcTemperamentScore(byte).temperament;
      break;
  }

  // Recalculate stat biases for new stage
  updates.stats = applyEvolutionBiases(byte.stats, {
    shape:    updates.shape    || byte.shape,
    animal:   updates.animal   || byte.animal,
    element:  updates.element  || byte.element,
    feature:  updates.feature  || byte.feature,
    branch:   updates.branch   || byte.branch
  });

  return updates;
}

// --- Element assignment from care patterns ---
const ELEMENT_CONDITIONS = {
  Fire:     (m) => m.statFocusDistribution?.Power > 0.4 && m.lowEnergyTrainingCount > 5,
  Water:    (m) => m.restEnforcementRate > 0.6,
  Earth:    (m) => m.statFocusDistribution?.Defense > 0.4,
  Air:      (m) => m.statFocusDistribution?.Speed > 0.4,
  Electric: (m) => m.sessionLength < 5 && m.loginFrequency > 1.5,
  Nature:   (m) => m.playVsTrainRatio > 0.5,
  Shadow:   (m) => m.nonRewardCheckins < 2 && m.scoldCount > m.praiseCount,
  Holy:     (m) => m.praiseCount > m.scoldCount * 2,
  Normal:   () => true // fallback
};

function assignElement(metrics) {
  for (const [element, condition] of Object.entries(ELEMENT_CONDITIONS)) {
    if (element === 'Normal') continue;
    if (condition(metrics)) return element;
  }
  return 'Normal';
}

// --- Animal assignment by playstyle (simplified — full rarity table TBD) ---
function assignAnimalByPlaystyle(_metrics) {
  // Common: Cat, Dog, Bird, Fish, Rabbit
  // Uncommon: Fox, Wolf, Bear, Turtle, Snake, Frog, Monkey, Boar, Deer, Owl
  // Rare: Lion, Shark, Octopus
  // Very Rare: Dragon, Golem
  const rarityRoll = Math.random();
  if (rarityRoll < 0.40) return randomFrom(['Cat', 'Dog', 'Bird', 'Fish', 'Rabbit']);
  if (rarityRoll < 0.75) return randomFrom(['Fox', 'Wolf', 'Bear', 'Turtle', 'Snake', 'Frog', 'Monkey', 'Boar', 'Deer', 'Owl']);
  if (rarityRoll < 0.94) return randomFrom(['Lion', 'Shark', 'Octopus']);
  return randomFrom(['Dragon', 'Golem']);
}

function assignFeature(metrics, element) {
  const featureMap = {
    Fire: 'horns', Water: 'fins', Earth: 'armor_plates', Air: 'wings',
    Electric: 'aura_core', Nature: 'frill', Shadow: 'claws', Holy: 'aura_core', Normal: 'tail_variant'
  };
  return featureMap[element] || 'tail_variant';
}

function assignBranchFromMetrics(metrics) {
  return (metrics.playVsTrainRatio || 0) > 0.5 ? 'Nurture' : 'Battle';
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Late-game title applied at level milestones (70, 80, 90, 100).
 */
function getLateGameTitle(level) {
  if (level >= 100) return 'Legendary Data';
  if (level >= 90)  return 'Sage Data';
  if (level >= 80)  return 'Ancient';
  if (level >= 70)  return 'Elder';
  return null;
}

module.exports = {
  STAGES,
  EVO_PACING,
  EVOLUTION_ITEM_GATES,
  assignShape,
  assignElement,
  assignAnimalByPlaystyle,
  assignFeature,
  assignBranchFromMetrics,
  checkEvolutionEligibility,
  evolve,
  getLateGameTitle
};
