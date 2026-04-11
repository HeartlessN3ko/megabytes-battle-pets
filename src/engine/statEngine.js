/**
 * STAT ENGINE
 * Handles need → stat modifier calculation and all battle formulas.
 * All formulas are sourced directly from statsystemv1.md
 */

// --- NEED STATE THRESHOLDS ---
// (min, max, multiplier)
const NEED_STATES = {
  full:     { min: 75, max: 100, multiplier: 1.0 },
  stable:   { min: 50, max: 74,  multiplier: 0.9 },
  low:      { min: 25, max: 49,  multiplier: 0.75 },
  critical: { min: 0,  max: 24,  multiplier: 0.5 }
};

// Which stats each need affects
const NEED_EFFECTS = {
  Hunger:    ['Power', 'Stamina'],
  Bandwidth: ['Speed', 'Special'],
  Hygiene:   ['Defense', 'Accuracy'],
  Social:    ['Special', 'Power'],
  Fun:       ['Speed', 'Accuracy'],
  Mood:      ['Power', 'Speed', 'Defense', 'Stamina', 'Special', 'Accuracy'] // ALL
};

/**
 * Get the need state multiplier for a given need value (0–100).
 */
function getNeedMultiplier(needValue) {
  if (needValue >= 75) return NEED_STATES.full.multiplier;
  if (needValue >= 50) return NEED_STATES.stable.multiplier;
  if (needValue >= 25) return NEED_STATES.low.multiplier;
  return NEED_STATES.critical.multiplier;
}

/**
 * Compute final stats after applying need modifiers.
 * formula: final_stat = base_stat * product_of_need_modifiers
 *
 * @param {Object} baseStats  — { Power, Speed, Defense, Stamina, Special, Accuracy }
 * @param {Object} needs      — { Hunger, Bandwidth, Hygiene, Social, Fun, Mood }
 * @returns {Object} finalStats
 */
function applyNeedModifiers(baseStats, needs) {
  // Build per-stat multiplier accumulator
  const modifiers = {
    Power: 1, Speed: 1, Defense: 1, Stamina: 1, Special: 1, Accuracy: 1
  };

  for (const [need, value] of Object.entries(needs)) {
    const mult = getNeedMultiplier(value);
    const affectedStats = NEED_EFFECTS[need] || [];
    for (const stat of affectedStats) {
      modifiers[stat] *= mult;
    }
  }

  const finalStats = {};
  for (const [stat, base] of Object.entries(baseStats)) {
    finalStats[stat] = Math.max(0, Math.min(100, Math.round(base * modifiers[stat])));
  }
  return finalStats;
}

// --- BATTLE FORMULAS ---

/**
 * Damage dealt per hit.
 * formula: move_power * (Power / (Power + Defense))
 */
function calcDamage(movePower, attackerPower, defenderDefense) {
  if (attackerPower + defenderDefense === 0) return 0;
  return movePower * (attackerPower / (attackerPower + defenderDefense));
}

/**
 * Attacks per second.
 * formula: base_rate * (1 + Speed * 0.01)
 */
function calcAttackRate(baseRate, speed) {
  return baseRate * (1 + speed * 0.01);
}

/**
 * Hit chance (0.0–1.0).
 * formula: move_accuracy + (Accuracy * 0.3) - (Speed * 0.2)
 * Clamped to [0, 1].
 */
function calcHitChance(moveAccuracy, attackerAccuracy, defenderSpeed) {
  return Math.max(0, Math.min(1, moveAccuracy + (attackerAccuracy * 0.3) - (defenderSpeed * 0.2)));
}

/**
 * Max HP.
 * formula: base_hp + (Stamina * 10)
 */
function calcMaxHP(baseHP = 50, stamina) {
  return baseHP + (stamina * 10);
}

/**
 * Effect/status strength scaling.
 * formula: base_effect * (1 + Special * 0.01)
 */
function calcEffectStrength(baseEffect, special) {
  return baseEffect * (1 + special * 0.01);
}

/**
 * Status duration scaling.
 * formula: base_duration * (1 + Special * 0.005)
 */
function calcStatusDuration(baseDuration, special) {
  return Math.round(baseDuration * (1 + special * 0.005));
}

// --- XP SYSTEM ---

/**
 * XP required to reach a level.
 * levels 1–50: 50 * level
 * levels 51–100: 50 * (level^2)
 */
function xpRequired(level) {
  if (level <= 50) return 50 * level;
  return 50 * Math.pow(level, 2);
}

