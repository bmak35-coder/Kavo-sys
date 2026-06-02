import { db, safeDB, getSetting, setSetting } from "../db.js";
import { OrderService, HeldOrderService } from "./orders.js";
import { KitchenService } from "./kitchen.js";
import { ShiftService } from "./shifts.js";
import { ReceiptService } from "./receipts.js";
import { MenuService, ModifierService } from "./menu.js";
import { SettingsService } from "./settings.js";
import { InventoryService, RecipeService, StockLogService } from "./inventory.js";
import { SupplierService, PurchaseOrderService } from "./purchasing.js";
import { ActivityLogService } from "./activityLog.js";
import { EmployeeService, AdvanceService } from "./payroll.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Backup & Export Service  ·  v2.1
   Fixed: MenuService.getItems() → MenuService.getAll()
   All exports wrapped in try/catch with safe fallback.
══════════════════════════════════════════════════════ */

const LAST_BACKUP_KEY = "kavo_last_backup_date";

// ─── Helpers ─────────────────────────────────────────
const safeArr = (v, d = []) => Array.isArray(v) ? v : d;
const safeNum = (v) => { const n = +v; return isFinite(n) ? n : 0; };
const roundMoney = (v) => Number(Number(v || 0).toFixed(2));

/** Safe service call — returns [] on any error, never throws */
async function safe(fn, label) {
  try {
    const result = await fn();
    return safeArr(result);
  } catch (e) {
    console.warn(`[KAVO-BACKUP] ${label} fetch failed:`, e?.message || e);
    return [];
  }
}

/** Build CSV string from headers + rows */
function toCSV(headers, rows) {
  const esc  = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = headers.map(esc).join(",");
  const body = rows.map(row => row.map(esc).join(",")).join("\n");
  return head + "\n" + body;
}

