import { db, safeDB } from "../db.js";
import { InventoryService } from "./inventory.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Purchasing Service  ·  v1.0
   Suppliers + Purchase Orders + Stock Receiving
   ─────────────────────────────────────────────────────
   ACCOUNTING READY: poItems rows carry unitCost/total
   so they can feed directly into a GL/AP system later.
   MULTI-BRANCH: add branchId to suppliers + POs.
   CLOUD SWAP: replace safeDB(() => db.…) with API calls.
══════════════════════════════════════════════════════ */

const safeArr = (v, d = []) => Array.isArray(v) ? v : d;
const safeNum = (v) => { const n = +v; return isFinite(n) ? n : 0; };
const nowISO  = () => new Date().toISOString();

// ─── PO STATUS ────────────────────────────────────────
export const PO_STATUSES = ["Draft", "Ordered", "Received", "Cancelled"];
export const PO_STATUS_CFG = {
  Draft:     { color:"#7d8fa0", bg:"#7d8fa018", icon:"📝" },
  Ordered:   { color:"#58a6ff", bg:"#58a6ff18", icon:"📦" },
  Received:  { color:"#3fb950", bg:"#3fb95018", icon:"✅" },
  Cancelled: { color:"#f85149", bg:"#f8514918", icon:"🚫" },
};

// ─── PO NUMBER GENERATOR ──────────────────────────────
// Format: PO-YYYYMMDD-NNN (zero-padded daily counter)
async function genPoNumber() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return safeDB(async () => {
    const prefix  = `PO-${today}-`;
    const allPos  = await db.purchaseOrders
      .where("poNo").startsWith(prefix).toArray();
    const maxSeq  = allPos.reduce((max, po) => {
      const seq = parseInt(po.poNo.slice(-3)) || 0;
      return Math.max(max, seq);
    }, 0);
    return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
  }, `PO-${today}-001`);
}

