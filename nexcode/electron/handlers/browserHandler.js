import { app, BrowserWindow, ipcMain } from 'electron';
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
// Load saved Chrome path from settings (if any)
let chromeExecutablePath = '';
try {
  const userDataPath = app.getPath('userData');
  const settingsPath = path.join(userDataPath, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    chromeExecutablePath = saved?.appSettings?.chromePath || '';
  }
} catch (e) {
  console.warn('Failed to load chromePath from settings:', e);
}

const VIEWPORT = { width: 1280, height: 800 };
const FRAME_INTERVAL_MS = 1500;

let browser = null;
let context = null;
let page = null;
let frameTimer = null;
let lastFrame = '';
let currentState = {
  active: false,
  url: '',
  title: '',
  isLoading: false,
  error: ''
};

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function publicState(patch = {}) {
  currentState = { ...currentState, ...patch };
  return { ...currentState, hasFrame: Boolean(lastFrame) };
}

async function publishState(patch = {}) {
  if (page && !page.isClosed()) {
    currentState.url = page.url() === 'about:blank' ? '' : page.url();
    currentState.title = await page.title().catch(() => currentState.title || '');
  }
  const state = publicState(patch);
  sendToAll('browser:nav-changed', state);
  return state;
}

async function emitFrame() {
  if (!page || page.isClosed()) return null;
  try {
    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: 72,
      fullPage: false,
      animations: 'disabled'
    });
    lastFrame = buffer.toString('base64');
    sendToAll('browser:frame-update', {
      base64Image: lastFrame,
      url: page.url() === 'about:blank' ? '' : page.url(),
      title: await page.title().catch(() => '')
    });
    return lastFrame;
  } catch (error) {
    await publishState({ error: error.message || 'Unable to capture browser frame.' });
    return null;
  }
}

function startFrameLoop() {
  if (frameTimer) return;
  frameTimer = setInterval(() => {
    emitFrame().catch(() => {});
  }, FRAME_INTERVAL_MS);
  frameTimer.unref?.();
}

function stopFrameLoop() {
  if (frameTimer) {
    clearInterval(frameTimer);
    frameTimer = null;
  }
}

function normalizeUrl(value = '') {
  let trimmed = String(value || '').trim();
  if (!trimmed) throw new Error('URL is required.');

  // Auto-correct common mistake: gemini.com / gemini.com/login -> https://gemini.google.com/app
  if (/^https?:\/\/(www\.)?gemini\.com(\/.*)?$/i.test(trimmed) || /^gemini\.com(\/.*)?$/i.test(trimmed)) {
    return 'https://gemini.google.com/app';
  }

  if (/^(https?|file):\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

function cssEscape(value = '') {
  return String(value).replace(/["\\]/g, '\\$&');
}

async function ensurePage() {
  if (page && !page.isClosed()) return page;

  // Keep the managed browser profile with the application, not inside the
  // project currently open in NexCode. The old cwd-based profile polluted
  // project folders and could share browser state between unrelated projects.
  // Managed persistent browser profile path stored in user data directory
  const sessionDir = path.join(app.getPath('userData'), 'managed-browser-profile');
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch {}

  const launchOpts = {
    headless: false,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    args: [
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--test-type',
      '--disable-infobars'
    ]
  };

  try {
    const launchContextOpts = { ...launchOpts };
    if (chromeExecutablePath && fs.existsSync(chromeExecutablePath)) {
      launchContextOpts.executablePath = chromeExecutablePath;
    }
    context = await chromium.launchPersistentContext(sessionDir, {
      ...launchContextOpts,
      ...(chromeExecutablePath ? {} : { channel: 'chrome' })
    });
  } catch (errChrome) {
    console.warn('[Browser Launch] System Chrome channel failed, falling back to installed Playwright Chromium:', errChrome.message);
    try {
      context = await chromium.launchPersistentContext(sessionDir, launchOpts);
    } catch (errPersistent) {
      console.warn('[Browser Launch] Persistent launch fallback:', errPersistent.message);
      browser = await chromium.launch({
        headless: false,
        args: ['--disable-gpu', '--no-sandbox', '--test-type', '--disable-infobars']
      });
      context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        ignoreHTTPSErrors: true
      });
    }
  }

  // Stealth anti-bot evasion: Mask webdriver signature to prevent AI web bans
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = window.chrome || { runtime: {} };
    } catch {}
  }).catch(() => {});

  page = context.pages().length ? context.pages()[0] : await context.newPage();
  if (page.url() === 'about:blank') {
    await page.goto('https://google.com', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  }
  currentState = publicState({ active: true, error: '' });



  page.on('domcontentloaded', () => {
    publishState({ isLoading: false }).then(() => emitFrame()).catch(() => {});
  });
  page.on('load', () => {
    publishState({ isLoading: false }).then(() => emitFrame()).catch(() => {});
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      publishState({ url: page.url() === 'about:blank' ? '' : page.url() }).catch(() => {});
    }
  });
  page.on('close', () => {
    page = null;
    publicState({ active: false, isLoading: false });
    sendToAll('browser:nav-changed', publicState());
  });

  startFrameLoop();
  await publishState({ active: true, isLoading: false, error: '' });
  await emitFrame();
  return page;
}

