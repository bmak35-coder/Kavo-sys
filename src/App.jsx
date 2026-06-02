/**
 * KAVO-SYS · App Router · v3 (state-machine, no React.lazy)
 *
 * ROOT CAUSE OF CRASH:
 *   React.lazy(() => Promise.resolve().then(() => POS$1))
 *   In a viteSingleFile bundle, Rollup places all modules in one scope.
 *   Chrome V8 throws TDZ when a closure captures a `const` that is
 *   declared later in the same scope — even if the closure isn't called yet.
 *
 * FIX: No React.lazy at all. Use a state-machine where each screen is
 * rendered from a local import (already evaluated) only when the user
 * navigates to it. The key is: components imported at top-level are fine
 * because Rollup evaluates them before App.jsx. Only closures that
 * CAPTURE forward-declared consts cause TDZ.
 *
 * Safe pattern:
 *   - Import everything at top level (normal imports are hoisted properly)
 *   - Render screens only when view === their key
 *   - Wrap each render site in <ErrorBoundary>
 *   - Never build a screens = { key: <JSX/> } object literal — that calls
 *     React.createElement for every screen on every render.
 */

import { useState, useEffect }      from "react";
import { DBProvider }             from "./db/DBProvider.jsx";
import { AuthProvider, useAuth }  from "./auth/AuthProvider";
import { ErrorBoundary }          from "./components/ErrorBoundary.jsx";
import { useLang, LangSwitcher }  from "./i18n/LanguageContext.jsx";
import Login                      from "./pages/Login";
import KitchenDisplay             from "./pages/KitchenDisplay";
import POS                        from "./pages/POS.jsx";
import Reports                    from "./pages/Reports.jsx";
import Inventory                  from "./pages/Inventory.jsx";
import Purchasing                 from "./pages/Purchasing.jsx";
import MenuManagement             from "./pages/MenuManagement.jsx";
import DataManager                from "./pages/DataManager.jsx";
import SettingsCenter             from "./pages/SettingsCenter.jsx";
import SystemHealth               from "./pages/SystemHealth.jsx";
import Payroll                    from "./pages/Payroll.jsx";
import UserManagement             from "./pages/UserManagement.jsx";
import { BackupService }          from "./db/services/backup.js";

// ── Design tokens (no external imports) ───────────────────────────────
const C = { bg:"#070c16", surf:"#0b1220", card:"#101828", bdr:"#1a2438",
            acc:"#f0a500", text:"#e8edf5", muted:"#4a6080" };

// ── Per-module error fallback ──────────────────────────────────────────
function ModuleError({ name, onBack }) {
  const { t } = useLang();
  return (
    <div style={{ height:"100vh", background:C.bg, display:"flex",
                  alignItems:"center", justifyContent:"center",
                  flexDirection:"column", gap:16,
                  fontFamily:"system-ui,-apple-system,sans-serif" }}>
      <div style={{ fontSize:40 }}>⚠️</div>
      <div style={{ fontWeight:800, color:C.acc, fontSize:18 }}>{name} {t("moduleFailedLoad")}</div>
      <div style={{ fontSize:13, color:C.muted, maxWidth:360, textAlign:"center" }}>
        {t("moduleHasError")}
      </div>
      <button onClick={onBack}
        style={{ background:C.acc, color:"#000", border:"none", borderRadius:8,
                 padding:"10px 28px", fontWeight:700, fontSize:13,
                 cursor:"pointer", fontFamily:"inherit" }}>
        {t("backToHome")}
      </button>
    </div>
  );
}

// ── Safe screen renderer — only mounts when active ────────────────────
// Uses conditional rendering (not a prebuilt object) so React.createElement
// is called only for the current view — never for all screens at once.
function Screen({ active, name, onBack, children }) {
  if (!active) return null;
  return (
    <ErrorBoundary fallback={<ModuleError name={name} onBack={onBack}/>}>
      {children}
    </ErrorBoundary>
  );
}

// ── Backup reminder hook — reads last backup date, never writes ───────
function useBackupReminder() {
  const [status, setStatus] = useState("loading"); // "ok"|"warn"|"never"
  const [lastDate, setLastDate] = useState(null);
  useEffect(() => {
    BackupService.getLastBackupDate()
      .then(date => {
        if (!date) { setStatus("never"); return; }
        setLastDate(date);
        const daysAgo = (Date.now() - new Date(date).getTime()) / 86400000;
        setStatus(daysAgo >= 7 ? "warn" : "ok");
      })
      .catch(() => setStatus("ok")); // silent fail — never block UI
  }, []);
  return { status, lastDate };
}

