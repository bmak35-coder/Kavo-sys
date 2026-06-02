/**
 * KAVO-SYS · System Health Check · v1.0
 * Admin-only · Offline-first · IndexedDB
 *
 * All checks run in the browser only — no network calls.
 * Safe: read-only, zero writes to any data.
 */

import { useState, useCallback } from "react";
import { useLang } from "../i18n/LanguageContext.jsx";
import { useAuth } from "../auth/AuthProvider";
import { db, safeDB } from "../db/db.js";
import { BackupService } from "../db/services/backup.js";

/* ─── Design tokens ──────────────────────────────────*/
var C = {
  bg:"#070c16", surf:"#0b1220", card:"#101828", card2:"#0d1525",
  bdr:"#1a2438", acc:"#f0a500",
  text:"#e8edf5", muted:"#4a6080", sub:"#7d8fa0",
  success:"#3fb950", danger:"#f85149", warn:"#d29922", info:"#58a6ff",
};

/* ─── Status levels ──────────────────────────────────*/
var OK   = "ok";
var WARN = "warn";
var ERR  = "err";
var SKIP = "skip";

var STATUS_CFG = {
  ok:   { col:C.success, bg:"#0d1a10", bdr:"#1a3a20", icon:"✅", label:"Healthy"   },
  warn: { col:C.warn,    bg:"#1a1408", bdr:"#3a2a08", icon:"⚠",  label:"Warning"   },
  err:  { col:C.danger,  bg:"#160808", bdr:"#3a1010", icon:"❌", label:"Error"     },
  skip: { col:C.muted,   bg:"#0b1220", bdr:"#1a2438", icon:"—",  label:"Not Tested"},
};

