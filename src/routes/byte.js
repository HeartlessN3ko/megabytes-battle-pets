const express       = require('express');
const Byte          = require('../models/Byte');
const Player        = require('../models/Player');
const Generation    = require('../models/Generation');
const Move          = require('../models/Move');
const needDecay        = require('../engine/needDecay');
const statEngine       = require('../engine/statEngine');
const corruptionEngine = require('../engine/corruptionEngine');
const evolutionEngine  = require('../engine/evolutionEngine');
const behaviorTracker = require('../engine/behaviorTracker');
const softlockEngine  = require('../engine/softlockEngine');
const economyEngine   = require('../engine/economyEngine');
const { MOVE_CATALOG_MAP } = require('../data/moveCatalog');
const { EFFECTS_REGISTRY } = require('../data/effectsRegistry');
const { optionalAuth } = require('../middleware/auth');

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

function getDecayOptions(req) {
  const demoMode = String(req.headers['x-demo-mode'] || '') === '1';
  if (!demoMode) return {};
  const headerMult = Number(req.headers['x-demo-decay-multiplier'] || 24);
  const speedMultiplier = Number.isFinite(headerMult) && headerMult > 0 ? headerMult : 24;
  return { speedMultiplier, maxWindowHours: 24 };
}

function computeLiveByteSnapshot(byte, req) {
  const decayOpts = getDecayOptions(req);
  const { needs, lastNeedsUpdate } = needDecay.applyDecay(
    byte.needs.toObject(),
    byte.lastNeedsUpdate,
    new Date(),
    decayOpts
  );

  const speedMult = decayOpts.speedMultiplier || 1;
  let corruption = corruptionEngine.applyPassiveDecay(byte.corruption, needs);
  if (criticalNeedCount(needs) > 0) {
    corruption = corruptionEngine.applyGain(corruption, 'NEGLECT_TIME', needs, speedMult);
  }

  return {
    needs,
    lastNeedsUpdate,
    corruption,
    computedStats: statEngine.applyNeedModifiers(byte.stats.toObject(), needs),
    corruptionTier: corruptionEngine.getCorruptionTier(corruption),
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
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/sync', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const snapshot = computeLiveByteSnapshot(byte, req);
    byte.needs = snapshot.needs;
    byte.lastNeedsUpdate = snapshot.lastNeedsUpdate;
    byte.corruption = snapshot.corruption;
    await byte.save();

    res.json({
      byte,
      computedStats: snapshot.computedStats,
      corruptionTier: snapshot.corruptionTier,
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
    const { action } = req.body;
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    // Apply decay first, then care
    const decayed = needDecay.applyDecay(byte.needs.toObject(), byte.lastNeedsUpdate, new Date(), getDecayOptions(req));
    const updatedNeeds = needDecay.applyCare(decayed.needs, action);
    byte.needs = updatedNeeds;
    byte.lastNeedsUpdate = decayed.lastNeedsUpdate;

    // Record behavior
    const metrics = behaviorTracker.recordCare(byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics, action, updatedNeeds.Hunger);
    byte.behaviorMetrics = metrics;

    // Non-corruption side effects
    if (action === 'rest') {
      byte.needs.Mood = clampNeed(Number(byte.needs.Mood || 0) + 2);
    } else if (action === 'play') {
      byte.needs.Bandwidth = clampNeed(Number(byte.needs.Bandwidth || 0) - 4);
    } else if (action === 'feed') {
      byte.needs.Hygiene = clampNeed(Number(byte.needs.Hygiene || 0) - 2);
    }

    // Corruption — spec-compliant (corruptionstates.md)
    const careSpeedMult = getDecayOptions(req).speedMultiplier || 1;
    if (action === 'clean') {
      byte.corruption = corruptionEngine.applyDecay(byte.corruption, 'BATHROOM_CLEAN');
    } else if (action === 'rest') {
      byte.corruption = corruptionEngine.applyPassiveDecay(byte.corruption, byte.needs);
    }
    const critCount = criticalNeedCount(byte.needs);
    if (critCount > 0) {
      byte.corruption = corruptionEngine.applyGain(byte.corruption, 'NEEDS_CRITICAL_TICK', byte.needs, careSpeedMult);
      byte.needs.Mood = clampNeed(Number(byte.needs.Mood || 0) - 3);
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

    // Care progression XP keeps early demo loop focused on raising.
    const CARE_XP = 3;
    byte.xp += CARE_XP;
    while (byte.xp >= statEngine.xpRequired(byte.level + 1) && byte.level < 100) {
      byte.level += 1;
    }

    await byte.save();
    await player.save();
    res.json({
      needs: byte.needs,
      earned: added,
      xpGained: CARE_XP,
      level: byte.level,
      xp: byte.xp,
      corruption: byte.corruption,
      corruptionTier: corruptionEngine.getCorruptionTier(byte.corruption),
      criticalNeeds: critCount,
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

    const trainDecayOpts = getDecayOptions(req);
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
    byte.trainingSessionsToday += 1;

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
    const shape = byteObj.shape || 'Diamond';
    const animal = evolutionEngine.assignAnimalForHatch(byteObj.behaviorMetrics || {});

    byte.isEgg = false;
    byte.evolutionStage = 1;
    byte.shape = shape;
    byte.animal = animal;
    byte.stats = statEngine.applyEvolutionBiases(byteObj.stats, { shape, animal, element: null, feature: null, branch: null });
    await byte.save();

    res.json({ evolutionStage: byte.evolutionStage, shape, animal, stats: byte.stats });
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
    const { needs } = needDecay.applyDecay(byte.needs.toObject(), byte.lastNeedsUpdate, new Date(), getDecayOptions(req));
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

// POST /api/byte/:id/praise
router.post('/:id/praise', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    byte.needs.Mood = clampNeed((byte.needs.Mood || 0) + 10);
    byte.needs.Social = clampNeed((byte.needs.Social || 0) + 5);

    const metrics = behaviorTracker.recordInteraction(byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics, 'praise');
    byte.behaviorMetrics = metrics;
    await byte.save();
    res.json({
      praiseCount: byte.behaviorMetrics.praiseCount,
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

    byte.needs.Mood = clampNeed((byte.needs.Mood || 0) - 10);

    const metrics = behaviorTracker.recordInteraction(byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics, 'scold');
    byte.behaviorMetrics = metrics;
    await byte.save();
    res.json({
      scoldCount: byte.behaviorMetrics.scoldCount,
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

    // Lifecycle check (bypass with force:true for testing)
    if (!req.body?.force) {
      const hoursAlive = (Date.now() - new Date(byte.lastNeedsUpdate).getTime()) / (1000 * 60 * 60);
      if (hoursAlive < 120) {
        return res.status(400).json({ error: `Byte has not reached terminal neglect (${Math.round(hoursAlive)}h / 120h required). Use force:true to override in tests.` });
      }
    }

    const player = await Player.findById(byte.ownerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Archive byte
    byte.isAlive = false;
    byte.diedAt = new Date();
    await byte.save();

    // Build legacy data and Generation record
    const legacyFields = softlockEngine.handleDeath(byte.toObject());
    const avgNeed = Object.values(byte.needs.toObject ? byte.needs.toObject() : byte.needs)
      .reduce((s, v) => s + Number(v || 0), 0) / 6;

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

    // Create legacy egg for the player
    const egg = await Byte.create({
      ownerId:            byte.ownerId,
      isEgg:              true,
      hatchAt:            legacyFields.hatchAt,
      inheritedMove:      legacyFields.inheritedMove,
      inheritedStatBonus: legacyFields.inheritedStatBonus,
      generation:         legacyFields.generation,
      learnedMoves:       [legacyFields.inheritedMove].filter(Boolean),
    });

    // Update player slots
    player.activeByteSlots = (player.activeByteSlots || []).filter((id) => String(id) !== String(byte._id));
    if (player.activeByteSlots.length < 3) player.activeByteSlots.push(egg._id);
    player.totalGenerations = (player.totalGenerations || 0) + 1;
    await player.save();

    res.json({
      died: byte._id,
      generationRecord: genRecord._id,
      legacyEgg: { id: egg._id, inheritedMove: egg.inheritedMove, inheritedStatBonus: egg.inheritedStatBonus, generation: egg.generation },
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

// PATCH /api/byte/:id/demo-stage
router.patch('/:id/demo-stage', async (req, res) => {
  try {
    const requested = Number(req.body?.stage);
    if (!Number.isFinite(requested)) {
      return res.status(400).json({ error: 'stage must be a number' });
    }

    const stage = Math.max(0, Math.min(2, Math.floor(requested)));
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    byte.evolutionStage = stage;
    byte.isEgg = stage === 0;
    await byte.save();

    res.json({ evolutionStage: byte.evolutionStage, isEgg: byte.isEgg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
