/**
 * Byte sprite resolver — v1 lifespan-stage aware.
 * Per-stage sprite maps (baby/child/teen/adult/elder) with adult fallback.
 * v1 ships with adult sprites only (the current Circle library); other stages
 * inherit until Skye produces stage-specific art and we add their entries.
 *
 * Asset path convention (per Skye, 2026-04-26):
 *   Stage-specific: assets/bytes/Circle/{stage}/Circle-{action}.gif
 *   Flat (current):  assets/bytes/Circle/Circle-{action}.gif
 */

export type LifespanStage = 'baby' | 'child' | 'teen' | 'adult' | 'elder';

export type SpriteKey =
  | 'egg' | 'base' | 'idle' | 'idleHappy' | 'blinkBounce' | 'lowBounce'
  | 'sleeping' | 'sleepy' | 'tired' | 'sick'
  | 'angry' | 'confused' | 'cry' | 'xEyes' | 'happyblush' | 'blush' | 'smile'
  | 'eyeroll' | 'wink' | 'squish' | 'upsidedown'
  | 'lookLeft' | 'lookRight' | 'lookDown' | 'lookUp'
  | 'looklowerLeft' | 'looklowerRight' | 'looklowerLeftRight'
  | 'walkLeft' | 'walkRight'
  // 2026-04-26 additions
  | 'bored' | 'wave' | 'hi' | 'clean' | 'bigbite' | 'munch';

// Adult / flat Circle library — current shipped sprite set.
const ADULT: Record<SpriteKey, any> = {
  egg:                require('../assets/bytes/Circle/Circle-Egg.gif'),
  base:               require('../assets/bytes/Circle/Circle-base.gif'),
  idle:               require('../assets/bytes/Circle/Circle-idle.gif'),
  idleHappy:          require('../assets/bytes/Circle/Circle-idle-happy.gif'),
  blinkBounce:        require('../assets/bytes/Circle/Circle-blink-bounce.gif'),
  lowBounce:          require('../assets/bytes/Circle/Circle-low-bouncet.gif'),
  sleeping:           require('../assets/bytes/Circle/Circle-sleeping.gif'),
  sleepy:             require('../assets/bytes/Circle/Circle-sleepy.gif'),
  tired:              require('../assets/bytes/Circle/Circle-tired.gif'),
  sick:               require('../assets/bytes/Circle/Circle-sick.gif'),
  angry:              require('../assets/bytes/Circle/Circle-angry.gif'),
  confused:           require('../assets/bytes/Circle/Circle-confused.gif'),
  cry:                require('../assets/bytes/Circle/Circle-cry.gif'),
  xEyes:              require('../assets/bytes/Circle/Circle-x-eyes.gif'),
  happyblush:         require('../assets/bytes/Circle/Circle-happyblush.gif'),
  blush:              require('../assets/bytes/Circle/Circle-blush.gif'),
  smile:              require('../assets/bytes/Circle/Circle-smile.gif'),
  eyeroll:            require('../assets/bytes/Circle/Circle-eyeroll.gif'),
  wink:               require('../assets/bytes/Circle/Circle-wink.gif'),
  squish:             require('../assets/bytes/Circle/Circle-squish.gif'),
  upsidedown:         require('../assets/bytes/Circle/Circle-upsidedown.gif'),
  lookLeft:           require('../assets/bytes/Circle/Circle-look-left.gif'),
  lookRight:          require('../assets/bytes/Circle/Circle-look-right.gif'),
  lookDown:           require('../assets/bytes/Circle/Circle-lookdown.gif'),
  lookUp:             require('../assets/bytes/Circle/Circle-lookup.gif'),
  looklowerLeft:      require('../assets/bytes/Circle/Circle-looklowerleft1.gif'),
  looklowerRight:     require('../assets/bytes/Circle/Circle-looklowerright.gif'),
  looklowerLeftRight: require('../assets/bytes/Circle/Circle-looklowerleft-right.gif'),
  walkLeft:           require('../assets/bytes/Circle/Circle-leftmove.gif'),
  walkRight:          require('../assets/bytes/Circle/Circle-rightmove.gif'),
  // 2026-04-26 additions
  bored:              require('../assets/bytes/Circle/Circle-bored.gif'),
  wave:               require('../assets/bytes/Circle/Circle-wave.gif'),
  hi:                 require('../assets/bytes/Circle/Circle-hi.gif'),
  clean:              require('../assets/bytes/Circle/Circle-clean.gif'),
  bigbite:            require('../assets/bytes/Circle/Circle-bigbite.gif'),
  munch:              require('../assets/bytes/Circle/Circle-munch.gif'),
};

