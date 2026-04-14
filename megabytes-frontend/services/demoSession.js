import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'megabytes.demo_mode_active';

const DEFAULT_PLAYER_ID = process.env.EXPO_PUBLIC_PLAYER_ID || '69d88aea8708c93a264e50f0';
const DEFAULT_BYTE_ID = process.env.EXPO_PUBLIC_BYTE_ID || '69d88d94770f0c774e9f4808';

const DEMO_PLAYER_ID = process.env.EXPO_PUBLIC_DEMO_PLAYER_ID || DEFAULT_PLAYER_ID;
const DEMO_BYTE_ID = process.env.EXPO_PUBLIC_DEMO_BYTE_ID || DEFAULT_BYTE_ID;

const DEMO_TIMER_SCALE = Math.max(1 / 48, Number(process.env.EXPO_PUBLIC_DEMO_TIMER_SCALE || (1 / 24)));
const DEMO_DECAY_MULTIPLIER = Math.max(1, Number(process.env.EXPO_PUBLIC_DEMO_DECAY_MULTIPLIER || 24));

let demoModeActive = false;
let hydrated = false;

export async function hydrateDemoSession() {
  if (hydrated) return demoModeActive;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    demoModeActive = raw === '1';
  } catch {
    demoModeActive = false;
  } finally {
    hydrated = true;
  }
  return demoModeActive;
}

export function isDemoModeActive() {
  return demoModeActive;
}

export async function setDemoModeActive(active) {
  demoModeActive = Boolean(active);
  hydrated = true;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, demoModeActive ? '1' : '0');
  } catch {
    // Non-fatal in demo flow.
  }
  return demoModeActive;
}

export function getActiveProfileIds() {
  if (demoModeActive) {
    return { playerId: DEMO_PLAYER_ID, byteId: DEMO_BYTE_ID };
  }
  return { playerId: DEFAULT_PLAYER_ID, byteId: DEFAULT_BYTE_ID };
}

export function getDemoSessionHeaders() {
  if (!demoModeActive) return {};
  return {
    'x-demo-mode': '1',
    'x-demo-decay-multiplier': String(DEMO_DECAY_MULTIPLIER),
  };
}

export function toDemoSeconds(baseSeconds) {
  if (!demoModeActive) return baseSeconds;
  return Math.max(3, Math.round(baseSeconds * DEMO_TIMER_SCALE));
}

export function getDemoSpeedLabel() {
  if (!demoModeActive) return null;
  const speed = (1 / DEMO_TIMER_SCALE).toFixed(1).replace(/\.0$/, '');
  return `DEMO ACTIVE - ${speed}x SPEED`;
}
