# KAVO-SYS — Restaurant Point of Sale System
**Version:** RC Stable  
**Date:** 2026-05-29  
**Build:** Single-file offline-first PWA (React + Vite + Dexie.js)

---

## Features Included in This Release

| Module | Status |
|---|---|
| POS — full order workflow | ✅ |
| Kitchen Display (KDS) | ✅ |
| Inventory management + recipes | ✅ |
| Real inventory deduction on sale | ✅ |
| Restaurant table management | ✅ |
| Held orders + table resume | ✅ |
| Delivery / Takeaway / Dine-In orders | ✅ |
| Receipt preview + thermal print | ✅ |
| Cash / Card / Whish payments | ✅ |
| Real split payment with breakdown | ✅ |
| Reports dashboard (daily/weekly/monthly) | ✅ |
| Shift open / close + reconciliation | ✅ |
| Shift payment breakdown (Cash/Card/Whish) | ✅ |
| Expected vs actual drawer variance | ✅ |
| Shift history + print shift report | ✅ |
| Role-based permissions (Admin/Cashier/Kitchen) | ✅ |
| System Health diagnostics | ✅ |
| Backup / Restore (JSON + CSV exports) | ✅ |
| Arabic / English bilingual (311 keys) | ✅ |
| Offline-first — works without internet | ✅ |

---

## Quick Start

### Install dependencies
```bash
npm install
```

### Development server (hot reload)
```bash
npm run dev
# Opens at http://localhost:5173
```

### Production build (single HTML file)
```bash
npm run build
# Output: dist/index.html  — fully self-contained, no server needed
```

### Open in browser directly
```bash
open dist/index.html
# Or double-click the file in your file manager
```

---

## Default Login Credentials

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Cashier | `cashier` | `cashier123` |
| Kitchen | `kitchen` | `kitchen123` |

> ⚠️ Change these credentials in Settings → Security after first login.

---

## Deploy to Netlify

### Option A — Drag & Drop
1. Run `npm run build`
2. Go to [netlify.com/drop](https://app.netlify.com/drop)
3. Drag the `dist/` folder onto the page

### Option B — Connected GitHub repo
1. Push this project to a GitHub repository
2. In Netlify: New site → Import from Git
3. Build command: `npm run build`
4. Publish directory: `dist`

The `netlify.toml` file in this repo already contains the correct settings.

---

## Desktop App (Electron)

The `electron/` folder contains a desktop wrapper for offline kiosk use.

```bash
npm install -g electron
electron electron/main.js
```

For packaged installers, see `README-ELECTRON.md`.

---

## Data & Storage

All data is stored locally in the browser using **IndexedDB** (via Dexie.js v6).  
No external servers. No cloud required. All data stays on-device.

**Regular backups are strongly recommended:**
- Go to **Backup & Data** in the app
- Click **Full Database Backup** to download a `.json` file
- Store the `.json` file alongside this source code ZIP

> Keep this ZIP together with the latest KAVO-SYS JSON data backup.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 (no build-time lazy loading) |
| Build Tool | Vite 5 + vite-plugin-singlefile |
| Database | Dexie.js v6 (IndexedDB wrapper) |
| Styling | Inline React styles (no CSS framework) |
| i18n | Custom context (EN + AR, 311 keys) |
| Auth | Custom role-based (no external auth) |

---

## Project Structure

```
kavo-sys/
├── src/
│   ├── App.jsx              # Main router + AdminHome + CashierHome
│   ├── main.jsx             # Entry point + LangProvider
│   ├── auth/                # AuthProvider, authConstants (roles/permissions)
│   ├── db/
│   │   ├── db.js            # Dexie schema v6 (20 tables)
│   │   ├── DBProvider.jsx   # DB initialization wrapper
│   │   └── services/        # orders, menu, inventory, shifts, backup…
│   ├── hooks/               # useActiveShift, useElectron
│   ├── i18n/                # translations.js (311 keys × EN + AR)
│   ├── components/          # ErrorBoundary, ElectronTitleBar
│   └── pages/               # POS, Reports, Inventory, Kitchen, Settings…
├── electron/                # Desktop app wrapper
├── index.html               # Entry HTML + inline SVG favicon
├── vite.config.js           # viteSingleFile build config
├── package.json
└── netlify.toml
```

---

## Known Limitations

- Single HTML file output (~600KB gzip ~130KB) — works in all modern browsers
- IndexedDB is browser-local — data does not sync between devices automatically
- Photo uploads are resized to 300×300 and stored as base64 in menuItems only
- Electron wrapper is for kiosk use; not packaged for auto-update

---

## License

Internal use only. KAVO-SYS is proprietary software.

---

*KAVO-SYS RC Stable — Built with ❤️ for restaurant operators.*
