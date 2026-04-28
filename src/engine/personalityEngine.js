/**
 * personalityEngine.js
 *
 * Behavior simulation layer over existing systems. Reads byte.personality,
 * returns multipliers + a tone category + a misbehavior chance scalar that
 * other systems consume. As of Phase 3+5 (2026-04-27, "behavior sim" pivot),
 * the engine drives both modulation AND a misbehavior subsystem — extra
 * clutter creation, fake need signals, etc. Skye explicitly accepted the
 * "no new mechanics" boundary breach for these.
 *
 * Five axes (0-100):
 *   - obedience    — follows player vs resists
 *   - impulse      — calm vs reactive (Skye glossary: "calm vs reactive")
 *   - attachment   — independent vs player-focused
 *   - curiosity    — explores vs idles
 *   - sensitivity  — reacts strongly vs calm
 *
 * Outputs from getModifiers():
 *   - movement          — multiplier on movement frequency / pace
 *   - demand            — multiplier on need-signaling frequency
 *   - interruptChance   — probability (0-1) of an interrupt firing on a tick
 *   - expression        — multiplier on expression intensity / duration
 *   - tone              — { warm | neutral | sharp } category for thought text
 *   - exploration       — multiplier on movement spread + clutter interaction (curiosity)
 *   - reactionAmplitude — multiplier on emote intensity + threshold sharpness (sensitivity)
 *   - misbehaviorChance — scalar 0-1 for "how often this byte misbehaves" (impulse + curiosity - obedience)
 *
 * Drivers (mutate the axes):
 *   - applyEvent(byte, eventType, magnitude) — care actions nudge values
 *   - applyDrift(byte, nowMs)                — slow tug toward temperament baseline
 *   - initFromHatch(byte, temperament)       — seed axes at hatch with jitter
 *
 * Single source of truth. No other system should reach into byte.personality
 * directly — call getModifiers() and consume the output.
 */

// Per-temperament baseline {obedience, impulse, attachment, curiosity, sensitivity}.
// Drift target. Mapping from the 15-type temperament enum to the 5-axis space.
const TEMPERAMENT_BASELINES = {
  Noble:      { obedience: 75, impulse: 50, attachment: 70, curiosity: 40, sensitivity: 50 },
  Kind:       { obedience: 70, impulse: 35, attachment: 75, curiosity: 50, sensitivity: 65 },
  Calm:       { obedience: 70, impulse: 25, attachment: 55, curiosity: 30, sensitivity: 35 },
  Focused:    { obedience: 75, impulse: 30, attachment: 50, curiosity: 40, sensitivity: 40 },
  Proud:      { obedience: 35, impulse: 50, attachment: 35, curiosity: 55, sensitivity: 35 },
  Fierce:     { obedience: 30, impulse: 75, attachment: 50, curiosity: 60, sensitivity: 60 },
  Energetic:  { obedience: 55, impulse: 80, attachment: 70, curiosity: 80, sensitivity: 55 },
  Alert:      { obedience: 55, impulse: 70, attachment: 50, curiosity: 70, sensitivity: 75 },
  Sneaky:     { obedience: 30, impulse: 55, attachment: 30, curiosity: 75, sensitivity: 60 },
  Mysterious: { obedience: 35, impulse: 30, attachment: 25, curiosity: 60, sensitivity: 50 },
  Cold:       { obedience: 55, impulse: 30, attachment: 25, curiosity: 35, sensitivity: 25 },
  Wanderer:   { obedience: 25, impulse: 70, attachment: 25, curiosity: 85, sensitivity: 50 },
  Anxious:    { obedience: 50, impulse: 75, attachment: 80, curiosity: 60, sensitivity: 90 },
  Unstable:   { obedience: 25, impulse: 90, attachment: 50, curiosity: 75, sensitivity: 85 },
  Corrupt:    { obedience: 15, impulse: 90, attachment: 25, curiosity: 80, sensitivity: 60 },
};

const DEFAULT_BASELINE = { obedience: 50, impulse: 50, attachment: 50, curiosity: 50, sensitivity: 50 };
const AXES = ['obedience', 'impulse', 'attachment', 'curiosity', 'sensitivity'];

