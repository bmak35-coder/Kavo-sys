/**
 * Tables Management Page
 * Restaurant floor plan and table status management
 */

import { useState, useEffect, useCallback } from "react";
import { useFirebaseServices } from "../firebase/FirebaseServicesProvider.jsx";
import { TableService, TABLE_STATUSES, TABLE_STATUS_CFG } from "../db/services/tables.js";

function safeArr(v) { return Array.isArray(v) ? v : []; }

const C = {
  bg: "#0a0e1a",
  surf: "#0d1525",
  card: "#0f1a2a",
  border: "#1e2d40",
  bdr: "#1e2d40",
  text: "#e6edf3",
  muted: "#7d8590",
  acc: "#f0a500",
  success: "#3fb950",
  danger: "#f85149",
  info: "#58a6ff",
  warn: "#d29922",
};

function FLabel({ children }) {
  return (
    <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: ".08em", marginBottom: 5 }}>
      {children}
    </div>
  );
}

export default function Tables({ onBack }) {
  const firebaseServices = useFirebaseServices();
  const useFirebase = !!firebaseServices;
  
  const [tables, setTables] = useState([]);
  const [form, setForm] = useState(null); // null = closed, {} = new, {...} = edit
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      if (useFirebase) {
        console.log('Loading tables from Firebase...');
        const t = await firebaseServices.tables.getAll();
        console.log('Loaded tables:', t);
        setTables(safeArr(t));
      } else {
        const t = TableService.getAll();
        console.log('Loaded tables from localStorage:', t);
        setTables(safeArr(t));
      }
    } catch (e) {
      console.error('Error loading tables:', e);
    }
  }, [useFirebase, firebaseServices]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveTable() {
    if (!form.number?.trim()) {
      showToast("Table number required", "err");
      return;
    }

    // Check for duplicate table number
    const duplicate = tables.find(t =>
      t.number?.toString().trim() === form.number?.toString().trim() && t.id !== form.id
    );
    if (duplicate) {
      showToast("Table number already exists", "err");
      return;
    }

    setSaving(true);
    try {
      console.log('Saving table:', form);
      if (useFirebase) {
        const saved = await firebaseServices.tables.save(form);
        console.log('Table saved to Firebase:', saved);
      } else {
        TableService.save(form);
        console.log('Table saved to localStorage');
      }
      showToast(form.id ? "Table updated" : "Table added");
      setForm(null);
      load();
    } catch (e) {
      console.error('Error saving table:', e);
      showToast("Save failed", "err");
    }
    setSaving(false);
  }

  async function deleteTable(id) {
    try {
      if (useFirebase) {
        await firebaseServices.tables.delete(id);
        console.log('Table deleted from Firebase');
      } else {
        TableService.delete(id);
        console.log('Table deleted from localStorage');
      }
      setDelId(null);
      load();
      showToast("Table deleted", "warn");
    } catch (e) {
      console.error('Error deleting table:', e);
      showToast("Delete failed", "err");
    }
  }

  async function cycleStatus(table) {
    const cycle = ["Available", "Occupied", "Reserved", "Cleaning"];
    const next = cycle[(cycle.indexOf(table.status) + 1) % cycle.length];
    try {
      if (useFirebase) {
        await firebaseServices.tables.setStatus(table.id, next);
      } else {
        TableService.setStatus(table.id, next);
      }
      load();
    } catch (e) {
      console.error('Error updating table status:', e);
      showToast("Status update failed", "err");
    }
  }

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={{ height: "100vh", background: C.bg, display: "flex", flexDirection: "column", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {/* Header */}
      <header style={{ background: C.surf, borderBottom: `2px solid ${C.acc}`, padding: "14px 24px", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "transparent", border: `1px solid ${C.bdr}`, color: C.muted, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
          ← Back
        </button>
        <span style={{ fontWeight: 900, fontSize: 20, color: C.acc, letterSpacing: ".07em" }}>
          KAVO<span style={{ color: C.text, opacity: .3 }}>-SYS</span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>🪑 Tables Management</span>
      </header>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 800, color: C.text, fontSize: 22 }}>🪑 Restaurant Tables</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
                Manage floor tables — used in POS for dine-in orders
              </div>
            </div>
            <button onClick={() => setForm({ number: "", label: "", capacity: 4, status: "Available", active: true, notes: "" })}
              style={{ background: C.acc, color: "#000", border: "none", borderRadius: 10, padding: "11px 20px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              + Add Table
            </button>
          </div>

          {/* Table grid */}
          {tables.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: C.muted, background: C.card, borderRadius: 16, border: `1px solid ${C.bdr}` }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🪑</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No tables yet</div>
              <div style={{ fontSize: 13 }}>Click + Add Table to create your floor plan.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginBottom: 20 }}>
              {tables.map(table => {
                const cfg = TABLE_STATUS_CFG[table.status] || TABLE_STATUS_CFG.Available;
                return (
                  <div key={table.id} style={{ background: cfg.bg, border: `2px solid ${cfg.col}40`, borderRadius: 14, padding: 18, opacity: table.active === false ? 0.45 : 1, transition: "transform 0.15s", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 900, color: C.acc, fontSize: 26, fontFamily: "'JetBrains Mono',monospace" }}>
                          {table.number}
                        </div>
                        {table.label && table.label !== table.number && (
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{table.label}</div>
                        )}
                        {table.capacity > 0 && (
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>👥 {table.capacity} seats</div>
                        )}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); cycleStatus(table); }}
                        style={{ background: cfg.col + "20", border: `1px solid ${cfg.col}50`, color: cfg.col, borderRadius: 20, padding: "4px 11px", fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        {cfg.icon} {table.status}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={(e) => { e.stopPropagation(); setForm({ ...table }); }}
                        style={{ flex: 1, background: "transparent", border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "7px 0", color: C.muted, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        ✏ Edit
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDelId(table.id); }}
                        style={{ background: "transparent", border: `1px solid ${C.danger}40`, borderRadius: 8, padding: "7px 11px", color: C.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit modal */}
      {form && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div style={{ background: C.surf, border: `2px solid ${C.bdr}`, borderRadius: 16, padding: 28, width: 420, maxWidth: "96vw" }}>
            <div style={{ fontWeight: 800, color: C.text, fontSize: 18, marginBottom: 20 }}>
              {form.id ? "✏ Edit Table" : "🆕 New Table"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <FLabel>TABLE NUMBER *</FLabel>
                <input value={form.number || ""} onChange={e => setF("number", e.target.value)}
                  placeholder="1" autoFocus
                  style={{ width: "100%", background: C.bg, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 14, fontFamily: "'JetBrains Mono',monospace", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <FLabel>CAPACITY</FLabel>
                <input type="number" min="1" max="50" value={form.capacity || ""} onChange={e => setF("capacity", +e.target.value)}
                  placeholder="4"
                  style={{ width: "100%", background: C.bg, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <FLabel>LABEL (optional)</FLabel>
              <input value={form.label || ""} onChange={e => setF("label", e.target.value)}
                placeholder="e.g. Window Seat, VIP Booth"
                style={{ width: "100%", background: C.bg, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <FLabel>STATUS</FLabel>
              <select value={form.status || "Available"} onChange={e => setF("status", e.target.value)}
                style={{ width: "100%", background: C.bg, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 14, fontFamily: "inherit" }}>
                {Object.values(TABLE_STATUSES).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <input type="checkbox" id="tbl-active" checked={form.active !== false}
                onChange={e => setF("active", e.target.checked)} />
              <label htmlFor="tbl-active" style={{ fontSize: 13, color: C.muted, cursor: "pointer" }}>Active (shown in POS)</label>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={saveTable} disabled={saving}
                style={{ flex: 2, background: C.acc, color: "#000", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                {saving ? "Saving…" : "💾 Save"}
              </button>
              <button onClick={() => setForm(null)}
                style={{ flex: 1, background: "transparent", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "11px 0", color: C.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: C.surf, border: `2px solid ${C.bdr}`, borderRadius: 14, padding: 26, maxWidth: 360, width: "96vw", textAlign: "center" }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>🗑</div>
            <div style={{ fontWeight: 800, color: C.text, fontSize: 16, marginBottom: 8 }}>Delete this table?</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => deleteTable(delId)}
                style={{ flex: 1, background: C.danger, color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
              <button onClick={() => setDelId(null)}
                style={{ flex: 1, background: "transparent", border: `1px solid ${C.bdr}`, borderRadius: 10, padding: "11px 0", color: C.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div style={{ position: "fixed", bottom: 30, right: 30, background: toast.type === "err" ? C.danger : toast.type === "warn" ? C.warn : C.success, color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 10000, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
