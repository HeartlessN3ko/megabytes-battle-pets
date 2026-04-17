const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true }, // e.g. "Library"
  name:     { type: String, required: true },
  category: { type: String, enum: ['core', 'active', 'collection', 'passive'], required: true },

  // Passive rooms: always-on stat bonus when equipped
  passiveEffect: {
    stat:     { type: String, default: null }, // Power, Speed, Defense, Special, Accuracy, Stamina, Bandwidth, Mood
    modifier: { type: Number, default: 0 }     // 0.05–0.10 (5–10%)
  },

  // Core/active rooms: what actions are available inside
  availableActions: { type: [String], default: [] },

  // Unlock gate
  unlockCost:  { type: Number, default: 0 },  // byte.bits
  unlockLevel: { type: Number, default: 1 },  // player level gate

  description: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);
