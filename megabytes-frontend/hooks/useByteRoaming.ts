/**
 * useByteRoaming — shared, floor-anchored roaming hook for the byte sprite.
 *
 * Contract (locked — do not duplicate motion logic in screens):
 *   • Hook owns horizontal translation (translateX), facing direction, and
 *     rest-time glances. Nothing else.
 *   • Y is always 0. No bob, no depth drift, no breathe. If a screen wants
 *     those effects, layer them in its own transform stack — this hook will
 *     not touch Y or scale.
 *   • Hops / squishes are baked into the GIFs themselves; the hook never
 *     animates vertical position.
 *
 * Consumer integration:
 *   const { translateX, facing, glance } = useByteRoaming({
 *     halfSpreadX: (width * 0.8) / 2,
 *     enabled:     !isSleeping && !emotion,
 *     boredom:     needs.Fun < 30 || needs.Mood < 35,
 *   });
 *   → apply translateX via <Animated.View style={{ transform: [{ translateX }] }}/>
 *   → feed facing + glance into the sprite priority chain
 */

import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

export type RoamFacing = 'left' | 'right' | 'idle';
export type RoamGlance = 'look-left' | 'look-right' | 'look-up' | 'look-down' | null;

export interface UseByteRoamingOpts {
  /** Max ±X travel from center, in px. Typically (stageWidth * spreadFraction) / 2. */
  halfSpreadX: number;
  /** When false, motion loop is paused and byte settles to x=0 / facing='idle' / glance=null. */
  enabled: boolean;
  /** Optional: when true, byte walks to stage edges and lingers (boredom / neglect pull). */
  boredom?: boolean;
  /** Optional travel duration tuning. Defaults: 2800–4600ms. */
  travelDurationMin?: number;
  travelDurationMax?: number;
  /** Optional pause-at-destination tuning. Defaults: 1500–3500ms (5000ms boredom hold). */
  pauseMin?: number;
  pauseMax?: number;
}

export interface UseByteRoamingResult {
  translateX: Animated.Value;
  facing: RoamFacing;
  glance: RoamGlance;
  motionState: 'walking' | 'resting';
}

// --- Tunables ---------------------------------------------------------------
// Min travel distance for a new target (fraction of halfSpread).
const MIN_TRAVEL_FRACTION    = 0.45;
// Chance to fire a glance during a rest pause (0..1).
const GLANCE_CHANCE          = 0.4;
// Glance hold window.
const GLANCE_HOLD_MIN_MS     = 1200;
const GLANCE_HOLD_MAX_MS     = 2000;
// Glance direction weights (must sum to 1.0). `look-up` is deliberately light
// so it reads as a deliberate peek rather than constant staring at the ceiling.
const GLANCE_WEIGHTS: Array<[Exclude<RoamGlance, null>, number]> = [
  ['look-left',  0.30],
  ['look-right', 0.30],
  ['look-down',  0.25],
  ['look-up',    0.15],
];

function pickGlance(bored: boolean): RoamGlance {
  // Bored bytes lock onto the camera — no glance flips.
  if (bored) return null;
  if (Math.random() >= GLANCE_CHANCE) return null;
  const roll = Math.random();
  let acc = 0;
  for (const [dir, w] of GLANCE_WEIGHTS) {
    acc += w;
    if (roll <= acc) return dir;
  }
  return 'look-left';
}

