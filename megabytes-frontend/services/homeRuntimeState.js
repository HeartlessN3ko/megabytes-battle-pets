import AsyncStorage from '@react-native-async-storage/async-storage';

let homeClutterClearedAt = 0;
const HOME_CLUTTER_KEY = 'megabytes.home_clutter_count';
const PENDING_POOP_KEY = 'megabytes.home_pending_poop_at';

export function markHomeClutterCleared() {
  homeClutterClearedAt = Date.now();
  AsyncStorage.setItem(HOME_CLUTTER_KEY, '0').catch(() => {});
}

export function getHomeClutterClearedAt() {
  return homeClutterClearedAt;
}

export async function loadHomeClutterCount() {
  try {
    const raw = await AsyncStorage.getItem(HOME_CLUTTER_KEY);
    const parsed = Number(raw || 0);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  } catch {
    return 0;
  }
}

export async function saveHomeClutterCount(count) {
  const safe = Math.max(0, Math.floor(Number(count || 0)));
  try {
    await AsyncStorage.setItem(HOME_CLUTTER_KEY, String(safe));
  } catch {
    // non-fatal
  }
}

// Pending poop digestion timer — survives screen unmount so a feed in the
// kitchen can still trigger a poop spawn after the player returns home.
export async function getPendingPoopAt() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_POOP_KEY);
    const parsed = Number(raw || 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
  } catch {
    return 0;
  }
}

export async function setPendingPoopAt(timestamp) {
  const safe = Math.max(0, Math.floor(Number(timestamp || 0)));
  try {
    if (safe === 0) await AsyncStorage.removeItem(PENDING_POOP_KEY);
    else await AsyncStorage.setItem(PENDING_POOP_KEY, String(safe));
  } catch {
    // non-fatal
  }
}

export async function clearPendingPoop() {
  return setPendingPoopAt(0);
}
