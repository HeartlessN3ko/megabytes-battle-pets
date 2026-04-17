const mongoose = require('mongoose');

// Moves are seeded data — this schema stores the master list.
const MoveSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true }, // e.g. "basic_ping.py"
  name:     { type: String, required: true },
  element:  { type: String, enum: ['Fire','Water','Earth','Air','Electric','Nature','Shadow','Holy','Normal'], required: true },
  function: { type: String, enum: ['Damage', 'Buff', 'Debuff', 'Status', 'Utility'], required: true },
  isUlt:    { type: Boolean, default: false },
  isPassive:{ type: Boolean, default: false },

  // Damage moves
  power:    { type: Number, default: 0 },
  accuracy: { type: Number, default: 1.0 }, // 0.0–1.0

  // Energy cost (off-element costs more)
  energyCost: { type: Number, default: 10 },

  // Effect applied on hit (references effectsRegistry key)
  appliesEffect: { type: String, default: null },
  appliesStatus: { type: String, default: null },

  // Buff/debuff moves
  targetStat:    { type: String, default: null },
  effectValue:   { type: Number, default: 0 },
  effectDuration:{ type: Number, default: 8 }, // ticks

  // Stat requirement to hit full power off-element
  offElementStatReq: { type: Number, default: 50 },

  description: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Move', MoveSchema);