// ══════════════════════════════════════════════════════
//   SUPPLIER SERVICE
// ══════════════════════════════════════════════════════
export const SupplierService = {
  async getAll() {
    const rows = await safeDB(() =>
      db.suppliers.orderBy("name").toArray(), []
    );
    return safeArr(rows);
  },

  async getActive() {
    const all = await SupplierService.getAll();
    return all.filter(s => s.status !== "inactive");
  },

  async getOne(id) {
    return safeDB(() => db.suppliers.get(id), null);
  },

  async save(supplier) {
    const toSave = {
      ...supplier,
      id:        supplier.id || `sup_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      status:    supplier.status || "active",
      createdAt: supplier.createdAt || nowISO(),
      updatedAt: nowISO(),
    };
    await safeDB(() => db.suppliers.put(toSave));
    return toSave;
  },

  async delete(id) {
    // Soft-delete: mark inactive + detach from future POs
    return safeDB(() => db.suppliers.update(id, { status: "inactive", updatedAt: nowISO() }));
  },

  async hardDelete(id) {
    return safeDB(() => db.suppliers.delete(id));
  },

  /** Stats for a supplier: total POs, total spend, last order */
  async getStats(supplierId) {
    return safeDB(async () => {
      const pos = await db.purchaseOrders
        .where("supplierId").equals(supplierId).toArray();
      const received  = pos.filter(p => p.status === "Received");
      const totalSpend= received.reduce((s, p) => s + safeNum(p.total), 0);
      const lastOrder = pos.length
        ? pos.sort((a, b) => b.orderDate.localeCompare(a.orderDate))[0]
        : null;
      return {
        totalOrders: pos.length,
        receivedOrders: received.length,
        totalSpend,
        lastOrderDate: lastOrder?.orderDate || null,
      };
    }, { totalOrders: 0, receivedOrders: 0, totalSpend: 0, lastOrderDate: null });
  },

  async bulkImport(suppliers) {
    if (!Array.isArray(suppliers) || !suppliers.length) return;
    return safeDB(() => db.suppliers.bulkPut(suppliers));
  },
};

// ══════════════════════════════════════════════════════
//   PURCHASE ORDER SERVICE
// ══════════════════════════════════════════════════════
export const PurchaseOrderService = {
  // ── CRUD ──────────────────────────────────────────
  async getAll() {
    const pos = await safeDB(() =>
      db.purchaseOrders.orderBy("createdAt").reverse().toArray(), []
    );
    return safeArr(pos);
  },

  async getOne(id) {
    return safeDB(async () => {
      const po    = await db.purchaseOrders.get(id);
      if (!po) return null;
      const items = await db.poItems.where("poId").equals(id).toArray();
      return { ...po, items: safeArr(items) };
    }, null);
  },

  async getBySupplier(supplierId) {
    return safeDB(() =>
      db.purchaseOrders.where("supplierId").equals(supplierId)
        .reverse().sortBy("createdAt"), []
    );
  },

  async getByStatus(status) {
    return safeDB(() =>
      db.purchaseOrders.where("status").equals(status)
        .reverse().sortBy("createdAt"), []
    );
  },

  // ── CREATE ────────────────────────────────────────
  async create(poData) {
    const poNo = await genPoNumber();
    const total = safeArr(poData.items).reduce(
      (s, i) => s + safeNum(i.qty) * safeNum(i.unitCost), 0
    );
    const po = {
      id:           `po_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      poNo,
      supplierId:   poData.supplierId || "",
      supplierName: poData.supplierName || "",
      status:       "Draft",
      orderDate:    poData.orderDate   || new Date().toISOString().slice(0, 10),
      deliveryDate: poData.deliveryDate || "",
      notes:        poData.notes || "",
      total,
      createdAt:    nowISO(),
      updatedAt:    nowISO(),
      receivedAt:   null,
      createdBy:    poData.createdBy || "admin",
    };

    await safeDB(async () => {
      await db.purchaseOrders.add(po);
      // Insert line items
      const lineItems = safeArr(poData.items).map(i => ({
        poId:              po.id,
        inventoryItemId:   i.inventoryItemId,
        inventoryItemName: i.inventoryItemName || "",
        unit:              i.unit || "piece",
        qty:               safeNum(i.qty),
        unitCost:          safeNum(i.unitCost),
        total:             safeNum(i.qty) * safeNum(i.unitCost),
        receivedQty:       0,
      }));
      if (lineItems.length) await db.poItems.bulkAdd(lineItems);
    });

    return po;
  },

  // ── UPDATE HEADER (status, dates, notes) ──────────
  async update(id, changes) {
    const updatedAt = nowISO();
    // Recalc total if items changed
    let extra = {};
    if (changes.items) {
      const total = safeArr(changes.items).reduce(
        (s, i) => s + safeNum(i.qty) * safeNum(i.unitCost), 0
      );
      extra = { total };
      // Replace all line items
      await safeDB(async () => {
        await db.poItems.where("poId").equals(id).delete();
        const lineItems = safeArr(changes.items).map(i => ({
          poId:              id,
          inventoryItemId:   i.inventoryItemId,
          inventoryItemName: i.inventoryItemName || "",
          unit:              i.unit || "piece",
          qty:               safeNum(i.qty),
          unitCost:          safeNum(i.unitCost),
          total:             safeNum(i.qty) * safeNum(i.unitCost),
          receivedQty:       0,
        }));
        if (lineItems.length) await db.poItems.bulkAdd(lineItems);
      });
    }
    const { items: _items, ...rest } = changes;
    await safeDB(() =>
      db.purchaseOrders.update(id, { ...rest, ...extra, updatedAt })
    );
  },

  // ── DELETE (only Draft / Cancelled) ───────────────
  async delete(id) {
    return safeDB(async () => {
      await db.poItems.where("poId").equals(id).delete();
      await db.purchaseOrders.delete(id);
    });
  },

  // ── RECEIVE PO ────────────────────────────────────
  // Marks PO as Received and triggers inventory stock increase
  // for each line item. Also updates inventory average cost.
  async receive(id, userId = "admin") {
    return safeDB(async () => {
      const po    = await db.purchaseOrders.get(id);
      if (!po) throw new Error("PO not found");
      if (po.status === "Received") throw new Error("PO already received");
      if (po.status === "Cancelled") throw new Error("Cannot receive a cancelled PO");

      const items = await db.poItems.where("poId").equals(id).toArray();
      const results = [];

      for (const item of safeArr(items)) {
        try {
          const result = await InventoryService.receiveStock(
            item.inventoryItemId,
            item.qty,
            item.unitCost,
            id,
            po.poNo,
            userId
          );
          // Mark line item as received
          await db.poItems.update(item.id, { receivedQty: item.qty, receivedAt: nowISO() });
          results.push({ ...item, result, success: true });
        } catch (err) {
          results.push({ ...item, error: err.message, success: false });
        }
      }

      await db.purchaseOrders.update(id, {
        status:     "Received",
        receivedAt: nowISO(),
        updatedAt:  nowISO(),
        receivedBy: userId,
      });

      return results;
    }, []);
  },

  // ── CANCEL ────────────────────────────────────────
  async cancel(id, reason = "") {
    return safeDB(() =>
      db.purchaseOrders.update(id, {
        status:    "Cancelled",
        notes:     reason,
        updatedAt: nowISO(),
      })
    );
  },

  // ── REPORTS ───────────────────────────────────────
  /** Aggregate spending by supplier */
  async spendBySupplier() {
    const pos = await PurchaseOrderService.getAll();
    const received = pos.filter(p => p.status === "Received");
    const map = {};
    received.forEach(p => {
      if (!map[p.supplierId]) map[p.supplierId] = {
        supplierId: p.supplierId, supplierName: p.supplierName,
        total: 0, orders: 0,
      };
      map[p.supplierId].total  += safeNum(p.total);
      map[p.supplierId].orders += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  },

  /** Most purchased inventory items across all received POs */
  async topPurchasedItems(limit = 10) {
    const allPoIds = await safeDB(() =>
      db.purchaseOrders.where("status").equals("Received").primaryKeys(), []
    );
    const allItems = await safeDB(() => db.poItems.toArray(), []);
    const received = allItems.filter(i => safeArr(allPoIds).includes(i.poId));
    const map = {};
    received.forEach(i => {
      const k = i.inventoryItemId;
      if (!map[k]) map[k] = { id: k, name: i.inventoryItemName, qty: 0, spend: 0, orders: 0 };
      map[k].qty   += safeNum(i.qty);
      map[k].spend += safeNum(i.total);
      map[k].orders += 1;
    });
    return Object.values(map).sort((a, b) => b.spend - a.spend).slice(0, limit);
  },

  /** Monthly purchase totals for chart */
  async monthlyTotals(months = 6) {
    const pos = await PurchaseOrderService.getAll();
    const received = pos.filter(p => p.status === "Received" && p.orderDate);
    const buckets = {};
    received.forEach(p => {
      const key = p.orderDate.slice(0, 7); // YYYY-MM
      buckets[key] = (buckets[key] || 0) + safeNum(p.total);
    });
    // Fill last N months
    const result = [];
    for (let i = months - 1; i >= 0; i--) {
      const d   = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      result.push({ month: key, total: buckets[key] || 0 });
    }
    return result;
  },

  /** Dashboard summary */
  async getDashboardStats() {
    const all       = await PurchaseOrderService.getAll();
    const draft     = all.filter(p => p.status === "Draft").length;
    const ordered   = all.filter(p => p.status === "Ordered").length;
    const received  = all.filter(p => p.status === "Received");
    const cancelled = all.filter(p => p.status === "Cancelled").length;
    const totalSpend= received.reduce((s, p) => s + safeNum(p.total), 0);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthSpend= received
      .filter(p => (p.orderDate || "").startsWith(thisMonth))
      .reduce((s, p) => s + safeNum(p.total), 0);
    return { total: all.length, draft, ordered, received: received.length, cancelled, totalSpend, monthSpend };
  },

  async bulkImport(pos, poItems) {
    if (Array.isArray(pos) && pos.length)
      await safeDB(() => db.purchaseOrders.bulkPut(pos));
    if (Array.isArray(poItems) && poItems.length)
      await safeDB(() => db.poItems.bulkPut(poItems));
  },
};
