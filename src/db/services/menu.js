import { db, safeDB, bulkPutSafe } from "../db.js";
import { SEED_CATEGORIES, SEED_MENU } from "./migration.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Menu Service  ·  v2.0
   Full menu management: items, categories, modifiers,
   cost/profit calculation.
   CLOUD SWAP: replace safeDB(() => db.…) with API calls.
══════════════════════════════════════════════════════ */

const safeArr = (v, d = []) => Array.isArray(v) ? v : d;
const safeNum = (v) => { const n = +v; return isFinite(n) ? n : 0; };
const nowISO  = () => new Date().toISOString();

// ── Seed modifier groups (created once on first run) ──
export const SEED_MODIFIER_GROUPS = [
  {
    id: "mg_size",
    name: "Size",
    required: false,
    multiSelect: false,
    options: [
      { id: "mg_size_s", label: "Small",  priceAdj: -0.50 },
      { id: "mg_size_m", label: "Medium", priceAdj:  0    },
      { id: "mg_size_l", label: "Large",  priceAdj:  1.00 },
    ],
  },
  {
    id: "mg_milk",
    name: "Milk Type",
    required: false,
    multiSelect: false,
    options: [
      { id: "mg_milk_reg",  label: "Regular Milk", priceAdj: 0    },
      { id: "mg_milk_oat",  label: "Oat Milk",     priceAdj: 0.75 },
      { id: "mg_milk_alm",  label: "Almond Milk",  priceAdj: 0.75 },
      { id: "mg_milk_soy",  label: "Soy Milk",     priceAdj: 0.50 },
    ],
  },
  {
    id: "mg_extras",
    name: "Extras",
    required: false,
    multiSelect: true,
    options: [
      { id: "mg_ext_choc",   label: "Extra Chocolate", priceAdj: 0.50 },
      { id: "mg_ext_syrup",  label: "Caramel Syrup",   priceAdj: 0.50 },
      { id: "mg_ext_cream",  label: "Whipped Cream",   priceAdj: 0.75 },
      { id: "mg_ext_shot",   label: "Extra Shot",      priceAdj: 1.00 },
    ],
  },
  {
    id: "mg_sauce",
    name: "Sauce",
    required: false,
    multiSelect: false,
    options: [
      { id: "mg_sauce_none",  label: "No Sauce",     priceAdj: 0    },
      { id: "mg_sauce_ketch", label: "Ketchup",      priceAdj: 0    },
      { id: "mg_sauce_mayo",  label: "Mayonnaise",   priceAdj: 0    },
      { id: "mg_sauce_bbq",   label: "BBQ",          priceAdj: 0    },
      { id: "mg_sauce_hot",   label: "Hot Sauce",    priceAdj: 0    },
    ],
  },
];

