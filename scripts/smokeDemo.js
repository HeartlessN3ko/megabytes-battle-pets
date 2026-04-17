/* eslint-disable no-console */
const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const PLAYER_ID = process.env.PLAYER_ID || '69d88aea8708c93a264e50f0';
const BYTE_ID = process.env.BYTE_ID || '69d88d94770f0c774e9f4808';
const HEALTH_TIMEOUT_MS = Number(process.env.SMOKE_HEALTH_TIMEOUT_MS || 10000);

async function checkHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Health check failed with status ${res.status}`);
    }
    const body = await res.json().catch(() => ({}));
    return body;
  } catch (err) {
    const msg = err?.name === 'AbortError'
      ? `Health check timed out after ${HEALTH_TIMEOUT_MS}ms`
      : (err?.message || String(err));
    throw new Error(
      `${msg}. Ensure backend is running at ${BASE_URL} (start with: npm run dev).`
    );
  } finally {
    clearTimeout(timer);
  }
}

async function req(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log(`Smoke target: ${BASE_URL}`);

  const health = await checkHealth();
  console.log('1) health:', health.status || 'ok');

  const reset = await req('POST', `/api/player/${PLAYER_ID}/reset-demo`, { byteId: BYTE_ID });
  console.log('2) reset:', reset.ok ? 'ok' : 'failed');

  const byte0 = await req('GET', `/api/byte/${BYTE_ID}`);
  if ((byte0?.byte?.evolutionStage ?? -1) !== 0) throw new Error('Reset did not return evolutionStage 0');
  console.log('3) byte stage after reset: 0');

  await req('POST', `/api/byte/${BYTE_ID}/praise`);
  await req('POST', `/api/byte/${BYTE_ID}/scold`);
  await req('POST', `/api/byte/${BYTE_ID}/interact`);
  await req('POST', `/api/byte/${BYTE_ID}/home-clean`);
  console.log('4) home actions persisted: ok');

  await req('PATCH', `/api/byte/${BYTE_ID}/care`, { action: 'feed' });
  await req('PATCH', `/api/byte/${BYTE_ID}/care`, { action: 'clean' });
  await req('PATCH', `/api/byte/${BYTE_ID}/demo-stage`, { stage: 1 });
  console.log('5) hatch baseline path: ok');

  await req('POST', '/api/rooms/enter', { playerId: PLAYER_ID, byteId: BYTE_ID, roomId: 'Bathroom', durationMinutes: 1 });
  await req('POST', '/api/rooms/enter', { playerId: PLAYER_ID, byteId: BYTE_ID, roomId: 'Kitchen', durationMinutes: 1 });
  await req('POST', '/api/rooms/enter', { playerId: PLAYER_ID, byteId: BYTE_ID, roomId: 'Bedroom', durationMinutes: 1 });
  console.log('6) room writes: ok');

  const battle = await req('POST', '/api/battle/start', { byteId: BYTE_ID, mode: 'ai' });
  if (!battle?.battleId) throw new Error('Battle did not return battleId');
  await req('GET', `/api/battle/${battle.battleId}`);
  console.log('7) battle completion: ok');

  await req('POST', '/api/pageant/enter', { byteId: BYTE_ID });
  const pageant = await req('POST', '/api/pageant/score', { byteId: BYTE_ID, performanceResult: 'style', placement: 'participation' });
  console.log(`8) pageant completion: +${pageant?.earned || 0} BB`);

  let player = await req('GET', `/api/player/${PLAYER_ID}`);
  const items = await req('GET', '/api/shop/items');
  const cheapest = [...items].sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0))[0];
  if (!cheapest) throw new Error('No shop items available');

  let loopGuard = 0;
  while ((player?.byteBits || 0) < Number(cheapest.cost || 0) && loopGuard < 10) {
    await req('POST', '/api/battle/start', { byteId: BYTE_ID, mode: 'ai' });
    player = await req('GET', `/api/player/${PLAYER_ID}`);
    loopGuard += 1;
  }

  if ((player?.byteBits || 0) < Number(cheapest.cost || 0)) {
    throw new Error('Unable to earn enough bits for item purchase in smoke run');
  }

  await req('POST', '/api/shop/buy/item', { playerId: PLAYER_ID, itemId: cheapest.id });
  await req('POST', '/api/shop/use/item', { playerId: PLAYER_ID, byteId: BYTE_ID, itemId: cheapest.id });
  console.log('9) item buy/use outside battle: ok');

  const byteFinal = await req('GET', `/api/byte/${BYTE_ID}`);
  const playerFinal = await req('GET', `/api/player/${PLAYER_ID}`);
  if (!byteFinal?.byte || !playerFinal?._id) throw new Error('Final reload checks failed');
  console.log('10) reload persistence checks: ok');

  console.log('SMOKE PASS: demo backend loop is operational.');
}

main().catch((err) => {
  console.error('SMOKE FAIL:', err.message || err);
  process.exit(1);
});