async function withLoading(fn) {
  await ensurePage();
  await publishState({ isLoading: true, error: '' });
  try {
    const result = await fn(page);
    await publishState({ isLoading: false, error: '' });
    await emitFrame();
    return result;
  } catch (error) {
    await publishState({ isLoading: false, error: error.message || 'Browser action failed.' });
    await emitFrame();
    throw error;
  }
}

async function resolveLocator(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Selector or element id is required.');
  const pageRef = await ensurePage();
  const byNexCodeId = pageRef.locator(`[data-nexcode-browser-id="${cssEscape(raw)}"]`);
  if (await byNexCodeId.count().catch(() => 0)) return byNexCodeId.first();

  const byDomId = pageRef.locator(`#${cssEscape(raw)}`);
  if (await byDomId.count().catch(() => 0)) return byDomId.first();

  return pageRef.locator(raw).first();
}

export async function browserStart() {
  await ensurePage();
  return { ...publicState(), base64Image: lastFrame };
}

export async function browserStop() {
  stopFrameLoop();
  const oldPage = page;
  const oldContext = context;
  page = null;
  context = null;
  browser = null;
  lastFrame = '';
  await oldPage?.close().catch(() => {});
  await oldContext?.close().catch(() => {});
  const state = publicState({ active: false, url: '', title: '', isLoading: false, error: '' });
  sendToAll('browser:nav-changed', state);
  sendToAll('browser:frame-update', { base64Image: '', url: '', title: '' });
  return state;
}

export async function browserNavigate(url) {
  const normalized = normalizeUrl(url);
  await withLoading(async (pageRef) => {
    await pageRef.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 45000 });
  });
  return { ...publicState(), dom: await browserGetDOM() };
}

export async function browserBack() {
  await withLoading((pageRef) => pageRef.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }));
  return { ...publicState(), dom: await browserGetDOM() };
}

export async function browserForward() {
  await withLoading((pageRef) => pageRef.goForward({ waitUntil: 'domcontentloaded', timeout: 30000 }));
  return { ...publicState(), dom: await browserGetDOM() };
}

export async function browserReload() {
  await withLoading((pageRef) => pageRef.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }));
  return { ...publicState(), dom: await browserGetDOM() };
}