// --- TRAINING GAIN MULTIPLIERS ---
const TRAINING_GAIN = {
  perfect: 1.5,
  good:    1.0,
  fail:    0.5
};

/**
 * Returns post-diminishing-returns multiplier for training sessions today.
 * Effective up to 5 sessions/day, then 0.5x.
 */
function trainingMultiplier(sessionsToday) {
  return sessionsToday < 5 ? 1.0 : 0.5;
}

// --- STAT BIASES FROM EVOLUTION STAGES ---

const SHAPE_BIAS = {
  Triangle: { Power: 5, Speed: 3 },
  Circle:   { Stamina: 5, Defense: 3 },
  Square:   { Defense: 5, Power: 2 },
  Diamond:  { Accuracy: 5, Speed: 2 },
  Hexagon:  { Special: 5, Stamina: 2 }
};

const ANIMAL_BIAS = {
  Cat:     { Speed: 4, Accuracy: 3 },
  Dog:     { Stamina: 4, Power: 3 },
  Bird:    { Speed: 5 },
  Fish:    { Speed: 3, Special: 3 },
  Rabbit:  { Speed: 4, Stamina: 2 },
  Fox:     { Speed: 3, Special: 3 },
  Wolf:    { Power: 4, Speed: 3 },
  Bear:    { Power: 5, Stamina: 4 },
  Turtle:  { Defense: 6 },
  Snake:   { Accuracy: 4, Speed: 3 },
  Frog:    { Special: 4, Speed: 2 },
  Monkey:  { Speed: 3, Special: 3 },
  Boar:    { Power: 4, Defense: 3 },
  Deer:    { Speed: 3, Stamina: 3 },
  Owl:     { Special: 4, Accuracy: 3 },
  Lion:    { Power: 5, Speed: 2 },
  Shark:   { Power: 5, Speed: 3 },
  Octopus: { Special: 5, Accuracy: 3 },
  Dragon:  { Power: 4, Special: 4 },
  Golem:   { Defense: 6, Stamina: 3 }
};

const ELEMENT_BIAS = {
  Fire:     { Power: 5 },
  Water:    { Stamina: 5 },
  Earth:    { Defense: 5 },
  Air:      { Speed: 5 },
  Electric: { Speed: 3, Accuracy: 3 },
  Nature:   { Stamina: 3, Special: 3 },
  Shadow:   { Power: 3, Special: 3 },
  Holy:     { Defense: 3, Special: 3 },
  Normal:   { Power: 2, Speed: 2, Defense: 2, Stamina: 2, Special: 2, Accuracy: 2 }
};

const FEATURE_BIAS = {
  wings:        { Speed: 3 },
  horns:        { Power: 3 },
  spikes:       { Power: 2, Defense: 1 },
  armor_plates: { Defense: 4 },
  tail_variant: { Power: 2, Speed: 1 },
  claws:        { Power: 3 },
  fins:         { Speed: 2, Special: 1 },
  frill:        { Special: 3 },
  shell:        { Defense: 5, Speed: -1 },
  aura_core:    { Special: 2, Accuracy: 2 }
};

const BRANCH_BIAS = {
  Battle:  { Power: 5, Defense: 3 },
  Nurture: { Special: 5, Stamina: 3 }
};

/**
 * Apply all evolution stage biases to a stat object.
 * Additive only. Total contribution must stay under 30% of max (100).
 */
function applyEvolutionBiases(baseStats, { shape, animal, element, feature, branch }) {
  const result = { ...baseStats };
  const biases = [
    SHAPE_BIAS[shape]   || {},
    ANIMAL_BIAS[animal] || {},
    ELEMENT_BIAS[element] || {},
    FEATURE_BIAS[feature] || {},
    BRANCH_BIAS[branch] || {}
  ];

  for (const bias of biases) {
    for (const [stat, val] of Object.entries(bias)) {
      result[stat] = Math.max(0, Math.min(100, (result[stat] || 0) + val));
    }
  }
  return result;
}

module.exports = {
  NEED_STATES,
  NEED_EFFECTS,
  TRAINING_GAIN,
  SHAPE_BIAS,
  ANIMAL_BIAS,
  ELEMENT_BIAS,
  FEATURE_BIAS,
  BRANCH_BIAS,
  getNeedMultiplier,
  applyNeedModifiers,
  calcDamage,
  calcAttackRate,
  calcHitChance,
  calcMaxHP,
  calcEffectStrength,
  calcStatusDuration,
  xpRequired,
  trainingMultiplier,
  applyEvolutionBiases
};
