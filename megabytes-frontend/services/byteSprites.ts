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
  egg: require('../assets/bytes/egg.png'),
  stage1Base: require('../assets/bytes/missingnostage1.png'),
  stage1Neutral: require('../assets/bytes/stage1-faceneutral.png'),
  stage1Smile: require('../assets/bytes/stage1-facesmile.png'),
  stage1Frown: require('../assets/bytes/stage1-facefrown.png'),
  stage1Sleep: require('../assets/bytes/stage1-facesleep.png'),
  stage1IdleGif: require('../assets/bytes/stage1-idolanimationt.gif'),
  stage1WalkLeftGif: require('../assets/bytes/stage1-idolanimationt.gif'),
  stage1WalkRightGif: require('../assets/bytes/stage1-idolanimationt.gif'),
  stage2: require('../assets/bytes/stage2.png'),
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

  if (options.preferAnimatedWalk && mood >= 55 && bandwidth >= 45 && hygiene >= 35) {
    if (options.facing === 'left') return BYTE_SPRITES.stage1WalkLeftGif;
    if (options.facing === 'right') return BYTE_SPRITES.stage1WalkRightGif;
  }

  if (options.preferAnimatedIdle && mood >= 65 && bandwidth >= 55 && hygiene >= 45) {
    return BYTE_SPRITES.stage1IdleGif;
  }

  if (bandwidth < 28) return BYTE_SPRITES.stage1Sleep;
  if (mood < 35 || hygiene < 25) return BYTE_SPRITES.stage1Frown;
  if (mood >= 80) return BYTE_SPRITES.stage1Smile;

  return BYTE_SPRITES.stage1Neutral || BYTE_SPRITES.stage1Base;
}
