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

// --- Seed default achievements if database is empty ---
async function seedDefaultAchievements() {
  try {
    const count = await Achievement.countDocuments();
    if (count > 0) return; // Already seeded

    const defaults = [
      // Milestone achievements
      { name: 'First Step', description: 'Complete your first battle', category: 'milestone', rarity: 'common', reward: { byteBits: 10, xp: 25 }, criteria: { type: 'one_time', target: 1 } },
      { name: 'Node Master', description: 'Clear campaign node 10', category: 'milestone', rarity: 'uncommon', reward: { byteBits: 50, xp: 100 }, criteria: { type: 'count', target: 10, statName: 'nodesCompleted' } },
      { name: 'Champion', description: 'Win 10 battles in a row', category: 'battle', rarity: 'rare', reward: { byteBits: 100, xp: 200 }, criteria: { type: 'streak', target: 10, statName: 'winStreak' } },

      // Care achievements
      { name: 'Caretaker', description: 'Use care actions 50 times', category: 'care', rarity: 'common', reward: { byteBits: 15, xp: 50 }, criteria: { type: 'count', target: 50, statName: 'careActions' } },
      { name: 'Happy Pet', description: 'Maximize one need stat', category: 'care', rarity: 'uncommon', reward: { byteBits: 40, xp: 100 }, criteria: { type: 'stat_threshold', target: 95, statName: 'Mood' } },

      // Training achievements
      { name: 'Trainer', description: 'Complete 25 training sessions', category: 'battle', rarity: 'uncommon', reward: { byteBits: 30, xp: 75 }, criteria: { type: 'count', target: 25, statName: 'trainingSessions' } },
      { name: 'Power Master', description: 'Reach Power stat of 80+', category: 'battle', rarity: 'rare', reward: { byteBits: 75, xp: 150 }, criteria: { type: 'stat_threshold', target: 80, statName: 'Power' } },

      // Collection achievements
      { name: 'Egg Collector', description: 'Hatch 5 different Bytes', category: 'collection', rarity: 'uncommon', reward: { byteBits: 50, xp: 100 }, criteria: { type: 'count', target: 5, statName: 'bytesHatched' } },
      { name: 'Legacy', description: 'Breed a second generation Byte', category: 'collection', rarity: 'rare', reward: { byteBits: 100, xp: 200 }, criteria: { type: 'one_time', target: 1, statName: 'generationCount' } },

      // Special achievements
      { name: 'Legendary', description: 'Unlock all rare achievements', category: 'special', rarity: 'legendary', reward: { byteBits: 500, xp: 1000 }, criteria: { type: 'one_time', target: 1 }, hidden: true },
    ];

    await Achievement.insertMany(defaults);
    console.log(`✓ Seeded ${defaults.length} default achievements`);
  } catch (err) {
    console.error('Failed to seed achievements:', err.message);
  }
}

// Seed on first import
seedDefaultAchievements();

module.exports = router;
