const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const Player  = require('../models/Player');
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

// ─── DEV ENDPOINTS ─────────────────────────────────────────────────────────
// Direct state mutations for the in-app dev menu. No auth gate yet; tighten
// before public release.

// POST /api/player/:id/dev/bytebits  body: { delta }  OR  { value }
// Bypasses daily income caps — writes straight to the doc.
router.post('/:id/dev/bytebits', optionalAuth, async (req, res) => {
  try {
    const { delta, value } = req.body || {};
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ error: 'Not found' });

    const current = Number(player.byteBits || 0);
    const next = value != null ? Number(value) : current + Number(delta || 0);
    player.byteBits = Math.max(0, Math.floor(next));
    await player.save();

    res.json({ byteBits: player.byteBits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
