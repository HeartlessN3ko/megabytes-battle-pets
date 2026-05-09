/**
 * arcadeRewards — pure helper for client-side reward preview.
 *
 * Server is authoritative on apply: backend `gameBalance.ARCADE` mirrors these
 * values and enforces the DAILY_BIT_CAP. Use this only to render the
 * "you got X" lines in result modals before/while the server response lands.
 */

import { TUNABLES } from '../../../../config/tunables';

export type ArcadeOutcome = 'win' | 'lose' | 'tie';
export type ArcadeGameId = 'connect4' | 'minesweeper' | 'hangman' | 'simon' | 'rps';

export type ArcadeRewardPreview = {
  mood: number;
  affection: number;
  bits: number;
};

export function previewReward(outcome: ArcadeOutcome): ArcadeRewardPreview {
  const a = TUNABLES.arcade;
  if (outcome === 'win') return { mood: a.WIN_MOOD,  affection: a.WIN_AFFECTION,  bits: a.WIN_BITS };
  if (outcome === 'tie') return { mood: a.TIE_MOOD,  affection: a.TIE_AFFECTION,  bits: a.TIE_BITS };
  return { mood: a.LOSE_MOOD, affection: a.LOSE_AFFECTION, bits: a.LOSE_BITS };
}

export function dailyBitCap(): number {
  return TUNABLES.arcade.DAILY_BIT_CAP;
}
