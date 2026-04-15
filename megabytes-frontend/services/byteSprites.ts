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
};

const BYTE_SPRITES = {
  egg: require('../assets/bytes/missingno-egg.png'),
  stage1Base: require('../assets/bytes/missingno-stage1.png'),
  stage1Neutral: require('../assets/bytes/missingno-idleblinking.gif'),
  stage1Smile: require('../assets/bytes/missingno-smile.gif'),
  stage1Frown: require('../assets/bytes/missingno-sad.gif'),
  stage1Sleep: require('../assets/bytes/missingno-sleeping.gif'),
  stage1Tired: require('../assets/bytes/missingno-tired.gif'),
  stage1Exhausted: require('../assets/bytes/missingno-exhausted.gif'),
  stage1Anxious: require('../assets/bytes/missingno-anxious.gif'),
  stage1IdleGif: require('../assets/bytes/missingno-idleblinking.gif'),
  stage1WalkLeftGif: require('../assets/bytes/missingno-left.gif'),
  stage1WalkRightGif: require('../assets/bytes/missingno-right.gif'),
  stage2: require('../assets/bytes/missingno-stage2-frog.png'),
} as const;

function n(value: unknown, fallback = 60) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

export function resolveByteSprite(stage: number, options: SpriteOptions = {}) {
  const needs = options.needs || {};
  const mood = n(needs.Mood, 60);
  const bandwidth = n(needs.Bandwidth, 60);
  const hygiene = n(needs.Hygiene, 60);

  if (stage <= 0) return BYTE_SPRITES.egg;
  if (stage >= 2) return BYTE_SPRITES.stage2;

  if (options.preferAnimatedWalk) {
    if (options.facing === 'left') return BYTE_SPRITES.stage1WalkLeftGif;
    if (options.facing === 'right') return BYTE_SPRITES.stage1WalkRightGif;
  }

  if (options.preferAnimatedIdle) {
    return BYTE_SPRITES.stage1IdleGif;
  }

  if (bandwidth < 15) return BYTE_SPRITES.stage1Exhausted;
  if (bandwidth < 35) return BYTE_SPRITES.stage1Tired;
  if (bandwidth < 28) return BYTE_SPRITES.stage1Sleep;
  if (mood < 30) return BYTE_SPRITES.stage1Anxious;
  if (mood < 35 || hygiene < 25) return BYTE_SPRITES.stage1Frown;
  if (mood >= 80) return BYTE_SPRITES.stage1Smile;

  return BYTE_SPRITES.stage1Neutral;
}
