import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ActivityLogService, LOG_CATEGORIES, LOG_ACTION } from "../db/services/activityLog.js";
import { useFirebaseServices } from "../firebase/FirebaseServicesProvider.jsx";
import { useTenant } from "../contexts/TenantProvider.jsx";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Activity Logs & Audit Trail  ·  v1.0
   Admin-only · Firebase + IndexedDB (offline-first)
══════════════════════════════════════════════════════ */

const C = {
  bg:"#070c16", surf:"#0b1220", card:"#101828", card2:"#0d1525",
  bdr:"#1a2438", acc:"#f0a500", text:"#e8edf5", muted:"#4a6080",
  sub:"#7d8fa0", success:"#3fb950", danger:"#f85149",
  info:"#58a6ff", warn:"#d29922",
};
const safeArr = (v, d=[]) => Array.isArray(v) ? v : d;

const Btn  = (bg, col="#000", sm=false) => ({ background:bg, color:col, border:"none", borderRadius:8, padding:sm?"5px 12px":"9px 16px", cursor:"pointer", fontWeight:700, fontSize:sm?11:12, fontFamily:"inherit", transition:"opacity 0.14s", whiteSpace:"nowrap" });
const Ghost= (col=C.muted, sm=false)   => ({ background:"transparent", color:col, border:`1px solid ${C.bdr}`, borderRadius:8, padding:sm?"5px 11px":"8px 14px", cursor:"pointer", fontWeight:600, fontSize:sm?11:12, fontFamily:"inherit", whiteSpace:"nowrap" });

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); } catch { return "—"; }};
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); } catch { return "—"; }};
const fmtDT   = (iso) => { try { return new Date(iso).toLocaleString("en-US",{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}); } catch { return "—"; }};

// All action types flattened for filter dropdown
const ALL_ACTIONS = Object.entries(LOG_ACTION).map(([k,v]) => ({
  key: v, label: k.split("_").map(w=>w[0]+w.slice(1).toLowerCase()).join(" "),
  category: v.split(".")[0],
}));

