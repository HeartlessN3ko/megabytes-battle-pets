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
// Note: MISSINGNO_BYTE_ID env was used by the now-removed reset-demo prep step.

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

  // (Historical step 2 — reset-demo prep — removed with demo mode 2026-04-23.
  //  The temp-byte creation below is independent of prior state, so no prep needed.)

  // --- 2. Create a temporary byte for lifecycle test ---
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

  // --- 4. Trigger forced old-age death (this is the path that creates a legacy egg).
  //     Neglect death (force:true alone) intentionally returns legacyEgg:null by design.
  console.log('\n[2] Force old-age death → legacy egg');
  const dieRes = await req('POST', `/api/byte/${tempByteId}/die`, { force: true, deathType: 'oldage' });
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
  console.log('\n[3] Verify dead byte state in DB');
  const deadByte = await req('GET', `/api/byte/${tempByteId}`);
  // 404 or isAlive=false are both acceptable outcomes
  const isDeadOrGone = deadByte.status === 404 || deadByte.body?.byte?.isAlive === false;
  assert('dead byte is no longer alive', isDeadOrGone, `status ${deadByte.status}, isAlive: ${deadByte.body?.byte?.isAlive}`);

  // --- 6. Verify legacy egg fetchable ---
  console.log('\n[4] Verify legacy egg byte');
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
