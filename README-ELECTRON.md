# KAVO-SYS · Electron Desktop App

## Quick Start

### Run in development (Electron + hot reload)
```bash
npm install
npm run dev          # start Vite dev server (port 5173)
# then in a second terminal:
npm run electron:dev # launch Electron pointing at dev server
```

### Build production Windows installer
```bash
npm run electron:win
# Output: release/KAVO-SYS POS Setup x.x.x.exe
```

### Build for current platform
```bash
npm run electron:build
```

---

## Project Structure

```
kavo-sys/
├── electron/
│   ├── main.js          ← Electron main process (window, IPC, shortcuts)
│   ├── preload.cjs      ← Secure IPC bridge (contextBridge)
│   └── assets/
│       ├── icon.png     ← App icon (replace with your logo, 256×256 PNG)
│       ├── icon.ico     ← Windows icon (256×256 ICO)
│       └── icon.icns    ← macOS icon (create with iconutil)
├── src/
│   ├── hooks/
│   │   └── useElectron.js  ← React hook for Electron IPC
│   ├── components/
│   │   └── ElectronTitleBar.jsx ← Custom title bar (Windows/Linux only)
│   └── ...existing app...
├── dist/                ← Vite build output (loaded by Electron)
├── release/             ← electron-builder output (.exe, .dmg, .AppImage)
└── package.json         ← Electron entry + build config
```

---

## Keyboard Shortcuts

| Key      | Action               |
|----------|----------------------|
| F1       | New Order            |
| F2       | Payment              |
| F3       | Kitchen View         |
| F4       | Hold Order           |
| F5       | Receipt Preview      |
| F11      | Toggle Fullscreen    |
| ESC      | Cancel / Close Modal |

---

## Custom App Icon

Replace `electron/assets/icon.png` with your 256×256 KAVO-SYS logo.

For Windows: convert to `icon.ico` using https://convertio.co/png-ico/
For macOS: create `icon.icns` using:
```bash
mkdir icon.iconset
sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
iconutil -c icns icon.iconset
```

---

## Hardware Integration (Stubs Ready)

### Receipt Printer (ESC/POS)
Install: `npm install node-thermal-printer`

In `electron/main.js`, find `ipcMain.handle('printer:print-raw', ...)` and implement:
```js
import ThermalPrinter from 'node-thermal-printer';
// ...
```

### Barcode Scanner (USB/Serial)
Install: `npm install serialport`

In `electron/main.js`, find `ipcMain.handle('scanner:connect', ...)` and implement.
The renderer listens via `window.kavoElectron.scanner.onScan(callback)`.

### Cash Drawer
Connected via receipt printer.
In `electron/main.js`, find `ipcMain.handle('cashdrawer:open', ...)`.
Implement by sending the ESC/POS kick command: `0x1B 0x70 0x00 0x19 0xFA`.

---

## Auto-Start on Windows Login

In `SettingsCenter.jsx`, toggle auto-start:
```js
// This IPC call is wired in main.js
window.kavoElectron.app.setAutoStart(true);
```

In `electron/main.js`, `app.setLoginItemSettings()` is already called.

---

## Data Storage

KAVO-SYS uses **IndexedDB** (via Dexie.js) inside Electron's Chromium renderer.
Data persists in the Electron user data directory:

- Windows: `%APPDATA%\KAVO-SYS POS\`
- macOS:   `~/Library/Application Support/KAVO-SYS POS/`
- Linux:   `~/.config/KAVO-SYS POS/`

The `partition: 'persist:kavosys'` setting in main.js ensures data survives app restarts.

---

## Deploy to Netlify (Web Mode)

The same codebase deploys to Netlify as a web app:
```bash
npm run build
# Upload dist/ to Netlify Drop
```
`useElectron` returns safe no-ops in browser mode — no code changes needed.
