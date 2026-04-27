/**
 * Achievement auto-check service.
 *
 * Pure function — no req/res. Resolves stat values from the loaded player +
 * byte, evaluates every active achievement's criteria, and unlocks any newly
 * met ones. Called from /sync, care actions, and the explicit /check route.
 *
 * The route handler in routes/achievements.js delegates to this module.
 * Statuses for stat resolvers must match achievement.criteria.statName.
 *
 * Returns the in-memory `player` and `byte` mutated with unlocks. Caller is
 * responsible for `.save()`. This function does NOT persist.
 */

const Achievement = require('../models/Achievement');

function resolveValue(statName, player, byte) {
  switch (statName) {
    case 'byteBits':        return player?.byteBits || 0;
    case 'winStreak':       return player?.battleWinStreak || 0;
    case 'evolutionStage':  return byte ? (byte.evolutionStage || 0) : null;
    case 'affection':       return byte ? (byte.affection != null ? byte.affection : 50) : null;
    case 'generation':      return byte ? (byte.generation || 1) : null;
    case 'dailyCareStreak': return byte ? (byte.dailyCareStreak || 0) : null;
    case 'power':           return byte?.stats ? (byte.stats.Power || 0) : null;
    case 'speed':           return byte?.stats ? (byte.stats.Speed || 0) : null;
    case 'defense':         return byte?.stats ? (byte.stats.Defense || 0) : null;
    // Tracking fields not yet persisted — silently skipped
    default:                return null;
  }
}

/**
 * Check every active achievement against current player + byte state.
 * Mutates `player.achievements`, `player.byteBits`, and (optionally) `byte.xp`.
 *
 * @param {Object} player - mongoose Player doc (or plain object)
 * @param {Object} [byte] - mongoose Byte doc (optional)
 * @returns {Promise<{ newlyUnlocked: Array, totalUnlocked: number }>}
 */
async function checkAndUnlockAchievements(player, byte = null) {
  if (!player) return { newlyUnlocked: [], totalUnlocked: 0 };

  const achievements = await Achievement.find();
  const unlockedIds = new Set((player.achievements || []).map(String));
  const newlyUnlocked = [];

  for (const achievement of achievements) {
    if (unlockedIds.has(String(achievement._id))) continue;

    const { type, target, statName } = achievement.criteria || {};

    // one_time achievements are event-driven — call /unlock explicitly
    if (type === 'one_time') continue;

    const currentValue = resolveValue(statName, player, byte);
    if (currentValue === null) continue;

    const met = (
      (type === 'stat_threshold' && currentValue >= target) ||
      (type === 'count'          && currentValue >= target) ||
      (type === 'streak'         && currentValue >= target)
    );

    if (met) {
      player.achievements.push(String(achievement._id));
      player.byteBits = (player.byteBits || 0) + (achievement.reward?.byteBits || 0);
      unlockedIds.add(String(achievement._id));
      if (byte && achievement.reward?.xp) {
        byte.xp = (byte.xp || 0) + achievement.reward.xp;
      }
      newlyUnlocked.push({
        id: String(achievement._id),
        name: achievement.name,
        description: achievement.description,
        reward: achievement.reward,
      });
    }
  }

  return { newlyUnlocked, totalUnlocked: unlockedIds.size };
}

module.exports = { checkAndUnlockAchievements, resolveValue };