/** Trigger browser file download */
function dl(blob, name) {
  const a = document.createElement("a");
  a.href  = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvBlob(content) {
  return new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export const BackupService = {
  // ── Last backup tracking ─────────────────────────
  async getLastBackupDate() {
    return getSetting(LAST_BACKUP_KEY, null);
  },
  async setLastBackupDate() {
    return setSetting(LAST_BACKUP_KEY, new Date().toISOString());
  },

  // ══════════════════════════════════════════════════
  //   FULL JSON BACKUP
  // ══════════════════════════════════════════════════
  async exportJSON() {
    // All service calls use safe() — any single failure returns [] not crash
    const [
      orders, heldOrders, kitchenOrders, shifts, receipts,
      menuItems, categories, appSettings, receiptSettings,
      inventoryItems, recipes, stockLogs, suppliers, purchaseOrders,
      modifierGroups, customers, restaurantTables, users, currentShift, employees, salaryAdvances,
    ] = await Promise.all([
      safe(() => OrderService.getAll(),           "orders"),
      safe(() => HeldOrderService.getAll(),       "heldOrders"),
      safe(() => KitchenService.getAll(),         "kitchenOrders"),
      safe(() => ShiftService.getHistory(),       "shifts"),
      safe(() => ReceiptService.getAll(),         "receipts"),
      safe(() => MenuService.getAll(),            "menuItems"),
      safe(() => MenuService.getCategories(),     "categories"),
      Promise.resolve({}).then(() => SettingsService.getAppSettings()).catch(() => ({})),
      Promise.resolve({}).then(() => SettingsService.getReceiptSettings()).catch(() => ({})),
      safe(() => InventoryService.getAll(),       "inventoryItems"),
      safe(() => RecipeService.getAll(),          "recipes"),
      safe(() => StockLogService.getRecent(5000), "stockLogs"),
      safe(() => SupplierService.getAll(),        "suppliers"),
      safe(() => PurchaseOrderService.getAll(),   "purchaseOrders"),
      safe(() => ModifierService.getAll(),        "modifierGroups"),
      safe(() => db.customers.toArray(),          "customers"),
      safe(() => Promise.resolve(TableService.getForBackup()), "restaurantTables"),
      safe(() => db.users.toArray(),              "users"),
      safe(() => ShiftService.getCurrent(),       "currentShift"),
      safe(() => EmployeeService.getAll(),        "employees"),
      safe(() => AdvanceService.getAll(),         "salaryAdvances"),
    ]);

    // Payment methods — stored in appSettings.paymentMethods or derived
    const paymentMethods = (appSettings && appSettings.paymentMethods)
      ? appSettings.paymentMethods
      : ["Cash", "Card", "Whish", "Split"];

    const backup = {
      _meta: {
        app:        "KAVO-SYS",
        version:    "3.2",
        exportedAt: new Date().toISOString(),
        filename:   "kavo-sys-backup-latest.json",
        counts: {
          orders:          orders.length,
          heldOrders:      heldOrders.length,
          kitchenOrders:   kitchenOrders.length,
          shifts:          shifts.length,
          receipts:        receipts.length,
          menuItems:       menuItems.length,
          categories:      categories.length,
          inventoryItems:  inventoryItems.length,
          recipes:         recipes.length,
          stockLogs:       stockLogs.length,
          suppliers:       suppliers.length,
          purchaseOrders:  purchaseOrders.length,
          modifierGroups:  modifierGroups.length,
          customers:       customers.length,
          restaurantTables: restaurantTables.length,
          users:           users.length,
        },
      },
      orders, heldOrders, kitchenOrders, shifts, receipts,
      menuItems, categories, appSettings, receiptSettings,
      inventoryItems, recipes, stockLogs, suppliers, purchaseOrders,
      modifierGroups, customers, restaurantTables,
      users, currentShift, paymentMethods,
      employees, salaryAdvances,
    };

    return JSON.stringify(backup, null, 2);
  },

  async downloadBackup() {
    try {
      const json = await BackupService.exportJSON();
      dl(new Blob([json], { type: "application/json" }),
        `KAVO-SYS_backup_${today()}.json`);
      await BackupService.setLastBackupDate();
    } catch (e) {
      throw new Error("Full backup failed: " + (e.message || e));
    }
  },

  /** Always downloads as kavo-sys-backup-latest.json (Google Drive friendly) */
  async downloadLatest() {
    try {
      const json = await BackupService.exportJSON();
      dl(new Blob([json], { type: "application/json" }),
        "kavo-sys-backup-latest.json");
      await BackupService.setLastBackupDate();
    } catch (e) {
      throw new Error("Backup failed: " + (e.message || e));
    }
  },

  // ══════════════════════════════════════════════════
  //   RESTORE FROM JSON
  // ══════════════════════════════════════════════════
  async restoreFromJSON(data) {
    if (!data || typeof data !== "object") throw new Error("Invalid backup file");
    const results = {};

    const tryRestore = async (key, items, fn) => {
      if (!Array.isArray(items) || items.length === 0) return;
      try { await fn(items); results[key] = items.length; }
      catch (e) { console.warn(`[KAVO-RESTORE] ${key} failed:`, e?.message); }
    };

    await tryRestore("orders",         data.orders,         i => OrderService.bulkImport(i));
    await tryRestore("heldOrders",     data.heldOrders,     i => safeDB(() => db.heldOrders.bulkPut(i)));
    await tryRestore("kitchenOrders",  data.kitchenOrders,  i => KitchenService.replaceAll(i));
    await tryRestore("shifts",         data.shifts,         i => ShiftService.bulkImport(i));
    await tryRestore("receipts",       data.receipts,       i => ReceiptService.bulkImport(i));
    await tryRestore("menuItems",      data.menuItems,
      i => MenuService.bulkImport(i, safeArr(data.categories)));
    await tryRestore("inventoryItems", data.inventoryItems, i => InventoryService.bulkImport(i));
    await tryRestore("recipes",        data.recipes,        i => safeDB(() => db.recipes.bulkPut(i)));
    await tryRestore("stockLogs",      data.stockLogs,      i => StockLogService.bulkImport(i));
    await tryRestore("suppliers",      data.suppliers,      i => SupplierService.bulkImport(i));
    await tryRestore("purchaseOrders", data.purchaseOrders, i => safeDB(() => db.purchaseOrders.bulkPut(i)));
    await tryRestore("modifierGroups", data.modifierGroups, i => ModifierService.bulkImport(i));
    await tryRestore("customers",      data.customers,      i => safeDB(() => db.customers.bulkPut(i)));
    if (Array.isArray(data.restaurantTables) && data.restaurantTables.length > 0) { TableService.importAll(data.restaurantTables); }
    if (Array.isArray(data.employees) && data.employees.length > 0) {
      await safeDB(() => db.employees.bulkPut(data.employees));
    }
    if (Array.isArray(data.salaryAdvances) && data.salaryAdvances.length > 0) {
      await safeDB(() => db.salaryAdvances.bulkPut(data.salaryAdvances));
    }

    if (data.appSettings)     { try { await SettingsService.saveAppSettings(data.appSettings); } catch(_) {} }
    if (data.receiptSettings) { try { await SettingsService.saveReceiptSettings(data.receiptSettings); } catch(_) {} }

    return results;
  },

  // ══════════════════════════════════════════════════
  //   CSV EXPORTS — all individually try/catched
  // ══════════════════════════════════════════════════

  async exportOrdersCSV() {
    try {
      const orders = await safe(() => OrderService.getAll(), "orders");
      const csv = toCSV(
        ["Order No","Date","Time","Type","Table","Customer","Phone",
         "Items","Subtotal","Discount","Service","VAT","Grand Total",
         "Payment","Amount Paid","Change","Status","Cashier","Branch"],
        orders.map(o => {
          const items = safeArr(o.cart).map(i =>
            `${i.name}${i._modLabel ? ` [${i._modLabel}]` : ""} x${i.qty}`
          ).join("; ");
          const d = o.savedAt ? new Date(o.savedAt) : new Date();
          return [
            o.orderNo,
            d.toLocaleDateString("en-GB"),
            d.toLocaleTimeString("en-US", {hour:"2-digit",minute:"2-digit"}),
            o.type, o.tableNo||"", o.custName||"", o.custPhone||"",
            items,
            safeNum(o.subtotal).toFixed(2), safeNum(o.discAmt).toFixed(2),
            safeNum(o.svcAmt).toFixed(2),   safeNum(o.vatAmt).toFixed(2),
            safeNum(o.grand).toFixed(2),    o.payMethod||"",
            safeNum(o.amtPaid).toFixed(2),  safeNum(o.change).toFixed(2),
            o.status||"", o.cashier||"", o.branch||"",
          ];
        })
      );
      dl(csvBlob(csv), `KAVO_orders_${today()}.csv`);
      return { count: orders.length };
    } catch (e) {
      throw new Error("Orders export failed: " + (e.message || e));
    }
  },

  async exportInventoryCSV() {
    try {
      const items = await safe(() => InventoryService.getAll(), "inventory");
      const csv = toCSV(
        ["ID","Name","SKU","Category","Unit","Current Stock","Min Stock",
         "Cost Price","Stock Value","Supplier","Expiry Date","Last Updated"],
        items.map(i => [
          i.id, i.name, i.sku||"", i.category||"", i.unit||"piece",
          safeNum(i.currentStock).toFixed(2), safeNum(i.minStock).toFixed(2),
          safeNum(i.costPrice).toFixed(4),
          (safeNum(i.currentStock) * safeNum(i.costPrice)).toFixed(2),
          i.supplier||"", i.expiryDate||"", i.updatedAt||"",
        ])
      );
      dl(csvBlob(csv), `KAVO_inventory_${today()}.csv`);
      return { count: items.length };
    } catch (e) {
      throw new Error("Inventory export failed: " + (e.message || e));
    }
  },

  async exportShiftsCSV() {
    try {
      const shifts = await safe(() => ShiftService.getHistory(), "shifts");
      const csv = toCSV(
        ["Shift ID","Cashier","Status","Opened","Closed","Duration (min)",
         "Orders","Total Sales","Cash Sales","Card Sales",
         "Opening Cash","Closing Cash","Difference"],
        shifts.map(s => {
          const sm = s.summary || {};
          const dur = s.openedAt && s.closedAt
            ? Math.round((new Date(s.closedAt) - new Date(s.openedAt)) / 60000)
            : "";
          return [
            s.id, s.cashier||"", s.status||"",
            s.openedAt||"", s.closedAt||"", dur,
            sm.count||0,
            safeNum(sm.total).toFixed(2), safeNum(sm.cashS).toFixed(2),
            safeNum(sm.cardS).toFixed(2),
            safeNum(sm.openingCash).toFixed(2), safeNum(sm.closingCash).toFixed(2),
            safeNum(sm.cashDiff).toFixed(2),
          ];
        })
      );
      dl(csvBlob(csv), `KAVO_shifts_${today()}.csv`);
      return { count: shifts.length };
    } catch (e) {
      throw new Error("Shifts export failed: " + (e.message || e));
    }
  },

  async exportCustomersCSV() {
    try {
      const customers = await safe(() => db.customers.toArray(), "customers");
      const csv = toCSV(
        ["ID","Name","Phone","Email","Created At"],
        customers.map(c => [c.id, c.name||"", c.phone||"", c.email||"", c.createdAt||""])
      );
      dl(csvBlob(csv), `KAVO_customers_${today()}.csv`);
      return { count: customers.length };
    } catch (e) {
      throw new Error("Customers export failed: " + (e.message || e));
    }
  },

  async exportPurchaseOrdersCSV() {
    try {
      const pos = await safe(() => PurchaseOrderService.getAll(), "purchaseOrders");
      const csv = toCSV(
        ["PO Number","Supplier","Status","Order Date","Delivery Date",
         "Total","Created By","Received At","Notes"],
        pos.map(p => [
          p.poNo, p.supplierName||"", p.status||"",
          p.orderDate||"", p.deliveryDate||"",
          safeNum(p.total).toFixed(2),
          p.createdBy||"", p.receivedAt||"", p.notes||"",
        ])
      );
      dl(csvBlob(csv), `KAVO_purchase_orders_${today()}.csv`);
      return { count: pos.length };
    } catch (e) {
      throw new Error("Purchase orders export failed: " + (e.message || e));
    }
  },

  async exportMenuCSV() {
    try {
      // FIXED: was MenuService.getItems() — method does not exist
      const items = await safe(() => MenuService.getAll(), "menuItems");
      const csv = toCSV(
        ["ID","Name","Category","Price","Cost Price","Active",
         "Out of Stock","Favorite","Modifier Groups"],
        items.map(i => [
          i.id, i.name, i.cat||"",
          safeNum(i.price).toFixed(2),
          safeNum(i.costPrice).toFixed(2),
          i.active !== false ? "Yes" : "No",
          i.outOfStock ? "Yes" : "No",
          i.favorite  ? "Yes" : "No",
          safeArr(i.modifierGroups).join("; "),
        ])
      );
      dl(csvBlob(csv), `KAVO_menu_${today()}.csv`);
      return { count: items.length };
    } catch (e) {
      throw new Error("Menu export failed: " + (e.message || e));
    }
  },

  // ══════════════════════════════════════════════════
  //   STATS (for DataManager overview)
  // ══════════════════════════════════════════════════
  async getStats() {
    const counts = await Promise.all([
      safeDB(() => db.orders.count(), 0),
      safeDB(() => db.receipts.count(), 0),
      safeDB(() => db.shifts.count(), 0),
      safeDB(() => db.kitchenOrders.count(), 0),
      safeDB(() => db.menuItems.count(), 0),
      safeDB(() => db.inventoryItems.count(), 0),
      safeDB(() => db.suppliers.count(), 0),
      safeDB(() => db.purchaseOrders.count(), 0),
      safeDB(() => db.customers.count(), 0),
      safeDB(() => db.stockLogs.count(), 0),
      safeDB(() => db.activityLogs?.count(), 0),
    ]);
    const [orders, receipts, shifts, kitchen, menu, inventory,
           suppliers, purchaseOrders, customers, stockLogs, activityLogs] = counts;
    const lastBackup = await BackupService.getLastBackupDate();
    return {
      orders, receipts, shifts, kitchen, menu, inventory,
      suppliers, purchaseOrders, customers, stockLogs, activityLogs, lastBackup,
    };
  },

  // ══════════════════════════════════════════════════
  //   RESET
  // ══════════════════════════════════════════════════
  async clearAll() {
    await safeDB(async () => {
      await Promise.all([
        db.orders.clear(),
        db.heldOrders.clear(),
        db.kitchenOrders.clear(),
        db.shifts.clear(),
        db.currentShift.clear(),
        db.receipts.clear(),
        db.inventoryItems.clear(),
        db.recipes.clear(),
        db.stockLogs.clear(),
        db.suppliers.clear(),
        db.purchaseOrders.clear(),
        db.poItems.clear(),
        db.customers.clear(),
      ]);
    });
  },

  async fullReset() {
    await safeDB(async () => {
      const tables = [
        "orders","heldOrders","kitchenOrders","shifts","currentShift",
        "receipts","inventoryItems","recipes","stockLogs","suppliers",
        "purchaseOrders","poItems","customers","modifierGroups",
        "menuItems","categories","settings",
      ];
      await Promise.all(tables.map(t => db[t]?.clear().catch(() => {})));
    });
    try { localStorage.clear(); } catch(_) {}
    try { sessionStorage.clear(); } catch(_) {}
  },
};
