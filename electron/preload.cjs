/**
 * KAVO-SYS  ·  Electron Preload Script  ·  v1.0
 * ─────────────────────────────────────────────────────
 * Runs in a sandboxed context BEFORE the renderer.
 * Exposes only explicitly allowed APIs to window.kavoElectron.
 * MUST use CommonJS (.cjs) because contextBridge runs before
 * ES module loading in the renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kavoElectron', {
  // ── Environment ────────────────────────────────────
  isElectron: true,
  version:    async () => ipcRenderer.invoke('app:version'),
  platform:   async () => ipcRenderer.invoke('app:platform'),

  // ── Window controls ────────────────────────────────
  window: {
    minimize:      () => ipcRenderer.invoke('window:minimize'),
    maximize:      () => ipcRenderer.invoke('window:maximize'),
    fullscreen:    () => ipcRenderer.invoke('window:fullscreen'),
    isFullscreen:  () => ipcRenderer.invoke('window:is-fullscreen'),
    /** Call with true when an order is active — triggers close confirm */
    setDirty:   (d) => ipcRenderer.invoke('window:set-dirty', d),
  },

  // ── Keyboard shortcut listener ────────────────────
  /** Register a callback for POS shortcut events from main */
  onShortcut: (callback) => {
    ipcRenderer.on('shortcut', (_event, action) => callback(action));
    // Return cleanup function
    return () => ipcRenderer.removeAllListeners('shortcut');
  },

  // ── Printer API (stubs — ready for ESC/POS) ────────
  printer: {
    list:         ()          => ipcRenderer.invoke('printer:list'),
    printRaw:     (args)      => ipcRenderer.invoke('printer:print-raw', args),
    printHTML:    (args)      => ipcRenderer.invoke('printer:print-html', args),
  },

  // ── Barcode scanner API (stub) ────────────────────
  scanner: {
    listPorts:    ()          => ipcRenderer.invoke('scanner:list-ports'),
    connect:      (port)      => ipcRenderer.invoke('scanner:connect', port),
    /** Scanner data arrives here when connected */
    onScan:       (callback)  => {
      ipcRenderer.on('scanner:data', (_e, code) => callback(code));
      return () => ipcRenderer.removeAllListeners('scanner:data');
    },
  },

  // ── Cash drawer ────────────────────────────────────
  cashDrawer: {
    open: (printer) => ipcRenderer.invoke('cashdrawer:open', printer),
  },

  // ── Native file dialogs ───────────────────────────
  dialog: {
    saveFile: (args) => ipcRenderer.invoke('dialog:save-file', args),
    confirm:  (msg)  => ipcRenderer.invoke('dialog:confirm', msg),
  },
});