export async function browserClick(selector) {
  await ensurePage();
  const locator = await resolveLocator(selector);
  await withLoading(async () => {
    await locator.hover({ timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 250) + 150));
    await locator.click({ timeout: 15000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  });
  return { ...publicState(), dom: await browserGetDOM() };
}

export async function browserType(selector, text = '') {
  await ensurePage();
  const locator = await resolveLocator(selector);
  await withLoading(async () => {
    await locator.focus().catch(() => {});
    await locator.click().catch(() => {});
    const content = String(text || '');
    for (const char of content) {
      const delay = Math.floor(Math.random() * (40 - 15 + 1)) + 15;
      await page.keyboard.type(char, { delay });
    }
    await new Promise((r) => setTimeout(r, 600));

    // If typing into a web AI chat box (Gemini / ChatGPT), press Enter to submit chat
    const isChatWeb = /gemini\.google\.com|chatgpt\.com/i.test(page.url());
    if (isChatWeb) {
      const sendBtn = await page.$('button[aria-label*="Send"], button.send-button, [data-testid="send-button"]').catch(() => null);
      if (sendBtn) {
        await sendBtn.click().catch(() => page.keyboard.press('Enter'));
      } else {
        await page.keyboard.press('Enter').catch(() => {});
      }
      await page.waitForTimeout(4000);
    }
  });
  return { ...publicState(), dom: await browserGetDOM() };
}


export async function browserGetDOM() {
  const pageRef = await ensurePage();
  const snapshot = await pageRef.evaluate(() => {
    const MAX_TEXT_LINES = 80;
    const MAX_INTERACTIVE = 80;
    const MAX_HEADINGS = 30;
    const MAX_TEXT_LENGTH = 160;
    let counter = 0;

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity || 1) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function compact(value = '', limit = MAX_TEXT_LENGTH) {
      return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
    }

    function elementLabel(element) {
      const aria = element.getAttribute('aria-label');
      const title = element.getAttribute('title');
      const placeholder = element.getAttribute('placeholder');
      const value = element.value;
      return compact(aria || title || placeholder || value || element.innerText || element.textContent || element.getAttribute('href') || element.tagName);
    }

    function ensureId(element) {
      if (!element.dataset.nexcodeBrowserId) {
        counter += 1;
        element.dataset.nexcodeBrowserId = `b${counter}`;
      }
      return element.dataset.nexcodeBrowserId;
    }

    const headings = [...document.querySelectorAll('h1,h2,h3')]
      .filter(isVisible)
      .slice(0, MAX_HEADINGS)
      .map((element) => `${element.tagName.toLowerCase()}: ${compact(element.innerText || element.textContent)}`)
      .filter((line) => !line.endsWith(': '));

    const interactive = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]')]
      .filter(isVisible)
      .slice(0, MAX_INTERACTIVE)
      .map((element) => {
        const tag = element.tagName.toLowerCase();
        const id = ensureId(element);
        const type = element.getAttribute('type');
        const href = element.getAttribute('href');
        const role =
          tag === 'a' ? 'Link' :
          tag === 'button' || element.getAttribute('role') === 'button' ? 'Button' :
          tag === 'select' ? 'Select' :
          tag === 'textarea' ? 'Textarea' :
          tag === 'input' ? `Input${type ? `:${type}` : ''}` :
          'Element';
        const parts = [`[${role}: ${elementLabel(element) || id}]`, `(id: ${id})`];
        if (element.id) parts.push(`(dom_id: ${element.id})`);
        if (href) parts.push(`(href: ${href})`);
        return parts.join(' ');
      });

    const visibleText = compact(document.body?.innerText || '', 12000)
      .split(/(?<=[.!?])\s+|\n+/)
      .map((line) => compact(line, 220))
      .filter(Boolean)
      .slice(0, MAX_TEXT_LINES);

    return {
      url: location.href,
      title: document.title,
      headings,
      interactive,
      visibleText
    };
  });

  const lines = [
    `URL: ${snapshot.url}`,
    `Title: ${snapshot.title || '(untitled)'}`,
    '',
    'Headings:',
    ...(snapshot.headings.length ? snapshot.headings.map((line) => `- ${line}`) : ['- None found']),
    '',
    'Interactive elements:',
    ...(snapshot.interactive.length ? snapshot.interactive.map((line) => `- ${line}`) : ['- None found']),
    '',
    'Visible text:',
    ...(snapshot.visibleText.length ? snapshot.visibleText.map((line) => `- ${line}`) : ['- None found'])
  ];
  await publishState({ url: snapshot.url, title: snapshot.title || '' });
  await emitFrame();
  return lines.join('\n');
}

