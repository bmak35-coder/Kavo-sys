/**
 * KAVO-SYS · Activity Log Service · v2.0 (hardened)
 *
 * DESIGN RULES — prevents TDZ crash and circular imports:
 *  1. Imports ONLY "../db.js" — no auth, no React, no other services.
 *  2. Session state set by AuthProvider AFTER React mounts. Never read at module eval time.
 *  3. Every write wrapped in try/catch. Logging failure NEVER crashes the app.
 *  4. writeLog() guards: db open? session present? valid action?
 *  5. All exports are `function` declarations (hoisted) — zero TDZ risk.
 *  6. No log written during module init — only on explicit user-interaction calls.
 */

import { db, safeDB } from "../db.js";

const MAX_LOGS = 10000;

// ── Action types ─────────────────────────────────────
export const LOG_ACTION = {
  LOGIN:"auth.login", LOGOUT:"auth.logout",
  USER_CREATED:"user.created", USER_UPDATED:"user.updated",
  USER_DELETED:"user.deleted", PASSWORD_CHANGED:"user.password_changed",
  ROLE_CHANGED:"user.role_changed",
  ORDER_CREATED:"order.created", ORDER_PAID:"order.paid",
  ORDER_HELD:"order.held", ORDER_RESUMED:"order.resumed",
  ORDER_VOIDED:"order.voided", ORDER_REFUND:"order.refund",
  ORDER_KITCHEN:"order.sent_kitchen", DISCOUNT_APPLIED:"order.discount",
  PRICE_CHANGED:"menu.price_changed",
  MENU_ITEM_CREATED:"menu.item_created", MENU_ITEM_UPDATED:"menu.item_updated",
  MENU_ITEM_DELETED:"menu.item_deleted",
  STOCK_ADDED:"inventory.stock_added", STOCK_ADJUSTED:"inventory.stock_adjusted",
  STOCK_WASTE:"inventory.waste_logged", STOCK_RECEIVED:"inventory.stock_received",
  SETTINGS_CHANGED:"settings.changed",
  BACKUP_EXPORTED:"data.backup_exported", DATA_IMPORTED:"data.imported",
  CSV_EXPORTED:"data.csv_exported", DATA_CLEARED:"data.cleared",
  SHIFT_OPENED:"shift.opened", SHIFT_CLOSED:"shift.closed",
};

export const LOG_CATEGORIES = {
  "auth":      { label:"Authentication",  color:"#58a6ff", icon:"🔐" },
  "user":      { label:"User Management", color:"#a78bfa", icon:"👤" },
  "order":     { label:"Orders",          color:"#3fb950", icon:"🧾" },
  "menu":      { label:"Menu",            color:"#f0a500", icon:"🍽"  },
  "inventory": { label:"Inventory",       color:"#fb923c", icon:"📦" },
  "settings":  { label:"Settings",        color:"#7d8fa0", icon:"⚙"  },
  "data":      { label:"Data / Backup",   color:"#34d399", icon:"💾" },
  "shift":     { label:"Shifts",          color:"#f85149", icon:"🕐" },
};

// ── Session (set from AuthProvider after React mounts) ──
let _session = null;
export function setLogSession(session) {
  _session = (session && typeof session === "object") ? session : null;
}
export function clearLogSession() { _session = null; }

// ── Firebase dual-write (set from FirebaseServicesProvider when tenant is active) ──
let _firebaseWriter = null;
export function setFirebaseAuditWriter(fn) { _firebaseWriter = typeof fn === "function" ? fn : null; }
export function clearFirebaseAuditWriter() { _firebaseWriter = null; }

// ── DB readiness guard ────────────────────────────────
function dbReady() {
  try { return !!(db && db.isOpen()); } catch { return false; }
}

// ── Core write (function declaration = hoisted, no TDZ) ──
export async function writeLog(opts) {
  if (!opts || !opts.action) return;
  try {
    const s = _session;
    const logData = {
      action:      opts.action,
      category:    opts.action.split(".")[0] || "system",
      description: String(opts.description || ""),
      orderId:     opts.orderId   || null,
      oldValue:    opts.oldValue  != null ? JSON.stringify(opts.oldValue) : null,
      newValue:    opts.newValue  != null ? JSON.stringify(opts.newValue) : null,
      extra:       opts.extra     != null ? JSON.stringify(opts.extra)    : null,
      userId:      opts.userId    || s?.id   || "system",
      userName:    opts.userName  || s?.name || "System",
      userRole:    opts.userRole  || s?.role || "system",
      createdAt:   new Date().toISOString(),
    };

    // Write to IndexedDB if available
    if (dbReady()) {
      await db.activityLogs.add(logData);
      // Non-blocking cap trim
      db.activityLogs.count().then(n => {
        if (n > MAX_LOGS) {
          db.activityLogs.orderBy("createdAt").limit(n - MAX_LOGS)
            .primaryKeys().then(k => db.activityLogs.bulkDelete(k)).catch(() => {});
        }
      }).catch(() => {});
    }

    // Dual-write to Firebase if writer is registered (fire-and-forget)
    if (_firebaseWriter) {
      _firebaseWriter(logData).catch(() => {});
    }
  } catch (e) {
    console.warn("[KAVO-LOG] write failed (non-fatal):", e?.message || e);
  }
}

