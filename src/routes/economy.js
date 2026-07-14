const express       = require('express');
const Player        = require('../models/Player');
const economyEngine = require('../engine/economyEngine');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
router.use(optionalAuth);

// GET /api/economy/balance/:playerId
router.get('/balance/:playerId', async (req, res) => {
  try {
    const player = await Player.findById(req.params.playerId).select('byteBits dailyIncome minigamePlaysToday lastDailyReset');
    if (!player) return res.status(404).json({ error: 'Not found' });

    // Auto-reset daily counters if needed
    if (economyEngine.shouldResetDaily(player.lastDailyReset)) {
      const reset = economyEngine.resetDailyIncome(player);
      Object.assign(player, reset);
      await player.save();
    }

    res.json({ byteBits: player.byteBits, dailyIncome: player.dailyIncome, hardCap: economyEngine.DAILY_INCOME.hard_cap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Currency amounts must be positive integers. Negative or non-numeric
// amounts previously passed straight into arithmetic — a negative /spend
// amount minted currency.
function isValidAmount(amount) {
  return Number.isInteger(amount) && amount > 0;
}

// POST /api/economy/earn
router.post('/earn', async (req, res) => {
  try {
    const { playerId, amount, source } = req.body;
    if (!isValidAmount(amount) || amount > economyEngine.DAILY_INCOME.hard_cap) {
      return res.status(400).json({ error: 'amount must be a positive integer within the daily cap' });
    }
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ error: 'Not found' });

    if (economyEngine.shouldResetDaily(player.lastDailyReset)) {
      Object.assign(player, economyEngine.resetDailyIncome(player));
    }

    const { added, newDailyTotal } = economyEngine.applyIncome(player.dailyIncome, amount);
    player.byteBits   += added;
    player.dailyIncome = newDailyTotal;

    if (source === 'minigame') player.minigamePlaysToday += 1;

    await player.save();
    res.json({ earned: added, byteBits: player.byteBits, dailyIncome: player.dailyIncome });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/economy/spend
router.post('/spend', async (req, res) => {
  try {
    const { playerId, amount } = req.body;
    if (!isValidAmount(amount)) {
      return res.status(400).json({ error: 'amount must be a positive integer' });
    }

    // Atomic conditional deduction — two concurrent spends can't both pass
    // a stale balance check (previous read-modify-write allowed double-spend).
    const player = await Player.findOneAndUpdate(
      { _id: playerId, byteBits: { $gte: amount } },
      { $inc: { byteBits: -amount } },
      { new: true }
    );
    if (!player) {
      const exists = await Player.exists({ _id: playerId });
      if (!exists) return res.status(404).json({ error: 'Not found' });
      return res.status(400).json({ error: 'Insufficient byte.bits' });
    }

    // Economy softlock: if balance hits 0, grant minigame access guarantee
    const softlockTriggered = player.byteBits === 0;

    res.json({ byteBits: player.byteBits, softlockTriggered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/economy/daily-status/:playerId
router.get('/daily-status/:playerId', async (req, res) => {
  try {
    const player = await Player.findById(req.params.playerId)
      .select('dailyIncome minigamePlaysToday lastDailyReset');
    res.json({
      dailyIncome:       player.dailyIncome,
      hardCap:           economyEngine.DAILY_INCOME.hard_cap,
      minigamePlaysToday: player.minigamePlaysToday,
      lastDailyReset:    player.lastDailyReset
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
