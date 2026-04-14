/**
 * SOFTLOCK ENGINE
 * Detects and resolves all unrecoverable states.
 * Rules: no state can fully block player progression. Recovery is automatic.
 * Source: softlock.md
 */

/* effectsRegistry reserved for future softlock rule expansion */

const DEFAULT_MOVE = {
  id:       'basic_ping.py',
  element:  'Normal',
  function: 'Damage',
  power:    5,
  accuracy: 1.0
};

const RECOVERY_PATCH = {
  itemId: 'recovery_patch.pkg',
  restoreNeeds: {
    Hunger:    50,
    Bandwidth: 50,
    Hygiene:   50,
    Social:    50,
    Fun:       50,
    Mood:      50
  },
  cleanse:             true,
  corruptionReduction: 30
};

/**
 * Run all softlock checks against the current game state.
 * Returns an array of triggered checks and the recovery actions to apply.
 *
 * @param {Object} byte    — current Byte document (plain object)
 * @param {Object} player  — current Player document (plain object)
 * @returns {{ triggered: string[], recovery: Object }}
 */
function checkSoftlocks(byte, player) {
  const triggered = [];
  const recovery  = {};

  // 1. No equipped moves
  if (!byte.equippedMoves || byte.equippedMoves.length === 0) {
    triggered.push('no_available_moves');
    recovery.assignDefaultMove = DEFAULT_MOVE.id;
  }

  // 2. All needs critical (all ≤ 24)
  const needs = byte.needs || {};
  const allCritical = Object.values(needs).every(v => v <= 24);
  if (allCritical) {
    triggered.push('all_needs_critical');
    recovery.grantRecoveryPatch = true;
    recovery.restoreNeeds = RECOVERY_PATCH.restoreNeeds;
  }

  // 3. Corruption at max (≥ 100)
  if ((byte.corruption || 0) >= 100) {
    triggered.push('unrecoverable_corruption');
    recovery.reduceCorruptionTo = 80;
    recovery.grantRecoveryPatch = true;
  }

  // 4. No currency and no actions available (economy softlock)
  if ((player.byteBits || 0) === 0) {
    triggered.push('no_currency_no_actions');
    recovery.grantMinigameAccess = true; // always give a free minigame path
  }

  // 5. Bandwidth at 0 — block training, allow rest only
  if ((needs.Bandwidth || 100) <= 0) {
    triggered.push('zero_bandwidth');
    recovery.restrictTraining = true;
    recovery.allowRestOnly    = true;
  }

  return { triggered, recovery };
}

/**
 * Apply recovery actions to byte and player objects.
 * Mutates in place and returns updated copies.
 */
function applyRecovery(byte, player, recovery) {
  const b = { ...byte };
  const p = { ...player };

  if (recovery.assignDefaultMove) {
    b.equippedMoves = [DEFAULT_MOVE.id];
    if (!b.learnedMoves.includes(DEFAULT_MOVE.id)) {
      b.learnedMoves = [...(b.learnedMoves || []), DEFAULT_MOVE.id];
    }
  }

  if (recovery.restoreNeeds) {
    const needs = { ...b.needs };
    for (const [need, amount] of Object.entries(recovery.restoreNeeds)) {
      needs[need] = Math.min(100, (needs[need] || 0) + amount);
    }
    b.needs = needs;
  }

  if (recovery.reduceCorruptionTo !== undefined) {
    b.corruption = Math.min(b.corruption || 100, recovery.reduceCorruptionTo);
  }

  if (recovery.grantRecoveryPatch) {
    // Grant item to player inventory — handled at route level
    // Flag here for route to process
    p._grantItem = RECOVERY_PATCH.itemId;
  }

  return { byte: b, player: p };
}

/**
 * Handle byte death: archive byte, generate legacy egg.
 * Returns the legacy egg fields to create a new Byte document.
 */
function handleDeath(byte) {
  // Select a move to pass down (prefer ult, else random equipped move)
  const legacyMove = byte.equippedUlt || byte.equippedMoves?.[0] || DEFAULT_MOVE.id;

  // Stat bonus from best stat
  const stats = byte.stats || {};
  const bestStat = Object.entries(stats).sort((a, b) => b[1] - a[1])[0];
  const legacyStatBonus = bestStat ? { [bestStat[0]]: Math.floor(bestStat[1] * 0.1) } : {};

  return {
    isEgg:           true,
    hatchAt:         new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h hatch window
    inheritedMove:   legacyMove,
    inheritedStatBonus: legacyStatBonus,
    generation:      (byte.generation || 1) + 1,
    needsClear:      true // reset needs to full on new hatch
  };
}

/**
 * Corruption failsafe: auto-reduce to 80 if corruption reaches 100.
 * Called during any state update that modifies corruption.
 */
function clampCorruption(corruption) {
  return corruption >= 100 ? 80 : corruption;
}

module.exports = {
  DEFAULT_MOVE,
  RECOVERY_PATCH,
  checkSoftlocks,
  applyRecovery,
  handleDeath,
  clampCorruption
};
