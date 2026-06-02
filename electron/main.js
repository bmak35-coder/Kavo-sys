/**
 * KAVO-SYS  ·  Electron Main Process  ·  v1.0
 * ─────────────────────────────────────────────────────
 * Architecture notes:
 *   • renderer = React app (IndexedDB, all business logic)
 *   • main     = OS integration (windows, printers, shortcuts)
 *   • preload  = safe IPC bridge between renderer and main
 *
 * FUTURE INTEGRATIONS (stubs ready):
 *   • Receipt printers  → ipcMain.handle('printer:*')
 *   • Barcode scanners  → globalShortcut or HID via serialport
 *   • Cash drawer       → printer ESC/POS kick command
 *   • Auto-updater      → electron-updater
 */

import { app, BrowserWindow, ipcMain, globalShortcut, Menu, shell, dialog, Tray, nativeImage } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Constants ────────────────────────────────────────
const IS_DEV    = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const DIST_HTML = join(__dirname, 'dist', 'index.html');
const DEV_URL   = 'http://localhost:5173';
const APP_NAME  = 'KAVO-SYS POS';

let mainWindow   = null;
let splashWindow = null;
let tray         = null;
let isQuitting   = false;

// ─── Single-instance lock ─────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── SPLASH WINDOW ───────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width:  480,
    height: 300,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    resizable:   false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  // Inline HTML splash (no external file needed)
  const splashHTML = `<!DOCTYPE html><html>
<head><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{
    background:linear-gradient(135deg,#070c16 0%,#0b1220 100%);
    display:flex;flex-direction:column;align-items:center;
    justify-content:center;height:100vh;font-family:system-ui,sans-serif;
    border-radius:16px;overflow:hidden;
    border:1.5px solid rgba(240,165,0,0.3);
  }
  .logo{font-size:52px;margin-bottom:14px;animation:pulse 1.5s ease infinite;}
  .title{font-size:30px;font-weight:900;color:#f0a500;letter-spacing:0.08em;}
  .sub{font-size:12px;color:rgba(255,255,255,0.3);letter-spacing:0.18em;margin-top:6px;}
  .bar{width:200px;height:3px;background:#1a2438;border-radius:2px;margin-top:28px;overflow:hidden;}
  .fill{height:100%;background:#f0a500;border-radius:2px;animation:load 1.8s ease-in-out forwards;}
  .version{font-size:10px;color:rgba(255,255,255,0.2);margin-top:14px;letter-spacing:0.06em;}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
  @keyframes load{0%{width:0%}60%{width:70%}100%{width:100%}}
</style></head>
<body>
  <div class="logo">⚡</div>
  <div class="title">KAVO-SYS</div>
  <div class="sub">OFFLINE RESTAURANT POS</div>
  <div class="bar"><div class="fill"></div></div>
  <div class="version">v1.0 · Electron ${process.versions.electron} · Chromium ${process.versions.chrome}</div>
</body></html>`;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
  splashWindow.on('closed', () => { splashWindow = null; });
}

// ─── MAIN WINDOW ─────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:       1440,
    height:      900,
    minWidth:    1024,
    minHeight:   680,
    title:       APP_NAME,
    show:        false,   // shown after splash
    frame:       true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#070c16',
    icon:        join(__dirname, 'electron', 'icon.png'),
    webPreferences: {
      preload:          join(__dirname, 'electron', 'preload.cjs'),
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      true,
      // Allow IndexedDB to work without size limits
      partition:        'persist:kavosys',
    },
  });

  // ── Load app ────────────────────────────────────────
  if (IS_DEV) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(DIST_HTML);
  }

  // ── Window events ───────────────────────────────────
  mainWindow.once('ready-to-show', () => {
    // Dismiss splash after min 1.8s
    const elapsed = Date.now() - appStartTime;
    const delay   = Math.max(0, 1800 - elapsed);
    setTimeout(() => {
      if (splashWindow) { splashWindow.close(); splashWindow = null; }
      mainWindow.show();
      mainWindow.maximize();
    }, delay);
  });

  // Prevent accidental close — ask for confirmation
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.webContents.executeJavaScript(`
      window.__kavoPreventClose__ ? 
        confirm('Close KAVO-SYS POS?\\n\\nMake sure no active orders are open before closing.') :
        true
    `).then(confirmed => {
      if (confirmed) { isQuitting = true; app.quit(); }
    }).catch(() => { isQuitting = true; app.quit(); });
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // ── Prevent navigation away from the app ────────────
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allow = IS_DEV ? url.startsWith(DEV_URL) : url.startsWith('file://');
    if (!allow) { e.preventDefault(); }
  });

  // ── Open external links in browser, not Electron ────
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ── Prevent F5 / Ctrl+R in production ───────────────
  mainWindow.webContents.on('before-input-event', (e, input) => {
    if (IS_DEV) return;
    if (input.key === 'F5') e.preventDefault();
    if (input.key === 'r' && (input.control || input.meta)) e.preventDefault();
  });
}

