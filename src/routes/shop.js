const express = require('express');
const Player  = require('../models/Player');
const Item    = require('../models/Item');
const Room    = require('../models/Room');
const Byte    = require('../models/Byte');
const needDecay = require('../engine/needDecay');
const { getEffect } = require('../data/effectsRegistry');

const router = express.Router();
// TODO: add auth middleware

// GET /api/shop/items
router.get('/items', async (req, res) => {
  try {
    const items = await Item.find({ isSystemItem: false });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shop/rooms
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await Room.find({});
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shop/buy/item
router.post('/buy/item', async (req, res) => {
  try {
    const { playerId, itemId } = req.body;
    const [player, item] = await Promise.all([Player.findById(playerId), Item.findOne({ id: itemId })]);
    if (!player || !item) return res.status(404).json({ error: 'Not found' });
    if (player.byteBits < item.cost) return res.status(400).json({ error: 'Insufficient byte.bits' });

    player.byteBits -= item.cost;
    player.unlockedItems.addToSet(itemId);
    await player.save();
    res.json({ purchased: itemId, byteBitsRemaining: player.byteBits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shop/buy/room
router.post('/buy/room', async (req, res) => {
  try {
    const { playerId, roomId } = req.body;
    const [player, room] = await Promise.all([Player.findById(playerId), Room.findOne({ id: roomId })]);
    if (!player || !room) return res.status(404).json({ error: 'Not found' });
    if (player.byteBits < room.unlockCost) return res.status(400).json({ error: 'Insufficient byte.bits' });
    if (player.unlockedRooms.includes(roomId)) return res.status(400).json({ error: 'Already unlocked' });

    player.byteBits -= room.unlockCost;
    player.unlockedRooms.push(roomId);
    await player.save();
    res.json({ unlocked: roomId, byteBitsRemaining: player.byteBits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shop/equip/passive-room
router.post('/equip/passive-room', async (req, res) => {
  try {
    const { playerId, roomId } = req.body;
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ error: 'Not found' });
    if (!player.unlockedRooms.includes(roomId)) return res.status(400).json({ error: 'Room not unlocked' });
    if (player.activePassiveRooms.length >= 2) return res.status(400).json({ error: 'Max 2 passive rooms active' });

    player.activePassiveRooms.addToSet(roomId);
    await player.save();
    res.json({ activePassiveRooms: player.activePassiveRooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shop/use/item
router.post('/use/item', async (req, res) => {
  try {
    const { playerId, byteId, itemId } = req.body;
    const [player, byte, item] = await Promise.all([
      Player.findById(playerId),
      Byte.findById(byteId),
      Item.findOne({ id: itemId })
    ]);
    if (!player || !byte || !item) return res.status(404).json({ error: 'Not found' });
    if (!player.unlockedItems.includes(itemId)) return res.status(400).json({ error: 'Item not in inventory' });

    const effects = [];

    // Need restore
    if (item.restoreNeeds && Object.keys(item.restoreNeeds).length > 0) {
      const needs = byte.needs.toObject();
      for (const [need, amount] of item.restoreNeeds.entries()) {
        needs[need] = Math.min(100, (needs[need] || 0) + amount);
      }
      byte.needs = needs;
      effects.push('needs_restored');
    }

    // Move teaching
    if (item.teachesMove?.length > 0) {
      for (const move of item.teachesMove) {
        byte.learnedMoves.addToSet(move);
      }
      effects.push('move_learned');
    }

    // Effect application
    if (item.appliesEffect) {
      byte.activeEffects.addToSet(item.appliesEffect);
      effects.push(`effect_applied:${item.appliesEffect}`);
    }

    // Remove from inventory (single-use)
    player.unlockedItems = player.unlockedItems.filter(i => i !== itemId);

    await byte.save();
    await player.save();
    res.json({ itemUsed: itemId, effects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
