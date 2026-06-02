import { db, safeDB, setSetting, getSetting, bulkPutSafe } from "../db.js";
import { DEFAULT_USERS } from "../../auth/authConstants.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  localStorage → IndexedDB Migration
   Runs once on first launch, then never again.
   Safe: reads LS → writes IDB → never deletes LS yet
   (so rollback is possible by clearing IDB).
══════════════════════════════════════════════════════ */

const MIGRATION_FLAG = "kavo_idb_migrated_v1";

// ── Safe localStorage reader ──────────────────────────
function lsGet(key, def = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return def;
    const p = JSON.parse(raw);
    return p ?? def;
  } catch {
    return def;
  }
}
const safeArr = (v, d = []) => Array.isArray(v) ? v : d;
const safeObj = (v, d = {}) =>
  (v && typeof v === "object" && !Array.isArray(v)) ? v : d;

// ── SEED DATA (used if localStorage is also empty) ────
export const SEED_CATEGORIES = [
  { id:"all",      name:"All Items",   icon:"🍽" },
  { id:"hot",      name:"Hot Drinks",  icon:"☕" },
  { id:"cold",     name:"Cold Drinks", icon:"🧋" },
  { id:"food",     name:"Food",        icon:"🍔" },
  { id:"desserts", name:"Desserts",    icon:"🍰" },
  { id:"specials", name:"Star Pick",   icon:"⭐" },
];

export const SEED_MENU = [
  { id:"m1",  cat:"hot",      name:"Espresso",      price:3.50, bg:"#7c3aed", em:"☕" },
  { id:"m2",  cat:"hot",      name:"Cappuccino",    price:4.50, bg:"#92400e", em:"☕" },
  { id:"m3",  cat:"hot",      name:"Latte",         price:5.00, bg:"#78716c", em:"🥛" },
  { id:"m4",  cat:"hot",      name:"Americano",     price:4.00, bg:"#1c1917", em:"☕" },
  { id:"m5",  cat:"hot",      name:"Hot Chocolate", price:5.50, bg:"#78350f", em:"🍫" },
  { id:"m6",  cat:"hot",      name:"Mocha",         price:5.00, bg:"#44403c", em:"☕" },
  { id:"m7",  cat:"cold",     name:"Iced Latte",    price:5.50, bg:"#0c4a6e", em:"🧋" },
  { id:"m8",  cat:"cold",     name:"Frappuccino",   price:6.00, bg:"#1e3a5f", em:"🥤" },
  { id:"m9",  cat:"cold",     name:"Fresh OJ",      price:4.50, bg:"#c2410c", em:"🍊" },
  { id:"m10", cat:"cold",     name:"Smoothie",      price:6.50, bg:"#166534", em:"🥤" },
  { id:"m11", cat:"cold",     name:"Mineral Water", price:2.00, bg:"#164e63", em:"💧" },
  { id:"m12", cat:"cold",     name:"Lemonade",      price:4.00, bg:"#713f12", em:"🍋" },
  { id:"m13", cat:"food",     name:"Club Sandwich", price:8.50, bg:"#92400e", em:"🥪" },
  { id:"m14", cat:"food",     name:"Caesar Salad",  price:7.50, bg:"#14532d", em:"🥗" },
  { id:"m15", cat:"food",     name:"Avocado Toast", price:9.00, bg:"#166534", em:"🥑" },
  { id:"m16", cat:"food",     name:"Eggs Benedict", price:10.5, bg:"#78350f", em:"🍳" },
  { id:"m17", cat:"food",     name:"Beef Burger",   price:12.0, bg:"#7f1d1d", em:"🍔" },
  { id:"m18", cat:"food",     name:"Pasta",         price:11.0, bg:"#7c2d12", em:"🍝" },
  { id:"m19", cat:"desserts", name:"Cheesecake",    price:6.00, bg:"#9d174d", em:"🍰" },
  { id:"m20", cat:"desserts", name:"Tiramisu",      price:6.50, bg:"#44403c", em:"🍮" },
  { id:"m21", cat:"desserts", name:"Brownie",       price:5.00, bg:"#431407", em:"🍫" },
  { id:"m22", cat:"desserts", name:"Ice Cream",     price:4.50, bg:"#1e3a5f", em:"🍨" },
  { id:"m23", cat:"desserts", name:"Waffles",       price:7.00, bg:"#78350f", em:"🧇" },
  { id:"m24", cat:"specials", name:"Chef Special",  price:15.0, bg:"#1e1b4b", em:"⭐" },
  { id:"m25", cat:"specials", name:"Set Meal A",    price:18.0, bg:"#0f172a", em:"🍱" },
  { id:"m26", cat:"specials", name:"Set Meal B",    price:22.0, bg:"#172554", em:"🍱" },
];

