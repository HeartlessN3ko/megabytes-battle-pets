const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  quantity: { type: Number, default: 0, min: 0 }
}, { _id: false });

const PlayerSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },

  // Currency
  byteBits: { type: Number, default: 0 },

  // Active byte slots (max 3)
  activeByteSlots: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Byte' }],

  // Egg storage
  eggSlots: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Byte' }],

  // Unlocked content
  unlockedRooms:   { type: [String], default: ['Bedroom', 'Kitchen', 'Bathroom', 'Training_Center'] },
  unlockedItems:   { type: [String], default: [] },
  itemInventory:   { type: [InventoryItemSchema], default: [] },
  unlockedMoves:   { type: [String], default: ['basic_ping.py'] },

  // Active passive rooms (max 2)
  activePassiveRooms: { type: [String], default: [], validate: v => v.length <= 2 },

  // Progression
  totalGenerations: { type: Number, default: 0 },
  achievements:     { type: [String], default: [] },

  // Arena (passive PvP listing)
  arenaByteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Byte', default: null },
  arenaRecord: {
    wins:   { type: Number, default: 0 },
    losses: { type: Number, default: 0 }
  },
  battleRating: { type: Number, default: 1000, min: 0, max: 3000 },
  battleWinStreak: { type: Number, default: 0, min: 0 },

  // Settings
  settings: {
    notifications: { type: Boolean, default: true },
    audio:         { type: Boolean, default: true },
    reducedMotion: { type: Boolean, default: false },
    theme:         { type: String, default: 'default' }
  },

  // Daily tracking
  dailyIncome:     { type: Number, default: 0 },
  lastDailyReset:  { type: Date, default: Date.now },
  minigamePlaysToday: { type: Number, default: 0 }

}, { timestamps: true });

module.exports = mongoose.model('Player', PlayerSchema);
