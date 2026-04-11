const express       = require('express');
const Battle        = require('../models/Battle');
const Byte          = require('../models/Byte');
const Player        = require('../models/Player');
const Move          = require('../models/Move');
const battleEngine  = require('../engine/battleEngine');
const statEngine    = require('../engine/statEngine');
const needDecay     = require('../engine/needDecay');
const economyEngine = require('../engine/economyEngine');
const { xpRequired } = require('../engine/statEngine');

const router = express.Router();
// TODO: add auth middleware

// POST /api/battle/start
router.post('/start', async (req, res) => {
  try {
    const { byteId, mode, opponentByteId } = req.body;

    const byteA = await Byte.findById(byteId);
    if (!byteA || !byteA.isAlive) return res.status(400).json({ error: 'Byte not available' });

    // Apply need decay before battle — needs affect combat stats
    const decayedA = needDecay.applyDecay(byteA.needs.toObject(), byteA.lastNeedsUpdate);
    byteA.needs = decayedA.needs;
    byteA.lastNeedsUpdate = decayedA.lastNeedsUpdate;
    byteA._computedStats = statEngine.applyNeedModifiers(byteA.stats.toObject(), decayedA.needs);

    // Resolve opponent
    let byteB;
    if (mode === 'ai') {
      byteB = generateAIOpponent(byteA);
    } else {
      byteB = await Byte.findById(opponentByteId);
      if (!byteB || !byteB.isAlive) return res.status(400).json({ error: 'Opponent not available' });
      const decayedB = needDecay.applyDecay(byteB.needs.toObject(), byteB.lastNeedsUpdate);
      byteB._computedStats = statEngine.applyNeedModifiers(byteB.stats.toObject(), decayedB.needs);
    }

    // Load moves
    const allMoveIds = [...new Set([...byteA.equippedMoves, byteA.equippedUlt, ...byteB.equippedMoves, byteB.equippedUlt].filter(Boolean))];
    const moveDocs = await Move.find({ id: { $in: allMoveIds } });
    const moves = Object.fromEntries(moveDocs.map(m => [m.id, m.toObject()]));

    // Run battle
    const result = battleEngine.runBattle(byteA, byteB, moves, {});

    // Save Battle record
    const battle = await Battle.create({
      playerA: byteA.ownerId,
      playerB: mode === 'ai' ? null : byteB.ownerId,
      byteA: byteA._id,
      byteB: mode === 'ai' ? null : byteB._id,
      mode,
      winner: result.winner,
      endedAt: new Date(),
      snapshotA: byteA._computedStats,
      snapshotB: byteB._computedStats,
      battleLog: result.log,
      mercyProc: result.mercyProc
    });

    // Award rewards & XP to playerA's byte
    const playerA = await Player.findById(byteA.ownerId);
    const isWin = result.winner === 'A';
    const reward = isWin ? economyEngine.BATTLE_REWARDS.win : economyEngine.BATTLE_REWARDS.loss;
    const { added } = economyEngine.applyIncome(playerA.dailyIncome, reward);
    playerA.byteBits += added;
    playerA.dailyIncome += added;

    byteA.xp += isWin ? 30 : 10;
    // Level up check
    while (byteA.xp >= xpRequired(byteA.level + 1) && byteA.level < 100) {
      byteA.level += 1;
    }

    await byteA.save();
    await playerA.save();

    res.json({ battleId: battle._id, winner: result.winner, mercyProc: result.mercyProc, earned: added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/battle/:id
router.get('/:id', async (req, res) => {
  try {
    const battle = await Battle.findById(req.params.id);
    if (!battle) return res.status(404).json({ error: 'Not found' });
    res.json(battle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/battle/history/:playerId
router.get('/history/:playerId', async (req, res) => {
  try {
    const battles = await Battle.find({ playerA: req.params.playerId })
      .sort({ createdAt: -1 }).limit(20).select('-battleLog');
    res.json(battles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/battle/:id/cheer — increments cheer count on active battle
router.post('/:id/cheer', async (req, res) => {
  try {
    const battle = await Battle.findByIdAndUpdate(
      req.params.id,
      { $inc: { cheers: 1 } },
      { new: true }
    );
    res.json({ cheers: battle.cheers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/battle/:id/ult — player suggests ult (AI compliance rolled at battle runtime)
router.post('/:id/ult', async (req, res) => {
  try {
    await Battle.findByIdAndUpdate(req.params.id, { $set: { ultSuggested: true } });
    res.json({ ultSuggested: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/battle/arena/list — list byte as passive arena defender
router.post('/arena/list', async (req, res) => {
  try {
    const { playerId, byteId } = req.body;
    await Player.findByIdAndUpdate(playerId, { $set: { arenaByteId: byteId } });
    res.json({ listed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/battle/arena/opponents/:playerId — level-matched opponents
router.get('/arena/opponents/:playerId', async (req, res) => {
  try {
    const player = await Player.findById(req.params.playerId);
    const myByte = player.activeByteSlots?.[0];
    const myByteDoc = myByte ? await Byte.findById(myByte) : null;
    const myLevel = myByteDoc?.level || 1;

    const opponents = await Player.find({
      _id: { $ne: req.params.playerId },
      arenaByteId: { $ne: null }
    }).limit(20).select('username arenaByteId arenaRecord');

    // Filter by level bracket (±10 levels) — requires populated byte; simplified here
    res.json(opponents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- AI opponent generator (temp placeholder until real AI byte system is built) ---
function generateAIOpponent(byteA) {
  const level = byteA.level;
  return {
    _id: 'ai_opponent',
    name: 'Slopitron.exe',
    temperament: 'Corrupt',
    element: 'Shadow',
    equippedMoves: ['basic_ping.py'],
    equippedUlt: null,
    equippedPassive: null,
    isAlive: true,
    ownerId: null,
    _computedStats: {
      Power:    Math.min(100, 5 + level),
      Speed:    Math.min(100, 5 + level),
      Defense:  Math.min(100, 5 + level),
      Stamina:  Math.min(100, 5 + level),
      Special:  Math.min(100, 5 + level),
      Accuracy: Math.min(100, 5 + level)
    }
  };
}

module.exports = router;
