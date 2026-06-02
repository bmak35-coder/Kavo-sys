import { db, safeDB } from "../db.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Inventory Service  ·  v1.0
   Offline-first · IndexedDB-backed
   ─────────────────────────────────────────────────────
   MULTI-BRANCH READY: add branchId field to every
   item/log and filter by branchId in queries.
   CLOUD SWAP: replace safeDB(() => db.table…) with
   fetch('/api/inventory/…') keeping same return shapes.
══════════════════════════════════════════════════════ */

const safeArr = (v, d = []) => Array.isArray(v) ? v : d;
const safeNum = (v) => { const n = +v; return isFinite(n) ? n : 0; };
const nowISO  = () => new Date().toISOString();

// ─── LOG TYPES ────────────────────────────────────────
export const LOG_TYPES = {
  ADD:      "add",       // manual stock add
  DEDUCT:   "deduct",    // auto-deduct from order
  ADJUST:   "adjust",    // manual correction
  WASTE:    "waste",     // waste/spoilage
  PURCHASE: "purchase",  // stock received from a PO
  TRANSFER: "transfer",  // future multi-branch
};

// ─── UNIT DISPLAY ─────────────────────────────────────
export const UNITS = ["kg","g","liter","ml","piece","box","bottle","bag"];
export const unitLabel = (qty, unit) => {
  const n = safeNum(qty);
  const u = unit || "piece";
  if (u === "piece" && n === 1) return "1 pc";
  if (u === "piece") return `${n} pcs`;
  return `${n} ${u}`;
};

