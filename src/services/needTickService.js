'use strict';

/**
 * needTickService.js
 * Recurring server-side job that emits need_tick events to all active bytes.
 * Powers time-based daily tasks: maintain_high_needs, thriving_state, zero_neglect, avoid_critical.
 *
 * Runs every TICK_INTERVAL_MS. Each tick:
 *  1. Fetches all alive, non-egg bytes that have active (incomplete) daily tasks.
 *  2. Emits a need_tick event via dailyCareEngine.processEvent.
 *  3. Saves only bytes where task state changed.
 */

const Byte          = require('../models/Byte');
const dailyCareEngine = require('../engine/dailyCareEngine');

// ─── Config ───────────────────────────────────────────────────────────────────

const TICK_INTERVAL_MS  = 60 * 1000;  // 1 minute between ticks (production)
const TICK_DELTA_SEC    = 60;          // seconds to credit per tick (must match interval)

// Tasks that are time-based (need need_tick to progress)
const TIME_BASED_TASKS = new Set([
  'maintain_high_needs',
  'thriving_state',
]);

// Fail tasks that watch for bad states via need_tick
const TICK_FAIL_TASKS = new Set([
  'avoid_critical',
  'zero_neglect',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAverageNeeds(needs) {
  const keys = ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'];
  const total = keys.reduce((sum, k) => sum + Number(needs?.[k] ?? 0), 0);
  return total / keys.length;
}

function hasActiveTickTasks(activeDailyTasks) {
  if (!activeDailyTasks || activeDailyTasks.length === 0) return false;
  return activeDailyTasks.some(t =>
    !t.completed && !t.failed &&
    (TIME_BASED_TASKS.has(t.id) || TICK_FAIL_TASKS.has(t.id))
  );
}

function snapshotTasks(tasks) {
  return JSON.stringify(tasks.map(t => ({
    id: t.id, progress: t.progress, completed: t.completed, failed: t.failed
  })));
}

// ─── Main Tick ────────────────────────────────────────────────────────────────

async function runTick() {
  try {
    // Only load bytes with tasks worth ticking — lean query for speed
    const allBytes = await Byte.find(
      { isAlive: true, isEgg: false, 'activeDailyTasks.0': { $exists: true } },
      { _id: 1, needs: 1, activeDailyTasks: 1 }
    ).lean();

    const toUpdate = [];

    for (const byteSnap of allBytes) {
      if (!hasActiveTickTasks(byteSnap.activeDailyTasks)) continue;

      const avg    = getAverageNeeds(byteSnap.needs);
      const before = snapshotTasks(byteSnap.activeDailyTasks);

      const event = {
        type:      'need_tick',
        avgNeeds:  avg,
        deltaTime: TICK_DELTA_SEC,
      };

      // processEvent mutates the array in place
      const tasksCopy = byteSnap.activeDailyTasks.map(t => ({ ...t }));
      dailyCareEngine.processEvent(tasksCopy, event);
      const after = snapshotTasks(tasksCopy);

      if (before !== after) {
        toUpdate.push({ id: byteSnap._id, tasks: tasksCopy });
      }
    }

    if (toUpdate.length === 0) return;

    // Bulk-update only bytes that changed
    const ops = toUpdate.map(({ id, tasks }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { activeDailyTasks: tasks } },
      }
    }));

    await Byte.bulkWrite(ops);
    console.log(`[NeedTick] Ticked ${toUpdate.length} byte(s)`);

  } catch (err) {
    console.error('[NeedTick] Error during tick:', err.message);
  }
}

// ─── Service Control ──────────────────────────────────────────────────────────

let _timer = null;

function start(intervalMs = TICK_INTERVAL_MS) {
  if (_timer) return; // already running
  console.log(`[NeedTick] Starting — interval ${intervalMs / 1000}s`);
  _timer = setInterval(runTick, intervalMs);
  // Don't block process exit
  if (_timer.unref) _timer.unref();
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { start, stop, runTick, TICK_INTERVAL_MS };
