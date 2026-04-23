const express = require('express');
const router = express.Router();
const Onboarding = require('../models/Onboarding');
const onboardingStages = require('../services/onboardingStages');

// GET /api/onboarding/:playerId - get current progress
router.get('/:playerId', async (req, res) => {
  try {
    let onboarding = await Onboarding.findOne({ playerId: req.params.playerId });

    if (!onboarding) {
      onboarding = new Onboarding({ playerId: req.params.playerId, currentStage: 'entry' });
      await onboarding.save();
    }

    const stageData = onboardingStages.getStageData(onboarding.currentStage);

    res.json({
      playerId: onboarding.playerId,
      currentStage: onboarding.currentStage,
      stageData,
      selectedEggShape: onboarding.selectedEggShape,
      completedStages: onboarding.completedStages,
      isComplete: onboarding.isComplete,
      completedAt: onboarding.completedAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/onboarding/:playerId/advance - move to next stage
router.post('/:playerId/advance', async (req, res) => {
  try {
    const onboarding = await Onboarding.findOne({ playerId: req.params.playerId });

    if (!onboarding) {
      return res.status(404).json({ error: 'Onboarding not found' });
    }

    if (onboarding.isComplete) {
      return res.status(400).json({ error: 'Onboarding already complete' });
    }

    // Mark current stage as completed
    if (!onboarding.completedStages.includes(onboarding.currentStage)) {
      onboarding.completedStages.push(onboarding.currentStage);
    }

    // Get next stage
    const nextStage = onboardingStages.getNextStage(onboarding.currentStage);

    if (!nextStage) {
      // Final stage reached
      onboarding.isComplete = true;
      onboarding.completedAt = new Date();
    } else {
      onboarding.currentStage = nextStage;
    }

    await onboarding.save();

    const stageData = onboardingStages.getStageData(onboarding.currentStage);

    res.json({
      playerId: onboarding.playerId,
      currentStage: onboarding.currentStage,
      stageData,
      selectedEggShape: onboarding.selectedEggShape,
      completedStages: onboarding.completedStages,
      isComplete: onboarding.isComplete,
      completedAt: onboarding.completedAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/onboarding/:playerId/select-egg - select egg shape
router.post('/:playerId/select-egg', async (req, res) => {
  try {
    const { shape } = req.body;
    const validShapes = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];

    if (!shape || !validShapes.includes(shape)) {
      return res.status(400).json({ error: 'Invalid egg shape' });
    }

    const onboarding = await Onboarding.findOne({ playerId: req.params.playerId });

    if (!onboarding) {
      return res.status(404).json({ error: 'Onboarding not found' });
    }

    onboarding.selectedEggShape = shape;
    await onboarding.save();

    res.json({
      playerId: onboarding.playerId,
      selectedEggShape: onboarding.selectedEggShape
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
