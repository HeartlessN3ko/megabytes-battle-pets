// src/engine/evolutionStatEngine.js
// Single source of truth for evolution stat bonuses.
// Additive-only stacking, under 30% max contribution per stage.

const SHAPE_BIAS = {
  Triangle: { Power: 5, Speed: 3 },
  Circle: { Stamina: 5, Defense: 3 },
  Square: { Defense: 5, Power: 2 },
  Diamond: { Accuracy: 5, Speed: 2 },
  Hexagon: { Special: 5, Stamina: 2 },
};

const ANIMAL_BIAS = {
  Cat: { Speed: 4, Accuracy: 3 },
  Dog: { Stamina: 4, Power: 3 },
  Bird: { Speed: 5 },
  Fish: { Speed: 3, Special: 3 },
  Rabbit: { Speed: 4, Stamina: 2 },
  Fox: { Speed: 3, Special: 3 },
  Wolf: { Power: 4, Speed: 3 },
  Bear: { Power: 5, Stamina: 4 },
  Turtle: { Defense: 6 },
  Snake: { Accuracy: 4, Speed: 3 },
  Frog: { Special: 4, Speed: 2 },
  Monkey: { Speed: 3, Special: 3 },
  Boar: { Power: 4, Defense: 3 },
  Deer: { Speed: 3, Stamina: 3 },
  Owl: { Special: 4, Accuracy: 3 },
  Lion: { Power: 5, Speed: 2 },
  Shark: { Power: 5, Speed: 3 },
  Octopus: { Special: 5, Accuracy: 3 },
  Dragon: { Power: 4, Special: 4 },
  Golem: { Defense: 6, Stamina: 3 },
};

const ELEMENT_BIAS = {
  Fire: { Power: 5 },
  Water: { Stamina: 5 },
  Earth: { Defense: 5 },
  Air: { Speed: 5 },
  Electric: { Speed: 3, Accuracy: 3 },
  Nature: { Stamina: 3, Special: 3 },
  Shadow: { Power: 3, Special: 3 },
  Holy: { Defense: 3, Special: 3 },
  Normal: { All: 2 },
};

const FEATURE_BIAS = {
  wings: { Speed: 3 },
  horns: { Power: 3 },
  spikes: { Power: 2, Defense: 1 },
  armor_plates: { Defense: 4 },
  tail_variant: { Power: 2, Speed: 1 },
  claws: { Power: 3 },
  fins: { Speed: 2, Special: 1 },
  frill: { Special: 3 },
  shell: { Defense: 5, Speed: -1 },
  aura_core: { Special: 2, Accuracy: 2 },
};

const BRANCH_BIAS = {
  Battle: { Power: 5, Defense: 3 },
  Nurture: { Special: 5, Stamina: 3 },
};

// Helper to merge stat objects additively
function mergeStats(...statObjects) {
  const result = {
    Power: 0,
    Agility: 0,
    Accuracy: 0,
    Defense: 0,
    Special: 0,
    Stamina: 0,
  };

  statObjects.forEach((obj) => {
    if (!obj) return;
    if (obj.All) {
      // Special handling for "All" distribution
      const allVal = obj.All;
      Object.keys(result).forEach((stat) => {
        result[stat] += allVal;
      });
    } else {
      Object.entries(obj).forEach(([stat, value]) => {
        if (stat in result) result[stat] += value;
      });
    }
  });

  return result;
}

// Main function: calculate total stat bonuses from evolution fields
function calculateStatBonuses(byte) {
  if (!byte) return {};

  const bonuses = mergeStats(
    byte.shape && SHAPE_BIAS[byte.shape],
    byte.animal && ANIMAL_BIAS[byte.animal],
    byte.element && ELEMENT_BIAS[byte.element],
    byte.feature && FEATURE_BIAS[byte.feature],
    byte.branch && BRANCH_BIAS[byte.branch],
  );

  return bonuses;
}

// Apply bonuses to a stat object, respecting the 30% cap per contribution
function applyEvolutionBonuses(baseStats, byte) {
  if (!byte || !baseStats) return baseStats;

  const bonuses = calculateStatBonuses(byte);
  const result = { ...baseStats };

  Object.entries(bonuses).forEach(([stat, bonus]) => {
    const baseStat = baseStats[stat] || 0;
    // Max contribution is 30% of base stat
    const cappedBonus = Math.min(bonus, Math.floor(baseStat * 0.3));
    result[stat] = baseStat + cappedBonus;
  });

  return result;
}

module.exports = {
  SHAPE_BIAS,
  ANIMAL_BIAS,
  ELEMENT_BIAS,
  FEATURE_BIAS,
  BRANCH_BIAS,
  calculateStatBonuses,
  applyEvolutionBonuses,
};
