/**
 * KAVO-SYS · Restaurant Tables Service
 * Storage: localStorage key "kavo_restaurant_tables"
 * Uses same pattern as kavo_held / kavo_kitchen — no Dexie calls.
 */

const LS_KEY = "kavo_restaurant_tables";

function nowISO() { return new Date().toISOString(); }

function safeArr(v) { return Array.isArray(v) ? v : []; }

function lsGet() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") || []; }
  catch(_) { return []; }
}

function lsSave(tables) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(tables)); } catch(_) {}
}

export const TABLE_STATUSES = {
  AVAILABLE: "Available",
  OCCUPIED:  "Occupied",
  RESERVED:  "Reserved",
  CLEANING:  "Cleaning",
};

export const TABLE_STATUS_CFG = {
  Available: { col:"#3fb950", bg:"#0d1a10", icon:"✅" },
  Occupied:  { col:"#f85149", bg:"#160808", icon:"🔴" },
  Reserved:  { col:"#f0a500", bg:"#1a1408", icon:"⏳" },
  Cleaning:  { col:"#7d8590", bg:"#0e1420", icon:"🧹" },
};

export const TableService = {
  /** Get all tables sorted by number */
  getAll() {
    const tables = safeArr(lsGet());
    return tables.sort((a, b) => {
      const na = parseInt(a.number) || 0, nb = parseInt(b.number) || 0;
      return na !== nb ? na - nb : String(a.number).localeCompare(String(b.number));
    });
  },

  /** Get only active tables */
  getActive() {
    return TableService.getAll().filter(t => t.active !== false);
  },

  /** Get a single table by id */
  get(id) {
    return lsGet().find(t => t.id === id) || null;
  },

  /** Save (upsert) a table — returns the saved record */
  save(table) {
    const all = safeArr(lsGet());
    const record = {
      id:        table.id || `tbl_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
      number:    String(table.number || "").trim(),
      label:     String(table.label  || table.number || "").trim(),
      capacity:  Number(table.capacity) || 0,
      status:    table.status    || TABLE_STATUSES.AVAILABLE,
      active:    table.active    !== false,
      notes:     table.notes     || "",
      updatedAt: nowISO(),
      createdAt: table.createdAt || nowISO(),
    };
    const idx = all.findIndex(t => t.id === record.id);
    if (idx >= 0) all[idx] = record; else all.push(record);
    lsSave(all);
    return record;
  },

  /** Delete a table by id */
  delete(id) {
    lsSave(safeArr(lsGet()).filter(t => t.id !== id));
  },

  /** Update specific fields on a table */
  update(id, updates) {
    const all = safeArr(lsGet());
    const idx = all.findIndex(t => t.id === id);
    if (idx >= 0) {
      all[idx] = Object.assign({}, all[idx], updates, { updatedAt: nowISO() });
      lsSave(all);
    }
  },

  /** Update status only */
  setStatus(id, status) {
    TableService.update(id, { status });
  },

  /** Mark Occupied */
  occupy(id) { TableService.setStatus(id, TABLE_STATUSES.OCCUPIED); },

  /** Mark Available */
  release(id) { TableService.setStatus(id, TABLE_STATUSES.AVAILABLE); },

  /** Transfer: release fromId, occupy toId */
  transfer(fromId, toId) {
    TableService.release(fromId);
    TableService.occupy(toId);
  },

  /** Seed default tables 1–10 if storage is empty */
  seedIfEmpty() {
    const existing = safeArr(lsGet());
    if (existing.length > 0) return;
    const seeds = [];
    for (let i = 1; i <= 10; i++) {
      seeds.push({
        id: `tbl_default_${i}`, number: String(i), label: `Table ${i}`,
        capacity: 4, status: TABLE_STATUSES.AVAILABLE,
        active: true, notes: "", updatedAt: nowISO(), createdAt: nowISO(),
      });
    }
    lsSave(seeds);
  },

  /** Export raw array (for backup) */
  exportAll() { return safeArr(lsGet()); },

  /** Bulk import / restore (replaces current data) */
  importAll(tables) {
    if (Array.isArray(tables) && tables.length > 0) lsSave(tables);
  },

  /** Used by backup.js — synchronous-safe JSON payload */
  getForBackup() { return safeArr(lsGet()); },
};