export const DEFAULT_APP_SETTINGS = {
  branch:      "KAVO Main Branch",
  cashier:     "Alex Kassem",
  shift:       "SHF-" + new Date().toISOString().slice(0,10).replace(/-/g,"") + "-A",
  taxRate:     11,
  serviceRate: 10,
  currency:    "$",
};

// ── MAIN MIGRATION FUNCTION ───────────────────────────
export async function runMigrationIfNeeded() {
  // Check if already migrated
  const alreadyDone = await getSetting(MIGRATION_FLAG, false);
  if (alreadyDone) return { migrated: false, msg: "Already migrated" };

  console.log("[KAVO-DB] Starting localStorage → IndexedDB migration...");
  const results = {};

  // 1. USERS
  const lsUsers = safeArr(lsGet("kavo_users"), DEFAULT_USERS);
  const usersToWrite = lsUsers.length ? lsUsers : DEFAULT_USERS;
  await safeDB(() => db.users.bulkPut(usersToWrite));
  results.users = usersToWrite.length;

  // 2. CATEGORIES
  const lsCats = safeArr(lsGet("kavo_cats"), []);
  const catsToWrite = lsCats.length ? lsCats : SEED_CATEGORIES;
  await bulkPutSafe("categories", catsToWrite);
  results.categories = catsToWrite.length;

  // 3. MENU ITEMS
  const lsMenu = safeArr(lsGet("kavo_menu"), []);
  const menuToWrite = lsMenu.length ? lsMenu : SEED_MENU;
  await bulkPutSafe("menuItems", menuToWrite);
  results.menuItems = menuToWrite.length;

  // 4. SETTINGS (app + receipt)
  const lsSettings = safeObj(lsGet("kavo_settings"), DEFAULT_APP_SETTINGS);
  const mergedSettings = { ...DEFAULT_APP_SETTINGS, ...lsSettings };
  for (const [k, v] of Object.entries(mergedSettings)) {
    await setSetting(`app_${k}`, v);
  }
  const lsReceiptSettings = safeObj(lsGet("kavo_receipt_settings"), {});
  for (const [k, v] of Object.entries(lsReceiptSettings)) {
    await setSetting(`receipt_${k}`, v);
  }

  // 5. ORDERS
  const lsOrders = safeArr(lsGet("kavo_orders"), []);
  if (lsOrders.length > 0) {
    await safeDB(() => db.orders.bulkPut(lsOrders));
    results.orders = lsOrders.length;
  }

  // 6. HELD ORDERS
  const lsHeld = safeArr(lsGet("kavo_held"), []);
  if (lsHeld.length > 0) {
    await safeDB(() => db.heldOrders.bulkPut(lsHeld));
    results.heldOrders = lsHeld.length;
  }

  // 7. KITCHEN ORDERS
  const lsKitchen = safeArr(lsGet("kavo_kitchen"), []);
  if (lsKitchen.length > 0) {
    await safeDB(() => db.kitchenOrders.bulkPut(lsKitchen));
    results.kitchenOrders = lsKitchen.length;
  }

  // 8. SHIFTS
  const lsShifts = safeArr(lsGet("kavo_shifts"), []);
  if (lsShifts.length > 0) {
    await safeDB(() => db.shifts.bulkPut(lsShifts));
    results.shifts = lsShifts.length;
  }
  const lsCurrentShift = lsGet("kavo_current_shift");
  if (lsCurrentShift && lsCurrentShift.id) {
    await safeDB(() => db.currentShift.put({ id: "active", ...lsCurrentShift }));
    results.currentShift = 1;
  }

  // 9. RECEIPTS
  const lsReceipts = safeArr(lsGet("kavo_receipts"), []);
  if (lsReceipts.length > 0) {
    // Ensure each receipt has receiptId key
    const withIds = lsReceipts.map((r, i) => ({
      ...r,
      receiptId: r.receiptId || `MIGRATED-${i}-${Date.now()}`,
    }));
    await safeDB(() => db.receipts.bulkPut(withIds));
    results.receipts = withIds.length;
  }

  // Mark as done
  await setSetting(MIGRATION_FLAG, true);
  await setSetting("kavo_migration_date", new Date().toISOString());
  await setSetting("kavo_db_version", "1.0");

  console.log("[KAVO-DB] Migration complete:", results);
  return { migrated: true, results };
}
