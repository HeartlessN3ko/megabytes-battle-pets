/* eslint-disable no-console */
/**
 * LIFECYCLE SMOKE TEST — death → legacy egg pipeline
 *
 * Creates a temporary non-dev byte, triggers forced death, verifies:
 *   1. Byte is marked dead (isAlive: false)
 *   2. Generation record created with correct legacy fields
 *   3. Legacy egg created with inheritedMove and generation bump
 *   4. Missingno (isDevByte) correctly refuses death
 *
 * Requires backend running at BASE_URL.
 */

const BASE_URL = (process.env.API_BASE_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const PLAYER_ID = process.env.PLAYER_ID || '69d88aea8708c93a264e50f0';
const MISSINGNO_BYTE_ID = process.env.BYTE_ID || '69d88d94770f0c774e9f4808';

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
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function run() {
  console.log('Lifecycle smoke target:', BASE_URL);

  // --- 1. Health check ---
  const health = await req('GET', '/health');
  assert('backend reachable', health.status === 200);

  // --- 2. Reset demo to get clean state and set isDevByte on Missingno ---
  console.log('\n[0] Reset demo (sets isDevByte on Missingno, clears slots)');
  const reset = await req('POST', `/api/player/${PLAYER_ID}/reset-demo`, { byteId: MISSINGNO_BYTE_ID });
  assert('reset-demo succeeds', reset.status === 200, JSON.stringify(reset.body));

  // --- 3. Verify Missingno has isDevByte set ---
  const missingnoCheck = await req('GET', `/api/byte/${MISSINGNO_BYTE_ID}`);
  assert('Missingno byte exists', missingnoCheck.status === 200, JSON.stringify(missingnoCheck.body));
  assert('Missingno has isDevByte', missingnoCheck.body?.byte?.isDevByte === true, `isDevByte=${missingnoCheck.body?.byte?.isDevByte}`);

  // --- 4. Missingno refuses death ---
  console.log('\n[1] isDevByte death guard');
  const devDie = await req('POST', `/api/byte/${MISSINGNO_BYTE_ID}/die`, { force: true });
  assert(
    'Missingno returns 403',
    devDie.status === 403,
    `got ${devDie.status}: ${JSON.stringify(devDie.body)}`
  );

  // --- 5. Create a temporary non-dev byte for lifecycle test ---
  console.log('\n[2] Create temp byte for lifecycle test');
  const createRes = await req('POST', '/api/byte', { playerId: PLAYER_ID });
  assert('temp byte created', createRes.status === 201, JSON.stringify(createRes.body));
  const tempByteId = createRes.body?._id;
  if (!tempByteId) {
    console.error('Cannot continue — temp byte creation failed.');
    process.exit(1);
  }

  // Give it a move and ult so legacy fields are populated
  await req('PATCH', `/api/byte/${tempByteId}`, {
    equippedMoves: ['basic_ping.py'],
  });

  // --- 4. Trigger forced death ---
  console.log('\n[3] Force death → legacy egg');
  const dieRes = await req('POST', `/api/byte/${tempByteId}/die`, { force: true });
  assert(
    'death endpoint returns 200',
    dieRes.status === 200,
    JSON.stringify(dieRes.body)
  );

  const { died, generationRecord, legacyEgg } = dieRes.body || {};
  assert('died field matches byte id', String(died) === String(tempByteId));
  assert('generationRecord id returned', Boolean(generationRecord));
  assert('legacyEgg id returned', Boolean(legacyEgg?.id));
  assert('legacyEgg has inheritedMove', Boolean(legacyEgg?.inheritedMove));
  assert('legacyEgg generation is 2', legacyEgg?.generation === 2, `got ${legacyEgg?.generation}`);

  // --- 5. Verify dead byte state ---
  console.log('\n[4] Verify dead byte state in DB');
  const deadByte = await req('GET', `/api/byte/${tempByteId}`);
  // 404 or isAlive=false are both acceptable outcomes
  const isDeadOrGone = deadByte.status === 404 || deadByte.body?.byte?.isAlive === false;
  assert('dead byte is no longer alive', isDeadOrGone, `status ${deadByte.status}, isAlive: ${deadByte.body?.byte?.isAlive}`);

  // --- 6. Verify legacy egg fetchable ---
  console.log('\n[5] Verify legacy egg byte');
  const eggRes = await req('GET', `/api/byte/${legacyEgg.id}`);
  assert('legacy egg is fetchable', eggRes.status === 200, JSON.stringify(eggRes.body));
  assert('legacy egg isEgg=true', eggRes.body?.byte?.isEgg === true);
  assert('legacy egg inheritedMove matches', eggRes.body?.byte?.inheritedMove === legacyEgg.inheritedMove);

  // --- Summary ---
  console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('LIFECYCLE SMOKE: FAIL');
    process.exit(1);
  } else {
    console.log('LIFECYCLE SMOKE: PASS');
  }
}

run().catch((err) => {
  console.error('SMOKE ERROR:', err.message);
  process.exit(1);
});
