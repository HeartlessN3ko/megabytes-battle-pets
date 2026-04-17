const express = require('express');
const InboxMessage = require('../models/InboxMessage');
const Player = require('../models/Player');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
router.use(optionalAuth);

function getInventoryCount(player, itemId) {
  const list = Array.isArray(player.itemInventory) ? player.itemInventory : [];
  const entry = list.find((e) => e.itemId === itemId);
  return Number(entry?.quantity || 0);
}

function setInventoryCount(player, itemId, qty) {
  const safeQty = Math.max(0, Number(qty || 0));
  if (!Array.isArray(player.itemInventory)) player.itemInventory = [];
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

router.get('/:playerId', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    let messages = await InboxMessage.find({ playerId }).sort({ createdAt: -1 }).limit(100);
    if (messages.length === 0) {
      await InboxMessage.create({
        playerId,
        kind: 'system',
        subject: 'Welcome to Inbox',
        body: 'Marketplace deliveries, rewards, and event mail will appear here.',
        attachments: [],
        metadata: { seeded: true },
      });
      messages = await InboxMessage.find({ playerId }).sort({ createdAt: -1 }).limit(100);
    }
    const now = new Date();
    res.json(
      messages
        .filter((msg) => !msg.readyAt || new Date(msg.readyAt) <= now)
        .map((msg) => ({
          id: String(msg._id),
          kind: msg.kind,
          subject: msg.subject,
          body: msg.body,
          attachments: msg.attachments || [],
          metadata: msg.metadata || {},
          claimed: Boolean(msg.claimed),
          readAt: msg.readAt,
          claimedAt: msg.claimedAt,
          createdAt: msg.createdAt,
        }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/claim', async (req, res) => {
  try {
    const { playerId, messageId } = req.body || {};
    if (!playerId || !messageId) return res.status(400).json({ error: 'playerId and messageId are required' });

    const [player, message] = await Promise.all([
      Player.findById(playerId),
      InboxMessage.findById(messageId),
    ]);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (String(message.playerId) !== String(player._id)) return res.status(403).json({ error: 'Message does not belong to player' });
    if (message.readyAt && new Date(message.readyAt) > new Date()) {
      return res.status(400).json({ error: 'Message is not ready to claim yet' });
    }
    if (message.claimed) {
      return res.json({ ok: true, alreadyClaimed: true, byteBits: player.byteBits, itemInventory: player.itemInventory });
    }

    const claimedNow = await InboxMessage.findOneAndUpdate(
      { _id: messageId, playerId, claimed: false },
      {
        $set: {
          claimed: true,
          claimedAt: new Date(),
          readAt: message.readAt || new Date(),
        },
      },
      { new: true }
    );
    if (!claimedNow) {
      return res.json({ ok: true, alreadyClaimed: true, byteBits: player.byteBits, itemInventory: player.itemInventory });
    }

    let grantedBits = 0;
    const grantedItems = [];

    for (const attachment of claimedNow.attachments || []) {
      if (attachment.type === 'currency') {
        const bits = Number(attachment.byteBits || 0);
        if (bits > 0) {
          player.byteBits = Number(player.byteBits || 0) + bits;
          grantedBits += bits;
        }
      }
      if (attachment.type === 'item' && attachment.itemId) {
        const qty = Math.max(1, Number(attachment.quantity || 1));
        const current = getInventoryCount(player, attachment.itemId);
        setInventoryCount(player, attachment.itemId, current + qty);
        if (!Array.isArray(player.unlockedItems)) player.unlockedItems = [];
        if (!player.unlockedItems.includes(attachment.itemId)) {
          player.unlockedItems.push(attachment.itemId);
        }
        grantedItems.push({ itemId: attachment.itemId, quantity: qty });
      }
    }
    await player.save();
    res.json({
      ok: true,
      claimedMessageId: String(claimedNow._id),
      grantedBits,
      grantedItems,
      byteBits: player.byteBits,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/read', async (req, res) => {
  try {
    const { playerId, messageId } = req.body || {};
    if (!playerId || !messageId) return res.status(400).json({ error: 'playerId and messageId are required' });
    const message = await InboxMessage.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (String(message.playerId) !== String(playerId)) return res.status(403).json({ error: 'Message does not belong to player' });
    if (!message.readAt) {
      message.readAt = new Date();
      await message.save();
    }
    res.json({ ok: true, messageId: String(message._id), readAt: message.readAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
