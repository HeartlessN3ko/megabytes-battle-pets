const mongoose = require('mongoose');

const AchievementSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  category: { type: String, required: true }, // 'milestone', 'battle', 'care', 'collection', 'social', 'special'
  icon: { type: String, default: 'star' }, // icon name
  criteria: {
    type: { type: String, required: true }, // 'stat_threshold', 'count', 'one_time', 'streak'
    target: { type: Number, default: 1 },
    statName: { type: String, default: null } // for stat_threshold type
  },
  reward: {
    byteBits: { type: Number, default: 0 },
    xp: { type: Number, default: 0 }
  },
  rarity: { type: String, default: 'common' }, // 'common', 'uncommon', 'rare', 'epic', 'legendary'
  hidden: { type: Boolean, default: false } // if true, don't show until unlocked

}, { timestamps: true });

module.exports = mongoose.model('Achievement', AchievementSchema);
