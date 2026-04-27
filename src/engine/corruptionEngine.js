/**
 * CORRUPTION ENGINE
 * Time-based neglect accrual + event-driven gains.
 * Rate tuned by gameBalance.CORRUPTION_FULL_HOURS.
 */

const gameBalance = require('../config/gameBalance');

// --- EVENT-DRIVEN GAIN TRIGGERS ---
// Applied per event. stability modifier can halve these.
// Time-based neglect (hygiene-driven) is handled separately in applyTimeBasedNeglect.
const CORRUPTION_GAIN = {
  NEEDS_CRITICAL_TICK: 2,   // legacy: per check-in if any need critical (retained for callers)
  OVERTRAINING:        3,   // bandwidth <= 0 and training attempted
  STATUS_AFFLICTED:    1,   // per battle tick while status active (battle engine)
  NEGLECT_TIME:        1,   // legacy: per decay tick (retained for callers)
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
 * Applies stability modifier and hygiene modifier. Clamps result to [0, 100].
 *
 * @param {number} current   - current corruption value
 * @param {string} trigger   - key from CORRUPTION_GAIN
 * @param {Object} needs     - current needs (for stability & hygiene checks)
 * @param {number} [speedMult=1] - reserved multiplier (default 1)
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

/**
 * Defense stat → corruption-gain reduction multiplier.
 * Defense 10 (default) = 1.0x (neutral).
 * Each Defense point above 10 reduces by 0.02. Clamped to [0.5, 1.0].
 * v1 stat cap is 25, so max reduction is 30% (0.70x).
 *
 * @param {number} defense
 * @returns {number} multiplier 0.5–1.0
 */
function defenseModifier(defense = 10) {
  const d = Number(defense) || 10;
  const mult = 1 - (d - 10) * 0.02;
  return Math.max(0.5, Math.min(1.0, mult));
}

/**
 * Time-based neglect accrual.
 * Rate scales with dirtiness: at Hygiene=0 → full rate (100 in CORRUPTION_FULL_HOURS),
 * at Hygiene=100 → 0. Critical needs add a modest bonus. Defense reduces gain.
 *
 * @param {number} current
 * @param {Object} needs
 * @param {number} minutesElapsed - real minutes since last tick (already capped upstream)
 * @param {number} [speedMult=1]  - reserved multiplier (default 1)
 * @param {number} [defense=10]   - byte.stats.Defense; reduces gain via defenseModifier()
 * @returns {number} new corruption value (clamped to [0, 100])
 */
function applyTimeBasedNeglect(current, needs, minutesElapsed, speedMult = 1, defense = 10) {
  if (!minutesElapsed || minutesElapsed <= 0) return Number(current) || 0;
  const hygiene = Math.max(0, Math.min(100, Number(needs?.Hygiene ?? 100)));
  const dirtiness = (100 - hygiene) / 100;   // 0..1
  if (dirtiness <= 0) return Number(current) || 0;

  const NEED_KEYS = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];
  const criticalCount = NEED_KEYS.reduce((n, k) => n + ((needs?.[k] ?? 100) < 30 ? 1 : 0), 0);
  const critMod = 1 + Math.min(3, criticalCount) * 0.15;  // up to 1.45x

  const safeSpeed = Number.isFinite(speedMult) && speedMult > 0 ? speedMult : 1;
  const defMod = defenseModifier(defense);
  const rate = gameBalance.corruptionRatePerMinute() * dirtiness * critMod * safeSpeed * defMod;
  const gain = rate * minutesElapsed;
  return Math.min(100, Math.max(0, (Number(current) || 0) + gain));
}

module.exports = {
  CORRUPTION_GAIN,
  CORRUPTION_DECAY,
  getCorruptionTier,
  stabilityModifier,
  hygieneModifier,
  defenseModifier,
  applyGain,
  applyDecay,
  applyPassiveDecay,
  applyTimeBasedNeglect,
};
