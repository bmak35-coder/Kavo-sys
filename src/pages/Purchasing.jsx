import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth, ROLE_META } from "../auth/AuthProvider";
import { useTenant } from "../contexts/TenantProvider";
import { useFirebaseServices } from "../firebase/FirebaseServicesProvider";
import { SupplierService, PurchaseOrderService, PO_STATUSES, PO_STATUS_CFG } from "../db/services/purchasing.js";
import { InventoryService } from "../db/services/inventory.js";
import { useLang } from "../i18n/LanguageContext.jsx";
import { isValidPhone, isValidEmail, isPositive, isNonNeg, MSG } from "../utils/validate.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Purchasing & Suppliers  ·  v1.0
   Offline-first · IndexedDB
   Future: add branchId for multi-location, connect to AP
══════════════════════════════════════════════════════ */

const C={bg:"#070c16",surf:"#0b1220",card:"#101828",bdr:"#1a2438",
  acc:"#f0a500",text:"#e8edf5",muted:"#4a6080",sub:"#7d8fa0",
  success:"#3fb950",danger:"#f85149",info:"#58a6ff",warn:"#d29922"};

const safeNum=(v)=>{const n=+v;return isFinite(n)?n:0;};
const safeArr=(v,d=[])=>Array.isArray(v)?v:d;
const CUR=(n)=>`$${safeNum(n).toFixed(2)}`;
const fmtDate=(s)=>{if(!s)return"—";try{return new Date(s+"T12:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}catch{return s;}};
const fmtDT=(s)=>{if(!s)return"—";try{return new Date(s).toLocaleString("en-US",{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"});}catch{return s;}};

const Btn=(bg,col="#000",sm=false)=>({background:bg,color:col,border:"none",borderRadius:8,padding:sm?"5px 12px":"9px 16px",cursor:"pointer",fontWeight:700,fontSize:sm?11:12,fontFamily:"inherit",transition:"opacity 0.14s",whiteSpace:"nowrap"});
const Ghost=(col=C.muted,sm=false)=>({background:"transparent",color:col,border:`1px solid ${C.bdr}`,borderRadius:8,padding:sm?"5px 11px":"8px 14px",cursor:"pointer",fontWeight:600,fontSize:sm?11:12,fontFamily:"inherit",whiteSpace:"nowrap"});
const Inp={width:"100%",background:C.card,border:`1px solid ${C.bdr}`,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
const Sel={...{width:"100%",background:C.card,border:`1px solid ${C.bdr}`,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}};

const TABS=[
  {id:"dashboard",label:"📊 Dashboard"},
  {id:"orders",   label:"📋 Purchase Orders"},
  {id:"suppliers",label:"🏢 Suppliers"},
  {id:"reports",  label:"📈 Reports"},
];

// ══════════════════════════════════════════════════════
//   MAIN COMPONENT
// ══════════════════════════════════════════════════════
export default function Purchasing({ onBack }) {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const firebaseServices = useFirebaseServices();
  const umeta = ROLE_META[user?.role] || ROLE_META.admin;

  // Use Firebase if tenant is active, otherwise use IndexedDB
  const useFirebase = Boolean(tenantId && firebaseServices);

  const { t } = useLang();

  const [tab,       setTab]       = useState("dashboard");
  const [suppliers, setSuppliers] = useState([]);
  const [pos,       setPos]       = useState([]);
  const [invItems,  setInvItems]  = useState([]);
  const [stats,     setStats]     = useState({});
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null);
  const [selPO,     setSelPO]     = useState(null);
  const [selSup,    setSelSup]    = useState(null);
  const [toast,     setToast]     = useState(null);
  const [poFilter,  setPoFilter]  = useState("All");
  const [search,    setSearch]    = useState("");
  const [supSearch, setSupSearch] = useState("");

  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),2800);};

  const reload = useCallback(async()=>{
    setLoading(true);
    try {
      if (useFirebase) {
        console.log('Loading purchasing data from Firebase');
        const [sups,allPos,items,st] = await Promise.all([
          firebaseServices.suppliers.getAll(),
          firebaseServices.purchaseOrders.getAll(),
          firebaseServices.inventory.getAll(),
          firebaseServices.purchaseOrders.getDashboardStats(),
        ]);
        setSuppliers(safeArr(sups));
        setPos(safeArr(allPos));
        setInvItems(safeArr(items));
        setStats(st||{});
        console.log('Purchasing data loaded from Firebase');
      } else {
        console.log('Loading purchasing data from localStorage');
        const [sups,allPos,items,st] = await Promise.all([
          SupplierService.getAll(),
          PurchaseOrderService.getAll(),
          InventoryService.getAll(),
          PurchaseOrderService.getDashboardStats(),
        ]);
        setSuppliers(safeArr(sups));
        setPos(safeArr(allPos));
        setInvItems(safeArr(items));
        setStats(st||{});
        console.log('Purchasing data loaded from localStorage');
      }
    } catch(e){ console.error(e); }
    setLoading(false);
  },[useFirebase, firebaseServices]);

  useEffect(()=>{ reload(); },[reload]);

  // ── Filtered POs ───────────────────────────────────
  const visiblePOs = useMemo(()=>
    pos.filter(p=>{
      const ms = poFilter==="All" || p.status===poFilter;
      const mq = !search || p.poNo?.toLowerCase().includes(search.toLowerCase())
               || p.supplierName?.toLowerCase().includes(search.toLowerCase());
      return ms && mq;
    })
  ,[pos,poFilter,search]);

  const visibleSups = useMemo(()=>
    suppliers.filter(s=>!supSearch
      || s.name?.toLowerCase().includes(supSearch.toLowerCase())
      || s.contactPerson?.toLowerCase().includes(supSearch.toLowerCase()))
  ,[suppliers,supSearch]);

  // ── PO actions ─────────────────────────────────────
  const receivePO = async(po)=>{
    if(!window.confirm(`Receive PO ${po.poNo}? This will update inventory stock.`)) return;
    try {
      if (useFirebase) {
        await firebaseServices.purchaseOrders.receive(po.id, user?.name);
      } else {
        await PurchaseOrderService.receive(po.id, user?.name);
      }
      await reload();
      showToast(`PO ${po.poNo} received — stock updated`,"ok");
    } catch(e){ showToast(e.message||"Error","err"); }
  };

  const cancelPO = async(po)=>{
    if(!window.confirm(`Cancel PO ${po.poNo}?`)) return;
    if (useFirebase) {
      await firebaseServices.purchaseOrders.cancel(po.id);
    } else {
      await PurchaseOrderService.cancel(po.id);
    }
    reload(); showToast(`PO ${po.poNo} cancelled`,"warn");
  };

  const deletePO = async(po)=>{
    if(!window.confirm(`Delete PO ${po.poNo}? This cannot be undone.`)) return;
    if (useFirebase) {
      await firebaseServices.purchaseOrders.delete(po.id);
    } else {
      await PurchaseOrderService.delete(po.id);
    }
    reload(); showToast("PO deleted","warn");
  };

  return (
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.bdr};border-radius:4px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .pu-in{animation:fadeUp 0.28s ease;}
        .pu-btn:hover{opacity:0.82;} .pu-btn{transition:opacity 0.14s;}
        .pu-tab:hover{background:#1a2438!important;}
        .pu-row:hover{background:#0d1828!important;}
        input:focus,select:focus,textarea:focus{border-color:${C.acc}!important;outline:none;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{background:C.surf,borderBottom:`2px solid ${C.acc}`,padding:"0 16px",height:54,display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
        <button className="pu-btn" onClick={onBack} style={{...Ghost(C.muted,true)}}>← Back</button>
        <div style={{width:1,height:24,background:C.bdr}}/>
        <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:900,fontSize:17,color:C.acc,letterSpacing:"0.07em"}}>KAVO<span style={{color:C.text,opacity:0.3}}>-SYS</span></span>
        <span style={{fontSize:10,fontWeight:800,color:C.muted,letterSpacing:"0.1em"}}>PURCHASING</span>

        <div style={{display:"flex",gap:3,marginLeft:6,flexWrap:"wrap"}}>
          {TABS.map(t=>(
            <button key={t.id} className="pu-tab pu-btn" onClick={()=>setTab(t.id)}
              style={{background:tab===t.id?C.acc+"22":"transparent",border:`1px solid ${tab===t.id?C.acc+"60":C.bdr}`,color:tab===t.id?C.acc:C.muted,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",transition:"all 0.14s"}}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{flex:1}}/>
        {stats.ordered>0&&(
          <div style={{background:"#58a6ff18",border:"1px solid #58a6ff40",borderRadius:20,padding:"3px 12px",fontSize:11,fontWeight:800,color:C.info}}>
            📦 {stats.ordered} Pending
          </div>
        )}
        {tab==="orders"&&<button className="pu-btn" onClick={()=>{setSelPO(null);setModal("createPO");}} style={{...Btn(C.acc)}}>+ New PO</button>}
        {tab==="suppliers"&&<button className="pu-btn" onClick={()=>{setSelSup(null);setModal("editSupplier");}} style={{...Btn(C.acc)}}>+ Add Supplier</button>}
        <div style={{background:umeta.bg,border:`1px solid ${umeta.color}40`,borderRadius:20,padding:"3px 11px",display:"flex",alignItems:"center",gap:5}}>
          <span>{umeta.icon}</span>
          <span style={{fontSize:11,fontWeight:700,color:umeta.color}}>{user?.name}</span>
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div style={{flex:1,overflowY:"auto",padding:14, paddingBottom:80}}>
        {loading ? <Spinner/> : (
          <>
            {/* ══ DASHBOARD ══ */}
            {tab==="dashboard"&&(
              <div className="pu-in">
                {/* Metric cards */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(165px,1fr))",gap:10,marginBottom:14}}>
                  {[
                    {icon:"📋",label:"Total POs",        val:stats.total||0,              col:C.info,    mono:false},
                    {icon:"📝",label:"Draft",            val:stats.draft||0,              col:C.muted,   mono:false},
                    {icon:"📦",label:"Ordered",          val:stats.ordered||0,            col:C.info,    mono:false},
                    {icon:"✅",label:"Received",         val:stats.received||0,           col:C.success, mono:false},
                    {icon:"💰",label:"Total Spend",      val:CUR(stats.totalSpend||0),    col:C.acc,     mono:true},
                    {icon:"📅",label:"This Month",       val:CUR(stats.monthSpend||0),    col:C.warn,    mono:true},
                  ].map(m=>(
                    <div key={m.label} style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:"13px 15px"}}>
                      <div style={{fontSize:18,marginBottom:5}}>{m.icon}</div>
                      <div style={{fontFamily:m.mono?"'JetBrains Mono',monospace":"inherit",fontWeight:900,fontSize:20,color:m.col,marginBottom:4}}>{m.val}</div>
                      <div style={{fontSize:11,color:C.muted}}>{m.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {/* Recent POs */}
                  <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
                    <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>📋 RECENT PURCHASE ORDERS</div>
                    {pos.slice(0,6).map(p=>{
                      const cfg=PO_STATUS_CFG[p.status]||PO_STATUS_CFG.Draft;
                      return(
                        <div key={p.id} className="pu-row" onClick={()=>{setSelPO(p);setModal("viewPO");}} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 8px",borderRadius:7,cursor:"pointer",marginBottom:2,transition:"background 0.12s"}}>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc,fontSize:12,minWidth:110}}>{p.poNo}</span>
                          <span style={{flex:1,fontSize:11,color:C.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.supplierName||"—"}</span>
                          <span style={{background:cfg.bg,color:cfg.color,borderRadius:6,padding:"2px 7px",fontSize:9,fontWeight:800,flexShrink:0}}>{cfg.icon} {p.status}</span>
                          <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc,fontSize:12,minWidth:60,textAlign:"right"}}>{CUR(p.total)}</span>
                        </div>
                      );
                    })}
                    {pos.length===0&&<EmptyMsg icon="📋" msg={t("noPOsYet")}/>}
                  </div>

                  {/* Supplier overview */}
                  <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
                    <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>🏢 SUPPLIERS ({suppliers.filter(s=>s.status!=="inactive").length} active)</div>
                    {suppliers.filter(s=>s.status!=="inactive").slice(0,6).map(s=>(
                      <div key={s.id} className="pu-row" onClick={()=>{setSelSup(s);setModal("viewSupplier");}} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 8px",borderRadius:7,cursor:"pointer",marginBottom:2,transition:"background 0.12s"}}>
                        <div style={{width:28,height:28,borderRadius:8,background:C.acc+"18",border:`1px solid ${C.acc}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>🏢</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                          <div style={{fontSize:10,color:C.muted}}>{s.contactPerson||s.phone||"—"}</div>
                        </div>
                      </div>
                    ))}
                    {suppliers.length===0&&<EmptyMsg icon="🏢" msg={t("noSuppliersYet")}/>}
                  </div>
                </div>

                {/* Monthly chart */}
                <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16,marginTop:12}}>
                  <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:14,letterSpacing:"0.04em"}}>📅 MONTHLY PURCHASE SPEND</div>
                  <MonthlyChart pos={pos} useFirebase={useFirebase} firebaseServices={firebaseServices}/>
                </div>
              </div>
            )}

            {/* ══ PURCHASE ORDERS ══ */}
            {tab==="orders"&&(
              <div className="pu-in">
                {/* Filter bar */}
                <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                  <div style={{position:"relative",flex:1,minWidth:180}}>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search PO number or supplier…" style={Inp}/>
                    {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button>}
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {["All",...PO_STATUSES].map(s=>{
                      const cfg=PO_STATUS_CFG[s]||{color:C.acc,bg:C.acc+"18"};
                      const on=poFilter===s;
                      return(
                        <button key={s} className="pu-btn" onClick={()=>setPoFilter(s)}
                          style={{background:on?(cfg.color||C.acc)+"22":"transparent",border:`1px solid ${on?(cfg.color||C.acc)+"60":C.bdr}`,color:on?(cfg.color||C.acc):C.muted,borderRadius:20,padding:"4px 12px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
                          {s==="All"?"All":`${cfg.icon||""} ${s}`}
                        </button>
                      );
                    })}
                  </div>
                  <span style={{fontSize:11,color:C.muted}}>{visiblePOs.length} PO{visiblePOs.length!==1?"s":""}</span>
                </div>

                {/* PO table */}
                {visiblePOs.length===0
                  ? <EmptyMsg icon="📋" msg={t("noPOsMatch")}/>
                  : (
                    <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,overflow:"hidden"}}>
                      {/* Header */}
                      <div style={{display:"grid",gridTemplateColumns:"130px 1fr 100px 100px 90px 100px 180px",gap:0,padding:"8px 14px",borderBottom:`1px solid ${C.bdr}`,background:"#0a1020"}}>
                        {["PO Number","Supplier","Order Date","Delivery","Items","Total","Actions"].map(h=>(
                          <div key={h} style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.08em"}}>{h}</div>
                        ))}
                      </div>
                      {visiblePOs.map((p,i)=>{
                        const cfg=PO_STATUS_CFG[p.status]||PO_STATUS_CFG.Draft;
                        return(
                          <div key={p.id} className="pu-row" style={{display:"grid",gridTemplateColumns:"130px 1fr 100px 100px 90px 100px 180px",gap:0,padding:"10px 14px",borderBottom:i<visiblePOs.length-1?`1px solid ${C.bdr}`:"none",alignItems:"center",transition:"background 0.1s"}}>
                            <div>
                              <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc,fontSize:12}}>{p.poNo}</div>
                              <span style={{background:cfg.bg,color:cfg.color,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:800}}>{cfg.icon} {p.status}</span>
                            </div>
                            <div style={{overflow:"hidden"}}>
                              <div style={{fontSize:12,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.supplierName||"—"}</div>
                              {p.notes&&<div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.notes}</div>}
                            </div>
                            <div style={{fontSize:11,color:C.sub}}>{fmtDate(p.orderDate)}</div>
                            <div style={{fontSize:11,color:p.deliveryDate&&new Date(p.deliveryDate+"T12:00")<new Date()&&p.status!=="Received"?C.danger:C.sub}}>
                              {fmtDate(p.deliveryDate)}
                            </div>
                            <div style={{fontSize:11,color:C.muted}}>{safeArr(p.items).length||"—"} items</div>
                            <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,color:C.acc,fontSize:13}}>{CUR(p.total)}</div>
                            <POActions p={p} onView={()=>{setSelPO(p);setModal("viewPO");}} onReceive={receivePO} onCancel={cancelPO} onDelete={deletePO} onEdit={()=>{setSelPO(p);setModal("createPO");}}/>
                          </div>
                        );
                      })}
                    </div>
                  )
                }
              </div>
            )}

            {/* ══ SUPPLIERS ══ */}
            {tab==="suppliers"&&(
              <div className="pu-in">
                <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
                  <input value={supSearch} onChange={e=>setSupSearch(e.target.value)} placeholder="🔍 Search suppliers…" style={{...Inp,maxWidth:300}}/>
                  <span style={{fontSize:11,color:C.muted}}>{visibleSups.length} supplier{visibleSups.length!==1?"s":""}</span>
                </div>
                {visibleSups.length===0
                  ? <EmptyMsg icon="🏢" msg={t("addSupplierHint")}/>
                  : (
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
                      {visibleSups.map(s=>(
                        <SupplierCard key={s.id} s={s} pos={pos}
                          onEdit={()=>{setSelSup(s);setModal("editSupplier");}}
                          onNewPO={()=>{setSelPO({supplierId:s.id,supplierName:s.name});setModal("createPO");}}/>
                      ))}
                    </div>
                  )
                }
              </div>
            )}

            {/* ══ REPORTS ══ */}
            {tab==="reports"&&(
              <div className="pu-in">
                <PurchaseReports pos={pos} suppliers={suppliers} useFirebase={useFirebase} firebaseServices={firebaseServices}/>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      {(modal==="createPO"||modal==="editPO")&&(
        <POFormModal
          po={selPO} suppliers={suppliers} invItems={invItems}
          onSave={async(data)=>{
            if (useFirebase) {
              if(selPO?.id && !data._isNew) await firebaseServices.purchaseOrders.update(selPO.id,data);
              else await firebaseServices.purchaseOrders.create(data);
            } else {
              if(selPO?.id && !data._isNew) await PurchaseOrderService.update(selPO.id,data);
              else await PurchaseOrderService.create(data);
            }
            reload(); setModal(null);
            showToast(selPO?.id?"PO updated":"PO created","ok");
          }}
          onClose={()=>setModal(null)}/>
      )}
      {modal==="viewPO"&&selPO&&(
        <PODetailModal
          poId={selPO.id} suppliers={suppliers}
          onClose={()=>setModal(null)}
          onReceive={async()=>{ await receivePO(selPO); setModal(null); }}
          onCancel={async()=>{ await cancelPO(selPO); setModal(null); }}
          onEdit={()=>setModal("createPO")}
          useFirebase={useFirebase}
          firebaseServices={firebaseServices}/>
      )}
      {modal==="editSupplier"&&(
        <SupplierFormModal
          supplier={selSup}
          onSave={async(data)=>{
            if (useFirebase) {
              await firebaseServices.suppliers.save({...selSup,...data});
            } else {
              await SupplierService.save({...selSup,...data});
            }
            reload(); setModal(null);
            showToast(selSup?t("supplierUpdated"):t("supplierAdded"),"ok");
          }}
          onDelete={selSup?async()=>{
            if(window.confirm(`Remove ${selSup.name}?`)){
              if (useFirebase) {
                await firebaseServices.suppliers.delete(selSup.id);
              } else {
                await SupplierService.delete(selSup.id);
              }
              reload(); setModal(null); showToast("Supplier removed","warn");
            }
          }:null}
          onClose={()=>setModal(null)}/>
      )}
      {modal==="viewSupplier"&&selSup&&(
        <SupplierDetailModal
          supplier={selSup} pos={pos}
          onEdit={()=>setModal("editSupplier")}
          onClose={()=>setModal(null)}
          onNewPO={()=>{setSelPO({supplierId:selSup.id,supplierName:selSup.name});setModal("createPO");}}/>
      )}

      {/* Toast */}
      {toast&&(
        <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:toast.type==="err"?C.danger:toast.type==="warn"?C.warn:C.success,color:"#000",fontWeight:700,fontSize:13,padding:"9px 20px",borderRadius:20,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,.4)",whiteSpace:"nowrap",pointerEvents:"none"}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ── PO ACTIONS ──────────────────────────────────────*/
function POActions({ p, onView, onReceive, onCancel, onDelete, onEdit }) {
  return (
    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      <button className="pu-btn" onClick={onView} style={{...Ghost(C.info,true)}}>View</button>
      {p.status==="Draft"&&<button className="pu-btn" onClick={onEdit} style={{...Ghost(C.muted,true)}}>Edit</button>}
      {(p.status==="Draft"||p.status==="Ordered")&&
        <button className="pu-btn" onClick={()=>onReceive(p)} style={{...Btn(C.success,"#000",true)}}>✅ Receive</button>}
      {(p.status==="Draft"||p.status==="Ordered")&&
        <button className="pu-btn" onClick={()=>onCancel(p)} style={{...Ghost(C.danger,true)}}>✕</button>}
      {(p.status==="Draft"||p.status==="Cancelled")&&
        <button className="pu-btn" onClick={()=>onDelete(p)} style={{...Ghost(C.danger,true)}}>🗑</button>}
    </div>
  );
}

/* ── PO FORM MODAL ───────────────────────────────────*/
function POFormModal({ po, suppliers, invItems, onSave, onClose }) {
  const today = new Date().toISOString().slice(0,10);
  const [supplierId,    setSupplierId]    = useState(po?.supplierId||"");
  const [supplierName,  setSupplierName]  = useState(po?.supplierName||"");
  const [orderDate,     setOrderDate]     = useState(po?.orderDate||today);
  const [deliveryDate,  setDeliveryDate]  = useState(po?.deliveryDate||"");
  const [notes,         setNotes]         = useState(po?.notes||"");
  const [items,         setItems]         = useState(()=>safeArr(po?.items).map(i=>({...i}))||[]);
  const [isNew] = useState(!po?.id||!!po?.supplierId&&!po?.poNo); // true for brand new PO

  const setSupplier=(id)=>{
    setSupplierId(id);
    const s=suppliers.find(x=>x.id===id);
    if(s) setSupplierName(s.name);
  };

  const addItem=()=>setItems(p=>[...p,{inventoryItemId:"",inventoryItemName:"",unit:"piece",qty:1,unitCost:0}]);
  const removeItem=(i)=>setItems(p=>p.filter((_,idx)=>idx!==i));
  const updateItem=(i,field,val)=>setItems(p=>p.map((r,idx)=>{
    if(idx!==i) return r;
    if(field==="inventoryItemId"){
      const inv=invItems.find(x=>x.id===val);
      return {...r,inventoryItemId:val,inventoryItemName:inv?.name||"",unit:inv?.unit||"piece",unitCost:safeNum(inv?.costPrice||0)};
    }
    return {...r,[field]:val};
  }));

  const total=items.reduce((s,i)=>s+safeNum(i.qty)*safeNum(i.unitCost),0);

  const save=()=>{
    if(!supplierId){alert("Select a supplier");return;}
    const validItems=items.filter(i=>i.inventoryItemId);
    if(validItems.length===0){alert("Add at least one item");return;}
    const badQty=validItems.find(i=>!isPositive(i.qty));
    if(badQty){alert(`Qty for "${badQty.inventoryItemName||"item"}" must be greater than 0`);return;}
    const badCost=validItems.find(i=>!isNonNeg(i.unitCost));
    if(badCost){alert(`Unit cost for "${badCost.inventoryItemName||"item"}" must be 0 or greater`);return;}
    onSave({supplierId,supplierName,orderDate,deliveryDate,notes,items:validItems,_isNew:isNew});
  };

  return (
    <PuModal title={po?.poNo?`Edit ${po.poNo}`:"New Purchase Order"} onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <div>
          <Label>SUPPLIER *</Label>
          <select value={supplierId} onChange={e=>setSupplier(e.target.value)} style={Sel}>
            <option value="">— Select Supplier —</option>
            {suppliers.filter(s=>s.status!=="inactive").map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <Label>ORDER DATE</Label>
          <input type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)} style={Inp}/>
        </div>
        <div>
          <Label>EXPECTED DELIVERY</Label>
          <input type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)} style={Inp}/>
        </div>
        <div>
          <Label>NOTES</Label>
          <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes…" style={Inp}/>
        </div>
      </div>

      {/* Line items */}
      <div style={{borderTop:`1px solid ${C.bdr}`,paddingTop:14,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:800,color:C.text,letterSpacing:"0.04em"}}>📦 LINE ITEMS</div>
          <button className="pu-btn" onClick={addItem} style={{...Btn(C.acc,undefined,true)}}>+ Add Item</button>
        </div>
        {items.length===0
          ? <div style={{textAlign:"center",padding:24,color:C.muted,fontSize:12}}>Click "+ Add Item" to add inventory items</div>
          : (
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 80px 90px 90px 24px",gap:8,marginBottom:6}}>
                {["Inventory Item","Qty","Unit Cost","Total",""].map(h=>(
                  <span key={h} style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.07em"}}>{h}</span>
                ))}
              </div>
              {items.map((it,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 80px 90px 90px 24px",gap:8,marginBottom:8,alignItems:"center"}}>
                  <select value={it.inventoryItemId} onChange={e=>updateItem(i,"inventoryItemId",e.target.value)} style={{...Sel,fontSize:12,padding:"6px 8px"}}>
                    <option value="">— Select —</option>
                    {invItems.map(inv=><option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>)}
                  </select>
                  <input type="number" min="0.01" step="0.01" value={it.qty} onChange={e=>updateItem(i,"qty",+e.target.value)} style={{...Inp,padding:"6px 8px",textAlign:"right",fontSize:12}}/>
                  <input type="number" min="0" step="0.01" value={it.unitCost} onChange={e=>updateItem(i,"unitCost",+e.target.value)} style={{...Inp,padding:"6px 8px",textAlign:"right",fontSize:12}}/>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc,fontSize:12,textAlign:"right"}}>{CUR(safeNum(it.qty)*safeNum(it.unitCost))}</div>
                  <button onClick={()=>removeItem(i)} style={{background:"transparent",border:"none",color:C.danger,cursor:"pointer",fontSize:16,padding:0}}>✕</button>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"flex-end",borderTop:`1px solid ${C.bdr}`,paddingTop:10,marginTop:4}}>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:900,fontSize:16,color:C.acc}}>Total: {CUR(total)}</span>
              </div>
            </>
          )
        }
      </div>

      <div style={{display:"flex",gap:8}}>
        <button className="pu-btn" onClick={save} style={{...Btn(C.acc),flex:1}}>💾 Save PO</button>
        <button className="pu-btn" onClick={onClose} style={{...Ghost(),flex:1}}>Cancel</button>
      </div>
    </PuModal>
  );
}

/* ── PO DETAIL MODAL ─────────────────────────────────*/
function PODetailModal({ poId, onClose, onReceive, onCancel, onEdit, useFirebase, firebaseServices }) {
  const [po, setPO] = useState(null);
  useEffect(()=>{
    if (useFirebase) {
      firebaseServices.purchaseOrders.getOne(poId).then(p=>setPO(p||null));
    } else {
      PurchaseOrderService.getOne(poId).then(p=>setPO(p||null));
    }
  },[poId, useFirebase, firebaseServices]);
  if(!po) return <PuModal title="Loading…" onClose={onClose}><Spinner small/></PuModal>;
  const cfg=PO_STATUS_CFG[po.status]||PO_STATUS_CFG.Draft;
  return (
    <PuModal title={`${cfg.icon} ${po.poNo}`} onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[
          {l:"Supplier",    v:po.supplierName||"—"},
          {l:"Status",      v:po.status},
          {l:"Order Date",  v:fmtDate(po.orderDate)},
          {l:"Delivery",    v:fmtDate(po.deliveryDate)},
          {l:"Created By",  v:po.createdBy||"—"},
          {l:"Received At", v:po.receivedAt?fmtDT(po.receivedAt):"—"},
        ].map(r=>(
          <div key={r.l} style={{background:C.bg,borderRadius:8,padding:"8px 12px"}}>
            <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.08em",marginBottom:3}}>{r.l}</div>
            <div style={{fontSize:13,fontWeight:700,color:C.text}}>{r.v}</div>
          </div>
        ))}
      </div>
      {po.notes&&<div style={{fontSize:12,color:C.muted,marginBottom:12,padding:"7px 10px",background:C.bg,borderRadius:7}}>📝 {po.notes}</div>}
      {/* Items table */}
      <div style={{background:C.bg,borderRadius:10,overflow:"hidden",marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 70px 90px 90px 90px",gap:0,padding:"8px 12px",borderBottom:`1px solid ${C.bdr}`,background:"#0a1020"}}>
          {["Item","Qty","Unit","Unit Cost","Total"].map(h=>(
            <span key={h} style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.07em"}}>{h}</span>
          ))}
        </div>
        {safeArr(po.items).map((it,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 70px 90px 90px 90px",gap:0,padding:"8px 12px",borderBottom:`1px solid ${C.bdr}`,fontSize:12}}>
            <span style={{color:C.text,fontWeight:600}}>{it.inventoryItemName||"—"}</span>
            <span style={{color:C.sub,fontFamily:"'JetBrains Mono',monospace"}}>{safeNum(it.qty).toFixed(2)}</span>
            <span style={{color:C.sub}}>{it.unit}</span>
            <span style={{color:C.sub,fontFamily:"'JetBrains Mono',monospace"}}>{CUR(it.unitCost)}</span>
            <span style={{color:C.acc,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{CUR(safeNum(it.qty)*safeNum(it.unitCost))}</span>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 12px",fontWeight:900}}>
          <span style={{color:C.muted}}>Grand Total</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace",color:C.acc,fontSize:16}}>{CUR(po.total)}</span>
        </div>
      </div>
      <div style={{display:"flex",gap:8}}>
        {(po.status==="Draft"||po.status==="Ordered")&&<button className="pu-btn" onClick={onReceive} style={{...Btn(C.success,"#000"),flex:1}}>✅ Mark as Received</button>}
        {po.status==="Draft"&&<button className="pu-btn" onClick={onEdit} style={{...Ghost(C.info)}}>✏ Edit</button>}
        {(po.status==="Draft"||po.status==="Ordered")&&<button className="pu-btn" onClick={onCancel} style={{...Ghost(C.danger)}}>🚫 Cancel</button>}
        <button className="pu-btn" onClick={onClose} style={{...Ghost()}}>Close</button>
      </div>
    </PuModal>
  );
}

/* ── SUPPLIER FIELD (must be outside SupplierFormModal to avoid remount on re-render) ──*/
function SupplierField({ label, value, onChange, type="text", ph="", error="" }) {
  return (
    <div style={{marginBottom:11}}>
      <Label>{label}</Label>
      <input type={type} value={value} onChange={onChange} placeholder={ph}
        style={{...Inp, border:`1px solid ${error ? "#f8514960" : C.bdr}`}}/>
      {error && <div style={{fontSize:10,color:"#f85149",marginTop:3}}>{error}</div>}
    </div>
  );
}

/* ── SUPPLIER FORM MODAL ─────────────────────────────*/
function SupplierFormModal({ supplier, onSave, onDelete, onClose }) {
  const [f,setF] = useState({
    name:          supplier?.name||"",
    contactPerson: supplier?.contactPerson||"",
    phone:         supplier?.phone||"",
    email:         supplier?.email||"",
    address:       supplier?.address||"",
    notes:         supplier?.notes||"",
    status:        supplier?.status||"active",
  });
  const [errors, setErrors] = useState({});
  const set=(k,v)=>{ setF(p=>({...p,[k]:v})); setErrors(e=>({...e,[k]:undefined})); };

  const validate=()=>{
    const errs={};
    if(!f.name.trim())         errs.name  = MSG.required;
    if(!isValidPhone(f.phone)) errs.phone = MSG.phone;
    if(!isValidEmail(f.email)) errs.email = MSG.email;
    return errs;
  };

  return (
    <PuModal title={supplier?"Edit Supplier":"New Supplier"} onClose={onClose}>
      <SupplierField label="SUPPLIER NAME *" value={f.name||""}          onChange={e=>set("name",e.target.value)}          ph="e.g. Fresh Foods Co."    error={errors.name}/>
      <SupplierField label="CONTACT PERSON"  value={f.contactPerson||""} onChange={e=>set("contactPerson",e.target.value)} ph="Contact name"/>
      <SupplierField label="PHONE"           value={f.phone||""}         onChange={e=>set("phone",e.target.value)}          ph="+961 1 000 000"          error={errors.phone}/>
      <SupplierField label="EMAIL"           value={f.email||""}         onChange={e=>set("email",e.target.value)}          ph="supplier@example.com" type="email" error={errors.email}/>
      <SupplierField label="ADDRESS"         value={f.address||""}       onChange={e=>set("address",e.target.value)}        ph="Street, City"/>
      <SupplierField label="NOTES"           value={f.notes||""}         onChange={e=>set("notes",e.target.value)}          ph="Any notes…"/>
      <div style={{marginBottom:14}}>
        <Label>STATUS</Label>
        <div style={{display:"flex",gap:8}}>
          {["active","inactive"].map(s=>(
            <button key={s} className="pu-btn" onClick={()=>set("status",s)}
              style={{flex:1,background:f.status===s?C.acc+"22":"transparent",border:`1px solid ${f.status===s?C.acc+"60":C.bdr}`,color:f.status===s?C.acc:C.muted,borderRadius:7,padding:"7px 0",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit"}}>
              {s.charAt(0).toUpperCase()+s.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="pu-btn" onClick={()=>{ const errs=validate(); if(Object.keys(errs).length){setErrors(errs);return;} onSave(f); }} style={{...Btn(C.acc),flex:1}}>Save</button>
        <button className="pu-btn" onClick={onClose} style={{...Ghost(),flex:1}}>Cancel</button>
        {onDelete&&<button className="pu-btn" onClick={onDelete} style={Btn(C.danger,"#fff")}>🗑</button>}
      </div>
    </PuModal>
  );
}

/* ── SUPPLIER DETAIL MODAL ───────────────────────────*/
function SupplierDetailModal({ supplier, pos, onEdit, onClose, onNewPO }) {
  const supPos = pos.filter(p=>p.supplierId===supplier.id);
  const totalSpend = supPos.filter(p=>p.status==="Received").reduce((s,p)=>s+safeNum(p.total),0);
  return (
    <PuModal title={`🏢 ${supplier.name}`} onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        {[
          {l:"Contact", v:supplier.contactPerson||"—"},
          {l:"Phone",   v:supplier.phone||"—"},
          {l:"Email",   v:supplier.email||"—"},
          {l:"Status",  v:supplier.status||"active"},
        ].map(r=>(
          <div key={r.l} style={{background:C.bg,borderRadius:8,padding:"8px 12px"}}>
            <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.08em",marginBottom:2}}>{r.l}</div>
            <div style={{fontSize:13,fontWeight:700,color:C.text}}>{r.v}</div>
          </div>
        ))}
      </div>
      {supplier.address&&<div style={{fontSize:12,color:C.muted,marginBottom:10,padding:"6px 10px",background:C.bg,borderRadius:7}}>📍 {supplier.address}</div>}
      {supplier.notes&&<div style={{fontSize:12,color:C.muted,marginBottom:10,padding:"6px 10px",background:C.bg,borderRadius:7}}>📝 {supplier.notes}</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[
          {l:"Total Orders",   v:supPos.length,              c:C.info},
          {l:"Received",       v:supPos.filter(p=>p.status==="Received").length, c:C.success},
          {l:"Total Spend",    v:CUR(totalSpend),             c:C.acc},
        ].map(m=>(
          <div key={m.l} style={{background:C.bg,borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:900,fontSize:18,color:m.c}}>{m.v}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:3}}>{m.l}</div>
          </div>
        ))}
      </div>
      {/* Recent POs for this supplier */}
      {supPos.slice(0,5).map(p=>{
        const cfg=PO_STATUS_CFG[p.status]||PO_STATUS_CFG.Draft;
        return(
          <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.bdr}`,fontSize:12}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc}}>{p.poNo}</span>
            <span style={{background:cfg.bg,color:cfg.color,borderRadius:5,padding:"1px 7px",fontSize:9,fontWeight:800}}>{cfg.icon} {p.status}</span>
            <span style={{color:C.sub}}>{fmtDate(p.orderDate)}</span>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc}}>{CUR(p.total)}</span>
          </div>
        );
      })}
      <div style={{display:"flex",gap:8,marginTop:14}}>
        <button className="pu-btn" onClick={onNewPO} style={{...Btn(C.acc),flex:1}}>+ New PO</button>
        <button className="pu-btn" onClick={onEdit} style={{...Ghost(C.info)}}>✏ Edit</button>
        <button className="pu-btn" onClick={onClose} style={Ghost()}>Close</button>
      </div>
    </PuModal>
  );
}

/* ── SUPPLIER CARD ───────────────────────────────────*/
function SupplierCard({ s, pos, onEdit, onNewPO }) {
  const supPos  = pos.filter(p=>p.supplierId===s.id);
  const spend   = supPos.filter(p=>p.status==="Received").reduce((t,p)=>t+safeNum(p.total),0);
  const pending = supPos.filter(p=>p.status==="Ordered").length;
  const inactive= s.status==="inactive";
  return (
    <div style={{background:C.card,border:`1px solid ${inactive?"#2a2a2a":C.bdr}`,borderRadius:12,padding:14,opacity:inactive?0.55:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,color:C.text,fontSize:14,marginBottom:2}}>{s.name}</div>
          {s.contactPerson&&<div style={{fontSize:11,color:C.muted}}>{s.contactPerson}</div>}
          {s.phone&&<div style={{fontSize:11,color:C.muted}}>📞 {s.phone}</div>}
        </div>
        {inactive&&<span style={{background:"#2a2a2a",color:C.muted,borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:700}}>INACTIVE</span>}
        {pending>0&&<span style={{background:C.info+"18",color:C.info,borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:800}}>📦 {pending} pending</span>}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {[
          {l:"Orders",    v:supPos.length,   c:C.info},
          {l:"Spend",     v:CUR(spend),      c:C.acc},
        ].map(m=>(
          <div key={m.l} style={{flex:1,background:C.bg,borderRadius:7,padding:"7px 10px",textAlign:"center"}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:14,color:m.c}}>{m.v}</div>
            <div style={{fontSize:9,color:C.muted,marginTop:2}}>{m.l}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:5}}>
        <button className="pu-btn" onClick={onNewPO} style={{...Btn(C.acc,undefined,true),flex:1}}>+ PO</button>
        <button className="pu-btn" onClick={onEdit} style={{...Ghost(C.muted,true),flex:1}}>Edit</button>
      </div>
    </div>
  );
}

/* ── PURCHASE REPORTS ────────────────────────────────*/
function PurchaseReports({ pos, suppliers, useFirebase, firebaseServices }) {
  const [monthly, setMonthly]   = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [spendBySup, setSpend]  = useState([]);
  useEffect(()=>{
    if (useFirebase) {
      firebaseServices.purchaseOrders.monthlyTotals(6).then(setMonthly);
      firebaseServices.purchaseOrders.topPurchasedItems(8).then(setTopItems);
      firebaseServices.purchaseOrders.spendBySupplier().then(setSpend);
    } else {
      PurchaseOrderService.monthlyTotals(6).then(setMonthly);
      PurchaseOrderService.topPurchasedItems(8).then(setTopItems);
      PurchaseOrderService.spendBySupplier().then(setSpend);
    }
  },[useFirebase, firebaseServices]);

  const received  = pos.filter(p=>p.status==="Received");
  const totalSpend= received.reduce((s,p)=>s+safeNum(p.total),0);
  const maxMonth  = Math.max(...monthly.map(m=>m.total),0.01);
  const maxSpend  = spendBySup[0]?.total||0.01;

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      {/* KPI */}
      <div style={{gridColumn:"span 2",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        {[
          {l:"Total Spend",     v:CUR(totalSpend),                  c:C.acc},
          {l:"Avg per Order",   v:CUR(received.length?totalSpend/received.length:0), c:C.info},
          {l:"Total Suppliers", v:suppliers.filter(s=>s.status!=="inactive").length, c:C.success},
          {l:"Received POs",    v:received.length,                  c:C.success},
        ].map(m=>(
          <div key={m.l} style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:900,fontSize:18,color:m.c,marginBottom:3}}>{m.v}</div>
            <div style={{fontSize:11,color:C.muted}}>{m.l}</div>
          </div>
        ))}
      </div>

      {/* Monthly spend */}
      <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
        <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:14,letterSpacing:"0.04em"}}>📅 MONTHLY SPEND</div>
        {monthly.map(m=>(
          <div key={m.month} style={{marginBottom:9}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
              <span style={{color:C.sub}}>{m.month}</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc}}>{CUR(m.total)}</span>
            </div>
            <div style={{height:5,background:C.bg,borderRadius:3}}>
              <div style={{height:"100%",width:`${(m.total/maxMonth)*100}%`,background:C.acc,borderRadius:3,transition:"width 0.4s"}}/>
            </div>
          </div>
        ))}
      </div>

      {/* Spend by supplier */}
      <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
        <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:14,letterSpacing:"0.04em"}}>🏢 SPEND BY SUPPLIER</div>
        {spendBySup.length===0
          ? <EmptyMsg icon="🏢" msg="No received POs yet"/>
          : spendBySup.map((s,i)=>{
            const COLS=["#f0a500","#58a6ff","#3fb950","#f85149","#a78bfa","#fb923c"];
            const col=COLS[i%COLS.length];
            return(
              <div key={s.supplierId} style={{marginBottom:9}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                  <span style={{color:C.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{s.supplierName||"Unknown"}</span>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:col,marginLeft:8}}>{CUR(s.total)}</span>
                </div>
                <div style={{height:5,background:C.bg,borderRadius:3}}>
                  <div style={{height:"100%",width:`${(s.total/maxSpend)*100}%`,background:col,borderRadius:3}}/>
                </div>
              </div>
            );
          })
        }
      </div>

      {/* Top purchased items */}
      <div style={{gridColumn:"span 2",background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
        <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>📦 MOST PURCHASED ITEMS</div>
        {topItems.length===0
          ? <EmptyMsg icon="📦" msg="No received POs yet"/>
          : (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
              {topItems.map((it,i)=>(
                <div key={it.id} style={{background:C.bg,borderRadius:9,padding:"10px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{fontSize:10,color:C.muted,fontFamily:"monospace",minWidth:16}}>#{i+1}</span>
                    <div style={{fontWeight:700,color:C.text,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.name}</div>
                  </div>
                  <div style={{fontSize:11,color:C.muted}}>{safeNum(it.qty).toFixed(1)} units ordered</div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,color:C.acc,fontSize:13,marginTop:3}}>{CUR(it.spend)}</div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

/* ── MONTHLY CHART ───────────────────────────────────*/
function MonthlyChart({ pos, useFirebase, firebaseServices }) {
  const [data, setData] = useState([]);
  useEffect(()=>{ 
    if (useFirebase) {
      firebaseServices.purchaseOrders.monthlyTotals(6).then(setData);
    } else {
      PurchaseOrderService.monthlyTotals(6).then(setData);
    }
  },[useFirebase, firebaseServices]);
  const max = Math.max(...data.map(d=>d.total), 0.01);
  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-end",gap:8,height:100}}>
        {data.map(d=>(
          <div key={d.month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            {d.total>0&&<div style={{fontSize:9,color:C.acc,fontFamily:"monospace"}}>{CUR(d.total)}</div>}
            <div style={{width:"100%",height:`${Math.max((d.total/max)*84,d.total>0?4:1)}px`,background:d.total>0?C.acc:"#1e2d4a22",borderRadius:"3px 3px 0 0",marginTop:"auto"}}/>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        {data.map(d=>(
          <div key={d.month} style={{flex:1,textAlign:"center",fontSize:9,color:C.muted}}>{d.month.slice(5)}</div>
        ))}
      </div>
    </div>
  );
}

/* ── SHARED COMPONENTS ───────────────────────────────*/
function PuModal({ title, onClose, children, wide }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9000,padding:16}}>
      <div style={{background:"#0d1525",border:`1px solid ${C.bdr}`,borderRadius:16,padding:"22px 20px",width:wide?680:440,maxWidth:"96vw",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <span style={{fontWeight:800,fontSize:15,color:C.text}}>{title}</span>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20,padding:0,lineHeight:1}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
const Label=({children})=><div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:"0.08em",marginBottom:5}}>{children}</div>;
function EmptyMsg({ icon, msg }) {
  return <div style={{textAlign:"center",padding:"28px 20px",color:C.muted}}><div style={{fontSize:32,marginBottom:8,opacity:0.3}}>{icon}</div><div style={{fontSize:12}}>{msg}</div></div>;
}
function Spinner({ small }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:small?12:60}}>
      <div style={{width:24,height:24,border:`2px solid ${C.bdr}`,borderTopColor:C.acc,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    </div>
  );
}
