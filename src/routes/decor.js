const express = require('express');
const Byte = require('../models/Byte');
const Player = require('../models/Player');
const { DECOR_CATALOG, getDecorItem } = require('../data/decorCatalog');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
router.use(optionalAuth);

/**
 * GET /api/decor/catalog
 * Returns the full decor catalog (read-only metadata).
 * Inventory + marketplace UIs merge this with shop items so decor entries
 * render with type='decor' and the correct PLACE IN ROOM affordance.
 */
router.get('/catalog', (req, res) => {
  try {
    const rows = DECOR_CATALOG.map((item) => ({
      id:          item.id,
      name:        item.name,
      description: item.description,
      layer:       item.layer,
      value:       item.value,
      cost:        item.cost,
      asset:       item.asset,
      type:        'decor',
      effects:     item.effects || {},
    }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/decor/equip
 * Body: { playerId, byteId, itemId }
 * Adds itemId to byte.decorItems in its catalog-defined layer.
 * Replaces any existing item in the same layer (one slot per layer).
 * Requires player.unlockedItems to include itemId (acquired via marketplace).
 */
router.post('/equip', async (req, res) => {
  try {
    const { playerId, byteId, itemId } = req.body || {};
    if (!playerId || !byteId || !itemId) {
      return res.status(400).json({ error: 'playerId, byteId, and itemId are required' });
    }

    const catalogItem = getDecorItem(itemId);
    if (!catalogItem) return res.status(404).json({ error: 'Decor item not found in catalog' });

    const [player, byte] = await Promise.all([
      Player.findById(playerId),
      Byte.findById(byteId),
    ]);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (!byte) return res.status(404).json({ error: 'Byte not found' });
    if (String(byte.playerId) !== String(player._id)) {
      return res.status(403).json({ error: 'Byte does not belong to player' });
    }

    const owned = Array.isArray(player.unlockedItems) && player.unlockedItems.includes(itemId);
    if (!owned) return res.status(403).json({ error: 'You do not own this decor item' });

    const current = Array.isArray(byte.decorItems) ? byte.decorItems.slice() : [];

    // Already equipped — no-op success
    if (current.some((e) => (e?.id || e) === itemId)) {
      return res.json({ ok: true, decorItems: current, alreadyEquipped: true });
    }

    // Remove any item in the same layer (slot replacement)
    const filtered = current.filter((e) => {
      const id = e?.id || e;
      const existing = getDecorItem(id);
      return existing ? existing.layer !== catalogItem.layer : true;
    });

    filtered.push({ id: catalogItem.id, layer: catalogItem.layer, value: catalogItem.value });

    byte.decorItems = filtered;
    byte.markModified('decorItems');
    await byte.save();

    res.json({ ok: true, decorItems: byte.decorItems, equipped: catalogItem.id, layer: catalogItem.layer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/decor/unequip
 * Body: { playerId, byteId, itemId }
 * Removes itemId from byte.decorItems. Item remains in player.unlockedItems.
 */
router.post('/unequip', async (req, res) => {
  try {
    const { playerId, byteId, itemId } = req.body || {};
    if (!playerId || !byteId || !itemId) {
      return res.status(400).json({ error: 'playerId, byteId, and itemId are required' });
    }

    const byte = await Byte.findById(byteId);
    if (!byte) return res.status(404).json({ error: 'Byte not found' });
    if (String(byte.playerId) !== String(playerId)) {
      return res.status(403).json({ error: 'Byte does not belong to player' });
    }

    const current = Array.isArray(byte.decorItems) ? byte.decorItems : [];
    const filtered = current.filter((e) => (e?.id || e) !== itemId);

    byte.decorItems = filtered;
    byte.markModified('decorItems');
    await byte.save();

    res.json({ ok: true, decorItems: byte.decorItems, unequipped: itemId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