// Per-stage overrides. Empty objects fall through via STAGE_INHERITS chain
// to ADULT. Add entries here when stage-specific GIFs ship to
// assets/bytes/Circle/{stage}/.
// Example once baby art lands:
//   baby: {
//     idle: require('../assets/bytes/Circle/baby/Circle-idle.gif'),
//     ...
//   }
// Child automatically picks up baby art at a larger scale via STAGE_INHERITS.
const STAGE_OVERRIDES: Record<LifespanStage, Partial<Record<SpriteKey, any>>> = {
  baby:  {},
  child: {},
  teen:  {},
  adult: {},
  elder: {},
};

// Stage sprite inheritance chain (per Skye 2026-04-26):
//   - child inherits baby's overrides (same art, sized up via STAGE_BASE_SCALE)
//   - teen / elder fall through to adult (no override needed)
// To resolve a sprite: stage's own overrides → inherited stage's overrides → ADULT.
const STAGE_INHERITS: Partial<Record<LifespanStage, LifespanStage>> = {
  child: 'baby',
};

/**
 * Get the sprite for a given lifespan stage + key.
 * Resolution order: stage own → inherited stage → ADULT.
 */
export function getStageSprite(stage: LifespanStage | string | null | undefined, key: SpriteKey) {
  const s = (stage as LifespanStage) || 'adult';
  const own = STAGE_OVERRIDES[s]?.[key];
  if (own) return own;
  const parent = STAGE_INHERITS[s];
  if (parent) {
    const inherited = STAGE_OVERRIDES[parent]?.[key];
    if (inherited) return inherited;
  }
  return ADULT[key];
}

// ─────────────────────────────────────────────────────────────────
// Legacy / compat exports — used by RoomScene.tsx + battle.tsx [EXPANSION 1]
// ─────────────────────────────────────────────────────────────────

export type NeedSnapshot = {
  Hunger?: number;
  Bandwidth?: number;
  Hygiene?: number;
  Social?: number;
  Fun?: number;
  Mood?: number;
};

type SpriteOptions = {
  needs?: NeedSnapshot | null;
  preferAnimatedIdle?: boolean;
  preferAnimatedWalk?: boolean;
  facing?: 'left' | 'right' | 'idle';
  stage?: LifespanStage | string | null;
};

function n(value: unknown, fallback = 60) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

export function resolveByteSprite(evolutionStage: number, options: SpriteOptions = {}) {
  const needs = options.needs || {};
  const mood = n(needs.Mood, 60);
  const bandwidth = n(needs.Bandwidth, 60);
  const hygiene = n(needs.Hygiene, 60);
  const stage = options.stage || 'adult';
  const get = (key: SpriteKey) => getStageSprite(stage, key);

  if (evolutionStage <= 0) return get('egg');

  if (options.preferAnimatedWalk) {
    if (options.facing === 'left') return get('walkLeft');
    if (options.facing === 'right') return get('walkRight');
  }

  if (options.preferAnimatedIdle) {
    return get('idle');
  }

  if (bandwidth < 35) return get('tired');
  if (mood < 30) return get('looklowerLeftRight');
  if (mood < 35 || hygiene < 25) return get('looklowerLeft');
  if (mood >= 80) return get('idle');

  return get('blinkBounce');
}
