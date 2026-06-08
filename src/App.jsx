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
import { TenantProvider, useTenant } from "./contexts/TenantProvider.jsx";
import { FirebaseServicesProvider } from "./firebase/FirebaseServicesProvider.jsx";
import { verifyPassword } from "./utils/password.js";
import { db } from './firebase/config';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase/config';
import Login                      from "./pages/Login";
import KitchenDisplay             from "./pages/KitchenDisplay";
import POS                        from "./pages/POS.jsx";
import Reports                    from "./pages/Reports.jsx";
import Inventory                  from "./pages/Inventory.jsx";
import Purchasing                 from "./pages/Purchasing.jsx";
import MenuManagement             from "./pages/MenuManagement.jsx";
import DataManager                from "./pages/DataManager.jsx";
import DataMigration              from "./pages/DataMigration.jsx";
import SuperAdminDashboard        from "./pages/admin/SuperAdminDashboard.jsx";
import SettingsCenter             from "./pages/SettingsCenter.jsx";
import SystemHealth               from "./pages/SystemHealth.jsx";
import Payroll                    from "./pages/Payroll.jsx";
import UserManagement             from "./pages/UserManagement.jsx";
import Tables                     from "./pages/Tables.jsx";
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
    { id:"migration", icon:"🔄", label:"Migration",    desc:"Migrate to Firebase multi-tenant", col:"#8b5cf6" },
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

// ── Kitchen Home ───────────────────────────────────────────────────────
function KitchenHome({ onNavigate, onLogout, userName }) {
  const { t } = useLang();
  const tiles = [
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
        <span style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:".1em" }}>KITCHEN</span>
        <div style={{ flex:1 }}/>
        <LangSwitcher/>
        <span style={{ fontSize:12, color:C.muted }}>🍳 {userName}</span>
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

