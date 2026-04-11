/**
 * TEMPERAMENT ENGINE
 * Calculates the byte's final temperament from behavior metrics + evolution biases.
 * Locked in at stage 5. Hidden from the player until it resolves.
 * Source: effects-temperments-items.md
 */

// Temperament score weight breakdown
const WEIGHTS = {
  behavior: 0.60,
  shape:    0.10,
  animal:   0.15,
  element:  0.15
};

// Shape → temperament affinity scores (0–1 per temperament)
const SHAPE_AFFINITY = {
  Triangle: { Fierce: 0.8, Proud: 0.6, Corrupt: 0.4 },
  Circle:   { Kind: 0.8, Noble: 0.6, Calm: 0.5 },
  Square:   { Focused: 0.8, Noble: 0.5, Cold: 0.4 },
  Diamond:  { Alert: 0.8, Focused: 0.6, Calm: 0.4 },
  Hexagon:  { Mysterious: 0.7, Unstable: 0.6, Wanderer: 0.5 }
};

// Animal → temperament affinity scores
const ANIMAL_AFFINITY = {
  Cat:     { Sneaky: 0.7, Mysterious: 0.5, Cold: 0.4 },
  Dog:     { Kind: 0.8, Energetic: 0.6, Noble: 0.4 },
  Bird:    { Alert: 0.7, Energetic: 0.6, Wanderer: 0.4 },
  Fish:    { Calm: 0.7, Mysterious: 0.5 },
  Rabbit:  { Anxious: 0.8, Energetic: 0.5 },
  Fox:     { Sneaky: 0.8, Mysterious: 0.6 },
  Wolf:    { Fierce: 0.7, Proud: 0.6 },
  Bear:    { Noble: 0.6, Cold: 0.6, Calm: 0.4 },
  Turtle:  { Calm: 0.9, Noble: 0.4 },
  Snake:   { Sneaky: 0.7, Cold: 0.6, Corrupt: 0.3 },
  Frog:    { Energetic: 0.6, Mysterious: 0.5 },
  Monkey:  { Energetic: 0.8, Anxious: 0.4 },
  Boar:    { Fierce: 0.8, Unstable: 0.4 },
  Deer:    { Kind: 0.7, Calm: 0.6 },
  Owl:     { Focused: 0.7, Mysterious: 0.6 },
  Lion:    { Proud: 0.9, Noble: 0.5 },
  Shark:   { Fierce: 0.8, Corrupt: 0.5 },
  Octopus: { Mysterious: 0.9, Wanderer: 0.5 },
  Dragon:  { Proud: 0.7, Fierce: 0.6, Noble: 0.4 },
  Golem:   { Noble: 0.7, Cold: 0.7, Calm: 0.4 }
};

// Element → temperament affinity scores
const ELEMENT_AFFINITY = {
  Fire:     { Fierce: 0.8, Corrupt: 0.4 },
  Water:    { Calm: 0.8, Kind: 0.5 },
  Earth:    { Noble: 0.7, Calm: 0.5 },
  Air:      { Wanderer: 0.7, Energetic: 0.6 },
  Electric: { Energetic: 0.8, Alert: 0.6, Anxious: 0.3 },
  Nature:   { Kind: 0.7, Calm: 0.5 },
  Shadow:   { Sneaky: 0.7, Corrupt: 0.6, Mysterious: 0.4 },
  Holy:     { Noble: 0.8, Kind: 0.6 },
  Normal:   { Focused: 0.5, Alert: 0.4 }
};

const ALL_TEMPERAMENTS = [
  'Noble','Kind','Calm','Focused','Proud','Fierce','Energetic','Alert',
  'Sneaky','Mysterious','Cold','Wanderer','Anxious','Unstable','Corrupt'
];

/**
 * Derive a behavior score per temperament from tracked metrics.
 * Returns a map of { temperament: 0–1 }
 */
