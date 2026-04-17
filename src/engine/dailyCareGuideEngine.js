/**
 * DAILY CARE GUIDE ENGINE (STUB)
 * Task pool, difficulty, rewards.
 * TODO: Task generation logic, completion tracking, bonus calcs.
 */

const TASK_TYPES = {
  feed: 'feed',
  clean: 'clean',
  play: 'play',
  rest_cycle: 'rest_cycle',
  perfect_timing: 'perfect_timing',
  keep_needs_high: 'keep_needs_high',
};

const DIFFICULTY_CONFIGS = {
  easy: {
    taskCount: 3,
    baseXP: 15,
    perfectDayXP: 120,
  },
  medium: {
    taskCount: 5,
    baseXP: 30,
    perfectDayXP: 120,
  },
  hard: {
    taskCount: 6,
    baseXP: 60,
    perfectDayXP: 120,
  },
};

/**
 * Generate daily task pool.
 * @param {string} difficulty - 'easy' | 'medium' | 'hard'
 * @param {string} temperament - pet's temperament for bias
 * @returns {Array} tasks
 */
function generateDailyTasks(difficulty = 'medium', temperament = null) {
  const config = DIFFICULTY_CONFIGS[difficulty] || DIFFICULTY_CONFIGS.medium;
  const tasks = [];

  // Placeholder: return basic task pool
  // TODO: randomize, bias by temperament
  return [
    { type: 'feed', target: 3 },
    { type: 'clean', target: 2 },
    { type: 'play', target: 2 },
    { type: 'rest_cycle', target: 1 },
    { type: 'perfect_timing', target: 2 },
    { type: 'keep_needs_high', target: 10 },
  ].slice(0, config.taskCount);
}

/**
 * Check task completion.
 */
function checkTaskCompletion(tasks = [], dailyData = {}) {
  // TODO: implement
  return { completed: 0, total: tasks.length };
}

module.exports = {
  TASK_TYPES,
  DIFFICULTY_CONFIGS,
  generateDailyTasks,
  checkTaskCompletion,
};
