const express       = require('express');
const Byte          = require('../models/Byte');
const Player        = require('../models/Player');
const Generation    = require('../models/Generation');
const Move          = require('../models/Move');
const needDecay        = require('../engine/needDecay');
const statEngine       = require('../engine/statEngine');
const corruptionEngine = require('../engine/corruptionEngine');
const evolutionEngine  = require('../engine/evolutionEngine');
const carePatternEngine    = require('../engine/carePatternEngine');
const xpEngine             = require('../engine/xpEngine');
const lifespanEngine       = require('../engine/lifespanEngine');
const { calcTemperamentScore } = require('../engine/temperamentEngine');
const { checkAndUnlockAchievements } = require('../services/achievementChecker');
const needInterdependencyEngine = require('../engine/needInterdependencyEngine');
const streakEngine         = require('../engine/streakEngine');
const neglectEngine        = require('../engine/neglectEngine');
const behaviorTracker = require('../engine/behaviorTracker');
const eggMetricsEngine = require('../engine/eggMetricsEngine');
const eggHatchEngine   = require('../engine/eggHatchEngine');
const softlockEngine  = require('../engine/softlockEngine');
const economyEngine   = require('../engine/economyEngine');
const tapInteractionEngine = require('../engine/tapInteractionEngine');
const affectionEngine      = require('../engine/affectionEngine');
const dailyCareEngine      = require('../engine/dailyCareEngine');
const { MOVE_CATALOG_MAP } = require('../data/moveCatalog');
const { EFFECTS_REGISTRY } = require('../data/effectsRegistry');
const { getActiveDecorEffects } = require('../data/decorCatalog');
const { optionalAuth, requireDevMode } = require('../middleware/auth');

const router = express.Router();
router.use(optionalAuth);

function clampNeed(value) {
  return Math.max(0, Math.min(100, value));
}

function averageNeed(needs = {}) {
  const keys = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];
  const total = keys.reduce((sum, key) => sum + Number(needs?.[key] || 0), 0);
  return total / keys.length;
}

function criticalNeedCount(needs = {}) {
  const keys = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];
  return keys.filter((key) => Number(needs?.[key] || 0) < 25).length;
}

function minNeedValue(needs = {}) {
  const keys = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];
  return Math.min(...keys.map(k => Number(needs?.[k] ?? 100)));
}

/**
 * Ensure byte has valid daily tasks assigned for today.
 * Resets if tasks are stale (assigned before midnight UTC).
 * Mutates byte in place — caller must save.
 */
function ensureDailyTasks(byte) {
  const isEarlyGame = (byte.level || 1) <= 5;
  if (dailyCareEngine.shouldResetTasks(byte.activeDailyTasks || [])) {
    // Score and streak update before wiping tasks
    if (byte.activeDailyTasks && byte.activeDailyTasks.length > 0) {
      byte.dailyCareScore = dailyCareEngine.calcDailyCareScore(byte.activeDailyTasks);
      dailyCareEngine.checkStreakReset(byte, dailyCareEngine.todayUTC());
    }
    byte.activeDailyTasks = dailyCareEngine.selectDailyTasks(isEarlyGame);
    byte.markModified('activeDailyTasks');
  }
}

/**
 * Emit a care event to the daily task engine and award any task XP.
 * Mutates byte.activeDailyTasks and byte.xp/level in place.
 *
 * @param {Object} byte     - Byte document
 * @param {Object} event    - event object { type, ...payload }
 * @returns {{ completedIds: string[], xpAwarded: number, fullSetComplete: boolean }}
 */
function emitCareEvent(byte, event) {
  ensureDailyTasks(byte);
  const { completedIds, xpAwarded } = dailyCareEngine.processEvent(byte.activeDailyTasks || [], event);
  byte.markModified?.('activeDailyTasks');

  let totalXP = xpAwarded;

  // Full-set bonus
  let fullSetComplete = false;
  if (dailyCareEngine.isFullSetComplete(byte.activeDailyTasks || [])) {
    fullSetComplete = true;
    totalXP += dailyCareEngine.FULL_SET_BONUS_XP;
    dailyCareEngine.checkStreakReset(byte, dailyCareEngine.todayUTC());
  }

  return { completedIds, xpAwarded: totalXP, fullSetComplete };
}

async function resolveKnownMoves(moveIds) {
  const unique = [...new Set((moveIds || []).filter(Boolean))];
  if (unique.length === 0) return {};
  const docs = await Move.find({ id: { $in: unique } });
  const map = Object.fromEntries(docs.map((doc) => [doc.id, doc.toObject()]));
  unique.forEach((id) => {
    if (!map[id] && MOVE_CATALOG_MAP[id]) map[id] = MOVE_CATALOG_MAP[id];
  });
  return map;
}

async function validateAndNormalizeLoadout(byte, payload = {}) {
  const learnedMoves = Array.isArray(byte.learnedMoves) && byte.learnedMoves.length > 0
    ? [...new Set(byte.learnedMoves)]
    : [softlockEngine.DEFAULT_MOVE.id];

  const requestedMoves = Array.isArray(payload.equippedMoves)
    ? payload.equippedMoves.filter(Boolean)
    : byte.equippedMoves;
  if (!Array.isArray(requestedMoves) || requestedMoves.length === 0) {
    throw new Error('At least 1 equipped move is required');
  }
  if (requestedMoves.length > 2) throw new Error('Max 2 moves');

  const uniqueMoves = [...new Set(requestedMoves)];
  if (uniqueMoves.length !== requestedMoves.length) throw new Error('Duplicate equipped moves are not allowed');
  const missingLearned = uniqueMoves.filter((id) => !learnedMoves.includes(id));
  if (missingLearned.length > 0) throw new Error(`Move not learned: ${missingLearned.join(', ')}`);

  const requestedUlt = payload.equippedUlt !== undefined ? payload.equippedUlt : byte.equippedUlt;
  const requestedPassive = payload.equippedPassive !== undefined ? payload.equippedPassive : byte.equippedPassive;

  const knownMoves = await resolveKnownMoves([...learnedMoves, ...uniqueMoves, requestedUlt].filter(Boolean));
  const unknownEquipped = uniqueMoves.filter((id) => !knownMoves[id]);
  if (unknownEquipped.length > 0) throw new Error(`Unknown move id(s): ${unknownEquipped.join(', ')}`);

  if (requestedUlt) {
    if (!learnedMoves.includes(requestedUlt)) throw new Error(`Ult not learned: ${requestedUlt}`);
    const ultDef = knownMoves[requestedUlt];
    if (!ultDef || !ultDef.isUlt) throw new Error(`Selected ult is invalid: ${requestedUlt}`);
  }

  if (requestedPassive) {
    const passiveKey = String(requestedPassive);
    const validPassives = Object.keys(EFFECTS_REGISTRY?.PASSIVES || {});
    if (!validPassives.includes(passiveKey)) {
      throw new Error(`Unknown passive: ${passiveKey}`);
    }
  }

  return {
    equippedMoves: uniqueMoves,
    equippedUlt: requestedUlt || null,
    equippedPassive: requestedPassive || null,
    knownMoves,
  };
}

function getDecayOptions(_req, byte = null) {
  // Real-time decay only. Demo mode was removed.
  // Lifespan stage is plumbed in here so per-stage decay multipliers apply
  // automatically at every applyDecay call site.
  const opts = {};
  if (byte && byte.lifespanStage) opts.stage = byte.lifespanStage;
  return opts;
}

