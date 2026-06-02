import Dexie from "dexie";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  IndexedDB via Dexie.js  ·  v5
   Always add new versions below — never mutate old ones.
   Omitting a table from a newer version DELETES that table.
══════════════════════════════════════════════════════ */

export const db = new Dexie("KavoSysDB");

db.version(1).stores({
  users:          "id, username, role",
  sessions:       "id, userId, role, loginAt",
  menuItems:      "id, cat, name, price",
  categories:     "id, name",
  orders:         "orderNo, savedAt, status, payMethod, cashier, type",
  heldOrders:     "orderNo, heldAt",
  kitchenOrders:  "id, status, sentAt, updatedAt, type",
  shifts:         "id, cashier, cashierId, status, openedAt, closedAt",
  currentShift:   "id",
  receipts:       "receiptId, printedAt, [order.orderNo]",
  settings:       "key",
  customers:      "id, phone, name",
});

db.version(2).stores({
  users:          "id, username, role",
  sessions:       "id, userId, role, loginAt",
  menuItems:      "id, cat, name, price",
  categories:     "id, name",
  orders:         "orderNo, savedAt, status, payMethod, cashier, type",
  heldOrders:     "orderNo, heldAt",
  kitchenOrders:  "id, status, sentAt, updatedAt, type",
  shifts:         "id, cashier, cashierId, status, openedAt, closedAt",
  currentShift:   "id",
  receipts:       "receiptId, printedAt, [order.orderNo]",
  settings:       "key",
  customers:      "id, phone, name",
  inventoryItems: "id, sku, category, unit, supplier, *name",
  recipes:        "menuItemId",
  stockLogs:      "++id, itemId, type, createdAt, orderId",
});

db.version(3).stores({
  users:          "id, username, role",
  sessions:       "id, userId, role, loginAt",
  menuItems:      "id, cat, name, price",
  categories:     "id, name",
  orders:         "orderNo, savedAt, status, payMethod, cashier, type",
  heldOrders:     "orderNo, heldAt",
  kitchenOrders:  "id, status, sentAt, updatedAt, type",
  shifts:         "id, cashier, cashierId, status, openedAt, closedAt",
  currentShift:   "id",
  receipts:       "receiptId, printedAt, [order.orderNo]",
  settings:       "key",
  customers:      "id, phone, name",
  inventoryItems: "id, sku, category, unit, supplier, *name",
  recipes:        "menuItemId",
  stockLogs:      "++id, itemId, type, createdAt, orderId",
  suppliers:      "id, name, status, createdAt",
  purchaseOrders: "id, poNo, supplierId, status, orderDate, deliveryDate, createdAt",
  poItems:        "++id, poId, inventoryItemId",
});

db.version(4).stores({
  users:          "id, username, role",
  sessions:       "id, userId, role, loginAt",
  menuItems:      "id, cat, name, price, active, favorite",
  categories:     "id, name, sortOrder",
  orders:         "orderNo, savedAt, status, payMethod, cashier, type",
  heldOrders:     "orderNo, heldAt",
  kitchenOrders:  "id, status, sentAt, updatedAt, type",
  shifts:         "id, cashier, cashierId, status, openedAt, closedAt",
  currentShift:   "id",
  receipts:       "receiptId, printedAt, [order.orderNo]",
  settings:       "key",
  customers:      "id, phone, name",
  inventoryItems: "id, sku, category, unit, supplier, *name",
  recipes:        "menuItemId",
  stockLogs:      "++id, itemId, type, createdAt, orderId",
  suppliers:      "id, name, status, createdAt",
  purchaseOrders: "id, poNo, supplierId, status, orderDate, deliveryDate, createdAt",
  poItems:        "++id, poId, inventoryItemId",
  modifierGroups: "id, name",
});

