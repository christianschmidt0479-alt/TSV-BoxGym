import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const baseURL = process.env.E2E_BASE_URL?.trim() || 'https://www.tsvboxgym.de';
const trainerEmail = process.env.E2E_TRAINER_EMAIL?.trim();
const trainerPassword = process.env.E2E_TRAINER_PASSWORD?.trim();
const outDir = '.tmp-live-check';
const harPath = `${outDir}/admin-to-sportler.har`;
const consolePath = `${outDir}/admin-to-sportler-console.json`;
const networkPath = `${outDir}/admin-to-sportler-network.json`;
const summaryPath = `${outDir}/admin-to-sportler-summary.json`;

if (!trainerEmail || !trainerPassword) {
  throw new Error('Missing E2E_TRAINER_EMAIL or E2E_TRAINER_PASSWORD');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL,
  recordHar: { path: harPath, mode: 'full', content: 'embed' },
});
const page = await context.newPage();

const consoleEvents = [];
const pageErrors = [];
const requests = [];
const responses = [];
const navigations = [];

page.on('console', async (msg) => {
  consoleEvents.push({
    type: msg.type(),
    text: msg.text(),
    location: msg.location(),
  });
});

page.on('pageerror', (error) => {
  pageErrors.push({ message: error.message, stack: error.stack || '' });
});

page.on('request', (request) => {
  requests.push({ method: request.method(), url: request.url(), resourceType: request.resourceType() });
});

page.on('response', async (response) => {
  responses.push({ status: response.status(), url: response.url() });
});

page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) {
    navigations.push(frame.url());
  }
});

let result;
try {
  await page.goto('/trainer-zugang', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('name@tsv-falkensee.de').fill(trainerEmail);
  await page.getByPlaceholder('Passwort eingeben').fill(trainerPassword);
  await page.getByRole('button', { name: 'Entsperren' }).click();
  await page.waitForURL(/\/(trainer|verwaltung)(\/.*)?$/, { timeout: 20000 });

  await page.getByRole('link', { name: 'Sportler' }).click();
  await page.waitForURL(/\/mein-bereich\/profil(\/.*)?$/, { timeout: 20000 });
  await page.getByRole('heading', { name: 'Sportlerprofil' }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const finalUrl = page.url();
  const profileVisible = await page.getByRole('heading', { name: 'Sportlerprofil' }).isVisible().catch(() => false);
  const profileLoads = navigations.filter((url) => /\/mein-bereich\/profil(\/.*)?$/.test(url)).length;
  const fallbackLoads = navigations.filter((url) => /\/mein-bereich(\?.*)?$/.test(url)).length;

  result = {
    ok: /\/mein-bereich\/profil(\/.*)?$/.test(finalUrl) && profileVisible && fallbackLoads <= 1,
    finalUrl,
    profileVisible,
    profileLoads,
    fallbackLoads,
    navigations,
  };
} catch (error) {
  result = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    finalUrl: page.url(),
    navigations,
  };
} finally {
  await fs.writeFile(consolePath, JSON.stringify({ consoleEvents, pageErrors }, null, 2));
  await fs.writeFile(networkPath, JSON.stringify({
    requests,
    responses: responses.filter((entry) => /\/mein-bereich|\/trainer-zugang|\/api\/public\/member-area|\/api\/trainer-session/.test(entry.url)),
  }, null, 2));
  await fs.writeFile(summaryPath, JSON.stringify(result, null, 2));
  await context.close();
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
