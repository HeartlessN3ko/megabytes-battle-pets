const mongoose = require('mongoose');

const BattleSchema = new mongoose.Schema({
  // Participants
  playerA: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  playerB: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null }, // null = AI opponent
  byteA:   { type: mongoose.Schema.Types.ObjectId, ref: 'Byte', required: true },
  byteB:   {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Byte',
    default: null,
    required: function () { return this.mode !== 'ai'; }
  },

  // Mode
  mode: { type: String, enum: ['pvp', 'arena', 'ai'], required: true },

  // Result
  winner:  { type: String, enum: ['A', 'B', 'draw'], default: null },
  endedAt: { type: Date, default: null },

  // Snapshot of stats at battle start (for replay / audit)
  snapshotA: { type: Object, default: {} },
  snapshotB: { type: Object, default: {} },

  // Tick-by-tick log (lightweight: action type + actor + value per tick)
  battleLog: { type: [Object], default: [] },

  // Rewards granted to winner
  rewardByteBits: { type: Number, default: 0 },
  rewardXP:       { type: Number, default: 0 },

  // Player interactions during battle
  cheers: { type: Number, default: 0 },
  taunt:  { type: Boolean, default: false },
  ultSuggested: { type: Boolean, default: false },
  mercyProc:    { type: Boolean, default: false } // cheer triggered last-second 1HP save

}, { timestamps: true });

module.exports = mongoose.model('Battle', BattleSchema);
