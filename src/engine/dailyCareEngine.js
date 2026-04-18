'use strict';

/**
 * dailyCareEngine.js
 * Manages the daily care task system.
 * Spec: Dailycare.MD / Task.md / CARE_SYSTEM_IMPLEMENTATION.md
 *
 * Responsibilities:
 *  - Select 5–6 daily tasks from the pool each day
 *  - Process events and update task progress
 *  - Calculate daily care score from completed tasks
 *  - Check and update streak on daily completion
 *  - Detect when tasks should be reset (midnight UTC)
 */

const { TASK_POOL, TASK_CATALOG_MAP } = require('../data/dailyTaskCatalog');

// ─── Constants ────────────────────────────────────────────────────────────────

// Daily task selection weights
const SELECTION = {
  basic:      2,
  quality:    2,
  state:      1,
  variety:    1, // Picks from variety OR consistency pool
  stretch:    null, // 30% chance of +1 stretch
  STRETCH_CHANCE: 0.30,
};

// XP bonuses fed back to xpEngine call site
const TASK_COMPLETE_XP   = 100; // Per task completed (~20% of daily XP via 5 tasks + bonus)
const FULL_SET_BONUS_XP  = 150; // All tasks completed in one day

// Score weight: each task worth equal share of 100 points
const SCORE_PER_TASK = (taskCount) => Math.floor(100 / taskCount);

// ─── Task Selection ───────────────────────────────────────────────────────────

/**
 * Pick n random items from an array without replacement.
 */
function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/**
 * Select a day's task set (5–6 tasks) from the catalog pool.
 * isEarlyGame affects target values.
 *
 * @param {boolean} [isEarlyGame=true]
 * @returns {Array} activeDailyTasks array (ready to store on Byte)
 */
function selectDailyTasks(isEarlyGame = true) {
  const now = new Date();

  const basics    = pickRandom(TASK_POOL.basic, SELECTION.basic);
  const qualities = pickRandom(TASK_POOL.quality, 1);
  const varieties = pickRandom([...TASK_POOL.variety, ...TASK_POOL.consistency], 1);
  const states    = pickRandom(TASK_POOL.state, SELECTION.state);

  const selected = [...basics, ...qualities, ...varieties, ...states];

  // 30% chance of a bonus stretch task
  if (Math.random() < SELECTION.STRETCH_CHANCE) {
    const stretch = pickRandom(TASK_POOL.stretch, 1);
    selected.push(...stretch);
  }

  return selected.map(taskDef => ({
    id:         taskDef.id,
    target:     taskDef.getTarget(isEarlyGame),
    progress:   0,
    completed:  false,
    failed:     false,
    assignedAt: now,
  }));
}

// ─── Event Processing ─────────────────────────────────────────────────────────

// Keys that must all be present for perfect_cycle to complete
const PERFECT_CYCLE_KEYS = ['feed_optimal', 'play_optimal', 'rest_ok'];

/**
 * Process a single event against the byte's active daily tasks.
 * Mutates the activeDailyTasks array in place.
 *
 * Boolean-target tasks (avoid_critical, zero_neglect) are treated as
 * "passing" unless explicitly failed — calcDailyCareScore handles their
 * completion state. processEvent only sets failed=true on them.
 *
 * @param {Array}  activeTasks - byte.activeDailyTasks (mongoose subdoc array)
 * @param {Object} event       - { type, ...payload }
 * @returns {{ completedIds: string[], xpAwarded: number }}
 */
function processEvent(activeTasks, event) {
  const completedIds = [];
  let xpAwarded = 0;

  for (const task of activeTasks) {
    if (task.failed) continue;

    const taskDef = TASK_CATALOG_MAP[task.id];
    if (!taskDef) continue;

    // Boolean-target (avoid) tasks: check for fail even when completed
    const isBooleanTarget = task.target === true;
    if (!isBooleanTarget && task.completed) continue;

    const result = taskDef.condition(event);

    if (result === 'fail') {
      task.failed = true;
      task.completed = false; // Un-complete if it was passing
      continue;
    }

    if (!result) continue;

    // Boolean-target tasks never progress via result — they're handled by scoring fns
    if (isBooleanTarget) continue;

    // ── balanced_care: accumulate distinct action types in persistable array ──
    if (task.id === 'balanced_care' && typeof result === 'string') {
      if (!task.distinctCareTypes) task.distinctCareTypes = [];
      if (!task.distinctCareTypes.includes(result)) {
        task.distinctCareTypes.push(result);
        task.progress = task.distinctCareTypes.length;
      }
      if (task.progress >= task.target) {
        task.completed = true;
        completedIds.push(task.id);
        xpAwarded += TASK_COMPLETE_XP;
      }
      continue;
    }

    // ── perfect_cycle: accumulate component keys; complete when all 3 present ──
    if (task.id === 'perfect_cycle' && typeof result === 'string') {
      if (!task.distinctCareTypes) task.distinctCareTypes = [];
      if (!task.distinctCareTypes.includes(result)) {
        task.distinctCareTypes.push(result);
        task.progress = task.distinctCareTypes.length;
      }
      if (PERFECT_CYCLE_KEYS.every(k => task.distinctCareTypes.includes(k))) {
        task.completed = true;
        completedIds.push(task.id);
        xpAwarded += TASK_COMPLETE_XP;
      }
      continue;
    }

    // ── Numeric result: time-based tasks add deltaTime seconds ──
    if (typeof result === 'number') {
      task.progress = (task.progress || 0) + result;
    } else {
      task.progress = (task.progress || 0) + 1;
    }

    if ((task.progress || 0) >= task.target) {
      task.completed = true;
      completedIds.push(task.id);
      xpAwarded += TASK_COMPLETE_XP;
    }
  }

  return { completedIds, xpAwarded };
}

