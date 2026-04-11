const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const Player  = require('../models/Player');

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
      .select('unlockedRooms unlockedItems unlockedMoves activePassiveRooms');
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