// ── Safe fire-and-forget wrapper ──────────────────────
function safeWrite(opts) {
  try { return writeLog(opts).catch(() => {}); }
  catch { return Promise.resolve(); }
}

function u(user) {
  return { userId: user?.id || null, userName: user?.name || null, userRole: user?.role || null };
}

// ── Query API ─────────────────────────────────────────
export const ActivityLogService = {
  async getAll(limit = 500) {
    try { return dbReady() ? await db.activityLogs.orderBy("createdAt").reverse().limit(limit).toArray() : []; }
    catch { return []; }
  },
  async search(query, { action, userId, fromISO, toISO, limit = 500 } = {}) {
    try {
      if (!dbReady()) return [];
      let rows = await db.activityLogs.orderBy("createdAt").reverse().limit(2000).toArray();
      if (action)  rows = rows.filter(r => r.action === action || r.category === action);
      if (userId)  rows = rows.filter(r => r.userId === userId);
      if (fromISO) rows = rows.filter(r => r.createdAt >= fromISO);
      if (toISO)   rows = rows.filter(r => r.createdAt <= toISO);
      if (query) {
        const q = query.toLowerCase();
        rows = rows.filter(r =>
          r.description?.toLowerCase().includes(q) || r.userName?.toLowerCase().includes(q) ||
          r.orderId?.toLowerCase().includes(q)     || r.action?.toLowerCase().includes(q));
      }
      return rows.slice(0, limit);
    } catch { return []; }
  },
  async getCount() {
    try { return dbReady() ? await db.activityLogs.count() : 0; } catch { return 0; }
  },
  async clearAll() {
    try { if (dbReady()) await db.activityLogs.clear(); } catch {}
  },
  async bulkImport(logs) {
    if (!Array.isArray(logs) || !logs.length) return;
    try {
      if (!dbReady()) return;
      await db.activityLogs.bulkAdd(logs.map(({ id: _id, ...rest }) => rest));
    } catch {}
  },
  toCSV(logs) {
    if (!Array.isArray(logs)) return "";
    const e = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const h = ["ID","Date","Time","User","Role","Action","Category","Description","Order ID","Old Value","New Value"].map(e).join(",");
    const rows = logs.map(l => {
      const d = new Date(l.createdAt);
      return [l.id, d.toLocaleDateString("en-GB"),
        d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),
        l.userName, l.userRole, l.action, l.category,
        l.description, l.orderId||"", l.oldValue||"", l.newValue||""].map(e).join(",");
    });
    return h + "\n" + rows.join("\n");
  },
};

// ── Typed convenience wrappers ────────────────────────
export const logAuth = {
  login:  (user) => safeWrite({ action:LOG_ACTION.LOGIN,  description:`${user?.name||"?"} signed in`,  ...u(user) }),
  logout: (user) => safeWrite({ action:LOG_ACTION.LOGOUT, description:`${user?.name||"?"} signed out`, ...u(user) }),
};

export const logOrder = {
  created:  (o, user) => safeWrite({ action:LOG_ACTION.ORDER_CREATED,  description:`Order ${o?.orderNo} created (${o?.type||""})`, orderId:o?.orderNo, ...u(user) }),
  paid:     (o, user) => safeWrite({ action:LOG_ACTION.ORDER_PAID,     description:`Order ${o?.orderNo} paid — ${o?.payMethod||""} ${Number(o?.grand||0).toFixed(2)}`, orderId:o?.orderNo, ...u(user) }),
  held:     (o, user) => safeWrite({ action:LOG_ACTION.ORDER_HELD,     description:`Order ${o?.orderNo} placed on hold`, orderId:o?.orderNo, ...u(user) }),
  resumed:  (o, user) => safeWrite({ action:LOG_ACTION.ORDER_RESUMED,  description:`Order ${o?.orderNo} resumed from hold`, orderId:o?.orderNo, ...u(user) }),
  voided:   (no,user) => safeWrite({ action:LOG_ACTION.ORDER_VOIDED,   description:`Order ${no} voided`, orderId:no, ...u(user) }),
  kitchen:  (o, user) => safeWrite({ action:LOG_ACTION.ORDER_KITCHEN,  description:`Order ${o?.orderNo} sent to kitchen`, orderId:o?.orderNo, ...u(user) }),
  discount: (o,pct,amt,user) => safeWrite({ action:LOG_ACTION.DISCOUNT_APPLIED, description:`${pct}% discount (${amt}) on order ${o?.orderNo}`, orderId:o?.orderNo, newValue:{pct,amt}, ...u(user) }),
};

