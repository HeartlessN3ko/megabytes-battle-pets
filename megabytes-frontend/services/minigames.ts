export type MiniGameId =
  | 'feed-upload'
  | 'run-cleanup'
  | 'engage-simulation'
  | 'stabilize-signal'
  | 'sync-link'
  | 'emote-align'
  | 'training-power'
  | 'training-agility'
  | 'training-accuracy'
  | 'training-defense'
  | 'training-special'
  | 'training-stamina'
  | 'training-speed';

export type MiniGameKind =
  | 'tap-target'
  | 'scrub'
  | 'trace'
  | 'match'
  | 'sequence'
  | 'timing'
  | 'rapid-tap'
  | 'ordered-sequence';

export type MiniGameDef = {
  id: MiniGameId;
  title: string;
  subtitle: string;
  kind: MiniGameKind;
  room: 'kitchen' | 'bathroom' | 'bedroom' | 'play-room' | 'training-center' | 'all';
  stat?: 'Power' | 'Speed' | 'Defense' | 'Special' | 'Stamina' | 'Accuracy' | 'Agility';
  accent: string;
};

export const MINI_GAME_DEFS: MiniGameDef[] = [
  { id: 'feed-upload', title: 'UPLOAD NUTRIENTS', subtitle: 'Tap nutrient packets', kind: 'tap-target', room: 'kitchen', accent: '#ffcf6f' },
  { id: 'run-cleanup', title: 'RUN CLEANUP', subtitle: 'Scrub BYTE clean', kind: 'scrub', room: 'bathroom', accent: '#84dcff' },
  { id: 'engage-simulation', title: 'ENGAGE SIMULATION', subtitle: 'Quick stimulation taps', kind: 'tap-target', room: 'play-room', accent: '#ff9cdf' },
  { id: 'stabilize-signal', title: 'STABILIZE SIGNAL', subtitle: 'Trace and align signal', kind: 'trace', room: 'bedroom', accent: '#9cc5ff' },
  { id: 'sync-link', title: 'SYNC LINK', subtitle: 'Match social nodes', kind: 'match', room: 'play-room', accent: '#8bf2cb' },
  { id: 'emote-align', title: 'EMOTE ALIGN', subtitle: 'Repeat emote pattern', kind: 'sequence', room: 'play-room', accent: '#ff9b9b' },

  { id: 'training-power', title: 'POWER DRILL', subtitle: 'Charge + impact taps', kind: 'tap-target', room: 'training-center', stat: 'Power', accent: '#d3a3ff' },
  { id: 'training-agility', title: 'AGILITY DRILL', subtitle: 'Quick reaction targets', kind: 'tap-target', room: 'training-center', stat: 'Agility', accent: '#8ce6ff' },
  { id: 'training-accuracy', title: 'ACCURACY DRILL', subtitle: 'Stop in target zone', kind: 'timing', room: 'training-center', stat: 'Accuracy', accent: '#ffe08b' },
  { id: 'training-defense', title: 'DEFENSE DRILL', subtitle: 'Merge fragments', kind: 'match', room: 'training-center', stat: 'Defense', accent: '#9df4a6' },
  { id: 'training-special', title: 'SPECIAL DRILL', subtitle: 'Solve pattern puzzle', kind: 'sequence', room: 'training-center', stat: 'Special', accent: '#9fb0ff' },
  { id: 'training-stamina', title: 'STAMINA DRILL', subtitle: 'Rapid tap endurance', kind: 'rapid-tap', room: 'training-center', stat: 'Stamina', accent: '#ffb88a' },
  { id: 'training-speed', title: 'SPEED DRILL', subtitle: 'Tap order 1 -> 6', kind: 'ordered-sequence', room: 'training-center', stat: 'Speed', accent: '#7fdcff' },
];

export function getMiniGameById(id: string | undefined | null): MiniGameDef | null {
  if (!id) return null;
  return MINI_GAME_DEFS.find((g) => g.id === id) || null;
}

export function getMiniGamesForRoom(room: string | undefined | null): MiniGameDef[] {
  if (!room) return MINI_GAME_DEFS;
  return MINI_GAME_DEFS.filter((g) => g.room === room || g.room === 'all');
}
