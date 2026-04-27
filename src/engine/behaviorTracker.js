/**
 * BEHAVIOR TRACKER
 * Updates aggregated behavior metrics on the Byte document.
 * Metrics are stored as rolling averages / cumulative counts.
 * Source: effects-temperments-items.md
 */

/**
 * Record a player session end.
 *
 * @param {Object} metrics         — current behaviorMetrics (plain object)
 * @param {Object} sessionData     — data from this session
 * @param {number} sessionData.durationMinutes
 * @param {number} sessionData.gapHoursSinceLast
 * @param {string} sessionData.timeOfDay — 'morning' | 'afternoon' | 'evening' | 'night'
 * @returns {Object}               — updated metrics
 */
function recordSession(metrics, sessionData) {
  const m = { ...metrics };
  const { durationMinutes, gapHoursSinceLast, timeOfDay } = sessionData;

  // Session length: rolling average
  m.sessionLength = rollingAvg(m.sessionLength, durationMinutes, m.loginFrequency || 1);

  // Session gap time: rolling average of hours between sessions
  m.sessionGapTime = rollingAvg(m.sessionGapTime, gapHoursSinceLast, m.loginFrequency || 1);

  // Login frequency: sessions per day (increment counter, average over lifetime)
  m.loginFrequency = (m.loginFrequency || 0) + 1;

  // Time of day pattern
  m.timeOfDayPattern = m.timeOfDayPattern || {};
  m.timeOfDayPattern[timeOfDay] = (m.timeOfDayPattern[timeOfDay] || 0) + 1;

  return m;
}

/**
 * Record a care action (feed, clean, rest, play).
 */
function recordCare(metrics, action, needLevel) {
  const m = { ...metrics };

  if (action === 'feed') {
    m.feedRatio = rollingAvg(m.feedRatio || 0, 1, 10);
  }

  // Track how quickly player responded to needs (lower = faster)
  const responseTime = needLevel < 25 ? 0.2 : needLevel < 50 ? 0.5 : 1.0; // normalized delay
  m.needResponseTime = rollingAvg(m.needResponseTime || 0, responseTime, 10);

  if (action === 'clean') {
    m.cleanDelayTime = rollingAvg(m.cleanDelayTime || 0, responseTime, 10);
  }

  return m;
}

/**
 * Record a training session.
 */
function recordTraining(metrics, { stat, bandwidthAtStart }) {
  const m = { ...metrics };

  m.statFocusDistribution = m.statFocusDistribution || {};
  m.statFocusDistribution[stat] = (m.statFocusDistribution[stat] || 0) + 1;

  if (bandwidthAtStart <= 0) {
    m.lowEnergyTrainingCount = (m.lowEnergyTrainingCount || 0) + 1;
  }

  // Update play vs train ratio
  m.playVsTrainRatio = updatePlayTrainRatio(m, 'train');

  return m;
}

/**
 * Record a play/social action.
 */
function recordPlay(metrics) {
  const m = { ...metrics };
  m.playVsTrainRatio = updatePlayTrainRatio(m, 'play');
  return m;
}

/**
 * Record a praise / scold / interact / tap interaction.
 *
 * Type semantics:
 *  - 'praise' / 'scold' — explicit reward/punishment, increment counter.
 *  - 'interact' — /interact route, gives Fun/Social/Mood. Reward path,
 *                 only bumps tapFrequency (NOT nonRewardCheckins).
 *  - 'tap' — /tap route, only emits a reaction via tapInteractionEngine
 *            with no direct need reward. Counts as both tapFrequency and
 *            nonRewardCheckins.
 */
function recordInteraction(metrics, type) {
  const m = { ...metrics };
  if (type === 'praise') m.praiseCount = (m.praiseCount || 0) + 1;
  if (type === 'scold')  m.scoldCount  = (m.scoldCount  || 0) + 1;
  if (type === 'interact') {
    m.tapFrequency = (m.tapFrequency || 0) + 1;
  }
  if (type === 'tap') {
    m.tapFrequency = (m.tapFrequency || 0) + 1;
    m.nonRewardCheckins = (m.nonRewardCheckins || 0) + 1;
  }
  return m;
}

/**
 * Record a non-reward check-in (player opened app and interacted for no reward).
 */
function recordNonRewardCheckin(metrics) {
  const m = { ...metrics };
  m.nonRewardCheckins = (m.nonRewardCheckins || 0) + 1;
  return m;
}

/**
 * Record rest being enforced (player actively chose to rest the byte).
 */
function recordRest(metrics) {
  const m = { ...metrics };
  const total = (m.loginFrequency || 1);
  const prevRate = m.restEnforcementRate || 0;
  m.restEnforcementRate = rollingAvg(prevRate, 1, total);
  return m;
}

/**
 * Record time taken for mood to recover after dropping (in hours).
 */
function recordMoodRecovery(metrics, hoursToRecover) {
  const m = { ...metrics };
  m.moodRecoveryTime = rollingAvg(m.moodRecoveryTime || 0, hoursToRecover, 5);
  return m;
}

/**
 * Record room time spent in a specific room (in minutes).
 */
function recordRoomTime(metrics, room, minutes) {
  const m = { ...metrics };
  m.roomTimeDistribution = m.roomTimeDistribution || {};
  m.roomTimeDistribution[room] = (m.roomTimeDistribution[room] || 0) + minutes;
  return m;
}

// --- Helpers ---

function rollingAvg(current, newValue, count) {
  return (current * (count - 1) + newValue) / count;
}

function updatePlayTrainRatio(metrics, action) {
  const prev = metrics.playVsTrainRatio || 0.5;
  return action === 'play'
    ? Math.min(1, prev + 0.02)
    : Math.max(0, prev - 0.02);
}

module.exports = {
  recordSession,
  recordCare,
  recordTraining,
  recordPlay,
  recordInteraction,
  recordNonRewardCheckin,
  recordRest,
  recordMoodRecovery,
  recordRoomTime
};
