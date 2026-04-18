const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const Player  = require('../models/Player');
const Byte    = require('../models/Byte');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

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
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).select('-passwordHash');
    if (!player) return res.status(404).json({ error: 'Not found' });
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/player/:id/settings
router.patch('/:id/settings', optionalAuth, async (req, res) => {
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
router.get('/:id/currency', optionalAuth, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).select('byteBits dailyIncome');
    res.json({ byteBits: player.byteBits, dailyIncome: player.dailyIncome });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/player/:id/inventory
router.get('/:id/inventory', optionalAuth, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id)
      .select('unlockedRooms unlockedItems itemInventory unlockedMoves activePassiveRooms');
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/player/:id/reset-demo
router.post('/:id/reset-demo', optionalAuth, async (req, res) => {
  try {
    const { byteId } = req.body || {};
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    player.byteBits = 600; // Demo boost for testing items
    player.dailyIncome = 0;
    player.totalGenerations = 0;
    player.achievements = [];
    player.arenaRecord = { wins: 0, losses: 0 };
    player.minigamePlaysToday = 0;
    player.unlockedItems = [];
    player.itemInventory = [];
    player.activePassiveRooms = [];
    // Reset slots to only the demo byte — removes stale test bytes
    if (byteId) player.activeByteSlots = [byteId];

    await player.save();

    let byte = null;
    if (byteId) {
      byte = await Byte.findById(byteId);
    } else if (player.activeByteSlots?.length > 0) {
      byte = await Byte.findById(player.activeByteSlots[0]);
    }

    if (byte) {
      // Use findByIdAndUpdate with $set/$unset to bypass Mongoose change-detection
      // and guarantee null fields are written to MongoDB.
      // Stage 1 = shape only. animal/element/feature/branch/temperament are
      // reveals at stages 2/3/4/5/5 per evolutionEngine. Leave them null.
      await Byte.findByIdAndUpdate(byte._id, {
        $set: {
          evolutionStage:      1,
          isEgg:               false,
          isAlive:             true,
          isDevByte:           false,
          level:               1,
          xp:                  0,
          corruption:          0,
          trainingSessionsToday: 0,
          lastNeedsUpdate:     new Date(),
          bornAt:              new Date(),
          generation:          1,
          shape:               'Circle',
          affection:           50,
          dailyCareStreak:     0,
          dailyCareScore:      0,
          'stats.Power':       10,
          'stats.Speed':       10,
          'stats.Defense':     10,
          'stats.Stamina':     10,
          'stats.Special':     10,
          'stats.Accuracy':    10,
          'needs.Hunger':      100,
          'needs.Bandwidth':   100,
          'needs.Hygiene':     100,
          'needs.Social':      100,
          'needs.Fun':         100,
          'needs.Mood':        100,
          'behaviorMetrics.praiseCount':  0,
          'behaviorMetrics.scoldCount':   0,
          'behaviorMetrics.tapFrequency': 0,
          'behaviorMetrics.playVsTrainRatio': 0,
        },
        $unset: {
          animal:      '',
          element:     '',
          feature:     '',
          branch:      '',
          temperament: '',
        },
      });
      // Reload so the response has accurate data
      byte = await Byte.findById(byte._id);
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
