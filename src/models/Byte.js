const mongoose = require('mongoose');

// --- Sub-schemas ---

const StatsSchema = new mongoose.Schema({
  Power:    { type: Number, default: 10, min: 0, max: 100 },
  Speed:    { type: Number, default: 10, min: 0, max: 100 },
  Defense:  { type: Number, default: 10, min: 0, max: 100 },
  Stamina:  { type: Number, default: 10, min: 0, max: 100 },
  Special:  { type: Number, default: 10, min: 0, max: 100 },
  Accuracy: { type: Number, default: 10, min: 0, max: 100 }
}, { _id: false });

const NeedsSchema = new mongoose.Schema({
  Hunger:    { type: Number, default: 100, min: 0, max: 100 },
  Bandwidth: { type: Number, default: 100, min: 0, max: 100 },
  Hygiene:   { type: Number, default: 100, min: 0, max: 100 },
  Social:    { type: Number, default: 100, min: 0, max: 100 },
  Fun:       { type: Number, default: 100, min: 0, max: 100 },
  Mood:      { type: Number, default: 100, min: 0, max: 100 }
}, { _id: false });

const BehaviorMetricsSchema = new mongoose.Schema({
  loginFrequency:       { type: Number, default: 0 },
  sessionGapTime:       { type: Number, default: 0 }, // avg hours between sessions
  recoveryDelayTime:    { type: Number, default: 0 }, // avg hours before caring for critical need

  feedRatio:            { type: Number, default: 0 },
  cleanDelayTime:       { type: Number, default: 0 },
  needResponseTime:     { type: Number, default: 0 },

  tapFrequency:         { type: Number, default: 0 },
  nonRewardCheckins:    { type: Number, default: 0 },
  roomTimeDistribution: { type: Map, of: Number, default: {} },

  lowEnergyTrainingCount:  { type: Number, default: 0 },
  statFocusDistribution:   { type: Map, of: Number, default: {} },
  sessionLength:           { type: Number, default: 0 },

  timeOfDayPattern:     { type: Map, of: Number, default: {} },
  playVsTrainRatio:     { type: Number, default: 0 },
  restEnforcementRate:  { type: Number, default: 0 },

  praiseCount:          { type: Number, default: 0 },
  scoldCount:           { type: Number, default: 0 },
  moodRecoveryTime:     { type: Number, default: 0 }
}, { _id: false });

// --- Main Byte Schema ---

const ByteSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },

  name: { type: String, default: '' },

  // Evolution stages
  shape:       { type: String, enum: ['Circle', 'Square', 'Triangle', 'Diamond', 'Hexagon'], default: null },
  animal:      { type: String, default: null },
  element:     { type: String, enum: ['Fire','Water','Earth','Air','Electric','Nature','Shadow','Holy','Normal'], default: null },
  feature:     { type: String, default: null },
  branch:      { type: String, enum: ['Battle', 'Nurture'], default: null },
  temperament: { type: String, enum: ['Noble','Kind','Calm','Focused','Proud','Fierce','Energetic','Alert','Sneaky','Mysterious','Cold','Wanderer','Anxious','Unstable','Corrupt'], default: null },

  // Current evolution stage index (0–5 maps to shape→temperament)
  evolutionStage: { type: Number, default: 0, min: 0, max: 5 },

  // Stats
  stats: { type: StatsSchema, default: () => ({}) },

  // Needs
  needs: { type: NeedsSchema, default: () => ({}) },
  lastNeedsUpdate: { type: Date, default: Date.now },

  // Level & XP
  level: { type: Number, default: 1, min: 1, max: 100 },
  xp:    { type: Number, default: 0 },

  // Corruption
  corruption: { type: Number, default: 0, min: 0, max: 100 },

  // Dev/testing flag — Missingno and other dev bytes. Skips death, legacy, and corruption cap.
  isDevByte: { type: Boolean, default: false },

  // Lifespan
  isAlive:   { type: Boolean, default: true },
  bornAt:    { type: Date, default: Date.now },
  diedAt:    { type: Date, default: null },
  generation: { type: Number, default: 1 },

  // Moves loadout: 2 moves + 1 ult + 1 passive
  equippedMoves: { type: [String], default: ['basic_ping.py'], validate: v => v.length <= 2 },
  equippedUlt:   { type: String, default: null },
  equippedPassive: { type: String, default: null },

  // All learned moves
  learnedMoves: { type: [String], default: ['basic_ping.py'] },

  // Battle state (ephemeral, cleared after battle)
  currentStatus:  { type: String, default: null },
  activeEffects:  { type: [String], default: [], validate: v => v.length <= 3 },
  currentHP:      { type: Number, default: null }, // null = use maxHP formula

  // Behavior tracking
  behaviorMetrics: { type: BehaviorMetricsSchema, default: () => ({}) },

  // Training tracking
  trainingSessionsToday: { type: Number, default: 0 },
  lastTrainingReset:     { type: Date, default: Date.now },

  // Legacy inheritance (from parent byte)
  inheritedMove:      { type: String, default: null },
  inheritedStatBonus: { type: StatsSchema, default: null },

  // Is this an egg?
  isEgg:       { type: Boolean, default: false },
  hatchAt:     { type: Date, default: null },

  // Egg care metrics (tracked during hatch window)
  eggMetrics: {
    feedCount:      { type: Number, default: 0 },
    cleanCount:     { type: Number, default: 0 },
    playCount:      { type: Number, default: 0 },
    trainingCount:  { type: Number, default: 0 },
    neglectHours:   { type: Number, default: 0 },
    consistency:    { type: Number, default: 0 }
  },

  // Sleep state
  isSleeping: { type: Boolean, default: false },
  sleepUntil: { type: Date, default: null },

}, { timestamps: true });

// Virtual: maxHP from formula — base_hp + (Stamina * 10)
ByteSchema.virtual('maxHP').get(function () {
  const BASE_HP = 50;
  return BASE_HP + (this.stats.Stamina * 10);
});

module.exports = mongoose.model('Byte', ByteSchema);
