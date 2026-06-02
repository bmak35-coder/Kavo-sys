import { db, safeDB, getSetting, setSetting } from "../db.js";
import { DEFAULT_APP_SETTINGS } from "./migration.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Settings Service  ·  v2.0
   All keys namespaced: "app_*", "receipt_*", "pos_*",
   "currency_*", "security_*"
   CLOUD SWAP: replace getSetting/setSetting with API.
══════════════════════════════════════════════════════ */

// ── Mirrors ReceiptSystem.jsx defaults (no circular import) ──
export const RECEIPT_DEFAULTS = {
  businessName: "KAVO Restaurant",
  branchName:   "Main Branch",
  address:      "123 Main Street, Beirut, Lebanon",
  phone:        "+961 1 234 567",
  taxNumber:    "TRN-000-000-000",
  footerLine1:  "Thank you for dining with us!",
  footerLine2:  "Please come again soon",
  website:      "www.kavo-sys.com",
  autoPrint:    false,
  showQR:       true,
  paperWidth:   "80mm",
};

export const POS_DEFAULTS = {
  preventNegativeStock:     false,
  requireCustomerDelivery:  false,
  requireShiftToSell:       false,
  defaultOrderType:         "dine-in",
  enableTax:                true,
  enableService:            true,
};

export const CURRENCY_DEFAULTS = {
  primaryCurrency:   "USD",
  primarySymbol:     "$",
  secondaryCurrency: "LBP",
  secondarySymbol:   "L.L.",
  exchangeRate:      90000,
  showDualCurrency:  false,
};

export const SettingsService = {
  // ── App / business settings ────────────────────────
  async getAppSettings() {
    const d = DEFAULT_APP_SETTINGS;
    const r = { ...d };
    for (const k of Object.keys(d)) {
      r[k] = await getSetting(`app_${k}`, d[k]);
    }
    // Extra fields not in migration defaults
    r.businessName = await getSetting("app_businessName", RECEIPT_DEFAULTS.businessName);
    r.address      = await getSetting("app_address",      RECEIPT_DEFAULTS.address);
    r.phone        = await getSetting("app_phone",        RECEIPT_DEFAULTS.phone);
    r.email        = await getSetting("app_email",        "");
    r.taxNumber    = await getSetting("app_taxNumber",    RECEIPT_DEFAULTS.taxNumber);
    r.logo         = await getSetting("app_logo",         "");
    r.website      = await getSetting("app_website",      RECEIPT_DEFAULTS.website);
    return r;
  },

  async saveAppSettings(settings) {
    for (const [k, v] of Object.entries(settings)) {
      await setSetting(`app_${k}`, v);
    }
  },

  // ── Receipt settings ───────────────────────────────
  async getReceiptSettings() {
    const r = { ...RECEIPT_DEFAULTS };
    for (const k of Object.keys(RECEIPT_DEFAULTS)) {
      r[k] = await getSetting(`receipt_${k}`, RECEIPT_DEFAULTS[k]);
    }
    return r;
  },

  async saveReceiptSettings(settings) {
    for (const [k, v] of Object.entries(settings)) {
      await setSetting(`receipt_${k}`, v);
    }
  },

  // ── POS behaviour settings ─────────────────────────
  async getPOSSettings() {
    const r = { ...POS_DEFAULTS };
    for (const k of Object.keys(POS_DEFAULTS)) {
      r[k] = await getSetting(`pos_${k}`, POS_DEFAULTS[k]);
    }
    return r;
  },

  async savePOSSettings(settings) {
    for (const [k, v] of Object.entries(settings)) {
      await setSetting(`pos_${k}`, v);
    }
  },

  // ── Currency settings ──────────────────────────────
  async getCurrencySettings() {
    const r = { ...CURRENCY_DEFAULTS };
    for (const k of Object.keys(CURRENCY_DEFAULTS)) {
      r[k] = await getSetting(`currency_${k}`, CURRENCY_DEFAULTS[k]);
    }
    return r;
  },

  async saveCurrencySettings(settings) {
    for (const [k, v] of Object.entries(settings)) {
      await setSetting(`currency_${k}`, v);
    }
  },

  // ── Load ALL settings at once (for Settings page) ──
  async getAll() {
    const [app, receipt, pos, currency] = await Promise.all([
      SettingsService.getAppSettings(),
      SettingsService.getReceiptSettings(),
      SettingsService.getPOSSettings(),
      SettingsService.getCurrencySettings(),
    ]);
    return { app, receipt, pos, currency };
  },

  // ── Save ALL settings at once ──────────────────────
  async saveAll({ app, receipt, pos, currency }) {
    await Promise.all([
      app      ? SettingsService.saveAppSettings(app)           : null,
      receipt  ? SettingsService.saveReceiptSettings(receipt)   : null,
      pos      ? SettingsService.savePOSSettings(pos)           : null,
      currency ? SettingsService.saveCurrencySettings(currency) : null,
    ].filter(Boolean));
  },

  // ── Raw key access ─────────────────────────────────
  get: getSetting,
  set: setSetting,

  async clearAll() {
    return safeDB(() => db.settings.clear());
  },
};
