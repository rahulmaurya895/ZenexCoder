import { BrowserWindow, ipcMain } from 'electron';
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import path from 'node:path';
import { compareOrCreateGolden } from './visualDiffEngine.js';
import { runShadowSwarmForResult } from './swarmHandler.js';
import { normalizeScenario } from '../../src/utils/scenarioParser.js';

let activeAgent = null;

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function emitLog(runId, step, message, level = 'info') {
  sendToAll('qa:stream-logs', { runId, step, message, level, time: Date.now() });
}

function isSafeUrl(url, allowProduction) {
  if (allowProduction) return true;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return (
    ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host) ||
    host.endsWith('.local') ||
    /(^|\.)((staging)|(stage)|(dev)|(test)|(preview))\./i.test(host) ||
    /(staging|stage|dev|test|preview)/i.test(host)
  );
}

function resolveUrl(step, scenario) {
  if (!step.url) return scenario.baseUrl || '';
  if (/^https?:\/\//i.test(step.url)) return step.url;
  if (!scenario.baseUrl) return step.url;
  return new URL(step.url, scenario.baseUrl).toString();
}

async function domSnapshot(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[data-testid],[aria-label]')].slice(0, 120);
    return nodes.map((element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || '',
      testid: element.getAttribute('data-testid') || '',
      aria: element.getAttribute('aria-label') || '',
      text: (element.innerText || element.value || element.placeholder || '').trim().slice(0, 120),
      classes: String(element.className || '').split(/\s+/).slice(0, 4).join('.')
    }));
  });
}

