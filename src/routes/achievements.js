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

module.exports = router;
