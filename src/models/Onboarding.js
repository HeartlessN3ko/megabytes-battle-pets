const mongoose = require('mongoose');

const OnboardingSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true, unique: true },

  // Current progression
  currentStage: { type: String, default: 'entry' }, // entry, setup, role, calibration, profile, egg_intro, egg_shapes, egg_select, egg_confirm, tutorial_system, tutorial_mayor, tutorial_threat, tutorial_ack, tutorial_role, tutorial_home, tutorial_stats, tutorial_care, tutorial_corruption, tutorial_install, tutorial_action, tutorial_result, tutorial_training, tutorial_final, tutorial_exit

  // Completed stages
  completedStages: { type: [String], default: [] },

  // Selected egg
  selectedEggShape: { type: String, default: null }, // circle, square, triangle, diamond, hexagon

  // Completion
  completedAt: { type: Date, default: null },
  isComplete: { type: Boolean, default: false }

}, { timestamps: true });

module.exports = mongoose.model('Onboarding', OnboardingSchema);