function heuristicSelector(snapshot = [], failedSelector = '') {
  const wanted = failedSelector.replace(/[#.]/g, '').toLowerCase();
  const match = snapshot.find((item) =>
    item.id.toLowerCase() === wanted ||
    item.testid.toLowerCase() === wanted ||
    item.aria.toLowerCase().includes(wanted) ||
    item.text.toLowerCase().includes(wanted)
  );
  if (!match) return '';
  if (match.testid) return `[data-testid="${match.testid}"]`;
  if (match.id) return `#${cssEscape(match.id)}`;
  if (match.aria) return `[aria-label="${match.aria.replaceAll('"', '\\"')}"]`;
  if (match.text && ['button', 'a'].includes(match.tag)) return `${match.tag}:has-text("${match.text.replaceAll('"', '\\"')}")`;
  return '';
}

function cssEscape(value = '') {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

async function healSelector(page, step, scenario, runId) {
  const snapshot = await domSnapshot(page);
  emitLog(runId, step.id, 'Selector failed; sending DOM snapshot to Swarm for self-healing.', 'warning');
  try {
    const result = await runShadowSwarmForResult({
      prompt: `A Playwright selector failed. Return JSON like {"selector":"..."} with the best replacement selector.\nFailed selector: ${step.selector}\nStep: ${JSON.stringify(step)}\nDOM snapshot: ${JSON.stringify(snapshot).slice(0, 12000)}`,
      projectPath: scenario.projectPath,
      provider: 'ollama',
      modelId: 'llama3.2:3b',
      maxTurns: 1
    }, { timeoutMs: 45000 });
    const text = JSON.stringify(result);
    const match = text.match(/"selector"\s*:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  } catch (error) {
    emitLog(runId, step.id, `Swarm selector repair unavailable: ${error.message}`, 'warning');
  }
  return heuristicSelector(snapshot, step.selector);
}

async function waitForSelectorWithHealing(page, step, scenario, runId) {
  try {
    await page.waitForSelector(step.selector, { timeout: step.timeoutMs || 15000, state: 'visible' });
    return step.selector;
  } catch (error) {
    const healed = await healSelector(page, step, scenario, runId);
    if (!healed) throw error;
    await page.waitForSelector(healed, { timeout: step.timeoutMs || 15000, state: 'visible' });
    emitLog(runId, step.id, `Self-healed selector ${step.selector} -> ${healed}.`);
    step.selector = healed;
    return healed;
  }
}

async function runChaos(page, runId) {
  const buttons = await page.locator('button,a,[role="button"]').all().catch(() => []);
  for (const button of buttons.slice(0, 3)) {
    if (activeAgent?.aborted) return;
    if (await button.isVisible().catch(() => false)) {
      await button.hover({ timeout: 2000 }).catch(() => {});
      emitLog(runId, 'chaos', 'Chaos Monkey hovered an interactive element.');
    }
  }
}

async function executeStep(page, step, scenario, runId) {
  if (activeAgent?.aborted) throw new Error('Synthetic QA stopped.');
  if (step.action === 'navigate') {
    const url = resolveUrl(step, scenario);
    if (!isSafeUrl(url, scenario.allowProduction)) {
      throw new Error(`Production-like URL blocked without approval: ${url}`);
    }
    emitLog(runId, step.id, `Navigate ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: step.timeoutMs || 45000 });
    return { ok: true };
  }
  if (step.action === 'click') {
    const selector = await waitForSelectorWithHealing(page, step, scenario, runId);
    emitLog(runId, step.id, `Click ${selector}`);
    await page.locator(selector).first().click({ timeout: step.timeoutMs || 15000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    return { ok: true };
  }
  if (step.action === 'type') {
    const selector = await waitForSelectorWithHealing(page, step, scenario, runId);
    emitLog(runId, step.id, `Type into ${selector}`);
    await page.locator(selector).first().fill(step.text || '', { timeout: step.timeoutMs || 15000 });
    return { ok: true };
  }
  if (step.action === 'waitForSelector') {
    const selector = await waitForSelectorWithHealing(page, step, scenario, runId);
    emitLog(runId, step.id, `Visible ${selector}`);
    return { ok: true };
  }
  if (step.action === 'verifyText') {
    emitLog(runId, step.id, `Verify text "${step.text}"`);
    await page.getByText(step.text, { exact: false }).first().waitFor({ timeout: step.timeoutMs || 15000 });
    return { ok: true };
  }
  if (step.action === 'screenshot') {
    const buffer = await page.screenshot({ type: 'png', fullPage: true, animations: 'disabled' });
    const diff = await compareOrCreateGolden({
      projectPath: scenario.projectPath || process.cwd(),
      name: step.name || step.id,
      imageBuffer: buffer
    });
    const payload = {
      runId,
      name: step.name || step.id,
      base64Image: buffer.toString('base64'),
      diff,
      time: Date.now()
    };
    sendToAll('qa:screenshot-capture', payload);
    emitLog(runId, step.id, `Screenshot ${diff.status}${diff.changed ? ` (${(diff.mismatchRatio * 100).toFixed(2)}% mismatch)` : ''}`);
    return { ok: !diff.changed, diff };
  }
  emitLog(runId, step.id, `Note: ${step.text || step.action}`);
  return { ok: true };
}

export async function runSyntheticScenario(payload = {}) {
  if (activeAgent) throw new Error('A Synthetic QA agent is already running.');
  const scenario = normalizeScenario(payload);
  if (!scenario.steps.length) throw new Error('Scenario has no executable steps.');
  const runId = crypto.randomUUID();
  let browser;
  let context;
  let page;
  activeAgent = { runId, aborted: false };
  const results = [];
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--no-sandbox'] });
    context = await browser.newContext({ viewport: { width: 1366, height: 860 }, ignoreHTTPSErrors: true });
    page = await context.newPage();
    activeAgent.browser = browser;
    emitLog(runId, 'start', `Running ${scenario.name} as ${scenario.persona}.`);
    for (const step of scenario.steps) {
      try {
        const result = await executeStep(page, step, scenario, runId);
        results.push({ step, ...result });
      } catch (error) {
        emitLog(runId, step.id, error.message, 'error');
        results.push({ step, ok: false, error: error.message });
        break;
      }
    }
    if (scenario.persona === 'chaos' && !activeAgent.aborted) {
      await runChaos(page, runId);
    }
    const passed = results.filter((item) => item.ok).length;
    const final = {
      ok: passed === scenario.steps.length,
      runId,
      total: scenario.steps.length,
      passed,
      failed: scenario.steps.length - passed,
      results,
      completedAt: Date.now()
    };
    sendToAll('qa:result-final', final);
    return final;
  } finally {
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    activeAgent = null;
  }
}

export async function stopSyntheticAgent() {
  if (!activeAgent) return { ok: true, stopped: false };
  activeAgent.aborted = true;
  await activeAgent.browser?.close().catch(() => {});
  return { ok: true, stopped: true };
}

export function registerQaHandlers() {
  ipcMain.handle('qa:run-scenario', async (_event, payload = {}) => runSyntheticScenario(payload));
  ipcMain.handle('qa:get-state', async () => ({ active: Boolean(activeAgent), runId: activeAgent?.runId || '' }));
  ipcMain.handle('qa:stop', async () => stopSyntheticAgent());
}
