/* eslint-disable no-console */
/**
 * V1 CARE-LOOP SMOKE — exercises the v1 surface end-to-end.
 *
 * Coverage:
 *   1. Backend health
 *   2. Temp byte create (Circle, egg state)
 *   3. Force-hatch via dev/lifespan-stage → baby
 *   4. /sync response shape (needs, behaviorState, lifespanStage)
 *   5. Decay tick — set Hunger low via dev/need, sync, confirm decay engine
 *      doesn't crash and Hunger holds inside expected band
 *   6. Care action — feed (mealCycle bypass), confirm Hunger climbs
 *   7. Lights toggle — PATCH /lights, verify response shape
 *   8. Lifespan stage transitions — dev/lifespan-stage teen → elder,
 *      verify ageDeathPending surface on elder
 *   9. Corruption — dev/corruption set 80, /clinic-repair, verify drop
 *  10. Death — forced oldage death, verify legacyEgg returned
 *
 * Requires:
 *   - Backend running at BASE_URL (default 127.0.0.1:5000)
 *   - DEV_MODE=1 in backend env (otherwise dev/* routes 403)
 *   - DEV_MODE_KEY env on backend → set DEV_KEY in this script's env to match
 *   - PLAYER_ID env pointing at a real player doc with a free byte slot
 *
 * Run:  npm run smoke:careloop
 */

const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const PLAYER_ID = process.env.PLAYER_ID || '69d88aea8708c93a264e50f0';
const DEV_KEY = process.env.DEV_KEY || '';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (DEV_KEY && path.includes('/dev/')) headers['x-dev-key'] = DEV_KEY;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function head() { console.log(`\n${'─'.repeat(60)}`); }