// Care-event nudge table. Each entry is {axis: delta} applied per call.
// Tunable — first-pass values, expect to retune after playtest.
const EVENT_NUDGES = {
  // Direct interactions
  scold:               { obedience:  5, attachment: -2, impulse: -1, sensitivity:  1 },
  scold_harsh:         { obedience:  3, attachment: -4, impulse: -2, sensitivity:  4 }, // repeated/clustered scolds
  praise:              { attachment:  3, obedience:  1, sensitivity: -1 },

  // Need-driven care responses
  ignored_critical:    { attachment: -3, impulse:    2, curiosity:  2, obedience: -1 },
  successful_play:     { impulse:     2, attachment: 2, curiosity:  2 },
  successful_train:    { obedience:   2, impulse:    1, sensitivity: -1 },
  feed_high_hunger:    { attachment:  3, obedience:  1 },
  feed_overfeed:       { impulse:     2, sensitivity:  1 }, // feeding when not hungry (Hunger >= 70)
  clean_low_hygiene:   { obedience:   2, attachment: 1 },
  rest_low_bandwidth:  { obedience:   1, attachment: 1, impulse: -1 },

  // Spam / interruption patterns
  tap_spam:            { impulse:     1, obedience: -1, sensitivity:  1 },
  withdraw:            { attachment: -2, sensitivity:  2, curiosity: -1 },
};

const DRIFT_RATE_PER_DAY = 1.0; // points per axis per 24h of real time, toward baseline
const MIN_DRIFT_INTERVAL_MS = 60 * 1000; // skip drift if last update was <60s ago
const HATCH_JITTER_RANGE = 16; // ±8 around baseline at hatch

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getBaselineForTemperament(temperament) {
  if (!temperament) return DEFAULT_BASELINE;
  return TEMPERAMENT_BASELINES[temperament] || DEFAULT_BASELINE;
}

/**
 * Read modifiers from a byte's current personality state. Pure function.
 * Returns a fresh object every call — safe for inclusion in API responses.
 */
function getModifiers(byte) {
  const p = (byte && byte.personality) || DEFAULT_BASELINE;
  const obedience   = Number(p.obedience   != null ? p.obedience   : 50);
  const impulse     = Number(p.impulse     != null ? p.impulse     : 50);
  const attachment  = Number(p.attachment  != null ? p.attachment  : 50);
  const curiosity   = Number(p.curiosity   != null ? p.curiosity   : 50);
  const sensitivity = Number(p.sensitivity != null ? p.sensitivity : 50);

  // Movement frequency. Curiosity blends in lightly (an extra 0.3× lever)
  // because exploring also looks like "moving more." Impulse stays the dominant signal.
  const movement = 1 + ((impulse - 50) * 0.01) + ((curiosity - 50) * 0.003);  // ~0.45 - 1.55

  // Demand: signal-need-earlier rises with impulse + attachment. Sensitivity nudges it
  // a bit too — sensitive bytes feel needs more sharply.
  const demand = 1 + ((impulse + attachment - 100) * 0.005) + ((sensitivity - 50) * 0.003); // ~0.45 - 1.55

  // Interrupt: high impulse vs low obedience. Curiosity pushes it up a bit (curious + impulsive = pokes).
  const interruptChance = clamp((impulse - obedience) * 0.005 + (curiosity - 50) * 0.002 + 0.1, 0, 1);

  // Expression: now driven primarily by sensitivity (Skye spec: "high sensitivity = exaggerated reactions").
  // Impulse contributes a small share so reactive bytes still pop louder.
  const expression = 1 + ((sensitivity - 50) * 0.012) + ((impulse - 50) * 0.004); // ~0.4 - 1.6

  // Exploration: pure curiosity lever. Drives wider movement spread + clutter interaction probability.
  const exploration = 1 + (curiosity - 50) * 0.012; // ~0.4 - 1.6

  // Reaction amplitude: pure sensitivity lever. Drives emote duration + threshold crossings.
  const reactionAmplitude = 1 + (sensitivity - 50) * 0.012; // ~0.4 - 1.6

  // Misbehavior chance: high impulse + high curiosity + low obedience. 0-1 scalar.
  // At neutral 50/50/50: 0. At extreme 90/90/10: 1.0. At well-behaved 10/10/90: 0 (clamped).
  const misbehaviorScore = ((impulse - 50) + (curiosity - 50) + (50 - obedience)) / 100;
  const misbehaviorChance = clamp(misbehaviorScore, 0, 1);

  let tone;
  if (attachment >= 65 && obedience >= 50) tone = 'warm';
  else if (attachment <= 35 || obedience <= 30) tone = 'sharp';
  else tone = 'neutral';

  return {
    movement,
    demand,
    interruptChance,
    expression,
    exploration,
    reactionAmplitude,
    misbehaviorChance,
    tone,
    raw: { obedience, impulse, attachment, curiosity, sensitivity },
  };
}