function getSleepRecoveryMinutes(byte, req, now = new Date()) {
  if (!byte?.isSleeping) return 0;

  const lastUpdateMs = new Date(byte.lastNeedsUpdate || now).getTime();
  const recoveryEndMs = byte.sleepUntil
    ? Math.min(now.getTime(), new Date(byte.sleepUntil).getTime())
    : now.getTime();
  const elapsedMs = Math.max(0, recoveryEndMs - lastUpdateMs);
  const speedMult = getDecayOptions(req).speedMultiplier || 1;

  return (elapsedMs / (1000 * 60)) * speedMult;
}

function computeLiveByteSnapshot(byte, req) {
  // Backfill lifespanStage for bytes that pre-date the field (one-time per byte).
  if (!byte.lifespanStage) {
    byte.lifespanStage = lifespanEngine.getStageForLevel(byte.level || 1);
  }
  const decayOpts = getDecayOptions(req, byte);
  const now = new Date();
  const speedMult = decayOpts.speedMultiplier || 1;
  const rawMinutes = ((now - new Date(byte.lastNeedsUpdate)) / (1000 * 60)) * speedMult;
  const minutesElapsed = Math.min(rawMinutes, decayOpts.maxWindowMinutes || 60);

  const decorEffects = getActiveDecorEffects((byte.decorItems || []).map(i => i.id || i));

  const { needs, lastNeedsUpdate } = needDecay.applyDecay(
    byte.needs.toObject(),
    byte.lastNeedsUpdate,
    now,
    decayOpts,
    decorEffects
  );
  // Corruption: passive decay if clean byte, else time-based accrual scaled
  // by dirtiness. Rate tuned by gameBalance.CORRUPTION_FULL_HOURS. Defense
  // stat reduces gain (see corruptionEngine.defenseModifier).
  let corruption = corruptionEngine.applyPassiveDecay(byte.corruption, needs);
  const defenseStat = byte.stats?.Defense ?? byte.stats?.toObject?.()?.Defense ?? 10;
  corruption = corruptionEngine.applyTimeBasedNeglect(corruption, needs, minutesElapsed, speedMult, defenseStat);

  const avgNeed = needDecay.getAverageNeed(needs);
  const carePattern = carePatternEngine.getCarePattern(byte.dailyCareScore || 50);
  const passiveXPGain = xpEngine.calculatePassiveXP(minutesElapsed, avgNeed);
  const neglectStage = neglectEngine.getNegelectStage(avgNeed);
  const streakData = streakEngine.updateStreak(byte.streakData || {}, byte.dailyCareScore || 50, 0);
  const sleepRecoveryMinutes = getSleepRecoveryMinutes(byte, req, now);
  const recoveredNeeds = needInterdependencyEngine.applySleepModifiers(needs, byte.isSleeping, sleepRecoveryMinutes);

  // Lights-on annoyance: if the player left the home lights on AND the byte
  // is tired and awake, drag Mood slightly over elapsed time.
  const lightsAdjustedNeeds = needInterdependencyEngine.applyLightsAnnoyance(
    recoveredNeeds,
    byte.lightsOn !== false, // default ON if legacy byte doc has no field
    byte.isSleeping,
    minutesElapsed
  );

  return {
    needs: lightsAdjustedNeeds,
    lastNeedsUpdate,
    corruption,
    computedStats: statEngine.applyNeedModifiers(
      statEngine.applyEvolutionBiases(byte.stats.toObject(), {
        shape:       byte.shape       || null,
        animal:      byte.animal      || null,
        element:     byte.element     || null,
        feature:     byte.feature     || null,
        branch:      byte.branch      || null,
      }),
      needs
    ),
    corruptionTier: corruptionEngine.getCorruptionTier(corruption),
    carePattern,
    passiveXPGain,
    neglectStage,
    streakData,
  };
}