// ══════════════════════════════════════════════════════
//   MAIN COMPONENT
// ══════════════════════════════════════════════════════
export default function ActivityLogs({ onBack }) {
  const { user } = useAuth();

  // Firebase integration
  const firebaseServices = useFirebaseServices();
  const { tenantId } = useTenant();
  const useFirebase = !!tenantId && !!firebaseServices;

  const [logs,          setLogs]          = useState([]);
  const [users,         setUsers]         = useState([]);
  const [totalCount,    setTotalCount]    = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [filterCat,     setFilterCat]     = useState("all");
  const [filterAction,  setFilterAction]  = useState("all");
  const [filterUser,    setFilterUser]    = useState("all");
  const [filterDate,    setFilterDate]    = useState("");
  const [expanded,      setExpanded]      = useState(null);
  const [showClear,     setShowClear]     = useState(false);
  const [clearText,     setClearText]     = useState("");
  const [clearing,      setClearing]      = useState(false);
  const [toast,         setToast]         = useState(null);
  const fileRef = useRef();

  const showToast = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),2800); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let allLogs, count;
      if (useFirebase) {
        [allLogs, count] = await Promise.all([
          firebaseServices.auditLogs.getAll(1000),
          firebaseServices.auditLogs.getCount(),
        ]);
      } else {
        [allLogs, count] = await Promise.all([
          ActivityLogService.getAll(1000),
          ActivityLogService.getCount(),
        ]);
      }
      setLogs(safeArr(allLogs));
      setTotalCount(count);

      // Extract unique users from logs for filter
      const userMap = {};
      safeArr(allLogs).forEach(l => { if(l.userId && l.userName) userMap[l.userId]=l.userName; });
      setUsers(Object.entries(userMap).map(([id,name])=>({id,name})));
    } catch(e){ console.error(e); }
    setLoading(false);
  }, [useFirebase, firebaseServices]);

  useEffect(() => { load(); }, [load]);

  // ── Client-side filtering ─────────────────────────
  const visible = useMemo(() => {
    let list = logs;
    if (filterCat !== "all")    list = list.filter(l => l.category  === filterCat);
    if (filterAction !== "all") list = list.filter(l => l.action    === filterAction);
    if (filterUser !== "all")   list = list.filter(l => l.userId    === filterUser);
    if (filterDate)             list = list.filter(l => l.createdAt?.startsWith(filterDate));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.description?.toLowerCase().includes(q) ||
        l.userName?.toLowerCase().includes(q)    ||
        l.orderId?.toLowerCase().includes(q)     ||
        l.action?.toLowerCase().includes(q)      ||
        l.newValue?.toLowerCase().includes(q)    ||
        l.oldValue?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [logs, filterCat, filterAction, filterUser, filterDate, search]);

  // ── Stats ─────────────────────────────────────────
  const catCounts = useMemo(() => {
    const m = {};
    logs.forEach(l => { m[l.category] = (m[l.category]||0)+1; });
    return m;
  }, [logs]);

  // ── Export ────────────────────────────────────────
  const exportCSV = () => {
    const csv = useFirebase ? firebaseServices.auditLogs.toCSV(visible) : ActivityLogService.toCSV(visible);
    const blob = new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `KAVO_audit_logs_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast(`Exported ${visible.length} log entries`);
  };

  // ── Clear all ─────────────────────────────────────
  const doClear = async () => {
    if (clearText !== "CLEAR") return;
    setClearing(true);
    if (useFirebase) { await firebaseServices.auditLogs.clearAll(); } else { await ActivityLogService.clearAll(); }
    setLogs([]); setTotalCount(0); setUsers([]);
    setShowClear(false); setClearText(""); setClearing(false);
    showToast("All logs cleared", "warn");
  };

  const resetFilters = () => {
    setSearch(""); setFilterCat("all"); setFilterAction("all");
    setFilterUser("all"); setFilterDate("");
  };

  const activeFilters = [filterCat,filterAction,filterUser,filterDate].filter(v=>v!=="all"&&v!=="").length + (search?1:0);

  return (
    <div style={{ height:"100vh", background:C.bg, color:C.text, fontFamily:"system-ui,-apple-system,sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; }
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.bdr};border-radius:4px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}
        .al-in  { animation:fadeUp 0.25s ease; }
        .al-btn:hover { opacity:0.82; } .al-btn { transition:opacity 0.14s; }
        .al-row { transition:background 0.1s; }
        .al-row:hover { background:#0d1828!important; cursor:pointer; }
        .al-cat:hover { opacity:0.8; }
        input:focus,select:focus { border-color:${C.acc}!important; outline:none; }
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{ background:C.surf, borderBottom:`2px solid ${C.acc}`, padding:"0 20px", height:56, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <button className="al-btn" onClick={onBack} style={Ghost(C.muted,true)}>← Back</button>
        <div style={{ width:1, height:26, background:C.bdr }}/>
        <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:900, fontSize:18, color:C.acc, letterSpacing:"0.07em" }}>
          KAVO<span style={{color:C.text,opacity:0.3}}>-SYS</span>
        </span>
        <span style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:"0.12em" }}>ACTIVITY LOGS</span>
        <div style={{ flex:1 }}/>

        <div style={{ display:"flex", gap:7, alignItems:"center" }}>
          <span style={{ fontSize:11, color:C.muted }}>{visible.length.toLocaleString()} of {totalCount.toLocaleString()} entries</span>
          {activeFilters > 0 && (
            <button className="al-btn" onClick={resetFilters} style={{ ...Ghost(C.warn,true) }}>✕ {activeFilters} filter{activeFilters>1?"s":""}</button>
          )}
          <button className="al-btn" onClick={exportCSV} disabled={!visible.length} style={{ ...Btn(C.success,"#000"), opacity:visible.length?1:0.4 }}>⬇ Export CSV</button>
          <button className="al-btn" onClick={() => { setShowClear(true); setClearText(""); }} style={Btn(C.danger,"#fff")}>🗑 Clear Logs</button>
        </div>

        <div style={{ background:"#f0a50018", border:"1px solid #f0a50040", borderRadius:20, padding:"3px 12px", display:"flex", alignItems:"center", gap:6 }}>
          <span>👑</span>
          <span style={{ fontSize:11, fontWeight:700, color:C.acc }}>{user?.name}</span>
        </div>
      </header>

      <div style={{ flex:1, overflowY:"auto", padding:"14px 20px" , paddingBottom:80}}>
        <div className="al-in">

          {/* ── Category summary pills ── */}
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            <button className="al-cat al-btn"
              onClick={() => setFilterCat("all")}
              style={{ background:filterCat==="all"?C.acc+"22":"transparent", border:`1px solid ${filterCat==="all"?C.acc+"60":C.bdr}`, color:filterCat==="all"?C.acc:C.muted, borderRadius:20, padding:"5px 14px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit", transition:"all 0.14s" }}>
              All · {logs.length.toLocaleString()}
            </button>
            {Object.entries(LOG_CATEGORIES).map(([k, cfg]) => {
              const count = catCounts[k] || 0;
              if (!count && filterCat !== k) return null;
              return (
                <button key={k} className="al-cat al-btn"
                  onClick={() => setFilterCat(filterCat===k?"all":k)}
                  style={{ background:filterCat===k?cfg.color+"22":"transparent", border:`1px solid ${filterCat===k?cfg.color+"60":C.bdr}`, color:filterCat===k?cfg.color:C.muted, borderRadius:20, padding:"5px 12px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit", display:"flex", alignItems:"center", gap:5, transition:"all 0.14s" }}>
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                  <span style={{ background:cfg.color+"28", color:cfg.color, borderRadius:8, padding:"0 5px", fontSize:10, fontWeight:900 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* ── Filter bar ── */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 160px 160px 160px 140px", gap:8, marginBottom:14 }}>
            <div style={{ position:"relative" }}>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="🔍  Search descriptions, users, order IDs…"
                style={{ width:"100%", background:C.card, border:`1px solid ${search?C.acc:C.bdr}`, borderRadius:8, padding:"8px 36px 8px 12px", color:C.text, fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}/>
              {search && <button onClick={()=>setSearch("")} style={{ position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:15 }}>✕</button>}
            </div>
            <FSelect value={filterAction} onChange={setFilterAction}>
              <option value="all">All Actions</option>
              {Object.entries(LOG_CATEGORIES).map(([k,cfg])=>(
                <optgroup key={k} label={`${cfg.icon} ${cfg.label}`}>
                  {ALL_ACTIONS.filter(a=>a.category===k).map(a=><option key={a.key} value={a.key}>{a.label}</option>)}
                </optgroup>
              ))}
            </FSelect>
            <FSelect value={filterUser} onChange={setFilterUser}>
              <option value="all">All Users</option>
              {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </FSelect>
            <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}
              style={{ background:C.card, border:`1px solid ${filterDate?C.acc:C.bdr}`, borderRadius:8, padding:"8px 10px", color:C.text, fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}/>
            <button className="al-btn" onClick={load} style={Ghost(C.muted,true)}>🔄 Refresh</button>
          </div>

          {/* ── Log table ── */}
          {loading ? (
            <div style={{ display:"flex", justifyContent:"center", padding:60, flexDirection:"column", alignItems:"center", gap:12 }}>
              <div style={{ width:28, height:28, border:`2px solid ${C.bdr}`, borderTopColor:C.acc, borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
              <div style={{ fontSize:12, color:C.muted }}>Loading logs…</div>
            </div>
          ) : visible.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:C.muted }}>
              <div style={{ fontSize:48, marginBottom:12, opacity:0.2 }}>📋</div>
              <div style={{ fontSize:14, fontWeight:700, color:"#3a4a60", marginBottom:6 }}>
                {logs.length === 0 ? "No activity logged yet" : "No logs match this filter"}
              </div>
              <div style={{ fontSize:12 }}>
                {logs.length === 0 ? "Activity will appear here as users work in the POS." : "Try adjusting your search or filters."}
              </div>
            </div>
          ) : (
            <div style={{ background:C.card, border:`1px solid ${C.bdr}`, borderRadius:12, overflow:"hidden" }}>
              {/* Table header */}
              <div style={{ display:"grid", gridTemplateColumns:"50px 160px 120px 100px 160px 1fr 90px", padding:"8px 14px", background:"#0a1020", borderBottom:`1px solid ${C.bdr}` }}>
                {["ID","Date & Time","User","Role","Action","Description","Order"].map(h=>(
                  <span key={h} style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:"0.08em" }}>{h}</span>
                ))}
              </div>

              {/* Rows */}
              {visible.map((log, i) => {
                const cat    = LOG_CATEGORIES[log.category] || { color:C.muted, icon:"•" };
                const isLast = i === visible.length-1;
                const isExp  = expanded === log.id;

                return (
                  <div key={log.id}>
                    <div
                      className="al-row"
                      onClick={() => setExpanded(isExp ? null : log.id)}
                      style={{ display:"grid", gridTemplateColumns:"50px 160px 120px 100px 160px 1fr 90px", padding:"9px 14px", borderBottom:isLast&&!isExp?"none":`1px solid ${C.bdr}`, alignItems:"center", background:isExp?`${cat.color}08`:"transparent" }}>

                      {/* ID */}
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:C.muted }}>
                        {log.id}
                      </span>

                      {/* Date & Time */}
                      <div>
                        <div style={{ fontSize:11, color:C.text, fontWeight:600 }}>{fmtDate(log.createdAt)}</div>
                        <div style={{ fontSize:10, color:C.muted, fontFamily:"'JetBrains Mono',monospace" }}>{fmtTime(log.createdAt)}</div>
                      </div>

                      {/* User */}
                      <div style={{ fontSize:12, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {log.userName || "System"}
                      </div>

                      {/* Role */}
                      <RoleBadge role={log.userRole}/>

                      {/* Action */}
                      <div>
                        <span style={{ background:cat.color+"18", border:`1px solid ${cat.color}40`, color:cat.color, borderRadius:6, padding:"2px 7px", fontSize:9, fontWeight:800, letterSpacing:"0.04em", display:"inline-flex", alignItems:"center", gap:4 }}>
                          <span>{cat.icon}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace" }}>{log.action}</span>
                        </span>
                      </div>

                      {/* Description */}
                      <div style={{ fontSize:12, color:C.sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {log.description}
                      </div>

                      {/* Order ID */}
                      {log.orderId
                        ? <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:C.acc, fontWeight:700 }}>{log.orderId}</span>
                        : <span style={{ color:C.bdr }}>—</span>
                      }
                    </div>

                    {/* Expanded detail */}
                    {isExp && (
                      <div style={{ padding:"10px 14px 14px", background:`${cat.color}06`, borderBottom:`1px solid ${C.bdr}` }}>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          {/* Full timestamp */}
                          <Detail label="Timestamp" value={fmtDT(log.createdAt)}/>
                          {log.orderId && <Detail label="Order ID" value={log.orderId} mono/>}
                          {log.extra    && <Detail label="Extra"    value={formatJSON(log.extra)} mono/>}

                          {/* Old value */}
                          {log.oldValue && (
                            <div>
                              <div style={{ fontSize:9, color:C.danger, fontWeight:800, letterSpacing:"0.07em", marginBottom:4 }}>OLD VALUE</div>
                              <pre style={{ background:C.bg, borderRadius:7, padding:"7px 10px", fontSize:10, color:"#f87171", fontFamily:"'JetBrains Mono',monospace", margin:0, whiteSpace:"pre-wrap", wordBreak:"break-all", border:`1px solid ${C.danger}20`, maxHeight:100, overflowY:"auto" }}>
                                {formatJSON(log.oldValue)}
                              </pre>
                            </div>
                          )}

                          {/* New value */}
                          {log.newValue && (
                            <div>
                              <div style={{ fontSize:9, color:C.success, fontWeight:800, letterSpacing:"0.07em", marginBottom:4 }}>NEW VALUE</div>
                              <pre style={{ background:C.bg, borderRadius:7, padding:"7px 10px", fontSize:10, color:"#86efac", fontFamily:"'JetBrains Mono',monospace", margin:0, whiteSpace:"pre-wrap", wordBreak:"break-all", border:`1px solid ${C.success}20`, maxHeight:100, overflowY:"auto" }}>
                                {formatJSON(log.newValue)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ CLEAR CONFIRM MODAL ══ */}
      {showClear && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9000, padding:16 }}>
          <div style={{ background:C.card2, border:`2px solid ${C.danger}40`, borderRadius:16, padding:"28px 24px", width:400, maxWidth:"96vw", boxShadow:"0 24px 64px rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize:40, textAlign:"center", marginBottom:12 }}>🗑</div>
            <div style={{ fontWeight:900, color:C.danger, fontSize:17, textAlign:"center", marginBottom:8 }}>Clear All Activity Logs?</div>
            <div style={{ fontSize:13, color:C.sub, textAlign:"center", lineHeight:1.7, marginBottom:18 }}>
              This permanently deletes all <strong style={{color:C.text}}>{totalCount.toLocaleString()}</strong> log entries. This action cannot be undone.
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, letterSpacing:"0.07em", marginBottom:6 }}>
                TYPE <span style={{color:C.danger,fontFamily:"monospace",letterSpacing:"0.15em"}}>CLEAR</span> TO CONFIRM
              </div>
              <input value={clearText} onChange={e=>setClearText(e.target.value.toUpperCase())}
                placeholder="CLEAR"
                style={{ width:"100%", background:"#0a0505", border:`1px solid ${clearText==="CLEAR"?C.danger:C.bdr}`, borderRadius:8, padding:"10px 14px", color:C.text, fontSize:15, fontFamily:"'JetBrains Mono',monospace", fontWeight:700, outline:"none", letterSpacing:"0.15em", boxSizing:"border-box", textAlign:"center" }}/>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button className="al-btn" onClick={doClear} disabled={clearText!=="CLEAR"||clearing}
                style={{ flex:2, ...Btn(clearText==="CLEAR"?C.danger:"#1a0a0a","#fff"), opacity:clearText!=="CLEAR"||clearing?0.5:1 }}>
                {clearing ? "Clearing…" : `Clear ${totalCount.toLocaleString()} Logs`}
              </button>
              <button className="al-btn" onClick={()=>setShowClear(false)} style={{...Ghost(),flex:1}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:22, left:"50%", transform:"translateX(-50%)", background:toast.type==="err"?C.danger:toast.type==="warn"?C.warn:C.success, color:"#000", fontWeight:700, fontSize:13, padding:"10px 22px", borderRadius:24, zIndex:9999, boxShadow:"0 6px 24px rgba(0,0,0,0.5)", whiteSpace:"nowrap", pointerEvents:"none" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ── HELPERS ─────────────────────────────────────────*/
function formatJSON(str) {
  if (!str) return "";
  try { return JSON.stringify(JSON.parse(str), null, 2); }
  catch { return str; }
}

function FSelect({ value, onChange, children }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{ width:"100%", background:C.card, border:`1px solid ${value!=="all"?C.acc:C.bdr}`, borderRadius:8, padding:"8px 10px", color:C.text, fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box", cursor:"pointer" }}>
      {children}
    </select>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:"0.07em", marginBottom:3 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize:11, color:C.sub, fontFamily:mono?"'JetBrains Mono',monospace":"inherit", wordBreak:"break-all" }}>{value}</div>
    </div>
  );
}

function RoleBadge({ role }) {
  const cfg = { admin:["#f0a500","👑"], cashier:["#58a6ff","💳"], kitchen:["#3fb950","🍳"], system:["#6b7280","🤖"] };
  const [col, icon] = cfg[role] || cfg.system;
  return (
    <span style={{ background:col+"18", border:`1px solid ${col}40`, color:col, borderRadius:20, padding:"2px 9px", fontSize:9, fontWeight:800, display:"inline-flex", alignItems:"center", gap:4 }}>
      {icon} {role}
    </span>
  );
}