/**
 * Apply a care-event nudge to a byte's personality. Mutates byte.personality.
 * Returns the new personality object, or null if eventType isn't recognized.
 *
 * @param byte        Mongoose doc with .personality
 * @param eventType   Key in EVENT_NUDGES
 * @param magnitude   Optional scalar multiplier on all deltas (default 1)
 */
function applyEvent(byte, eventType, magnitude = 1) {
  if (!byte) return null;
  if (!byte.personality) byte.personality = { ...DEFAULT_BASELINE, lastDriftAt: new Date() };
  const nudges = EVENT_NUDGES[eventType];
  if (!nudges) return null;
  for (const axis of AXES) {
    const delta = (nudges[axis] || 0) * magnitude;
    if (delta === 0) continue;
    const current = Number(byte.personality[axis] != null ? byte.personality[axis] : 50);
    byte.personality[axis] = clamp(current + delta, 0, 100);
  }
  return byte.personality;
}

/**
 * Drift personality axes toward the temperament baseline. Throttled — does
 * nothing if called more than once per MIN_DRIFT_INTERVAL_MS. Mutates
 * byte.personality + stamps lastDriftAt.
 *
 * Call from /sync once per request. Cheap, idempotent on quick re-calls.
 */
function applyDrift(byte, nowMs = Date.now()) {
  if (!byte) return null;
  if (!byte.personality) {
    byte.personality = { ...DEFAULT_BASELINE, lastDriftAt: new Date(nowMs) };
    return byte.personality;
  }
  const baseline = getBaselineForTemperament(byte.temperament);
  const lastAtRaw = byte.personality.lastDriftAt;
  const lastAt = lastAtRaw ? new Date(lastAtRaw).getTime() : nowMs;
  const elapsedMs = Math.max(0, nowMs - lastAt);
  if (elapsedMs < MIN_DRIFT_INTERVAL_MS) return byte.personality;
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  const step = DRIFT_RATE_PER_DAY * elapsedDays;
  for (const axis of AXES) {
    const current = Number(byte.personality[axis] != null ? byte.personality[axis] : 50);
    const target = baseline[axis];
    const diff = target - current;
    if (diff === 0) continue;
    const dir = diff > 0 ? 1 : -1;
    const move = Math.min(Math.abs(diff), step) * dir;
    byte.personality[axis] = clamp(current + move, 0, 100);
  }
  byte.personality.lastDriftAt = new Date(nowMs);
  return byte.personality;
}

/**
 * Seed personality at hatch. Uses temperament baseline plus per-axis jitter
 * (±8) so two bytes hatched with the same temperament still feel different.
 *
 * @param byte         The hatching byte (mutated)
 * @param temperament  The temperament resolved at hatch time, or null
 */
function initFromHatch(byte, temperament = null) {
  if (!byte) return null;
  const baseline = getBaselineForTemperament(temperament);
  const jitter = () => Math.round((Math.random() - 0.5) * HATCH_JITTER_RANGE);
  const seeded = { lastDriftAt: new Date() };
  for (const axis of AXES) {
    seeded[axis] = clamp(baseline[axis] + jitter(), 0, 100);
  }
  byte.personality = seeded;
  return byte.personality;
}

module.exports = {
  getModifiers,
  applyEvent,
  applyDrift,
  initFromHatch,
  // Exposed for testing / debug surfaces
  TEMPERAMENT_BASELINES,
  EVENT_NUDGES,
  DRIFT_RATE_PER_DAY,
};
