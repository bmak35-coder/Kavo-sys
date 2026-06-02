import { useState, useEffect, useRef, useCallback } from "react";
import { useLang } from "../i18n/LanguageContext.jsx";
import { useAuth } from "../auth/AuthProvider";
import { BackupService } from "../db/services/backup.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Data Manager  ·  v1.0
   Admin-only: Backup, Export, Restore, Reset
   Offline-first · IndexedDB
══════════════════════════════════════════════════════ */

const C = {
  bg:"#070c16", surf:"#0b1220", card:"#101828", bdr:"#1a2438",
  acc:"#f0a500", text:"#e8edf5", muted:"#4a6080", sub:"#7d8fa0",
  success:"#3fb950", danger:"#f85149", info:"#58a6ff", warn:"#d29922",
};
const safeNum = (v) => { const n = +v; return isFinite(n) ? n : 0; };

const Btn  = (bg, col="#000", sm=false) => ({ background:bg, color:col, border:"none", borderRadius:8, padding:sm?"6px 14px":"10px 18px", cursor:"pointer", fontWeight:700, fontSize:sm?11:13, fontFamily:"inherit", transition:"opacity 0.14s", whiteSpace:"nowrap", letterSpacing:"0.02em" });
const Ghost= (col=C.muted, sm=false)   => ({ background:"transparent", color:col, border:`1px solid ${C.bdr}`, borderRadius:8, padding:sm?"5px 12px":"9px 16px", cursor:"pointer", fontWeight:600, fontSize:sm?11:12, fontFamily:"inherit", whiteSpace:"nowrap" });

