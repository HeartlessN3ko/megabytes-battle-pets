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
  stats: { type: StatsSchema, default: () => ({ Power: 10, Speed: 10, Defense: 10, Stamina: 10, Special: 10, Accuracy: 10 }) },

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
  lastPlayerActivity: { type: Date, default: Date.now }, // Track player activity for adaptive sleep
  lastWakeTime: { type: Date, default: null }, // Set on every wake. Blocks sync's auto-sleep for 5 min so the byte can't re-sleep mid-interaction.

  // Tap interaction system
  tapWindow: { type: [Date], default: [] }, // Rolling 3s window of tap timestamps
  annoyanceStage: { type: Number, default: 0, min: 0, max: 3 }, // 0=none, 1=warn, 2=annoyed, 3=withdrawn
  lastCareActions: { type: [String], default: [] }, // Last 5 care action IDs for spam detection, most recent first
  recentCareLog: [{ _id: false, type: { type: String }, at: { type: Date } }], // Rolling log for multi_action_sequence detection (60s window)
  withdrawalTimer: { type: Number, default: 0 }, // MS remaining in withdrawal state
  lastTapResponseTime: { type: Date, default: null }, // For cooldown tracking (1.5s between responses)

  // Affection (persistent relationship meter, 0–100)
  affection:              { type: Number, default: 50, min: 0, max: 100 },
  affectionLastPraiseAt:  { type: Date,   default: null },   // For 2-min cooldown + 5-min window
  affectionPraiseCount:   { type: Number, default: 0 },      // Count within rolling 5-min window

  // Quick-feed rate limit (5 uses per 2-hour window)
  quickFeedCount:   { type: Number, default: 0 },
  quickFeedResetAt: { type: Date,   default: null },

  // Session tracking
  lastLoginAt: { type: Date, default: null },

  // Care pattern tracking
  dailyCareScore: { type: Number, default: 0 },
  careHistory: { type: Array, default: [] },   // Rich action history from carePatternEngine
  needsHistory: { type: Array, default: [] },  // Periodic needs snapshots

  // Streak tracking
  streakData: {
    count:        { type: Number, default: 0 },
    lastDate:     { type: String, default: null },
    milestones:   { type: Map, of: Boolean, default: {} },
  },

  // Daily care streak (consecutive days completing all daily tasks)
  dailyCareStreak: { type: Number, default: 0 },
  lastCareDate:    { type: String, default: null }, // 'YYYY-MM-DD' UTC, last day tasks were completed

  // Neglect tracking
  neglectTimer: { type: Number, default: 0 }, // milliseconds accumulated in critical state

  // Room / decor
  roomScore:   { type: Number, default: 25 },
  decorItems:  { type: Array, default: [] },  // [{ id, value, type }]

  // Daily guide tasks (legacy array — superseded by activeDailyTasks)
  dailyTasks:     { type: Array, default: [] },
  tasksCompleted: { type: Number, default: 0 },

  // Active daily care tasks (structured, event-driven)
  activeDailyTasks: [{
    _id:              false,
    id:               { type: String },
    target:           { type: mongoose.Schema.Types.Mixed }, // Number or true (boolean avoid-tasks)
    progress:         { type: Number, default: 0 },
    completed:        { type: Boolean, default: false },
    failed:           { type: Boolean, default: false },
    assignedAt:       { type: Date },
    distinctCareTypes: { type: [String], default: [] }, // Persistent accumulator for balanced_care + perfect_cycle
  }],

}, { timestamps: true });

// Virtual: maxHP from formula — base_hp + (Stamina * 10)
ByteSchema.virtual('maxHP').get(function () {
  const BASE_HP = 50;
  return BASE_HP + (this.stats.Stamina * 10);
});

module.exports = mongoose.model('Byte', ByteSchema);
