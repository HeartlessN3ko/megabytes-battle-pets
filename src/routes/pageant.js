const express       = require('express');
const Byte          = require('../models/Byte');
const Player        = require('../models/Player');
const economyEngine = require('../engine/economyEngine');
const { xpRequired } = require('../engine/statEngine');

const router = express.Router();
// TODO: add auth middleware

// POST /api/pageant/enter
router.post('/enter', async (req, res) => {
  try {
    const { byteId } = req.body;
    const byte = await Byte.findById(byteId);
    if (!byte || !byte.isAlive) return res.status(400).json({ error: 'Byte not available for pageant' });
    // Nurture branch preferred but not required — flag it
    const nurtureBranch = byte.branch === 'Nurture';
    res.json({ entered: true, byteId, nurtureBranch, pageantBonus: nurtureBranch ? 10 : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pageant/score
router.post('/score', async (req, res) => {
  try {
    const { byteId, performanceResult, placement } = req.body;
    // placement: 'first' | 'second' | 'third' | 'participation'
    const byte   = await Byte.findById(byteId);
    const player = await Player.findById(byte.ownerId);
    if (!byte || !player) return res.status(404).json({ error: 'Not found' });

    const reward = economyEngine.PAGEANT_REWARDS[placement] || economyEngine.PAGEANT_REWARDS.participation;
    const { added } = economyEngine.applyIncome(player.dailyIncome, reward);
    player.byteBits  += added;
    player.dailyIncome += added;

    // XP award
    const xpGain = placement === 'first' ? 40 : placement === 'second' ? 25 : 15;
    byte.xp += xpGain;
    while (byte.xp >= xpRequired(byte.level + 1) && byte.level < 100) {
      byte.level += 1;
    }

    await byte.save();
    await player.save();
    res.json({ placement, earned: added, xpGain });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pageant/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    // Placeholder — full leaderboard requires a Pageant result collection (future)
    const topBytes = await Byte.find({ isAlive: true }).sort({ level: -1 }).limit(20)
      .select('name level temperament element branch ownerId');
    res.json(topBytes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pageant/history/:byteId
router.get('/history/:byteId', async (req, res) => {
  try {
    // Placeholder — Pageant result collection TBD
    res.json({ byteId: req.params.byteId, history: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
