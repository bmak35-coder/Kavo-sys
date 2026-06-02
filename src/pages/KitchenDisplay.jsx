import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth, ROLE_META } from "../auth/AuthProvider";
import { KitchenService } from "../db/services/kitchen.js";
import { useLang, LangSwitcher } from "../i18n/LanguageContext.jsx";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Kitchen Workflow System  ·  v2.0
   Priority system · Cancelled status · POS sync
   Offline-first · IndexedDB + localStorage bridge
══════════════════════════════════════════════════════ */

export const KITCHEN_KEY = "kavo_kitchen";

// ─── localStorage bridge ──────────────────────────────
const KDB = {
  get: (k) => { try { const r=localStorage.getItem(k); return r?JSON.parse(r):[]; } catch{return[];} },
  set: (k, v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch{} },
};

// ─── Status config ────────────────────────────────────
const STATUS_LIST = ["New","Preparing","Ready","Served","Cancelled"];
const ACTIVE_STATUSES = ["New","Preparing","Ready"];

const S_CFG = {
  New:       { col:"#58a6ff", bg:"#58a6ff14", bdr:"#58a6ff45", next:"Preparing", btn:"startPreparing", icon:"🆕", label:"NEW"       },
  Preparing: { col:"#f0a500", bg:"#f0a50014", bdr:"#f0a50045", next:"Ready",     btn:"markReady",   icon:"👨‍🍳", label:"PREPARING" },
  Ready:     { col:"#3fb950", bg:"#3fb95014", bdr:"#3fb95045", next:"Served",    btn:"orderServed",    icon:"✅", label:"READY"     },
  Served:    { col:"#94a3b8", bg:"#94a3b810", bdr:"#94a3b830", next:null,        btn:"Served",          icon:"✓",  label:"SERVED"    },
  Cancelled: { col:"#f85149", bg:"#f8514910", bdr:"#f8514940", next:null,        btn:"cancelled",       icon:"🚫", label:"CANCELLED" },
};

const TYPE_CFG = {
  "dine-in":  { col:"#a78bfa", label:"Dine-In",  icon:"🍽" },
  "takeaway": { col:"#fb923c", label:"Takeaway",  icon:"🛍" },
  "delivery": { col:"#34d399", label:"Delivery",  icon:"🛵" },
};

// ─── Priority config ──────────────────────────────────
const PRIORITY_CFG = {
  Normal: { col:"#4a6080", bg:"transparent",  icon:"",  label:"Normal" },
  Rush:   { col:"#f85149", bg:"#f8514920",    icon:"🔴", label:"RUSH"  },
  VIP:    { col:"#f0a500", bg:"#f0a50020",    icon:"⭐", label:"VIP"   },
};

// ─── Urgency (time-based) ─────────────────────────────
function getUrgency(sentAt, status) {
  if (status === "Served" || status === "Ready" || status === "Cancelled") return "ok";
  const m = Math.floor((Date.now() - new Date(sentAt).getTime()) / 60000);
  if (m >= 15) return "critical";
  if (m >= 8)  return "high";
  if (m >= 4)  return "medium";
  return "low";
}
const URG_COL = { ok:"#3fb950", low:"#3fb950", medium:"#f0a500", high:"#f85149", critical:"#ff3b3b" };
const URG_LABEL = { ok:"", low:"", medium:"⚠ Slow", high:"🔥 Late", critical:"🚨 OVERDUE" };

