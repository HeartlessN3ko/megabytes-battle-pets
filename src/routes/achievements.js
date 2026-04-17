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

    // TODO: Implement achievement unlock logic based on player stats/milestones

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
      { name: 'First Step',       description: 'Win your first battle',                            category: 'milestone',   rarity: 'common',     reward: { byteBits: 10,  xp: 25  },  criteria: { type: 'one_time',       target: 1                               } },
      { name: 'Node Master',      description: 'Clear 10 campaign nodes',                          category: 'milestone',   rarity: 'uncommon',   reward: { byteBits: 50,  xp: 100 },  criteria: { type: 'count',          target: 10,  statName: 'nodesCompleted'  } },
      { name: 'First Byte',       description: 'Hatch your first Byte',                            category: 'milestone',   rarity: 'common',     reward: { byteBits: 20,  xp: 50  },  criteria: { type: 'one_time',       target: 1                               } },
      { name: 'Evolved',          description: 'Reach Stage 2 evolution',                          category: 'milestone',   rarity: 'common',     reward: { byteBits: 30,  xp: 75  },  criteria: { type: 'stat_threshold', target: 2,   statName: 'evolutionStage'  } },
      { name: 'Veteran',          description: 'Win 50 battles total',                             category: 'milestone',   rarity: 'uncommon',   reward: { byteBits: 60,  xp: 125 },  criteria: { type: 'count',          target: 50,  statName: 'battlesWon'      } },
      { name: 'Endurance',        description: 'Keep your Byte alive for 14 days',                 category: 'milestone',   rarity: 'rare',       reward: { byteBits: 80,  xp: 175 },  criteria: { type: 'count',          target: 14,  statName: 'daysAlive'       } },
      { name: 'Explorer',         description: 'Visit all care rooms at least once',               category: 'milestone',   rarity: 'common',     reward: { byteBits: 15,  xp: 40  },  criteria: { type: 'one_time',       target: 1                               } },
      { name: 'Comeback',         description: 'Win a battle after losing 3 in a row',             category: 'milestone',   rarity: 'uncommon',   reward: { byteBits: 45,  xp: 100 },  criteria: { type: 'one_time',       target: 1                               } },

      // --- Battle (9) ---
      { name: 'Champion',         description: 'Win 10 battles in a row',                          category: 'battle',      rarity: 'rare',       reward: { byteBits: 100, xp: 200 },  criteria: { type: 'streak',         target: 10,  statName: 'winStreak'       } },
      { name: 'Trainer',          description: 'Complete 25 training sessions',                    category: 'battle',      rarity: 'uncommon',   reward: { byteBits: 30,  xp: 75  },  criteria: { type: 'count',          target: 25,  statName: 'trainingSessions' } },
      { name: 'Power Master',     description: 'Reach a Power stat of 100',                        category: 'battle',      rarity: 'rare',       reward: { byteBits: 75,  xp: 150 },  criteria: { type: 'stat_threshold', target: 100, statName: 'power'           } },
      { name: 'Speed Demon',      description: 'Reach a Speed stat of 100',                        category: 'battle',      rarity: 'rare',       reward: { byteBits: 75,  xp: 150 },  criteria: { type: 'stat_threshold', target: 100, statName: 'speed'           } },
      { name: 'Ironwall',         description: 'Reach a Defense stat of 100',                      category: 'battle',      rarity: 'rare',       reward: { byteBits: 75,  xp: 150 },  criteria: { type: 'stat_threshold', target: 100, statName: 'defense'         } },
      { name: 'Slopitron Slayer', description: 'Defeat Slopitron.exe in the campaign',             category: 'battle',      rarity: 'uncommon',   reward: { byteBits: 60,  xp: 120 },  criteria: { type: 'one_time',       target: 1                               } },
      { name: 'Underdog',         description: 'Win a battle against a higher-level opponent',     category: 'battle',      rarity: 'uncommon',   reward: { byteBits: 40,  xp: 90  },  criteria: { type: 'one_time',       target: 1                               } },
      { name: 'Node Clearer',     description: 'Clear 25 campaign nodes total',                    category: 'battle',      rarity: 'rare',       reward: { byteBits: 90,  xp: 180 },  criteria: { type: 'count',          target: 25,  statName: 'nodesCompleted'  } },
      { name: 'Perfect Run',      description: 'Win a battle without taking damage',               category: 'battle',      rarity: 'epic',       reward: { byteBits: 150, xp: 300 },  criteria: { type: 'one_time',       target: 1                               } },

      // --- Care (8) ---
      { name: 'Nurturing',        description: 'Feed your Byte 10 times',                          category: 'care',        rarity: 'common',     reward: { byteBits: 15,  xp: 35  },  criteria: { type: 'count',          target: 10,  statName: 'feedCount'       } },
      { name: 'Sweet Dreams',     description: 'Put your Byte to sleep 5 times',                   category: 'care',        rarity: 'common',     reward: { byteBits: 20,  xp: 40  },  criteria: { type: 'count',          target: 5,   statName: 'sleepCount'      } },
      { name: 'Clean Byte',       description: 'Bathe your Byte 10 times',                         category: 'care',        rarity: 'common',     reward: { byteBits: 15,  xp: 35  },  criteria: { type: 'count',          target: 10,  statName: 'bathCount'       } },
      { name: 'Playdate',         description: 'Play with your Byte 10 times',                     category: 'care',        rarity: 'common',     reward: { byteBits: 15,  xp: 35  },  criteria: { type: 'count',          target: 10,  statName: 'playCount'       } },
      { name: 'Care Streak',      description: 'Complete daily care 7 days in a row',              category: 'care',        rarity: 'rare',       reward: { byteBits: 100, xp: 200 },  criteria: { type: 'streak',         target: 7,   statName: 'dailyCareStreak' } },
      { name: 'Full Recovery',    description: 'Use a clinic repair 3 times',                      category: 'care',        rarity: 'uncommon',   reward: { byteBits: 35,  xp: 80  },  criteria: { type: 'count',          target: 3,   statName: 'clinicUses'      } },
      { name: 'Caretaker',        description: 'Keep all needs above 60 for a full day',           category: 'care',        rarity: 'rare',       reward: { byteBits: 80,  xp: 160 },  criteria: { type: 'one_time',       target: 1                               } },
      { name: 'Best Friend',      description: 'Reach maximum affection with your Byte',           category: 'care',        rarity: 'epic',       reward: { byteBits: 200, xp: 400 },  criteria: { type: 'stat_threshold', target: 100, statName: 'affection'       } },

      // --- Collection (6) ---
      { name: 'Hoarder',          description: 'Own 10 different items at once',                   category: 'collection',  rarity: 'uncommon',   reward: { byteBits: 40,  xp: 90  },  criteria: { type: 'count',          target: 10,  statName: 'uniqueItems'     } },
      { name: 'Shopper',          description: 'Purchase 5 items from the shop',                   category: 'collection',  rarity: 'common',     reward: { byteBits: 20,  xp: 45  },  criteria: { type: 'count',          target: 5,   statName: 'shopPurchases'   } },
      { name: 'Auction Winner',   description: 'Win a marketplace auction',                        category: 'collection',  rarity: 'uncommon',   reward: { byteBits: 50,  xp: 100 },  criteria: { type: 'one_time',       target: 1                               } },
      { name: 'Generational',     description: 'Raise a second-generation Byte',                   category: 'collection',  rarity: 'rare',       reward: { byteBits: 90,  xp: 180 },  criteria: { type: 'stat_threshold', target: 2,   statName: 'generation'      } },
      { name: 'Decorated',        description: 'Place 5 decor items in your room',                 category: 'collection',  rarity: 'uncommon',   reward: { byteBits: 35,  xp: 75  },  criteria: { type: 'count',          target: 5,   statName: 'decorPlaced'     } },
      { name: 'Wealthy',          description: 'Accumulate 5000 ByteBits at once',                 category: 'collection',  rarity: 'rare',       reward: { byteBits: 0,   xp: 150 },  criteria: { type: 'stat_threshold', target: 5000, statName: 'byteBits'       } },

      // --- Special / Hidden (8) ---
      { name: 'Missingno Found',  description: '???',                                              category: 'special',     rarity: 'legendary',  reward: { byteBits: 500, xp: 1000 }, criteria: { type: 'one_time',       target: 1                               }, hidden: true },
      { name: 'Ghost in the Net', description: 'Encounter a corrupted Byte event',                 category: 'special',     rarity: 'epic',       reward: { byteBits: 200, xp: 350 },  criteria: { type: 'one_time',       target: 1                               }, hidden: true },
      { name: 'Survivor',         description: 'Recover from maximum corruption',                  category: 'special',     rarity: 'epic',       reward: { byteBits: 175, xp: 300 },  criteria: { type: 'one_time',       target: 1                               }, hidden: true },
      { name: 'Legacy',           description: 'Lose a Byte and receive a legacy egg',             category: 'special',     rarity: 'rare',       reward: { byteBits: 100, xp: 200 },  criteria: { type: 'one_time',       target: 1                               }, hidden: true },
      { name: 'Night Owl',        description: 'Care for your Byte after midnight 5 times',        category: 'special',     rarity: 'uncommon',   reward: { byteBits: 50,  xp: 100 },  criteria: { type: 'count',          target: 5,   statName: 'midnightCare'    }, hidden: true },
      { name: 'Community Hero',   description: 'Contribute to a completed community event',        category: 'special',     rarity: 'rare',       reward: { byteBits: 120, xp: 220 },  criteria: { type: 'one_time',       target: 1                               }, hidden: false },
      { name: 'Speed Runner',     description: 'Complete onboarding in under 2 minutes',           category: 'special',     rarity: 'uncommon',   reward: { byteBits: 40,  xp: 80  },  criteria: { type: 'one_time',       target: 1                               }, hidden: true },
      { name: 'Data Miner',       description: 'Read every item description in the shop',          category: 'special',     rarity: 'uncommon',   reward: { byteBits: 30,  xp: 60  },  criteria: { type: 'one_time',       target: 1                               }, hidden: true },
    ];

    await Achievement.insertMany(defaults, { ordered: false });
    console.log('[achievements] Seed complete: 39 achievements inserted.');
  } catch (err) {
    if (err.code === 11000 || (err.name === 'BulkWriteError' && err.code === 11000)) {
      console.log('[achievements] Seed skipped duplicates (BulkWriteError suppressed).');
      return;
    }
    console.error('[achievements] Seed error:', err.message);
  }
}

seedDefaultAchievements();

module.exports = router;
