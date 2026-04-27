/**
 * PAGEANT ENGINE — v1 (care-first reframe)
 *
 * Pageants are the slow-drip reveal of hidden state. Once per lifespan stage,
 * unlocks at the stage midway level. Returns a ceremony payload: 5 arbitrary
 * stats (Cuteness/Talent/Charm/Discipline/Style), pet grade, player grade,
 * and 3 random facts sampled from a pool of 12 derived from current byte +
 * player state.
 *
 * Pure module — no persistence, no req/res. Caller is responsible for
 * eligibility check and pageantsEntered array push.
 *
 * Spec: 2026-04-26 session, Skye's pageant reframe.
 */

const carePatternEngine = require('./carePatternEngine');
const { calcTemperamentScore } = require('./temperamentEngine');
const lifespanEngine = require('./lifespanEngine');

// ─────────────────────────────────────────────────────────────────
// Eligibility — midway through a stage, stage not yet entered
// ─────────────────────────────────────────────────────────────────
const STAGE_MIDWAY_LEVEL = {
  baby:  3,
  child: 10,
  teen:  20,
  adult: 33,
  elder: 45,
};

function isEligible(byte) {
  if (!byte || byte.isAlive === false) return { ok: false, reason: 'Byte not alive' };
  if (byte.isEgg) return { ok: false, reason: 'Byte must hatch first' };
  const stage = byte.lifespanStage || lifespanEngine.getStageForLevel(byte.level || 1);
  const midway = STAGE_MIDWAY_LEVEL[stage];
  if (!midway) return { ok: false, reason: 'Unknown lifespan stage' };
  if ((byte.level || 1) < midway) {
    return { ok: false, reason: `Pageant unlocks at level ${midway} (${stage} mid-stage)`, stage, midway };
  }
  const entered = Array.isArray(byte.pageantsEntered) ? byte.pageantsEntered : [];
  if (entered.includes(stage)) {
    return { ok: false, reason: `Already entered the ${stage} pageant`, stage };
  }
  return { ok: true, stage, midway };
}

// ─────────────────────────────────────────────────────────────────
// Arbitrary stats (0-100 each)
// ─────────────────────────────────────────────────────────────────
const STAT_KEYS = ['Power', 'Speed', 'Defense', 'Special', 'Stamina', 'Accuracy'];
const STAGE_CUTENESS_BOOST = { baby: 20, child: 10, teen: 0, adult: 0, elder: 5 };

function clamp01_100(v) { return Math.max(0, Math.min(100, Math.round(v))); }

function readStats(byte) {
  return byte.stats?.toObject?.() || byte.stats || {};
}

function cuteness(byte) {
  const affection = Number(byte.affection ?? 50);
  const corruption = Number(byte.corruption ?? 0);
  const stage = byte.lifespanStage || 'adult';
  const stageBoost = STAGE_CUTENESS_BOOST[stage] || 0;
  return clamp01_100(affection * 0.7 + (100 - corruption) * 0.2 + stageBoost);
}

function talent(byte) {
  const stats = readStats(byte);
  const sum = STAT_KEYS.reduce((a, k) => a + (Number(stats[k]) || 10), 0);
  // v1 stat ceiling is 25 each → 150 max sum. Floor is 10 each → 60 min.
  const normalized = (sum - 60) / (150 - 60);
  return clamp01_100(normalized * 100);
}

function charm(byte) {
  const moodUptime = Math.min(100, Number(byte.needs?.Mood ?? 50));
  const playTrain = Number(byte.behaviorMetrics?.playVsTrainRatio ?? 0.5);
  const balance = 1 - Math.abs(playTrain - 0.5) * 2;  // 1.0 at perfect 50/50
  return clamp01_100(moodUptime * 0.7 + balance * 30);
}

function discipline(byte) {
  const history = Array.isArray(byte.careHistory) ? byte.careHistory : [];
  if (history.length === 0) return 50;
  const optimal = history.filter((h) => h?.window === 'optimal').length;
  return clamp01_100((optimal / history.length) * 100);
}

function style(byte) {
  const decorCount = Array.isArray(byte.decorItems) ? byte.decorItems.length : 0;
  const stats = readStats(byte);
  const values = STAT_KEYS.map((k) => Number(stats[k]) || 10);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;
  // Low variance = balanced build = stylish. Decor adds flat points.
  const balanceScore = Math.max(0, 100 - variance * 4);
  return clamp01_100(decorCount * 8 + balanceScore * 0.5);
}

function arbitraryStats(byte) {
  return {
    cuteness:   cuteness(byte),
    talent:     talent(byte),
    charm:      charm(byte),
    discipline: discipline(byte),
    style:      style(byte),
  };
}

// ─────────────────────────────────────────────────────────────────
// Grades
// ─────────────────────────────────────────────────────────────────
function gradePet(stats) {
  const avg = (stats.cuteness + stats.talent + stats.charm + stats.discipline + stats.style) / 5;
  if (avg >= 90) return 'S';
  if (avg >= 75) return 'A';
  if (avg >= 60) return 'B';
  if (avg >= 45) return 'C';
  if (avg >= 30) return 'D';
  return 'F';
}

function gradePlayer(byte) {
  const result = carePatternEngine.getCarePattern(byte.dailyCareScore || 50);
  return result?.pattern || 'neutral';
}

