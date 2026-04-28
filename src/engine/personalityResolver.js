/**
 * personalityResolver.js
 *
 * Picks ONE behavior state per tick. Folds personality + needs + recent events
 * + daily mood + session context into a single output the home screen routes
 * through. Movement, sprite priority, emote timing, and thought tone all read
 * from this resolver instead of pulling from three different modulators —
 * which is what makes the byte feel like ONE engine instead of stacked features.
 *
 * Public API:
 *   - resolveBehaviorState(byte, needs, context)  pure read, returns state
 *   - tickPersonalityState(byte, nowMs)           mutates: TTL recentMood, roll dailyMood
 *   - setRecentMood(byte, kind, durationMs)       big-event handler entry point
 *
 * Wired in:
 *   - /sync route — calls tickPersonalityState + resolveBehaviorState, attaches
 *     `behaviorState` to the response.
 *   - /praise → setRecentMood(byte, 'warm')
 *   - /scold  → setRecentMood(byte, 'sulky')
 */

const STATE_KEYS = [
  'sleepy',
  'demanding',
  'sulky',
  'warm',
  'clingy',
  'withdrawn',
  'bored',
  'exploring',
  'playful',
  'focused',
  'content',
  'idle',
];

// Fidget suggestion + cadence per state. Frontend's sprite resolver maps these
// to sprite keys; if a key has no sprite yet, it falls back to the closest
// existing one (configured in `services/byteSprites.ts`).
const STATE_FIDGETS = {
  sleepy:    { fidget: 'yawn',        cadenceMs: 70_000 },
  demanding: { fidget: null,          cadenceMs: 0 }, // demand emote covers it
  sulky:     { fidget: 'lookDown',    cadenceMs: 50_000 },
  warm:      { fidget: 'wink',        cadenceMs: 60_000 },
  clingy:    { fidget: 'lookUp',      cadenceMs: 45_000 },
  withdrawn: { fidget: 'lookAway',    cadenceMs: 80_000 },
  bored:     { fidget: 'bored',       cadenceMs: 50_000 },
  exploring: { fidget: 'lookAround',  cadenceMs: 35_000 },
  playful:   { fidget: 'wink',        cadenceMs: 40_000 },
  focused:   { fidget: 'think',       cadenceMs: 90_000 },
  content:   { fidget: 'blinkBounce', cadenceMs: 75_000 },
  idle:      { fidget: 'blinkBounce', cadenceMs: 90_000 },
};

const DAILY_MOOD_POOL = ['lazy', 'playful', 'anxious', 'restless', 'content', 'quiet'];
const RECENT_MOOD_TTL_MS = 30 * 60 * 1000;       // 30 min for sulky / warm (post-scold/praise)
// Care satisfaction (Phase 11) — shorter window so the "I just got fed" beat
// fades and the byte returns to ambient. 5 min keeps it tied to the moment.
const RECENT_MOOD_CARE_TTL_MS = 5 * 60 * 1000;
// Neglect (Phase 11) — fires from /sync when ignored_critical lands. Same
// 5 min so it tracks the cooldown rhythm of ignored_critical itself.
const RECENT_MOOD_NEGLECT_TTL_MS = 5 * 60 * 1000;

// Per-temperament daily mood weights. Each entry is a flat draw pool so the
// kind appearing more often = higher chance. Bytes without a temperament fall
// back to even distribution across DAILY_MOOD_POOL.
const TEMPERAMENT_DAILY_BIAS = {
  Anxious:    ['anxious', 'anxious', 'anxious', 'restless', 'quiet'],
  Calm:       ['quiet', 'quiet', 'content', 'lazy', 'content'],
  Energetic:  ['playful', 'playful', 'restless', 'restless', 'content'],
  Wanderer:   ['restless', 'restless', 'playful', 'quiet', 'content'],
  Cold:       ['quiet', 'quiet', 'lazy', 'content', 'anxious'],
  Fierce:     ['restless', 'restless', 'playful', 'anxious', 'content'],
  Kind:       ['content', 'content', 'playful', 'lazy', 'quiet'],
  Noble:      ['content', 'content', 'content', 'playful', 'quiet'],
  Focused:    ['quiet', 'content', 'content', 'lazy', 'playful'],
  Proud:      ['content', 'restless', 'lazy', 'quiet', 'playful'],
  Alert:      ['restless', 'anxious', 'playful', 'content', 'restless'],
  Sneaky:     ['quiet', 'restless', 'playful', 'lazy', 'content'],
  Mysterious: ['quiet', 'lazy', 'quiet', 'content', 'restless'],
  Unstable:   ['anxious', 'anxious', 'restless', 'playful', 'restless'],
  Corrupt:    ['restless', 'anxious', 'restless', 'playful', 'anxious'],
};

function isRecentMoodActive(recentMood, nowMs) {
  if (!recentMood || !recentMood.kind || !recentMood.until) return false;
  return new Date(recentMood.until).getTime() > nowMs;
}

function pickDailyMood(temperament) {
  const pool = (temperament && TEMPERAMENT_DAILY_BIAS[temperament]) || DAILY_MOOD_POOL;
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (!DAILY_MOOD_POOL.includes(pick)) pick = 'content';
  return pick;
}

