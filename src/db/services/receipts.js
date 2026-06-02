import { db, safeDB } from "../db.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Receipts Service  ·  IndexedDB-backed
══════════════════════════════════════════════════════ */

const safeArr = (v, d = []) => Array.isArray(v) ? v : d;
const MAX_RECEIPTS = 1000;

export const ReceiptService = {
  /** Save a new receipt (auto-caps at MAX_RECEIPTS) */
  async save(receiptData) {
    await safeDB(async () => {
      await db.receipts.put(receiptData);
      // Trim oldest if over cap
      const count = await db.receipts.count();
      if (count > MAX_RECEIPTS) {
        const oldest = await db.receipts
          .orderBy("printedAt")
          .limit(count - MAX_RECEIPTS)
          .toArray();
        await db.receipts.bulkDelete(oldest.map(r => r.receiptId));
      }
    });
  },

  /** Get all receipts, newest first */
  async getAll() {
    const recs = await safeDB(() =>
      db.receipts.orderBy("printedAt").reverse().toArray(), []
    );
    return safeArr(recs);
  },

  /** Search receipts */
  async search(query) {
    if (!query) return ReceiptService.getAll();
    const q = query.toLowerCase();
    const all = await ReceiptService.getAll();
    return all.filter(r => {
      const o = r.order || {};
      return (
        (r.receiptId || "").toLowerCase().includes(q) ||
        (o.orderNo   || "").toLowerCase().includes(q) ||
        (o.custName  || "").toLowerCase().includes(q) ||
        (r.printedDate || "").toLowerCase().includes(q) ||
        (o.payMethod || "").toLowerCase().includes(q)
      );
    });
  },

  /** Get one receipt */
  async getOne(receiptId) {
    return safeDB(() => db.receipts.get(receiptId));
  },

  /** Delete a receipt */
  async delete(receiptId) {
    return safeDB(() => db.receipts.delete(receiptId));
  },

  /** Bulk import (restore) */
  async bulkImport(receipts) {
    if (!Array.isArray(receipts) || receipts.length === 0) return;
    return safeDB(() => db.receipts.bulkPut(receipts));
  },
};
