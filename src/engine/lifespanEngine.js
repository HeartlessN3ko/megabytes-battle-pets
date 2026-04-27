/**
 * LIFESPAN ENGINE
 * v1 progression: egg → baby → child → teen → adult → elder → death.
 * Mapped onto the level 1-50 cycle. Replaces GDD-style evolution
 * (shape→animal→element→feature→branch→temperament reveal), which is
 * now [EXPANSION 1].
 *
 * Stat-driven physical mapping (Strength→size, Speed→pace, etc.) is read
 * frontend-side at render time — not in this module.
 *
 * Spec: V:\Voidworks\Design Documents\lifespan_v1.md
 */

const STAGE_ORDER = ['baby', 'child', 'teen', 'adult', 'elder'];

const STAGE_THRESHOLDS = {
  baby:  { min: 1,  max: 5  },
  child: { min: 6,  max: 15 },
  teen:  { min: 16, max: 25 },
  adult: { min: 26, max: 40 },
  elder: { min: 41, max: 49 },
};

const DEATH_LEVEL = 50;

// Per-stage decay multipliers per need. Multiplied into base decay rate.
// <1.0 = slower decay (need is more forgiving at this stage).
// >1.0 = faster decay (need bites harder at this stage).
const STAGE_DECAY_MULTIPLIERS = {
  baby:  { Hunger: 1.0,  Bandwidth: 1.0,  Hygiene: 0.7, Social: 0.6, Fun: 0.6, Mood: 0.7  },
  child: { Hunger: 1.0,  Bandwidth: 1.0,  Hygiene: 0.9, Social: 0.9, Fun: 1.0, Mood: 0.9  },
  teen:  { Hunger: 1.0,  Bandwidth: 1.0,  Hygiene: 1.0, Social: 1.1, Fun: 1.1, Mood: 1.15 },
  adult: { Hunger: 1.0,  Bandwidth: 1.0,  Hygiene: 1.0, Social: 1.0, Fun: 1.0, Mood: 1.0  },
  elder: { Hunger: 0.75, Bandwidth: 0.85, Hygiene: 0.9, Social: 0.9, Fun: 0.9, Mood: 1.1  },
};

// Care affordances available at each stage. Frontend reads this to gate UI.
// Baby can't play; teens unlock training; elders stop training.
const STAGE_CARE_AVAILABILITY = {
  baby:  ['feed', 'clean', 'rest', 'pet'],
  child: ['feed', 'clean', 'rest', 'pet', 'play'],
  teen:  ['feed', 'clean', 'rest', 'pet', 'play', 'train'],
  adult: ['feed', 'clean', 'rest', 'pet', 'play', 'train'],
  elder: ['feed', 'clean', 'rest', 'pet', 'play'],
};

// Per-stage base render scale. Frontend final scale = STAGE_BASE_SCALE * statScale(Strength).
// Per Skye 2026-04-26: all stages render at native sprite size — visual size
// differentiation comes from the sprite art itself. Elder gets a slight 0.95
// wither (-5%) for the "softer/diminished" wind-down read.
const STAGE_BASE_SCALE = {
  baby:  1.00,
  child: 1.00,
  teen:  1.00,
  adult: 1.00,
  elder: 0.95,
};

// Per-stage animation tick multiplier. Lower = faster anim cycle. Elder is slower.
const STAGE_ANIM_TICK_MULTIPLIER = {
  baby:  1.10,
  child: 0.95,
  teen:  1.00,
  adult: 1.00,
  elder: 1.15,
};

/**
 * Get the lifespan stage for a given level.
 * @param {number} level - 1..50
 * @returns {'baby'|'child'|'teen'|'adult'|'elder'}
 */
function getStageForLevel(level) {
  const lvl = Math.max(1, Math.min(DEATH_LEVEL, Number(level) || 1));
  for (const stage of STAGE_ORDER) {
    const { min, max } = STAGE_THRESHOLDS[stage];
    if (lvl >= min && lvl <= max) return stage;
  }
  return 'elder'; // anything ≥41 (including DEATH_LEVEL) is elder
}

/**
 * Detect a stage transition between two levels.
 * @returns {{ from: string, to: string }|null}
 */
function checkStageTransition(oldLevel, newLevel) {
  const from = getStageForLevel(oldLevel);
  const to = getStageForLevel(newLevel);
  if (from === to) return null;
  return { from, to };
}

/**
 * True if byte should die from age (level ≥ DEATH_LEVEL).
 * Independent of neglect-driven death.
 */
function shouldDieFromAge(level) {
  return Number(level) >= DEATH_LEVEL;
}

/**
 * Apply lifespan-side effects after XP/level changes.
 * Mutates byte.lifespanStage in place. Returns transition info.
 *
 * @param {Object} byte - mongoose Byte doc
 * @param {number} oldLevel
 * @returns {{ stageChanged: boolean, from: string|null, to: string, ageDeath: boolean }}
 */
function applyLifespanTransition(byte, oldLevel) {
  const newLevel = byte.level;
  const transition = checkStageTransition(oldLevel, newLevel);
  const newStage = getStageForLevel(newLevel);
  const ageDeath = shouldDieFromAge(newLevel) && !byte.isDevByte;

  let stageChanged = false;
  if (byte.lifespanStage !== newStage) {
    byte.lifespanStage = newStage;
    stageChanged = true;
  }

  return {
    stageChanged,
    from: transition ? transition.from : null,
    to: newStage,
    ageDeath,
  };
}

/**
 * Per-stage decay multiplier for a single need.
 * Used by needDecay.applyDecay to scale per-stage.
 */
function decayMultiplier(stage, need) {
  const stageMap = STAGE_DECAY_MULTIPLIERS[stage] || STAGE_DECAY_MULTIPLIERS.adult;
  return stageMap[need] != null ? stageMap[need] : 1.0;
}

module.exports = {
  STAGE_ORDER,
  STAGE_THRESHOLDS,
  STAGE_DECAY_MULTIPLIERS,
  STAGE_CARE_AVAILABILITY,
  STAGE_BASE_SCALE,
  STAGE_ANIM_TICK_MULTIPLIER,
  DEATH_LEVEL,
  getStageForLevel,
  checkStageTransition,
  shouldDieFromAge,
  applyLifespanTransition,
  decayMultiplier,
};
