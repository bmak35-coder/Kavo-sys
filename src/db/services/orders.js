import { db, safeDB } from "../db.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Orders Service  ·  IndexedDB-backed
   Replace safeDB() calls with fetch/Supabase for cloud.
══════════════════════════════════════════════════════ */

const safeArr = (v, d = []) => Array.isArray(v) ? v : d;

// ── ORDERS ────────────────────────────────────────────
export const OrderService = {
  /** Save (upsert) a single order */
  async save(order) {
    return safeDB(() => db.orders.put(order));
  },

  /** Get all orders, newest first */
  async getAll() {
    const orders = await safeDB(() =>
      db.orders.orderBy("savedAt").reverse().toArray(), []
    );
    return safeArr(orders);
  },

  /** Get orders for a date string (e.g. "Mon Jun 01 2025") */
  async getByDate(dateStr) {
    const all = await OrderService.getAll();
    return all.filter(o => {
      try { return new Date(o.savedAt).toDateString() === dateStr; } catch { return false; }
    });
  },

  /** Get orders in a date range */
  async getByRange(fromMs, toMs) {
    const all = await safeDB(() =>
      db.orders.orderBy("savedAt").reverse().toArray(), []
    );
    return safeArr(all).filter(o => {
      try {
        const t = new Date(o.savedAt).getTime();
        return t >= fromMs && t <= toMs;
      } catch { return false; }
    });
  },

  /** Get only paid orders */
  async getPaid() {
    return safeDB(() =>
      db.orders.where("status").equals("Paid").reverse().sortBy("savedAt"), []
    );
  },

  /** Get a single order by orderNo */
  async getOne(orderNo) {
    return safeDB(() => db.orders.get(orderNo));
  },

  /** Delete an order */
  async delete(orderNo) {
    return safeDB(() => db.orders.delete(orderNo));
  },

  /** Bulk import (restore from backup) */
  async bulkImport(orders) {
    if (!Array.isArray(orders) || orders.length === 0) return;
    return safeDB(() => db.orders.bulkPut(orders));
  },
};

// ── HELD ORDERS ───────────────────────────────────────
export const HeldOrderService = {
  async getAll() {
    const held = await safeDB(() => db.heldOrders.toArray(), []);
    return safeArr(held);
  },

  async save(heldOrder) {
    return safeDB(() => db.heldOrders.put(heldOrder));
  },

  async delete(orderNo) {
    return safeDB(() => db.heldOrders.delete(orderNo));
  },

  async clear() {
    return safeDB(() => db.heldOrders.clear());
  },
};