export async function browserGetScreenshot() {
  await ensurePage();
  return lastFrame || await emitFrame();
}

export async function browserGetState() {
  if (page && !page.isClosed()) {
    await publishState();
  }
  return { ...publicState(), base64Image: lastFrame };
}

export async function browserExecuteWebAiChat({ url = 'https://gemini.google.com/app', prompt = '' } = {}) {
  const targetUrl = normalizeUrl(url);
  const pageRef = await ensurePage();

  await withLoading(async () => {
    if (!pageRef.url() || !pageRef.url().includes('gemini.google.com')) {
      await pageRef.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await pageRef.waitForTimeout(3000);
    }

    const inputSelector = 'div[contenteditable="true"], rich-textarea div[role="textbox"], textarea';
    const inputLoc = pageRef.locator(inputSelector).first();
    await inputLoc.waitFor({ state: 'visible', timeout: 15000 });
    await inputLoc.click();
    await pageRef.waitForTimeout(300);

    // Stealth human-like typing
    const text = String(prompt || '').trim();
    for (const char of text) {
      const delay = Math.floor(Math.random() * (40 - 12 + 1)) + 12;
      await pageRef.keyboard.type(char, { delay });
    }
    await pageRef.waitForTimeout(800);

    // Locate and click real Send button or press Enter
    const sendBtn = await pageRef.$('button[aria-label*="Send"], button.send-button, [data-testid="send-button"]').catch(() => null);
    if (sendBtn) {
      await sendBtn.click().catch(() => pageRef.keyboard.press('Enter'));
    } else {
      await pageRef.keyboard.press('Enter');
    }

    // Wait for streaming response to finish on screen
    let lastLen = 0;
    let stableCount = 0;
    for (let i = 0; i < 20; i++) {
      await pageRef.waitForTimeout(1500);
      const currentLen = await pageRef.evaluate(() => document.body.innerText.length).catch(() => 0);
      if (currentLen > 0 && currentLen === lastLen) {
        stableCount++;
        if (stableCount >= 2) break; // response finished streaming!
      } else {
        stableCount = 0;
        lastLen = currentLen;
      }
    }
  });

  // Extract generated code blocks and response
  const extracted = await pageRef.evaluate(() => {
    const codeBlocks = Array.from(document.querySelectorAll('pre code, pre, .code-block'))
      .map((el) => el.innerText.trim())
      .filter((t) => t.length > 20);

    const responses = Array.from(document.querySelectorAll('message-content, .model-response-text, [data-test-id="model-response"]'))
      .map((el) => el.innerText.trim())
      .filter(Boolean);

    return {
      title: document.title,
      url: window.location.href,
      fullText: responses[responses.length - 1] || document.body.innerText.slice(0, 2000),
      codeBlocks
    };
  });

  return { ...publicState(), ...extracted };
}

export async function stopBrowserSession() {
  await browserStop().catch(() => {});
}

export function registerBrowserHandlers() {
  ipcMain.handle('browser:start', async () => browserStart());
  ipcMain.handle('browser:stop', async () => browserStop());
  ipcMain.handle('browser:state', async () => browserGetState());
  ipcMain.handle('browser:navigate', async (_event, payload = {}) => browserNavigate(payload.url));
  ipcMain.handle('browser:back', async () => browserBack());
  ipcMain.handle('browser:forward', async () => browserForward());
  ipcMain.handle('browser:reload', async () => browserReload());
  ipcMain.handle('browser:click', async (_event, payload = {}) => browserClick(payload.selector || payload.element_id_or_selector));
  ipcMain.handle('browser:type', async (_event, payload = {}) => browserType(payload.selector || payload.element_id_or_selector, payload.text || ''));
  ipcMain.handle('browser:execute-web-ai', async (_event, payload = {}) => browserExecuteWebAiChat(payload));
  ipcMain.handle('browser:get-dom', async () => browserGetDOM());
  ipcMain.handle('browser:get-screenshot', async () => browserGetScreenshot());
}

process.once('exit', () => {
  stopFrameLoop();
});
