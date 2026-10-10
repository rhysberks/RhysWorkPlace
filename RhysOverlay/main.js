const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const Store = require('electron-store');

const StatsEngine = require('./src/lib/stats');
const BottleneckEngine = require('./src/lib/bottleneck');
const OllamaManager = require('./src/lib/ollama');
const ChatProviders = require('./src/lib/chatProviders');
const SecureStore = require('./src/lib/secureStore');
const { recommend } = require('./src/lib/recommend');
const { getSpecs } = require('./src/lib/specs');
const defaultConfig = require('./config/default-config.json');

const store = new Store({ name: 'rhysoverlay-config', defaults: defaultConfig });
const secureStore = new SecureStore(store);

// ---------------------------------------------------------------------------
// Config self-heal: if you ran an older build, your persisted config file on
// disk may predate keys this version relies on (overlay.themes,
// overlay.activeTheme, chat.provider, etc). electron-store only fills in
// "defaults" for a file that doesn't exist yet - it does NOT retroactively
// add new keys to a config you already have on disk. Without this, an
// existing user's overlay silently gets `undefined` for `overlay.themes`,
// which throws inside the overlay's renderer and aborts every script after
// that line (that's the "only the title shows, no CPU/RAM, dragging does
// nothing" bug). This walks the shipped defaults and fills in ONLY keys
// that are genuinely missing, leaving every existing customization alone.
// ---------------------------------------------------------------------------
function fillMissingDefaults(target, defaults) {
  for (const key of Object.keys(defaults)) {
    const defVal = defaults[key];
    if (Array.isArray(defVal)) {
      if (!Array.isArray(target[key])) target[key] = defVal;
    } else if (defVal && typeof defVal === 'object') {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      fillMissingDefaults(target[key], defVal);
    } else if (!(key in target)) {
      target[key] = defVal;
    }
  }
  return target;
}

(function migrateConfig() {
  const current = store.store;
  const healed = fillMissingDefaults(current, defaultConfig);
  store.set(healed);
})();

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let overlayEditMode = false;
let statsTimer = null;
let cachedSpecs = null;

const stats = new StatsEngine(store.get('fps'));
const bottleneck = new BottleneckEngine(store.get('bottleneck'));
const ollamaManager = new OllamaManager(store.get('chat.ollama'));
const chatProviders = new ChatProviders({
  ollamaBaseUrl: store.get('chat.ollama.baseUrl'),
  secureStore,
});

// ---------------------------------------------------------------------------
// Main app window (splash -> Chat / Overlay control panel)
// ---------------------------------------------------------------------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#0b0b12',
    title: 'RhysOverlay',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'src/app/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---------------------------------------------------------------------------