// "YYYY-MM-DD" UTC. Coarse-but-stable day key for the daily-mood roll. Using
// UTC means a player at 11pm rolls a "today" mood, then at 1am they get a
// fresh roll — that's fine because daily mood is supposed to feel like a new day.
function utcDayKey(nowMs) {
  const d = new Date(nowMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Mutate byte.personality before reading state:
 *   - Clear recentMood when its TTL has expired
 *   - Roll a fresh dailyMood when today's date differs from the stored day
 *
 * Idempotent within a tick (won't roll twice on the same day). Cheap.
 */
function tickPersonalityState(byte, nowMs = Date.now()) {
  if (!byte) return;
  if (!byte.personality) byte.personality = {};
  const p = byte.personality;

  if (p.recentMood && p.recentMood.until) {
    const untilMs = new Date(p.recentMood.until).getTime();
    if (untilMs <= nowMs) {
      p.recentMood = { kind: null, until: null };
    }
  }

  const today = utcDayKey(nowMs);
  if (!p.dailyMood || p.dailyMood.day !== today) {
    p.dailyMood = {
      kind: pickDailyMood(byte.temperament || null),
      day:  today,
    };
  }
}

/**
 * Big-event entry point. Stamps recentMood with a TTL. Subsequent /sync calls
 * read this and route the byte through the matching state (sulky / warm / etc.)
 * until the timer expires.
 */
function setRecentMood(byte, kind, durationMs = RECENT_MOOD_TTL_MS) {
  if (!byte) return;
  if (!byte.personality) byte.personality = {};
  byte.personality.recentMood = {
    kind,
    until: new Date(Date.now() + durationMs),
  };
}

/**
 * Pure read. Picks one state for this tick.
 *
 * @param byte     Mongoose doc with .personality and optionally .temperament
 * @param needs    Live needs (post-decay), an object with Hunger/Bandwidth/...
 * @param context  { sessionGapHours?, localHour?, nowMs? }
 */
function resolveBehaviorState(byte, needs = {}, context = {}) {
  const nowMs = context.nowMs || Date.now();
  const p = (byte && byte.personality) || {};
  const obedience   = Number(p.obedience   != null ? p.obedience   : 50);
  const impulse     = Number(p.impulse     != null ? p.impulse     : 50);
  const attachment  = Number(p.attachment  != null ? p.attachment  : 50);
  const curiosity   = Number(p.curiosity   != null ? p.curiosity   : 50);
  const sensitivity = Number(p.sensitivity != null ? p.sensitivity : 50);

  const Hunger    = Number(needs.Hunger    != null ? needs.Hunger    : 100);
  const Bandwidth = Number(needs.Bandwidth != null ? needs.Bandwidth : 100);
  const Hygiene   = Number(needs.Hygiene   != null ? needs.Hygiene   : 100);
  const Fun       = Number(needs.Fun       != null ? needs.Fun       : 100);
  const Social    = Number(needs.Social    != null ? needs.Social    : 100);
  const Mood      = Number(needs.Mood      != null ? needs.Mood      : 100);

  const sessionGapHours = Number(context.sessionGapHours || 0);
  const recentMoodKind = isRecentMoodActive(p.recentMood, nowMs) ? p.recentMood.kind : null;
  const dailyMoodKind = (p.dailyMood && p.dailyMood.kind) || null;

  const minNeed = Math.min(Hunger, Bandwidth, Hygiene, Fun, Social);
  const criticalNeed = minNeed < 20;
  const needyNeed = minNeed < 40;

  let state = 'idle';

  if (Bandwidth <= 25) {
    state = 'sleepy';
  } else if (criticalNeed || (impulse > 70 && needyNeed)) {
    state = 'demanding';
  } else if (recentMoodKind === 'sulky') {
    state = 'sulky';
  } else if (recentMoodKind === 'warm') {
    state = 'warm';
  } else if (sessionGapHours >= 4 && attachment >= 60) {
    state = 'clingy';
  } else if (sessionGapHours >= 4 && attachment <= 35) {
    state = 'withdrawn';
  } else if (Fun < 30) {
    state = 'bored';
  } else if (curiosity >= 65 && !needyNeed) {
    state = 'exploring';
  } else if (dailyMoodKind === 'playful' || (impulse + curiosity >= 140 && Mood >= 60)) {
    state = 'playful';
  } else if (obedience >= 65 && impulse <= 35) {
    state = 'focused';
  } else if (Mood >= 70 && minNeed >= 50) {
    state = 'content';
  }

  const fidgetCfg = STATE_FIDGETS[state] || STATE_FIDGETS.idle;
  const reactionAmplitude = 1 + (sensitivity - 50) * 0.012;
  const expressionScale = 1 + (sensitivity - 50) * 0.012 + (impulse - 50) * 0.004;

  // Higher sensitivity → more frequent fidgets. Lower sensitivity → calmer.
  const fidgetCadenceMs = fidgetCfg.cadenceMs > 0
    ? Math.max(15_000, Math.round(fidgetCfg.cadenceMs / Math.max(0.5, reactionAmplitude)))
    : 0;

  return {
    state,
    fidget: fidgetCfg.fidget,
    fidgetCadenceMs,
    expressionScale,
    reactionAmplitude,
    recentMood: recentMoodKind,
    dailyMood: dailyMoodKind,
  };
}

module.exports = {
  resolveBehaviorState,
  tickPersonalityState,
  setRecentMood,
  STATE_KEYS,
  STATE_FIDGETS,
  DAILY_MOOD_POOL,
  RECENT_MOOD_TTL_MS,
  RECENT_MOOD_CARE_TTL_MS,
  RECENT_MOOD_NEGLECT_TTL_MS,
};
