export type MiniGameRoomId = 'kitchen' | 'bathroom' | 'play-room' | 'training-center';

export type MiniGameResultPayload = {
  room: MiniGameRoomId;
  gameId: string;
  title: string;
  grade: 'fail' | 'good' | 'perfect';
  quality: number;
  byteBits: number;
  skillGain?: string | null;
  energyCost: number;
  cooldownSeconds?: number | null;
  summary: string;
};

let pendingResult: MiniGameResultPayload | null = null;
let trainingCooldownUntil = 0;
let trainingFatigue = 0;
let fatigueStamp = Date.now();

function applyFatigueDecay(now = Date.now()) {
  const elapsedSec = Math.max(0, (now - fatigueStamp) / 1000);
  trainingFatigue = Math.max(0, trainingFatigue - elapsedSec);
  fatigueStamp = now;
}

export function setPendingMiniGameResult(result: MiniGameResultPayload) {
  pendingResult = result;
}

export function consumePendingMiniGameResult(room: MiniGameRoomId): MiniGameResultPayload | null {
  if (!pendingResult) return null;
  if (pendingResult.room !== room) return null;
  const next = pendingResult;
  pendingResult = null;
  return next;
}

export function recordTrainingUsage(energyCost: number, cooldownMs = 10000) {
  const now = Date.now();
  applyFatigueDecay(now);
  trainingFatigue = Math.min(85, trainingFatigue + Math.max(0, Number(energyCost || 0)));
  trainingCooldownUntil = Math.max(trainingCooldownUntil, now + cooldownMs);
}

export function getTrainingCooldownRemainingMs(now = Date.now()) {
  return Math.max(0, trainingCooldownUntil - now);
}

export function getTrainingFatigue(now = Date.now()) {
  applyFatigueDecay(now);
  return trainingFatigue;
}
