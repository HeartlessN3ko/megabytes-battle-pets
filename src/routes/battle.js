const express       = require('express');
const Battle        = require('../models/Battle');
const Byte          = require('../models/Byte');
const Player        = require('../models/Player');
const Move          = require('../models/Move');
const battleEngine  = require('../engine/battleEngine');
const statEngine    = require('../engine/statEngine');
const needDecay     = require('../engine/needDecay');
const economyEngine = require('../engine/economyEngine');
const matchmakingEngine = require('../engine/matchmakingEngine');
const { xpRequired } = require('../engine/statEngine');
const { findMoveInCatalog, MOVE_CATALOG } = require('../data/moveCatalog');
const { EFFECTS_REGISTRY } = require('../data/effectsRegistry');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Validate and normalize byte's equipped moves.
 * Returns { equippedMoves, equippedUlt } with safe defaults.
 */
function validateAndNormalizeLoadout(byte, moves) {
  const equippedMoves = (byte.equippedMoves || []).filter(id => {
    const move = moves[id];
    return move && !move.isUlt; // must exist and not be ult
  });
  
  // Ensure at least one move, fallback to basic_ping.py
  if (equippedMoves.length === 0) {
    equippedMoves.push('basic_ping.py');
  }

  const equippedUlt = byte.equippedUlt;
  const ultMove = equippedUlt ? moves[equippedUlt] : null;
  const validUlt = (ultMove && ultMove.isUlt === true) ? equippedUlt : null;

  return { equippedMoves, equippedUlt: validUlt };
}

router.use(optionalAuth);

function getDecayOptions(req) {
  const demoMode = String(req.headers['x-demo-mode'] || '') === '1';
  if (!demoMode) return {};
  const headerMult = Number(req.headers['x-demo-decay-multiplier'] || 24);
  const speedMultiplier = Number.isFinite(headerMult) && headerMult > 0 ? headerMult : 24;
  return { speedMultiplier, maxWindowHours: 24 };
}

