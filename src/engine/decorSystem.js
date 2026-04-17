/**
 * DECOR SYSTEM (STUB)
 * Room score calculation and item modifiers.
 * TODO: Full item catalog, set bonuses, purchase logic.
 */

const DECOR_TIERS = {
  poor: { scoreMin: 0, scoreMax: 24, passiveGain: -0.08, decayMult: 1.08 },
  basic: { scoreMin: 25, scoreMax: 49, passiveGain: 0, decayMult: 1.0 },
  comfort: { scoreMin: 50, scoreMax: 74, passiveGain: 0.08, decayMult: 0.95 },
  premium: { scoreMin: 75, scoreMax: 89, passiveGain: 0.12, decayMult: 0.92 },
  luxury: { scoreMin: 90, scoreMax: 100, passiveGain: 0.18, decayMult: 0.88 },
};

/**
 * Calculate room score from items.
 * @param {Array} items - array of { value, type }
 * @returns {number} 0–100
 */
function calculateRoomScore(items = []) {
  const sum = items.reduce((s, item) => s + (item.value || 0), 0);
  return Math.min(100, sum);
}

/**
 * Get tier modifiers from room score.
 */
function getTierModifiers(roomScore) {
  for (const [tierName, config] of Object.entries(DECOR_TIERS)) {
    if (roomScore >= config.scoreMin && roomScore <= config.scoreMax) {
      return { tier: tierName, ...config };
    }
  }
  return DECOR_TIERS.basic;
}

module.exports = {
  DECOR_TIERS,
  calculateRoomScore,
  getTierModifiers,
};
