# KAVO-SYS — Final Production Changelog
**Version:** Production Final  
**Build Date:** 2026-06-01  
**Build:** 654KB single-file HTML · 52 source files · Dexie v7 schema

---

## All Completed Fixes & Modules

### 🔒 SECURITY
- **[CRITICAL FIX]** Removed `quickLogin()` auto-login bypass — all users must enter username + password
- **[CRITICAL FIX]** Removed "Demo Accounts" one-click buttons from login screen
- **[CRITICAL FIX]** No credentials visible on login screen; role reference table only
- Protected routes: every module gated by `can(permission)` — unauthorized = Access Denied screen
- Session persists across page refreshes via `sessionStorage`; tab close = auto-logout
- Owner-only `canManageUsers` gate on User Management route

### 🔐 AUTHENTICATION & ROLES
- Four roles implemented: **Owner, Manager, Cashier, Kitchen**
- `owner` / `admin` roles are equivalent (backward compatible)
- Permission matrix enforced at three layers: navigation tiles, route guards, action level
- Role permissions:

| Permission | Owner | Manager | Cashier | Kitchen |
|---|---|---|---|---|
| POS | ✅ | ✅ | ✅ | ❌ |
| Kitchen | ✅ | ✅ | ✅ | ✅ |
| Reports | ✅ | ✅ | ❌ | ❌ |
| Inventory | ✅ | ✅ | ❌ | ❌ |
| Payroll | ✅ | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ | ❌ |
| Manage Users | ✅ | ❌ | ❌ | ❌ |
| Void Orders | ✅ | ✅ | ❌ | ❌ |
| Apply Discount | ✅ | ✅ | ❌ | ❌ |
| Delete Data | ✅ | ❌ | ❌ | ❌ |

### 👥 USER MANAGEMENT (new module)
- Full CRUD: create, edit, deactivate, delete staff accounts
- Password strength meter; confirm password; min 4 characters
- Role selector with live permission preview grid
- Cannot self-delete or self-deactivate
- Reset-to-defaults button
- Users stored in Dexie IDB + localStorage fallback + included in backup

### 💼 PAYROLL MODULE (new module)
- Employee records: name, role, phone, monthly salary, hire date, status
- Salary advance recording per employee per month (YYYY-MM key)
- Automatic remaining salary = Monthly Salary − Total Advances for selected month
- Month filter (current/previous/any of last 12 months) — advances only count for selected month
- Payroll summary: Total Salaries, Total Advances, Remaining Payroll
- Progress bar per employee showing % of salary advanced
- Advance history with per-advance delete
- CSV export for employees and advances
- Persists in Dexie `employees` + `salaryAdvances` tables; included in JSON backup

### 🛒 POS — ORDER MANAGEMENT
- Split Payment is a **workflow** not a method: Cash + Card + Whish inputs, must sum to grand total
- Split stores `payments: [{method, amount}]` — never stored as "Split" in reports
- Table management: required for dine-in, optional for takeaway/delivery
- Table picker with occupied-table auto-resume
- Table conflict modal: "Table already has an active order" with Resume/Cancel
- `sendKitchen` saves order to held[] so table picker can resume it
- Table lifecycle: Save → Occupied; Pay → Cleaning; Void → Available
- Held orders show: type badge, table/customer, total, time
- Delivery requires: name + phone + address; Takeaway requires: name + phone
- Order notes and delivery notes stored and shown on receipt
- Receipt: type badge (🍽/🛍/🚚), customer info group, address block, notes block
- Inventory deduction on payment; restore on void; stock warning before payment
- `sanitizeCartItem` strips base64 photos from all order snapshots

### 🍳 KITCHEN DISPLAY
- Real-time order queue from localStorage bridge
- Dine-in / Takeaway / Delivery type filters
- Kitchen type filters: All Types, Dine-In, Takeaway, Delivery
- Status badges: New, Preparing, Ready, Served, Cancelled
- Arabic/English bilingual
- Occupied table stays occupied through kitchen workflow until paid

### 📦 INVENTORY
- Real recipe-based deduction on payment via `InventoryService.deductForOrder`
- `checkAvailability` on Confirm Payment: warns if insufficient stock, allows override
- `restoreForOrder` on void: returns stock
- Stock logs with order linkage
- `InvFld` extracted to module level (fixes focus-loss-on-keystroke bug)

