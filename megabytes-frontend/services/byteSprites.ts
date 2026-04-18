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
  egg:               require('../assets/bytes/Circle/Circle-Egg.gif'),
  base:              require('../assets/bytes/Circle/Circle-base.gif'),
  neutral:           require('../assets/bytes/Circle/Circle-blink-bounce.gif'),
  smile:             require('../assets/bytes/Circle/Circle-idle.gif'),
  frown:             require('../assets/bytes/Circle/Circle-looklowerleft1.gif'),
  sleep:             require('../assets/bytes/Circle/Circle-sleeping.gif'),
  tired:             require('../assets/bytes/Circle/Circle-tired.gif'),
  anxious:           require('../assets/bytes/Circle/Circle-looklowerleft-right.gif'),
  idleGif:           require('../assets/bytes/Circle/Circle-idle.gif'),
  walkLeft:          require('../assets/bytes/Circle/Circle-leftmove.gif'),
  walkRight:         require('../assets/bytes/Circle/Circle-rightmove.gif'),
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

  // All live stages use Circle stage 1 sprites until further evo art is ready
  if (options.preferAnimatedWalk) {
    if (options.facing === 'left') return BYTE_SPRITES.walkLeft;
    if (options.facing === 'right') return BYTE_SPRITES.walkRight;
  }

  if (options.preferAnimatedIdle) {
    return BYTE_SPRITES.idleGif;
  }

  if (bandwidth < 15) return BYTE_SPRITES.tired;
  if (bandwidth < 35) return BYTE_SPRITES.tired;
  if (bandwidth < 28) return BYTE_SPRITES.sleep;
  if (mood < 30) return BYTE_SPRITES.anxious;
  if (mood < 35 || hygiene < 25) return BYTE_SPRITES.frown;
  if (mood >= 80) return BYTE_SPRITES.smile;

  return BYTE_SPRITES.neutral;
}