// ─── SYSTEM TRAY ─────────────────────────────────────
function createTray() {
  try {
    // Minimal 16×16 gold icon as base64 PNG
    const iconB64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAB6SURBVDiNY2CgJpj///9/BmoZwMjAwMDAwMBAngEkBs4cYGJiQhBgYGBARIiJiYlBJMnExMRAqcnExMRAqcnExMRAqcnExMRAqcnExMRAqcnExMRAqcnExMRAqcnExMRAqckw/P8zAAAAJUlEQVQ4jWNgGAVUBf8HAAD//wMA';
    const icon = nativeImage.createFromDataURL(`data:image/png;base64,${iconB64}`);
    tray = new Tray(icon);
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open KAVO-SYS',  click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type:  'separator' },
      { label: 'Quit',           click: () => { isQuitting = true; app.quit(); } },
    ]));
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
  } catch(_) { /* Tray icon optional */ }
}

// ─── GLOBAL KEYBOARD SHORTCUTS ───────────────────────
function registerShortcuts() {
  // POS keyboard shortcuts — sent to renderer via IPC
  const shortcuts = [
    { key: 'F1',       action: 'pos:new-order'   },
    { key: 'F2',       action: 'pos:payment'     },
    { key: 'F3',       action: 'pos:kitchen'     },
    { key: 'F4',       action: 'pos:hold-order'  },
    { key: 'F5',       action: 'pos:receipt'     },
    { key: 'F11',      action: 'window:fullscreen'},
    { key: 'F12',      action: IS_DEV ? 'dev:tools' : null },
    { key: 'Escape',   action: 'pos:cancel'      },
  ];

  shortcuts.forEach(({ key, action }) => {
    if (!action) return;
    try {
      globalShortcut.register(key, () => {
        if (action === 'window:fullscreen') {
          mainWindow?.setFullScreen(!mainWindow.isFullScreen());
          return;
        }
        if (action === 'dev:tools') {
          mainWindow?.webContents.toggleDevTools();
          return;
        }
        mainWindow?.webContents.send('shortcut', action);
      });
    } catch(_) {}
  });
}