// ══════════════════════════════════════════════════════
//   MENU ITEMS
// ══════════════════════════════════════════════════════
export const MenuService = {

  async getAll() {
    const items = await safeDB(() => db.menuItems.toArray(), []);
    if (!Array.isArray(items) || items.length === 0) {
      const seeded = SEED_MENU.map(i => ({
        ...i,
        active:        true,
        outOfStock:    false,
        favorite:      false,
        costPrice:     0,
        modifierGroups:[],
      }));
      await bulkPutSafe("menuItems", seeded);
      return seeded;
    }
    return items;
  },

  /** Only active, not-out-of-stock items — for POS */
  async getActive() {
    const all = await MenuService.getAll();
    return all.filter(i => i.active !== false && !i.outOfStock);
  },

  async getByCategory(catId) {
    if (catId === "all") return MenuService.getAll();
    return safeDB(() =>
      db.menuItems.where("cat").equals(catId).toArray(), []
    );
  },

  async getOne(id) {
    return safeDB(() => db.menuItems.get(id), null);
  },

  async save(item) {
    const existing = await safeDB(() => db.menuItems.get(item.id), null);
    const toSave = {
      // keep old fields as defaults
      ...existing,
      // apply new values
      ...item,
      id:             item.id || `m_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
      active:         item.active !== undefined ? item.active : true,
      outOfStock:     !!item.outOfStock,
      favorite:       !!item.favorite,
      costPrice:      safeNum(item.costPrice),
      price:          safeNum(item.price),
      modifierGroups: safeArr(item.modifierGroups),
      updatedAt:      nowISO(),
      createdAt:      existing?.createdAt || nowISO(),
    };
    await safeDB(() => db.menuItems.put(toSave));
    return toSave;
  },

  async delete(id) {
    return safeDB(() => db.menuItems.delete(id));
  },

  async toggleActive(id) {
    return safeDB(async () => {
      const item = await db.menuItems.get(id);
      if (!item) return;
      await db.menuItems.update(id, { active: !item.active, updatedAt: nowISO() });
    });
  },

  async toggleOutOfStock(id) {
    return safeDB(async () => {
      const item = await db.menuItems.get(id);
      if (!item) return;
      await db.menuItems.update(id, { outOfStock: !item.outOfStock, updatedAt: nowISO() });
    });
  },

  async toggleFavorite(id) {
    return safeDB(async () => {
      const item = await db.menuItems.get(id);
      if (!item) return;
      await db.menuItems.update(id, { favorite: !item.favorite, updatedAt: nowISO() });
    });
  },

  // ── Cost / Profit helpers ─────────────────────────
  /** Calculates estimated cost from recipe ingredients */
  async calcRecipeCost(menuItemId) {
    try {
      const recipe = await db.recipes.get(menuItemId);
      if (!recipe || !Array.isArray(recipe.ingredients)) return 0;
      let total = 0;
      for (const ing of recipe.ingredients) {
        const inv = await db.inventoryItems.get(ing.inventoryItemId);
        if (inv) total += safeNum(ing.qty) * safeNum(inv.costPrice);
      }
      return parseFloat(total.toFixed(4));
    } catch { return 0; }
  },

  profitMargin(price, cost) {
    const p = safeNum(price), c = safeNum(cost);
    if (p <= 0) return 0;
    return parseFloat(((p - c) / p * 100).toFixed(1));
  },

  // ── Bulk import ───────────────────────────────────
  async bulkImport(items, categories) {
    if (Array.isArray(items) && items.length > 0)
      await safeDB(() => db.menuItems.bulkPut(items));
    if (Array.isArray(categories) && categories.length > 0)
      await safeDB(() => db.categories.bulkPut(categories));
  },

  // ══ CATEGORIES ════════════════════════════════════
  async getCategories() {
    const cats = await safeDB(() => db.categories.toArray(), []);
    if (!Array.isArray(cats) || cats.length === 0) {
      const seeded = SEED_CATEGORIES.map((c,i) => ({ ...c, sortOrder: i }));
      await bulkPutSafe("categories", seeded);
      return seeded;
    }
    return cats.sort((a,b) => (a.sortOrder||0) - (b.sortOrder||0));
  },

  async saveCategory(cat) {
    const toSave = {
      ...cat,
      id: cat.id || `cat_${Date.now()}`,
      sortOrder: safeNum(cat.sortOrder),
      updatedAt: nowISO(),
    };
    await safeDB(() => db.categories.put(toSave));
    return toSave;
  },

  async deleteCategory(id) {
    return safeDB(() => db.categories.delete(id));
  },
};

// ══════════════════════════════════════════════════════
//   MODIFIER GROUPS
// ══════════════════════════════════════════════════════
export const ModifierService = {
  async getAll() {
    const groups = await safeDB(() => db.modifierGroups.toArray(), []);
    if (!Array.isArray(groups) || groups.length === 0) {
      await safeDB(() => db.modifierGroups.bulkPut(SEED_MODIFIER_GROUPS));
      return SEED_MODIFIER_GROUPS;
    }
    return groups;
  },

  async getOne(id) {
    return safeDB(() => db.modifierGroups.get(id), null);
  },

  async save(group) {
    const toSave = {
      ...group,
      id: group.id || `mg_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
      options: safeArr(group.options).map((o,i) => ({
        ...o,
        id: o.id || `opt_${Date.now()}_${i}`,
        priceAdj: safeNum(o.priceAdj),
      })),
      updatedAt: nowISO(),
    };
    await safeDB(() => db.modifierGroups.put(toSave));
    return toSave;
  },

  async delete(id) {
    return safeDB(() => db.modifierGroups.delete(id));
  },

  async bulkImport(groups) {
    if (!Array.isArray(groups) || !groups.length) return;
    return safeDB(() => db.modifierGroups.bulkPut(groups));
  },
};