async function run() {
  console.log(`Care-loop smoke target: ${BASE_URL}`);
  console.log(`Player: ${PLAYER_ID}`);
  if (!DEV_KEY) console.log('(no DEV_KEY set — assuming backend has DEV_MODE_KEY unset)');

  // [1] Health -----------------------------------------------------------
  head();
  console.log('[1] Health check');
  const health = await req('GET', '/health');
  assert('backend reachable', health.status === 200);
  if (health.status !== 200) {
    console.error('Cannot continue — backend not reachable.');
    process.exit(1);
  }

  // [2] Create temp byte -------------------------------------------------
  head();
  console.log('[2] Create temp byte (Circle, egg state)');
  const createRes = await req('POST', '/api/byte', { playerId: PLAYER_ID, shape: 'Circle' });
  assert('temp byte created (201)', createRes.status === 201, JSON.stringify(createRes.body));
  const byteId = createRes.body?._id;
  if (!byteId) {
    console.error('Cannot continue — temp byte creation failed.');
    process.exit(1);
  }
  console.log(`  byteId: ${byteId}`);
  assert('byte starts as egg', createRes.body?.isEgg === true);

  // [3] Force-hatch via dev/lifespan-stage --------------------------------
  head();
  console.log('[3] Force-hatch to baby via dev/lifespan-stage');
  const hatchRes = await req('POST', `/api/byte/${byteId}/dev/lifespan-stage`, { stage: 'baby' });
  assert('dev stage set to baby (200)', hatchRes.status === 200, JSON.stringify(hatchRes.body));
  assert('lifespanStage=baby', hatchRes.body?.lifespanStage === 'baby');
  assert('level synced to baby midpoint (3)', hatchRes.body?.level === 3);

  // [4] Initial /sync — response shape ------------------------------------
  head();
  console.log('[4] Initial /sync — verify response shape');
  const sync1 = await req('POST', `/api/byte/${byteId}/sync`, { localHour: 14 });
  assert('sync 200', sync1.status === 200, JSON.stringify(sync1.body).slice(0, 200));
  const byte1 = sync1.body?.byte || sync1.body;
  assert('needs object present', byte1?.needs && typeof byte1.needs === 'object');
  assert('lifespanStage on response', Boolean(byte1?.lifespanStage));
  assert('behaviorState on response', sync1.body?.behaviorState !== undefined);
  assert('ageDeathPending field exists', sync1.body?.ageDeathPending !== undefined);

  // [5] Decay tick — drop Hunger via dev/need, sync, confirm engine sane --
  head();
  console.log('[5] Decay tick — Hunger set to 30, sync, verify decay engine');
  const setHunger = await req('POST', `/api/byte/${byteId}/dev/need`, { need: 'Hunger', value: 30 });
  assert('dev/need set Hunger=30 (200)', setHunger.status === 200, JSON.stringify(setHunger.body));
  assert('Hunger==30 after dev set', setHunger.body?.value === 30);
  await new Promise((r) => setTimeout(r, 250));
  const sync2 = await req('POST', `/api/byte/${byteId}/sync`, { localHour: 14 });
  const hungerAfter = (sync2.body?.byte || sync2.body)?.needs?.Hunger;
  assert('Hunger present post-sync', typeof hungerAfter === 'number');
  assert('Hunger inside [0,30] band post-sync', hungerAfter >= 0 && hungerAfter <= 30, `got ${hungerAfter}`);

  // [6] Care: feed --------------------------------------------------------
  head();
  console.log('[6] Care action — feed (mealCycle bypass)');
  const feedRes = await req('PATCH', `/api/byte/${byteId}/care`, { action: 'feed', mealCycle: true, grade: 'good' });
  assert('care feed 200', feedRes.status === 200, JSON.stringify(feedRes.body).slice(0, 200));
  const hungerAfterFeed = feedRes.body?.byte?.needs?.Hunger ?? feedRes.body?.needs?.Hunger;
  assert('Hunger climbed after feed', typeof hungerAfterFeed === 'number' && hungerAfterFeed > hungerAfter, `before=${hungerAfter} after=${hungerAfterFeed}`);

  // [7] Lights toggle -----------------------------------------------------
  head();
  console.log('[7] Lights toggle off (localHour=23)');
  const lightsRes = await req('PATCH', `/api/byte/${byteId}/lights`, { lightsOn: false, localHour: 23 });
  assert('lights toggle 200', lightsRes.status === 200, JSON.stringify(lightsRes.body));
  assert('lightsOn=false in response', lightsRes.body?.lightsOn === false);
  assert('isSleeping field on response', lightsRes.body?.isSleeping !== undefined);

  // [8] Lifespan jumps: teen → elder, verify ageDeathPending --------------
  head();
  console.log('[8] Lifespan stage transitions');
  const teenRes = await req('POST', `/api/byte/${byteId}/dev/lifespan-stage`, { stage: 'teen' });
  assert('teen stage set', teenRes.body?.lifespanStage === 'teen', JSON.stringify(teenRes.body));
  const elderRes = await req('POST', `/api/byte/${byteId}/dev/lifespan-stage`, { stage: 'elder' });
  assert('elder stage set', elderRes.body?.lifespanStage === 'elder', JSON.stringify(elderRes.body));
  const sync3 = await req('POST', `/api/byte/${byteId}/sync`, { localHour: 14 });
  assert('sync at elder 200', sync3.status === 200);
  assert('elder lifespanStage on sync response', (sync3.body?.byte || sync3.body)?.lifespanStage === 'elder');

  // [9] Corruption set + clinic repair ------------------------------------
  head();
  console.log('[9] Corruption set 80 + clinic repair');
  const corRes = await req('POST', `/api/byte/${byteId}/dev/corruption`, { value: 80 });
  assert('dev corruption set to 80', corRes.body?.corruption === 80, JSON.stringify(corRes.body));
  const repairRes = await req('POST', `/api/byte/${byteId}/clinic-repair`);
  assert('clinic-repair 200', repairRes.status === 200, JSON.stringify(repairRes.body));
  const corAfter = repairRes.body?.byte?.corruption ?? repairRes.body?.corruption;
  assert('corruption dropped after repair', typeof corAfter === 'number' && corAfter < 80, `got ${corAfter}`);

  // [10] Death (cleanup) — forced oldage ----------------------------------
  head();
  console.log('[10] Forced old-age death (cleans up temp byte)');
  const dieRes = await req('POST', `/api/byte/${byteId}/die`, { force: true, deathType: 'oldage' });
  assert('die 200', dieRes.status === 200, JSON.stringify(dieRes.body).slice(0, 200));
  assert('legacyEgg returned', Boolean(dieRes.body?.legacyEgg?.id));

  // Summary --------------------------------------------------------------
  head();
  console.log(`${passed + failed} checks — ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('CARE-LOOP SMOKE: FAIL');
    process.exit(1);
  }
  console.log('CARE-LOOP SMOKE: PASS');
}

run().catch((err) => {
  console.error('SMOKE ERROR:', err.stack || err.message);
  process.exit(1);
});