// ─── Score + Streak ───────────────────────────────────────────────────────────

/**
 * A task counts as effectively complete if:
 *  - Its completed flag is true, OR
 *  - It's a boolean-target (avoid) task and hasn't been failed
 * Failed tasks are excluded from scoring entirely.
 */
function isEffectivelyComplete(task) {
  if (task.failed) return false;
  if (task.target === true) return true; // avoid tasks: complete unless failed
  return task.completed;
}

/**
 * Calculate the daily care score (0–100) from completed tasks.
 *
 * @param {Array} activeTasks - byte.activeDailyTasks
 * @returns {number} score 0–100
 */
function calcDailyCareScore(activeTasks) {
  if (!activeTasks || activeTasks.length === 0) return 0;

  const countable = activeTasks.filter(t => !t.failed);
  const completed = countable.filter(isEffectivelyComplete).length;
  const total = countable.length;

  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Check if all non-failed tasks are complete (for full-set bonus).
 */
function isFullSetComplete(activeTasks) {
  if (!activeTasks || activeTasks.length === 0) return false;
  const countable = activeTasks.filter(t => !t.failed);
  return countable.length > 0 && countable.every(isEffectivelyComplete);
}

/**
 * Check and update the daily care streak.
 * Call once when day's tasks are completed or on midnight reset.
 *
 * @param {Object} byte       - Byte document (mutated in place)
 * @param {string} todayUTC   - 'YYYY-MM-DD' string for today
 */
function checkStreakReset(byte, todayUTC) {
  const lastDate = byte.lastCareDate;

  if (!lastDate) {
    // First time completing tasks
    if (isFullSetComplete(byte.activeDailyTasks)) {
      byte.dailyCareStreak = 1;
      byte.lastCareDate = todayUTC;
    }
    return;
  }

  // Check if yesterday was the last completion
  const last = new Date(lastDate + 'T00:00:00Z');
  const today = new Date(todayUTC + 'T00:00:00Z');
  const dayDiff = Math.round((today - last) / (1000 * 60 * 60 * 24));

  if (dayDiff === 1 && isFullSetComplete(byte.activeDailyTasks)) {
    // Consecutive day — extend streak
    byte.dailyCareStreak = (byte.dailyCareStreak || 0) + 1;
    byte.lastCareDate = todayUTC;
  } else if (dayDiff > 1) {
    // Missed a day — reset streak
    byte.dailyCareStreak = isFullSetComplete(byte.activeDailyTasks) ? 1 : 0;
    byte.lastCareDate = isFullSetComplete(byte.activeDailyTasks) ? todayUTC : null;
  }
  // dayDiff === 0 = same day, already counted
}

/**
 * Determine if the active daily tasks should be reset (midnight UTC has passed).
 *
 * @param {Array} activeTasks
 * @returns {boolean}
 */
function shouldResetTasks(activeTasks) {
  if (!activeTasks || activeTasks.length === 0) return true;

  const assignedAt = activeTasks[0]?.assignedAt;
  if (!assignedAt) return true;

  const assignedDay = new Date(assignedAt).toISOString().slice(0, 10);
  const todayUTC = new Date().toISOString().slice(0, 10);

  return assignedDay !== todayUTC;
}

/**
 * Get today's UTC date string.
 */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  selectDailyTasks,
  processEvent,
  calcDailyCareScore,
  isFullSetComplete,
  checkStreakReset,
  shouldResetTasks,
  todayUTC,
  TASK_COMPLETE_XP,
  FULL_SET_BONUS_XP,
  SCORE_PER_TASK,
};
