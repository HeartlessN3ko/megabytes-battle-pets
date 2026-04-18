// services/api.js
// Central API service. Backend calls should go through this file.
import { getActiveProfileIds, getDemoSessionHeaders } from './demoSession';

const RAW_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.0.45:5000';
const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 14000;
let lastWarmupAt = 0;

export const getActiveIds = () => getActiveProfileIds();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(method, status) {
  if (method === 'GET') return [408, 425, 429, 500, 502, 503, 504].includes(status);
  // Safe retries for transient deploy/cold-start failures.
  return [502, 503, 504].includes(status);
}

function isWakeLikeError(status, message = '') {
  const msg = String(message || '').toLowerCase();
  return [502, 503, 504].includes(Number(status || 0)) || msg.includes('waking up');
}

async function warmServerIfNeeded() {
  const now = Date.now();
  if (now - lastWarmupAt < 4000) return;
  lastWarmupAt = now;
  try {
    await fetch(`${BASE_URL}/health`, { method: 'GET' });
  } catch {
    // Best-effort wake ping.
  }
}

async function request(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const attempts = method === 'GET' ? 5 : 3;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...getDemoSessionHeaders(),
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const raw = await res.text();
      let data = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = null;
        }
      }

      if (!res.ok) {
        const serverMsg = data?.error || data?.message || '';
        const fallbackMsg = serverMsg || `${res.status} ${res.statusText || 'HTTP error'}`;
        const err = new Error(fallbackMsg);
        err.status = res.status;
        err.url = url;
        err.body = raw;
        throw err;
      }

      return data;
    } catch (err) {
      lastError = err;
      if (err?.name === 'AbortError') {
        err.status = 408;
        err.message = `Request timed out after ${REQUEST_TIMEOUT_MS}ms`;
      }
      const status = err?.status || 0;
      const canRetry = attempt < attempts && shouldRetry(method, status);
      if (canRetry) {
        if (isWakeLikeError(status, err?.message)) {
          await warmServerIfNeeded();
        }
        await sleep(500 * attempt);
        continue;
      }
      const detail = err?.message || 'Request failed';
      const renderColdStart =
        [502, 503, 504].includes(status) && BASE_URL.includes('onrender.com');
      if (renderColdStart) {
        err.message = 'Server is waking up. Please retry in a few seconds.';
      }
      if (__DEV__) {
        console.log(`[API] ${method} ${path} failed (${BASE_URL}): ${detail}`);
      }
      throw err;
    }
  }

  throw lastError || new Error('Request failed');
}

function activeIds() {
  return getActiveProfileIds();
}

// Byte
export const getByte = () => request('GET', `/api/byte/${activeIds().byteId}`);
export const syncByte = () => request('POST', `/api/byte/${activeIds().byteId}/sync`);

export const careAction = (action, grade = 'good', extra = {}) =>
  request('PATCH', `/api/byte/${activeIds().byteId}/care`, { action: action.toLowerCase(), grade, ...extra });

export const trainStat = (stat, result) =>
  request('PATCH', `/api/byte/${activeIds().byteId}/train`, { stat, result });
export const praiseByte = () => request('POST', `/api/byte/${activeIds().byteId}/praise`);
export const scoldByte = () => request('POST', `/api/byte/${activeIds().byteId}/scold`);
export const interactByte = () => request('POST', `/api/byte/${activeIds().byteId}/interact`);
export const tapByte = () => request('POST', `/api/byte/${activeIds().byteId}/tap`);
export const homeCleanByte = () => request('POST', `/api/byte/${activeIds().byteId}/home-clean`);
export const clinicRepair = () => request('POST', `/api/byte/${activeIds().byteId}/clinic-repair`);
export const powerNap = () => request('POST', `/api/byte/${activeIds().byteId}/power-nap`);
export const sleepCycle = (durationMinutes) => request('POST', `/api/byte/${activeIds().byteId}/sleep-cycle`, { durationMinutes });
export const wakeUpByte = (forced = false) => request('POST', `/api/byte/${activeIds().byteId}/wake-up`, { forced });
export const getDailyCareStatus = () => request('GET', `/api/byte/${activeIds().byteId}/daily-care`);
export const resetDailyTasks = () => request('POST', `/api/byte/${activeIds().byteId}/daily-care/reset`);
export const hatchByte = () => request('POST', `/api/byte/${activeIds().byteId}/hatch`);
export const evolveByte = (itemUsed = null, playerChoice = {}) =>
  request('POST', `/api/byte/${activeIds().byteId}/evolve`, { itemUsed, playerChoice });
export const setDemoStage = (stage) => request('PATCH', `/api/byte/${activeIds().byteId}/demo-stage`, { stage });
export const getByteMoves = () => request('GET', `/api/byte/${activeIds().byteId}/moves`);
export const updateByteLoadout = (payload) => request('PATCH', `/api/byte/${activeIds().byteId}/loadout`, payload);

