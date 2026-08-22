import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

let popoutWindow = null;

function positionNearCursor(window) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const bounds = display.workArea;
  const width = 420;
  const height = 640;
  const x = Math.min(Math.max(cursor.x - width / 2, bounds.x), bounds.x + bounds.width - width);
  const y = Math.min(Math.max(cursor.y - 40, bounds.y), bounds.y + bounds.height - height);
  window.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
}

export function getPopoutState() {
  return {
    exists: Boolean(popoutWindow && !popoutWindow.isDestroyed()),
    visible: Boolean(popoutWindow && !popoutWindow.isDestroyed() && popoutWindow.isVisible())
  };
}

export function createPopoutWindow(options = {}) {
  if (popoutWindow && !popoutWindow.isDestroyed()) {
    return popoutWindow;
  }

  popoutWindow = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 420,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (options.isDev && options.rendererUrl) {
    const url = new URL(options.rendererUrl);
    url.searchParams.set('window', 'popout');
    popoutWindow.loadURL(url.toString());
  } else {
    popoutWindow.loadFile(path.join(options.rendererDir, 'index.html'), {
      search: '?window=popout'
    });
  }

  popoutWindow.on('closed', () => {
    popoutWindow = null;
  });

  return popoutWindow;
}

export function togglePopoutWindow(options = {}) {
  const window = createPopoutWindow(options);
  if (window.isVisible()) {
    window.hide();
    return getPopoutState();
  }
  positionNearCursor(window);
  window.show();
  window.focus();
  return getPopoutState();
}

export function hidePopoutWindow() {
  if (popoutWindow && !popoutWindow.isDestroyed()) {
    popoutWindow.hide();
  }
  return getPopoutState();
}

