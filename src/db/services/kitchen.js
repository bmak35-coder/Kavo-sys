import { db, safeDB } from "../db.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Kitchen Service  ·  v2.0
   Supports: Cancelled status · Priority field
   For WebSocket real-time later: replace safeDB with
   socket.emit() + listen in a separate channel.
══════════════════════════════════════════════════════ */

function safeArr(v, d) { return Array.isArray(v) ? v : (d || []); }

export const KITCHEN_STATUSES = ["New", "Preparing", "Ready", "Served", "Cancelled"];
export const ACTIVE_STATUSES  = ["New", "Preparing", "Ready"];

export const KitchenService = {
  /** Get all kitchen orders newest first */
  async getAll() {
    const orders = await safeDB(() =>
      db.kitchenOrders.orderBy("sentAt").reverse().toArray(), []
    );
    return safeArr(orders);
  },

  /** Get only active (not Served/Cancelled) orders */
  async getActive() {
    const all = await KitchenService.getAll();
    return all.filter(o => ACTIVE_STATUSES.includes(o.status));
  },

  /** Upsert a kitchen order (used by POS to push and Kitchen to update) */
  async save(order) {
    if (!order || !order.id) return null;
    return safeDB(() => db.kitchenOrders.put(order));
  },

  /** Advance order to next logical status */
  async advance(id) {
    return safeDB(async () => {
      const order = await db.kitchenOrders.get(id);
      if (!order) return null;
      // Status chain: New→Preparing→Ready→Served
      const chain = ["New", "Preparing", "Ready", "Served"];
      const idx   = chain.indexOf(order.status);
      const next  = chain[idx + 1];
      if (!next) return order;
      const updated = { ...order, status: next, updatedAt: new Date().toISOString() };
      await db.kitchenOrders.put(updated);
      return updated;
    });
  },

  /** Cancel an order */
  async cancel(id) {
    return safeDB(async () => {
      const order = await db.kitchenOrders.get(id);
      if (!order) return null;
      const updated = { ...order, status: "Cancelled", updatedAt: new Date().toISOString() };
      await db.kitchenOrders.put(updated);
      return updated;
    });
  },

  /** Set priority on an order */
  async setPriority(id, priority) {
    return safeDB(async () => {
      const order = await db.kitchenOrders.get(id);
      if (!order) return null;
      const updated = { ...order, priority, updatedAt: new Date().toISOString() };
      await db.kitchenOrders.put(updated);
      return updated;
    });
  },

  /** Delete a single order from kitchen queue */
  async delete(id) {
    return safeDB(() => db.kitchenOrders.delete(id));
  },

  /** Clear all completed (Served + Cancelled) orders */
  async clearServed() {
    return safeDB(async () => {
      const done = await db.kitchenOrders.toArray().then(
        all => all.filter(o => o.status === "Served" || o.status === "Cancelled")
      );
      const ids = done.map(o => o.id);
      if (ids.length) await db.kitchenOrders.bulkDelete(ids);
      return ids.length;
    }, 0);
  },

  /** Replace entire queue (used in backup restore) */
  async replaceAll(orders) {
    return safeDB(async () => {
      await db.kitchenOrders.clear();
      if (orders.length > 0) await db.kitchenOrders.bulkPut(orders);
    });
  },

  /** Bulk import (alias for replaceAll compat) */
  async bulkImport(orders) {
    return safeDB(() => db.kitchenOrders.bulkPut(orders));
  },
};
