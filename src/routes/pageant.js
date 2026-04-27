/**
 * Pageant routes — v1 (care-first reframe).
 *
 * Pageants are once-per-lifespan-stage reveals of hidden state. Free entry,
 * gated by lifespan stage midway level. Returns 5 arbitrary stats, pet
 * grade, player grade, and 3 random facts pulled from current byte +
 * player metrics.
 *
 * Spec: docs/CLAUDE.md "What was done this session (2026-04-26 — pageant
 * reframe)" + engine/pageantEngine.js header.
 */

const express = require('express');
const Byte    = require('../models/Byte');
const pageantEngine = require('../engine/pageantEngine');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
router.use(optionalAuth);

// GET /api/pageant/eligibility/:byteId — returns whether this byte can
// enter the pageant for its current lifespan stage right now.
router.get('/eligibility/:byteId', async (req, res) => {
  try {
    const byte = await Byte.findById(req.params.byteId);
    if (!byte) return res.status(404).json({ error: 'Byte not found' });
    const result = pageantEngine.isEligible(byte);
    res.json({
      ...result,
      lifespanStage: byte.lifespanStage,
      level:         byte.level,
      pageantsEntered: byte.pageantsEntered || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pageant/enter  body: { byteId }
// Runs the pageant ceremony, persists the stage to byte.pageantsEntered,
// returns the full ceremony payload.
router.post('/enter', async (req, res) => {
  try {
    const { byteId } = req.body;
    if (!byteId) return res.status(400).json({ error: 'byteId required' });

    const byte = await Byte.findById(byteId);
    if (!byte) return res.status(404).json({ error: 'Byte not found' });

    const eligibility = pageantEngine.isEligible(byte);
    if (!eligibility.ok) {
      return res.status(400).json({ error: eligibility.reason, ...eligibility });
    }

    const ceremony = pageantEngine.runPageant(byte);

    // Persist: mark this stage's pageant as used.
    if (!Array.isArray(byte.pageantsEntered)) byte.pageantsEntered = [];
    byte.pageantsEntered.push(ceremony.stage);
    byte.markModified('pageantsEntered');
    await byte.save();

    res.json({
      ...ceremony,
      pageantsEntered: byte.pageantsEntered,
      lifespanStage:   byte.lifespanStage,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
