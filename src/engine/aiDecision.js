/**
 * AI DECISION ENGINE
 * Governs move selection during auto-battle.
 * Behavior is influenced by temperament — the byte has a personality and makes its own calls.
 */

// Temperament → behavior weights
// Values are relative priorities: higher = more likely to pick that strategy.
const TEMPERAMENT_PROFILES = {
  Noble:      { damage: 0.5, buff: 0.3, debuff: 0.1, ult: 0.1, ultThreshold: 0.40 },
  Kind:       { damage: 0.3, buff: 0.5, debuff: 0.1, ult: 0.1, ultThreshold: 0.30 },
  Calm:       { damage: 0.4, buff: 0.3, debuff: 0.2, ult: 0.1, ultThreshold: 0.50 },
  Focused:    { damage: 0.6, buff: 0.1, debuff: 0.2, ult: 0.1, ultThreshold: 0.35 },
  Proud:      { damage: 0.6, buff: 0.2, debuff: 0.1, ult: 0.1, ultThreshold: 0.60 }, // saves ult for when strong
  Fierce:     { damage: 0.7, buff: 0.1, debuff: 0.1, ult: 0.1, ultThreshold: 0.20 }, // fires ult early
  Energetic:  { damage: 0.5, buff: 0.2, debuff: 0.2, ult: 0.1, ultThreshold: 0.30 },
  Alert:      { damage: 0.4, buff: 0.2, debuff: 0.3, ult: 0.1, ultThreshold: 0.40 },
  Sneaky:     { damage: 0.5, buff: 0.1, debuff: 0.3, ult: 0.1, ultThreshold: 0.45 },
  Mysterious: { damage: 0.4, buff: 0.2, debuff: 0.2, ult: 0.2, ultThreshold: 0.40 },
  Cold:       { damage: 0.5, buff: 0.2, debuff: 0.2, ult: 0.1, ultThreshold: 0.50 },
  Wanderer:   { damage: 0.4, buff: 0.3, debuff: 0.2, ult: 0.1, ultThreshold: 0.40 },
  Anxious:    { damage: 0.4, buff: 0.3, debuff: 0.1, ult: 0.2, ultThreshold: 0.25 }, // nervous, fires ult quickly
  Unstable:   { damage: 0.3, buff: 0.2, debuff: 0.2, ult: 0.3, ultThreshold: null }, // random
  Corrupt:    { damage: 0.7, buff: 0.0, debuff: 0.2, ult: 0.1, ultThreshold: 0.15 }  // aggression first
};

const DEFAULT_PROFILE = { damage: 0.5, buff: 0.2, debuff: 0.2, ult: 0.1, ultThreshold: 0.40 };

/**
 * Choose a move for the actor to use against the target.
 *
 * @param {Object} actor       — combatant state (from battleEngine)
 * @param {Object} target      — combatant state
 * @param {boolean} playerSuggestedUlt — player pressed "Suggest Ult"
 * @returns {string}           — move ID
 */
function chooseMove(actor, target, playerSuggestedUlt = false, movesMap = {}) {
  const profile = TEMPERAMENT_PROFILES[actor.temperament] || DEFAULT_PROFILE;

  // Unstable: fully random pick
  if (actor.temperament === 'Unstable') {
    const allMoves = [...actor.equippedMoves];
    if (actor.equippedUlt && actor.ultReady && !actor.ultSilenced) allMoves.push(actor.equippedUlt);
    return allMoves[Math.floor(Math.random() * allMoves.length)] || 'basic_ping.py';
  }

  // Silence check
  if (actor.ultSilenced) {
    actor.equippedUlt = null; // temporarily treat as no ult
  }

  // Consider using ult
  const hpPct = actor.hp / actor.maxHP;
  const ultThreshold = profile.ultThreshold;
  const shouldConsiderUlt = actor.equippedUlt && actor.ultReady && !actor.ultSilenced;

  if (shouldConsiderUlt) {
    let fireUlt = false;

    // Player suggested ult — byte may or may not comply (personality-based)
    if (playerSuggestedUlt) {
      const compliance = getUltCompliance(actor.temperament);
      fireUlt = Math.random() < compliance;
    }

    // Autonomous decision: fire if HP drops below threshold
    if (!fireUlt && ultThreshold !== null && hpPct <= ultThreshold) {
      fireUlt = Math.random() < 0.65; // 65% chance to fire when threshold is met
    }

    if (fireUlt) {
      actor.ultReady = false;
      return actor.equippedUlt;
    }
  }

  // Pick from equipped moves using weighted random
  const moveFunctions = getMoveFunction(actor.equippedMoves, movesMap);
  const weights = moveFunctions.map(fn => profile[fn] || 0.2);
  const chosen = weightedRandom(actor.equippedMoves, weights);

  return chosen || 'basic_ping.py';
}

/**
 * How likely the byte is to comply with a player-suggested ult.
 * Reflects personality trust dynamic.
 */
function getUltCompliance(temperament) {
  const compliance = {
    Noble: 0.7, Kind: 0.9, Calm: 0.8, Focused: 0.6,
    Proud: 0.3,   // proud byte ignores suggestions
    Fierce: 0.5, Energetic: 0.7, Alert: 0.6,
    Sneaky: 0.4, Mysterious: 0.4,
    Cold: 0.3,   // cold byte does its own thing
    Wanderer: 0.5, Anxious: 0.8, Unstable: 0.5,
    Corrupt: 0.2 // corrupt byte almost never listens
  };
  return compliance[temperament] ?? 0.5;
}

/**
 * Map move IDs to their function category (damage/buff/debuff).
 * In production, this would look up the move from the registry.
 * For now we return 'damage' as the safe default — replace with DB lookup.
 */
function getMoveFunction(moveIds, movesMap = {}) {
  return moveIds.map((moveId) => {
    const fn = String(movesMap?.[moveId]?.function || 'Damage').toLowerCase();
    if (fn === 'buff') return 'buff';
    if (fn === 'debuff') return 'debuff';
    if (fn === 'status') return 'debuff';
    if (fn === 'utility') return 'buff';
    return 'damage';
  });
}

/**
 * Weighted random selection.
 */
function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return items[i];
  }
  return items[items.length - 1];
}

module.exports = { chooseMove, getUltCompliance, TEMPERAMENT_PROFILES };