const fmtDate = (iso) => {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString("en-US", { month:"short", day:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
  } catch { return iso; }
};

// EXPORTS defined inside component (needs t() hook)

// ══════════════════════════════════════════════════════
//   MAIN COMPONENT
// ══════════════════════════════════════════════════════
export default function DataManager({ onBack }) {
  const { user } = useAuth();

  const { t } = useLang();

  // ── Export definitions (inside component for i18n) ──────────────────
  const EXPORTS = [
    {
      id: "latest", icon: "⬇", format: "JSON",
      title: "kavo-sys-backup-latest.json",
      desc:  "Complete backup always saved as kavo-sys-backup-latest.json — ideal for Google Drive and recurring backups.",
      accent: "#3fb950",
      action: () => BackupService.downloadLatest(),
      primary: true,
      highlight: true,
    },
    {
      id: "json", icon: "🗄", format: "JSON",
      title: t("fullBackupTitle"),
      desc:  t("fullBackupDesc"),
      accent: C.acc,
      action: () => BackupService.downloadBackup(),
      primary: true,
    },
    {
      id: "orders", icon: "🧾", format: "CSV", statKey: "orders",
      title: t("ordersExportTitle"),
      desc:  t("ordersExportDesc"),
      accent: C.success,
      action: () => BackupService.exportOrdersCSV(),
    },
    {
      id: "inventory", icon: "📦", format: "CSV", statKey: "inventory",
      title: t("inventoryExportTitle"),
      desc:  t("inventoryExportDesc"),
      accent: "#fb923c",
      action: () => BackupService.exportInventoryCSV(),
    },
    {
      id: "shifts", icon: "🕐", format: "CSV", statKey: "shifts",
      title: t("shiftsExportTitle"),
      desc:  t("shiftsExportDesc"),
      accent: C.info,
      action: () => BackupService.exportShiftsCSV(),
    },
    {
      id: "customers", icon: "👤", format: "CSV", statKey: "customers",
      title: t("customersExportTitle"),
      desc:  t("customersExportDesc"),
      accent: "#a78bfa",
      action: () => BackupService.exportCustomersCSV(),
    },
    {
      id: "po", icon: "📋", format: "CSV", statKey: "purchaseOrders",
      title: t("poExportTitle"),
      desc:  t("poExportDesc"),
      accent: "#34d399",
      action: () => BackupService.exportPurchaseOrdersCSV(),
    },
    {
      id: "menu", icon: "🍽", format: "CSV", statKey: "menu",
      title: t("menuExportTitle"),
      desc:  t("menuExportDesc"),
      accent: "#f472b6",
      action: () => BackupService.exportMenuCSV(),
    },
  ];


  const [stats,          setStats]          = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [busy,           setBusy]           = useState(null);     // export id currently running
  const [toast,          setToast]          = useState(null);
  const [restoreModal,   setRestoreModal]   = useState(false);
  const [resetModal,     setResetModal]     = useState(null);     // "soft"|"hard"
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [restoreResult,  setRestoreResult]  = useState(null);
  const [dragOver,       setDragOver]       = useState(false);
  const fileRef = useRef();

  const showToast = (msg, type="ok") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3200);
  };

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const s = await BackupService.getStats();
      setStats(s);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ── Run an export ──────────────────────────────────
  const runExport = async (exp) => {
    setBusy(exp.id);
    try {
      await exp.action();
      if (exp.id === "json") {
        await loadStats();
        
        showToast(t("backupDownloaded"));
      } else {
        
        showToast(`${exp.title} ${t("exportedCSV")}`);
      }
    } catch(e) {
      showToast(`${t("exportFailed")}: ${e.message || "unknown error"}`, "err");
    }
    setBusy(null);
  };

  // ── Restore from file ─────────────────────────────
  const handleFileSelect = (file) => {
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      showToast(t("selectJsonFile"), "err"); return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data || !data._meta) {
          showToast(t("invalidBackup"), "err"); return;
        }
        setBusy("restore");
        const results = await BackupService.restoreFromJSON(data);
        
        setRestoreResult({ meta: data._meta, results });
        setRestoreModal(false);
        await loadStats();
        showToast(t("restoreSuccess"));
      } catch(e) {
        showToast(`${t("restoreFailed")}: ${e.message || "parse error"}`, "err");
      } finally {
        setBusy(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  // ── Reset ──────────────────────────────────────────
  const doReset = async () => {
    if (resetConfirmText !== "RESET") return;
    setBusy("reset");
    try {
      if (resetModal === "hard") {
        await BackupService.fullReset();
        showToast(t("fullResetComplete"), "warn");
        setTimeout(() => window.location.reload(), 2000);
      } else {
        await BackupService.clearAll();
        await loadStats();
        showToast(t("txDataCleared"), "warn");
      }
    } catch(e) {
      showToast(`${t("resetFailed")}: ${e.message}`, "err");
    }
    setResetModal(null);
    setResetConfirmText("");
    setBusy(null);
  };

  return (
    <div style={{ height:"100vh", background:C.bg, color:C.text, fontFamily:"system-ui,-apple-system,sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:${C.bg}; } ::-webkit-scrollbar-thumb { background:${C.bdr}; border-radius:4px; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.45} }
        .dm-in  { animation:fadeUp 0.28s ease; }
        .dm-btn:hover { opacity:0.82; }
        .dm-btn { transition:opacity 0.14s; }
        .dm-card:hover { border-color:${C.acc}50!important; }
        .dm-card { transition:border-color 0.15s; }
        .dm-drop { transition:background 0.15s, border-color 0.15s; }
        input:focus { border-color:${C.acc}!important; outline:none; }
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{ background:C.surf, borderBottom:`2px solid ${C.acc}`, padding:"0 20px", height:56, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <button className="dm-btn" onClick={onBack} style={Ghost(C.muted, true)}>← Back</button>
        <div style={{ width:1, height:26, background:C.bdr }}/>
        <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:900, fontSize:18, color:C.acc, letterSpacing:"0.07em" }}>
          KAVO<span style={{color:C.text,opacity:0.3}}>-SYS</span>
        </span>
        <span style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:"0.12em" }}>DATA MANAGER</span>

        <div style={{ flex:1 }}/>

        {/* Last backup */}
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:10, color:C.muted, letterSpacing:"0.06em" }}>LAST BACKUP</div>
          <div style={{ fontSize:12, fontWeight:700, color:stats?.lastBackup ? C.success : C.danger }}>
            {stats ? fmtDate(stats.lastBackup) : "…"}
          </div>
        </div>

        {/* User */}
        <div style={{ background:"#f0a50018", border:"1px solid #f0a50040", borderRadius:20, padding:"3px 12px", display:"flex", alignItems:"center", gap:6 }}>
          <span style={{fontSize:12}}>👑</span>
          <span style={{ fontSize:11, fontWeight:700, color:C.acc }}>{user?.name}</span>
        </div>
      </header>

      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", padding:"18px 20px", paddingBottom:80 }}>
        <div className="dm-in">

          {/* ── DATABASE OVERVIEW ── */}
          <section style={{ marginBottom:28 }}>
            <SectionTitle icon="📊" label="Database Overview"/>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:8 }}>
              {loading ? (
                Array.from({length:10}).map((_,i) => (
                  <div key={i} style={{ background:C.card, border:`1px solid ${C.bdr}`, borderRadius:10, padding:"12px 14px", animation:"pulse 1.2s ease infinite" }}>
                    <div style={{ height:20, background:C.bdr, borderRadius:4, marginBottom:6, width:"60%" }}/>
                    <div style={{ height:12, background:C.bdr, borderRadius:4, width:"80%" }}/>
                  </div>
                ))
              ) : [
                { label:t("orders"),         val:stats?.orders,         icon:"🧾", col:C.success },
                { label:"Receipts",       val:stats?.receipts,       icon:"🖨", col:C.success },
                { label:t("shifts"),         val:stats?.shifts,         icon:"🕐", col:C.info    },
                { label:t("menuItems"),     val:stats?.menu,           icon:"🍽", col:C.acc     },
                { label:t("inventory"),      val:stats?.inventory,      icon:"📦", col:"#fb923c" },
                { label:"Suppliers",      val:stats?.suppliers,      icon:"🏢", col:"#34d399" },
                { label:t("purchaseOrders"),val:stats?.purchaseOrders, icon:"📋", col:"#34d399" },
                { label:t("customers"),      val:stats?.customers,      icon:"👥", col:"#a78bfa" },
                { label:"Kitchen Orders", val:stats?.kitchen,        icon:"🍳", col:C.warn    },
                { label:"Stock Logs",     val:stats?.stockLogs,      icon:"📝", col:C.muted   },
              ].map(s => (
                <div key={s.label} style={{ background:C.card, border:`1px solid ${C.bdr}`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                    <span style={{ fontSize:14 }}>{s.icon}</span>
                    <span style={{ fontSize:10, color:C.muted, letterSpacing:"0.04em" }}>{s.label}</span>
                  </div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:22, color:s.col }}>
                    {s.val?.toLocaleString() ?? "—"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── EXPORT / BACKUP ── */}
          <section style={{ marginBottom:28 }}>
            <SectionTitle icon="💾" label="Export & Backup"/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {EXPORTS.map(exp => {
                const isBusy = busy === exp.id;
                const count  = exp.statKey ? stats?.[exp.statKey] : null;
                return (
                  <div key={exp.id} className="dm-card"
                    style={{
                      background:   exp.primary ? `linear-gradient(135deg, ${exp.accent}12, ${C.card})` : C.card,
                      border:       `1px solid ${exp.primary ? exp.accent+"40" : C.bdr}`,
                      borderLeft:   `4px solid ${exp.accent}`,
                      borderRadius: 12, padding:"14px 16px",
                      display:      "flex", alignItems:"center", gap:14,
                    }}>
                    {/* Icon */}
                    <div style={{ fontSize:28, flexShrink:0 }}>{exp.icon}</div>

                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
                        <span style={{ fontWeight:800, color:C.text, fontSize:13 }}>{exp.title}</span>
                        <span style={{ background:exp.accent+"20", color:exp.accent, borderRadius:5, padding:"1px 7px", fontSize:9, fontWeight:800, letterSpacing:"0.06em" }}>{exp.format}</span>
                        {count !== null && count !== undefined && (
                          <span style={{ color:C.muted, fontSize:10 }}>{Number(count||0).toLocaleString()} records</span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>{exp.desc}</div>
                    </div>

                    {/* Action */}
                    <button
                      className="dm-btn"
                      onClick={() => runExport(exp)}
                      disabled={!!busy}
                      style={{
                        ...Btn(exp.accent, "#000"),
                        flexShrink:0, minWidth:80,
                        opacity: busy ? 0.5 : 1,
                        display:"flex", alignItems:"center", gap:6,
                      }}
                    >
                      {isBusy
                        ? <><Spinner size={13}/> Exporting…</>
                        : exp.primary ? "⬇ Backup" : "⬇ CSV"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── RESTORE ── */}
          <section style={{ marginBottom:28 }}>
            <SectionTitle icon="📥" label="Restore from Backup"/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>

              {/* Drop zone */}
              <div
                className="dm-drop"
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileSelect(file);
                }}
                onClick={() => fileRef.current?.click()}
                style={{
                  background:   dragOver ? `${C.acc}12` : C.card,
                  border:       `2px dashed ${dragOver ? C.acc : C.bdr}`,
                  borderRadius: 12, padding:"28px 20px",
                  textAlign:    "center", cursor:"pointer",
                }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📂</div>
                <div style={{ fontWeight:700, color:C.text, marginBottom:5, fontSize:14 }}>
                  Drop backup file here
                </div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
                  or click to browse · accepts .json files only
                </div>
                <button className="dm-btn" onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                  style={Btn(C.info, "#000")}>
                  Browse File
                </button>
                <input ref={fileRef} type="file" accept=".json" style={{ display:"none" }}
                  onChange={e => { handleFileSelect(e.target.files[0]); e.target.value=""; }}/>
              </div>

              {/* Restore info */}
              <div style={{ background:C.card, border:`1px solid ${C.bdr}`, borderRadius:12, padding:"16px 18px" }}>
                <div style={{ fontWeight:800, color:C.text, marginBottom:12, fontSize:14 }}>What gets restored</div>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {[
                    ["✅","Orders & receipts"],
                    ["✅","Menu items & categories"],
                    ["✅","Inventory & stock logs"],
                    ["✅","Suppliers & purchase orders"],
                    ["✅","Shift history"],
                    ["✅","Kitchen orders"],
                    ["✅","Customers"],
                    ["✅","Modifier groups"],
                    ["✅","App & receipt settings"],
                    ["⚠️","Existing data is merged — not replaced"],
                  ].map(([icon, text]) => (
                    <div key={text} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                      <span style={{ fontSize:13 }}>{icon}</span>
                      <span style={{ color:icon==="⚠️" ? C.warn : C.sub }}>{text}</span>
                    </div>
                  ))}
                </div>

                {busy === "restore" && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:14, padding:"8px 12px", background:C.info+"18", borderRadius:8, fontSize:12, color:C.info }}>
                    <Spinner size={14}/> Restoring data…
                  </div>
                )}
              </div>
            </div>

            {/* Restore result */}
            {restoreResult && (
              <div style={{ marginTop:12, background:"#0a1a10", border:`1px solid ${C.success}40`, borderRadius:12, padding:16 }}>
                <div style={{ fontWeight:700, color:C.success, marginBottom:10, display:"flex", alignItems:"center", gap:7 }}>
                  ✅ Restore Complete — {fmtDate(restoreResult.meta?.exportedAt)}
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {Object.entries(restoreResult.results).map(([k, v]) => (
                    <span key={k} style={{ background:C.success+"15", border:`1px solid ${C.success}30`, color:C.success, borderRadius:7, padding:"3px 10px", fontSize:11, fontWeight:700 }}>
                      {k}: {v}
                    </span>
                  ))}
                </div>
                <button onClick={() => setRestoreResult(null)} style={{ ...Ghost(C.muted, true), marginTop:10 }}>Dismiss</button>
              </div>
            )}
          </section>

          {/* ── RESET ── */}
          <section>
            <SectionTitle icon="⚠" label="System Reset" danger/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>

              {/* Soft reset */}
              <div style={{ background:"#120a0a", border:`1px solid ${C.danger}30`, borderRadius:12, padding:"16px 18px" }}>
                <div style={{ fontWeight:800, color:C.text, marginBottom:5, fontSize:14 }}>
                  🗑 Clear Transaction Data
                </div>
                <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, marginBottom:14 }}>
                  Removes all orders, receipts, shifts, kitchen orders, inventory stock, and customer records. <strong style={{color:C.warn}}>Keeps menu, settings, and modifier groups.</strong>
                </div>
                <button className="dm-btn" onClick={() => { setResetModal("soft"); setResetConfirmText(""); }} style={Btn(C.danger, "#fff")}>
                  Clear Transaction Data
                </button>
              </div>

              {/* Hard reset */}
              <div style={{ background:"#120a0a", border:`1px solid ${C.danger}50`, borderRadius:12, padding:"16px 18px" }}>
                <div style={{ fontWeight:800, color:C.danger, marginBottom:5, fontSize:14 }}>
                  💥 Full System Reset
                </div>
                <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, marginBottom:14 }}>
                  Wipes <strong style={{color:C.danger}}>everything</strong> — all data, menu, settings, modifiers, and localStorage. Page reloads after reset. Use only to start fresh.
                </div>
                <button className="dm-btn" onClick={() => { setResetModal("hard"); setResetConfirmText(""); }} style={{...Btn(C.danger, "#fff"), border:`1px solid ${C.danger}60`}}>
                  Full System Reset
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ═══ RESET CONFIRM MODAL ═══ */}
      {resetModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9000, padding:16 }}>
          <div style={{ background:"#0d0b0b", border:`2px solid ${C.danger}50`, borderRadius:16, padding:"28px 24px", width:400, maxWidth:"96vw", boxShadow:"0 24px 64px rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize:40, marginBottom:14, textAlign:"center" }}>
              {resetModal === "hard" ? "💥" : "🗑"}
            </div>
            <div style={{ fontWeight:900, color:C.danger, fontSize:17, textAlign:"center", marginBottom:8 }}>
              {resetModal === "hard" ? "Full System Reset" : "Clear Transaction Data"}
            </div>
            <div style={{ fontSize:13, color:C.sub, textAlign:"center", lineHeight:1.7, marginBottom:18 }}>
              {resetModal === "hard"
                ? "This will permanently delete ALL data including menu, settings, and modifiers. This cannot be undone."
                : "This will permanently delete all orders, shifts, receipts, inventory stock, and customers. Menu and settings are kept."}
            </div>

            {/* Warning checklist */}
            <div style={{ background:"#1a0a0a", borderRadius:9, padding:"10px 14px", marginBottom:18 }}>
              {(resetModal === "hard" ? [
                "All orders and receipts deleted",
                "Menu items deleted",
                "All settings reset",
                "Inventory and stock logs deleted",
                "All shift history deleted",
                "Page reloads after reset",
              ] : [
                "All orders and receipts deleted",
                "All shift history deleted",
                "Inventory stock cleared",
                "Kitchen queue cleared",
                "Menu and settings are KEPT",
              ]).map(w => (
                <div key={w} style={{ fontSize:12, color:C.danger, padding:"3px 0", display:"flex", alignItems:"center", gap:7 }}>
                  <span>⚠</span> {w}
                </div>
              ))}
            </div>

            {/* Confirmation input */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:C.muted, marginBottom:6, fontWeight:700, letterSpacing:"0.06em" }}>
                TYPE <span style={{color:C.danger,fontFamily:"monospace",letterSpacing:"0.1em"}}>RESET</span> TO CONFIRM
              </div>
              <input
                value={resetConfirmText}
                onChange={e => setResetConfirmText(e.target.value.toUpperCase())}
                placeholder="RESET"
                style={{ width:"100%", background:"#0a0505", border:`1px solid ${resetConfirmText==="RESET"?C.danger:C.bdr}`, borderRadius:8, padding:"10px 14px", color:C.text, fontSize:15, fontFamily:"'JetBrains Mono',monospace", fontWeight:700, outline:"none", letterSpacing:"0.15em", boxSizing:"border-box", textAlign:"center" }}
              />
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button className="dm-btn"
                onClick={doReset}
                disabled={resetConfirmText !== "RESET" || !!busy}
                style={{ flex:2, ...Btn(resetConfirmText==="RESET"?C.danger:"#2a1a1a", resetConfirmText==="RESET"?"#fff":"#4a3030"), opacity:resetConfirmText!=="RESET"||busy?0.5:1 }}>
                {busy==="reset" ? <><Spinner size={14}/> Resetting…</> : `Confirm ${resetModal==="hard"?"Full ":""}Reset`}
              </button>
              <button className="dm-btn" onClick={() => { setResetModal(null); setResetConfirmText(""); }} style={{...Ghost(), flex:1}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div style={{
          position:"fixed", bottom:22, left:"50%", transform:"translateX(-50%)",
          background: toast.type==="err"?C.danger:toast.type==="warn"?C.warn:C.success,
          color:"#000", fontWeight:700, fontSize:13, padding:"10px 22px",
          borderRadius:24, zIndex:9999, boxShadow:"0 6px 24px rgba(0,0,0,0.5)",
          whiteSpace:"nowrap", pointerEvents:"none", maxWidth:"80vw",
          overflow:"hidden", textOverflow:"ellipsis",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ── SHARED COMPONENTS ───────────────────────────────*/
function SectionTitle({ icon, label, danger }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
      <span style={{ fontSize:14 }}>{icon}</span>
      <span style={{ fontSize:11, fontWeight:800, color:danger?C.danger:C.acc, letterSpacing:"0.1em" }}>{label.toUpperCase()}</span>
      <div style={{ flex:1, height:1, background:C.bdr }}/>
    </div>
  );
}

function Spinner({ size = 16 }) {
  return (
    <span style={{ display:"inline-block", width:size, height:size, border:`2px solid rgba(0,0,0,0.2)`, borderTopColor:"currentColor", borderRadius:"50%", animation:"spin 0.7s linear infinite", flexShrink:0 }}/>
  );
}

// Re-export C for the danger color reference used inline
const { danger: _d } = C;
