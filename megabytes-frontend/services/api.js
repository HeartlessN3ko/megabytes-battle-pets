// services/api.js
// Central API service. Backend calls should go through this file.

const RAW_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.0.45:5000';
const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

// Hardcoded demo IDs until auth is wired up.
export const PLAYER_ID = '69d88aea8708c93a264e50f0';
export const BYTE_ID = '69d88d94770f0c774e9f4808';

async function request(method, path, body) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }

    return res.json();
  } catch (err) {
    console.error(`[API] ${method} ${path} failed:`, err.message);
    throw err;
  }
}

// Byte
export const getByte = () => request('GET', `/api/byte/${BYTE_ID}`);

export const careAction = (action) =>
  request('PATCH', `/api/byte/${BYTE_ID}/care`, { action: action.toLowerCase() });

export const trainStat = (stat, result) =>
  request('PATCH', `/api/byte/${BYTE_ID}/train`, { stat, result });

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