// ══════════════════════════════════════════════════════
//   INVENTORY ITEMS
// ══════════════════════════════════════════════════════
export const InventoryService = {

  // ── CRUD ──────────────────────────────────────────
  async getAll() {
    const items = await safeDB(() =>
      db.inventoryItems.orderBy("name").toArray(), []
    );
    return safeArr(items);
  },

  async getOne(id) {
    return safeDB(() => db.inventoryItems.get(id), null);
  },

  async getByCategory(category) {
    return safeDB(() =>
      db.inventoryItems.where("category").equals(category).toArray(), []
    );
  },

  async save(item) {
    const toSave = {
      ...item,
      id:          item.id || `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      updatedAt:   nowISO(),
      createdAt:   item.createdAt || nowISO(),
      currentStock: safeNum(item.currentStock),
      minStock:     safeNum(item.minStock),
      costPrice:    safeNum(item.costPrice),
    };
    await safeDB(() => db.inventoryItems.put(toSave));
    return toSave;
  },

  async delete(id) {
    await safeDB(() => db.inventoryItems.delete(id));
    await safeDB(() => db.stockLogs.where("itemId").equals(id).delete());
  },

  // ── STOCK OPERATIONS ──────────────────────────────
  async addStock(id, qty, note = "", userId = "system") {
    return safeDB(async () => {
      const item = await db.inventoryItems.get(id);
      if (!item) throw new Error(`Item ${id} not found`);
      const before = safeNum(item.currentStock);
      const after  = before + safeNum(qty);
      await db.inventoryItems.update(id, { currentStock: after, updatedAt: nowISO() });
      await db.stockLogs.add({
        itemId: id, itemName: item.name, type: LOG_TYPES.ADD,
        qty: safeNum(qty), before, after, note, userId, createdAt: nowISO(),
      });
      return { ...item, currentStock: after };
    });
  },

  async adjustStock(id, newQty, note = "", userId = "system") {
    return safeDB(async () => {
      const item = await db.inventoryItems.get(id);
      if (!item) throw new Error(`Item ${id} not found`);
      const before = safeNum(item.currentStock);
      const after  = safeNum(newQty);
      const diff   = after - before;
      await db.inventoryItems.update(id, { currentStock: after, updatedAt: nowISO() });
      await db.stockLogs.add({
        itemId: id, itemName: item.name, type: LOG_TYPES.ADJUST,
        qty: diff, before, after, note, userId, createdAt: nowISO(),
      });
      return { ...item, currentStock: after };
    });
  },

  async logWaste(id, qty, note = "", userId = "system") {
    return safeDB(async () => {
      const item = await db.inventoryItems.get(id);
      if (!item) return;
      const before = safeNum(item.currentStock);
      const after  = Math.max(0, before - safeNum(qty));
      await db.inventoryItems.update(id, { currentStock: after, updatedAt: nowISO() });
      await db.stockLogs.add({
        itemId: id, itemName: item.name, type: LOG_TYPES.WASTE,
        qty: safeNum(qty), before, after, note, userId, createdAt: nowISO(),
      });
    });
  },

  // ── RECEIVE STOCK FROM PURCHASE ORDER ─────────────
  // Called by PurchaseOrderService when PO is marked Received.
  // Also recalculates weighted average cost.
  async receiveStock(id, qty, unitCost, poId, poNo, userId = "system") {
    return safeDB(async () => {
      const item   = await db.inventoryItems.get(id);
      if (!item) throw new Error(`Item ${id} not found`);
      const before      = safeNum(item.currentStock);
      const after       = before + safeNum(qty);
      const oldCost     = safeNum(item.costPrice);
      const newUnitCost = safeNum(unitCost);

      // Weighted average cost  =  (oldQty × oldCost + newQty × newCost) / totalQty
      const avgCost = after > 0
        ? (before * oldCost + safeNum(qty) * newUnitCost) / after
        : newUnitCost;

      await db.inventoryItems.update(id, {
        currentStock: after,
        costPrice:    parseFloat(avgCost.toFixed(4)),
        lastPurchaseCost: newUnitCost,
        lastPurchaseDate: nowISO(),
        updatedAt:    nowISO(),
      });
      await db.stockLogs.add({
        itemId: id, itemName: item.name,
        type:   LOG_TYPES.PURCHASE,
        qty:    safeNum(qty), before, after,
        unitCost: newUnitCost,
        note:   `PO: ${poNo}`,
        poId,   userId,
        createdAt: nowISO(),
      });
      return { ...item, currentStock: after, costPrice: avgCost };
    });
  },
  async deductForOrder(orderItems, orderId, preventNegative = false) {
    return safeDB(async () => {
      const results = [];
      for (const cartItem of safeArr(orderItems)) {
        const recipe = await db.recipes.get(cartItem.id);
        if (!recipe || !Array.isArray(recipe.ingredients)) continue;

        for (const ing of recipe.ingredients) {
          const invItem = await db.inventoryItems.get(ing.inventoryItemId);
          if (!invItem) continue;

          const needed  = safeNum(ing.qty) * safeNum(cartItem.qty);
          const before  = safeNum(invItem.currentStock);
          let   after   = before - needed;

          if (preventNegative && after < 0) {
            results.push({ id: ing.inventoryItemId, name: invItem.name, blocked: true, needed, available: before });
            continue;
          }
          after = Math.max(0, after); // clamp to 0

          await db.inventoryItems.update(ing.inventoryItemId, {
            currentStock: after, updatedAt: nowISO(),
          });
          await db.stockLogs.add({
            itemId: ing.inventoryItemId, itemName: invItem.name,
            type: LOG_TYPES.DEDUCT, qty: needed, before, after,
            note: `Order ${orderId}`, orderId, userId: "pos", createdAt: nowISO(),
          });
          results.push({ id: ing.inventoryItemId, name: invItem.name, needed, before, after, blocked: false });
        }
      }
      return results;
    }, []);
  },

  // ── ALERTS ────────────────────────────────────────
  async getLowStockItems() {
    const all = await InventoryService.getAll();
    return all.filter(i => safeNum(i.currentStock) <= safeNum(i.minStock) && safeNum(i.minStock) > 0);
  },

  async getOutOfStockItems() {
    const all = await InventoryService.getAll();
    return all.filter(i => safeNum(i.currentStock) <= 0);
  },

  // ── STATS ─────────────────────────────────────────
  async getDashboardStats() {
    const all  = await InventoryService.getAll();
    const low  = all.filter(i => safeNum(i.currentStock) > 0 && safeNum(i.currentStock) <= safeNum(i.minStock));
    const out  = all.filter(i => safeNum(i.currentStock) <= 0);
    const totalValue = all.reduce((s, i) => s + safeNum(i.currentStock) * safeNum(i.costPrice), 0);
    return { total: all.length, low: low.length, out: out.length, totalValue, items: all };
  },

  // ── BULK ──────────────────────────────────────────
  async bulkImport(items) {
    if (!Array.isArray(items) || !items.length) return;
    return safeDB(() => db.inventoryItems.bulkPut(items));
  },

  /**
   * checkAvailability — safe wrapper for POS payment flow.
   * Returns [] (no issues) for items with no recipe.
   * Never throws — payment must never crash due to inventory.
   */
  async checkAvailability(cartItems) {
    try {
      const issues = [];
      for (const cartItem of safeArr(cartItems)) {
        // Safely get recipe — missing recipe = no deduction needed = no block
        let recipe = null;
        try { recipe = await db.recipes.get(cartItem.id); } catch(_) {}
        if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) continue;

        for (const ing of recipe.ingredients) {
          let invItem = null;
          try { invItem = await db.inventoryItems.get(ing.inventoryItemId); } catch(_) {}
          if (!invItem) continue;

          const needed    = safeNum(ing.qty) * safeNum(cartItem.qty);
          const available = safeNum(invItem.currentStock);
          if (available < needed) {
            issues.push({
              menuItem:   cartItem.name || "Unknown item",
              ingredient: invItem.name  || "Unknown ingredient",
              needed,
              available,
              unit:       ing.unit || "",
              critical:   available <= 0,
            });
          }
        }
      }
      return issues;
    } catch(e) {
      console.warn("[KAVO-INV] checkAvailability failed silently:", e?.message);
      return []; // never block payment on availability check failure
    }
  },
};

// ══════════════════════════════════════════════════════
//   RECIPE SERVICE
// ══════════════════════════════════════════════════════
export const RecipeService = {
  /** Get recipe for a menu item */
  async get(menuItemId) {
    return safeDB(async () => {
      const r = await db.recipes.get(menuItemId);
      return r || { menuItemId, ingredients: [] };
    }, { menuItemId, ingredients: [] });
  },

  /** Get all recipes */
  async getAll() {
    return safeDB(() => db.recipes.toArray(), []);
  },

  /** Save / update a recipe */
  async save(menuItemId, ingredients) {
    // ingredients: [{ inventoryItemId, inventoryItemName, qty, unit }]
    const recipe = { menuItemId, ingredients: safeArr(ingredients), updatedAt: nowISO() };
    await safeDB(() => db.recipes.put(recipe));
    return recipe;
  },

  /** Delete a recipe */
  async delete(menuItemId) {
    return safeDB(() => db.recipes.delete(menuItemId));
  },

  /** Check if all ingredients for a cart are available */
  async checkAvailability(cartItems) {
    const issues = [];
    for (const cartItem of safeArr(cartItems)) {
      const recipe = await RecipeService.get(cartItem.id);
      for (const ing of safeArr(recipe.ingredients)) {
        const invItem = await InventoryService.getOne(ing.inventoryItemId);
        if (!invItem) continue;
        const needed = safeNum(ing.qty) * safeNum(cartItem.qty);
        if (safeNum(invItem.currentStock) < needed) {
          issues.push({
            menuItem:      cartItem.name,
            ingredient:    invItem.name,
            needed,
            available:     safeNum(invItem.currentStock),
            unit:          ing.unit,
            critical:      safeNum(invItem.currentStock) <= 0,
          });
        }
      }
    }
    return issues;
  },

  /** Restore inventory for a voided order (reverses deductForOrder) */
  async restoreForOrder(orderItems, orderId, cashier) {
    return safeDB(async () => {
      const results = [];
      for (const cartItem of safeArr(orderItems)) {
        const recipe = await db.recipes.get(cartItem.id);
        if (!recipe || !Array.isArray(recipe.ingredients)) continue;

        for (const ing of recipe.ingredients) {
          const invItem = await db.inventoryItems.get(ing.inventoryItemId);
          if (!invItem) continue;

          const restored = safeNum(ing.qty) * safeNum(cartItem.qty);
          const before   = safeNum(invItem.currentStock);
          const after    = before + restored;

          await db.inventoryItems.update(ing.inventoryItemId, {
            currentStock: after, updatedAt: nowISO(),
          });
          await db.stockLogs.add({
            itemId: ing.inventoryItemId, itemName: invItem.name,
            type: "adjust", qty: restored, before, after,
            note: `VOID ${orderId}`, orderId,
            userId: cashier || "pos", createdAt: nowISO(),
          });
          results.push({ id: ing.inventoryItemId, name: invItem.name, restored, before, after });
        }
      }
      return results;
    }, []);
  },
};

// ══════════════════════════════════════════════════════
//   STOCK LOG SERVICE
// ══════════════════════════════════════════════════════
export const StockLogService = {
  /** Recent logs, newest first */
  async getRecent(limit = 100) {
    return safeDB(() =>
      db.stockLogs.orderBy("createdAt").reverse().limit(limit).toArray(), []
    );
  },

  /** Logs for a specific item */
  async getByItem(itemId, limit = 50) {
    return safeDB(async () => {
      const logs = await db.stockLogs
        .where("itemId").equals(itemId)
        .toArray();
      return logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    }, []);
  },

  /** Logs for a date range */
  async getByDateRange(fromISO, toISO) {
    return safeDB(async () => {
      const all = await db.stockLogs.orderBy("createdAt").reverse().toArray();
      return all.filter(l => l.createdAt >= fromISO && l.createdAt <= toISO);
    }, []);
  },

  /** Today's deduction logs grouped by ingredient */
  async getTodayUsage() {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const logs = await StockLogService.getByDateRange(
      todayStart.toISOString(), new Date().toISOString()
    );
    const deductions = logs.filter(l => l.type === LOG_TYPES.DEDUCT);
    const grouped    = {};
    deductions.forEach(l => {
      if (!grouped[l.itemId]) grouped[l.itemId] = { itemId: l.itemId, name: l.itemName, total: 0, count: 0 };
      grouped[l.itemId].total += safeNum(l.qty);
      grouped[l.itemId].count += 1;
    });
    return Object.values(grouped).sort((a, b) => b.total - a.total);
  },

  async bulkImport(logs) {
    if (!Array.isArray(logs) || !logs.length) return;
    return safeDB(() => db.stockLogs.bulkAdd(logs));
  },
};
