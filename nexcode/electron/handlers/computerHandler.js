import { BrowserWindow, desktopCapturer, ipcMain, screen as electronScreen } from 'electron';
import nut, { Button, Key, Point } from '@nut-tree-fork/nut-js';

const { keyboard, mouse } = nut;

const state = {
  enabled: false,
  locked: true,
  allowUnattended: false,
  activeSession: false
};

const logs = [];
const MAX_LOGS = 200;

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function publicState() {
  return { ...state, logs: [...logs] };
}

function publishState() {
  sendToAll('computer:state-changed', publicState());
}

function logAction(type, details = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    details,
    timestamp: Date.now()
  };
  logs.push(entry);
  while (logs.length > MAX_LOGS) logs.shift();
  sendToAll('computer:action-logged', entry);
  publishState();
  return entry;
}

function ensureEnabled() {
  if (!state.enabled) {
    throw new Error('Computer Use is disabled. Enable it in the Computer Use panel first.');
  }
}

function ensureUnlocked() {
  ensureEnabled();
  if (state.locked) {
    throw new Error('Computer Use is locked. Unlock it in the Computer Use panel first.');
  }
}

function normalizeButton(button = 'left') {
  const value = String(button || 'left').toLowerCase();
  if (value === 'right') return Button.RIGHT;
  if (value === 'middle') return Button.MIDDLE;
  return Button.LEFT;
}

function keyName(value = '') {
  const aliases = {
    ctrl: 'LeftControl',
    control: 'LeftControl',
    cmd: 'LeftCmd',
    command: 'LeftCmd',
    win: 'LeftWin',
    windows: 'LeftWin',
    meta: 'LeftMeta',
    alt: 'LeftAlt',
    shift: 'LeftShift',
    enter: 'Enter',
    return: 'Return',
    esc: 'Escape',
    escape: 'Escape',
    space: 'Space',
    tab: 'Tab',
    backspace: 'Backspace',
    delete: 'Delete',
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right'
  };
  const raw = String(value || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  if (/^[a-z]$/i.test(raw)) return raw.toUpperCase();
  if (/^[0-9]$/.test(raw)) return `Num${raw}`;
  return raw;
}

function normalizeKeys(keys = []) {
  return (Array.isArray(keys) ? keys : [])
    .map(keyName)
    .map((name) => Key[name])
    .filter((value) => typeof value === 'number');
}

export function computerGetStatus() {
  return publicState();
}

export function computerIsEnabled() {
  return state.enabled;
}

export function computerAllowsUnattended() {
  return state.allowUnattended;
}

export async function computerSetEnabled(enabled) {
  state.enabled = Boolean(enabled);
  if (!state.enabled) {
    state.locked = true;
    state.allowUnattended = false;
  }
  state.activeSession = state.enabled && !state.locked;
  logAction(state.enabled ? 'enabled' : 'disabled', {});
  return publicState();
}

export async function computerSetUnattended(allowUnattended) {
  const desired = Boolean(allowUnattended);
  if (desired) {
    ensureUnlocked();
  }
  state.allowUnattended = desired;
  logAction('unattended', { allowUnattended: state.allowUnattended });
  return publicState();
}

export async function computerUnlock() {
  ensureEnabled();
  state.locked = false;
  state.activeSession = true;
  logAction('unlocked', {});
  return publicState();
}

export async function computerLock(reason = 'manual') {
  state.locked = true;
  state.allowUnattended = false;
  state.activeSession = false;
  logAction('locked', { reason });
  sendToAll('computer:emergency-stop', { reason, timestamp: Date.now() });
  return publicState();
}

export async function computerGetScreen() {
  ensureUnlocked();
  const display = electronScreen.getPrimaryDisplay();
  const { width, height } = display.size;
  const scale = Math.min(1, 1920 / Math.max(width, height));
  const thumbnailSize = {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize
  });
  const source = sources.find((item) => item.display_id === String(display.id)) || sources[0];
  if (!source) throw new Error('Unable to capture the primary display.');
  const image = source.thumbnail.resize(thumbnailSize);
  const base64 = image.toJPEG(58).toString('base64');
  logAction('screenshot', { width, height, imageWidth: thumbnailSize.width, imageHeight: thumbnailSize.height });
  return { base64, width, height, imageWidth: thumbnailSize.width, imageHeight: thumbnailSize.height, locked: state.locked };
}

export async function computerMouseAction(payload = {}) {
  ensureUnlocked();
  const action = String(payload.action || 'click').toLowerCase();
  const hasCoordinates = Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y));
  if (hasCoordinates) {
    await mouse.setPosition(new Point(Math.round(Number(payload.x)), Math.round(Number(payload.y))));
  }
  const button = normalizeButton(payload.button);
  if (action === 'move') {
    logAction('mouse_move', { x: payload.x, y: payload.y });
    return { ok: true, action, x: payload.x, y: payload.y };
  }
  if (action === 'double_click' || payload.doubleClick) {
    await mouse.doubleClick(button);
    logAction('mouse_double_click', { x: payload.x, y: payload.y, button: payload.button || 'left' });
    return { ok: true, action: 'double_click', button: payload.button || 'left' };
  }
  await mouse.click(button);
  logAction('mouse_click', { x: payload.x, y: payload.y, button: payload.button || 'left' });
  return { ok: true, action: 'click', button: payload.button || 'left' };
}

export async function computerKeyboardType(text = '') {
  ensureUnlocked();
  const value = String(text || '');
  await keyboard.type(value);
  logAction('keyboard_type', { text: value.length > 80 ? `${value.slice(0, 80)}...` : value });
  return { ok: true, typed: value.length };
}

export async function computerKeyboardKeys(keys = []) {
  ensureUnlocked();
  const normalized = normalizeKeys(keys);
  if (!normalized.length) throw new Error('No valid shortcut keys were provided.');
  await keyboard.pressKey(...normalized);
  await keyboard.releaseKey(...normalized.reverse());
  logAction('keyboard_shortcut', { keys });
  return { ok: true, keys };
}

export function registerComputerHandlers() {
  ipcMain.handle('computer:state', async () => computerGetStatus());
  ipcMain.handle('computer:set-enabled', async (_event, payload = {}) => computerSetEnabled(payload.enabled));
  ipcMain.handle('computer:set-unattended', async (_event, payload = {}) => computerSetUnattended(payload.allowUnattended));
  ipcMain.handle('computer:get-screen', async () => computerGetScreen());
  ipcMain.handle('computer:mouse-action', async (_event, payload = {}) => computerMouseAction(payload));
  ipcMain.handle('computer:keyboard-type', async (_event, payload = {}) => computerKeyboardType(payload.text || ''));
  ipcMain.handle('computer:keyboard-keys', async (_event, payload = {}) => computerKeyboardKeys(payload.keys || []));
  ipcMain.handle('computer:lock', async (_event, payload = {}) => computerLock(payload.reason || 'manual'));
  ipcMain.handle('computer:unlock', async () => computerUnlock());
}
