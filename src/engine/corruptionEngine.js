/**
 * CORRUPTION ENGINE
 * Single source of truth for corruption gain, decay, and tier logic.
 * All values sourced from corruptionstates.md.
 */

// --- GAIN TRIGGERS ---
// Applied per event. stability modifier can halve these.
const CORRUPTION_GAIN = {
  NEEDS_CRITICAL_TICK: 2,   // any need in critical state at check-in
  OVERTRAINING:        3,   // bandwidth <= 0 and training attempted
  STATUS_AFFLICTED:    1,   // per battle tick while status active (battle engine)
  NEGLECT_TIME:        1,   // per decay tick where any need is critical
  CORRUPT_FOOD:        5,   // using a corrupt food item
};

// --- DECAY (CLEANING) ---
const CORRUPTION_DECAY = {
  BATHROOM_CLEAN: 15,   // standard clean action
  PERFECT_CLEAN:  25,   // reserved for future deep-clean item
  PASSIVE:         1,   // per decay tick when all needs >= 50
  CLINIC:         30,   // clinic deep purge
};

// --- TIER THRESHOLDS ---
// source: corruptionstates.md
const TIERS = [
  { tier: 'critical', min: 85 },
  { tier: 'heavy',    min: 60 },
  { tier: 'medium',   min: 30 },
  { tier: 'light',    min: 10 },
  { tier: 'none',     min: 0  },
];

/**
 * Derive corruption tier string from a 0–100 value.
 * @param {number} value
 * @returns {'none'|'light'|'medium'|'heavy'|'critical'}
 */
function getCorruptionTier(value) {
  const v = Number(value) || 0;
  for (const { tier, min } of TIERS) {
    if (v >= min) return tier;
  }
  return 'none';
}

/**
 * Stability check: Mood >= 50 AND Hygiene >= 50 → gains are halved.
 * @param {Object} needs
 * @returns {number} 0.5 if stable, 1.0 otherwise
 */
function stabilityModifier(needs) {
  if ((needs?.Mood ?? 0) >= 50 && (needs?.Hygiene ?? 0) >= 50) return 0.5;
  return 1.0;
}

/**
 * Hygiene modifier: corruption gain scales with how dirty the byte is.
 * Hygiene 100 = 1.0x gain (baseline)
 * Hygiene 50 = 1.2x gain (moderately dirty)
 * Hygiene 0 = 1.4x gain (very dirty = more corruption accumulation)
 * @param {Object} needs
 * @returns {number} multiplier from 1.0 to 1.4
 */
function hygieneModifier(needs) {
  const hygiene = Math.max(0, Math.min(100, needs?.Hygiene ?? 100));
  // Linear: dirtiness = (100-hygiene)/100, ranges 0 to 1
  // modifier = 1.0 + (dirtiness * 0.4)
  const dirtiness = (100 - hygiene) / 100;
  return 1.0 + dirtiness * 0.4;
}

/**
 * Apply a corruption gain trigger.
 * Applies stability modifier, hygiene modifier, and optional demo speed multiplier.
 * Clamps result to [0, 100].
 *
 * @param {number} current   - current corruption value
 * @param {string} trigger   - key from CORRUPTION_GAIN
 * @param {Object} needs     - current needs (for stability & hygiene checks)
 * @param {number} [speedMult=1] - demo speed multiplier
 * @returns {number} new corruption value
 */
function applyGain(current, trigger, needs, speedMult = 1) {
  const base = CORRUPTION_GAIN[trigger];
  if (base == null) {
    throw new Error(`[CorruptionEngine] Unknown gain trigger: "${trigger}"`);
  }
  const safeSpeed = Number.isFinite(speedMult) && speedMult > 0 ? speedMult : 1;
  const raw = base * stabilityModifier(needs) * hygieneModifier(needs) * safeSpeed;
  return Math.min(100, Math.max(0, (Number(current) || 0) + raw));
}

/**
 * Apply a corruption decay source.
 * @param {number} current
 * @param {string} source - key from CORRUPTION_DECAY
 * @returns {number} new corruption value (clamped to [0, 100])
 */
function applyDecay(current, source) {
  const amount = CORRUPTION_DECAY[source];
  if (amount == null) {
    throw new Error(`[CorruptionEngine] Unknown decay source: "${source}"`);
  }
  return Math.max(0, (Number(current) || 0) - amount);
}

/**
 * Apply passive corruption decay if all needs are >= 50.
 * Per-tick, called at each decay check-in.
 *
 * @param {number} current
 * @param {Object} needs
 * @returns {number} new corruption value
 */
function applyPassiveDecay(current, needs) {
  const NEED_KEYS = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];
  const allHealthy = NEED_KEYS.every((k) => (needs?.[k] ?? 0) >= 50);
  if (!allHealthy) return Number(current) || 0;
  return Math.max(0, (Number(current) || 0) - CORRUPTION_DECAY.PASSIVE);
}

module.exports = {
  CORRUPTION_GAIN,
  CORRUPTION_DECAY,
  getCorruptionTier,
  stabilityModifier,
  hygieneModifier,
  applyGain,
  applyDecay,
  applyPassiveDecay,
};
