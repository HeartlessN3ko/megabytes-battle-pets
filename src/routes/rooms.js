const express = require('express');
const Room = require('../models/Room');
const Player = require('../models/Player');
const behaviorTracker = require('../engine/behaviorTracker');
const Byte = require('../models/Byte');
const { SHOP_ROOMS } = require('../data/shopCatalog');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
router.use(optionalAuth);

async function getAllRooms() {
  const dbRooms = await Room.find({});
  if (dbRooms.length > 0) return dbRooms;
  return SHOP_ROOMS;
}

// GET /api/rooms
router.get('/', async (req, res) => {
  try {
    const rooms = await getAllRooms();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/player/:playerId
router.get('/player/:playerId', async (req, res) => {
  try {
    const player = await Player.findById(req.params.playerId).select('unlockedRooms activePassiveRooms');
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const allRooms = await getAllRooms();
    const rooms = allRooms.filter((r) => player.unlockedRooms.includes(r.id));
    const enriched = rooms.map((r) => {
      const base = typeof r.toObject === 'function' ? r.toObject() : r;
      return {
        ...base,
        isActivePassive: player.activePassiveRooms.includes(base.id),
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rooms/:id
router.get('/:id', async (req, res) => {
  try {
    let room = await Room.findOne({ id: req.params.id });
    if (!room) room = SHOP_ROOMS.find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Not found' });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms/swap-passive
router.post('/swap-passive', async (req, res) => {
  try {
    const { playerId, removeRoomId, addRoomId } = req.body;
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ error: 'Not found' });
    if (!player.unlockedRooms.includes(addRoomId)) return res.status(400).json({ error: 'Room not unlocked' });

    player.activePassiveRooms = player.activePassiveRooms.filter((r) => r !== removeRoomId);
    if (!player.activePassiveRooms.includes(addRoomId)) {
      if (player.activePassiveRooms.length >= 2) return res.status(400).json({ error: 'Max 2 passive rooms' });
      player.activePassiveRooms.push(addRoomId);
    }

    await player.save();
    res.json({ activePassiveRooms: player.activePassiveRooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms/enter
router.post('/enter', async (req, res) => {
  try {
    const { byteId, roomId, durationMinutes } = req.body;
    const byte = await Byte.findById(byteId);
    if (!byte) return res.status(404).json({ error: 'Byte not found' });

    const metrics = behaviorTracker.recordRoomTime(
      byte.behaviorMetrics.toObject?.() || byte.behaviorMetrics,
      roomId,
      durationMinutes || 1
    );
    byte.behaviorMetrics = metrics;
    await byte.save();

    res.json({ recorded: true, room: roomId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
