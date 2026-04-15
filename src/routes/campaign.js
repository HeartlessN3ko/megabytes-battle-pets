const express = require('express');
const Campaign = require('../models/Campaign');
const Byte = require('../models/Byte');
const Player = require('../models/Player');

const router = express.Router();

// --- GET /api/campaign/:byteId ---
// Get current campaign progress for a byte
router.get('/:byteId', async (req, res) => {
  try {
    const { byteId } = req.params;
    const campaign = await Campaign.findOne({ byteId });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- POST /api/campaign/:byteId/start ---
// Initialize campaign for a byte
router.post('/:byteId/start', async (req, res) => {
  try {
    const { byteId } = req.params;

    let campaign = await Campaign.findOne({ byteId });
    if (campaign) {
      return res.json({ campaign, message: 'Campaign already started' });
    }

    const byte = await Byte.findById(byteId);
    if (!byte) {
      return res.status(404).json({ error: 'Byte not found' });
    }

    campaign = new Campaign({
      byteId,
      playerId: byte.ownerId,
      currentNode: 1,
      campaignStartedAt: new Date(),
    });

    await campaign.save();
    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- POST /api/campaign/:byteId/node/:nodeId/start ---
// Attempt to start a campaign node (validates, returns node config)
router.post('/:byteId/node/:nodeId/start', async (req, res) => {
  try {
    const { byteId, nodeId } = req.params;
    const nodeNumber = parseInt(nodeId, 10);

    const campaign = await Campaign.findOne({ byteId });
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not started' });
    }

    // TEMP: Only node 1 available (Slopitron.exe hard mode)
    if (nodeNumber !== 1) {
      return res.status(403).json({ error: 'This node is not yet accessible' });
    }

    res.json({
      nodeId: 1,
      nodeType: '1v1',
      enemies: [
        { id: 'slopitron-hard', name: 'Slopitron.exe', level: 8, maxHp: 140, element: 'data', role: 'boss' },
      ],
      modifiers: ['hard_mode', 'reduced_rewards'],
      reward: { xp: 75, byteBits: 50 },
      battleMode: 'auto-conduct',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- POST /api/campaign/:byteId/node/:nodeId/complete ---
// Complete a campaign node with battle result
router.post('/:byteId/node/:nodeId/complete', async (req, res) => {
  try {
    const { byteId, nodeId } = req.params;
    const { grade } = req.body; // 'fail', 'ok', 'good', 'perfect'
    const nodeNumber = parseInt(nodeId, 10);

    const campaign = await Campaign.findOne({ byteId });
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not started' });
    }

    // TODO: Validate grade
    // TODO: Calculate XP and rewards based on grade
    // TODO: Update node history
    // TODO: Check for city liberation (every 10 nodes)
    // TODO: Unlock challenge mode at node 50
    // TODO: Progress to next node or mark as failed

    const nodeHistory = campaign.nodeHistory.find((h) => h.nodeId === nodeNumber) || {
      nodeId: nodeNumber,
      attemptCount: 0,
    };

    if (grade !== 'fail') {
      nodeHistory.completedAt = new Date();
      nodeHistory.highestGrade = grade;
      campaign.nodesCompleted += 1;
      campaign.currentWinStreak += 1;
      if (campaign.currentWinStreak > campaign.longestWinStreak) {
        campaign.longestWinStreak = campaign.currentWinStreak;
      }
    } else {
      campaign.nodesFailed += 1;
      campaign.currentWinStreak = 0;
    }

    nodeHistory.attemptCount += 1;
    campaign.nodeHistory = campaign.nodeHistory.filter((h) => h.nodeId !== nodeNumber);
    campaign.nodeHistory.push(nodeHistory);
    campaign.lastNodeAttemptAt = new Date();

    if (nodeNumber > campaign.highestNodeReached) {
      campaign.highestNodeReached = nodeNumber;
    }

    await campaign.save();

    res.json({
      campaign,
      reward: { xp: 0, byteBits: 0, items: [] }, // TODO: calculate reward
      nextNode: nodeNumber + 1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GET /api/campaign/leaderboard ---
// Get campaign leaderboard (highest node reached)
router.get('/leaderboard', async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .sort({ highestNodeReached: -1, nodesCompleted: -1 })
      .limit(100)
      .populate('byteId', 'name level')
      .populate('playerId', 'name');

    res.json({ leaderboard: campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GET /api/campaign/:byteId/stats ---
// Get detailed campaign stats for a byte
router.get('/:byteId/stats', async (req, res) => {
  try {
    const { byteId } = req.params;
    const campaign = await Campaign.findOne({ byteId });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({
      nodesCompleted: campaign.nodesCompleted,
      nodesFailed: campaign.nodesFailed,
      currentWinStreak: campaign.currentWinStreak,
      longestWinStreak: campaign.longestWinStreak,
      highestNodeReached: campaign.highestNodeReached,
      totalXpEarned: campaign.totalXpEarned,
      totalByteBitsEarned: campaign.totalByteBitsEarned,
      citiesLiberated: campaign.citiesLiberated,
      challengeModeUnlocked: campaign.challengeModeUnlocked,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
