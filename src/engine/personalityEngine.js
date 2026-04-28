/**
 * personalityEngine.js
 *
 * Modulation layer over existing systems. Reads byte.personality, returns
 * multipliers + a tone category that other systems consume to bend their
 * existing output. Does NOT introduce new mechanics — only modifies the rates
 * and intensities of behaviors that are already firing.
 *
 * Three axes (0-100):
 *   - obedience    — follows player vs resists
 *   - impulse      — calm vs reactive
 *   - attachment   — independent vs player-focused
 *
 * Five outputs from getModifiers():
 *   - movement         — multiplier on movement frequency / pace
 *   - demand           — multiplier on need-signaling frequency
 *   - interruptChance  — probability (0-1) of an interrupt firing on any tick
 *   - expression       — multiplier on expression intensity / duration
 *   - tone             — { warm | neutral | sharp } category for thought text
 *
 * Drivers (mutate the axes):
 *   - applyEvent(byte, eventType, magnitude) — care actions nudge values
 *   - applyDrift(byte, nowMs)                — slow tug toward temperament baseline
 *   - initFromHatch(byte, temperament)       — seed axes at hatch with jitter
 *
 * Single source of truth. No other system should reach into byte.personality
 * directly — call getModifiers() and consume the output.
 */

// Per-temperament baseline {obedience, impulse, attachment}. Drift target.
// Rough mapping from the 15-type temperament enum to the 3-axis space.
const TEMPERAMENT_BASELINES = {
  Noble:      { obedience: 75, impulse: 50, attachment: 70 },
  Kind:       { obedience: 70, impulse: 35, attachment: 75 },
  Calm:       { obedience: 70, impulse: 25, attachment: 55 },
  Focused:    { obedience: 75, impulse: 30, attachment: 50 },
  Proud:      { obedience: 35, impulse: 50, attachment: 35 },
  Fierce:     { obedience: 30, impulse: 75, attachment: 50 },
  Energetic:  { obedience: 55, impulse: 80, attachment: 70 },
  Alert:      { obedience: 55, impulse: 70, attachment: 50 },
  Sneaky:     { obedience: 30, impulse: 55, attachment: 30 },
  Mysterious: { obedience: 35, impulse: 30, attachment: 25 },
  Cold:       { obedience: 55, impulse: 30, attachment: 25 },
  Wanderer:   { obedience: 25, impulse: 70, attachment: 25 },
  Anxious:    { obedience: 50, impulse: 75, attachment: 80 },
  Unstable:   { obedience: 25, impulse: 90, attachment: 50 },
  Corrupt:    { obedience: 15, impulse: 90, attachment: 25 },
};

const DEFAULT_BASELINE = { obedience: 50, impulse: 50, attachment: 50 };

// Care-event nudge table. Each entry is {axis: delta} applied per call.
// Tunable — first-pass values, expect to retune after playtest.
const EVENT_NUDGES = {
  scold:               { obedience:  5, attachment: -2 },
  praise:              { attachment:  3, obedience:  1 },
  ignored_critical:    { attachment: -3, impulse:    2 },
  successful_play:     { impulse:     2, attachment: 2 },
  successful_train:    { obedience:   2, impulse:    1 },
  feed_high_hunger:    { attachment:  3 },
  clean_low_hygiene:   { obedience:   2, attachment: 1 },
  rest_low_bandwidth:  { obedience:   1, attachment: 1 },
  tap_spam:            { impulse:     1, obedience: -1 },
  withdraw:            { attachment: -2 },
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
  const obedience = Number(p.obedience != null ? p.obedience : 50);
  const impulse = Number(p.impulse != null ? p.impulse : 50);
  const attachment = Number(p.attachment != null ? p.attachment : 50);

  const movement = 1 + (impulse - 50) * 0.01;                              // 0.5 - 1.5
  const demand = 1 + ((impulse + attachment - 100) * 0.005);              // 0.5 - 1.5
  const interruptChance = clamp((impulse - obedience) * 0.005 + 0.1, 0, 1); // 0 - 0.6
  const expression = 1 + (impulse - 50) * 0.01;                            // 0.5 - 1.5

  let tone;
  if (attachment >= 65 && obedience >= 50) tone = 'warm';
  else if (attachment <= 35 || obedience <= 30) tone = 'sharp';
  else tone = 'neutral';

  return {
    movement,
    demand,
    interruptChance,
    expression,
    tone,
    raw: { obedience, impulse, attachment },
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
  for (const axis of ['obedience', 'impulse', 'attachment']) {
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
  for (const axis of ['obedience', 'impulse', 'attachment']) {
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
  byte.personality = {
    obedience:   clamp(baseline.obedience + jitter(), 0, 100),
    impulse:     clamp(baseline.impulse + jitter(), 0, 100),
    attachment:  clamp(baseline.attachment + jitter(), 0, 100),
    lastDriftAt: new Date(),
  };
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
