/**
 * TAP INTERACTION ENGINE
 * Handles byte reactions to player taps based on mood, temperament, and annoyance state.
 * Single source of truth for tap logic.
 */

const TEMPERAMENT_THRESHOLDS = {
  Kind: 6,
  Noble: 4,
  Calm: 8,
  Focused: 3,
  Fierce: 3,
  Proud: 3,
  Energetic: 10,
  Alert: 5,
  Sneaky: 4,
  Mysterious: 5,
  Cold: 3,
  Wanderer: 6,
  Anxious: 2,
  Unstable: 2,
  Corrupt: 2,
};

const RECOVERY_SPEED = {
  // Fast: ~2 seconds to clear annoyance
  // Medium: ~4 seconds
  // Slow: ~8+ seconds
  Kind: 'fast',
  Noble: 'medium',
  Calm: 'fast',
  Focused: 'medium',
  Fierce: 'slow',
  Proud: 'slow',
  Energetic: 'very_fast',
  Alert: 'fast',
  Sneaky: 'medium',
  Mysterious: 'medium',
  Cold: 'very_slow',
  Wanderer: 'fast',
  Anxious: 'slow',
  Unstable: 'unpredictable',
  Corrupt: 'none',
};

const CARE_PREFERENCE = {
  // routine-loving: no penalty, slight positive
  // variety-seeking: bored animation
  // neutral: no reaction
  // unpredictable: random
  Kind: 'neutral',
  Noble: 'routine-loving',
  Calm: 'routine-loving',
  Focused: 'routine-loving',
  Fierce: 'neutral',
  Proud: 'neutral',
  Energetic: 'variety-seeking',
  Alert: 'neutral',
  Sneaky: 'neutral',
  Mysterious: 'variety-seeking',
  Cold: 'routine-loving',
  Wanderer: 'variety-seeking',
  Anxious: 'neutral',
  Unstable: 'unpredictable',
  Corrupt: 'unpredictable',
};

/**
 * Get mood-based reaction tier.
 * @param {number} mood - 0-100
 * @returns {'positive'|'neutral'|'negative'}
 */
function getMoodTier(mood) {
  if (mood >= 75) return 'positive';
  if (mood >= 40) return 'neutral';
  return 'negative';
}

/**
 * Clean old tap timestamps outside the 3-second window.
 * @param {Date[]} tapWindow
 * @param {Date} now
 * @returns {Date[]}
 */
function cleanTapWindow(tapWindow, now) {
  const windowStart = new Date(now.getTime() - 3000);
  return tapWindow.filter(t => t >= windowStart);
}

/**
 * Process a tap and return reaction data.
 * @param {Object} byte - Byte document
 * @param {Date} now - Current timestamp
 * @returns {Object} - { moodTier, animationTier, audioId, moodDelta, annoyanceStage }
 */
