import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { db, safeDB } from "./db.js";
import { runMigrationIfNeeded } from "./services/migration.js";
import { OrderService, HeldOrderService } from "./services/orders.js";
import { KitchenService } from "./services/kitchen.js";
import { ShiftService } from "./services/shifts.js";
import { MenuService } from "./services/menu.js";
import { SettingsService } from "./services/settings.js";
import { BackupService } from "./services/backup.js";
import { ReceiptService } from "./services/receipts.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Database Context Provider
   Initialises Dexie, runs one-time migration, exposes
   all service layer methods to the component tree.
══════════════════════════════════════════════════════ */

const DBContext = createContext(null);

export function DBProvider({ children }) {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error,  setError]  = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Open the database (Dexie auto-creates schema if needed)
        await db.open();

        // 2. One-time migration from localStorage
        await runMigrationIfNeeded();

        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("[KAVO-DB] Init failed:", err);
        if (!cancelled) {
          setError(err?.message || "Database failed to open");
          // Still mark ready so app can run with localStorage fallback
          setStatus("ready");
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const value = {
    status,
    dbError: error,
    // ── Services exposed to components ──────────────
    orders:   OrderService,
    held:     HeldOrderService,
    kitchen:  KitchenService,
    shifts:   ShiftService,
    menu:     MenuService,
    settings: SettingsService,
    receipts: ReceiptService,
    backup:   BackupService,
    // ── Raw db access (advanced) ─────────────────────
    db,
  };

  // ── Loading screen ────────────────────────────────
  if (status === "loading") {
    return <DBLoadingScreen />;
  }

  return (
    <DBContext.Provider value={value}>
      {children}
    </DBContext.Provider>
  );
}

export function useDB() {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error("useDB must be used inside <DBProvider>");
  return ctx;
}

// ─── LOADING SCREEN ──────────────────────────────────
function DBLoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#070912",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
      color: "#e8edf5",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
      `}</style>

      {/* Logo */}
      <div style={{
        fontSize: 32, fontWeight: 900,
        color: "#f0a500", letterSpacing: "0.08em",
        marginBottom: 6,
      }}>
        ⚡ KAVO<span style={{ color: "#e8edf5", opacity: 0.3, fontWeight: 700 }}>-SYS</span>
      </div>
      <div style={{ fontSize: 11, color: "#4a6080", letterSpacing: "0.12em", marginBottom: 36 }}>
        OFFLINE RESTAURANT POS
      </div>

      {/* Spinner */}
      <div style={{
        width: 36, height: 36,
        border: "3px solid #1a2438",
        borderTopColor: "#f0a500",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        marginBottom: 20,
      }}/>

      {/* Status */}
      <div style={{ fontSize: 13, color: "#4a6080", animation: "pulse 1.4s ease infinite" }}>
        Initialising database…
      </div>
    </div>
  );
}
