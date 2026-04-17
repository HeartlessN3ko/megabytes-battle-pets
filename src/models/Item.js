const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  id:    { type: String, required: true, unique: true }, // e.g. "recovery_patch.pkg"
  name:  { type: String, required: true },
  type:  { type: String, enum: ['recovery', 'stat_boost', 'disruption', 'utility', 'clutch', 'evolution', 'byte_slot', 'egg_slot', 'move_teach', 'cosmetic'], required: true },

  // Cost in byte.bits
  cost: { type: Number, default: 0 },

  // Effect on use
  appliesEffect:  { type: String, default: null }, // effectsRegistry key
  restoreNeeds:   { type: Map, of: Number, default: {} }, // { Hunger: 50, Bandwidth: 50 }
  teachesMove:    { type: [String], default: [] },

  // For evolution gates
  unlocksStage: { type: String, default: null }, // 'element' | 'feature' | 'branch'

  // Use rules
  useType:         { type: String, enum: ['instant', 'passive', 'battle_only', 'overworld_only'], default: 'instant' },
  durationSeconds: { type: Number, default: 0 }, // 0 = instant

  // Softlock: recovery_patch.pkg is system-granted, not purchasable
  isSystemItem: { type: Boolean, default: false },

  description: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Item', ItemSchema);