// ── Super Admin Area (with Firebase Authentication) ────────────────────
function SuperAdminArea() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [claims, setClaims] = useState(null);
  const { t } = useLang();

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const { getIdTokenResult } = await import('firebase/auth');
          const tokenResult = await getIdTokenResult(firebaseUser);
          setClaims(tokenResult.claims);
          setUser(firebaseUser);
        } catch (err) {
          console.error('Error getting claims:', err);
          setUser(null);
          setClaims(null);
        }
      } else {
        setUser(null);
        setClaims(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ height:"100vh", background:C.bg, display:"flex",
                    alignItems:"center", justifyContent:"center",
                    flexDirection:"column", gap:16,
                    fontFamily:"system-ui,-apple-system,sans-serif" }}>
        <div style={{ fontSize:40 }}>⚡</div>
        <div style={{ fontWeight:800, color:C.acc, fontSize:18 }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    const handleLogin = async (e) => {
      e.preventDefault();
      if (!email.trim() || !password) {
        setError("Please enter your email and password");
        return;
      }
      setLoggingIn(true);
      setError("");
      
      try {
        await signInWithEmailAndPassword(auth, email, password);
        // Auth state change listener will handle the rest
      } catch (err) {
        console.error('Login error:', err);
        setError(err.message || "Login failed. Please check your credentials.");
        setLoggingIn(false);
      }
    };

    return (
      <div style={{
        minHeight: "100vh", background: "#070912",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        <div style={{
          width: "100%", maxWidth: 420,
          background: "#0d1426", borderRadius: 16,
          padding: "40px 32px", boxShadow: "0 20px 60px rgba(0,0,0,.5)",
        }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👑</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#f0a500", marginBottom: 4 }}>
              Super Admin
            </div>
            <div style={{ fontSize: 13, color: "#4a6080" }}>
              Platform Administration
            </div>
          </div>

          <form onSubmit={handleLogin}>
            {/* Email Input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 800, 
                             color: "#4a6080", letterSpacing: ".05em", marginBottom: 6 }}>
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                style={{
                  width: "100%", padding: "12px 14px",
                  background: "#060a14", border: "1px solid #1a2540",
                  borderRadius: 8, fontSize: 14, color: "#e8edf5",
                  outline: "none", fontFamily: "inherit",
                }}
              />
            </div>

            {/* Password Input */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 800,
                             color: "#4a6080", letterSpacing: ".05em", marginBottom: 6 }}>
                PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{
                    width: "100%", padding: "12px 14px",
                    background: "#060a14", border: "1px solid #1a2540",
                    borderRadius: 8, fontSize: 14, color: "#e8edf5",
                    outline: "none", fontFamily: "inherit", paddingRight: 44,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  style={{
                    position: "absolute", right: 12, top: "50%",
                    transform: "translateY(-50%)", background: "none",
                    border: "none", cursor: "pointer", fontSize: 16,
                  }}
                >
                  {showPwd ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loggingIn}
              style={{
                width: "100%", padding: "13px 0",
                background: loggingIn ? "#6c5300" : "#f0a500",
                border: "none", borderRadius: 10,
                color: "#000", fontSize: 14, fontWeight: 800,
                cursor: loggingIn ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {loggingIn ? "Signing in..." : "Sign In →"}
            </button>
          </form>

          <div style={{ marginTop: 24, padding: 12, background: "#0a1220", 
                       borderRadius: 8, fontSize: 11, color: "#4a6080" }}>
            <strong style={{ color: "#f0a500" }}>Note:</strong> Only super admin accounts can access this area.
          </div>
        </div>
      </div>
    );
  }

  // User is authenticated - check if they're a super admin
  if (claims && claims.role === 'admin') {
    return <SuperAdminDashboard />;
  }

  // Not a super admin
  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div style={{ height:"100vh", background:"#070912", display:"flex",
                  alignItems:"center", justifyContent:"center",
                  flexDirection:"column", gap:24,
                  fontFamily:"system-ui,-apple-system,sans-serif",
                  padding: "0 24px" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🚫</div>
        <div style={{ fontSize:24, fontWeight:800, color:"#f85149", marginBottom:8 }}>
          Access Denied
        </div>
        <div style={{ fontSize:14, color:"#8b949e", marginBottom:24 }}>
          You are not authorized to access the Super Admin Dashboard.
          <br />
          Logged in as: <strong style={{ color:"#58a6ff" }}>{user.email}</strong>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding:"12px 24px", background:"#21262d", border:"1px solid #30363d",
            borderRadius:8, color:"#c9d1d9", fontSize:14, fontWeight:600,
            cursor:"pointer", fontFamily:"inherit"
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ── Tenant-Specific App ─────────────────────────────────────────────────
// This component handles tenant-specific routing (/:token)
function TenantApp({ token }) {
  return (
    <TenantProvider token={token}>
      <TenantAppContent />
    </TenantProvider>
  );
}

function TenantAppContent() {
  const { tenant, loading, error } = useTenant();
  const [tenantUser, setTenantUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Check if user is logged in (from localStorage)
  useEffect(() => {
    if (tenant) {
      const storedUser = localStorage.getItem(`tenant_user_${tenant.id}`);
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setTenantUser(parsedUser);
        } catch (e) {
          console.error('Error parsing user data:', e);
          localStorage.removeItem(`tenant_user_${tenant.id}`);
        }
      }
      setAuthLoading(false);
    }
  }, [tenant]);
  
  if (loading || authLoading) {
    return (
      <div style={{ height:"100vh", background:C.bg, display:"flex",
                    alignItems:"center", justifyContent:"center",
                    flexDirection:"column", gap:16,
                    fontFamily:"system-ui,-apple-system,sans-serif" }}>
        <div style={{ fontSize:40 }}>⚡</div>
        <div style={{ fontWeight:800, color:C.acc, fontSize:18 }}>Loading tenant...</div>
      </div>
    );
  }
  
  if (error || !tenant) {
    return (
      <div style={{ height:"100vh", background:C.bg, display:"flex",
                    alignItems:"center", justifyContent:"center",
                    flexDirection:"column", gap:16,
                    fontFamily:"system-ui,-apple-system,sans-serif" }}>
        <div style={{ fontSize:48 }}>🚫</div>
        <div style={{ fontWeight:800, color:"#f85149", fontSize:20 }}>Tenant Not Found</div>
        <div style={{ fontSize:13, color:C.muted, maxWidth:320, textAlign:"center" }}>
          {error || 'This restaurant is not active or does not exist.'}
        </div>
      </div>
    );
  }
  
  // Show login if user not authenticated
  if (!tenantUser) {
    return <TenantLogin tenant={tenant} onLogin={setTenantUser} />;
  }
  
  // User authenticated - show POS
  return (
    <TenantPOS tenant={tenant} user={tenantUser} onLogout={() => {
      localStorage.removeItem(`tenant_user_${tenant.id}`);
      setTenantUser(null);
    }} />
  );
}

function TenantPOS({ tenant, user, onLogout }) {
  const [screen, setScreen] = useState("home"); // Start with dashboard, not POS
  
  const handleNavigate = (page) => {
    console.log('🧭 Navigating to:', page);
    setScreen(page);
  };
  
  // Show dashboard home screen
  if (screen === "home") {
    return <TenantHome tenant={tenant} user={user} onNavigate={handleNavigate} onLogout={onLogout} />;
  }
  
  // User is authenticated - show POS system with Firebase services
  return (
    <ErrorBoundary fallback={<ModuleError name="POS" onBack={onLogout} />}>
      <FirebaseServicesProvider tenantId={tenant.id}>
        <AuthProvider initialUser={user} onLogoutCallback={onLogout}>
          <DBProvider>
            {screen === "pos" && <POS tenant={tenant} onNavigate={handleNavigate} currentScreen="pos" />}
            {screen === "kitchen" && <KitchenDisplay onBack={() => setScreen("home")} />}
            {screen === "tables" && <Tables onBack={() => setScreen("home")} />}
            {screen === "menu" && <MenuManagement onBack={() => setScreen("home")} onNavigate={handleNavigate} currentScreen="menu" />}
            {screen === "inventory" && <Inventory onBack={() => setScreen("home")} onNavigate={handleNavigate} currentScreen="inventory" />}
            {screen === "purchasing" && <Purchasing onBack={() => setScreen("home")} />}
            {screen === "reports" && <Reports onBack={() => setScreen("home")} onNavigate={handleNavigate} currentScreen="reports" />}
            {screen === "settings" && <SettingsCenter onBack={() => setScreen("home")} onNavigate={handleNavigate} currentScreen="settings" />}
            {screen === "users" && <UserManagement onBack={() => setScreen("home")} />}
            {screen === "payroll" && <Payroll onBack={() => setScreen("home")} />}
            {screen === "data" && <DataManager onBack={() => setScreen("home")} onNavigate={handleNavigate} currentScreen="data" />}
            {screen === "health" && <SystemHealth onBack={() => setScreen("home")} />}
          </DBProvider>
        </AuthProvider>
      </FirebaseServicesProvider>
    </ErrorBoundary>
  );
}

// ── Tenant Home Dashboard ───────────────────────────────────────────────
function TenantHome({ tenant, user, onNavigate, onLogout }) {
  const { t } = useLang();
  const isAdmin = user.role === "admin" || user.role === "owner" || user.role === "manager";
  const isCashier = user.role === "cashier";
  
  // Role-based tiles
  const getTiles = () => {
    const allTiles = [
      { id:"pos",       icon:"🛒", label:"POS",           desc:"Orders & payments",     col:"#f0a500", roles:["owner","admin","manager","cashier"] },
      { id:"kitchen",   icon:"🍳", label:"Kitchen",       desc:"Kitchen display",       col:"#3fb950", roles:["owner","admin","manager","cashier","kitchen"] },
      { id:"tables",    icon:"🪑", label:"Tables",        desc:"Floor plan & status",   col:"#a78bfa", roles:["owner","admin","manager"] },
      { id:"inventory", icon:"📦", label:"Inventory",     desc:"Stock management",      col:"#58a6ff", roles:["owner","admin","manager"] },
      { id:"reports",   icon:"📊", label:"Reports",       desc:"Sales & analytics",     col:"#a371f7", roles:["owner","admin","manager"] },
      { id:"menu",      icon:"🍽",  label:"Menu",          desc:"Items & modifiers",     col:"#f778ba", roles:["owner","admin"] },
      { id:"purchasing", icon:"🚚", label:"Purchasing",   desc:"Suppliers & POs",       col:"#85e89d", roles:["owner","admin"] },
      { id:"settings",  icon:"⚙️", label:"Settings",      desc:"Business & security",   col:"#ffab70", roles:["owner","admin"] },
      { id:"users",     icon:"👥", label:"Users",         desc:"Manage staff accounts & roles", col:"#7ee8fa", roles:["owner","admin"] },
      { id:"payroll",   icon:"💰", label:"Payroll",       desc:"Staff salaries & advances", col:"#ffdf5d", roles:["owner","admin"] },
      { id:"data",      icon:"💾", label:"Backup",        desc:"⚠️ Export & restore (I)", col:"#d29922", roles:["owner","admin"] },
      { id:"health",    icon:"🔧", label:"System Health", desc:"Diagnostics & status",  col:"#6e7681", roles:["owner","admin"] },
    ];
    return allTiles.filter(tile => tile.roles.includes(user.role));
  };
  
  const tiles = getTiles();
  const userIcon = user.role === "owner" ? "👑" : 
                   user.role === "admin" ? "🛡" : 
                   user.role === "manager" ? "📋" : 
                   user.role === "kitchen" ? "🍳" : "💳";
  
  console.log("🏠 TenantHome - User:", user.name, "Role:", user.role, "Tiles:", tiles.length);
  
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
        <span style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:".1em", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tenant.name}
        </span>
        <div style={{ flex:1 }}/>
        <LangSwitcher/>
        <div style={{ fontSize:12, color:C.muted, display:"flex", alignItems:"center", gap:6 }}>
          <span>{userIcon}</span>
          <span>{user.name}</span>
        </div>
        <button onClick={onLogout}
          style={{ background:"transparent", border:`1px solid ${C.bdr}`,
                   color:C.muted, borderRadius:8, padding:"5px 13px",
                   cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
          {t("signOut")}
        </button>
      </header>
      <div style={{ padding:32, maxWidth:900, margin:"0 auto" }}>
        <div style={{ fontSize:13, color:C.muted, marginBottom:24 }}>
          {t("selectModule")}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:14 }}>
          {tiles.map((tile, i) => (
            <button key={tile.id} className="tile"
              onClick={() => onNavigate(tile.id)}
              style={{ animationDelay:`${i*40}ms`, background:C.card,
                       border:`1px solid ${tile.id === "data" ? "#d29922" : C.bdr}`,
                       borderLeft:`4px solid ${tile.col}`,
                       borderRadius:12, padding:"20px 16px", textAlign:"left",
                       fontFamily:"inherit", position:"relative" }}>
              <div style={{ fontSize:32, marginBottom:10 }}>{tile.icon}</div>
              <div style={{ fontWeight:800, color:C.text, fontSize:14, marginBottom:4 }}>{tile.label}</div>
              <div style={{ fontSize:11, color:tile.id === "data" ? "#d29922" : C.muted }}>{tile.desc}</div>
              {/* Warning badge for backup */}
              {tile.id === "data" && (
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

// ── Tenant Login Component (Firestore-based) ────────────────────────────
function TenantLogin({ tenant, onLogin }) {
  const { t } = useLang();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter your username and password");
      return;
    }
    setLoading(true);
    setError("");
    
    try {
      // Query Firestore for user - try username first, then email
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const usersRef = collection(db, 'tenants', tenant.id, 'users');
      
      // Try to find by username first
      let q = query(usersRef, where('username', '==', username.toLowerCase().trim()));
      let snapshot = await getDocs(q);
      
      // If not found by username, try email
      if (snapshot.empty) {
        q = query(usersRef, where('email', '==', username.trim()));
        snapshot = await getDocs(q);
      }
      
      if (snapshot.empty) {
        throw new Error('Invalid username or password');
      }
      
      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();
      
      // Verify password - try plain text first (for users created in UserManagement)
      // then fall back to PBKDF2 hashing (for Firebase Auth users)
      let passwordMatch = false;
      if (userData.password === password) {
        // Plain text password match (users created in system)
        passwordMatch = true;
      } else {
        // Try PBKDF2 verification (Firebase Auth users)
        try {
          passwordMatch = await verifyPassword(password, userData.password);
        } catch (e) {
          // If verification fails, password doesn't match
          passwordMatch = false;
        }
      }
      
      if (!passwordMatch) {
        throw new Error('Invalid username or password');
      }
      
      // Check if user is active (handle both 'active' field and 'status' field)
      const isActive = userData.active !== false && userData.status !== 'inactive';
      if (!isActive) {
        throw new Error('Your account is not active');
      }
      
      // Store user in localStorage
      const userSession = {
        id: userDoc.id,
        username: userData.username || userData.email,
        email: userData.email || userData.username,
        name: userData.name,
        role: userData.role,
        tenantId: tenant.id,
        permissions: userData.permissions || {},
      };
      
      localStorage.setItem(`tenant_user_${tenant.id}`, JSON.stringify(userSession));
      onLogin(userSession);
      
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || "Login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#070912",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 420,
        background: "#0d1426", borderRadius: 16,
        padding: "40px 32px", boxShadow: "0 20px 60px rgba(0,0,0,.5)",
      }}>
        {/* Tenant Name */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🍽️</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#f0a500", marginBottom: 4 }}>
            {tenant.name}
          </div>
          <div style={{ fontSize: 13, color: "#4a6080" }}>
            Point of Sale System
          </div>
        </div>

        <form onSubmit={handleLogin}>
          {/* Username/Email Input */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 800, 
                           color: "#4a6080", letterSpacing: ".05em", marginBottom: 6 }}>
              EMAIL / USERNAME
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username or email"
              style={{
                width: "100%", padding: "12px 14px",
                background: "#060a14", border: "1px solid #1a2540",
                borderRadius: 8, fontSize: 14, color: "#e8edf5",
                outline: "none", fontFamily: "inherit",
              }}
            />
          </div>

          {/* Password Input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 800,
                           color: "#4a6080", letterSpacing: ".05em", marginBottom: 6 }}>
              PASSWORD
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                style={{
                  width: "100%", padding: "12px 14px",
                  background: "#060a14", border: "1px solid #1a2540",
                  borderRadius: 8, fontSize: 14, color: "#e8edf5",
                  outline: "none", fontFamily: "inherit", paddingRight: 44,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                style={{
                  position: "absolute", right: 12, top: "50%",
                  transform: "translateY(-50%)", background: "none",
                  border: "none", cursor: "pointer", fontSize: 16,
                }}
              >
                {showPwd ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              padding: "10px 12px", background: "#2a1215",
              border: "1px solid #f85149", borderRadius: 8,
              marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
            }}>
              <span>⚠</span>
              <span style={{ fontSize: 12, color: "#f85149" }}>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "13px 0",
              background: loading ? "#6c5300" : "#f0a500",
              border: "none", borderRadius: 10,
              color: "#000", fontSize: 14, fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Router ────────────────────────────────────────────────────────
function Router() {
  const { user, logout, can } = useAuth();
  
  // URL-based routing with tenant token support
  const [view, setView] = useState(() => {
    const path = window.location.pathname.slice(1); // Remove leading /
    
    // Check if path is admin
    if (path === 'admin' || path.startsWith('admin/')) {
      return 'admin';
    }
    
    // Check if path is a known route
    const knownRoutes = ['migration', 'kitchen', 'pos', 'inventory', 'reports', 
                         'menu', 'settings', 'data', 'health', 'users', 'payroll', 'purchasing'];
    if (knownRoutes.includes(path)) {
      return path;
    }
    
    // If path exists and is not a known route, assume it's a tenant token
    if (path && path.length > 0) {
      return 'tenant';
    }
    
    return 'home';
  });
  
  const [tenantToken, setTenantToken] = useState(() => {
    const path = window.location.pathname.slice(1);
    const knownRoutes = ['admin', 'migration', 'kitchen', 'pos', 'inventory', 'reports', 
                         'menu', 'settings', 'data', 'health', 'users', 'payroll', 'purchasing'];
    if (path && !knownRoutes.includes(path) && !path.startsWith('admin/')) {
      return path;
    }
    return null;
  });

  // Update URL when view changes
  useEffect(() => {
    let path = '/';
    if (view === 'tenant' && tenantToken) {
      path = `/${tenantToken}`;
    } else if (view === 'admin') {
      path = '/admin';
    } else if (view !== 'home') {
      path = `/${view}`;
    }
    
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  }, [view, tenantToken]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.slice(1);
      
      if (path === 'admin' || path.startsWith('admin/')) {
        setView('admin');
        setTenantToken(null);
      } else if (path === 'migration') {
        setView('migration');
        setTenantToken(null);
      } else if (path === 'kitchen') {
        setView('kitchen');
        setTenantToken(null);
      } else if (path === 'pos') {
        setView('pos');
        setTenantToken(null);
      } else {
        const knownRoutes = ['inventory', 'reports', 'menu', 'settings', 'data', 'health', 'users', 'payroll', 'purchasing'];
        if (knownRoutes.includes(path)) {
          setView(path);
          setTenantToken(null);
        } else if (path && path.length > 0) {
          setView('tenant');
          setTenantToken(path);
        } else {
          setView('home');
          setTenantToken(null);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  
  // Super Admin Dashboard - /admin route (with Firebase Auth)
  if (view === 'admin') {
    return <SuperAdminArea />;
  }
  
  // Tenant-specific POS - /:token route
  if (view === 'tenant' && tenantToken) {
    return <TenantApp token={tenantToken} />;
  }

  if (!user) return <Login/>;

  const isAdmin   = user.role === "admin" || user.role === "owner" || user.role === "manager";
  const isCashier = user.role === "cashier";
  const isKitchen = user.role === "kitchen";
  
  // Debug logging
  console.log("🔍 Router - User:", { name: user.name, role: user.role, isKitchen, view });
  
  const goHome    = () => setView("home");
  const nav       = (v) => setView(v);
  const handleLogout = () => { logout(); setView("home"); };
  // Route guard helper
  const guard = (perm, component) =>
    can(perm) ? component : <AccessDenied onBack={goHome}/>;

  // ── HOME: only rendered when view === "home" ──────────────────────
  if (view === "home" || view === "admin") {
    console.log("🏠 Rendering home - isAdmin:", isAdmin, "isCashier:", isCashier, "isKitchen:", isKitchen);
    if (isAdmin)   return <AdminHome  onNavigate={nav} onLogout={handleLogout} userName={user.name}/>;
    if (isCashier) return <CashierHome onNavigate={nav} onLogout={handleLogout} userName={user.name}/>;
    if (isKitchen) return <KitchenHome onNavigate={nav} onLogout={handleLogout} userName={user.name}/>;
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

  if (view === "migration" && isAdmin) return (
    <Screen active name="Firebase Migration" onBack={goHome}>
      <DataMigration onBack={goHome}/>
    </Screen>
  );

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
