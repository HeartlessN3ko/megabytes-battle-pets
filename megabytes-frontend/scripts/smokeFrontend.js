/* eslint-disable no-console */
const http = require('node:http');
const { chromium } = require('playwright');

const PORT = Number(process.env.FRONTEND_SMOKE_PORT || 19007);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SERVER_WAIT_TIMEOUT_MS = 120000;
const UI_STEP_TIMEOUT_MS = 25000;

const steps = [];

function record(ok, step, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  steps.push({ ok, step, detail });
  console.log(`[${status}] ${step}${detail ? ` - ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForHttpReady(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 500;
        res.resume();
        if (ok) {
          resolve();
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url} (status: ${res.statusCode})`));
          return;
        }
        setTimeout(tick, 1000);
      });

      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(tick, 1000);
      });
    };

    tick();
  });
}

async function clickByText(page, text, timeoutMs = UI_STEP_TIMEOUT_MS, exact = false) {
  const locator = await findVisibleByText(page, text, timeoutMs, exact);
  await locator.click({ timeout: timeoutMs });
}

async function findVisibleByText(page, text, timeoutMs = UI_STEP_TIMEOUT_MS, exact = false) {
  const locator = page.getByText(text, { exact });
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
      const candidate = locator.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for visible text: ${text}`);
}

async function waitForAnyText(page, texts, timeoutMs = UI_STEP_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const text of texts) {
      if (await page.getByText(text, { exact: false }).first().isVisible().catch(() => false)) {
        return text;
      }
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for one of: ${texts.join(', ')}`);
}

async function runUiSmoke() {
  let browser;

  try {
    await waitForHttpReady(BASE_URL, SERVER_WAIT_TIMEOUT_MS);
    record(true, 'Expo web server ready', BASE_URL);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(UI_STEP_TIMEOUT_MS);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    record(true, 'Opened app shell', BASE_URL);

    await waitForAnyText(page, ['PRESS START', 'SYNCING...'], 45000);
    const pressStartVisible = await page.getByText('PRESS START', { exact: false }).first().isVisible().catch(() => false);
    if (!pressStartVisible) {
      await findVisibleByText(page, 'PRESS START', 45000);
    }
    await clickByText(page, 'PRESS START', 45000);
    record(true, 'Tapped start', 'Entered gameplay flow');

    const landing = await waitForAnyText(page, ['INCUBATION', 'SWIPE UP FOR ROOMS', 'INVENTORY', 'ENABLE DEMO MODE'], 30000);
    if (landing === 'INCUBATION') {
      record(true, 'Detected egg flow', 'Running hatch taps');
      const hatchStart = Date.now();
      while (Date.now() - hatchStart < 40000) {
        const homeSeen =
          (await page.getByText('SWIPE UP FOR ROOMS', { exact: false }).first().isVisible().catch(() => false)) ||
          (await page.getByText('INVENTORY', { exact: false }).first().isVisible().catch(() => false)) ||
          (await page.getByText('ENABLE DEMO MODE', { exact: false }).first().isVisible().catch(() => false));
        if (homeSeen) break;

        const nutrientsVisible = await page.getByText('NUTRIENTS', { exact: false }).first().isVisible().catch(() => false);
        if (nutrientsVisible) {
          await clickByText(page, 'NUTRIENTS');
        }
        const cleanVisible = await page.getByText('CLEAN', { exact: false }).first().isVisible().catch(() => false);
        if (cleanVisible) {
          await clickByText(page, 'CLEAN');
        }
        await sleep(450);
      }
      await waitForAnyText(page, ['SWIPE UP FOR ROOMS', 'INVENTORY', 'ENABLE DEMO MODE'], 30000);
      record(true, 'Egg flow advanced', 'Reached home/tabs');
    } else {
      record(true, 'Detected direct tabs flow', landing);
    }

    await clickByText(page, 'INVENTORY');
    await findVisibleByText(page, 'INVENTORY');
    record(true, 'Opened inventory', 'Home action route works');

    await clickByText(page, 'Home', UI_STEP_TIMEOUT_MS, true);
    await findVisibleByText(page, 'SWIPE UP FOR ROOMS');
    record(true, 'Returned to home tab', 'Tab bar navigation works');

    const demoActiveVisible = await page.getByText('DEMO ACTIVE', { exact: false }).first().isVisible().catch(() => false);
    if (!demoActiveVisible) {
      await clickByText(page, 'ENABLE DEMO MODE');
      await findVisibleByText(page, 'DEMO ACTIVE');
      record(true, 'Enabled demo mode', 'Demo profile toggle works');
    } else {
      record(true, 'Demo mode already enabled', 'Persistent demo session restored');
    }

    await clickByText(page, 'SWIPE UP FOR ROOMS');
    await findVisibleByText(page, 'ROOM NAVIGATION');
    await clickByText(page, 'TRAINING');
    await findVisibleByText(page, 'TRAINING CENTER');
    record(true, 'Opened room from drawer', 'Room navigation works');

    await clickByText(page, 'TRAINING BATTLE');
    await findVisibleByText(page, 'Fireball');
    await clickByText(page, 'Tackle');
    record(true, 'Opened battle from training room', 'Training battle access works');

    await clickByText(page, 'Home', UI_STEP_TIMEOUT_MS, true);
    await findVisibleByText(page, 'SWIPE UP FOR ROOMS');
    record(true, 'Returned home from battle', 'Hidden battle route returns cleanly');

    await clickByText(page, 'Cash', UI_STEP_TIMEOUT_MS, true);
    await findVisibleByText(page, 'REAL MONEY SHOP');
    record(true, 'Opened cash shop tab', 'Cash route works');

    await clickByText(page, 'Story', UI_STEP_TIMEOUT_MS, true);
    await findVisibleByText(page, 'STORY MODE');
    record(true, 'Opened story tab', 'Story placeholder renders');

    await clickByText(page, 'Arena', UI_STEP_TIMEOUT_MS, true);
    await findVisibleByText(page, 'ARENA');
    record(true, 'Opened arena tab', 'Arena placeholder renders');

    await clickByText(page, 'Leaders', UI_STEP_TIMEOUT_MS, true);
    await findVisibleByText(page, 'LEADERBOARDS');
    record(true, 'Opened leaders tab', 'Leaderboards placeholder renders');

    await clickByText(page, 'Home', UI_STEP_TIMEOUT_MS, true);
    await clickByText(page, 'PROFILE');
    await findVisibleByText(page, 'PROFILE');
    record(true, 'Opened profile route', 'Top utility profile works');

    await clickByText(page, 'Home', UI_STEP_TIMEOUT_MS, true);
    await clickByText(page, 'INBOX');
    await findVisibleByText(page, 'INBOX');
    record(true, 'Opened inbox route', 'Top utility inbox works');
  } catch (err) {
    record(false, 'Frontend smoke failed', err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function main() {
  try {
    await runUiSmoke();
  } catch {
    // Summary block still prints below.
  }

  const passCount = steps.filter((x) => x.ok).length;
  const failCount = steps.length - passCount;
  console.log('\n=== FRONTEND UI SMOKE SUMMARY ===');
  steps.forEach((s, i) => {
    const marker = s.ok ? 'PASS' : 'FAIL';
    console.log(`${String(i + 1).padStart(2, '0')}. [${marker}] ${s.step}${s.detail ? ` - ${s.detail}` : ''}`);
  });
  console.log(`Result: ${passCount} passed, ${failCount} failed`);

  process.exit(failCount > 0 ? 1 : 0);
}

main();
