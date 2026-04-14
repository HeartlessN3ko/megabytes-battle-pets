/**
 * Matchmaking + rating progression rules.
 * Source: Battlematching.md
 */

const RATING = {
  base: 1000,
  min: 0,
  max: 3000,
};

const CHANGE = {
  win: 25,
  loss: -20,
  streakBonus: 5,
  underdogBonus: 10,
};

function clampRating(value) {
  return Math.max(RATING.min, Math.min(RATING.max, Math.round(value)));
}

function calcDelta({ didWin, streak, myRating, opponentRating }) {
  let delta = didWin ? CHANGE.win : CHANGE.loss;

  if (didWin && streak > 0 && streak % 3 === 0) {
    delta += CHANGE.streakBonus;
  }

  if (didWin && Number(opponentRating) - Number(myRating) >= 150) {
    delta += CHANGE.underdogBonus;
  }

  return delta;
}

function applyRatingResult({ currentRating, didWin, currentStreak, opponentRating }) {
  const nextStreak = didWin ? Number(currentStreak || 0) + 1 : 0;
  const delta = calcDelta({
    didWin,
    streak: nextStreak,
    myRating: Number(currentRating || RATING.base),
    opponentRating: Number(opponentRating || RATING.base),
  });

  return {
    delta,
    rating: clampRating(Number(currentRating || RATING.base) + delta),
    streak: nextStreak,
  };
}

module.exports = {
  RATING,
  CHANGE,
  clampRating,
  applyRatingResult,
};
