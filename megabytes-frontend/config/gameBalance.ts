/**
 * FRONTEND GAME BALANCE
 *
 * Frontend-only timers (clutter spawn, poop digestion). All values in HOURS.
 * For backend tunables (needs, corruption, care gains), see
 * megabytes-backend/src/config/gameBalance.js — that is the authoritative file.
 */

// Hours between expected clutter spawns. The probability per 30s poll is
// derived so expected time-to-spawn hits this target.
export const CLUTTER_SPAWN_HOURS = 3;

// When hygiene is low, clutter spawns faster by this factor.
export const CLUTTER_DIRTY_MULTIPLIER = 3;

// Hours after a detected feed until a poop spawns.
export const POOP_DIGEST_HOURS = 0.025;   // ≈ 90s

// ── Derived helpers ──────────────────────────────────────────────────────────

/**
 * Per-30s-tick probability of a clutter spawn at normal hygiene.
 * Expected-value math: P = pollSeconds / (hours * 3600).
 */
export function clutterSpawnProbability(pollSeconds: number): number {
  return Math.min(1, pollSeconds / (CLUTTER_SPAWN_HOURS * 3600));
}

export function clutterSpawnProbabilityDirty(pollSeconds: number): number {
  return Math.min(1, clutterSpawnProbability(pollSeconds) * CLUTTER_DIRTY_MULTIPLIER);
}

export function poopDigestMs(): number {
  return POOP_DIGEST_HOURS * 3600 * 1000;
}
