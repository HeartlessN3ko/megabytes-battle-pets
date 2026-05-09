/**
 * LIFESPAN ENGINE
 * v1 progression: egg → baby → kid → adult → death.
 * 3 sprite stages plus an "old" overlay flag derived from level (no enum
 * value of its own). Mapped onto the level 1-50 cycle. Replaces GDD-style
 * evolution, which is now [EXPANSION 1].
 *
 * 2026-05-09 simplification: collapsed 5 stages (baby/child/teen/adult/elder)
 * to 3 (baby/kid/adult). "Old" became a derived isOld flag at level >= 41,
 * surfaced as a desaturation+darken overlay on the adult sprite. Legacy enum
 * values (child / teen / elder) are mapped on the next /sync per-byte.
 *
 * Spec: V:\\Voidworks\\Design Documents\\lifespan_v1.md
 */

const STAGE_ORDER = ['baby', 'kid', 'adult'];

const STAGE_THRESHOLDS = {
  baby: { min: 1,  max: 5  },
  kid:  { min: 6,  max: 15 },
  adult:{ min: 16, max: 49 },
};

const DEATH_LEVEL = 50;

// Level at which the "old" overlay activates. Derived flag, not its own
// stage. The byte is still in the adult enum value at this point — the
// overlay is a visual treatment (desaturation + slight darkening) layered
// over the adult sprite by the frontend.
const OLD_OVERLAY_LEVEL = 41;

// Per-stage decay multipliers per need. Multiplied into base decay rate.
// <1.0 = slower decay (need is more forgiving at this stage).
// >1.0 = faster decay (need bites harder at this stage).
const STAGE_DECAY_MULTIPLIERS = {
  baby:  { Hunger: 1.0, Bandwidth: 1.0, Hygiene: 0.7,  Social: 0.6, Fun: 0.6,  Mood: 0.7 },
  kid:   { Hunger: 1.0, Bandwidth: 1.0, Hygiene: 0.95, Social: 1.0, Fun: 1.05, Mood: 1.0 },
  adult: { Hunger: 1.0, Bandwidth: 1.0, Hygiene: 1.0,  Social: 1.0, Fun: 1.0,  Mood: 1.0 },
};

// Care affordances available at each stage. Frontend reads this to gate UI.
// Baby can't play. Training is EX1, removed from all stages.
const STAGE_CARE_AVAILABILITY = {
  baby:  ['feed', 'clean', 'rest', 'pet'],
  kid:   ['feed', 'clean', 'rest', 'pet', 'play'],
  adult: ['feed', 'clean', 'rest', 'pet', 'play'],
};

// Per-stage base render scale. Visual size differentiation comes from the
// sprite art itself; this is a uniform native scale per stage.
const STAGE_BASE_SCALE = {
  baby:  1.00,
  kid:   1.00,
  adult: 1.00,
};

// Per-stage animation tick multiplier. Lower = faster anim cycle.
const STAGE_ANIM_TICK_MULTIPLIER = {
  baby:  1.10,
  kid:   1.00,
  adult: 1.00,
};

// Old-overlay animation tick. Multiplied on top of STAGE_ANIM_TICK_MULTIPLIER
// when isOldFromLevel is true so old adults move a touch slower.
const OLD_ANIM_TICK_MULTIPLIER = 1.15;

// Legacy enum values produced by previous lifespan engine. Map on read in
// routes that backfill lifespanStage so existing byte docs don't fail the
// schema validator on save.
const LEGACY_STAGE_MAP = {
  child: 'kid',
  teen:  'kid',
  elder: 'adult',
};

function getStageForLevel(level) {
  const lvl = Math.max(1, Math.min(DEATH_LEVEL, Number(level) || 1));
  for (const stage of STAGE_ORDER) {
    const { min, max } = STAGE_THRESHOLDS[stage];
    if (lvl >= min && lvl <= max) return stage;
  }
  return 'adult';
}

function isOldFromLevel(level) {
  const lvl = Math.max(1, Math.min(DEATH_LEVEL, Number(level) || 1));
  return lvl >= OLD_OVERLAY_LEVEL;
}

function normalizeStage(stage) {
  if (stage && STAGE_THRESHOLDS[stage]) return stage;
  if (stage && LEGACY_STAGE_MAP[stage]) return LEGACY_STAGE_MAP[stage];
  return null;
}

function checkStageTransition(oldLevel, newLevel) {
  const from = getStageForLevel(oldLevel);
  const to = getStageForLevel(newLevel);
  if (from === to) return null;
  return { from, to };
}

function shouldDieFromAge(level) {
  return Number(level) >= DEATH_LEVEL;
}

function applyLifespanTransition(byte, oldLevel) {
  const newLevel = byte.level;
  const transition = checkStageTransition(oldLevel, newLevel);
  const newStage = getStageForLevel(newLevel);
  const ageDeath = shouldDieFromAge(newLevel) && !byte.isDevByte;
  const becameOld = !isOldFromLevel(oldLevel) && isOldFromLevel(newLevel);

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
    becameOld,
  };
}

function decayMultiplier(stage, need) {
  const normalized = normalizeStage(stage) || 'adult';
  const stageMap = STAGE_DECAY_MULTIPLIERS[normalized] || STAGE_DECAY_MULTIPLIERS.adult;
  return stageMap[need] != null ? stageMap[need] : 1.0;
}

module.exports = {
  STAGE_ORDER,
  STAGE_THRESHOLDS,
  STAGE_DECAY_MULTIPLIERS,
  STAGE_CARE_AVAILABILITY,
  STAGE_BASE_SCALE,
  STAGE_ANIM_TICK_MULTIPLIER,
  OLD_ANIM_TICK_MULTIPLIER,
  DEATH_LEVEL,
  OLD_OVERLAY_LEVEL,
  LEGACY_STAGE_MAP,
  getStageForLevel,
  isOldFromLevel,
  normalizeStage,
  checkStageTransition,
  shouldDieFromAge,
  applyLifespanTransition,
  decayMultiplier,
};
