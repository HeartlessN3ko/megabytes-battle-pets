const mongoose = require('mongoose');

// Archived record created when a Byte dies — the memorial and legacy source.
const GenerationSchema = new mongoose.Schema({
  ownerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  byteId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Byte', required: true },
  generation: { type: Number, required: true },

  // Snapshot of the byte at death
  name:        { type: String },
  shape:       { type: String },
  animal:      { type: String },
  element:     { type: String },
  feature:     { type: String },
  branch:      { type: String },
  temperament: { type: String },
  finalLevel:  { type: Number },
  finalStats:  { type: Object },

  // Lifespan
  bornAt: { type: Date },
  diedAt: { type: Date },

  // Memorial data — generated from real care metrics
  eulogyData: {
    totalBattles:    { type: Number, default: 0 },
    totalPageants:   { type: Number, default: 0 },
    favoriteRoom:    { type: String, default: null },
    averageNeedScore:{ type: Number, default: 0 }, // 0–100
    praiseCount:     { type: Number, default: 0 },
    careRating:      { type: String, default: null } // e.g. "Devoted Trainer"
  },

  // What this byte passes to the next generation
  legacyMove:      { type: String, default: null },
  legacyStatBonus: { type: Object, default: {} }

}, { timestamps: true });

module.exports = mongoose.model('Generation', GenerationSchema);
