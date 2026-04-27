import AsyncStorage from '@react-native-async-storage/async-storage';

let homeClutterClearedAt = 0;
const HOME_CLUTTER_KEY   = 'megabytes.home_clutter_count';
const PENDING_POOP_KEY   = 'megabytes.home_pending_poop_at';
const LAST_SEEN_LEVEL_KEY = 'megabytes.last_seen_level'; // per-byte, key is `${prefix}.${byteId}`
const LIGHTS_ON_KEY       = 'megabytes.home_lights_on';

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

// Last byte level the player has seen acknowledged on the home screen.
// Used to fire a "LEVEL UP" banner on return if the byte levelled while away.
// Stored per-byte so swapping active bytes doesn't cross-fire banners.
function levelKey(byteId) {
  return `${LAST_SEEN_LEVEL_KEY}.${String(byteId || 'unknown')}`;
}

export async function getLastSeenLevel(byteId) {
  if (!byteId) return null;
  try {
    const raw = await AsyncStorage.getItem(levelKey(byteId));
    if (raw == null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.floor(n);
  } catch {
    return null;
  }
}

export async function setLastSeenLevel(byteId, level) {
  if (!byteId) return;
  const safe = Math.max(1, Math.floor(Number(level || 1)));
  try {
    await AsyncStorage.setItem(levelKey(byteId), String(safe));
  } catch {
    // non-fatal
  }
}

// Home "lights" toggle. When OFF, the room area dims (byte is encouraged to
// sleep); when ON during low-Bandwidth, the backend applies a mild Mood drag.
// Default is ON. Stored client-local so the toggle survives app restarts.
export async function getLightsOn() {
  try {
    const raw = await AsyncStorage.getItem(LIGHTS_ON_KEY);
    if (raw == null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

export async function saveLightsOn(on) {
  try {
    await AsyncStorage.setItem(LIGHTS_ON_KEY, on ? '1' : '0');
  } catch {
    // non-fatal
  }
}
