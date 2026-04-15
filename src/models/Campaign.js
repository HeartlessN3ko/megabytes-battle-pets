const mongoose = require('mongoose');

// --- Node History Sub-schema ---
const NodeHistorySchema = new mongoose.Schema({
  nodeId: { type: Number, required: true }, // 1-100
  attemptCount: { type: Number, default: 0 },
  completedAt: { type: Date, default: null },
  highestGrade: { type: String, default: null }, // 'fail', 'ok', 'good', 'perfect'
  reward: { type: Object, default: {} }, // { xp, items, byteBits }
}, { _id: false });

// --- Campaign Schema ---
const CampaignSchema = new mongoose.Schema({
  byteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Byte', required: true, unique: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },

  // Progression
  currentNode: { type: Number, default: 0, min: 0, max: 100 }, // 0 = not started, 1-100 = node number
  highestNodeReached: { type: Number, default: 0, min: 0, max: 100 },
  nodeHistory: [NodeHistorySchema],

  // Challenge Mode (unlocked at node 50)
  challengeModeUnlocked: { type: Boolean, default: false },
  challengeNodesCleared: [{ type: Number }], // array of challenge nodes (50-100) completed

  // Rewards & Currency
  totalXpEarned: { type: Number, default: 0 },
  totalByteBitsEarned: { type: Number, default: 0 },
  itemsEarned: [{ itemId: String, count: Number }],

  // City Liberation (every 10 nodes)
  citiesLiberated: [{ type: Number }], // [10, 20, 30, ...] — node milestones cleared

  // Battle stats
  nodesCompleted: { type: Number, default: 0 },
  nodesFailed: { type: Number, default: 0 },
  currentWinStreak: { type: Number, default: 0 },
  longestWinStreak: { type: Number, default: 0 },

  // Campaign state
  campaignStartedAt: { type: Date, default: null },
  lastNodeAttemptAt: { type: Date, default: null },
  isReplayMode: { type: Boolean, default: false },

}, { timestamps: true });

// byteId has unique: true (creates index automatically)
CampaignSchema.index({ playerId: 1 });

module.exports = mongoose.model('Campaign