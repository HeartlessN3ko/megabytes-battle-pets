const express       = require('express');
const Byte          = require('../models/Byte');
const Player        = require('../models/Player');
const economyEngine = require('../engine/economyEngine');
const { xpRequired } = require('../engine/statEngine');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
router.use(optionalAuth);

const TEMPERAMENT_VALUE = {
  Kind: 10,
  Noble: 10,
  Calm: 8,
  Focused: 5,
  Fierce: 5,
  Proud: 5,
  Anxious: -5,
  Unstable: -10,
  Corrupt: -15,
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalizeScore(raw) {
  // Keep scores readable while aligning with 0-1000 display intent.
  return clamp(Math.round(raw * 2), 0, 1000);
}

function derivePlacement(score) {
  if (score >= 750) return 'first';
  if (score >= 550) return 'second';
  if (score >= 350) return 'third';
  return 'participation';
}

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
    const { byteId, placement } = req.body;
    const perfectHits = Number(req.body?.perfectHits || 0);
    const goodHits = Number(req.body?.goodHits || 0);
    const maxCombo = Number(req.body?.maxCombo || 0);
    const pageantStat = Number(req.body?.pageantStat || 0);

    const byte   = await Byte.findById(byteId);
    if (!byte) return res.status(404).json({ error: 'Byte not found' });
    const player = await Player.findById(byte.ownerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const stats = byte.stats?.toObject?.() || byte.stats || {};
    const needs = byte.needs?.toObject?.() || byte.needs || {};
    const temperamentValue = TEMPERAMENT_VALUE[byte.temperament] || 0;

    const beautyRaw =
      (Number(needs.Hygiene || 0) * 0.5) +
      (Number(needs.Mood || 0) * 0.5) +
      (Number(stats.Special || 0) * 0.3) +
      (Number(stats.Defense || 0) * 0.2);

    const comboBonus = maxCombo * 2;
    const talentRaw = (perfectHits * 12) + (goodHits * 6) + comboBonus;

    const presenceRaw =
      (Number(stats.Power || 0) * 0.3) +
      (Number(stats.Speed || 0) * 0.3) +
      (Number(stats.Accuracy || 0) * 0.2) +
      pageantStat +
      temperamentValue;

    const rawScore = beautyRaw + talentRaw + presenceRaw;
    const cutenessScore = normalizeScore(rawScore);
    const resolvedPlacement = placement || derivePlacement(cutenessScore);

    const reward = economyEngine.PAGEANT_REWARDS[resolvedPlacement] || economyEngine.PAGEANT_REWARDS.participation;
    const { added, newDailyTotal } = economyEngine.applyIncome(player.dailyIncome, reward);
    player.byteBits  += added;
    player.dailyIncome = newDailyTotal;

    // XP award
    const xpGain = resolvedPlacement === 'first' ? 40 : resolvedPlacement === 'second' ? 25 : 15;
    byte.xp += xpGain;
    while (byte.xp >= xpRequired(byte.level + 1) && byte.level < 100) {
      byte.level += 1;
    }

    await byte.save();
    await player.save();
    res.json({
      placement: resolvedPlacement,
      earned: added,
      xpGain,
      scoring: {
        beauty: Math.round(beautyRaw),
        talent: Math.round(talentRaw),
        presence: Math.round(presenceRaw),
        comboBonus,
        temperamentValue,
        rawScore: Math.round(rawScore),
        cutenessScore,
      },
    });
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