// ── Dismissible reminder popup — shown once per session ───────────────
function BackupReminderBanner({ status, lastDate, onNavigate, onDismiss }) {
  const { t } = useLang();
  if (status === "ok" || status === "loading") return null;
  const isNever = status === "never";
  const msg = isNever ? t("noBackupEver") : t("backupOverdue");
  return (
    <div style={{
      background: isNever ? "#1a0e00" : "#130e00",
      border:     `1px solid ${isNever ? "#d2992260" : "#d2992240"}`,
      borderLeft: `4px solid #d29922`,
      borderRadius: 10,
      padding: "11px 14px",
      marginBottom: 20,
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 18 }}>⚠</span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700, color: "#d29922", fontSize: 13 }}>
          {t("backupRecommended")}
        </div>
        <div style={{ fontSize: 11, color: "#8a7040", marginTop: 2 }}>
          {msg} {t("backupReminderMsg")}
          {lastDate && <span style={{ marginLeft: 6, color: "#6a5830" }}>
            Last: {new Date(lastDate).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}
          </span>}
        </div>
      </div>
      <button
        onClick={() => onNavigate("data")}
        style={{ background: "#d29922", color: "#000", border: "none", borderRadius: 7,
                 padding: "6px 14px", fontWeight: 700, fontSize: 11, cursor: "pointer",
                 fontFamily: "inherit", whiteSpace: "nowrap" }}>
        {t("createBackupNow")}
      </button>
      <button
        onClick={onDismiss}
        style={{ background: "transparent", border: "1px solid #3a2e10", borderRadius: 7,
                 padding: "6px 11px", color: "#6a5830", fontSize: 11, fontWeight: 600,
                 cursor: "pointer", fontFamily: "inherit" }}>
        {t("dismiss")}
      </button>
    </div>
  );
}

