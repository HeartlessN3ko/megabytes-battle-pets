const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const Player  = require('../models/Player');
const Byte    = require('../models/Byte');

const router = express.Router();
// TODO: add auth middleware to protected routes

// POST /api/player/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const player = await Player.create({ username, email, passwordHash });
    res.status(201).json({ id: player._id, username: player.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/player/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const player = await Player.findOne({ email });
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const valid = await bcrypt.compare(password, player.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: player._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, playerId: player._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/player/:id
router.get('/:id', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).select('-passwordHash');
    if (!player) return res.status(404).json({ error: 'Not found' });
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/player/:id/settings
router.patch('/:id/settings', async (req, res) => {
  try {
    const player = await Player.findByIdAndUpdate(
      req.params.id,
      { $set: { settings: req.body } },
      { new: true }
    ).select('settings');
    res.json(player.settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/player/:id/currency
router.get('/:id/currency', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).select('byteBits dailyIncome');
    res.json({ byteBits: player.byteBits, dailyIncome: player.dailyIncome });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/player/:id/inventory
router.get('/:id/inventory', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id)
      .select('unlockedRooms unlockedItems itemInventory unlockedMoves activePassiveRooms');
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/player/:id/reset-demo
router.post('/:id/reset-demo', async (req, res) => {
  try {
    const { byteId } = req.body || {};
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    player.byteBits = 0;
    player.dailyIncome = 0;
    player.totalGenerations = 0;
    player.achievements = [];
    player.arenaRecord = { wins: 0, losses: 0 };
    player.minigamePlaysToday = 0;
    player.unlockedItems = [];
    player.itemInventory = [];
    player.activePassiveRooms = [];

    await player.save();

    let byte = null;
    if (byteId) {
      byte = await Byte.findById(byteId);
    } else if (player.activeByteSlots?.length > 0) {
      byte = await Byte.findById(player.activeByteSlots[0]);
    }

    if (byte) {
      byte.evolutionStage = 0;
      byte.isEgg = true;
      byte.level = 1;
      byte.xp = 0;
      byte.corruption = 0;
      byte.trainingSessionsToday = 0;
      byte.lastNeedsUpdate = new Date();
      byte.stats = {
        Power: 10, Speed: 10, Defense: 10, Stamina: 10, Special: 10, Accuracy: 10
      };
      byte.needs = {
        Hunger: 100, Bandwidth: 100, Hygiene: 100, Social: 100, Fun: 100, Mood: 100
      };
      byte.behaviorMetrics = {
        loginFrequency: 0,
        sessionGapTime: 0,
        recoveryDelayTime: 0,
        feedRatio: 0,
        cleanDelayTime: 0,
        needResponseTime: 0,
        tapFrequency: 0,
        nonRewardCheckins: 0,
        roomTimeDistribution: {},
        lowEnergyTrainingCount: 0,
        statFocusDistribution: {},
        sessionLength: 0,
        timeOfDayPattern: {},
        playVsTrainRatio: 0,
        restEnforcementRate: 0,
        praiseCount: 0,
        scoldCount: 0,
        moodRecoveryTime: 0
      };
      await byte.save();
    }

    res.json({
      ok: true,
      playerId: player._id,
      byteId: byte?._id || null,
      evolutionStage: byte?.evolutionStage ?? null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