// ─────────────────────────────────────────────────────────────────
// Fact pool — each fn returns a string or null (data missing → skip)
// ─────────────────────────────────────────────────────────────────
function factDominantTemperament(byte) {
  try {
    const { temperament } = calcTemperamentScore(byte);
    if (!temperament) return null;
    return `Personality is leaning ${temperament}.`;
  } catch { return null; }
}

function factBestStat(byte) {
  const stats = readStats(byte);
  let best = null;
  let bestVal = -1;
  for (const k of STAT_KEYS) {
    const v = Number(stats[k]) || 0;
    if (v > bestVal) { bestVal = v; best = k; }
  }
  if (!best || bestVal <= 10) return null;
  return `Strongest stat: ${best} (${bestVal}).`;
}

function factPlayVsTrain(byte) {
  const r = Number(byte.behaviorMetrics?.playVsTrainRatio);
  if (!Number.isFinite(r)) return null;
  if (r > 0.65) return 'Plays much more than it trains.';
  if (r < 0.35) return 'Trains much more than it plays.';
  return 'Balances play and training evenly.';
}

function factPraiseScold(byte) {
  const p = Number(byte.behaviorMetrics?.praiseCount || 0);
  const s = Number(byte.behaviorMetrics?.scoldCount || 0);
  if (p + s < 3) return null;
  if (p > s * 2) return 'You praise often.';
  if (s > p * 2) return 'You scold often.';
  return 'You praise and scold in equal measure.';
}

function factCareStreak(byte) {
  const streak = Number(byte.dailyCareStreak || 0);
  if (streak < 2) return null;
  return `Daily care streak: ${streak} day${streak === 1 ? '' : 's'}.`;
}

function factGeneration(byte) {
  const g = Number(byte.generation || 1);
  if (g <= 1) return null;
  return `Generation ${g} byte — descended from a previous line.`;
}

function factTimeOfDay(byte) {
  const pattern = byte.behaviorMetrics?.timeOfDayPattern;
  if (!pattern) return null;
  const obj = pattern.toObject?.() || pattern;
  const entries = Object.entries(obj).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  const [slot] = entries[0];
  return `Often visits during the ${slot}.`;
}

function factMostUsedRoom(byte) {
  const dist = byte.behaviorMetrics?.roomTimeDistribution;
  if (!dist) return null;
  const obj = dist.toObject?.() || dist;
  const entries = Object.entries(obj).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  const [room] = entries[0];
  return `Spends most time in the ${String(room).replace(/_/g, ' ').toLowerCase()}.`;
}

function factCarePattern(byte) {
  const p = gradePlayer(byte);
  const phrasing = {
    perfect:    'Care pattern: perfect — you are dialed in.',
    good:       'Care pattern: good — steady caretaker.',
    neutral:    'Care pattern: neutral — room to grow.',
    poor:       'Care pattern: poor — pay closer attention.',
    neglectful: 'Care pattern: neglectful — your byte is suffering.',
  };
  return phrasing[p] || null;
}

function factAffection(byte) {
  const a = Number(byte.affection ?? 50);
  if (a >= 85) return 'Bond is very strong.';
  if (a >= 65) return 'Bond is healthy.';
  if (a >= 35) return 'Bond is uncertain.';
  return 'Bond is fraying.';
}

function factCorruption(byte) {
  const c = Number(byte.corruption ?? 0);
  if (c >= 60) return 'Heavy corruption is showing through.';
  if (c >= 30) return 'Some visible corruption — keep cleaning.';
  if (c <= 5)  return 'Pristine — no visible corruption.';
  return null;
}

function factTrainingFocus(byte) {
  const dist = byte.behaviorMetrics?.statFocusDistribution;
  if (!dist) return null;
  const obj = dist.toObject?.() || dist;
  const entries = Object.entries(obj).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  const [stat] = entries[0];
  return `Training focus has favored ${stat}.`;
}

const FACT_POOL = [
  factDominantTemperament,
  factBestStat,
  factPlayVsTrain,
  factPraiseScold,
  factCareStreak,
  factGeneration,
  factTimeOfDay,
  factMostUsedRoom,
  factCarePattern,
  factAffection,
  factCorruption,
  factTrainingFocus,
];

/**
 * Sample N random facts from the pool, skipping any that return null.
 * Returns up to N strings; fewer if the pool is exhausted before N hits.
 */
function sampleFacts(byte, n = 3) {
  const shuffled = [...FACT_POOL].sort(() => Math.random() - 0.5);
  const out = [];
  for (const fn of shuffled) {
    if (out.length >= n) break;
    const result = fn(byte);
    if (result) out.push(result);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────

/**
 * Run a pageant ceremony — pure compute, no persistence.
 * @param {Object} byte
 * @returns {Object} ceremony payload
 */
function runPageant(byte) {
  const stats = arbitraryStats(byte);
  const petGrade = gradePet(stats);
  const playerGrade = gradePlayer(byte);
  const facts = sampleFacts(byte, 3);
  return {
    stage: byte.lifespanStage || 'adult',
    stats,
    petGrade,
    playerGrade,
    facts,
  };
}

module.exports = {
  STAGE_MIDWAY_LEVEL,
  STAT_KEYS,
  isEligible,
  arbitraryStats,
  gradePet,
  gradePlayer,
  sampleFacts,
  runPageant,
  FACT_POOL,
};