/* ─── Helpers ────────────────────────────────────────*/
function fmtBytes(bytes) {
  if (bytes < 1024)       return bytes + " B";
  if (bytes < 1048576)    return (bytes/1024).toFixed(1) + " KB";
  return (bytes/1048576).toFixed(2) + " MB";
}
function fmtDate(iso) {
  if (!iso) return "Never";
  if (!iso) return "Never";
  try { return new Date(iso).toLocaleString("en-US",{month:"short",day:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
  catch { return iso; }
}
function elapsed(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h  = Math.floor(ms/3600000);
  const m  = Math.floor((ms%3600000)/60000);
  if (h > 48) return Math.floor(h/24) + "d ago";
  if (h > 0)  return h + "h ago";
  return m + "m ago";
}

/* ─── Individual check runners ───────────────────────*/
async function checkIndexedDB() {
  try {
    if (!db.isOpen()) await db.open();
    // Try a lightweight read
    await safeDB(() => db.settings.limit(1).toArray(), []);
    // db.tables is Dexie's built-in array of all registered Table objects
    const tables = db.tables.map(t => t.name);
    return {
      status:  OK,
      detail:  `${tables.length} tables open`,
      tables,
    };
  } catch(e) {
    return { status: ERR, detail: "IndexedDB unavailable: " + (e.message||e) };
  }
}

async function checkLocalStorage() {
  try {
    const key = "__kavo_health_test__";
    localStorage.setItem(key, "1");
    const val = localStorage.getItem(key);
    localStorage.removeItem(key);
    if (val !== "1") throw new Error("Read-back mismatch");
    // Estimate usage
    let size = 0;
    for (const k of Object.keys(localStorage)) {
      size += (localStorage.getItem(k)||"").length * 2; // UTF-16
    }
    return { status: OK, detail: `Read/write OK · ~${fmtBytes(size)} used` };
  } catch(e) {
    return { status: ERR, detail: "localStorage unavailable: " + (e.message||e) };
  }
}

async function checkSession(user) {
  if (!user) return { status: WARN, detail: "No active session" };
  try {
    const raw = sessionStorage.getItem("kavo_session");
    if (!raw) return { status: WARN, detail: "Session not in sessionStorage" };
    const s = JSON.parse(raw);
    return {
      status: OK,
      detail: `${s.name} · ${s.role} · logged in ${fmtDate(s.loginAt)}`,
    };
  } catch {
    return { status: WARN, detail: "Session found but could not parse" };
  }
}

async function checkDatabase() {
  try {
    const tables = [
      "orders","heldOrders","kitchenOrders","shifts","receipts",
      "menuItems","categories","inventoryItems","suppliers","purchaseOrders",
      "customers","activityLogs","settings","users","restaurantTables",
    ];
    const counts = await Promise.all(
      (tables||[]).map(t => safeDB(() => db[t]?.count(), 0).catch(()=>0))
    );
    const total = counts.reduce((s,n)=>s+(n||0),0);
    const summary = (tables||[]).map((t,i)=>`${t}:${counts[i]}`).filter(s=>!s.endsWith(":0")).join(" · ");
    return {
      status:  OK,
      detail:  `${Number(total||0).toLocaleString()} total records · ${summary||"all empty"}`,
      counts:  Object.fromEntries((tables||[]).map((t,i)=>[t,counts[i]])),
    };
  } catch(e) {
    return { status: ERR, detail: "Database read error: " + (e.message||e) };
  }
}

async function checkDBSize() {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const used  = est.usage  || 0;
      const quota = est.quota  || 0;
      const pct   = quota ? ((used/quota)*100).toFixed(1) : "?";
      const lvl   = quota && (used/quota) > 0.85 ? WARN : OK;
      return {
        status: lvl,
        detail: `${fmtBytes(used)} used of ${fmtBytes(quota)} (${pct}%)`,
        used, quota,
      };
    }
    return { status: SKIP, detail: "Storage API not supported in this browser" };
  } catch(e) {
    return { status: SKIP, detail: "Could not estimate storage: " + (e.message||e) };
  }
}

async function checkPOS() {
  try {
    const orders = await safeDB(()=>db.orders.limit(1).toArray(),[]);
    const menu   = await safeDB(()=>db.menuItems.count(),0);
    return {
      status: OK,
      detail: `Orders table accessible · ${menu} menu item${menu!==1?"s":""}`,
    };
  } catch(e) {
    return { status: ERR, detail: "POS data read failed: " + (e.message||e) };
  }
}

async function checkKitchen() {
  try {
    const q = await safeDB(()=>db.kitchenOrders.toArray(),[]);
    const active = (q||[]).filter(o=>o.status==="New"||o.status==="Preparing"||o.status==="Ready").length;
    return {
      status: OK,
      detail: `Kitchen queue accessible · ${active} active order${active!==1?"s":""}`,
    };
  } catch(e) {
    return { status: ERR, detail: "Kitchen data read failed: " + (e.message||e) };
  }
}

async function checkInventory() {
  try {
    const count = await safeDB(()=>db.inventoryItems.count(),0);
    return { status: OK, detail: `${count} inventory item${count!==1?"s":""}` };
  } catch(e) {
    return { status: ERR, detail: "Inventory read failed: " + (e.message||e) };
  }
}

async function checkBackup() {
  try {
    const last = await BackupService.getLastBackupDate();
    if (!last) return {
      status: WARN,
      detail: "⚠ No backup has ever been created. Go to Backup → Create Backup Now.",
      lastBackup: null,
      neverBacked: true,
    };
    const hoursAgo = (Date.now()-new Date(last).getTime())/3600000;
    const lvl = hoursAgo > 168 ? WARN : OK; // warn if >7 days
    return {
      status:     lvl,
      detail:     `Last backup: ${fmtDate(last)} (${elapsed(last)})`,
      lastBackup: last,
    };
  } catch(e) {
    return { status: ERR, detail: "Backup check failed: " + (e.message||e) };
  }
}

function getBrowserInfo() {
  const ua  = navigator.userAgent;
  const isMob = /Mobi|Android/i.test(ua);
  const browser =
    /Edg/.test(ua)     ? "Edge"    :
    /OPR|Opera/.test(ua)?"Opera"   :
    /Chrome/.test(ua)  ? "Chrome"  :
    /Firefox/.test(ua) ? "Firefox" :
    /Safari/.test(ua)  ? "Safari"  : "Unknown";
  const memory = navigator.deviceMemory ? `${navigator.deviceMemory} GB RAM` : "";
  const cores  = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} cores` : "";
  return {
    browser,
    isMobile: isMob,
    platform: navigator.platform || "Unknown",
    language: navigator.language || "",
    online:   navigator.onLine,
    specs:    [memory, cores].filter(Boolean).join(" · "),
  };
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
export default function SystemHealth({ onBack }) {
  var { user } = useAuth();
  const { t } = useLang();

  var [results,  setResults]  = useState(null);
  var [running,  setRunning]  = useState(false);
  var [ts,       setTs]       = useState(null);  // timestamp of last run

  var runChecks = useCallback(async function() {
    setRunning(true);
    try {
      var [idb, ls, sess, dbRec, dbSz, pos, kitch, inv, bkp] = await Promise.all([
        checkIndexedDB(),
        checkLocalStorage(),
        checkSession(user),
        checkDatabase(),
        checkDBSize(),
        checkPOS(),
        checkKitchen(),
        checkInventory(),
        checkBackup(),
      ]);
      var browser = getBrowserInfo();
      setResults({ idb, ls, sess, dbRec, dbSz, pos, kitch, inv, bkp, browser });
      setTs(new Date().toISOString());
    } catch(e) {
      console.error("[Health]", e);
    }
    setRunning(false);
  }, [user]);

  function exportReport() {
    if (!results) return;
    var browser = results.browser || {};
    var lines = [
      "KAVO-SYS DIAGNOSTIC REPORT",
      "Generated: " + fmtDate(ts),
      "User: " + (user?.name||"—") + " (" + (user?.role||"—") + ")",
      "",
      "=== BROWSER / DEVICE ===",
      "Browser:  " + (browser.browser||"Unknown"),
      "Platform: " + (browser.platform||"Unknown"),
      "Mobile:   " + (browser.isMobile?"Yes":"No"),
      "Language: " + (browser.language||"Unknown"),
      "Online:   " + (browser.online?"Yes":"No"),
      "Specs:    " + (browser.specs||"—"),
      "User Agent: " + navigator.userAgent,
      "",
      "=== SYSTEM CHECKS ===",
    ];
    var checks = [
      ["IndexedDB",     results.idb],
      ["LocalStorage",  results.ls],
      ["Session",       results.sess],
      ["Database",      results.dbRec],
      ["DB Size",       results.dbSz],
      ["POS Module",    results.pos],
      ["Kitchen Module",results.kitch],
      ["Inventory",     results.inv],
      ["Backup",        results.bkp],
    ];
    checks.forEach(function([name, r]) {
      if (!r) { lines.push(name + ": [SKIP] not available"); return; }
      lines.push(name + ": [" + (r.status||"?").toUpperCase() + "] " + (r.detail||""));
    });
    if (results.dbRec?.counts) {
      lines.push("","=== TABLE RECORD COUNTS ===");
      Object.entries(results.dbRec.counts).forEach(function([t,n]) {
        lines.push("  " + t + ": " + (n||0));
      });
    }
    if (results.dbSz?.used) {
      lines.push("","=== STORAGE ===");
      lines.push("Used:  " + fmtBytes(results.dbSz.used||0));
      lines.push("Quota: " + fmtBytes(results.dbSz.quota||0));
    }
    lines.push("","=== END OF REPORT ===");

    var blob = new Blob([lines.join("\n")], {type:"text/plain"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "KAVO_diagnostic_" + new Date().toISOString().slice(0,10) + ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  var browser = getBrowserInfo();
  var overallStatus = results
    ? Object.values(results).filter(r=>r&&r.status).some(r=>r.status===ERR) ? ERR
      : Object.values(results).filter(r=>r&&r.status).some(r=>r.status===WARN) ? WARN
      : OK
    : null;

  return (
    <div style={{height:"100vh", background:C.bg, color:C.text,
                  fontFamily:"system-ui,-apple-system,sans-serif", display:"flex", flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; }
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.bdr};border-radius:4px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .sh-in{animation:fadeUp .25s ease both;}
        .sh-btn:hover{opacity:.82;}.sh-btn{transition:opacity .13s;cursor:pointer;}
        .sh-card{transition:border-color .15s;}
        .sh-card:hover{filter:brightness(1.04);}
      `}</style>

      {/* ── HEADER ── */}
      <header style={{background:C.surf, borderBottom:"2px solid " + C.acc,
                       padding:"0 20px", height:56, display:"flex", alignItems:"center", gap:12, flexShrink:0}}>
        <button className="sh-btn" onClick={onBack}
          style={{background:"transparent", border:"1px solid " + C.bdr, borderRadius:8,
                  padding:"5px 13px", color:C.muted, fontSize:12, fontWeight:700, fontFamily:"inherit"}}>
          ← Back
        </button>
        <div style={{width:1, height:26, background:C.bdr}}/>
        <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:900, fontSize:18,
                       color:C.acc, letterSpacing:".07em"}}>
          KAVO<span style={{color:C.text, opacity:.3}}>-SYS</span>
        </span>
        <span style={{fontSize:10, fontWeight:800, color:C.muted, letterSpacing:".12em"}}>
          SYSTEM HEALTH
        </span>
        <div style={{flex:1}}/>

        {overallStatus && (
          <div style={{
            background:STATUS_CFG[overallStatus].bg,
            border:"1px solid " + STATUS_CFG[overallStatus].bdr,
            color:STATUS_CFG[overallStatus].col,
            borderRadius:20, padding:"4px 14px",
            fontSize:11, fontWeight:800, display:"flex", alignItems:"center", gap:6,
          }}>
            {STATUS_CFG[overallStatus].icon}
            {overallStatus===OK?"All Systems OK":overallStatus===WARN?"Warnings Detected":"Issues Detected"}
          </div>
        )}

        {results && (
          <button className="sh-btn" onClick={exportReport}
            style={{background:C.success, color:"#000", border:"none", borderRadius:8,
                    padding:"7px 14px", fontWeight:700, fontSize:12, fontFamily:"inherit"}}>
            ⬇ Export Report
          </button>
        )}

        <div style={{background:"#f0a50018", border:"1px solid #f0a50040", borderRadius:20,
                      padding:"3px 12px", display:"flex", alignItems:"center", gap:6}}>
          <span>👑</span>
          <span style={{fontSize:11, fontWeight:700, color:C.acc}}>{user?.name}</span>
        </div>
      </header>

      <div style={{flex:1, overflowY:"auto", padding:"18px 20px", paddingBottom:80}}>
        <div className="sh-in">

          {/* ── TOP STRIP: version + browser ── */}
          <div style={{display:"flex", gap:10, marginBottom:20, flexWrap:"wrap"}}>
            <InfoPill icon="🏷" label={t("pillVersion")} value="1.0.0 (stable)"/>
            <InfoPill icon="🌐" label={t("pillBrowser")} value={(browser||{}).browser||"Unknown"}/>
            <InfoPill icon="💻" label={t("pillPlatform")} value={(browser||{}).platform||"Unknown"}/>
            {(browser||{}).specs && <InfoPill icon="⚡" label={t("pillHardware")} value={browser.specs}/>}
            <InfoPill icon={(browser||{}).online?"🟢":"🔴"} label={t("pillNetwork")} value={(browser||{}).online?t("pillOnline"):t("pillOffline")}/>
            <InfoPill icon={(browser||{}).isMobile?"📱":"🖥"} label={t("pillDevice")} value={(browser||{}).isMobile?t("pillMobile"):t("pillDesktop")}/>
            {ts && <InfoPill icon="🕐" label={t("pillLastCheck")} value={fmtDate(ts)}/>}
          </div>

          {/* ── RUN BUTTON ── */}
          {!results && !running && (
            <div style={{textAlign:"center", padding:"60px 20px"}}>
              <div style={{fontSize:56, marginBottom:18, opacity:.2}}>🔬</div>
              <div style={{fontSize:16, fontWeight:700, color:"#3a4a60", marginBottom:10}}>
                Ready to run diagnostics
              </div>
              <div style={{fontSize:13, color:C.muted, marginBottom:28}}>
                Checks IndexedDB, localStorage, session, all modules, backup status.
              </div>
              <button className="sh-btn" onClick={runChecks}
                style={{background:C.acc, color:"#000", border:"none", borderRadius:12,
                        padding:"14px 40px", fontWeight:900, fontSize:15, fontFamily:"inherit",
                        display:"inline-flex", alignItems:"center", gap:10}}>
                🔬 Run Health Check
              </button>
            </div>
          )}

          {/* ── RUNNING SPINNER ── */}
          {running && (
            <div style={{textAlign:"center", padding:"60px 20px"}}>
              <div style={{width:44, height:44, border:"3px solid " + C.bdr,
                            borderTopColor:C.acc, borderRadius:"50%",
                            animation:"spin .9s linear infinite", margin:"0 auto 20px"}}/>
              <div style={{fontSize:14, color:C.muted}}>Running checks…</div>
            </div>
          )}

          {/* ── RESULTS GRID ── */}
          {results && !running && (
            <>
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:12, marginBottom:20}}>
                <CheckCard title={t("healthIndexedDB")}     icon="🗄" result={results.idb}   hint={t("hintDBEngine")}/>
                <CheckCard title={t("healthLocalStorage")}  icon="💽" result={results.ls}    hint={t("hintLSCache")}/>
                <CheckCard title={t("healthUserSession")}  icon="🔐" result={results.sess}  hint={t("hintLoginState")}/>
                <CheckCard title={t("healthDBRecords")} icon="📊" result={results.dbRec} hint={t("hintTableCounts")}/>
                <CheckCard title={t("healthStorageUsage")} icon="📦" result={results.dbSz}  hint={t("hintDiskSpace")}>
                  {results.dbSz.used && results.dbSz.quota ? (
                    <div style={{marginTop:8}}>
                      <div style={{height:4, background:C.bdr, borderRadius:4, overflow:"hidden"}}>
                        <div style={{
                          height:"100%", borderRadius:4,
                          background: results.dbSz.used/results.dbSz.quota > .85 ? C.warn : C.success,
                          width: ((results.dbSz.used/results.dbSz.quota)*100).toFixed(1) + "%",
                          transition:"width .4s",
                        }}/>
                      </div>
                    </div>
                  ) : null}
                </CheckCard>
                <CheckCard title={t("healthPOSModule")}     icon="🛒" result={results.pos}   hint={t("hintOrdersMenu")}/>
                <CheckCard title={t("healthKitchenMod")} icon="🍳" result={results.kitch} hint={t("hintKitchenQueue")}/>
                <CheckCard title={t("inventory")}      icon="📦" result={results.inv}   hint={t("inventory")}/>
                <CheckCard title={t("healthBackupSys")}  icon="💾" result={results.bkp}   hint={t("hintLastBackup")}>
                  {results.bkp.lastBackup && (
                    <div style={{marginTop:6, fontSize:10, color:C.muted}}>
                      {elapsed(results.bkp.lastBackup)}
                    </div>
                  )}
                  {(results.bkp.status === WARN) && (
                    <button
                      onClick={() => onBack && onBack("data")}
                      style={{ marginTop:10, background:"#d29922", color:"#000", border:"none",
                               borderRadius:7, padding:"6px 13px", fontWeight:700, fontSize:11,
                               cursor:"pointer", fontFamily:"inherit", display:"flex",
                               alignItems:"center", gap:6 }}>
                      💾 Create Backup Now
                    </button>
                  )}
                </CheckCard>
              </div>

              {/* ── TABLE RECORD BREAKDOWN ── */}
              {results.dbRec?.counts && (
                <section style={{marginBottom:20}}>
                  <SectionTitle icon="📋" label={t("recordCountsTitle")}/>
                  <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:7}}>
                    {Object.entries(results.dbRec.counts||{}).map(function([table, count]) {
                      var safeCount = Number(count ?? 0);
                      return (
                        <div key={table} style={{background:C.card, border:"1px solid " + C.bdr,
                                                  borderRadius:9, padding:"9px 12px"}}>
                          <div style={{fontSize:9, color:C.muted, fontWeight:700, letterSpacing:".06em", marginBottom:3}}>
                            {table.toUpperCase()}
                          </div>
                          <div style={{fontFamily:"'JetBrains Mono',monospace", fontWeight:900,
                                        fontSize:18, color:safeCount>0?C.acc:C.muted}}>
                            {safeCount.toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── IDB TABLE LIST ── */}
              {Array.isArray(results.idb?.tables) && results.idb.tables.length > 0 && (
                <section style={{marginBottom:20}}>
                  <SectionTitle icon="🗃" label={t("idbTablesTitle")}/>
                  <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                    {(results.idb.tables||[]).map(function(t) {
                      return (
                        <span key={t} style={{background:C.success+"18", border:"1px solid " + C.success+"30",
                                               color:C.success, borderRadius:7,
                                               padding:"3px 10px", fontSize:11, fontWeight:700}}>
                          ✓ {t}
                        </span>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── RUN AGAIN ── */}
              <div style={{display:"flex", gap:10, justifyContent:"center", paddingTop:8}}>
                <button className="sh-btn" onClick={runChecks}
                  style={{background:C.acc, color:"#000", border:"none", borderRadius:10,
                          padding:"10px 28px", fontWeight:800, fontSize:13, fontFamily:"inherit",
                          display:"flex", alignItems:"center", gap:8}}>
                  🔄 Run Again
                </button>
                <button className="sh-btn" onClick={exportReport}
                  style={{background:"transparent", border:"1px solid " + C.bdr, borderRadius:10,
                          padding:"10px 22px", color:C.muted, fontWeight:700, fontSize:13,
                          fontFamily:"inherit", display:"flex", alignItems:"center", gap:8}}>
                  ⬇ Export Report
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────*/
function CheckCard({ title, icon, result, hint, children }) {
  var cfg = STATUS_CFG[result.status] || STATUS_CFG.skip;
  return (
    <div className="sh-card" style={{
      background: cfg.bg,
      border: "1px solid " + cfg.bdr,
      borderLeft: "4px solid " + cfg.col,
      borderRadius: 12,
      padding: "14px 16px",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6}}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <span style={{fontSize:20}}>{icon}</span>
          <div>
            <div style={{fontWeight:800, color:C.text, fontSize:13}}>{title}</div>
            {hint && <div style={{fontSize:10, color:C.muted}}>{hint}</div>}
          </div>
        </div>
        <span style={{
          background:cfg.col+"25", border:"1px solid " + cfg.col+"50",
          color:cfg.col, borderRadius:20, padding:"2px 9px",
          fontSize:9, fontWeight:800, letterSpacing:".06em", flexShrink:0,
        }}>
          {cfg.icon} {cfg.label}
        </span>
      </div>
      <div style={{fontSize:12, color:result.status===ERR?cfg.col:C.sub, lineHeight:1.6}}>
        {result.detail}
      </div>
      {children}
    </div>
  );
}

function InfoPill({ icon, label, value }) {
  return (
    <div style={{background:C.card, border:"1px solid " + C.bdr, borderRadius:9,
                  padding:"7px 13px", display:"flex", alignItems:"center", gap:8}}>
      <span style={{fontSize:14}}>{icon}</span>
      <div>
        <div style={{fontSize:9, color:C.muted, fontWeight:700, letterSpacing:".06em"}}>{label.toUpperCase()}</div>
        <div style={{fontSize:12, fontWeight:700, color:C.text}}>{value}</div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, label }) {
  return (
    <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:10}}>
      <span style={{fontSize:13}}>{icon}</span>
      <span style={{fontSize:10, fontWeight:800, color:C.acc, letterSpacing:".09em"}}>{label.toUpperCase()}</span>
      <div style={{flex:1, height:1, background:C.bdr}}/>
    </div>
  );
}
