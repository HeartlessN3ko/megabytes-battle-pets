const express = require('express');
const router = express.Router();
const Achievement = require('../models/Achievement');
const Player = require('../models/Player');

// GET /api/achievements - get all achievements
router.get('/', async (req, res) => {
  try {
    const achievements = await Achievement.find().sort({ category: 1, name: 1 });
    res.json({ achievements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/achievements/player/:playerId - get player achievement progress
router.get('/player/:playerId', async (req, res) => {
  try {
    const player = await Player.findById(req.params.playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const achievements = await Achievement.find();
    const unlockedIds = new Set(player.achievements || []);

    const progress = achievements.map((achievement) => ({
      ...achievement.toObject(),
      unlocked: unlockedIds.has(achievement._id.toString()),
      unlockedAt: unlockedIds.has(achievement._id.toString()) ? new Date() : null
    }));

    res.json({ achievements: progress, unlockedCount: unlockedIds.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/achievements/:achievementId/unlock - unlock an achievement
router.post('/:achievementId/unlock', async (req, res) => {
  try {
    const isDemo = req.headers['x-is-demo'] === 'true';

    if (isDemo) {
      return res.status(403).json({ error: 'Achievements do not track in demo mode' });
    }

    const { playerId } = req.body;
    if (!playerId) {
      return res.status(400).json({ error: 'playerId required' });
    }

    const achievement = await Achievement.findById(req.params.achievementId);
    if (!achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const achievementId = achievement._id.toString();
    if (player.achievements.includes(achievementId)) {
      return res.status(400).json({ error: 'Already unlocked' });
    }

    player.achievements.push(achievementId);
    if (achievement.reward.byteBits) {
      player.byteBits += achievement.reward.byteBits;
    }
    await player.save();

    res.json({
      success: true,
      achievement: achievement.name,
      reward: achievement.reward
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/achievements/check - check and unlock eligible achievements
router.post('/check', async (req, res) => {
  try {
    const { playerId } = req.body;
    if (!playerId) {
      return res.status(400).json({ error: 'playerId required' });
    }

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const achievements = await Achievement.find();
    const unlockedIds = new Set(player.achievements || []);
    const newlyUnlocked = [];

    // TODO: Implement achievement unlock logic based on player stats
    // This is a placeholder for game logic that checks player progress
    // Examples:
    // - Check totalGenerations for 'Breeder' achievement
    // - Check battle wins for 'Champion' achievement
    // - Check specific stat thresholds for 'Power' achievement

    res.json({
      newlyUnlocked,
      totalUnlocked: unlockedIds.size
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Seed default achievements ---
async function seedDefaultAchievements() {
  try {
    const count = await Achievement.countDocuments();
    if (count >= 39) return; // Already at full set

    const defaults = [
      // --- Milestone (8) ---
      { name: 'First Step',       description: 'Win your first battle',                           category: 'milestone',   rarity: 'common',     reward: { byteBits: 10,  xp: 25   }, criteria: { type: 'one_time', target: 1 } },
      { name: 'Node Master',      description: 'Clear 10 campaign nodes',                         category: 'milestone',   rarity: 'uncommon',   reward: { byteBits: 50,  xp: 100  }, criteria: { type: 'count',    target: 10, statName: 'nodesCompleted' } },
      { name: 'First Byte',       description: 'Hatch your first Byte',                           category: 'milestone',   rarity: 'common',     reward: { byteBits: 20,  xp: 50   }, criteria: { type: 'one_time', target: 1 } },
      { name: 'Evolved',          description: 'Reach Stage 2 evolution',                         category: 'milestone',   rarity: 'common',     reward: { byteBits: 30,  xp: 75   }, criteria: { type: 'stat_threshold', target: 2, statName: 'evolutionStage' } },
      { name: 'Veteran',          description: 'Win 50 battles total',                            category: 'milestone',   rarity: 'uncommon',   reward: { byteBits: 60,  xp: 125  }, criteria: { type: 'count',    target: 50, statName: 'battlesWon' } },
      { name: 'Endurance',        description: 'Keep your Byte alive for 14 days',                category: 'milestone',   rarity: 'rare',       reward: { byteBits: 80,  xp: 175  }, criteria: { type: 'count',    target: 14, statName: 'daysAlive' } },
      { name: 'Explorer',         description: 'Visit all care rooms at least once',               category: 'milestone',   rarity: 'common',     reward: { byteBits: 15,  xp: 40   }, criteria: { type: 'one_time', target: 1 } },
      { name: 'Comeback',         description: 'Win a battle after losing 3 in a row',            category: 'milestone',   rarity: 'uncommon',   reward: { byteBits: 45,  xp: 100  }, criteria: { type: 'one_time', target: 1 } },

      // --- Battle (9) ---
      { name: 'Champion',         description: 'Win 10 battles in a row',                         category: 'battle',      rarity: 'rare',       reward: { byteBits: 100, xp: 200  }, criteria: { type: 'streak',   target: 10, statName: 'winStreak' } },
      { name: 'Trainer',          description: 'Complete 25 training sessions',                   category: 'battle',      rarity: 'uncommon',   reward: { byteBits: 30,  xp: 75   }, criteria: { type: 'count',    target: 25, statName: 'trainingSessions' } },
      { name: 'Power Master',     description: 'Reach a Power stat of 80 or higher',              category: 'battle',      rarity: 'rare',       reward: { byteBits: 75,  xp: 150  }, criteria: { type: 'stat_threshold', target: 80, statName: 'Power' } },
      { name: 'Iron Wall',        description: 'Reach a Defense stat of 80 or higher',            category: 'battle',      rarity: 'rare',       reward: { byteBits: 75,  xp: 150  }, criteria: { type: 'stat_threshold', target: 80, statName: 'Defense' } },
      { name: 'Speed Demon',      description: 'Reach a Speed stat of 80 or higher',              category: 'battle',      rarity: 'rare',       reward: { byteBits: 75,  xp: 150  }, criteria: { type: 'stat_threshold', target: 80, statName: 'Speed' } },
      { name: 'Battle Tested',    description: 'Win 100 battles total',                           category: 'battle',      rarity: 'epic',       reward: { byteBits: 150, xp: 300  }, criteria: { type: 'count',    target: 100, statName: 'battlesWon' } },
      { name: 'Underdog',         description: 'Win against a higher-level opponent',             category: 'battle',      rarity: 'uncommon',   reward: { byteBits: 40,  xp: 90   }, criteria: { type: 'one_time', target: 1 } },
      { name: 'Slopitron Slayer', description: 'Defeat Slopitron.exe in campaign node 1',        category: 'battle',      rarity: 'uncommon',   reward: { byteBits: 50,  xp: 110  }, criteria: { type: 'one_time', target: 1 } },
      { name: 'Flawless',         description: 'Win a battle without taking any damage',          category: 'battle',      rarity: 'epic',       reward: { byteBits: 120, xp: 250  }, criteria: { type: 'one_time', target: 1 } },

      // --- Care (8) ---
      { name: 'Caretaker',        description: 'Perform 50 care actions',                         category: 'care',        rarity: 'common',     reward: { byteBits: 15,  xp: 50   }, criteria: { type: 'count',    target: 50, statName: 'careActions' } },
      { name: 'Happy Pet',        description: 'Reach 95% Mood',                                  category: 'care',        rarity: 'uncommon',   reward: { byteBits: 40,  xp: 100  }, criteria: { type: 'stat_threshold', target: 95, statName: 'Mood' } },
      { name: 'Feast',            description: 'Feed your Byte 100 times',                        category: 'care',        rarity: 'common',     reward: { byteBits: 20,  xp: 50   }, criteria: { type: 'count',    target: 100, statName: 'feedCount' } },
      { name: 'Neat Freak',       description: 'Reach 95% Hygiene',                               category: 'care',        rarity: 'uncommon',   reward: { byteBits: 40,  xp: 100  }, criteria: { type: 'stat_threshold', target: 95, statName: 'Hygiene' } },
      { name: 'Well Rested',      description: 'Reach 95% Energy',                                category: 'care',        rarity: 'uncommon',   reward: { byteBits: 40,  xp: 100  }, criteria: { type: 'stat_threshold', target: 95, statName: 'Bandwidth' } },
      { name: 'Party Animal',     description: 'Keep Mood above 80 for 24 hours',                 category: 'care',        rarity: 'rare',       reward: { byteBits: 70,  xp: 150  }, criteria: { type: 'one_time', target: 1 } },
      { name: "Doctor's Orders",  description: 'Visit the clinic 10 times',                       category: 'care',        rarity: 'uncommon',   reward: { byteBits: 35,  xp: 80   }, criteria: { type: 'count',    target: 10, statName: 'clinicVisits' } },
      { name: 'Never Neglected',  description: 'No need drops below 20 for 7 consecutive days',   category: 'care',        rarity: 'epic',       reward: { byteBits: 130, xp: 275  }, criteria: { type: 'one_time', target: 1 } },

      // --- Collection (6) ---
      { name: 'Egg Collector',    description: 'Hatch 5 different Bytes',                         category: 'collection',  rarity: 'uncommon',   reward: { byteBits: 50,  xp: 100  }, criteria: { type: 'count',    target: 5,  statName: 'bytesHatched' } },
      { name: 'Legacy',           description: 'Breed a second-generation Byte',                  category: 'collection',  rarity: 'rare',       reward: { byteBits: 100, xp: 200  }, criteria: { type: 'one_time', target: 1,  statName: 'generationCount' } },
      { name: 'Shape Shifter',    description: 'Hatch Bytes of 3 different shapes',               category: 'collection',  rarity: 'uncommon',   reward: { byteBits: 45,  xp: 100  }, criteria: { type: 'count',    target: 3,  statName: 'uniqueShapes' } },
      { name: 'Marketplace Maven',description: 'Purchase 5 items from the marketplace',           category: 'collection',  rarity: 'common',     reward: { byteBits: 25,  xp: 60   }, criteria: { type: 'count',    target: 5,  statName: 'itemsPurchased' } },
      { name: 'Auction King',     description: 'Win an auction',                                  category: 'collection',  rarity: 'uncommon',   reward: { byteBits: 55,  xp: 110  }, criteria: { type: 'one_time', target: 1 } },
      { name: 'Merchant',         description: 'Sell 5 items on the marketplace',                 category: 'collection',  rarity: 'common',     reward: { byteBits: 25,  xp: 60   }, criteria: { type: 'count',    target: 5,  statName: 'itemsSold' } },

      // --- Special / Hidden (8) ---
      { name: 'Legendary',        description: 'Unlock all rare achievements',                    category: 'special',     rarity: 'legendary',  reward: { byteBits: 500, xp: 1000 }, criteria: { type: 'one_time', target: 1 }, hidden: true },
      { name: 'Completionist',    description: 'Unlock 30 or more achievements',                  category: 'special',     rarity: 'epic',       reward: { byteBits: 200, xp: 400  }, criteria: { type: 'count',    target: 30, statName: 'achievementsUnlocked' }, hidden: true },
      { name: 'Corrupted',        description: 'Let your Byte reach corruption tier 3',           category: 'special',     rarity: 'uncommon',   reward: { byteBits: 30,  xp: 75   }, criteria: { type: 'stat_threshold', target: 3, statName: 'corruptionTier' }, hidden: true },
      { name: 'Purified',         description: 'Recover from maximum corruption',                 category: 'special',     rarity: 'rare',       reward: { byteBits: 90,  xp: 180  }, criteria: { type: 'one_time', target: 1 }, hidden: true },
      { name: 'Ghost Protocol',   description: 'Bring Missingno to Stage 3',                      category: 'special',     rarity: 'epic',       reward: { byteBits: 175, xp: 350  }, criteria: { type: 'stat_threshold', target: 3, statName: 'evolutionStage' }, hidden: true },
      { name: 'Event Hero',       description: 'Claim a community event reward',                  category: 'special',     rarity: 'uncommon',   reward: { byteBits: 50,  xp: 100  }, criteria: { type: 'one_time', target: 1 } },
      { name: 'Marathoner',       description: 'Log in for 30 consecutive days',                  category: 'special',     rarity: 'rare',       reward: { byteBits: 110, xp: 225  }, criteria: { type: 'count',    target: 30, statName: 'loginStreak' } },
      { name: 'Debug Mode',       description: 'Trigger the safety valve failsafe',               category: 'special',     rarity: 'legendary',  reward: { byteBits: 250, xp: 500  }, criteria: { type: 'one_time', target: 1 }, hidden: true },
    ];

    // ordered: false — skips duplicates, inserts new entries
    await Achievement.insertMany(defaults, { ordered: false });
    console.log(`✓ Seeded achievements (target: ${defaults.length})`);
  } catch (err) {
    // BulkWriteError from duplicates is expected on partial re-seed — log and continue
    if (err.code !== 11000 && err.name !== 'BulkWriteError') {
      console.error('Failed to seed achievements:', err.message);
    }
  }
}

// Seed on first import
seedDefaultAchievements();

module.exports = router;
