const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const Player  = require('../models/Player');
const { optionalAuth, requireDevMode } = require('../middleware/auth');

const router = express.Router();

// POST /api/player/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 24) {
      return res.status(400).json({ error: 'username must be 3-24 characters' });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'valid email required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const player = await Player.create({ username: username.trim(), email, passwordHash });
    res.status(201).json({ id: player._id, username: player.username });
  } catch (err) {
    // Duplicate username/email — don't leak Mongo internals
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'username or email already in use' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/player/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const player = await Player.findOne({ email });
    // Same status + message whether the email exists or the password is
    // wrong — prevents probing which emails are registered.
    if (!player) return res.status(401).json({ error: 'Invalid credentials' });
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
    if (!player) return res.status(404).json({ error: 'Not found' });
    res.json(player.settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/player/:id/currency
router.get('/:id/currency', optionalAuth, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).select('byteBits dailyIncome');
    if (!player) return res.status(404).json({ error: 'Not found' });
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
    if (!player) return res.status(404).json({ error: 'Not found' });
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
router.post('/:id/dev/bytebits', requireDevMode, async (req, res) => {
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
