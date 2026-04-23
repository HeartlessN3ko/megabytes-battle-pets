const express = require('express');
const router = express.Router();
const CommunityEvent = require('../models/CommunityEvent');
const Player = require('../models/Player');

// GET /api/community-event/current - get current active event
router.get('/current', async (req, res) => {
  try {
    const now = new Date();
    const event = await CommunityEvent.findOne({
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    if (!event) {
      return res.json({ event: null });
    }

    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/community-event/:eventId/status - get event status
router.get('/:eventId/status', async (req, res) => {
  try {
    const event = await CommunityEvent.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const progressPercent = Math.min(100, Math.round((event.currentProgress / event.targetProgress) * 100));

    res.json({
      event,
      progressPercent,
      participantCount: event.participants.length,
      claimedCount: event.claimedBy.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/community-event/:eventId/claim - claim event reward
router.post('/:eventId/claim', async (req, res) => {
  try {
    const { playerId, playerContribution } = req.body;

    if (!playerId) {
      return res.status(400).json({ error: 'playerId required' });
    }

    const event = await CommunityEvent.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Check if already claimed
    if (event.claimedBy.includes(playerId)) {
      return res.status(400).json({ error: 'Already claimed reward' });
    }

    // Check event status
    if (event.status !== 'completed') {
      return res.status(400).json({ error: 'Event not completed yet' });
    }

    // Check minimum contribution (placeholder - no actual tracking)
    // TODO: Implement actual contribution tracking from campaign progress
    const hasMinContribution = (playerContribution || 0) >= event.minContribution;

    if (!hasMinContribution && event.minContribution > 0) {
      return res.status(403).json({ error: `Minimum contribution of ${event.minContribution} required` });
    }

    // Award reward
    if (event.reward.byteBits) {
      player.byteBits += event.reward.byteBits;
    }

    if (event.reward.items && event.reward.items.length > 0) {
      // TODO: Add items to player inventory
      // For now, just log that items should be awarded
    }

    event.claimedBy.push(playerId);
    await Promise.all([player.save(), event.save()]);

    res.json({
      success: true,
      reward: event.reward,
      message: 'Community event reward claimed!'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/community-event/contribute - contribute to event (no-op for now)
router.post('/contribute', async (req, res) => {
  try {
    const { playerId, eventId, contributionType: _contributionType, amount: _amount } = req.body;

    if (!playerId || !eventId) {
      return res.status(400).json({ error: 'playerId and eventId required' });
    }

    // TODO: Implement actual contribution tracking
    // This route is a placeholder for when campaign/battle system hooks into events
    // Currently does nothing - progress increments only via admin/server logic

    res.json({
      success: true,
      message: 'Contribution tracked (placeholder)'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