### 📊 REPORTS & SHIFTS
- Split payment distributions to Cash/Card/Whish in `getMethodTotal()` — no "Split" total
- Shift: Opening Cash + Cash Sales only = Expected Drawer (Card/Whish not in till)
- Actual closing cash: `null` = Not Reconciled; `0` = entered zero (different states)
- Shift history with labeled reconciliation: ✓ BALANCED / 📈 OVERAGE / 📉 SHORTAGE
- `useActiveShift` hook: shift persists across navigation and page refresh via IDB
- `shiftId` linked to paid orders for precise shift attribution

### ⚙ SETTINGS & BACKUP
- Tables management (Settings > Tables tab) using localStorage
- `kavo-sys-backup-latest.json` fixed-filename download for Google Drive
- Backup v3.2: includes employees, salaryAdvances, users, currentShift, paymentMethods
- Restore correctly writes payroll data back

### 🌐 INTERNATIONALIZATION
- 311 translation keys × English + Arabic
- RTL support for Arabic
- All module labels translated
- Kitchen type filter labels translated inline (not at module level, avoids TDZ crash)

### 🐛 BUG FIXES
- `var t = setInterval` renamed to `tickTimer` (eliminated `t` variable shadowing `lang.t`)
- `TYPE_FILTERS` moved from module level to render site (eliminated `lang is not defined` crash)
- `useLang` import added to SettingsCenter, Reports, Purchasing (eliminated `useLang is not defined`)
- `db.tables` renamed to `db.restaurantTables` in schema (avoided Dexie built-in property collision)
- `InvFld` extracted to module level (fixed inventory field focus loss on keystroke)
- `roundMoney()` applied at calculation AND storage level (eliminated `18.755000000000003` decimals)
- `sanitizeCartItem` strips photos at `addItem` entry point (not just at storage)
- SystemHealth: all `.toLocaleString()` calls wrapped in `Number(v??0)` (eliminated undefined crash)
- SystemHealth: `.map()` calls protected with `||[]` fallback (eliminated undefined.map crash)
- `db.restaurantTables.toArray` calls eliminated — tables use localStorage only
- `saving` state declaration restored to TablesPanel (fixed Settings crash)
- `can` added to Router's `useAuth()` destructure (fixed `can is not defined`)
- `closeShift` now stores `closingCash: null` for unreconciled shifts (not `0`)
- `openShift` awaits IDB write before `reloadShift()` (fixed shift open button doing nothing)
- `kavo-sys-backup-latest` fixed-name backup added alongside dated backup
- `ShiftDetail` reconciliation shows "Not Reconciled" when `cashDiff === null`
- `ShiftRow` labeled variance badge replaces bare colored number

### 📐 SCROLL FIX
- Global `overflow: hidden` removed from `html, body, #root`
- All pages: `minHeight: 100vh` → `height: 100vh` + content area `overflowY: auto`
- `paddingBottom: 80` on all content areas
- SettingsCenter inner flex `overflow: hidden` removed

### 💰 MONEY PRECISION
- `roundMoney(v) = Number(Number(v||0).toFixed(2))` applied at every calculation step
- Applied to: subtotal, discAmt, svcAmt, vatAmt, grand, amtPaid, change
- Storage objects explicitly round every money field before IDB/localStorage write

---

## Known Limitations

1. **Single-device only** — all data in browser IndexedDB and localStorage. No cloud sync between devices.
2. **Photo storage** — menu item photos stored as base64 in IDB (300×300 canvas resize). Increases DB size.
3. **No PIN login** — staff must enter full username/password (quick PIN not implemented).
4. **Session scope** — session lives in `sessionStorage`. Cleared when browser tab is closed.
5. **Offline mode** — fully offline. No automatic remote backup. Manual JSON export required.
6. **Electron** — desktop wrapper available but not packaged for auto-update or code signing.
7. **Activity Logs** — service exists but module not linked to AdminHome (disabled).

---

## Pending Future Improvements

- [ ] Quick PIN login for cashiers
- [ ] Cloud backup via optional Supabase integration (migration kit available separately)
- [ ] Table transfer UI (TableService.transfer() exists, no UI yet)
- [ ] Receipt printer integration (thermal printer via Bluetooth/USB)
- [ ] Customer loyalty points
- [ ] Multi-branch support
- [ ] Activity log UI re-enable
- [ ] Stripe subscription billing hooks
- [ ] Offline-to-cloud data migration

---

## Default Credentials

| Username | Password | Role |
|---|---|---|
| `owner` | `owner123` | Full access |
| `manager` | `manager123` | Most modules |
| `cashier` | `cashier123` | POS only |
| `kitchen` | `kitchen123` | Kitchen only |

**Change all passwords immediately after first login** via Settings → 👥 Users.

---

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/index.html (single self-contained file)
```

Deploy to Netlify: drag `dist/` folder to netlify.com/drop