function scoreBehavior(metrics) {
  const scores = {};
  ALL_TEMPERAMENTS.forEach(t => scores[t] = 0);

  const {
    praiseCount = 0, scoldCount = 0, loginFrequency = 0,
    sessionGapTime = 0, recoveryDelayTime = 0, lowEnergyTrainingCount = 0,
    playVsTrainRatio = 0, restEnforcementRate = 0, moodRecoveryTime = 0,
    nonRewardCheckins = 0
  } = metrics;

  // Noble: consistent, praises often, low neglect
  scores.Noble += clamp(praiseCount / 20) * 0.4;
  scores.Noble += clamp(loginFrequency / 2) * 0.3;
  scores.Noble += clamp(1 - (recoveryDelayTime / 24)) * 0.3;

  // Kind: high praise, fast mood recovery, plays often
  scores.Kind += clamp(praiseCount / 20) * 0.5;
  scores.Kind += clamp(playVsTrainRatio) * 0.3;
  scores.Kind += clamp(1 - (moodRecoveryTime / 12)) * 0.2;

  // Calm: rest enforced, long gaps between sessions (slow-play)
  scores.Calm += clamp(restEnforcementRate) * 0.5;
  scores.Calm += clamp(sessionGapTime / 12) * 0.3;
  scores.Calm += clamp(1 - lowEnergyTrainingCount / 10) * 0.2;

  // Focused: heavy training, low play ratio, consistent
  scores.Focused += clamp(1 - playVsTrainRatio) * 0.5;
  scores.Focused += clamp(loginFrequency / 2) * 0.3;
  scores.Focused += clamp(nonRewardCheckins / 5) * 0.2;

  // Proud: trains hard, low neglect, low scold
  scores.Proud += clamp(1 - (scoldCount / 10)) * 0.4;
  scores.Proud += clamp(loginFrequency / 2) * 0.3;
  scores.Proud += clamp(1 - playVsTrainRatio) * 0.3;

  // Fierce: overtrained, low rest, aggressive sessions
  scores.Fierce += clamp(lowEnergyTrainingCount / 10) * 0.5;
  scores.Fierce += clamp(1 - restEnforcementRate) * 0.3;
  scores.Fierce += clamp(scoldCount / 10) * 0.2;

  // Energetic: frequent short sessions, lots of play
  scores.Energetic += clamp(playVsTrainRatio) * 0.4;
  scores.Energetic += clamp(loginFrequency / 3) * 0.4;
  scores.Energetic += clamp(1 - sessionGapTime / 12) * 0.2;

  // Alert: fast recovery, high check-in frequency
  scores.Alert += clamp(1 - (recoveryDelayTime / 12)) * 0.5;
  scores.Alert += clamp(loginFrequency / 2) * 0.3;
  scores.Alert += clamp(nonRewardCheckins / 5) * 0.2;

  // Sneaky: long gaps, infrequent login, but trains when on
  scores.Sneaky += clamp(sessionGapTime / 24) * 0.4;
  scores.Sneaky += clamp(1 - loginFrequency / 2) * 0.3;
  scores.Sneaky += clamp(1 - playVsTrainRatio) * 0.3;

  // Mysterious: erratic play patterns, non-reward checkins
  scores.Mysterious += clamp(nonRewardCheckins / 5) * 0.4;
  scores.Mysterious += clamp(Math.abs(playVsTrainRatio - 0.5) * 2) * 0.4;
  scores.Mysterious += clamp(sessionGapTime / 12) * 0.2;

  // Cold: trains a lot, rarely praises, slow mood recovery
  scores.Cold += clamp(1 - playVsTrainRatio) * 0.4;
  scores.Cold += clamp(1 - (praiseCount / 20)) * 0.3;
  scores.Cold += clamp(moodRecoveryTime / 12) * 0.3;

  // Wanderer: inconsistent schedule, spreads stat focus
  scores.Wanderer += clamp(sessionGapTime / 24) * 0.4;
  scores.Wanderer += clamp(1 - loginFrequency / 2) * 0.3;

  // Anxious: fast recovery but unstable mood, over-checks
  scores.Anxious += clamp(loginFrequency / 3) * 0.4;
  scores.Anxious += clamp(moodRecoveryTime / 12) * 0.3;
  scores.Anxious += clamp(recoveryDelayTime / 12) * 0.3;

  // Unstable: high scold, low praise, erratic
  scores.Unstable += clamp(scoldCount / 10) * 0.4;
  scores.Unstable += clamp(lowEnergyTrainingCount / 10) * 0.3;
  scores.Unstable += clamp(1 - loginFrequency / 2) * 0.3;

  // Corrupt: heavy neglect, over-training, mostly scolds
  scores.Corrupt += clamp(recoveryDelayTime / 24) * 0.4;
  scores.Corrupt += clamp(lowEnergyTrainingCount / 10) * 0.3;
  scores.Corrupt += clamp(scoldCount / 10) * 0.3;

  return scores;
}

function clamp(v) { return Math.max(0, Math.min(1, v || 0)); }

/**
 * Calculate final temperament score and resolve to a temperament string.
 *
 * @param {Object} byte — Byte document with shape, animal, element, behaviorMetrics
 * @returns {{ temperament: string, scores: Object }}
 */
function calcTemperamentScore(byte) {
  const { shape, animal, element, behaviorMetrics = {} } = byte;

  const behaviorScores = scoreBehavior(behaviorMetrics);
  const shapeAff   = SHAPE_AFFINITY[shape]   || {};
  const animalAff  = ANIMAL_AFFINITY[animal]  || {};
  const elementAff = ELEMENT_AFFINITY[element] || {};

  const finalScores = {};
  for (const t of ALL_TEMPERAMENTS) {
    finalScores[t] = (
      (behaviorScores[t]  || 0) * WEIGHTS.behavior +
      (shapeAff[t]        || 0) * WEIGHTS.shape +
      (animalAff[t]       || 0) * WEIGHTS.animal +
      (elementAff[t]      || 0) * WEIGHTS.element
    );
  }

  // Resolve to highest scoring temperament
  const temperament = Object.entries(finalScores).sort((a, b) => b[1] - a[1])[0][0];
  return { temperament, scores: finalScores };
}

module.exports = { calcTemperamentScore, scoreBehavior, WEIGHTS, ALL_TEMPERAMENTS };