// Player
export const getPlayer = () => request('GET', `/api/player/${activeIds().playerId}`);
export const getInventory = () => request('GET', `/api/player/${activeIds().playerId}/inventory`);

export const getCurrency = () => request('GET', `/api/player/${activeIds().playerId}/currency`);
export const resetDemoData = () =>
  request('POST', `/api/player/${activeIds().playerId}/reset-demo`, { byteId: activeIds().byteId });

// Battle
export const startBattle = (mode = 'ai') =>
  request('POST', '/api/battle/start', { byteId: activeIds().byteId, mode });

export const getBattle = (battleId) => request('GET', `/api/battle/${battleId}`);
export const cheerBattle = (battleId) => request('POST', `/api/battle/${battleId}/cheer`);
export const suggestBattleUlt = (battleId) => request('POST', `/api/battle/${battleId}/ult`);

// Economy
export const getBalance = () => request('GET', `/api/economy/balance/${activeIds().playerId}`);
export const earnCurrency = (amount, source = 'home_clutter') =>
  request('POST', '/api/economy/earn', { playerId: activeIds().playerId, amount, source });

// Rooms
export const enterRoom = (roomId, durationMinutes = 1) =>
  request('POST', '/api/rooms/enter', { playerId: activeIds().playerId, byteId: activeIds().byteId, roomId, durationMinutes });

// Shop
export const getShopItems = () => request('GET', '/api/shop/items');
export const getShopRooms = () => request('GET', '/api/shop/rooms');
export const buyItem = (itemId) => request('POST', '/api/shop/buy/item', { playerId: activeIds().playerId, itemId });
export const consumeItem = (itemId) => request('POST', '/api/shop/use/item', { playerId: activeIds().playerId, byteId: activeIds().byteId, itemId });

// Pageant
export const enterPageant = () => request('POST', '/api/pageant/enter', { byteId: activeIds().byteId });
export const submitPageantScore = (placement, performanceResult = 'stable', scoring = {}) =>
  request('POST', '/api/pageant/score', {
    byteId: activeIds().byteId,
    performanceResult,
    placement,
    ...scoring,
  });
export const getPageantLeaderboard = () => request('GET', '/api/pageant/leaderboard');

// Marketplace
export const getMarketplaceListings = (status = 'open') =>
  request('GET', `/api/marketplace/listings?status=${encodeURIComponent(status)}`);
export const placeMarketplaceBid = (listingId, amount) =>
  request('POST', '/api/marketplace/bid', { playerId: activeIds().playerId, listingId, amount });
export const buyMarketplaceNow = (listingId) =>
  request('POST', '/api/marketplace/buy-now', { playerId: activeIds().playerId, listingId });

// Inbox
export const getInboxMessages = () => request('GET', `/api/inbox/${activeIds().playerId}`);
export const claimInboxMessage = (messageId) =>
  request('POST', '/api/inbox/claim', { playerId: activeIds().playerId, messageId });
export const markInboxRead = (messageId) =>
  request('POST', '/api/inbox/read', { playerId: activeIds().playerId, messageId });

// Campaign
export const getCampaignProgress = () => request('GET', `/api/campaign/${activeIds().byteId}`);
export const startCampaign = () => request('POST', `/api/campaign/${activeIds().byteId}/start`);
export const startCampaignNode = (nodeId) => request('POST', `/api/campaign/${activeIds().byteId}/node/${nodeId}/start`);
export const completeCampaignNode = (nodeId, grade) =>
  request('POST', `/api/campaign/${activeIds().byteId}/node/${nodeId}/complete`, { grade });
export const getCampaignStats = () => request('GET', `/api/campaign/${activeIds().byteId}/stats`);
export const getCampaignLeaderboard = () => request('GET', '/api/campaign/leaderboard');

// Onboarding
export const getOnboardingProgress = () => request('GET', `/api/onboarding/${activeIds().playerId}`);
export const advanceOnboarding = () => request('POST', `/api/onboarding/${activeIds().playerId}/advance`);
export const selectOnboardingEgg = (shape) => request('POST', `/api/onboarding/${activeIds().playerId}/select-egg`, { shape });
export const skipOnboarding = () => request('POST', `/api/onboarding/${activeIds().playerId}/skip`);

// Achievements
export const getAllAchievements = () => request('GET', '/api/achievements');
export const getPlayerAchievements = () => request('GET', `/api/achievements/player/${activeIds().playerId}`);
export const unlockAchievement = (achievementId) =>
  request('POST', `/api/achievements/${achievementId}/unlock`, { playerId: activeIds().playerId });
export const checkAchievements = () => request('POST', '/api/achievements/check', { playerId: activeIds().playerId });

// Community Event
export const getCurrentCommunityEvent = () => request('GET', '/api/community-event/current');
export const getCommunityEventStatus = (eventId) => request('GET', `/api/community-event/${eventId}/status`);
export const claimCommunityEventReward = (eventId, playerContribution = 0) =>
  request('POST', `/api/community-event/${eventId}/claim`, { playerId: activeIds().playerId, playerContribution });
