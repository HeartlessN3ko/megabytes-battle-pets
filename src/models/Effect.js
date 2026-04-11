const mongoose = require('mongoose');

// Effects are seeded from effectsRegistry.js — this schema is the DB mirror.
const EffectSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true }, // e.g. "power_up.sys"
  type:     { type: String, enum: ['buff', 'debuff', 'status', 'dot', 'hot'], required: true },

  // What it targets
  targetStat: { type: String, default: null }, // Power, Speed, Defense, Special, Accuracy
  effectType: { type: String, default: null }, // e.g. "attack_rate_reduction", "damage_over_time"

  // Magnitude
  value: { type: Number, default: 0 }, // as decimal: 0.20 = 20%

  // Duration in ticks (battle ticks at 1/sec)
  duration:  { type: Number, default: 8 },
  isInstant: { type: Boolean, default: false },

  // Stacking behaviour (enforced by engine, documented here)
  stackRule: { type: String, enum: ['no_stack_highest', 'can_stack', 'net_calc'], default: 'no_stack_highest' },

  description: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Effect', EffectSchema);