function processTap(byte, now = new Date()) {
  const temperament = byte.temperament || 'Kind';
  const mood = byte.needs?.Mood ?? 100;
  const moodTier = getMoodTier(mood);

  // Check cooldown (1.5 seconds)
  const lastTap = byte.lastTapResponseTime ? new Date(byte.lastTapResponseTime).getTime() : 0;
  const cooldownMs = 1500;
  const inCooldown = (now.getTime() - lastTap) < cooldownMs;

  // Clean and update tap window
  let tapWindow = cleanTapWindow(byte.tapWindow || [], now);
  if (!inCooldown) {
    tapWindow.push(now);
  }

  const tapCount = tapWindow.length;
  const threshold = TEMPERAMENT_THRESHOLDS[temperament] || 4;
  let annoyanceStage = byte.annoyanceStage || 0;
  let moodDelta = 0;
  let animationTier = null;
  let audioId = null;

  // Withdrawal recovery
  if (annoyanceStage === 3) {
    const withdrawalTimeRemaining = byte.withdrawalTimer || 0;
    if (withdrawalTimeRemaining <= 0) {
      annoyanceStage = 0; // Clear withdrawal after 15s
    }
  }

  // If in cooldown, queue tap but no animation
  if (inCooldown) {
    return {
      moodTier,
      animationTier: null,
      audioId: null,
      moodDelta: 0,
      annoyanceStage,
      tapWindow,
      withdrawalTimer: Math.max(0, (byte.withdrawalTimer || 0) - (now.getTime() - lastTap)),
    };
  }

  // Update last tap response time
  const lastTapResponseTime = now;

  // Determine reaction based on annoyance stage
  if (annoyanceStage === 3) {
    // Withdrawn: ignores tap, stays withdrawn
    animationTier = 'withdrawn';
    audioId = null; // No audio, silent ignore
  } else if (annoyanceStage === 2) {
    // Annoyed: already annoyed, next taps increase
    if (tapCount >= threshold + 3) {
      animationTier = 'withdrawn';
      moodDelta = -10;
      audioId = 'sfx_withdraw';
      annoyanceStage = 3;
      const withdrawalMs = 15000;
      byte.withdrawalTimer = withdrawalMs;
    } else {
      // Still annoyed, no new animation
      animationTier = null;
      audioId = null;
    }
  } else if (annoyanceStage === 1) {
    // Warning: check if we hit the full annoyance threshold
    if (tapCount >= threshold + 3) {
      animationTier = 'annoyed';
      moodDelta = -5;
      audioId = 'sfx_tap_annoyed';
      annoyanceStage = 2;
    } else if (tapCount >= threshold) {
      // Still in warning, no new animation
      animationTier = null;
      audioId = null;
    } else {
      // Recovered below threshold
      animationTier = moodTier; // Normal reaction
      audioId = getAudioId(moodTier);
      annoyanceStage = 0;
    }
  } else {
    // No annoyance yet
    if (tapCount >= threshold) {
      // Hit warning threshold
      animationTier = 'warning';
      audioId = 'sfx_tap_warning';
      annoyanceStage = 1;
    } else {
      // Normal reaction based on mood
      animationTier = moodTier;
      audioId = getAudioId(moodTier);
    }
  }

  return {
    moodTier,
    animationTier,
    audioId,
    moodDelta,
    annoyanceStage,
    tapWindow,
    lastTapResponseTime,
    withdrawalTimer: byte.withdrawalTimer || 0,
  };
}

/**
 * Get audio ID for mood tier.
 * @param {string} moodTier
 * @returns {string}
 */
function getAudioId(moodTier) {
  const audioMap = {
    positive: 'sfx_tap_happy',
    neutral: 'sfx_tap_neutral',
    negative: 'sfx_tap_low',
  };
  return audioMap[moodTier] || 'sfx_tap_neutral';
}

/**
 * Track a care action and check for routine preference.
 * @param {Object} byte - Byte document
 * @param {string} action - care action (feed, clean, rest, play, etc)
 * @returns {Object} - { lastCareActions, carePreferenceReaction, moodDelta }
 */
function trackCareAction(byte, action) {
  const temperament = byte.temperament || 'Kind';
  const preference = CARE_PREFERENCE[temperament];
  const lastCareActions = byte.lastCareActions || [];

  // Add new action to front, keep last 5
  const updated = [action, ...lastCareActions].slice(0, 5);

  // Check for routine repetition (3+ same actions in a row)
  let moodDelta = 0;
  let preferenceReaction = null;

  if (
    updated.length >= 3 &&
    updated[0] === updated[1] &&
    updated[1] === updated[2]
  ) {
    if (preference === 'routine-loving') {
      preferenceReaction = 'no_penalty';
      moodDelta = 2; // Slight positive
    } else if (preference === 'variety-seeking') {
      preferenceReaction = 'bored';
      moodDelta = -3;
      // audioId would be 'sfx_bored'
    } else if (preference === 'unpredictable') {
      preferenceReaction = 'random';
      // Random reaction each time
    }
    // neutral: no reaction
  }

  return {
    lastCareActions: updated,
    preferenceReaction,
    moodDelta,
  };
}

module.exports = {
  getMoodTier,
  cleanTapWindow,
  processTap,
  trackCareAction,
  getAudioId,
  TEMPERAMENT_THRESHOLDS,
  RECOVERY_SPEED,
  CARE_PREFERENCE,
};