db.version(5).stores({
  users:          "id, username, role",
  sessions:       "id, userId, role, loginAt",
  menuItems:      "id, cat, name, price, active, favorite",
  categories:     "id, name, sortOrder",
  orders:         "orderNo, savedAt, status, payMethod, cashier, type",
  heldOrders:     "orderNo, heldAt",
  kitchenOrders:  "id, status, sentAt, updatedAt, type",
  shifts:         "id, cashier, cashierId, status, openedAt, closedAt",
  currentShift:   "id",
  receipts:       "receiptId, printedAt, [order.orderNo]",
  settings:       "key",
  customers:      "id, phone, name",
  inventoryItems: "id, sku, category, unit, supplier, *name",
  recipes:        "menuItemId",
  stockLogs:      "++id, itemId, type, createdAt, orderId",
  suppliers:      "id, name, status, createdAt",
  purchaseOrders: "id, poNo, supplierId, status, orderDate, deliveryDate, createdAt",
  poItems:        "++id, poId, inventoryItemId",
  modifierGroups: "id, name",
  // v5: Activity / Audit Logs (append-only, auto-increment id)
  activityLogs:   "++id, userId, action, createdAt, orderId",
});

// v6: Restaurant tables stored in localStorage (kavo_restaurant_tables)
// — no Dexie store needed; same pattern as kavo_held / kavo_kitchen
db.version(6).stores({
  users:          "id, username, role",
  sessions:       "id, userId, role, loginAt",
  menuItems:      "id, cat, name, price, active, favorite",
  categories:     "id, name, sortOrder",
  orders:         "orderNo, savedAt, status, payMethod, cashier, type",
  heldOrders:     "orderNo, heldAt",
  kitchenOrders:  "id, status, sentAt, updatedAt, type",
  shifts:         "id, cashier, cashierId, status, openedAt, closedAt",
  currentShift:   "id",
  receipts:       "receiptId, printedAt, [order.orderNo]",
  settings:       "key",
  customers:      "id, phone, name",
  inventoryItems: "id, sku, category, unit, supplier, *name",
  recipes:        "menuItemId",
  stockLogs:      "++id, itemId, type, createdAt, orderId",
  suppliers:      "id, name, status, createdAt",
  purchaseOrders: "id, poNo, supplierId, status, orderDate, deliveryDate, createdAt",
  poItems:        "++id, poId, inventoryItemId",
  modifierGroups: "id, name",
  activityLogs:   "++id, userId, action, createdAt, orderId",
  // restaurantTables NOT in Dexie — stored in localStorage kavo_restaurant_tables
});

// v7: Staff / Payroll management
db.version(7).stores({
  users:          "id, username, role",
  sessions:       "id, userId, role, loginAt",
  menuItems:      "id, cat, name, price, active, favorite",
  categories:     "id, name, sortOrder",
  orders:         "orderNo, savedAt, status, payMethod, cashier, type",
  heldOrders:     "orderNo, heldAt",
  kitchenOrders:  "id, status, sentAt, updatedAt, type",
  shifts:         "id, cashier, cashierId, status, openedAt, closedAt",
  currentShift:   "id",
  receipts:       "receiptId, printedAt, [order.orderNo]",
  settings:       "key",
  customers:      "id, phone, name",
  inventoryItems: "id, sku, category, unit, supplier, *name",
  recipes:        "menuItemId",
  stockLogs:      "++id, itemId, type, createdAt, orderId",
  suppliers:      "id, name, status, createdAt",
  purchaseOrders: "id, poNo, supplierId, status, orderDate, deliveryDate, createdAt",
  poItems:        "++id, poId, inventoryItemId",
  modifierGroups: "id, name",
  activityLogs:   "++id, userId, action, createdAt, orderId",
  // v7: Staff & Payroll
  employees:      "id, name, role, status, hireDate",
  salaryAdvances: "id, employeeId, date, month, createdAt",
});

// ─── SAFE WRAPPER ─────────────────────────────────────
export async function safeDB(fn, def = null) {
  try {
    return await fn();
  } catch (err) {
    console.warn("[KAVO-DB] IndexedDB error:", err?.message || err);
    return def;
  }
}

// ─── SETTINGS HELPERS ─────────────────────────────────
export async function getSetting(key, defaultValue = null) {
  return safeDB(async () => {
    const row = await db.settings.get(key);
    return row ? row.value : defaultValue;
  }, defaultValue);
}

export async function setSetting(key, value) {
  return safeDB(() => db.settings.put({ key, value }));
}

export async function getAllSettings() {
  return safeDB(async () => {
    const rows = await db.settings.toArray();
    return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
  }, {});
}

// ─── BULK WRITE ───────────────────────────────────────
export async function bulkPutSafe(table, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  return safeDB(() => db[table].bulkPut(items));
}