// ─── Helpers ──────────────────────────────────────────
function fmtElapsed(sentAt) {
  const total = Math.max(0, Math.floor((Date.now()-new Date(sentAt).getTime())/1000));
  const m = Math.floor(total/60), s = total%60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
}
function fmtClock() {
  return new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
function safeArr(v) { return Array.isArray(v)?v:[]; }

// ─── Sound alert ──────────────────────────────────────
function playBeep(ctxRef) {
  try {
    if (!ctxRef.current)
      ctxRef.current = new (window.AudioContext||window.webkitAudioContext)();
    const ctx = ctxRef.current;
    [[440,0,0.12],[660,0.16,0.12],[880,0.32,0.18]].forEach(([freq,offset,dur])=>{
      const osc=ctx.createOscillator(), gain=ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type="sine"; osc.frequency.value=freq;
      const t0=ctx.currentTime+offset;
      gain.gain.setValueAtTime(0.3,t0);
      gain.gain.exponentialRampToValueAtTime(0.001,t0+dur);
      osc.start(t0); osc.stop(t0+dur+0.05);
    });
  } catch(_){}
}

// ─── Filter definitions ───────────────────────────────
const STATUS_FILTERS = ["All","New","Preparing","Ready","Served","Cancelled"];
const TYPE_FILTER_KEYS = [
  {key:"All",      icon:"🔄", col:"#f0a500"},
  {key:"dine-in",  icon:"🍽", col:"#a78bfa"},
  {key:"takeaway", icon:"🛍", col:"#fb923c"},
  {key:"delivery", icon:"🛵", col:"#34d399"},
];
const PRIORITY_FILTERS = [
  {key:"All",label:"All",col:"#4a6080"},
  {key:"Rush",label:"Rush",col:"#f85149"},
  {key:"VIP",label:"VIP",col:"#f0a500"},
];

// ══════════════════════════════════════════════════════
//   MAIN COMPONENT
// ══════════════════════════════════════════════════════
export default function KitchenDisplay({ onBack }) {
  const { user, logout } = useAuth();
  const umeta = ROLE_META[user?.role] || ROLE_META.kitchen;
  const lang = useLang();  // use lang.t() to avoid shadowing
  const canAct = user?.role === "admin" || user?.role === "kitchen"; // cashier = view only
  const isKitchenOnly = user?.role === "kitchen"; // kitchen staff: no Back to POS, no Sign-Out nav

  const [orders,         setOrders]         = useState([]);
  const [statFil,        setStatFil]        = useState("All");
  const [typeFil,        setTypeFil]        = useState("All");
  const [priFil,         setPriFil]         = useState("All");
  const [tick,           setTick]           = useState(0);
  const [soundOn,        setSoundOn]        = useState(true);
  const [newAlert,       setNewAlert]       = useState(false);
  const [flashSet,       setFlashSet]       = useState(new Set());
  const [showCompleted,  setShowCompleted]  = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clockStr,       setClockStr]       = useState(fmtClock());
  const [priModal,       setPriorityModal]  = useState(null); // { id, current }

  const knownRef = useRef(new Set());
  const firstRef = useRef(true);
  const audioRef = useRef(null);
  const soundRef = useRef(soundOn);
  useEffect(()=>{ soundRef.current=soundOn; },[soundOn]);

  // ── 1-second tick ─────────────────────────────────
  useEffect(()=>{
    const t = setInterval(()=>{ setTick(n=>n+1); setClockStr(fmtClock()); },1000);
    return ()=>clearInterval(t);
  },[]);

  // ── Poll IDB every 2s + LS fallback ───────────────
  const loadOrders = useCallback(async()=>{
    let data=[];
    try {
      data = await KitchenService.getAll();
      if (!Array.isArray(data)||data.length===0) data=KDB.get(KITCHEN_KEY);
    } catch(_){ data=KDB.get(KITCHEN_KEY); }

    setOrders(data);

    if (firstRef.current) {
      data.forEach(o=>o?.id&&knownRef.current.add(o.id));
      firstRef.current=false; return;
    }
    const newOnes=data.filter(o=>o?.id&&!knownRef.current.has(o.id)&&o.status!=="Served"&&o.status!=="Cancelled");
    if (newOnes.length>0) {
      setNewAlert(true); setTimeout(()=>setNewAlert(false),3000);
      const ids=new Set(newOnes.map(o=>o.id));
      setFlashSet(ids); setTimeout(()=>setFlashSet(new Set()),2500);
      if (soundRef.current) playBeep(audioRef);
    }
    data.forEach(o=>o?.id&&knownRef.current.add(o.id));
  },[]);

  useEffect(()=>{ loadOrders(); const t=setInterval(loadOrders,2000); return()=>clearInterval(t); },[loadOrders]);

  // ── Write helper (IDB + LS bridge) ────────────────
  function writeOrders(updated) {
    setOrders(updated);
    KDB.set(KITCHEN_KEY, updated);
  }

  // ── Advance status ─────────────────────────────────
  function advance(id) {
    const updated = orders.map(o=>{
      if (o.id!==id) return o;
      const nxt=S_CFG[o.status]?.next;
      return nxt ? {...o,status:nxt,updatedAt:new Date().toISOString()} : o;
    });
    writeOrders(updated);
    KitchenService.advance(id).catch(()=>{});
  }

  // ── Cancel order ───────────────────────────────────
  function cancelOrder(id) {
    const updated = orders.map(o=>
      o.id===id ? {...o,status:"Cancelled",updatedAt:new Date().toISOString()} : o
    );
    writeOrders(updated);
    KitchenService.save(updated.find(o=>o.id===id)).catch(()=>{});
  }

  // ── Set priority ───────────────────────────────────
  function setPriority(id, priority) {
    const updated = orders.map(o=>
      o.id===id ? {...o,priority,updatedAt:new Date().toISOString()} : o
    );
    writeOrders(updated);
    KitchenService.save(updated.find(o=>o.id===id)).catch(()=>{});
    setPriorityModal(null);
  }

  // ── Dismiss single ─────────────────────────────────
  function dismiss(id) {
    const updated=orders.filter(o=>o.id!==id);
    writeOrders(updated);
    KitchenService.delete(id).catch(()=>{});
    knownRef.current.delete(id);
  }

  // ── Clear completed ────────────────────────────────
  function clearCompleted() {
    orders.filter(o=>o.status==="Served"||o.status==="Cancelled")
          .forEach(o=>knownRef.current.delete(o.id));
    const remaining=orders.filter(o=>o.status!=="Served"&&o.status!=="Cancelled");
    writeOrders(remaining);
    KitchenService.clearServed().catch(()=>{});
    setShowClearModal(false); setShowCompleted(false);
  }

  // ── Filter & sort ──────────────────────────────────
  const filtered = orders.filter(o=>{
    if (statFil!=="All"&&o.status!==statFil) return false;
    if (typeFil!=="All"&&o.type!==typeFil) return false;
    if (priFil!=="All"&&(o.priority||"Normal")!==priFil) return false;
    return true;
  }).sort((a,b)=>{
    // VIP first, Rush second, then by sentAt
    const pOrder={VIP:0,Rush:1,Normal:2};
    const pa=pOrder[a.priority||"Normal"]??2;
    const pb=pOrder[b.priority||"Normal"]??2;
    if (pa!==pb) return pa-pb;
    return new Date(a.sentAt)-new Date(b.sentAt);
  });

  const active    = filtered.filter(o=>ACTIVE_STATUSES.includes(o.status));
  const done      = filtered.filter(o=>o.status==="Served"||o.status==="Cancelled");
  const allDone   = orders.filter(o=>o.status==="Served"||o.status==="Cancelled");

  const counts = STATUS_LIST.reduce((a,s)=>{a[s]=orders.filter(o=>o.status===s).length;return a;},{All:orders.length});
  const rushCount = orders.filter(o=>ACTIVE_STATUSES.includes(o.status)&&(o.priority==="Rush"||o.priority==="VIP")).length;

  const orderNums = ["All","New","Preparing","Ready"];

  return (
    <div style={{height:"100vh",background:"#070c16",color:"#e8edf5",
                  fontFamily:"system-ui,-apple-system,sans-serif",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        ::-webkit-scrollbar{width:5px;height:4px}
        ::-webkit-scrollbar-track{background:#070c16}
        ::-webkit-scrollbar-thumb{background:#1e2d4a;border-radius:4px}
        @keyframes slideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cardGlow{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 8px #3fb95028}}
        @keyframes rushGlow{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 8px #f8514928}}
        @keyframes vipGlow{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 8px #f0a50028}}
        @keyframes newBadge{0%,100%{transform:scale(1)}40%{transform:scale(1.1)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes readyPulse{0%,100%{border-color:#3fb95045}50%{border-color:#3fb950bb}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .kv-card{animation:slideUp 0.3s cubic-bezier(.16,1,.3,1);}
        .kv-flash{animation:cardGlow 1.8s ease 2;}
        .kv-rush-flash{animation:rushGlow 1.5s ease infinite;}
        .kv-vip-card{animation:vipGlow 2.5s ease infinite;}
        .kv-ready-card{animation:readyPulse 2s ease infinite;}
        .kv-blink{animation:blink 0.7s ease infinite;}
        .kv-fadein{animation:fadeIn 0.22s ease;}
        .kv-btn:hover:not(:disabled){opacity:0.84;transform:scale(0.98);}
        .kv-btn{transition:all 0.13s;cursor:pointer;}
        .kv-pill{transition:all 0.13s;cursor:pointer;}
        .kv-pill:hover{opacity:0.8;}
        .kv-tab:hover{opacity:0.8;}
        @media(max-width:640px){
          .kv-grid{grid-template-columns:1fr!important;}
          .kv-header-pills{display:none!important;}
        }
      `}</style>

      {/* ══ HEADER ══ */}
      <header style={{background:"#0b1220",borderBottom:"2px solid #f0a500",
                      padding:"0 14px",height:56,display:"flex",alignItems:"center",
                      gap:9,flexShrink:0,flexWrap:"wrap"}}>

        {/* Logo */}
        <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:900,
                      fontSize:18,color:"#f0a500",letterSpacing:".07em",flexShrink:0}}>
          KAVO<span style={{color:"#e8edf5",opacity:.3}}>-SYS</span>
        </span>
        <div style={{width:1,height:24,background:"#1e2d4a",flexShrink:0}}/>
        <span style={{fontSize:10,fontWeight:800,color:"#4a6080",letterSpacing:".12em",flexShrink:0}}>
          {lang.t("kitchenDisplay")}
        </span>

        {/* Back to POS — Admin/Cashier only */}
        {!isKitchenOnly && onBack && (
          <button className="kv-btn" onClick={onBack}
            style={{background:"transparent",border:"1px solid #f0a50050",borderRadius:8,
                    padding:"5px 13px",color:"#f0a500",fontSize:11,fontWeight:700,
                    fontFamily:"inherit",flexShrink:0,display:"flex",alignItems:"center",gap:5}}>
            {lang.t("backToPOS")}
          </button>
        )}

        {/* Live status count pills */}
        <div className="kv-header-pills" style={{display:"flex",gap:5,flexShrink:0}}>
          {orderNums.filter(s=>s!=="All").map(s=>(
            <button key={s} className="kv-pill"
              onClick={()=>setStatFil(s===statFil?"All":s)}
              style={{background:S_CFG[s].bg,border:`1px solid ${statFil===s?S_CFG[s].col:S_CFG[s].bdr}`,
                      borderRadius:8,padding:"4px 11px",
                      display:"flex",alignItems:"center",gap:5,fontFamily:"inherit"}}>
              <span style={{fontSize:13,fontWeight:900,color:S_CFG[s].col,
                            fontFamily:"'JetBrains Mono',monospace"}}>{counts[s]||0}</span>
              <span style={{fontSize:10,color:S_CFG[s].col+"90",fontWeight:700}}>{s}</span>
            </button>
          ))}
        </div>

        <div style={{flex:1}}/>

        <LangSwitcher/>
        {/* Rush alert */}
        {rushCount > 0 && (
          <div className="kv-blink" style={{background:"#f8514918",border:"1px solid #f8514960",
                borderRadius:20,padding:"4px 13px",fontSize:11,fontWeight:800,color:"#f85149",
                display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
            🔴 {rushCount} Priority
          </div>
        )}

        {/* New order alert */}
        {newAlert && (
          <div className="kv-new-badge" style={{background:"#3fb95020",border:"1px solid #3fb95060",
                borderRadius:20,padding:"4px 13px",fontSize:12,fontWeight:800,color:"#3fb950",
                display:"flex",alignItems:"center",gap:6,flexShrink:0,
                animation:"newBadge 0.5s ease"}}>
            🆕 New Order!
          </div>
        )}

        {/* Sound toggle */}
        <button className="kv-btn"
          onClick={()=>setSoundOn(s=>!s)}
          style={{background:soundOn?"#3fb95018":"transparent",
                  border:`1px solid ${soundOn?"#3fb95040":"#1e2d4a"}`,
                  borderRadius:8,padding:"5px 12px",
                  color:soundOn?"#3fb950":"#374a60",
                  fontSize:11,fontWeight:700,fontFamily:"inherit",flexShrink:0}}>
          {soundOn ? lang.t("soundOn") : lang.t("soundOff")}
        </button>

        {/* Clock */}
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:"#e8edf5",flexShrink:0}}>
          {clockStr}
        </span>

        <div style={{width:1,height:24,background:"#1e2d4a",flexShrink:0}}/>

        {/* User badge + sign out */}
        <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
          <div style={{background:umeta.bg,border:`1px solid ${umeta.color}40`,
                        borderRadius:20,padding:"3px 11px",display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:12}}>{umeta.icon}</span>
            <span style={{fontSize:11,fontWeight:700,color:umeta.color}}>{user?.name}</span>
          </div>
          <button className="kv-btn" onClick={logout}
            style={{background:"transparent",border:"1px solid #f8514930",borderRadius:8,
                    padding:"5px 12px",color:"#f85149",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
            Sign Out
          </button>
        </div>
      </header>

      {/* ══ FILTER BAR ══ */}
      <div style={{background:"#0b1220",borderBottom:"1px solid #1a2438",
                    padding:"8px 14px",display:"flex",gap:8,flexWrap:"wrap",
                    alignItems:"center",flexShrink:0}}>

        {/* Status filters */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {STATUS_FILTERS.map(s=>{
            const cfg=S_CFG[s]; const col=s==="All"?"#f0a500":cfg.col; const on=statFil===s;
            return (
              <button key={s} className="kv-pill" onClick={()=>setStatFil(s)}
                style={{background:on?col+"20":"transparent",
                        border:`1px solid ${on?col+"70":"#1e2d4a"}`,
                        borderRadius:20,padding:"4px 11px",
                        color:on?col:"#4a5a70",
                        fontSize:10,fontWeight:700,fontFamily:"inherit",
                        display:"flex",alignItems:"center",gap:4}}>
                {s!=="All"&&<span style={{fontSize:11}}>{cfg.icon}</span>}
                <span>{s}</span>
                {s!=="All"&&counts[s]>0&&(
                  <span style={{background:col+"28",color:col,borderRadius:10,
                                padding:"0 5px",fontSize:9,fontWeight:900}}>{counts[s]}</span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{width:1,height:16,background:"#1e2d4a",flexShrink:0}}/>

        {/* Type filters */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {TYPE_FILTER_KEYS.map(tf=>{
            const on=typeFil===tf.key;
            const label = tf.key==="All"      ? lang.t("filterAllTypes")
                        : tf.key==="dine-in"  ? lang.t("filterDineIn")
                        : tf.key==="takeaway" ? lang.t("filterTakeaway")
                        :                       lang.t("filterDelivery");
            return (
              <button key={tf.key} className="kv-pill" onClick={()=>setTypeFil(tf.key)}
                style={{background:on?tf.col+"20":"transparent",
                        border:`1px solid ${on?tf.col+"70":"#1e2d4a"}`,
                        borderRadius:20,padding:"4px 11px",
                        color:on?tf.col:"#4a5a70",
                        fontSize:10,fontWeight:700,fontFamily:"inherit"}}>
                {tf.icon} {label}
              </button>
            );
          })}
        </div>

        <div style={{width:1,height:16,background:"#1e2d4a",flexShrink:0}}/>

        {/* Priority filters */}
        <div style={{display:"flex",gap:4}}>
          {PRIORITY_FILTERS.map(pf=>{
            const on=priFil===pf.key;
            return (
              <button key={pf.key} className="kv-pill" onClick={()=>setPriFil(pf.key)}
                style={{background:on?pf.col+"20":"transparent",
                        border:`1px solid ${on?pf.col+"70":"#1e2d4a"}`,
                        borderRadius:20,padding:"4px 11px",
                        color:on?pf.col:"#4a5a70",
                        fontSize:10,fontWeight:700,fontFamily:"inherit"}}>
                {pf.label}
              </button>
            );
          })}
        </div>

        <div style={{flex:1}}/>
        <span style={{fontSize:10,color:"#2a3a50",flexShrink:0}}>
          ↻ 2s · {filtered.length} order{filtered.length!==1?"s":""}
        </span>
      </div>

      {/* ══ MAIN CONTENT ══ */}
      <div style={{flex:1,overflowY:"auto",padding:14, paddingBottom:80}}>

        {orders.length===0 && <EmptyState/>}

        {orders.length>0 && (
          <>
            {/* Active orders */}
            {active.length>0 && (
              <div style={{marginBottom:24}}>
                <SectionHead label={lang.t("activeOrders")} count={active.length} color="#f0a500"/>
                <div className="kv-grid"
                  style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:13}}>
                  {active.map(o=>(
                    <OrderCard
                      key={o.id} order={o} tick={tick}
                      flash={flashSet.has(o.id)}
                      canAct={canAct}
                      onAdvance={()=>advance(o.id)}
                      onCancel={()=>cancelOrder(o.id)}
                      onSetPriority={(p)=>setPriority(o.id,p)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All-clear */}
            {active.length===0&&orders.length>0 && (
              <div style={{textAlign:"center",padding:"40px 20px",marginBottom:20,
                            background:"#0d1a10",border:"1px solid #1a3a20",borderRadius:16}}>
                <div style={{fontSize:44,marginBottom:10}}>✅</div>
                <div style={{fontSize:16,fontWeight:800,color:"#3fb950",marginBottom:4}}>All caught up!</div>
                <div style={{fontSize:13,color:"#4a8060"}}>Kitchen is clear — no active orders</div>
              </div>
            )}

            {/* No filter match */}
            {filtered.length===0&&orders.length>0 && (
              <div style={{textAlign:"center",padding:40,color:"#2a3a50"}}>
                <div style={{fontSize:32,marginBottom:8}}>🔍</div>
                <div style={{fontSize:13}}>No orders match these filters</div>
              </div>
            )}

            {/* Completed / Cancelled section */}
            {allDone.length>0 && (
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:showCompleted?12:0}}>
                  <span style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:".08em"}}>
                    COMPLETED / CANCELLED
                  </span>
                  <span style={{background:"#64748b22",border:"1px solid #64748b40",color:"#94a3b8",
                                borderRadius:10,padding:"1px 9px",fontSize:11,fontWeight:800}}>
                    {allDone.length}
                  </span>
                  <div style={{flex:1,height:1,background:"#1a2438"}}/>
                  {canAct&&allDone.length>0&&(
                    <button className="kv-btn" onClick={()=>setShowClearModal(true)}
                      style={{background:"#f8514912",border:"1px solid #f8514940",borderRadius:8,
                              padding:"5px 12px",color:"#f85149",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
                      🗑 Clear All
                    </button>
                  )}
                  <button className="kv-btn" onClick={()=>setShowCompleted(s=>!s)}
                    style={{background:"#1e2d4a",border:"1px solid #2d3f5a",borderRadius:8,
                            padding:"5px 14px",color:"#94a3b8",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
                    {showCompleted?"▲ Hide":"▼ Show"} ({allDone.length})
                  </button>
                </div>

                {showCompleted&&done.length>0&&(
                  <div className="kv-fadein kv-grid"
                    style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
                    {done.map(o=>(
                      <OrderCard key={o.id} order={o} tick={tick}
                        flash={false} canAct={false} dimmed
                        onDismiss={()=>dismiss(o.id)}/>
                    ))}
                  </div>
                )}
                {showCompleted&&done.length===0&&allDone.length>0&&(
                  <div style={{textAlign:"center",padding:"18px 0",fontSize:12,color:"#2a3a50"}}>
                    No completed orders match the current filter
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ CLEAR MODAL ══ */}
      {showClearModal&&(
        <Modal onClose={()=>setShowClearModal(false)}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:38,marginBottom:12}}>🗑</div>
            <div style={{fontSize:17,fontWeight:800,color:"#e8edf5",marginBottom:8}}>
              Clear Completed Orders?
            </div>
            <div style={{fontSize:13,color:"#7d8fa0",lineHeight:1.6,marginBottom:10}}>
              Remove <span style={{color:"#f0a500",fontWeight:700}}>{allDone.length} order{allDone.length!==1?"s":""}</span> from the kitchen display.
            </div>
            <div style={{background:"#0a1520",border:"1px solid #1e3a50",borderRadius:8,
                          padding:"9px 12px",marginBottom:20,fontSize:12,color:"#58a6ff",lineHeight:1.5}}>
              ✅ Sales data and reports are <strong>not affected</strong>.
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="kv-btn" onClick={()=>setShowClearModal(false)}
                style={{flex:1,background:"transparent",border:"1px solid #2d3f5a",borderRadius:10,
                        padding:"11px 0",color:"#7d8fa0",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>
                Cancel
              </button>
              <button className="kv-btn" onClick={clearCompleted}
                style={{flex:1,background:"#f85149",border:"none",borderRadius:10,
                        padding:"11px 0",color:"#fff",fontSize:13,fontWeight:800,fontFamily:"inherit"}}>
                Clear {allDone.length}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   ORDER CARD
══════════════════════════════════════════════════════ */
function OrderCard({ order, tick, flash, canAct, onAdvance, onCancel, onDismiss, onSetPriority, dimmed }) {
  const lang = useLang();
  const [showPriMenu, setShowPriMenu] = useState(false);
  const cfg      = S_CFG[order.status] || S_CFG.New;
  const tcfg     = TYPE_CFG[order.type] || TYPE_CFG["dine-in"];
  const priority = order.priority || "Normal";
  const pcfg     = PRIORITY_CFG[priority];
  const urg      = getUrgency(order.sentAt, order.status);
  const urgCol   = URG_COL[urg];
  const urgLabel = URG_LABEL[urg];
  const isCrit   = urg === "critical";
  const isReady  = order.status === "Ready";
  const isDone   = order.status === "Served" || order.status === "Cancelled";
  const elapsed  = fmtElapsed(order.sentAt);

  let cls = "kv-card";
  if (flash) cls += priority === "Rush" ? " kv-rush-flash" : " kv-flash";
  if (priority === "VIP" && !isDone) cls += " kv-vip-card";
  else if (isReady && !dimmed) cls += " kv-ready-card";

  const borderCol = isDone
    ? (order.status === "Cancelled" ? "#f8514930" : "#2d3f5a")
    : cfg.col + "55";
  const borderLeft = isDone
    ? (order.status === "Cancelled" ? "#f85149" : "#3d5068")
    : (priority === "VIP" ? "#f0a500" : priority === "Rush" ? "#f85149" : cfg.col);

  return (
    <div className={cls} style={{
      background: isDone ? "#0d1320" : "#0d1525",
      border: `1.5px solid ${borderCol}`,
      borderLeft: `4px solid ${borderLeft}`,
      borderRadius: 14,
      padding: 14,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ready glow overlay */}
      {isReady && !dimmed && (
        <div style={{position:"absolute",inset:0,borderRadius:14,
                     background:`radial-gradient(ellipse at top,${cfg.col}08 0%,transparent 65%)`,
                     pointerEvents:"none"}}/>
      )}

      {/* ── TOP ROW ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9,gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          {/* Priority badge */}
          {priority !== "Normal" && (
            <div style={{marginBottom:5}}>
              <span style={{background:pcfg.bg,border:`1px solid ${pcfg.col}60`,color:pcfg.col,
                            borderRadius:20,padding:"2px 10px",fontSize:10,fontWeight:900,
                            letterSpacing:".06em"}}>
                {pcfg.icon} {pcfg.label}
              </span>
            </div>
          )}
          {/* Order number + badges */}
          <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6,marginBottom:4}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:16,
                          color:isDone?"#94a3b8":"#f0a500"}}>
              {order.orderNo}
            </span>
            <TypeBadge cfg={tcfg} dimmed={isDone}/>
            {order.tableNo && <TableBadge no={order.tableNo} dimmed={isDone}/>}
          </div>
          {order.custName && (
            <div style={{fontSize:11,color:isDone?"#6b7280":"#7d9ab8",fontWeight:600,
                          display:"flex",alignItems:"center",gap:4}}>
              <span>👤</span> {order.custName}
            </div>
          )}
        </div>

        {/* Status + timer */}
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{display:"inline-block",background:cfg.bg,border:`1px solid ${cfg.bdr}`,
                        color:cfg.col,borderRadius:20,padding:"3px 10px",
                        fontSize:9,fontWeight:800,letterSpacing:".06em",marginBottom:4}}>
            {cfg.icon} {cfg.label}
          </div>
          <div className={isCrit?"kv-blink":""}
            style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:15,
                    color:isDone?"#4a5a70":urgCol,
                    display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
            <span style={{fontSize:11}}>⏱</span>{elapsed}
          </div>
          {urgLabel && (
            <div style={{fontSize:9,fontWeight:800,color:urgCol,textAlign:"right",
                          letterSpacing:".04em"}}>{urgLabel}</div>
          )}
          <div style={{fontSize:9,color:"#374a60",textAlign:"right",marginTop:2}}>
            {fmtTime(order.sentAt)}
          </div>
        </div>
      </div>

      {/* ── ITEMS ── */}
      <div style={{borderTop:"1px solid #1e2d40",borderBottom:"1px solid #1e2d40",
                    padding:"9px 0",marginBottom:10}}>
        {safeArr(order.cart).map((item,i)=>(
          <div key={i} style={{marginBottom:i<safeArr(order.cart).length-1?8:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                <div style={{width:32,height:32,borderRadius:7,flexShrink:0,overflow:"hidden",
                              background:"#1e2d4a",display:"flex",alignItems:"center",justifyContent:"center",
                              fontSize:18}}>
                  {item.photo
                    ? <img src={item.photo} alt={item.name}
                           style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : (item.em||"🍽")
                  }
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,
                                color:isDone?"#8899aa":"#dde6f0",
                                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {item.name}
                  </div>
                  {item._modLabel && (
                    <div style={{fontSize:10,color:"#58a6ff",marginTop:1}}>⚙ {item._modLabel}</div>
                  )}
                </div>
              </div>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:18,fontWeight:900,
                            color:isDone?"#5a6a80":cfg.col,flexShrink:0,minWidth:28,textAlign:"right"}}>
                ×{item.qty}
              </span>
            </div>
            {item.note && (
              <div style={{marginTop:4,marginLeft:27,fontSize:10,
                            color:isDone?"#7a6a40":"#d29922",fontStyle:"italic",
                            background:isDone?"#1a1608":"#d2992212",
                            borderRadius:5,padding:"2px 8px",display:"inline-block",maxWidth:"95%"}}>
                📝 {item.note}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Order notes */}
      {order.notes && (
        <div style={{background:"#141e30",borderRadius:7,padding:"6px 10px",
                      marginBottom:9,fontSize:11,color:isDone?"#5a6a7a":"#8090a0",
                      fontStyle:"italic",borderLeft:"2px solid #2a3a50"}}>
          🗒 {order.notes}
        </div>
      )}

      {/* ── ACTION BUTTONS ── */}
      {!isDone && canAct && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {/* Main advance */}
          {cfg.next && (
            <button className="kv-btn" onClick={onAdvance}
              style={{flex:2,background:cfg.col,color:"#000",border:"none",borderRadius:10,
                      padding:"11px 0",fontWeight:800,fontSize:12,fontFamily:"inherit"}}>
              {lang.t(cfg.btn) || cfg.btn}
            </button>
          )}
          {/* Priority picker */}
          <div style={{position:"relative"}}>
            <button className="kv-btn" onClick={()=>setShowPriMenu(p=>!p)}
              style={{background:"#1e2d4a",border:"1px solid #2d3f5a",borderRadius:10,
                      padding:"11px 10px",color:"#94a3b8",fontSize:12,
                      fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>
              {priority==="Normal"?"🏷":"VIP"===priority?"⭐":"🔴"} {priority}
            </button>
            {showPriMenu && (
              <div style={{position:"absolute",bottom:"110%",right:0,
                            background:"#0d1525",border:"1px solid #2d3f5a",
                            borderRadius:10,padding:6,zIndex:100,minWidth:120,
                            boxShadow:"0 10px 30px rgba(0,0,0,.5)"}}>
                {["Normal","Rush","VIP"].map(p=>(
                  <button key={p} className="kv-btn"
                    onClick={()=>{onSetPriority(p);setShowPriMenu(false);}}
                    style={{width:"100%",background:priority===p?PRIORITY_CFG[p].bg:"transparent",
                            border:"none",borderRadius:7,padding:"7px 12px",
                            color:PRIORITY_CFG[p].col,fontSize:12,fontWeight:700,
                            fontFamily:"inherit",textAlign:"left",display:"flex",alignItems:"center",gap:7}}>
                    <span>{PRIORITY_CFG[p].icon||"—"}</span> {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Cancel */}
          <button className="kv-btn" onClick={onCancel}
            style={{background:"#f8514912",border:"1px solid #f8514940",borderRadius:10,
                    padding:"11px 10px",color:"#f85149",fontSize:12,
                    fontWeight:700,fontFamily:"inherit"}}>
            ✕
          </button>
        </div>
      )}

      {/* View only */}
      {!isDone && !canAct && (
        <div style={{background:"#151e30",borderRadius:10,padding:"11px 0",
                      fontSize:12,color:"#374a60",textAlign:"center"}}>
          🔒 View Only
        </div>
      )}

      {/* Dismiss button for done orders */}
      {isDone && (
        <button className="kv-btn" onClick={onDismiss}
          style={{width:"100%",background:"transparent",border:"1px solid #2d3f5a",
                  borderRadius:10,padding:"9px 0",color:"#64748b",
                  fontSize:12,fontWeight:700,fontFamily:"inherit"}}>
          ✕ Dismiss
        </button>
      )}
    </div>
  );
}

/* ── SMALL COMPONENTS ──────────────────────────────── */
function TypeBadge({cfg,dimmed}) {
  return (
    <span style={{background:dimmed?`${cfg.col}10`:`${cfg.col}18`,
                  border:`1px solid ${dimmed?cfg.col+"20":cfg.col+"40"}`,
                  color:dimmed?cfg.col+"60":cfg.col,
                  borderRadius:20,padding:"2px 9px",fontSize:9,fontWeight:700,flexShrink:0}}>
      {cfg.icon} {cfg.label}
    </span>
  );
}
function TableBadge({no,dimmed}) {
  return (
    <span style={{background:dimmed?"#1e2d40":"#f0a50018",
                  border:`1px solid ${dimmed?"#2d3f5a":"#f0a50040"}`,
                  color:dimmed?"#5a6a80":"#f0a500",
                  borderRadius:20,padding:"2px 9px",fontSize:9,fontWeight:700,flexShrink:0}}>
      {no}
    </span>
  );
}
function SectionHead({label,count,color}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
      <span style={{fontSize:11,fontWeight:800,color,letterSpacing:".08em"}}>{label}</span>
      <span style={{background:color+"22",border:`1px solid ${color}40`,color,
                    borderRadius:10,padding:"1px 9px",fontSize:11,fontWeight:800}}>{count}</span>
      <div style={{flex:1,height:1,background:"#1a2438"}}/>
    </div>
  );
}
function Modal({onClose,children}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",
                  display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}}>
      <div style={{background:"#0d1525",border:"1px solid #2d3f5a",borderRadius:16,
                    padding:"24px 22px",maxWidth:380,width:"100%",
                    boxShadow:"0 24px 60px rgba(0,0,0,.6)"}}>
        {children}
      </div>
    </div>
  );
}
function EmptyState() {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",
                  justifyContent:"center",minHeight:"60vh"}}>
      <div style={{fontSize:60,marginBottom:14,opacity:.12}}>🍽</div>
      <div style={{fontSize:17,fontWeight:700,color:"#3a4a60",marginBottom:8}}>
        Kitchen queue is empty
      </div>
      <div style={{fontSize:13,color:"#2a3a50"}}>
        Orders appear instantly when sent from POS
      </div>
    </div>
  );
}
