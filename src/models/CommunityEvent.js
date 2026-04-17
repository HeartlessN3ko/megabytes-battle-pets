const mongoose = require('mongoose');

const CommunityEventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, required: true }, // 'global_progress'
  status: { type: String, default: 'active' }, // 'active', 'completed', 'ended'

  // Progress tracking
  currentProgress: { type: Number, default: 0 },
  targetProgress: { type: Number, required: true },
  progressType: { type: String, default: 'shared' }, // shared across all players

  // Contribution types
  contributions: { type: [String], default: [] }, // 'slop_defeated', 'nodes_cleared'

  // Reward
  reward: {
    type: { type: String, default: 'items' }, // 'items', 'currency', 'mixed'
    items: { type: [String], default: [] },
    byteBits: { type: Number, default: 0 }
  },

  // Participation
  minContribution: { type: Number, default: 0 },
  participants: { type: [mongoose.Schema.Types.ObjectId], ref: 'Player', default: [] },

  // Timing
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  completedAt: { type: Date, default: null },

  // Claimed by players
  claimedBy: { type: [mongoose.Schema.Types.ObjectId], ref: 'Player', default: [] }

}, { timestamps: true });

module.exports = mongoose.model('CommunityEvent', CommunityEventSchema);
