const express = require('express');
const Player = require('../models/Player');
const Item = require('../models/Item');
const Room = require('../models/Room');
const Byte = require('../models/Byte');
const { SHOP_ITEMS, SHOP_ROOMS, asMapObject } = require('../data/shopCatalog');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
router.use(optionalAuth);

function toPlainMap(mapOrObj) {
  if (!mapOrObj) return {};
  if (typeof mapOrObj.entries === 'function') return Object.fromEntries(mapOrObj.entries());
  return asMapObject(mapOrObj);
}

function mergeNeeds(current, delta) {
  const next = { ...current };
  Object.entries(delta || {}).forEach(([need, amount]) => {
    const base = Number(next[need] || 0);
    next[need] = Math.max(0, Math.min(100, base + Number(amount || 0)));
  });
  return next;
}

async function getCatalogItems() {
  const dbItems = await Item.find({ isSystemItem: false });
  if (dbItems.length > 0) return dbItems;
  return SHOP_ITEMS;
}

async function getCatalogRooms() {
  const dbRooms = await Room.find({});
  if (dbRooms.length > 0) return dbRooms;
  return SHOP_ROOMS;
}

function findCatalogItem(itemId) {
  return SHOP_ITEMS.find((i) => i.id === itemId) || null;
}

function getInventoryCount(player, itemId) {
  const list = Array.isArray(player.itemInventory) ? player.itemInventory : [];
  const entry = list.find((e) => e.itemId === itemId);
  return Number(entry?.quantity || 0);
}

function setInventoryCount(player, itemId, qty) {
  const safeQty = Math.max(0, Number(qty || 0));
  if (!Array.isArray(player.itemInventory)) {
    player.itemInventory = [];
  }
  const idx = player.itemInventory.findIndex((e) => e.itemId === itemId);
  if (idx === -1) {
    if (safeQty > 0) player.itemInventory.push({ itemId, quantity: safeQty });
    return;
  }
  if (safeQty <= 0) {
    player.itemInventory.splice(idx, 1);
    return;
  }
  player.itemInventory[idx].quantity = safeQty;
}

// GET /api/shop/items
router.get('/items', async (req, res) => {
  try {
    const items = await getCatalogItems();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shop/rooms
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await getCatalogRooms();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shop/buy/item
router.post('/buy/item', async (req, res) => {
  try {
    const { playerId, itemId } = req.body;
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    let item = await Item.findOne({ id: itemId });
    if (!item) item = findCatalogItem(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const cost = Number(item.cost || 0);
    if (player.byteBits < cost) return res.status(400).json({ error: 'Insufficient byte.bits' });

    player.byteBits -= cost;
    const currentQty = getInventoryCount(player, itemId);
    setInventoryCount(player, itemId, currentQty + 1);
    player.unlockedItems.addToSet(itemId);
    await player.save();

    res.json({
      purchased: itemId,
      byteBitsRemaining: player.byteBits,
      quantity: getInventoryCount(player, itemId)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shop/buy/room
router.post('/buy/room', async (req, res) => {
  try {
    const { playerId, roomId } = req.body;
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    let room = await Room.findOne({ id: roomId });
    if (!room) room = SHOP_ROOMS.find((r) => r.id === roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const unlockCost = Number(room.unlockCost || 0);
    if (player.byteBits < unlockCost) return res.status(400).json({ error: 'Insufficient byte.bits' });
    if (player.unlockedRooms.includes(roomId)) return res.status(400).json({ error: 'Already unlocked' });

    player.byteBits -= unlockCost;
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
    const [player, byte] = await Promise.all([Player.findById(playerId), Byte.findById(byteId)]);
    if (!player || !byte) return res.status(404).json({ error: 'Not found' });
    let currentQty = getInventoryCount(player, itemId);
    if (currentQty <= 0 && player.unlockedItems.includes(itemId)) {
      // Backfill legacy inventory entries.
      currentQty = 1;
      setInventoryCount(player, itemId, 1);
    }
    if (currentQty <= 0) return res.status(400).json({ error: 'Item not in inventory' });

    let item = await Item.findOne({ id: itemId });
    if (!item) item = findCatalogItem(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const effects = [];

    const restoreNeeds = toPlainMap(item.restoreNeeds);
    if (restoreNeeds && Object.keys(restoreNeeds).length > 0) {
      byte.needs = mergeNeeds(byte.needs.toObject(), restoreNeeds);
      effects.push('needs_restored');
    }

    if (Array.isArray(item.teachesMove) && item.teachesMove.length > 0) {
      item.teachesMove.forEach((move) => byte.learnedMoves.addToSet(move));
      effects.push('move_learned');
    }

    if (item.appliesEffect) {
      byte.activeEffects.addToSet(item.appliesEffect);
      effects.push(`effect_applied:${item.appliesEffect}`);
    }

    setInventoryCount(player, itemId, currentQty - 1);
    const remaining = getInventoryCount(player, itemId);
    if (remaining <= 0) {
      player.unlockedItems = player.unlockedItems.filter((i) => i !== itemId);
    } else {
      player.unlockedItems.addToSet(itemId);
    }

    await byte.save();
    await player.save();
    res.json({ itemUsed: itemId, effects, quantityRemaining: remaining });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
