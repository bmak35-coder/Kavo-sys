import { useEffect, useCallback, useRef } from 'react';

/**
 * KAVO-SYS  ·  useElectron hook
 * ──────────────────────────────────────────────────────
 * Detects if running inside Electron and provides a
 * typed interface to the preload API.
 *
 * Works transparently in browser (web) mode — all methods
 * become safe no-ops so the app runs identically on Netlify.
 */

// ── Detect Electron environment ────────────────────────
export const IS_ELECTRON = !!(typeof window !== 'undefined' && window.kavoElectron?.isElectron);

// ── Safe API getter (returns no-op if not Electron) ────
function getAPI() {
  if (IS_ELECTRON) return window.kavoElectron;
  // Browser fallback — all calls are silent no-ops
  return {
    isElectron:  false,
    version:     async () => '—',
    platform:    async () => 'web',
    window: {
      minimize:     () => {},
      maximize:     () => {},
      fullscreen:   () => {},
      isFullscreen: async () => false,
      setDirty:     () => {},
    },
    onShortcut:  () => () => {},
    printer:     { list: async () => [], printRaw: async () => ({}), printHTML: async () => ({}) },
    scanner:     { listPorts: async () => [], connect: async () => ({}), onScan: () => () => {} },
    cashDrawer:  { open: async () => ({}) },
    dialog:      {
      saveFile: async ({ filename, data }) => {
        // Web fallback — use browser download
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data]));
        a.download = filename;
        a.click();
        return { saved: true };
      },
      confirm: async (msg) => window.confirm(msg),
    },
  };
}

export const electronAPI = getAPI();

// ──────────────────────────────────────────────────────
//   MAIN HOOK
// ──────────────────────────────────────────────────────
export function useElectron({ onShortcut, isDirty = false } = {}) {
  const cleanupRef = useRef(null);

  // ── Keyboard shortcuts (POS F1–F3, ESC) ─────────────
  useEffect(() => {
    if (!onShortcut) return;

    if (IS_ELECTRON) {
      // Electron: listen via IPC
      cleanupRef.current = electronAPI.onShortcut(onShortcut);
    } else {
      // Browser: listen via keydown
      const handler = (e) => {
        switch (e.key) {
          case 'F1':     e.preventDefault(); onShortcut('pos:new-order');  break;
          case 'F2':     e.preventDefault(); onShortcut('pos:payment');    break;
          case 'F3':     e.preventDefault(); onShortcut('pos:kitchen');    break;
          case 'F4':     e.preventDefault(); onShortcut('pos:hold-order'); break;
          case 'Escape':                      onShortcut('pos:cancel');     break;
        }
      };
      window.addEventListener('keydown', handler);
      cleanupRef.current = () => window.removeEventListener('keydown', handler);
    }
    return () => cleanupRef.current?.();
  }, [onShortcut]);

  // ── Dirty flag (prevents accidental close) ───────────
  useEffect(() => {
    electronAPI.window.setDirty(isDirty);
    // Browser fallback
    if (!IS_ELECTRON) {
      const handler = (e) => { if (isDirty) e.preventDefault(); };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }
  }, [isDirty]);

  // ── Helpers ───────────────────────────────────────────
  const toggleFullscreen = useCallback(() => electronAPI.window.fullscreen(), []);
  const minimize         = useCallback(() => electronAPI.window.minimize(),   []);
  const maximize         = useCallback(() => electronAPI.window.maximize(),   []);

  const listPrinters = useCallback(() => electronAPI.printer.list(), []);

  const openCashDrawer = useCallback(
    (printerName) => electronAPI.cashDrawer.open(printerName), []
  );

  const saveFileNative = useCallback(
    (args) => electronAPI.dialog.saveFile(args), []
  );

  return {
    isElectron:      IS_ELECTRON,
    toggleFullscreen,
    minimize,
    maximize,
    listPrinters,
    openCashDrawer,
    saveFileNative,
  };
}