// GET /api/byte/:id — returns byte with decayed needs + computed stats
router.get('/:id', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });
    const snapshot = computeLiveByteSnapshot(byte, req);
    const responseByte = {
      ...byte.toObject(),
      needs: snapshot.needs,
      lastNeedsUpdate: snapshot.lastNeedsUpdate,
      corruption: snapshot.corruption,
    };

    res.json({
      byte: responseByte,
      computedStats: snapshot.computedStats,
      corruptionTier: snapshot.corruptionTier,
      carePattern: snapshot.carePattern,
      neglectStage: snapshot.neglectStage,
      streakData: snapshot.streakData,
      passiveXPGain: snapshot.passiveXPGain,
      affectionTier: affectionEngine.getAffectionTier(byte.affection || 50),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/sync', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const shouldWake = byte.isSleeping && (
      !byte.sleepUntil ||
      new Date() >= new Date(byte.sleepUntil) ||
      req.body?.forceWakeup
    );

    // Track last player activity for adaptive sleep scheduling
    byte.lastPlayerActivity = new Date();

    // Capture elapsed time before snapshot overwrites lastNeedsUpdate
    const syncElapsedMin = Math.min(
      (new Date() - new Date(byte.lastNeedsUpdate)) / (1000 * 60),
      60
    );

    // Capture pre-sync Mood for recovery tracking (recordMoodRecovery wire-in)
    const preSyncMood = Number(byte.needs?.Mood ?? 100);

    const snapshot = computeLiveByteSnapshot(byte, req);
    byte.needs = snapshot.needs;
    byte.lastNeedsUpdate = snapshot.lastNeedsUpdate;
    byte.corruption = snapshot.corruption;

    // Mood recovery tracking: detect crossings around the 50 threshold.
    //  - Cross 50→<50: stamp moodLowSinceAt.
    //  - Cross <50→≥50: compute hours, record, clear stamp.
    // Drives behaviorMetrics.moodRecoveryTime, which feeds Kind / Anxious /
    // Cold temperament scoring.
    const newMood = Number(byte.needs?.Mood ?? 100);
    if (preSyncMood >= 50 && newMood < 50 && !byte.moodLowSinceAt) {
      byte.moodLowSinceAt = new Date();
    } else if (preSyncMood < 50 && newMood >= 50 && byte.moodLowSinceAt) {
      const hoursToRecover = (Date.now() - new Date(byte.moodLowSinceAt).getTime()) / (1000 * 60 * 60);
      byte.behaviorMetrics = behaviorTracker.recordMoodRecovery(
        byte.behaviorMetrics?.toObject?.() || byte.behaviorMetrics || {},
        hoursToRecover
      );
      byte.markModified('behaviorMetrics');
      byte.moodLowSinceAt = null;
    }

    // ADAPTIVE SLEEP: clear sleep state only after accruing final recovery on sync
    if (shouldWake) {
      byte.isSleeping = false;
      byte.sleepUntil = null;
    }

    // AUTO-SLEEP: byte collapses when bandwidth bottoms out — but NEVER
    // within 5 minutes of a wake. Without this grace window, a freshly-woken
    // byte with low Bandwidth gets re-slept on the next sync, locking the
    // user out of interactions.
    const AUTO_SLEEP_COOLDOWN_MS = 5 * 60 * 1000;
    const msSinceWake = byte.lastWakeTime
      ? Date.now() - new Date(byte.lastWakeTime).getTime()
      : Infinity;
    const withinWakeGrace = msSinceWake < AUTO_SLEEP_COOLDOWN_MS;
    if (!byte.isSleeping && !withinWakeGrace && Number(byte.needs?.Bandwidth ?? 100) <= 5) {
      byte.isSleeping = true;
      byte.sleepUntil = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes
    }

    // Affection: session bonus (first sync / returning player)
    const lastLogin = byte.lastLoginAt ? new Date(byte.lastLoginAt).getTime() : 0;
    const gapHours = (Date.now() - lastLogin) / (1000 * 60 * 60);

    // Behavior metrics: record a new session if the gap from last sync is
    // > 30 min. Drives loginFrequency, sessionGapTime, timeOfDayPattern —
    // which feed Noble/Calm/Sneaky/Mysterious/Wanderer/Anxious temperaments.
    // Skip on the very first sync (lastLogin === 0) to avoid recording an
    // infinite gap.
    if (lastLogin > 0 && gapHours > 0.5) {
      const hour = new Date().getHours();
      const timeOfDay =
        hour < 6  ? 'night'   :
        hour < 12 ? 'morning' :
        hour < 18 ? 'afternoon' :
                    'evening';
      const sessionMetrics = behaviorTracker.recordSession(
        byte.behaviorMetrics?.toObject?.() || byte.behaviorMetrics || {},
        { durationMinutes: 0, gapHoursSinceLast: gapHours, timeOfDay }
      );
      byte.behaviorMetrics = sessionMetrics;
      byte.markModified('behaviorMetrics');
    }

    affectionEngine.applySessionBonus(byte);

    // Emit session_start event to daily tasks
    ensureDailyTasks(byte);
    emitCareEvent(byte, {
      type: 'session_start',
      gapHours: Math.max(0, gapHours),
      avgNeeds: averageNeed(byte.needs),
    });

    // Emit mood_change event when byte is thriving (feeds reach_happy_state task)
    const syncAvgNeeds = averageNeed(byte.needs);
    if (syncAvgNeeds >= 75) {
      emitCareEvent(byte, {
        type: 'mood_change',
        avgNeeds: syncAvgNeeds,
      });
    }

    // Affection: tick decay/gain using elapsed minutes from before this sync
    if (syncElapsedMin > 0.1) affectionEngine.tickAffection(byte, syncElapsedMin);

    // Hidden temperament drift — recompute from current behavior metrics on
    // every sync. v1 keeps this internal (no UI label per Skye's call), but
    // byte.temperament is read by frontend byteThoughts to bias the thought
    // pool. With behavior weight 0.60 dominating in v1 (animal/element are
    // null for v1 bytes), temperament tracks care patterns naturally.
    try {
      const { temperament } = calcTemperamentScore(byte);
      if (temperament) byte.temperament = temperament;
    } catch (_e) { /* never block sync on temperament calc */ }

    // Passive XP (time-based, from computeLiveByteSnapshot)
    if (snapshot.passiveXPGain > 0) {
      const oldLevel = byte.level;
      const passiveLevelUp = xpEngine.applyXPGain(byte.level, byte.xp || 0, snapshot.passiveXPGain);
      byte.level = passiveLevelUp.level;
      byte.xp = passiveLevelUp.xp;
      lifespanEngine.applyLifespanTransition(byte, oldLevel);
    }

    // Achievement auto-check — runs on every sync against current player +
    // byte state. New unlocks credit byteBits + XP and surface in response.
    let achievementUnlocks = [];
    try {
      const player = await Player.findById(byte.ownerId);
      if (player) {
        const result = await checkAndUnlockAchievements(player, byte);
        achievementUnlocks = result.newlyUnlocked;
        if (result.newlyUnlocked.length > 0) await player.save();
      }
    } catch (_e) { /* never block sync on achievement check */ }

    // /sync is idempotent over time — on VersionError, refresh __v and retry once.
    // Last write wins, because the next sync will recompute from lastNeedsUpdate anyway.
    try {
      await byte.save();
    } catch (err) {
      if (err.name === 'VersionError') {
        const fresh = await Byte.findById(byte._id).select('__v');
        if (fresh) byte.__v = fresh.__v;
        await byte.save();
      } else {
        throw err;
      }
    }

    res.json({
      byte,
      computedStats: snapshot.computedStats,
      corruptionTier: snapshot.corruptionTier,
      affection: byte.affection,
      passiveXPGain: snapshot.passiveXPGain,
      ageDeathPending: lifespanEngine.shouldDieFromAge(byte.level) && !byte.isDevByte && byte.isAlive !== false,
      achievementUnlocks,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte - create a new byte (egg)
router.post('/', async (req, res) => {
  try {
    const { playerId, shape } = req.body;
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.activeByteSlots.length >= 3) return res.status(400).json({ error: 'No byte slots available' });

    const VALID_SHAPES = ['Circle', 'Square', 'Triangle', 'Diamond', 'Hexagon'];
    const byte = await Byte.create({
      ownerId: playerId,
      isEgg: true,
      hatchAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      shape: VALID_SHAPES.includes(shape) ? shape : null, // set from onboarding choice; null until onboarding connected
    });

    player.activeByteSlots.push(byte._id);
    await player.save();
    res.status(201).json(byte);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/byte/:id/care
router.patch('/:id/care', async (req, res) => {
  try {
    const { action, grade } = req.body;
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    // Affection: detached tier blocks optional actions (play) with 27.5% chance
    const OPTIONAL_CARE_ACTIONS = new Set(['play']);
    const affectionTier = affectionEngine.getAffectionTier(byte.affection || 50);
    if (affectionTier === 'detached' && OPTIONAL_CARE_ACTIONS.has(action)) {
      if (Math.random() < 0.275) {
        return res.json({
          affectionBlocked: true,
          affectionTier,
          reason: 'not_in_mood',
          needs: byte.needs,
          affection: byte.affection,
        });
      }
    }

    // Egg care: record action, do not apply normal needs/decay
    if (byte.isEgg) {
      // Map care action to egg metric: feed→feed, clean→clean, praise→praise, inspect→inspect
      const eggActionMap = { feed: 'feed', clean: 'clean', praise: 'praise', inspect: 'inspect', rest: 'inspect', play: 'inspect' };
      const eggAction = eggActionMap[action] || 'inspect';

      byte.eggMetrics = eggMetricsEngine.recordEggAction(byte.eggMetrics || {}, eggAction);
      byte.markModified('eggMetrics');

      // Build egg care response
      const hatchAgeHours = eggMetricsEngine.calculateNeglectHours(byte.hatchAt) || 0;
      const behaviorScores = eggMetricsEngine.convertToBehaviorScores(byte.eggMetrics, hatchAgeHours);
      const topAnimal = Object.entries(behaviorScores).sort(([,a], [,b]) => b - a)[0];

      await byte.save();
      return res.json({
        isEgg: true,
        eggMetrics: byte.eggMetrics,
        predictedAnimal: topAnimal?.[0] || 'Unknown'
      });
    }

    // ── Quick-feed rate limit (5 uses per 2-hour window, quick feed only) ──
    // mealCycle:true bypasses the limit — meal minigame results are not rate-limited
    if (action === 'feed' && !req.body.mealCycle) {
      const QUICK_FEED_LIMIT = 5;
      const QUICK_FEED_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
      const now = Date.now();
      const resetAt = byte.quickFeedResetAt ? new Date(byte.quickFeedResetAt).getTime() : 0;
      if (now > resetAt) {
        byte.quickFeedCount = 0;
        byte.quickFeedResetAt = new Date(now + QUICK_FEED_WINDOW_MS);
      }
      if (byte.quickFeedCount >= QUICK_FEED_LIMIT) {
        return res.json({
          blocked: true,
          reason: 'limit_reached',
          quickFeedCount: byte.quickFeedCount,
          quickFeedResetAt: byte.quickFeedResetAt,
        });
      }
    }

    // ── Overfeed guard — byte isn't hungry (skipped for meal cycle completions) ──
    if (action === 'feed' && !req.body.mealCycle) {
      const currentHunger = (byte.needs?.Hunger ?? 0);
      if (currentHunger >= 90) {
        return res.json({
          blocked: true,
          reason: 'not_hungry',
          hunger: currentHunger,
        });
      }
    }

    // Apply decay first, then care
    const careDecorEffects = getActiveDecorEffects((byte.decorItems || []).map(i => i.id || i));
    const decayed = needDecay.applyDecay(byte.needs.toObject(), byte.lastNeedsUpdate, new Date(), getDecayOptions(req, byte), careDecorEffects);

    // Capture stat before care (for affection waste-range check)
    const TIMING_NEED = {
      feed: 'Hunger', meal: 'Hunger',
      clean: 'Hygiene', 'perfect-clean': 'Hygiene',
      rest: 'Bandwidth', deep_rest: 'Bandwidth',
      play: 'Fun', deep_play: 'Fun',
      calm: 'Mood',
    };
    const targetNeed = TIMING_NEED[action];
    const statBefore = targetNeed ? (decayed.needs[targetNeed] || 0) : 0;
    const timingWindow = targetNeed
      ? needDecay.getTimingWindow(action, decayed.needs[targetNeed] || 0)
      : { window: 'optimal', restoreMultiplier: 1.0 };
    const actionStrings = (byte.lastCareActions || []).map(a => (typeof a === 'object' ? a.action : a));
    const spamMult = needDecay.applySpamPenalty(actionStrings, action);

    const updatedNeeds = needDecay.applyCare(decayed.needs, action, grade || 'good', timingWindow.restoreMultiplier, spamMult, careDecorEffects);
    byte.needs = updatedNeeds;
    byte.lastNeedsUpdate = decayed.lastNeedsUpdate;

    // Affection: care bonus (skipped if spam-suppressed or in waste range)
    const affectionSpamSuppressed = affectionEngine.isSuppressedBySpam(byte, action);
    if (!affectionSpamSuppressed) {
      affectionEngine.applyCareBonus(byte, action, statBefore);
    } else {
      affectionEngine.applySpamPenalty(byte, action);
    }

    // Record care action in rich history (for carePatternEngine)
    byte.careHistory = carePatternEngine.recordCareAction(action, timingWindow.window, byte.careHistory || []);

    // Record behavior
    let metrics = behaviorTracker.recordCare(byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics, action, updatedNeeds.Hunger);

    // Play / rest behavior tracking — feeds playVsTrainRatio + restEnforcementRate,
    // which drive Energetic/Kind/Calm/Cold/Focused temperaments.
    if (action === 'play' || action === 'deep_play') {
      metrics = behaviorTracker.recordPlay(metrics);
    } else if (action === 'rest' || action === 'deep_rest' || action === 'calm') {
      metrics = behaviorTracker.recordRest(metrics);
    }

    byte.behaviorMetrics = metrics;

    // Non-corruption side effects
    if (action === 'rest' || action === 'deep_rest') {
      byte.needs.Mood = clampNeed(Number(byte.needs.Mood || 0) + 2);
    } else if (action === 'play' || action === 'deep_play') {
      byte.needs.Bandwidth = clampNeed(Number(byte.needs.Bandwidth || 0) - 4);
    } else if (action === 'feed' || action === 'meal') {
      byte.needs.Hygiene = clampNeed(Number(byte.needs.Hygiene || 0) - 2);
    }

    // Corruption — hygiene-driven system (low hygiene = faster corruption)
    if (action === 'clean') {
      // Quick Clean: restores hygiene + slight corruption reduction (-5)
      byte.corruption = corruptionEngine.applyDecay(byte.corruption, 'BATHROOM_CLEAN');
    } else if (action === 'perfect-clean') {
      // Deep Clean (minigame): full hygiene restoration + significant corruption reduction
      // -15 standard / -25 perfect is handled by corruptionEngine PERFECT_CLEAN tier
      byte.corruption = corruptionEngine.applyDecay(byte.corruption, 'PERFECT_CLEAN');
    } else if (action === 'rest' || action === 'deep_rest' || action === 'calm') {
      byte.corruption = corruptionEngine.applyPassiveDecay(byte.corruption, byte.needs);
    }
    // Corruption buildup from neglect is handled time-based in computeLiveByteSnapshot
    // (corruptionEngine.applyTimeBasedNeglect). Do NOT stack an event-driven gain here —
    // it fires on every care tap and punishes the player for caring.

    // Track care action for preference system
    const carePreference = tapInteractionEngine.trackCareAction(byte, action);
    byte.lastCareActions = carePreference.lastCareActions;
    if (carePreference.moodDelta !== 0) {
      byte.needs.Mood = clampNeed((byte.needs.Mood || 0) + carePreference.moodDelta);
    }

    // Softlock check
    const player = await Player.findById(byte.ownerId);
    const { triggered, recovery } = softlockEngine.checkSoftlocks(byte.toObject(), player.toObject());
    if (triggered.length > 0) {
      const recovered = softlockEngine.applyRecovery(byte.toObject(), player.toObject(), recovery);
      byte.set(recovered.byte);
      if (recovered.player._grantItem) {
        player.unlockedItems.addToSet(recovered.player._grantItem);
      }
    }

    // Award byte.bits
    const { added, newDailyTotal } = economyEngine.applyIncome(player.dailyIncome, economyEngine.CARE_REWARD_PER_ACTION);
    player.byteBits += added;
    player.dailyIncome = newDailyTotal;

    // XP via xpEngine (timing + spam + care pattern aware)
    const actionXP = xpEngine.calculateActionXP(action, grade || 'good', timingWindow.restoreMultiplier, spamMult);
    const carePatternResult = carePatternEngine.getCarePattern(byte.dailyCareScore || 50);
    const finalXP = xpEngine.applyPatternMultiplier(actionXP, carePatternResult.pattern || 'neutral');

    // multi_action_sequence: track recent care actions with timestamps (60s window)
    const nowMs = Date.now();
    const SEQUENCE_WINDOW_MS = 60 * 1000;
    const log = (byte.recentCareLog || []).filter(e => (nowMs - new Date(e.at).getTime()) < SEQUENCE_WINDOW_MS);
    log.push({ type: action, at: new Date(nowMs) });
    if (log.length > 10) log.shift(); // keep max 10 entries
    byte.recentCareLog = log;
    byte.markModified('recentCareLog');

    const distinctTypes = new Set(log.map(e => e.type));
    const sequenceTriggered = distinctTypes.size >= 3;

    // Emit care event to daily task engine
    const careEvent = {
      type: action,
      before: statBefore,
      after: targetNeed ? (byte.needs[targetNeed] || 0) : 0,
      delta: targetNeed ? (byte.needs[targetNeed] || 0) - statBefore : 0,
      timingWindow: timingWindow.window,
      optimal: timingWindow.window === 'optimal',
      minNeed: minNeedValue(byte.needs),
      avgNeeds: averageNeed(byte.needs),
    };
    const taskResult = emitCareEvent(byte, careEvent);

    // Emit multi_action_sequence event if 3 distinct actions were performed within 60s
    if (sequenceTriggered) {
      emitCareEvent(byte, { type: 'multi_action_sequence' });
      // Reset log after triggering so it doesn't fire repeatedly
      byte.recentCareLog = [];
      byte.markModified('recentCareLog');
    }

    // Total XP = care action XP + task completion XP
    const totalXP = finalXP + taskResult.xpAwarded;
    const oldLevel = byte.level;
    const levelUp = xpEngine.applyXPGain(byte.level, byte.xp || 0, totalXP);
    byte.level = levelUp.level;
    byte.xp = levelUp.xp;
    lifespanEngine.applyLifespanTransition(byte, oldLevel);

    // Increment quick-feed counter on successful feed
    if (action === 'feed') {
      byte.quickFeedCount = (byte.quickFeedCount || 0) + 1;
    }

    await byte.save();
    await player.save();
    res.json({
      needs: byte.needs,
      affection: byte.affection,
      affectionTier: affectionEngine.getAffectionTier(byte.affection || 50),
      earned: added,
      xpGained: totalXP,
      levelsGained: levelUp.levelsGained,
      level: byte.level,
      xp: byte.xp,
      timingWindow: timingWindow.window,
      spamMultiplier: spamMult,
      corruption: byte.corruption,
      taskCompletions: taskResult.completedIds,
      fullSetComplete: taskResult.fullSetComplete,
      corruptionTier: corruptionEngine.getCorruptionTier(byte.corruption),
      criticalNeeds: criticalNeedCount(byte.needs),
      quickFeedCount: byte.quickFeedCount,
      quickFeedResetAt: byte.quickFeedResetAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/byte/:id/train
router.patch('/:id/train', async (req, res) => {
  try {
    const { stat, result } = req.body;
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const trainDecayOpts = getDecayOptions(req, byte);
    const trainSpeedMult = trainDecayOpts.speedMultiplier || 1;
    const decayed = needDecay.applyDecay(byte.needs.toObject(), byte.lastNeedsUpdate, new Date(), trainDecayOpts);
    byte.needs = decayed.needs;
    byte.lastNeedsUpdate = decayed.lastNeedsUpdate;

    const bwAtStart = Number(byte.needs.Bandwidth || 0);
    const metrics = byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics;

    // Recovery: Bandwidth >= 50 clears overtraining event count
    if (bwAtStart >= 50 && (metrics.lowEnergyTrainingCount || 0) > 0) {
      metrics.lowEnergyTrainingCount = 0;
    }

    // Spec: overtraining triggers at Bandwidth <= 0, not session count
    const overtrained = bwAtStart <= 0;
    if (overtrained) {
      const overtCount = (metrics.lowEnergyTrainingCount || 0) + 1;
      metrics.lowEnergyTrainingCount = overtCount;

      if (overtCount >= 3) {
        // Severe state: refuse training, zero mood/fun/social
        byte.needs.Mood = 0;
        byte.needs.Fun = 0;
        byte.needs.Social = 0;
        byte.behaviorMetrics = metrics;
        await byte.save();
        return res.status(400).json({
          error: 'Severe overtraining. Restore bandwidth above 50 before continuing.',
          needs: byte.needs,
          corruption: byte.corruption,
          corruptionTier: corruptionEngine.getCorruptionTier(byte.corruption),
          overtrained: true,
          severe: true,
        });
      }

      // Instant needs penalties (overtraining.md)
      byte.needs.Hunger   = clampNeed(Number(byte.needs.Hunger   || 0) - 20);
      byte.needs.Hygiene  = clampNeed(Number(byte.needs.Hygiene  || 0) - 15);
      byte.needs.Mood     = clampNeed(Number(byte.needs.Mood     || 0) - 25);
      byte.needs.Fun      = clampNeed(Number(byte.needs.Fun      || 0) - 15);
      byte.needs.Social   = clampNeed(Number(byte.needs.Social   || 0) - 15);
      byte.corruption = corruptionEngine.applyGain(byte.corruption, 'OVERTRAINING', byte.needs, trainSpeedMult);
    }

    const gainMult  = statEngine.TRAINING_GAIN[result] || 1.0;
    const dailyMult = statEngine.trainingMultiplier(byte.trainingSessionsToday);
    const needMult  = Math.max(0.55, averageNeed(byte.needs) / 100);
    const gain      = Math.max(1, Math.round(gainMult * dailyMult * needMult));

    byte.stats[stat] = Math.min(100, (byte.stats[stat] || 0) + gain);
    byte.markModified('stats'); // Ensure Mongoose tracks subdoc field change
    byte.trainingSessionsToday += 1;

    // XP gain from training (50 base * grade multiplier * need multiplier)
    const baseXP = 50;
    const xpGain = Math.max(1, Math.round(baseXP * gainMult * needMult));
    byte.xp = (byte.xp || 0) + xpGain;

    // Normal training need consumption
    byte.needs.Bandwidth = clampNeed(Number(byte.needs.Bandwidth || 0) - 12);
    byte.needs.Fun       = clampNeed(Number(byte.needs.Fun       || 0) - 5);
    byte.needs.Mood      = clampNeed(Number(byte.needs.Mood      || 0) - 4);

    byte.behaviorMetrics = behaviorTracker.recordTraining(metrics, { stat, bandwidthAtStart: bwAtStart });

    await byte.save();
    res.json({
      stat,
      newValue: byte.stats[stat],
      gain,
      xpGain,
      totalXP: byte.xp,
      sessionsToday: byte.trainingSessionsToday,
      overtrained,
      needs: byte.needs,
      corruption: byte.corruption,
      corruptionTier: corruptionEngine.getCorruptionTier(byte.corruption),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/hatch — transitions egg to stage 1, assigns shape + animal
// isDevByte bypasses hatchAt timer. Real bytes must wait for hatchAt.
router.post('/:id/hatch', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });
    if (!byte.isEgg) return res.status(400).json({ error: 'Byte is not an egg.' });

    if (!byte.isDevByte) {
      const now = new Date();
      if (byte.hatchAt && new Date(byte.hatchAt) > now) {
        const msLeft = new Date(byte.hatchAt) - now;
        return res.status(400).json({ error: `Egg is not ready to hatch yet.`, msLeft });
      }
    }

    const byteObj = byte.toObject();
    // Shape is set at egg creation (from onboarding choice) — do not overwrite it here.
    byte.shape = byteObj.shape || 'Diamond';

    // Hatch: assign animal + temperament from egg metrics
    const hatchAgeHours = eggMetricsEngine.calculateNeglectHours(byte.hatchAt) || 0;
    const behaviorScores = eggMetricsEngine.convertToBehaviorScores(byte.eggMetrics || {}, hatchAgeHours);
    eggHatchEngine.hatchByte(byte, byte.eggMetrics || {}, hatchAgeHours, behaviorScores);

    // Apply stat biases from shape + animal
    byte.stats = statEngine.applyEvolutionBiases(byteObj.stats, {
      shape: byte.shape,
      animal: byte.animal,
      element: null,
      feature: null,
      branch: null
    });

    await byte.save();

    res.json({
      evolutionStage: byte.evolutionStage,
      shape: byte.shape,
      animal: byte.animal,
      temperament: byte.temperament,
      stats: byte.stats
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/byte/:id/evolve — advance to next stage, assign trait, apply stat biases
// isDevByte bypasses level gate and item requirement.
router.post('/:id/evolve', async (req, res) => {
  try {
    const { itemUsed, playerChoice } = req.body;
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const options = { itemUsed, ...playerChoice, bypassGates: byte.isDevByte };
    const updates = evolutionEngine.evolve(byte.toObject(), options);
    Object.assign(byte, updates);
    await byte.save();
    res.json({ evolutionStage: byte.evolutionStage, updates });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/byte/:id/stats
router.get('/:id/stats', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });
    const { needs } = needDecay.applyDecay(byte.needs.toObject(), byte.lastNeedsUpdate, new Date(), getDecayOptions(req, byte));
    const computedStats = statEngine.applyNeedModifiers(byte.stats.toObject(), needs);
    res.json({ baseStats: byte.stats, computedStats, needs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/byte/:id/moves
router.get('/:id/moves', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id).select('learnedMoves equippedMoves equippedUlt equippedPassive element temperament');
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const learnedMoves = Array.isArray(byte.learnedMoves) && byte.learnedMoves.length
      ? [...new Set(byte.learnedMoves)]
      : [softlockEngine.DEFAULT_MOVE.id];
    const knownMoves = await resolveKnownMoves(learnedMoves);

    const availableMoves = Object.values(knownMoves).filter((move) => !move.isUlt);
    const availableUlts = Object.values(knownMoves).filter((move) => Boolean(move.isUlt));
    const passiveOptions = Object.keys(EFFECTS_REGISTRY?.PASSIVES || {}).map((key) => ({ id: key, name: key }));

    res.json({
      learnedMoves,
      equippedMoves: byte.equippedMoves || [softlockEngine.DEFAULT_MOVE.id],
      equippedUlt: byte.equippedUlt || null,
      equippedPassive: byte.equippedPassive || null,
      availableMoves,
      availableUlts,
      passiveOptions,
      profile: {
        element: byte.element || 'Normal',
        temperament: byte.temperament || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/byte/:id/loadout
router.patch('/:id/loadout', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const nextLoadout = await validateAndNormalizeLoadout(byte, req.body || {});
    byte.equippedMoves = nextLoadout.equippedMoves;
    byte.equippedUlt = nextLoadout.equippedUlt;
    byte.equippedPassive = nextLoadout.equippedPassive;

    // Move failsafe
    if (!byte.equippedMoves || byte.equippedMoves.length === 0) {
      byte.equippedMoves = [softlockEngine.DEFAULT_MOVE.id];
    }
    await byte.save();

    res.json({ equippedMoves: byte.equippedMoves, equippedUlt: byte.equippedUlt, equippedPassive: byte.equippedPassive });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /:id/lights — toggle the home-screen lights for this byte.
// Body: { lightsOn: boolean }. Annoyance is applied lazily in the snapshot
// computation, not here — this route just persists the flag.
router.patch('/:id/lights', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const next = Boolean(req.body?.lightsOn);
    byte.lightsOn = next;
    await byte.save();

    res.json({ lightsOn: byte.lightsOn });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Helper: wake a sleeping byte in-memory (for praise/scold forced wake).
// Applies sleep recovery to needs, clears sleep flags, applies rest-interrupt
// affection penalty, and returns { wokenFromSleep: boolean, moodPenalty: number }.
function wakeOnInteraction(byte, req, moodPenalty) {
  if (!byte.isSleeping) return { wokenFromSleep: false, moodPenalty: 0 };

  const sleepRecoveryMinutes = getSleepRecoveryMinutes(byte, req, new Date());
  if (sleepRecoveryMinutes > 0) {
    byte.needs = needInterdependencyEngine.applySleepModifiers(
      byte.needs.toObject?.() || byte.needs,
      byte.isSleeping,
      sleepRecoveryMinutes
    );
    byte.lastNeedsUpdate = new Date();
  }

  byte.isSleeping = false;
  byte.sleepUntil = null;
  byte.lastWakeTime = new Date();

  // Guarantee a Bandwidth floor of 30 so sync's auto-sleep trap can't fire
  // immediately after a praise/scold-wake.
  byte.needs.Bandwidth = Math.max(Number(byte.needs.Bandwidth || 0), 30);

  // Affection: rude wake costs trust.
  affectionEngine.applyRestInterruptPenalty(byte);

  // Mood hit from being woken.
  byte.needs.Mood = clampNeed((byte.needs.Mood || 0) - moodPenalty);

  return { wokenFromSleep: true, moodPenalty };
}

// POST /api/byte/:id/praise
router.post('/:id/praise', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    // Sleep: wake with a Mood penalty instead of blocking.
    const wakeInfo = wakeOnInteraction(byte, req, 5);

    // Affection: detached tier blocks praise with 27.5% chance
    const praiseTier = affectionEngine.getAffectionTier(byte.affection || 50);
    if (praiseTier === 'detached' && Math.random() < 0.275) {
      // Still persist the wake + penalty if we woke them.
      if (wakeInfo.wokenFromSleep) await byte.save();
      return res.json({
        affectionBlocked: true,
        affectionTier: praiseTier,
        reason: 'not_in_mood',
        affection: byte.affection,
        needs: { Mood: byte.needs.Mood, Social: byte.needs.Social },
        wokenFromSleep: wakeInfo.wokenFromSleep,
        moodPenalty: wakeInfo.moodPenalty,
      });
    }

    byte.needs.Mood = clampNeed((byte.needs.Mood || 0) + 10);
    byte.needs.Social = clampNeed((byte.needs.Social || 0) + 5);

    // Affection: direct praise with diminishing returns
    const praiseResult = affectionEngine.applyPraise(byte);

    const metrics = behaviorTracker.recordInteraction(byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics, 'praise');
    byte.behaviorMetrics = metrics;
    await byte.save();
    res.json({
      praiseCount: byte.behaviorMetrics.praiseCount,
      affection: byte.affection,
      affectionTier: affectionEngine.getAffectionTier(byte.affection || 50),
      affectionDelta: praiseResult.delta,
      affectionBlocked: praiseResult.blocked,
      affectionBlockReason: praiseResult.reason,
      wokenFromSleep: wakeInfo.wokenFromSleep,
      moodPenalty: wakeInfo.moodPenalty,
      needs: {
        Mood: byte.needs.Mood,
        Social: byte.needs.Social
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/scold
router.post('/:id/scold', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    // Sleep: wake with a Mood penalty instead of blocking.
    const wakeInfo = wakeOnInteraction(byte, req, 10);

    byte.needs.Mood = clampNeed((byte.needs.Mood || 0) - 10);

    const metrics = behaviorTracker.recordInteraction(byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics, 'scold');
    byte.behaviorMetrics = metrics;
    await byte.save();
    res.json({
      scoldCount: byte.behaviorMetrics.scoldCount,
      wokenFromSleep: wakeInfo.wokenFromSleep,
      moodPenalty: wakeInfo.moodPenalty,
      needs: {
        Mood: byte.needs.Mood
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/interact
router.post('/:id/interact', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    byte.needs.Fun = clampNeed((byte.needs.Fun || 0) + 10);
    byte.needs.Social = clampNeed((byte.needs.Social || 0) + 5);
    byte.needs.Mood = clampNeed((byte.needs.Mood || 0) + 5);

    const metrics = behaviorTracker.recordInteraction(
      byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics,
      'interact'
    );
    byte.behaviorMetrics = metrics;
    await byte.save();

    res.json({
      tapFrequency: byte.behaviorMetrics.tapFrequency,
      nonRewardCheckins: byte.behaviorMetrics.nonRewardCheckins,
      needs: {
        Fun: byte.needs.Fun,
        Social: byte.needs.Social,
        Mood: byte.needs.Mood
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/tap
router.post('/:id/tap', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const now = new Date();
    const reaction = tapInteractionEngine.processTap(byte, now);

    // Update byte with new tap state
    byte.tapWindow = reaction.tapWindow.map(t => new Date(t));
    byte.annoyanceStage = reaction.annoyanceStage;
    byte.lastTapResponseTime = reaction.lastTapResponseTime || byte.lastTapResponseTime;
    byte.withdrawalTimer = Math.max(0, reaction.withdrawalTimer - 100); // Decrement by tick

    // Apply mood change if any
    if (reaction.moodDelta !== 0) {
      byte.needs.Mood = clampNeed((byte.needs.Mood || 0) + reaction.moodDelta);
    }

    // Record interaction for behavior tracking
    const metrics = behaviorTracker.recordInteraction(
      byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics,
      'tap'
    );
    byte.behaviorMetrics = metrics;

    await byte.save();

    res.json({
      moodTier: reaction.moodTier,
      animationTier: reaction.animationTier,
      audioId: reaction.audioId,
      moodDelta: reaction.moodDelta,
      annoyanceStage: reaction.annoyanceStage,
      currentMood: byte.needs.Mood,
      temperament: byte.temperament,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/home-clean
router.post('/:id/home-clean', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    // Home clean only clears room clutter in the frontend layer.
    // Record as a light clean interaction without restoring Hygiene.
    const metrics = behaviorTracker.recordCare(
      byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics,
      'clean',
      byte.needs.Hygiene || 100
    );
    byte.behaviorMetrics = metrics;
    await byte.save();

    res.json({
      cleanDelayTime: byte.behaviorMetrics.cleanDelayTime,
      needResponseTime: byte.behaviorMetrics.needResponseTime
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/die — triggers death + legacy egg creation
// Accepts { force: true } to bypass time checks (testing only).
// Skipped for isDevByte — Missingno cannot die.
router.post('/:id/die', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    if (byte.isDevByte) {
      return res.status(403).json({ error: 'Dev byte cannot die. isDevByte is set.' });
    }

    const player = await Player.findById(byte.ownerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const avgNeed = needDecay.getAverageNeed(byte.needs.toObject ? byte.needs.toObject() : byte.needs);

    // PATH 1: old-age death → legacy egg.
    // v1 lifespan caps at lifespanEngine.DEATH_LEVEL (50). Frontend can also
    // trigger explicitly with body.deathType === 'oldage'.
    if (byte.level >= lifespanEngine.DEATH_LEVEL || req.body?.deathType === 'oldage') {
      byte.isAlive = false;
      byte.diedAt = new Date();
      await byte.save();

      const legacyFields = softlockEngine.handleDeath(byte.toObject());

      const genRecord = await Generation.create({
        ownerId:    byte.ownerId,
        byteId:     byte._id,
        generation: byte.generation || 1,
        name:       byte.name || 'Unknown',
        shape:      byte.shape,
        animal:     byte.animal,
        element:    byte.element,
        feature:    byte.feature,
        branch:     byte.branch,
        temperament: byte.temperament,
        finalLevel: byte.level,
        finalStats: byte.stats.toObject ? byte.stats.toObject() : byte.stats,
        bornAt:     byte.bornAt,
        diedAt:     byte.diedAt,
        eulogyData: {
          praiseCount:      byte.behaviorMetrics?.praiseCount || 0,
          averageNeedScore: Math.round(avgNeed),
        },
        legacyMove:      legacyFields.inheritedMove,
        legacyStatBonus: legacyFields.inheritedStatBonus,
      });

      const egg = await Byte.create({
        ownerId:            byte.ownerId,
        isEgg:              true,
        hatchAt:            legacyFields.hatchAt,
        inheritedMove:      legacyFields.inheritedMove,
        inheritedStatBonus: legacyFields.inheritedStatBonus,
        generation:         legacyFields.generation,
        learnedMoves:       [legacyFields.inheritedMove].filter(Boolean),
      });

      player.activeByteSlots = (player.activeByteSlots || []).filter((id) => String(id) !== String(byte._id));
      if (player.activeByteSlots.length < 3) player.activeByteSlots.push(egg._id);
      player.totalGenerations = (player.totalGenerations || 0) + 1;
      await player.save();

      return res.json({
        died: byte._id,
        deathType: 'oldage',
        generationRecord: genRecord._id,
        legacyEgg: { id: egg._id, inheritedMove: egg.inheritedMove, inheritedStatBonus: egg.inheritedStatBonus, generation: egg.generation },
      });
    }

    // PATH 2: Neglect death → Generation record only, no legacy egg
    const qualifies = req.body?.force || neglectEngine.shouldDieFromNeglect(avgNeed, byte.neglectTimer || 0);
    if (!qualifies) {
      return res.status(400).json({
        error: 'Byte has not reached terminal neglect conditions. Use force:true to override in tests.',
        avgNeed: Math.round(avgNeed),
        neglectTimer: byte.neglectTimer || 0,
      });
    }

    byte.isAlive = false;
    byte.diedAt = new Date();
    await byte.save();

    const genRecord = await Generation.create({
      ownerId:    byte.ownerId,
      byteId:     byte._id,
      generation: byte.generation || 1,
      name:       byte.name || 'Unknown',
      shape:      byte.shape,
      animal:     byte.animal,
      element:    byte.element,
      feature:    byte.feature,
      branch:     byte.branch,
      temperament: byte.temperament,
      finalLevel: byte.level,
      finalStats: byte.stats.toObject ? byte.stats.toObject() : byte.stats,
      bornAt:     byte.bornAt,
      diedAt:     byte.diedAt,
      eulogyData: {
        praiseCount:      byte.behaviorMetrics?.praiseCount || 0,
        averageNeedScore: Math.round(avgNeed),
      },
    });

    player.activeByteSlots = (player.activeByteSlots || []).filter((id) => String(id) !== String(byte._id));
    player.totalGenerations = (player.totalGenerations || 0) + 1;
    await player.save();

    res.json({
      died: byte._id,
      deathType: 'neglect',
      generationRecord: genRecord._id,
      legacyEgg: null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/clinic-repair — deep purge, reduces corruption by CLINIC decay value
router.post('/:id/clinic-repair', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const before = Number(byte.corruption || 0);
    byte.corruption = corruptionEngine.applyDecay(before, 'CLINIC');
    await byte.save();

    res.json({
      corruption: byte.corruption,
      corruptionTier: corruptionEngine.getCorruptionTier(byte.corruption),
      reduced: before - byte.corruption,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/power-nap
router.post('/:id/power-nap', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });
    const sleepDurationMs = 15 * 60 * 1000; // 15 minutes
    byte.isSleeping = true;
    byte.sleepUntil = new Date(Date.now() + sleepDurationMs);
    byte.needs.Mood = clampNeed(Number(byte.needs.Mood || 0) + 8);
    byte.needs.Bandwidth = clampNeed(Number(byte.needs.Bandwidth || 0) + 12);
    byte.lastNeedsUpdate = new Date();
    await byte.save();
    res.json({ isSleeping: true, sleepUntil: byte.sleepUntil, needs: byte.needs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/sleep-cycle
router.post('/:id/sleep-cycle', async (req, res) => {
  try {
    const { durationMinutes } = req.body;
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });
    let sleepMinutes = durationMinutes || 60;
    sleepMinutes = Math.max(60, Math.min(600, sleepMinutes));
    const sleepDurationMs = sleepMinutes * 60 * 1000;
    byte.isSleeping = true;
    byte.sleepUntil = new Date(Date.now() + sleepDurationMs);
    byte.needs.Mood = clampNeed(Number(byte.needs.Mood || 0) + 20);
    byte.needs.Bandwidth = clampNeed(Number(byte.needs.Bandwidth || 0) + 25);
    byte.needs.Hygiene = clampNeed(Number(byte.needs.Hygiene || 0) + 10);
    byte.lastNeedsUpdate = new Date();
    await byte.save();
    res.json({ isSleeping: true, sleepUntil: byte.sleepUntil, sleepDurationMinutes: sleepMinutes, needs: byte.needs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/byte/generations/:playerId
router.get('/generations/:playerId', async (req, res) => {
  try {
    const generations = await Generation.find({ ownerId: req.params.playerId }).sort({ createdAt: -1 });
    res.json(generations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// PATCH /api/byte/:id
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['name', 'equippedMoves', 'equippedUlt', 'equippedPassive'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    if (updates.equippedMoves !== undefined || updates.equippedUlt !== undefined || updates.equippedPassive !== undefined) {
      const nextLoadout = await validateAndNormalizeLoadout(byte, updates);
      byte.equippedMoves = nextLoadout.equippedMoves;
      byte.equippedUlt = nextLoadout.equippedUlt;
      byte.equippedPassive = nextLoadout.equippedPassive;
    }
    if (updates.name !== undefined) byte.name = updates.name;

    await byte.save();
    res.json({ byte });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/byte/:id/wake-up
// Uses atomic findByIdAndUpdate to bypass Mongoose __v optimistic-concurrency check.
// The previous .save() pattern raced against sync() and stuck bytes in sleep loops.
router.post('/:id/wake-up', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    // Apply sleep recovery to needs (in-memory mutation; persisted below via $set).
    const sleepRecoveryMinutes = getSleepRecoveryMinutes(byte, req, new Date());
    if (sleepRecoveryMinutes > 0) {
      byte.needs = needInterdependencyEngine.applySleepModifiers(
        byte.needs.toObject?.() || byte.needs,
        byte.isSleeping,
        sleepRecoveryMinutes
      );
      byte.lastNeedsUpdate = new Date();
    }

    // Determine if sleep was uninterrupted (natural wake vs forced).
    const wasForced = req.body?.forced === true;
    const endEnergy = Number(byte.needs.Bandwidth || 0);

    byte.isSleeping = false;
    byte.sleepUntil = null;
    byte.lastWakeTime = new Date();

    // Guarantee a post-wake Bandwidth floor so sync's auto-sleep threshold
    // (Bandwidth <= 5) can't fire on the very next tick and lock the byte
    // back into sleep. 30 is high enough to avoid the trap but low enough
    // that the need still pressures the player to let them nap later.
    byte.needs.Bandwidth = Math.max(Number(byte.needs.Bandwidth || 0), 30);

    // Emit rest_complete event for daily task tracking.
    const restResult = emitCareEvent(byte, {
      type: 'rest_complete',
      uninterrupted: !wasForced,
      startEnergy: 0, // not tracked at sleep-start; endEnergy is what matters
      endEnergy,
    });

    // Apply rest interrupt affection penalty if woken early.
    if (wasForced) {
      affectionEngine.applyRestInterruptPenalty(byte);
    }

    if (restResult.xpAwarded > 0) {
      const restOldLevel = byte.level;
      const restLevelUp = xpEngine.applyXPGain(byte.level, byte.xp || 0, restResult.xpAwarded);
      byte.level = restLevelUp.level;
      byte.xp = restLevelUp.xp;
      lifespanEngine.applyLifespanTransition(byte, restOldLevel);
    }

    // ATOMIC persist — bypasses __v optimistic-concurrency check that caused
    // VersionError under concurrent sync() writes. $inc on __v invalidates any
    // in-flight save() on the same doc, so sync will re-read and stabilize.
    await Byte.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isSleeping: byte.isSleeping,
          sleepUntil: byte.sleepUntil,
          lastWakeTime: byte.lastWakeTime,
          needs: byte.needs,
          lastNeedsUpdate: byte.lastNeedsUpdate,
          level: byte.level,
          xp: byte.xp,
          lifespanStage: byte.lifespanStage,
          affection: byte.affection,
          activeDailyTasks: byte.activeDailyTasks,
          streakData: byte.streakData,
        },
        $inc: { __v: 1 },
      },
      { new: false, runValidators: false }
    );

    res.json({
      isSleeping: false,
      sleepUntil: null,
      affection: byte.affection,
      taskCompletions: restResult.completedIds,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/byte/:id/daily-care — current task status + score + streak
router.get('/:id/daily-care', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    ensureDailyTasks(byte);
    const needsSave = dailyCareEngine.shouldResetTasks(byte.activeDailyTasks || []);
    if (needsSave) await byte.save();

    res.json({
      activeDailyTasks: byte.activeDailyTasks,
      dailyCareScore: dailyCareEngine.calcDailyCareScore(byte.activeDailyTasks || []),
      dailyCareStreak: byte.dailyCareStreak || 0,
      lastCareDate: byte.lastCareDate || null,
      fullSetComplete: dailyCareEngine.isFullSetComplete(byte.activeDailyTasks || []),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/daily-care/reset — force reset tasks (admin/dev only)
router.post('/:id/daily-care/reset', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const isEarlyGame = (byte.level || 1) <= 5;
    byte.activeDailyTasks = dailyCareEngine.selectDailyTasks(isEarlyGame);
    byte.markModified('activeDailyTasks');
    await byte.save();

    res.json({
      activeDailyTasks: byte.activeDailyTasks,
      message: 'Daily tasks reset',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DEV ENDPOINTS ─────────────────────────────────────────────────────────
// Direct state mutations for the in-app dev menu. No auth gate yet; tighten
// before public release.

const NEED_KEYS = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];

// ─── DEV-ONLY ROUTES (gated by requireDevMode middleware) ─────────────────
// All 4 dev routes require DEV_MODE=1 env on server + x-dev-key header
// matching DEV_MODE_KEY env. Public builds: leave DEV_MODE unset → 403.
//
// POST /:id/dev/need  body: { need, delta }   OR  { need, value }
router.post('/:id/dev/need', requireDevMode, async (req, res) => {
  try {
    const { need, delta, value } = req.body || {};
    if (!NEED_KEYS.includes(need)) {
      return res.status(400).json({ error: `need must be one of ${NEED_KEYS.join(', ')}` });
    }
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const current = Number(byte.needs?.[need] ?? 0);
    const next = value != null
      ? Number(value)
      : current + Number(delta || 0);
    byte.needs[need] = clampNeed(next);
    byte.markModified('needs');
    await byte.save();

    res.json({ need, value: byte.needs[need], needs: byte.needs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/dev/corruption  body: { delta }  OR  { value }
router.post('/:id/dev/corruption', requireDevMode, async (req, res) => {
  try {
    const { delta, value } = req.body || {};
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const current = Number(byte.corruption || 0);
    const next = value != null ? Number(value) : current + Number(delta || 0);
    byte.corruption = Math.max(0, Math.min(100, next));
    await byte.save();

    res.json({ corruption: byte.corruption });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/dev/reset  — returns byte to fresh egg state (Stage 0)
router.post('/:id/dev/reset', requireDevMode, async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    byte.isEgg = true;
    byte.evolutionStage = 0;
    byte.lifespanStage = 'baby';
    byte.isAlive = true;
    byte.diedAt = null;
    byte.shape = 'Circle';
    byte.animal = null;
    byte.element = null;
    byte.feature = null;
    byte.branch = null;
    byte.temperament = null;

    NEED_KEYS.forEach((k) => { byte.needs[k] = 100; });
    byte.markModified('needs');

    byte.corruption = 0;
    byte.affection = 50;
    byte.level = 1;
    byte.xp = 0;
    byte.dailyCareStreak = 0;
    byte.dailyCareScore = 0;
    byte.lastNeedsUpdate = new Date();
    byte.bornAt = new Date();

    await byte.save();
    res.json({
      message: 'Byte reset to egg state',
      byte: {
        isEgg: byte.isEgg,
        evolutionStage: byte.evolutionStage,
        shape: byte.shape,
        needs: byte.needs,
        corruption: byte.corruption,
        level: byte.level,
        xp: byte.xp,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
