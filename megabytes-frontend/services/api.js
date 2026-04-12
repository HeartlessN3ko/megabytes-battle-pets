// services/api.js
// Central API service. Backend calls should go through this file.

const RAW_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.0.45:5000';
const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

// Hardcoded demo IDs until auth is wired up.
export const PLAYER_ID = '69d88aea8708c93a264e50f0';
export const BYTE_ID = '69d88d94770f0c774e9f4808';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(method, status) {
  if (method !== 'GET') return false;
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

async function request(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const attempts = method === 'GET' ? 3 : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

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
      const status = err?.status || 0;
      const canRetry = attempt < attempts && shouldRetry(method, status);
      if (canRetry) {
        await sleep(450 * attempt);
        continue;
      }
      const detail = err?.message || 'Request failed';
      console.error(`[API] ${method} ${path} failed (${BASE_URL}):`, detail);
      throw err;
    }
  }

  throw lastError || new Error('Request failed');
}

// Byte
export const getByte = () => request('GET', `/api/byte/${BYTE_ID}`);

export const careAction = (action) =>
  request('PATCH', `/api/byte/${BYTE_ID}/care`, { action: action.toLowerCase() });

export const trainStat = (stat, result) =>
  request('PATCH', `/api/byte/${BYTE_ID}/train`, { stat, result });
export const praiseByte = () => request('POST', `/api/byte/${BYTE_ID}/praise`);
export const scoldByte = () => request('POST', `/api/byte/${BYTE_ID}/scold`);

// Player
export const getPlayer = () => request('GET', `/api/player/${PLAYER_ID}`);

export const getCurrency = () => request('GET', `/api/player/${PLAYER_ID}/currency`);

// Battle
export const startBattle = (mode = 'ai') =>
  request('POST', '/api/battle/start', { byteId: BYTE_ID, mode });

export const getBattle = (battleId) => request('GET', `/api/battle/${battleId}`);

// Economy
export const getBalance = () => request('GET', `/api/economy/balance/${PLAYER_ID}`);

// Rooms
export const enterRoom = (roomId, durationMinutes = 1) =>
  request('POST', '/api/rooms/enter', { playerId: PLAYER_ID, byteId: BYTE_ID, roomId, durationMinutes });

// Shop
export const getShopItems = () => request('GET', '/api/shop/items');
export const getShopRooms = () => request('GET', '/api/shop/rooms');
export const buyItem = (itemId) => request('POST', '/api/shop/buy/item', { playerId: PLAYER_ID, itemId });
export const consumeItem = (itemId) => request('POST', '/api/shop/use/item', { playerId: PLAYER_ID, byteId: BYTE_ID, itemId });