export const logMenu = {
  created: (item, user) => safeWrite({ action:LOG_ACTION.MENU_ITEM_CREATED, description:`Menu item "${item?.name}" created — price ${item?.price}`, newValue:item, ...u(user) }),
  updated: (item, prev, user) => {
    const pc = prev?.price !== item?.price;
    const ch = [];
    if (pc) ch.push(`price ${prev?.price}→${item?.price}`);
    if (prev?.name !== item?.name) ch.push(`name "${prev?.name}"→"${item?.name}"`);
    return safeWrite({ action: pc ? LOG_ACTION.PRICE_CHANGED : LOG_ACTION.MENU_ITEM_UPDATED,
      description:`Menu item "${item?.name}" updated${ch.length?`: ${ch.join(", ")}` :""}`,
      oldValue:prev, newValue:item, ...u(user) });
  },
  deleted: (item, user) => safeWrite({ action:LOG_ACTION.MENU_ITEM_DELETED, description:`Menu item "${item?.name}" deleted`, oldValue:item, ...u(user) }),
};

export const logInventory = {
  added:    (item, qty, note, user) => safeWrite({ action:LOG_ACTION.STOCK_ADDED,    description:`Stock added: +${qty} ${item?.unit||""} of "${item?.name}"${note?` (${note})`:""}`, newValue:{qty,note}, ...u(user) }),
  adjusted: (item, from, to, note, user) => safeWrite({ action:LOG_ACTION.STOCK_ADJUSTED, description:`Stock adjusted: "${item?.name}" ${from}→${to} ${item?.unit||""}${note?` (${note})`:""}`, oldValue:from, newValue:to, ...u(user) }),
  waste:    (item, qty, note, user) => safeWrite({ action:LOG_ACTION.STOCK_WASTE,    description:`Waste logged: ${qty} ${item?.unit||""} of "${item?.name}"${note?` (${note})`:""}`, newValue:{qty,note}, ...u(user) }),
  received: (poNo, count, user)     => safeWrite({ action:LOG_ACTION.STOCK_RECEIVED, description:`PO ${poNo} received — ${count} line item(s) updated`, ...u(user) }),
};

export const logSettings = {
  changed: (section, oldVals, newVals, user) => safeWrite({ action:LOG_ACTION.SETTINGS_CHANGED, description:`Settings updated: ${section}`, oldValue:oldVals, newValue:newVals, ...u(user) }),
};

export const logData = {
  backupExported: (user)           => safeWrite({ action:LOG_ACTION.BACKUP_EXPORTED, description:"Full database backup exported", ...u(user) }),
  csvExported:    (type,count,user)=> safeWrite({ action:LOG_ACTION.CSV_EXPORTED,    description:`${type} exported as CSV (${count} records)`, ...u(user) }),
  imported:       (meta, user)     => safeWrite({ action:LOG_ACTION.DATA_IMPORTED,   description:`Backup restored from ${meta?.version||"?"} (${meta?.exportedAt ? new Date(meta.exportedAt).toLocaleDateString("en-GB") : "unknown"})`, ...u(user) }),
  cleared:        (type, user)     => safeWrite({ action:LOG_ACTION.DATA_CLEARED,    description:`${type} data cleared`, ...u(user) }),
};

export const logUser = {
  created: (target, user) => safeWrite({ action:LOG_ACTION.USER_CREATED, description:`User "${target?.name}" created with role ${target?.role}`, newValue:{username:target?.username,role:target?.role}, ...u(user) }),
  updated: (target, prev, user) => {
    const ch = [];
    if (prev?.role !== target?.role) ch.push(`role ${prev?.role}→${target?.role}`);
    if (prev?.name !== target?.name) ch.push(`name "${prev?.name}"→"${target?.name}"`);
    if (target?._passwordChanged) ch.push("password changed");
    return safeWrite({ action: target?._passwordChanged ? LOG_ACTION.PASSWORD_CHANGED : LOG_ACTION.USER_UPDATED,
      description:`User "${target?.name}" updated${ch.length?`: ${ch.join(", ")}` :""}`,
      oldValue:{username:prev?.username,role:prev?.role}, newValue:{username:target?.username,role:target?.role}, ...u(user) });
  },
  deleted: (target, user) => safeWrite({ action:LOG_ACTION.USER_DELETED, description:`User "${target?.name}" (@${target?.username}) deleted`, oldValue:{username:target?.username,role:target?.role}, ...u(user) }),
};

export const logShift = {
  opened: (shift, user) => safeWrite({ action:LOG_ACTION.SHIFT_OPENED, description:`Shift ${shift?.id} opened — opening cash ${shift?.openingCash||0}`, ...u(user) }),
  closed: (shift, user) => safeWrite({ action:LOG_ACTION.SHIFT_CLOSED, description:`Shift ${shift?.id} closed — total sales ${Number(shift?.summary?.total||0).toFixed(2)}`, ...u(user) }),
};