export function useByteRoaming(opts: UseByteRoamingOpts): UseByteRoamingResult {
  const {
    halfSpreadX,
    enabled,
    boredom = false,
    travelDurationMin = 2800,
    travelDurationMax = 4600,
    pauseMin          = 1500,
    pauseMax          = 3500,
  } = opts;

  const translateX = useRef(new Animated.Value(0)).current;
  const [facing,      setFacing]      = useState<RoamFacing>('idle');
  const [glance,      setGlance]      = useState<RoamGlance>(null);
  const [motionState, setMotionState] = useState<'walking' | 'resting'>('resting');

  // Boredom is read from a ref so the motion loop doesn't restart every time
  // the flag flips — matches the pattern from index.tsx C4.
  const boredRef = useRef(boredom);
  useEffect(() => { boredRef.current = boredom; }, [boredom]);

  // Keep stable refs of tuning inputs so enabling/disabling is the only thing
  // that rebuilds the loop.
  const cfgRef = useRef({ halfSpreadX, travelDurationMin, travelDurationMax, pauseMin, pauseMax });
  useEffect(() => {
    cfgRef.current = { halfSpreadX, travelDurationMin, travelDurationMax, pauseMin, pauseMax };
  }, [halfSpreadX, travelDurationMin, travelDurationMax, pauseMin, pauseMax]);

  useEffect(() => {
    if (!enabled) {
      // Freeze in place — do NOT reset translateX to 0. Emotion/sleep should
      // pause motion where the byte currently stands; snapping to center
      // during a 2s praise/scold emote reads as teleporting.
      translateX.stopAnimation();
      setFacing('idle');
      setGlance(null);
      setMotionState('resting');
      return;
    }

    let active       = true;
    let lastTargetX  = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const addTimer = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.splice(timers.indexOf(t), 1);
        if (active) fn();
      }, ms);
      timers.push(t);
    };

    const pickTarget = () => {
      const { halfSpreadX: hs } = cfgRef.current;
      if (boredRef.current) {
        // Alternate stage edges so the byte reads as "pacing the front of the room".
        const side = lastTargetX >= 0 ? -1 : 1;
        return side * hs * 0.92;
      }
      for (let attempt = 0; attempt < 4; attempt++) {
        const t = (Math.random() * 2 - 1) * hs;
        if (Math.abs(t - lastTargetX) >= hs * MIN_TRAVEL_FRACTION) return t;
      }
      return lastTargetX >= 0 ? -hs * 0.6 : hs * 0.6;
    };

    const step = () => {
      if (!active) return;
      const cfg    = cfgRef.current;
      const bored  = boredRef.current;
      const nextX  = pickTarget();
      lastTargetX  = nextX;

      const currentX = (translateX as any)._value ?? 0;
      const dx       = nextX - currentX;
      const THRESH   = 6;
      const nextFacing: RoamFacing =
        dx >  THRESH ? 'right' :
        dx < -THRESH ? 'left'  :
        'idle';

      setGlance(null);
      setFacing(nextFacing);
      setMotionState('walking');

      const duration = cfg.travelDurationMin +
        Math.random() * Math.max(1, cfg.travelDurationMax - cfg.travelDurationMin);

      Animated.timing(translateX, {
        toValue: nextX,
        duration,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!active || !finished) return;
        // Arrived — rest, maybe glance, then pick next.
        setFacing('idle');
        setMotionState('resting');

        const pauseMs = bored
          ? (3000 + Math.random() * 2000)
          : (cfg.pauseMin + Math.random() * Math.max(1, cfg.pauseMax - cfg.pauseMin));

        const glancePick = pickGlance(bored);
        if (glancePick) {
          // Hold glance for a window inside the pause, then settle and continue.
          const glanceHold = GLANCE_HOLD_MIN_MS +
            Math.random() * Math.max(1, GLANCE_HOLD_MAX_MS - GLANCE_HOLD_MIN_MS);
          addTimer(() => setGlance(glancePick), Math.max(100, pauseMs * 0.15));
          addTimer(() => setGlance(null),       Math.max(300, pauseMs * 0.15 + glanceHold));
        }

        addTimer(step, pauseMs);
      });
    };

    step();

    return () => {
      active = false;
      timers.forEach(clearTimeout);
      timers.length = 0;
      translateX.stopAnimation();
    };
    // Rebuild the loop only when enabled flips. Tuning + halfSpread live on a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { translateX, facing, glance, motionState };
}
