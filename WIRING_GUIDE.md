# WIRING GUIDE — New Care Engines into routes/byte.js

## Step 1: Add New Imports (top of routes/byte.js)

```javascript
const carePatternEngine = require('../engine/carePatternEngine');
const xpEngine = require('../engine/xpEngine');
const needInterdependencyEngine = require('../engine/needInterdependencyEngine');
const streakEngine = require('../engine/streakEngine');
const neglectEngine = require('../engine/neglectEngine');
const decorSystem = require('../engine/decorSystem');
const dailyCareGuideEngine = require('../engine/dailyCareGuideEngine');

// Remove or comment out:
// const corruptionEngine = require('../engine/corruptionEngine');
```

## Step 2: Update computeLiveByteSnapshot()

Add these to the snapshot after existing decay logic:

```javascript
// Apply need interdependency (cross-effects)
const adjustedDecay = needInterdependencyEngine.applyDecayInterdependency(
  { /* loss from needDecay */ },
  snapshot.needs
);

// Calculate care pattern score (if daily data available)
const carePattern = carePatternEngine.getCarePattern(dailyCareSore || 50);

// Calculate passive XP gain (since last check)
const minutesElapsed = (now - new Date(byte.lastNeedsUpdate)) / (1000 * 60);
const passiveXP = xpEngine.calculatePassiveXP(minutesElapsed, needDecay.getAverageNeed(snapshot.needs));

// Get neglect stage
const neglectStage = neglectEngine.getNegelectStage(needDecay.getAverageNeed(snapshot.needs));

// Update streak (if date changed)
const updatedStreak = streakEngine.updateStreak(byte.streakData || {}, dailyScore || 50, 0);

return {
  needs: snapshot.needs,
  lastNeedsUpdate: snapshot.lastNeedsUpdate,
  carePattern: carePattern,
  passiveXPGain: passiveXP,
  neglectStage: neglectStage,
  streakData: updatedStreak,
  computedStats: statEngine.applyNeedModifiers(byte.stats.toObject(), snapshot.needs),
};
```

## Step 3: Update Care Action Routes

Example for `/feed` action (apply to all: feed, clean, play, rest):

```javascript
router.post('/:id/feed', async (req, res) => {
  const byte = await Byte.findById(req.params.id);
  
  // Get timing window
  const timingWindow = needDecay.getTimingWindow('feed', byte.needs.Hunger);
  
  // Get spam penalty
  const spamMult = needDecay.applySpamPenalty(byte.lastCareActions || [], 'feed');
  
  // Apply care action
  const grade = req.body.grade || 'good';
  byte.needs = needDecay.applyCare(
    byte.needs.toObject(),
    'feed',
    grade,
    timingWindow.restoreMultiplier,
    spamMult
  );
  
  // Calculate action XP
  const actionXP = xpEngine.calculateActionXP(
    'feed',
    grade,
    timingWindow.restoreMultiplier,
    spamMult
  );
  
  // Track care action
  byte.lastCareActions = carePatternEngine.recordCareAction(
    'feed',
    timingWindow.window,
    byte.lastCareActions
  );
  
  // Apply XP gain (with pattern bonus if available)
  const pattern = req.body.pattern || 'neutral';
  const finalXP = xpEngine.applyPatternMultiplier(actionXP, pattern);
  const levelUp = xpEngine.applyXPGain(byte.level, byte.xp, finalXP);
  
  byte.level = levelUp.level;
  byte.xp = levelUp.xp;
  
  await byte.save();
  res.json({ byte, xpGain: finalXP, levelsGained: levelUp.levelsGained });
});
```

## Step 4: Update Death Logic

Replace old `POST /:id/die` with:

```javascript
router.post('/:id/die', async (req, res) => {
  const byte = await Byte.findById(req.params.id);
  if (!byte) return res.status(404).json({ error: 'Not found' });

  // TWO DEATH PATHS
  
  // Path 1: Level 100 old age → legacy egg
  if (byte.level === 100) {
    // Use existing legacy egg logic (create Generation record + egg)
    // ...existing code...
  }
  
  // Path 2: Neglect death → Generation only (no legacy egg)
  else if (neglectEngine.shouldDieFromNeglect(
    needDecay.getAverageNeed(byte.needs),
    byte.neglectTimer || 0
  )) {
    // Create Generation record only (no legacy egg)
    const genRecord = await Generation.create({
      ownerId: byte.ownerId,
      byteId: byte._id,
      finalLevel: byte.level,
      // ...other fields...
    });
    
    // Remove byte from active slots but NO legacy egg created
    byte.isAlive = false;
    byte.diedAt = new Date();
    await byte.save();
    
    return res.json({
      died: byte._id,
      deathType: 'neglect',
      generationRecord: genRecord._id,
      legacyEgg: null,
    });
  }
});
```

## Step 5: Update GET /:id to Return New Data

```javascript
const snapshot = computeLiveByteSnapshot(byte, req);

res.json({
  byte: {
    ...byte.toObject(),
    needs: snapshot.needs,
    lastNeedsUpdate: snapshot.lastNeedsUpdate,
  },
  computedStats: snapshot.computedStats,
  carePattern: snapshot.carePattern,
  neglectStage: snapshot.neglectStage,
  streakData: snapshot.streakData,
  passiveXPGain: snapshot.passiveXPGain,
});
```

## Step 6: Byte Model Updates

Add fields to ByteSchema (in models/Byte.js):

```javascript
// Daily tracking
dailyCareSCore: { type: Number, default: 50 },
careHistory: { type: Array, default: [] }, // daily snapshots
needsHistory: { type: Array, default: [] }, // needs samples

// Streak tracking
streakData: {
  count: { type: Number, default: 0 },
  lastDate: { type: String, default: null },
  milestones: { type: Map, of: Boolean, default: {} },
},

// Neglect tracking (replaces old corruption timer)
neglectTimer: { type: Number, default: 0 }, // milliseconds in critical state

// Decor
roomScore: { type: Number, default: 25 },
decorItems: { type: Array, default: [] }, // array of { id, value, type }

// Daily guide
dailyTasks: { type: Array, default: [] },
tasksCompleted: { type: Number, default: 0 },
```

## Order of Implementation

1. Add imports ✓
2. Update Byte model ✓
3. Update computeLiveByteSnapshot ✓
4. Wire feed/clean/play/rest actions ✓
5. Update death logic ✓
6. Test GET /:id response ✓
7. Add daily guide endpoints (TODO)
8. Add decor endpoints (TODO)

---

Once these are wired, all new engines will feed data into routes and frontend can display it.