// ─── IPC HANDLERS ────────────────────────────────────
function registerIPC() {
  // ── Window controls ──────────────────────────────
  ipcMain.handle('window:minimize',   () => mainWindow?.minimize());
  ipcMain.handle('window:maximize',   () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle('window:fullscreen', () => {
    mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow?.isFullScreen();
  });
  ipcMain.handle('window:is-fullscreen', () => mainWindow?.isFullScreen() ?? false);

  // ── Prevent-close flag (set by React when order is open) ──
  ipcMain.handle('window:set-dirty', (_, dirty) => {
    mainWindow?.webContents.executeJavaScript(
      `window.__kavoPreventClose__ = ${dirty ? 'true' : 'false'}`
    ).catch(() => {});
  });

  // ── App info ──────────────────────────────────────
  ipcMain.handle('app:version',  () => app.getVersion());
  ipcMain.handle('app:platform', () => process.platform);

  // ─────────────────────────────────────────────────
  // PRINTER INTEGRATION (stub — ready for ESC/POS lib)
  // ─────────────────────────────────────────────────
  ipcMain.handle('printer:list', async () => {
    try {
      const printers = await mainWindow?.webContents.getPrintersAsync() ?? [];
      return printers.map(p => ({ name: p.name, isDefault: p.isDefault, status: p.status }));
    } catch(_) { return []; }
  });

  ipcMain.handle('printer:print-raw', async (_, { printerName, data }) => {
    // Future: use 'escpos' npm package or 'node-thermal-printer' here
    // data = ESC/POS byte array Buffer
    console.log('[KAVO-PRINTER] Raw print to:', printerName, '— stub');
    return { success: false, error: 'Raw printing not yet configured' };
  });

  ipcMain.handle('printer:print-html', async (_, { html, printerName }) => {
    // Future: create a hidden BrowserWindow, load html, print silently
    console.log('[KAVO-PRINTER] HTML print to:', printerName, '— stub');
    return { success: false, error: 'Silent print not yet configured' };
  });

  // ─────────────────────────────────────────────────
  // BARCODE SCANNER (stub — ready for USB HID / Serial)
  // ─────────────────────────────────────────────────
  ipcMain.handle('scanner:list-ports', async () => {
    // Future: use 'serialport' npm package
    return [];
  });

  ipcMain.handle('scanner:connect', async (_, portPath) => {
    // Future: open serial port, pipe data events → renderer IPC
    console.log('[KAVO-SCANNER] Connect to:', portPath, '— stub');
    return { success: false, error: 'Scanner not yet configured' };
  });

  // ─────────────────────────────────────────────────
  // CASH DRAWER (stub — triggered via printer kick)
  // ─────────────────────────────────────────────────
  ipcMain.handle('cashdrawer:open', async (_, printerName) => {
    // Future: send ESC/POS 0x1B 0x70 0x00 0x19 0xFA kick command
    console.log('[KAVO-DRAWER] Open via:', printerName, '— stub');
    return { success: false, error: 'Cash drawer not yet configured' };
  });

  // ─────────────────────────────────────────────────
  // DIALOG utilities
  // ─────────────────────────────────────────────────
  ipcMain.handle('dialog:save-file', async (_, { filename, data, mimeType }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters:     mimeType.includes('json')
        ? [{ name: 'JSON Backup', extensions: ['json'] }]
        : [{ name: 'CSV',         extensions: ['csv']  }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    const { writeFile } = await import('fs/promises');
    await writeFile(result.filePath, data, 'utf-8');
    return { saved: true, path: result.filePath };
  });

  ipcMain.handle('dialog:confirm', async (_, message) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type:    'question',
      buttons: ['Yes', 'No'],
      title:   'KAVO-SYS',
      message,
    });
    return result.response === 0;
  });
}

// ─── NATIVE MENU ─────────────────────────────────────
function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' }, { type: 'separator' }, { role: 'quit' },
      ],
    }] : []),
    {
      label: 'POS',
      submenu: [
        { label: 'New Order (F1)',    accelerator: 'F1',  click: () => mainWindow?.webContents.send('shortcut', 'pos:new-order')  },
        { label: 'Payment (F2)',      accelerator: 'F2',  click: () => mainWindow?.webContents.send('shortcut', 'pos:payment')   },
        { label: 'Kitchen (F3)',      accelerator: 'F3',  click: () => mainWindow?.webContents.send('shortcut', 'pos:kitchen')   },
        { type:  'separator' },
        { label: 'Toggle Fullscreen', accelerator: 'F11', click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen())    },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { label: 'Maximise', click: () => mainWindow?.maximize() },
        ...(IS_DEV ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── APP LIFECYCLE ────────────────────────────────────
const appStartTime = Date.now();

app.whenReady().then(() => {
  app.setAppUserModelId('com.kavosys.pos');   // Windows taskbar grouping
  createSplash();
  createMainWindow();
  createTray();
  registerShortcuts();
  registerIPC();
  buildMenu();
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ── Auto-start on login (Windows) ────────────────────
if (process.platform === 'win32' && !IS_DEV) {
  app.setLoginItemSettings({
    openAtLogin: false,  // user can toggle this from Settings
    name:        APP_NAME,
  });
}