// POST /api/battle/start
router.post('/start', async (req, res) => {
  try {
    const { byteId, mode, opponentByteId } = req.body;

    const byteA = await Byte.findById(byteId);
    if (!byteA || !byteA.isAlive) return res.status(400).json({ error: 'Byte not available' });

    // Apply need decay before battle — needs affect combat stats
    const decayedA = needDecay.applyDecay(byteA.needs.toObject(), byteA.lastNeedsUpdate, new Date(), getDecayOptions(req));
    byteA.needs = decayedA.needs;
    byteA.lastNeedsUpdate = decayedA.lastNeedsUpdate;
    byteA._computedStats = statEngine.applyNeedModifiers(byteA.stats.toObject(), decayedA.needs);

    // Resolve opponent
    let byteB;
    let opponentRating = null;
    if (mode === 'ai') {
      byteB = generateAIOpponent(byteA);
      opponentRating = Number(req.body?.opponentRating ?? 1000);
    } else if (mode === 'campaign') {
      byteB = generateSlopitronOpponent(byteA);
      opponentRating = 1200; // Hard mode rating
    } else {
      byteB = await Byte.findById(opponentByteId);
      if (!byteB || !byteB.isAlive) return res.status(400).json({ error: 'Opponent not available' });
      const decayedB = needDecay.applyDecay(byteB.needs.toObject(), byteB.lastNeedsUpdate, new Date(), getDecayOptions(req));
      byteB._computedStats = statEngine.applyNeedModifiers(byteB.stats.toObject(), decayedB.needs);
      const playerB = await Player.findById(byteB.ownerId).select('battleRating');
      opponentRating = Number(playerB?.battleRating || 1000);
    }

    // Load moves
    const allMoveIds = [...new Set([...byteA.equippedMoves, byteA.equippedUlt, ...byteB.equippedMoves, byteB.equippedUlt].filter(Boolean))];
    const moveDocs = await Move.find({ id: { $in: allMoveIds } });
    const moves = Object.fromEntries(moveDocs.map(m => [m.id, m.toObject()]));
    allMoveIds.forEach((moveId) => {
      if (!moves[moveId]) {
        const fallbackMove = findMoveInCatalog(moveId);
        if (fallbackMove) moves[moveId] = fallbackMove;
      }
    });

    // Validate and normalize equipped moves/ults for both bytes
    const loadoutA = validateAndNormalizeLoadout(byteA, moves);
    const loadoutB = validateAndNormalizeLoadout(byteB, moves);
    byteA.equippedMoves = loadoutA.equippedMoves;
    byteA.equippedUlt = loadoutA.equippedUlt;
    byteB.equippedMoves = loadoutB.equippedMoves;
    byteB.equippedUlt = loadoutB.equippedUlt;

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
    const { added, newDailyTotal } = economyEngine.applyIncome(playerA.dailyIncome, reward);
    playerA.byteBits += added;
    playerA.dailyIncome = newDailyTotal;

    byteA.xp += isWin ? 30 : 10;
    // Level up check
    while (byteA.xp >= xpRequired(byteA.level + 1) && byteA.level < 100) {
      byteA.level += 1;
    }

    // Post-battle strain ties combat loop back into care loop.
    const strain = isWin ? { Bandwidth: 10, Mood: 4, Fun: 3 } : { Bandwidth: 14, Mood: 7, Fun: 5 };
    byteA.needs.Bandwidth = Math.max(0, Number(byteA.needs.Bandwidth || 0) - strain.Bandwidth);
    byteA.needs.Mood = Math.max(0, Number(byteA.needs.Mood || 0) - strain.Mood);
    byteA.needs.Fun = Math.max(0, Number(byteA.needs.Fun || 0) - strain.Fun);
    byteA.lastNeedsUpdate = new Date();

    // Deduct used items from equippedItems
    if (result.itemsUsedA && result.itemsUsedA.length > 0) {
      byteA.equippedItems = (byteA.equippedItems || []).filter(itemId => !result.itemsUsedA.includes(itemId));
    }

    await byteA.save();

    const ratingResult = matchmakingEngine.applyRatingResult({
      currentRating: Number(playerA.battleRating || matchmakingEngine.RATING.base),
      didWin: isWin,
      currentStreak: Number(playerA.battleWinStreak || 0),
      opponentRating: Number(opponentRating || matchmakingEngine.RATING.base),
    });
    playerA.battleRating = ratingResult.rating;
    playerA.battleWinStreak = ratingResult.streak;
    await playerA.save();

    res.json({
      battleId: battle._id,
      winner: result.winner,
      mercyProc: result.mercyProc,
      earned: added,
      opponent: {
        byteId: String(byteB._id),
        name: byteB.name,
        level: byteB.level || 1,
        element: byteB.element,
        animal: byteB.animal,
        feature: byteB.feature,
        temperament: byteB.temperament || byteB.equippedPassive,
        equippedMoves: byteB.equippedMoves,
        equippedUlt: byteB.equippedUlt,
      },
      self: {
        byteId: String(byteA._id),
        name: byteA.name,
        level: byteA.level,
        element: byteA.element,
        temperament: byteA.temperament || byteA.equippedPassive,
      },
      maxHpA: result.maxHpA,
      maxHpB: result.maxHpB,
      finalHpA: result.finalHpA,
      finalHpB: result.finalHpB,
      battleLog: result.log,
      rating: {
        before: Number(playerA.battleRating || matchmakingEngine.RATING.base) - ratingResult.delta,
        after: ratingResult.rating,
        delta: ratingResult.delta,
        streak: ratingResult.streak,
      },
    });
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
    const _myLevel = myByteDoc?.level || 1;

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

// --- AI opponent generator ---
// Builds a legal combatant from real catalog data so battleEngine runs full logic
// (passives, ults, element bonuses, animal/feature) against a player Byte.
const AI_ELEMENTS  = ['Fire','Water','Earth','Air','Electric','Nature','Shadow','Holy','Normal'];
const AI_ANIMALS   = ['Cat','Dog','Bird','Fish','Rabbit','Fox','Wolf','Bear','Turtle','Snake','Frog','Monkey','Boar','Deer','Owl','Lion','Shark','Octopus','Dragon','Golem'];
const AI_FEATURES  = ['wings','horns','spikes','armor_plates','tail_variant','claws','fins','frill','shell','aura_core'];
const AI_NAMES = ['Slopitron.exe','Ghostnet.exe','Nullpup.bin','Grimcache.dll','Zerobyte.sys','Boglink.py','Dread404.tmp','Sicklog.dat'];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateSlopitronOpponent(byteA) {
  // Slopitron.exe: hard mode boss for campaign node 1
  // Level = player level + 2, min 5
  // Aggressive Normal element moveset with high defense
  const playerLevel = Math.max(1, byteA.level || 1);
  const slopLevel = Math.max(5, playerLevel + 2);
  
  // Aggressive Normal-type moveset (no element advantage)
  const normalMoves = MOVE_CATALOG.filter(m => m.element === 'Normal' && !m.isUlt && m.function === 'Damage');
  const equippedMoves = [];
  if (normalMoves.length > 0) {
    equippedMoves.push(normalMoves[0].id); // Primary damage
    if (normalMoves.length > 1) equippedMoves.push(normalMoves[1].id); // Secondary damage
  }
  if (equippedMoves.length === 0) equippedMoves.push('basic_ping.py');
  
  // Normal ult
  const normalUlt = MOVE_CATALOG.find(m => m.element === 'Normal' && m.isUlt);
  const equippedUlt = normalUlt?.id || null;
  
  // Aggressive passive temperament
  const passives = Object.keys(EFFECTS_REGISTRY.PASSIVES || {});
  const temperament = passives.includes('Aggressive') ? 'Aggressive' : pickRandom(passives);
  
  // Base stats 110 + level scaling; 10% defense boost for hard mode
  const baseVal = 110 + slopLevel * 1.8;
  const defenseVal = Math.round(baseVal * 1.1);
  
  return {
    _id: 'slopitron_' + Date.now(),
    name: 'Slopitron.exe',
    temperament,
    element: 'Normal',
    animal: 'Golem',
    feature: 'armor_plates',
    equippedMoves,
    equippedUlt,
    equippedPassive: temperament,
    isAlive: true,
    ownerId: null,
    level: slopLevel,
    _computedStats: {
      Power: Math.round(baseVal),
      Speed: Math.round(baseVal),
      Defense: defenseVal,
      Stamina: Math.round(baseVal),
      Accuracy: Math.round(baseVal * 0.95),
      Special: Math.round(baseVal * 0.85),
    },
    maxHp: Math.round(140 + slopLevel * 3),
    hp: Math.round(140 + slopLevel * 3),
  };
}

function generateAIOpponent(byteA) {
  const level = byteA.level || 1;
  const element = pickRandom(AI_ELEMENTS);

  // Pick 2 element moves; fallback to normal if insufficient
  const elementMoves = MOVE_CATALOG.filter(m => m.element === element && !m.isUlt);
  const normalMoves  = MOVE_CATALOG.filter(m => m.element === 'Normal' && !m.isUlt);
  const pool = elementMoves.length >= 2 ? elementMoves : [...elementMoves, ...normalMoves];

  // Bias toward Damage moves so AI is aggressive
  const damagePool = pool.filter(m => m.function === 'Damage');
  const otherPool  = pool.filter(m => m.function !== 'Damage');
  const moves = [];
  if (damagePool.length) moves.push(pickRandom(damagePool));
  if (otherPool.length) moves.push(pickRandom(otherPool));
  else if (damagePool.length > 1) {
    const secondPool = damagePool.filter(m => m.id !== moves[0]?.id);
    if (secondPool.length) moves.push(pickRandom(secondPool));
  }
  const equippedMoves = moves.map(m => m.id).slice(0, 2);
  if (equippedMoves.length === 0) equippedMoves.push('basic_ping.py');

  const ultMove = MOVE_CATALOG.find(m => m.isUlt && m.element === element);
  const equippedUlt = ultMove?.id || null;

  const passives = Object.keys(EFFECTS_REGISTRY.PASSIVES || {});
  const temperament = pickRandom(passives);

  const statVal = Math.min(95, 8 + level * 1.2);

  return {
    _id: 'ai_' + Date.now(),
    name: pickRandom(AI_NAMES),
    temperament,
    element,
    animal: pickRandom(AI_ANIMALS),
    feature: pickRandom(AI_FEATURES),
    equippedMoves,
    equippedUlt,
    equippedPassive: temperament,
    isAlive: true,
    ownerId: null,
    level,
    _computedStats: {
      Power:    Math.round(statVal),
      Speed:    Math.round(statVal),
      Defense:  Math.round(statVal),
      Stamina:  Math.round(statVal),
      Special:  Math.round(statVal),
      Accuracy: Math.round(statVal),
    }
  };
}

module.exports = router;