// ── Admin Home (pure JSX, zero heavy imports, cannot crash) ───────────
function AdminHome({ onNavigate, onLogout, userName }) {
  const { status: bkpStatus, lastDate: bkpDate } = useBackupReminder();
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const showBanner = !reminderDismissed && (bkpStatus === "warn" || bkpStatus === "never");
  const { t } = useLang();

  const tiles = [
    { id:"pos",       icon:"🛒", label:t("pos"),        desc:t("posDesc"),        col:"#f0a500" },
    { id:"kitchen",   icon:"🍳", label:t("kitchenTile"),desc:t("kitchenDesc"),    col:"#3fb950" },
    { id:"inventory", icon:"📦", label:t("inventory"),  desc:t("inventoryDesc"),  col:"#fb923c" },
    { id:"reports",   icon:"📊", label:t("reports"),    desc:t("reportsDesc"),    col:"#58a6ff" },
    { id:"menu",      icon:"🍽", label:t("menu"),       desc:t("menuDesc"),       col:"#a78bfa" },
    { id:"purchasing",icon:"📋", label:t("purchasing"), desc:t("purchasingDesc"), col:"#34d399" },
    { id:"settings",  icon:"⚙", label:t("settings"),   desc:t("settingsDesc"),   col:"#7d8fa0" },
    { id:"payroll",   icon:"💼", label:"Payroll",      desc:"Staff salaries & advances", col:"#f59e0b" },
    { id:"users",     icon:"👥", label:"Users",        desc:"Manage staff accounts & roles", col:"#a78bfa" },
    {
      id:"data", icon:"💾", label:t("backup"), col:"#f472b6",
      desc: bkpStatus === "never" ? "⚠ " + t("backupDesc") + " (!)"
          : bkpStatus === "warn"  ? "⚠ Backup overdue (7d+)"
          : t("backupDesc"),
      badge: bkpStatus === "never" || bkpStatus === "warn",
    },
    { id:"health",    icon:"🔬", label:t("health"),     desc:t("healthDesc"),     col:"#38bdf8" },
  ];
  return (
    <div style={{ height:"100vh", background:C.bg, overflowY:"auto",
                  fontFamily:"system-ui,-apple-system,sans-serif" }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .tile{transition:transform .15s,box-shadow .15s;animation:fadeUp .3s ease both;cursor:pointer;}
        .tile:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.4);}
      `}</style>
      <header style={{ background:C.surf, borderBottom:`2px solid ${C.acc}`, height:56,
                       display:"flex", alignItems:"center", padding:"0 24px", gap:12 }}>
        <span style={{ fontWeight:900, fontSize:20, color:C.acc, letterSpacing:".07em" }}>
          KAVO<span style={{ color:C.text, opacity:.3 }}>-SYS</span>
        </span>
        <span style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:".1em" }}>{t("admin")}</span>
        <div style={{ flex:1 }}/>
        <LangSwitcher/>
        <span style={{ fontSize:12, color:C.muted }}>👑 {userName}</span>
        <button onClick={onLogout}
          style={{ background:"transparent", border:`1px solid ${C.bdr}`,
                   color:C.muted, borderRadius:8, padding:"5px 13px",
                   cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
          {t("signOut")}
        </button>
      </header>
      <div style={{ padding:32, maxWidth:900, margin:"0 auto" }}>
        {/* Backup reminder banner — only shown when overdue, dismissible */}
        <BackupReminderBanner
          status={bkpStatus}
          lastDate={bkpDate}
          onNavigate={onNavigate}
          onDismiss={() => setReminderDismissed(true)}
        />
        <div style={{ fontSize:13, color:C.muted, marginBottom:24 }}>
          {t("selectModule")}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:14 }}>
          {tiles.map((t, i) => (
            <button key={t.id} className="tile"
              onClick={() => onNavigate(t.id)}
              style={{ animationDelay:`${i*40}ms`, background:C.card,
                       border:`1px solid ${t.badge ? "#d29922" : C.bdr}`,
                       borderLeft:`4px solid ${t.col}`,
                       borderRadius:12, padding:"20px 16px", textAlign:"left",
                       fontFamily:"inherit", position:"relative" }}>
              <div style={{ fontSize:32, marginBottom:10 }}>{t.icon}</div>
              <div style={{ fontWeight:800, color:C.text, fontSize:14, marginBottom:4 }}>{t.label}</div>
              <div style={{ fontSize:11, color:t.badge ? "#d29922" : C.muted }}>{t.desc}</div>
              {/* Warning badge dot */}
              {t.badge && (
                <div style={{
                  position:"absolute", top:10, right:10,
                  width:9, height:9, borderRadius:"50%",
                  background:"#d29922",
                  boxShadow:"0 0 0 2px #1a1408",
                }}/>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


// ── Access Denied screen ───────────────────────────────────────────────
function AccessDenied({ onBack }) {
  const { t } = useLang();
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center", gap:16,
                  fontFamily:"system-ui,-apple-system,sans-serif" }}>
      <div style={{ fontSize:48 }}>🚫</div>
      <div style={{ fontWeight:800, color:"#f85149", fontSize:20 }}>Access Denied</div>
      <div style={{ fontSize:13, color:C.muted, maxWidth:320, textAlign:"center" }}>
        You do not have permission to access this page. Contact your manager.
      </div>
      <button onClick={onBack}
        style={{ background:C.acc, color:"#000", border:"none", borderRadius:10,
                 padding:"10px 28px", fontWeight:700, fontSize:13,
                 cursor:"pointer", fontFamily:"inherit", marginTop:8 }}>
        ← Back to Home
      </button>
    </div>
  );
}

// ── Cashier Home ───────────────────────────────────────────────────────
function CashierHome({ onNavigate, onLogout, userName }) {
  const { t } = useLang();
  const tiles = [
    { id:"pos",     icon:"🛒", label:t("pos"),         desc:t("posDesc"),     col:"#f0a500" },
    { id:"kitchen", icon:"🍳", label:t("kitchenTile"), desc:t("kitchenDesc"), col:"#3fb950" },
  ];
  return (
    <div style={{ height:"100vh", background:C.bg, overflowY:"auto",
                  fontFamily:"system-ui,-apple-system,sans-serif" }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .tile{transition:transform .15s,box-shadow .15s;animation:fadeUp .3s ease both;cursor:pointer;}
        .tile:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.4);}
      `}</style>
      <header style={{ background:C.surf, borderBottom:`2px solid ${C.acc}`, height:56,
                       display:"flex", alignItems:"center", padding:"0 24px", gap:12 }}>
        <span style={{ fontWeight:900, fontSize:20, color:C.acc, letterSpacing:".07em" }}>
          KAVO<span style={{ color:C.text, opacity:.3 }}>-SYS</span>
        </span>
        <span style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:".1em" }}>{t("cashier")}</span>
        <div style={{ flex:1 }}/>
        <LangSwitcher/>
        <span style={{ fontSize:12, color:C.muted }}>💳 {userName}</span>
        <button onClick={onLogout}
          style={{ background:"transparent", border:`1px solid ${C.bdr}`,
                   color:C.muted, borderRadius:8, padding:"5px 13px",
                   cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
          {t("signOut")}
        </button>
      </header>
      <div style={{ padding:32, maxWidth:600, margin:"0 auto" }}>
        <div style={{ fontSize:13, color:C.muted, marginBottom:24 }}>
          {t("welcomeBack")} {userName}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:14 }}>
          {tiles.map((t, i) => (
            <button key={t.id} className="tile"
              onClick={() => onNavigate(t.id)}
              style={{ animationDelay:`${i*50}ms`, background:C.card,
                       border:`1px solid ${C.bdr}`, borderLeft:`4px solid ${t.col}`,
                       borderRadius:12, padding:"22px 18px", textAlign:"left",
                       fontFamily:"inherit" }}>
              <div style={{ fontSize:36, marginBottom:10 }}>{t.icon}</div>
              <div style={{ fontWeight:800, color:C.text, fontSize:15, marginBottom:4 }}>{t.label}</div>
              <div style={{ fontSize:11, color:C.muted }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Router ────────────────────────────────────────────────────────
function Router() {
  const { user, logout, can } = useAuth();
  const [view, setView]  = useState("home");

  if (!user) return <Login/>;

  // Kitchen role — show kitchen display with no back button (isKitchenOnly = true inside)
  if (user.role === "kitchen") return <KitchenDisplay/>;

  const isAdmin   = user.role === "admin" || user.role === "owner" || user.role === "manager";
  const isCashier = user.role === "cashier";
  const goHome    = () => setView("home");
  const nav       = (v) => setView(v);
  const handleLogout = () => { logout(); setView("home"); };
  // Route guard helper
  const guard = (perm, component) =>
    can(perm) ? component : <AccessDenied onBack={goHome}/>;

  // ── HOME: only rendered when view === "home" ──────────────────────
  if (view === "home") {
    if (isAdmin)   return <AdminHome  onNavigate={nav} onLogout={handleLogout} userName={user.name}/>;
    if (isCashier) return <CashierHome onNavigate={nav} onLogout={handleLogout} userName={user.name}/>;
    return null;
  }

  // ── Kitchen tile from home — Admin/Cashier can go back to POS ──────
  if (view === "kitchen") {
    return (
      <Screen active name="Kitchen Display" onBack={goHome}>
        <KitchenDisplay onBack={goHome}/>
      </Screen>
    );
  }

  // ── Each screen rendered ONLY when active (conditional, not object) ─
  // This means React.createElement is called for ONE screen at a time —
  // never for all. The imported module consts are fully evaluated at this
  // point (imports run before any render code).

  if (view === "pos") return guard("canAccessPOS",
    <Screen active name="POS" onBack={goHome}><POS onNavigate={nav}/></Screen>);

  if (view === "reports") return guard("canAccessReports",
    <Screen active name="Reports" onBack={goHome}><Reports onBack={goHome}/></Screen>);

  if (view === "inventory") return guard("canAccessInventory",
    <Screen active name="Inventory" onBack={goHome}><Inventory onBack={goHome} onNavigate={nav}/></Screen>);

  if (view === "purchasing" && isAdmin) return (
    <Screen active name="Purchasing" onBack={() => nav("inventory")}>
      <Purchasing onBack={() => nav("inventory")}/>
    </Screen>
  );

  if (view === "menu" && isAdmin) return (
    <Screen active name="Menu Management" onBack={goHome}>
      <MenuManagement onBack={goHome}/>
    </Screen>
  );

  if (view === "settings" && isAdmin) return (
    <Screen active name="Settings" onBack={goHome}>
      <SettingsCenter onBack={goHome}/>
    </Screen>
  );

  if (view === "data" && isAdmin) return (
    <Screen active name="Backup & Data" onBack={goHome}>
      <DataManager onBack={goHome}/>
    </Screen>
  );

  if (view === "health" && isAdmin) return (
    <Screen active name="System Health" onBack={goHome}>
      <SystemHealth onBack={goHome}/>
    </Screen>
  );

  if (view === "users") return guard("canManageUsers",
    <Screen active name="User Management" onBack={goHome}>
      <UserManagement onBack={goHome}/>
    </Screen>);

  if (view === "payroll") return guard("canAccessReports",
    <Screen active name="Payroll" onBack={goHome}>
      <Payroll onBack={goHome}/>
    </Screen>);

  // Unknown view → home
  goHome();
  return null;
}

export default function App() {
  return (
    <DBProvider>
      <AuthProvider>
        <Router/>
      </AuthProvider>
    </DBProvider>
  );
}
