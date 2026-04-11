const express       = require('express');
const Byte          = require('../models/Byte');
const Player        = require('../models/Player');
const Generation    = require('../models/Generation');
const needDecay     = require('../engine/needDecay');
const statEngine    = require('../engine/statEngine');
const evolutionEngine = require('../engine/evolutionEngine');
const behaviorTracker = require('../engine/behaviorTracker');
const softlockEngine  = require('../engine/softlockEngine');
const economyEngine   = require('../engine/economyEngine');

const router = express.Router();
// TODO: add auth middleware

// GET /api/byte/:id — returns byte with decayed needs + computed stats
router.get('/:id', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const { needs, lastNeedsUpdate } = needDecay.applyDecay(byte.needs.toObject(), byte.lastNeedsUpdate);
    byte.needs = needs;
    byte.lastNeedsUpdate = lastNeedsUpdate;
    await byte.save();

    const computedStats = statEngine.applyNeedModifiers(byte.stats.toObject(), needs);
    res.json({ byte, computedStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte — create a new byte (egg)
router.post('/', async (req, res) => {
  try {
    const { playerId } = req.body;
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.activeByteSlots.length >= 3) return res.status(400).json({ error: 'No byte slots available' });

    const byte = await Byte.create({
      ownerId: playerId,
      isEgg: true,
      hatchAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
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
    const decayed = needDecay.applyDecay(byte.needs.toObject(), byte.lastNeedsUpdate);
    const updatedNeeds = needDecay.applyCare(decayed.needs, action);
    byte.needs = updatedNeeds;
    byte.lastNeedsUpdate = decayed.lastNeedsUpdate;

    // Record behavior
    const metrics = behaviorTracker.recordCare(byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics, action, updatedNeeds.Hunger);
    byte.behaviorMetrics = metrics;

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

    await byte.save();
    await player.save();
    res.json({ needs: byte.needs, earned: added });
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

    // Bandwidth check (softlock: no training at 0 bandwidth)
    if ((byte.needs.Bandwidth || 0) <= 0) {
      return res.status(400).json({ error: 'Byte is out of bandwidth. Rest first.' });
    }

    const gainMult   = statEngine.TRAINING_GAIN[result] || 1.0;
    const dailyMult  = statEngine.trainingMultiplier(byte.trainingSessionsToday);
    const gain       = Math.round(gainMult * dailyMult);

    byte.stats[stat] = Math.min(100, (byte.stats[stat] || 0) + gain);
    byte.trainingSessionsToday += 1;

    const metrics = behaviorTracker.recordTraining(
      byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics,
      { stat, bandwidthAtStart: byte.needs.Bandwidth }
    );
    byte.behaviorMetrics = metrics;

    await byte.save();
    res.json({ stat, newValue: byte.stats[stat], gain, sessionsToday: byte.trainingSessionsToday });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/evolve
router.post('/:id/evolve', async (req, res) => {
  try {
    const { itemUsed, playerChoice } = req.body;
    const byte = await Byte.findById(req.params.id);
    if (!byte) return res.status(404).json({ error: 'Not found' });

    const updates = evolutionEngine.evolve(byte.toObject(), { itemUsed, ...playerChoice });
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
    const { needs } = needDecay.applyDecay(byte.needs.toObject(), byte.lastNeedsUpdate);
    const computedStats = statEngine.applyNeedModifiers(byte.stats.toObject(), needs);
    res.json({ baseStats: byte.stats, computedStats, needs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/byte/:id/loadout
router.patch('/:id/loadout', async (req, res) => {
  try {
    const { equippedMoves, equippedUlt, equippedPassive } = req.body;
    if (equippedMoves && equippedMoves.length > 2) return res.status(400).json({ error: 'Max 2 moves' });

    const byte = await Byte.findByIdAndUpdate(
      req.params.id,
      { $set: { equippedMoves, equippedUlt, equippedPassive } },
      { new: true }
    );

    // Move failsafe
    if (!byte.equippedMoves || byte.equippedMoves.length === 0) {
      byte.equippedMoves = [softlockEngine.DEFAULT_MOVE.id];
      await byte.save();
    }

    res.json({ equippedMoves: byte.equippedMoves, equippedUlt: byte.equippedUlt, equippedPassive: byte.equippedPassive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/praise
router.post('/:id/praise', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    const metrics = behaviorTracker.recordInteraction(byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics, 'praise');
    byte.behaviorMetrics = metrics;
    await byte.save();
    res.json({ praiseCount: byte.behaviorMetrics.praiseCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/byte/:id/scold
router.post('/:id/scold', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.id);
    const metrics = behaviorTracker.recordInteraction(byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics, 'scold');
    byte.behaviorMetrics = metrics;
    await byte.save();
    res.json({ scoldCount: byte.behaviorMetrics.scoldCount });
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
    const byte = await Byte.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!byte) return res.status(404).json({ error: 'Not found' });
    res.json({ byte });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