// Overlay window - the in-game HUD.
//
// Performance notes (this is the part that previously caused high CPU /
// frame drops on other windows):
//  - alwaysOnTop level is 'floating', NOT 'screen-saver'. The screen-saver
//    tier fights with the OS compositor on many GPU/driver combos when
//    paired with a transparent, frequently-updating, click-through window.
//  - No backdrop-filter/blur anywhere in overlay.css - themes use plain
//    solid/rgba backgrounds and box-shadow glow instead, which are far
//    cheaper for the compositor.
//  - Stats polling is paused whenever the overlay is hidden (see
//    startStatsLoop below) instead of running unconditionally.
// ---------------------------------------------------------------------------
function createOverlayWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const saved = store.get('overlay.position') || {};
  const x = typeof saved.x === 'number' ? saved.x : width - 300;
  const y = typeof saved.y === 'number' ? saved.y : 20;

  overlayWindow = new BrowserWindow({
    width: 260,
    height: 320,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    // 'toolbar' type on Windows tends to layer more reliably over
    // borderless/windowed-fullscreen games than the default window type.
    ...(process.platform === 'win32' ? { type: 'toolbar' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(store.get('overlay.clickThrough', true), { forward: true });
  overlayWindow.loadFile(path.join(__dirname, 'src/overlay/overlay.html'));

  let moveSaveTimer = null;
  overlayWindow.on('moved', () => {
    if (!overlayEditMode) return;
    clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => {
      const [px, py] = overlayWindow.getPosition();
      store.set('overlay.position', { x: px, y: py });
    }, 200);
  });
}

function setOverlayEditMode(enabled) {
  overlayEditMode = enabled;
  if (!overlayWindow) return;
  overlayWindow.setIgnoreMouseEvents(!enabled, { forward: true });
  overlayWindow.setFocusable(enabled);
  overlayWindow.webContents.send('overlay:edit-mode', enabled);
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/tray.png'));
  const menu = Menu.buildFromTemplate([
    { label: 'Show RhysOverlay', click: () => { if (mainWindow) mainWindow.show(); else createMainWindow(); } },
    {
      label: 'Toggle Overlay',
      click: () => {
        if (!overlayWindow) return;
        overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
      },
    },
    { type: 'separator' },
    { label: 'Quit RhysOverlay', click: () => app.quit() },
  ]);
  tray.setToolTip('RhysOverlay');
  tray.setContextMenu(menu);
}

function registerHotkeys() {
  const hk = store.get('overlay.hotkeys');
  globalShortcut.register(hk.toggleOverlay, () => {
    if (!overlayWindow) return;
    overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
  });
  globalShortcut.register(hk.toggleClickThrough, () => {
    const current = store.get('overlay.clickThrough', true);
    store.set('overlay.clickThrough', !current);
    if (overlayWindow) overlayWindow.setIgnoreMouseEvents(!current, { forward: true });
  });
  globalShortcut.register(hk.toggleApp, () => {
    if (!mainWindow) createMainWindow();
    else { mainWindow.show(); mainWindow.focus(); }
  });
  globalShortcut.register(hk.adjustPosition, () => setOverlayEditMode(!overlayEditMode));
}

// ---------------------------------------------------------------------------
// Stats loop - only runs while the overlay window is actually visible, so
// an idle/hidden overlay costs nothing. Self-rescheduling (rather than a
// fixed setInterval) so changing the refresh-rate slider takes effect on
// the very next tick without needing an app restart.
// ---------------------------------------------------------------------------
function scheduleStatsTick() {
  const intervalMs = store.get('overlay.refreshRateMs', 1500);
  statsTimer = setTimeout(async () => {
    if (overlayWindow && overlayWindow.isVisible()) {
      const snapshot = await stats.poll();
      const analysis = bottleneck.analyze(snapshot);
      const payload = { ...snapshot, bottleneck: analysis };
      overlayWindow.webContents.send('stats-update', payload);
      if (mainWindow) mainWindow.webContents.send('stats-update', payload);
    }
    scheduleStatsTick();
  }, intervalMs);
}

// ---------------------------------------------------------------------------
// IPC: config
// ---------------------------------------------------------------------------
ipcMain.handle('config:get', () => store.store);
ipcMain.handle('config:set', (_e, patch) => {
  Object.entries(patch).forEach(([key, value]) => store.set(key, value));
  const full = store.store;
  // Push the change live to both windows so theme/widget/refresh-rate edits
  // apply immediately instead of requiring a restart.
  if (overlayWindow) overlayWindow.webContents.send('config:updated', full);
  if (mainWindow) mainWindow.webContents.send('config:updated', full);
  return full;
});

// ---------------------------------------------------------------------------
// IPC: overlay control
// ---------------------------------------------------------------------------
ipcMain.handle('overlay:set-edit-mode', (_e, enabled) => setOverlayEditMode(enabled));
ipcMain.handle('overlay:show', () => overlayWindow && overlayWindow.show());
ipcMain.handle('overlay:hide', () => overlayWindow && overlayWindow.hide());

// ---------------------------------------------------------------------------
// IPC: specs + recommendations
// ---------------------------------------------------------------------------
ipcMain.handle('system:get-specs', async () => {
  if (!cachedSpecs) cachedSpecs = await getSpecs();
  return cachedSpecs;
});
ipcMain.handle('system:get-recommendations', async () => {
  if (!cachedSpecs) cachedSpecs = await getSpecs();
  return recommend(cachedSpecs);
});

// ---------------------------------------------------------------------------
// IPC: Ollama model management
// ---------------------------------------------------------------------------
ipcMain.handle('ollama:is-running', () => ollamaManager.isRunning());
ipcMain.handle('ollama:list-models', () => ollamaManager.listModels());
ipcMain.on('ollama:pull-model', (event, modelName) => {
  ollamaManager.pullModel(
    modelName,
    (progress) => event.sender.send('ollama:pull-progress', { model: modelName, ...progress }),
    () => event.sender.send('ollama:pull-done', { model: modelName }),
    (error) => event.sender.send('ollama:pull-error', { model: modelName, error }),
  );
});

// ---------------------------------------------------------------------------
// IPC: API keys (renderer only ever learns whether a key is set, never the
// key itself back)
// ---------------------------------------------------------------------------
ipcMain.handle('apikeys:set', (_e, { provider, key }) => {
  secureStore.setKey(provider, key);
  return { ok: true };
});
ipcMain.handle('apikeys:has', (_e, provider) => secureStore.hasKey(provider));

// ---------------------------------------------------------------------------
// IPC: unified chat streaming
// ---------------------------------------------------------------------------
ipcMain.on('chat:send', async (event, { provider, messages, model }) => {
  await chatProviders.streamChat({ provider, messages, model }, (chunk) => {
    event.sender.send('chat:chunk', chunk);
  });
  event.sender.send('chat:done');
});

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();
  createTray();
  registerHotkeys();
  scheduleStatsTick();
});

app.on('window-all-closed', (e) => {
  // Keep running in tray (overlay window doesn't count as a "closable" app window).
  if (process.platform !== 'darwin') e.preventDefault();
});

app.on('activate', () => {
  if (!mainWindow) createMainWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (statsTimer) clearTimeout(statsTimer);
  stats.stop();
});
