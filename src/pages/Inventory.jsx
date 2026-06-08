import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth, ROLE_META } from "../auth/AuthProvider";
import { useTenant } from "../contexts/TenantProvider";
import { useFirebaseServices } from "../firebase/FirebaseServicesProvider";
import {
  InventoryService, RecipeService, StockLogService,
  LOG_TYPES, UNITS, unitLabel,
} from "../db/services/inventory.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Inventory & Stock Management  ·  v1.0
   Offline-first · IndexedDB
   Structure ready for multi-branch (add branchId filter)
══════════════════════════════════════════════════════ */

// ─── DESIGN TOKENS ────────────────────────────────────
const C={bg:"#070c16",surf:"#0b1220",card:"#101828",bdr:"#1a2438",
  acc:"#f0a500",text:"#e8edf5",muted:"#4a6080",sub:"#7d8fa0",
  success:"#3fb950",danger:"#f85149",info:"#58a6ff",warn:"#d29922",warn2:"#fb923c"};
const safeNum=(v)=>{const n=+v;return isFinite(n)?n:0;};
const safeArr=(v,d=[])=>Array.isArray(v)?v:d;
const CUR=(n)=>`$${safeNum(n).toFixed(2)}`;
const fmtDate=(iso)=>{try{return new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}catch{return"—";}};
const fmtDT=(iso)=>{try{return new Date(iso).toLocaleString("en-US",{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"});}catch{return"—";}};

// ─── SHARED STYLE HELPERS ─────────────────────────────
const Btn=(bg,col="#000",sm=false)=>({
  background:bg,color:col,border:"none",borderRadius:8,
  padding:sm?"5px 11px":"9px 16px",cursor:"pointer",
  fontWeight:700,fontSize:sm?11:12,fontFamily:"inherit",transition:"opacity 0.14s",
});
const Ghost=(col=C.muted,sm=false)=>({
  background:"transparent",color:col,
  border:`1px solid ${C.bdr}`,borderRadius:8,
  padding:sm?"5px 11px":"8px 14px",cursor:"pointer",
  fontWeight:600,fontSize:sm?11:12,fontFamily:"inherit",
});
const Inp={width:"100%",background:C.card,border:`1px solid ${C.bdr}`,
  borderRadius:8,padding:"8px 12px",color:C.text,fontSize:13,
  fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
const Sel={...{width:"100%",background:C.card,border:`1px solid ${C.bdr}`,
  borderRadius:8,padding:"8px 12px",color:C.text,fontSize:13,
  fontFamily:"inherit",outline:"none",boxSizing:"border-box"}};

const TABS=[
  {id:"dashboard",label:"📊 Dashboard"},
  {id:"items",    label:"📦 Stock Items"},
  {id:"recipes",  label:"🍳 Recipes"},
  {id:"logs",     label:"📋 Logs"},
  {id:"reports",  label:"📈 Reports"},
];

const INV_CATS=["Beverages","Dairy","Meat","Produce","Dry Goods","Packaging","Cleaning","Other"];
const ALERT_COLORS={ok:C.success,low:C.warn,critical:C.danger,out:"#9ca3af"};

function stockStatus(item){
  const cur=safeNum(item.currentStock), min=safeNum(item.minStock);
  if(cur<=0) return "out";
  if(min>0 && cur<=min) return "critical";
  if(min>0 && cur<=min*2) return "low";
  return "ok";
}

// ══════════════════════════════════════════════════════
//   MAIN COMPONENT
// ══════════════════════════════════════════════════════
export default function Inventory({ onBack, onNavigate = () => {} }) {
  const { user, can } = useAuth();
  const { tenantId } = useTenant();
  const firebaseServices = useFirebaseServices();
  
  // Use Firebase if tenant is active, otherwise use IndexedDB
  const useFirebase = Boolean(tenantId && firebaseServices);

  const isAdmin   = user?.role === "admin";
  const isKitchen = user?.role === "kitchen";
  const umeta     = ROLE_META[user?.role] || ROLE_META.cashier;

  const [tab,      setTab]      = useState(isKitchen?"items":"dashboard");
  const [items,    setItems]    = useState([]);
  const [logs,     setLogs]     = useState([]);
  const [todayUse, setTodayUse] = useState([]);
  const [stats,    setStats]    = useState({total:0,low:0,out:0,totalValue:0,items:[]});
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [catFil,   setCatFil]   = useState("All");
  const [modal,    setModal]    = useState(null); // "addItem"|"editItem"|"addStock"|"adjust"|"waste"|"recipe"|"logs"
  const [selItem,  setSelItem]  = useState(null);
  const [toast,    setToast]    = useState(null);
  const [menuItems,setMenuItems]= useState([]);

  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),2600);};

  // ── Load data ───────────────────────────────────────
  const reload = useCallback(async()=>{
    setLoading(true);
    try {
      if (useFirebase) {
        console.log('Loading inventory from Firebase');
        const [allItems, allLogs, usage, st] = await Promise.all([
          firebaseServices.inventory.getAll(),
          firebaseServices.stockLogs.getRecent(200),
          firebaseServices.stockLogs.getTodayUsage(),
          firebaseServices.inventory.getDashboardStats(),
        ]);
        setItems(safeArr(allItems));
        setLogs(safeArr(allLogs));
        setTodayUse(safeArr(usage));
        setStats(st||{total:0,low:0,out:0,totalValue:0,items:[]});
        console.log('Inventory loaded from Firebase');
      } else {
        console.log('Loading inventory from localStorage');
        const [allItems,allLogs,usage,st] = await Promise.all([
          InventoryService.getAll(),
          StockLogService.getRecent(200),
          StockLogService.getTodayUsage(),
          InventoryService.getDashboardStats(),
        ]);
        setItems(safeArr(allItems));
        setLogs(safeArr(allLogs));
        setTodayUse(safeArr(usage));
        setStats(st||{total:0,low:0,out:0,totalValue:0,items:[]});
        console.log('Inventory loaded from localStorage');
      }
    } catch(e){ console.error(e); }
    setLoading(false);
  },[useFirebase, firebaseServices]);

  useEffect(()=>{ reload(); },[reload]);

  // ── Load menu items for recipe builder ──────────────
  useEffect(()=>{
    (async()=>{
      try{
        const {db} = await import("../db/db.js");
        const m = await db.menuItems.toArray();
        setMenuItems(safeArr(m));
      }catch{}
    })();
  },[]);

  // ── Filtered items ──────────────────────────────────
  const visible = useMemo(()=>
    items.filter(i=>{
      const ms = catFil==="All" || i.category===catFil;
      const mq = !search || i.name?.toLowerCase().includes(search.toLowerCase())
               || i.sku?.toLowerCase().includes(search.toLowerCase());
      if(isKitchen){ const s=stockStatus(i); return ms && mq && (s==="low"||s==="critical"||s==="out"); }
      return ms && mq;
    })
  ,[items,catFil,search,isKitchen]);

  const lowItems  = items.filter(i=>["critical","out"].includes(stockStatus(i)));

  return (
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.bdr};border-radius:4px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .iv-in{animation:fadeUp 0.28s ease;}
        .iv-btn:hover{opacity:0.82;} .iv-btn{transition:opacity 0.14s;}
        .iv-tab:hover{background:#1a2438!important;}
        input:focus,select:focus{border-color:${C.acc}!important;outline:none;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{background:C.surf,borderBottom:`2px solid ${C.acc}`,padding:"0 16px",height:54,display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
        <button className="iv-btn" onClick={onBack} style={{...Ghost(C.muted,true)}}>← POS</button>
        <div style={{width:1,height:24,background:C.bdr}}/>
        <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:900,fontSize:17,color:C.acc,letterSpacing:"0.07em"}}>KAVO<span style={{color:C.text,opacity:0.3}}>-SYS</span></span>
        <span style={{fontSize:10,fontWeight:800,color:C.muted,letterSpacing:"0.1em"}}>INVENTORY</span>

        {/* Tabs */}
        <div style={{display:"flex",gap:3,marginLeft:6,flexWrap:"wrap"}}>
          {TABS.filter(t=>!isKitchen||(t.id==="items")).map(t=>(
            <button key={t.id} className="iv-tab iv-btn" onClick={()=>setTab(t.id)}
              style={{background:tab===t.id?C.acc+"22":"transparent",border:`1px solid ${tab===t.id?C.acc+"60":C.bdr}`,color:tab===t.id?C.acc:C.muted,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",transition:"all 0.14s"}}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{flex:1}}/>

        {/* Alert badge */}
        {lowItems.length>0&&(
          <div style={{background:"#f8514918",border:"1px solid #f8514950",borderRadius:20,padding:"3px 12px",fontSize:11,fontWeight:800,color:C.danger,display:"flex",alignItems:"center",gap:5}}>
            ⚠ {lowItems.length} Alert{lowItems.length>1?"s":""}
          </div>
        )}

        {/* Purchasing button (admin only) */}
        {isAdmin && (
          <button className="iv-btn" onClick={()=>onNavigate("purchasing")} style={{...Ghost(C.acc,true),border:`1px solid ${C.acc}40`}}>🛒 Purchasing</button>
        )}

        {/* Add item button (admin only) */}
        {isAdmin && tab==="items" && (
          <button className="iv-btn" onClick={()=>{setSelItem(null);setModal("addItem");}} style={{...Btn(C.acc)}}>+ Add Item</button>
        )}

        {/* User badge */}
        <div style={{background:umeta.bg,border:`1px solid ${umeta.color}40`,borderRadius:20,padding:"3px 11px",display:"flex",alignItems:"center",gap:5}}>
          <span style={{fontSize:12}}>{umeta.icon}</span>
          <span style={{fontSize:11,fontWeight:700,color:umeta.color}}>{user?.name}</span>
        </div>
      </header>

      {/* ═══ CONTENT ═══ */}
      <div style={{flex:1,overflowY:"auto",padding:14, paddingBottom:80}}>
        {loading ? <LoadingState/> : (
          <>
            {/* ══ DASHBOARD ══ */}
            {tab==="dashboard" && (
              <div className="iv-in">
                {/* Metric cards */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:10,marginBottom:14}}>
                  {[
                    {icon:"📦",label:"Total Items",    val:stats.total,          col:C.info,  mono:false},
                    {icon:"💰",label:"Stock Value",    val:CUR(stats.totalValue), col:C.acc,   mono:true},
                    {icon:"⚠",label:"Low Stock",      val:stats.low,            col:C.warn,  mono:false},
                    {icon:"🚫",label:"Out of Stock",   val:stats.out,            col:C.danger,mono:false},
                    {icon:"🔥",label:"Used Today",     val:todayUse.length+" items",col:C.success,mono:false},
                  ].map(m=>(
                    <div key={m.label} style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:"14px 16px"}}>
                      <div style={{fontSize:18,marginBottom:5}}>{m.icon}</div>
                      <div style={{fontFamily:m.mono?"'JetBrains Mono',monospace":"inherit",fontWeight:900,fontSize:20,color:m.col,marginBottom:4}}>{m.val}</div>
                      <div style={{fontSize:11,color:C.muted}}>{m.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  {/* Low stock alerts */}
                  <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
                    <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>⚠ STOCK ALERTS</div>
                    {lowItems.length===0
                      ? <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:20}}>✅ All items well-stocked</div>
                      : lowItems.slice(0,8).map(item=>{
                          const st=stockStatus(item);
                          const col=ALERT_COLORS[st];
                          return(
                            <div key={item.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.bdr}`}}>
                              <div>
                                <div style={{fontSize:12,fontWeight:700,color:C.text}}>{item.name}</div>
                                <div style={{fontSize:10,color:C.muted}}>{item.category} · min {unitLabel(item.minStock,item.unit)}</div>
                              </div>
                              <div style={{textAlign:"right"}}>
                                <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,color:col,fontSize:13}}>{unitLabel(item.currentStock,item.unit)}</div>
                                <div style={{fontSize:9,color:col,fontWeight:700,textTransform:"uppercase"}}>{st==="out"?"Out of Stock":st}</div>
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>

                  {/* Today's usage */}
                  <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
                    <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>🔥 TODAY'S USAGE</div>
                    {todayUse.length===0
                      ? <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:20}}>No usage recorded today</div>
                      : todayUse.slice(0,8).map((u,i)=>{
                          const maxQ=todayUse[0]?.total||1;
                          return(
                            <div key={u.itemId} style={{marginBottom:8}}>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                                <span style={{color:C.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{u.name}</span>
                                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc,flexShrink:0,marginLeft:8}}>{safeNum(u.total).toFixed(1)}</span>
                              </div>
                              <div style={{height:4,background:C.bg,borderRadius:2}}>
                                <div style={{height:"100%",width:`${(u.total/maxQ)*100}%`,background:C.acc,borderRadius:2}}/>
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                </div>

                {/* Stock value by category */}
                <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
                  <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>💰 STOCK VALUE BY CATEGORY</div>
                  <CategoryValueChart items={items}/>
                </div>
              </div>
            )}

            {/* ══ STOCK ITEMS ══ */}
            {tab==="items" && (
              <div className="iv-in">
                {/* Filters */}
                <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                  <div style={{position:"relative",flex:1,minWidth:180}}>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search items or SKU…" style={{...Inp}}/>
                    {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button>}
                  </div>
                  <select value={catFil} onChange={e=>setCatFil(e.target.value)} style={{...Sel,width:140}}>
                    <option value="All">All Categories</option>
                    {INV_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <span style={{fontSize:11,color:C.muted}}>{visible.length} item{visible.length!==1?"s":""}</span>
                </div>

                {/* Items table */}
                {visible.length===0
                  ? <EmptyInventory isAdmin={isAdmin} onAdd={()=>setModal("addItem")}/>
                  : (
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
                      {visible.map(item=>(
                        <InventoryCard key={item.id} item={item} isAdmin={isAdmin}
                          onAddStock={()=>{setSelItem(item);setModal("addStock");}}
                          onAdjust={()=>{setSelItem(item);setModal("adjust");}}
                          onWaste={()=>{setSelItem(item);setModal("waste");}}
                          onEdit={()=>{setSelItem(item);setModal("editItem");}}
                          onLogs={()=>{setSelItem(item);setModal("logs");}}
                        />
                      ))}
                    </div>
                  )
                }
              </div>
            )}

            {/* ══ RECIPES ══ */}
            {tab==="recipes" && !isKitchen && (
              <div className="iv-in">
                <div style={{fontSize:12,color:C.muted,marginBottom:14,padding:"8px 12px",background:C.card,borderRadius:8,border:`1px solid ${C.bdr}`}}>
                  📌 Recipes define which inventory ingredients get deducted when an order is paid. Assign ingredients to each menu item.
                </div>
                <RecipeManager menuItems={menuItems} inventoryItems={items} onUpdate={reload} useFirebase={useFirebase} firebaseServices={firebaseServices}/>
              </div>
            )}

            {/* ══ LOGS ══ */}
            {tab==="logs" && !isKitchen && (
              <div className="iv-in">
                <StockLogsView logs={logs}/>
              </div>
            )}

            {/* ══ REPORTS ══ */}
            {tab==="reports" && isAdmin && (
              <div className="iv-in">
                <InventoryReports items={items} logs={logs} todayUse={todayUse}/>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      {modal==="addItem" && (
        <ItemFormModal title="Add Inventory Item" item={null}
          onSave={async(data)=>{ 
            if (useFirebase) {
              await firebaseServices.inventory.save(data);
            } else {
              await InventoryService.save(data);
            }
            reload(); setModal(null); showToast("Item added"); 
          }}
          onClose={()=>setModal(null)}/>
      )}
      {modal==="editItem" && selItem && (
        <ItemFormModal title="Edit Item" item={selItem}
          onSave={async(data)=>{ 
            if (useFirebase) {
              await firebaseServices.inventory.save({...selItem,...data});
            } else {
              await InventoryService.save({...selItem,...data});
            }
            reload(); setModal(null); showToast("Item updated"); 
          }}
          onClose={()=>setModal(null)}
          onDelete={isAdmin?async()=>{ 
            if (useFirebase) {
              await firebaseServices.inventory.delete(selItem.id);
            } else {
              await InventoryService.delete(selItem.id);
            }
            reload(); setModal(null); showToast("Item deleted","warn"); 
          }:null}/>
      )}
      {modal==="addStock" && selItem && (
        <StockActionModal title="Add Stock" item={selItem} action="add"
          onSave={async(qty,note)=>{ 
            if (useFirebase) {
              await firebaseServices.inventory.addStock(selItem.id,qty,note,user?.name);
            } else {
              await InventoryService.addStock(selItem.id,qty,note,user?.name);
            }
            reload(); setModal(null); showToast(`+${qty} ${selItem.unit} added`); 
          }}
          onClose={()=>setModal(null)}/>
      )}
      {modal==="adjust" && selItem && (
        <StockActionModal title="Adjust Stock" item={selItem} action="adjust"
          onSave={async(qty,note)=>{ 
            const before_=selItem.currentStock; 
            if (useFirebase) {
              await firebaseServices.inventory.adjustStock(selItem.id,qty,note,user?.name);
            } else {
              await InventoryService.adjustStock(selItem.id,qty,note,user?.name);
            }
            reload(); setModal(null); showToast("Stock adjusted"); 
          }}
          onClose={()=>setModal(null)}/>
      )}
      {modal==="waste" && selItem && (
        <StockActionModal title="Log Waste" item={selItem} action="waste"
          onSave={async(qty,note)=>{ 
            if (useFirebase) {
              await firebaseServices.inventory.logWaste(selItem.id,qty,note,user?.name);
            } else {
              await InventoryService.logWaste(selItem.id,qty,note,user?.name);
            }
            reload(); setModal(null); showToast("Waste logged","warn"); 
          }}
          onClose={()=>setModal(null)}/>
      )}
      {modal==="logs" && selItem && (
        <ItemLogsModal item={selItem} onClose={()=>setModal(null)} useFirebase={useFirebase} firebaseServices={firebaseServices}/>
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

/* ══════════════════════════════════════════════════════
   INVENTORY CARD
══════════════════════════════════════════════════════ */
function InventoryCard({ item, isAdmin, onAddStock, onAdjust, onWaste, onEdit, onLogs }) {
  const st    = stockStatus(item);
  const col   = ALERT_COLORS[st];
  const pct   = item.minStock>0 ? Math.min(100,(item.currentStock/Math.max(item.minStock*3,1))*100) : 100;
  const barCol= st==="ok"?C.success:st==="low"?C.warn:C.danger;

  return (
    <div style={{background:C.card,border:`1.5px solid ${st!=="ok"?col+"50":C.bdr}`,borderLeft:`4px solid ${col}`,borderRadius:12,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,color:C.text,fontSize:14,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
          <div style={{fontSize:10,color:C.muted}}>{item.sku&&`SKU: ${item.sku} · `}{item.category||"—"}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:900,fontSize:17,color:col}}>{safeNum(item.currentStock).toFixed(item.unit==="piece"?0:1)}</div>
          <div style={{fontSize:10,color:col,fontWeight:700}}>{item.unit}</div>
        </div>
      </div>

      {/* Stock bar */}
      <div style={{height:4,background:C.bg,borderRadius:2,marginBottom:8}}>
        <div style={{height:"100%",width:`${pct}%`,background:barCol,borderRadius:2,transition:"width 0.3s"}}/>
      </div>

      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:10}}>
        <span>Min: {unitLabel(item.minStock,item.unit)}</span>
        {item.costPrice>0&&<span>Cost: {CUR(item.costPrice)}/{item.unit}</span>}
        {item.supplier&&<span>📦 {item.supplier}</span>}
      </div>

      {/* Expiry */}
      {item.expiryDate&&(
        <div style={{fontSize:10,color:new Date(item.expiryDate)<new Date()?C.danger:C.warn,marginBottom:8}}>
          ⏱ Exp: {fmtDate(item.expiryDate)}
        </div>
      )}

      {/* Actions */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {isAdmin&&<button className="iv-btn" onClick={onAddStock} style={{...Btn(C.success,"#000",true)}}>+ Add</button>}
        {isAdmin&&<button className="iv-btn" onClick={onAdjust}  style={{...Ghost(C.info,true)}}>✏ Adjust</button>}
        {isAdmin&&<button className="iv-btn" onClick={onWaste}   style={{...Ghost(C.warn,true)}}>🗑 Waste</button>}
        {isAdmin&&<button className="iv-btn" onClick={onEdit}    style={{...Ghost(C.muted,true)}}>⚙ Edit</button>}
        <button className="iv-btn" onClick={onLogs} style={{...Ghost(C.muted,true),marginLeft:"auto"}}>📋 Logs</button>
      </div>
    </div>
  );
}

/* ── ITEM FORM MODAL ─────────────────────────────────*/
/* ── InvFld: defined at MODULE LEVEL (outside ItemFormModal) ──────────
   If defined inside ItemFormModal, React sees a new function type on every
   render → unmount+remount → input loses focus after each character.
   Passing (f, set) as props keeps component identity stable across renders. */
function InvFld({ label, k, type, ph, f, set }) {
  return (
    <div style={{marginBottom:12}}>
      <label style={{display:"block",fontSize:10,color:C.muted,fontWeight:700,
                     letterSpacing:"0.08em",marginBottom:5}}>{label}</label>
      <input
        type={type||"text"}
        value={f[k]||""}
        onChange={e => set(k, e.target.value)}
        placeholder={ph||""}
        style={Inp}
      />
    </div>
  );
}

function ItemFormModal({ title, item, onSave, onClose, onDelete }) {
  const [f, setF] = useState({
    name:         item?.name||"",
    sku:          item?.sku||"",
    category:     item?.category||"Beverages",
    unit:         item?.unit||"piece",
    currentStock: item?.currentStock??0,
    minStock:     item?.minStock??0,
    costPrice:    item?.costPrice??0,
    supplier:     item?.supplier||"",
    expiryDate:   item?.expiryDate||"",
    notes:        item?.notes||"",
  });
  // useCallback so set reference is stable — form never resets on parent re-render
  const set = useCallback((k, v) => setF(prev => ({...prev, [k]: v})), []);

  return (
    <InvModal title={title} onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <InvFld label="ITEM NAME *"          k="name"         ph="e.g. Coffee Beans" f={f} set={set}/>
          <InvFld label="SKU / CODE"           k="sku"          ph="e.g. CB-001"       f={f} set={set}/>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:10,color:C.muted,fontWeight:700,letterSpacing:"0.08em",marginBottom:5}}>CATEGORY</label>
            <select value={f.category} onChange={e=>set("category",e.target.value)} style={Sel}>
              {INV_CATS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:10,color:C.muted,fontWeight:700,letterSpacing:"0.08em",marginBottom:5}}>UNIT</label>
            <select value={f.unit} onChange={e=>set("unit",e.target.value)} style={Sel}>
              {UNITS.map(u=><option key={u}>{u}</option>)}
            </select>
          </div>
          <InvFld label="SUPPLIER"             k="supplier"     ph="Supplier name"     f={f} set={set}/>
        </div>
        <div>
          <InvFld label="CURRENT STOCK"        k="currentStock" type="number" ph="0"   f={f} set={set}/>
          <InvFld label="MIN STOCK ALERT"      k="minStock"     type="number" ph="0"   f={f} set={set}/>
          <InvFld label="COST PRICE (per unit)"k="costPrice"    type="number" ph="0.00" f={f} set={set}/>
          <InvFld label="EXPIRY DATE (optional)"k="expiryDate"  type="date"            f={f} set={set}/>
          <InvFld label="NOTES"                k="notes"        ph="Any notes…"        f={f} set={set}/>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button className="iv-btn" onClick={()=>{ if(!f.name.trim()){alert("Name required");return;} onSave(f); }} style={{...Btn(C.acc),flex:1}}>Save</button>
        <button className="iv-btn" onClick={onClose} style={{...Ghost(),flex:1}}>Cancel</button>
        {onDelete&&<button className="iv-btn" onClick={()=>{if(confirm("Delete this item and all its logs?")) onDelete();}} style={Btn(C.danger,"#fff")}>🗑</button>}
      </div>
    </InvModal>
  );
}

/* ── STOCK ACTION MODAL ──────────────────────────────*/
function StockActionModal({ title, item, action, onSave, onClose }) {
  const [qty,  setQty]  = useState("");
  const [note, setNote] = useState("");
  const isAdjust = action==="adjust";
  const hint = isAdjust ? `Current: ${safeNum(item.currentStock)} ${item.unit}` : "";

  return (
    <InvModal title={title} onClose={onClose}>
      <div style={{background:C.bg,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12}}>
        <div style={{fontWeight:700,color:C.text,marginBottom:2}}>{item.name}</div>
        <div style={{color:C.muted}}>Current stock: <span style={{color:C.acc,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{safeNum(item.currentStock).toFixed(2)} {item.unit}</span></div>
      </div>
      <div style={{marginBottom:12}}>
        <label style={{display:"block",fontSize:10,color:C.muted,fontWeight:700,letterSpacing:"0.08em",marginBottom:5}}>
          {isAdjust?"NEW STOCK LEVEL":"QUANTITY TO "+(action==="waste"?"WASTE":"ADD")} ({item.unit})
          {hint&&<span style={{color:C.sub,marginLeft:6,fontWeight:400}}>{hint}</span>}
        </label>
        <input type="number" min="0" step="0.01" value={qty} onChange={e=>setQty(e.target.value)}
          placeholder={isAdjust?`New total in ${item.unit}`:`Amount in ${item.unit}`}
          style={{...Inp,fontFamily:"'JetBrains Mono',monospace",fontSize:15}}/>
      </div>
      {!isAdjust&&qty&&(
        <div style={{marginBottom:12,padding:"6px 12px",borderRadius:8,background:action==="add"?"#0d2010":"#200808",border:`1px solid ${action==="add"?"#3fb95030":"#f8514930"}`,fontSize:12,color:action==="add"?C.success:C.danger,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>
          {action==="add"?"":"−"}{safeNum(qty).toFixed(2)} {item.unit} → New total: {(safeNum(item.currentStock)+(action==="add"?safeNum(qty):-safeNum(qty))).toFixed(2)} {item.unit}
        </div>
      )}
      <div style={{marginBottom:16}}>
        <label style={{display:"block",fontSize:10,color:C.muted,fontWeight:700,letterSpacing:"0.08em",marginBottom:5}}>NOTE (optional)</label>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Reason, supplier, etc." style={Inp}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="iv-btn" onClick={()=>{if(!qty){alert("Enter quantity");return;} onSave(safeNum(qty),note);}}
          style={{...Btn(action==="add"?C.success:action==="waste"?C.warn:C.info,"#000"),flex:1}}>
          {action==="add"?"+ Add Stock":action==="waste"?"Log Waste":"Adjust Stock"}
        </button>
        <button className="iv-btn" onClick={onClose} style={{...Ghost(),flex:1}}>Cancel</button>
      </div>
    </InvModal>
  );
}

/* ── ITEM LOGS MODAL ─────────────────────────────────*/
function ItemLogsModal({ item, onClose, useFirebase, firebaseServices }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{
    if (useFirebase) {
      firebaseServices.stockLogs.getByItem(item.id).then(l=>{setLogs(safeArr(l));setLoading(false);});
    } else {
      StockLogService.getByItem(item.id).then(l=>{setLogs(safeArr(l));setLoading(false);});
    }
  },[item.id, useFirebase, firebaseServices]);
  const TYPE_COL={add:C.success,deduct:C.info,adjust:C.warn,waste:C.danger,transfer:"#a78bfa"};
  return (
    <InvModal title={`📋 Logs — ${item.name}`} onClose={onClose} wide>
      {loading ? <LoadingState small/> : logs.length===0
        ? <div style={{textAlign:"center",color:C.muted,padding:30,fontSize:13}}>No logs yet</div>
        : (
          <div style={{maxHeight:380,overflowY:"auto"}}>
            {logs.map((l,i)=>(
              <div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:`1px solid ${C.bdr}`,fontSize:12}}>
                <span style={{background:(TYPE_COL[l.type]||C.muted)+"20",color:TYPE_COL[l.type]||C.muted,borderRadius:6,padding:"2px 8px",fontWeight:700,fontSize:10,letterSpacing:"0.05em",flexShrink:0,alignSelf:"center"}}>{(l.type||"—").toUpperCase()}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:C.text,fontWeight:600}}>
                    {l.type===LOG_TYPES.DEDUCT?"-":l.type===LOG_TYPES.ADD?"+":""}{safeNum(l.qty).toFixed(2)} {item.unit}
                    <span style={{color:C.muted,fontWeight:400,marginLeft:8}}>{l.before?.toFixed(2)} → {l.after?.toFixed(2)}</span>
                  </div>
                  {l.note&&<div style={{color:C.muted,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.note}</div>}
                </div>
                <div style={{color:C.muted,fontSize:11,flexShrink:0}}>{fmtDT(l.createdAt)}</div>
              </div>
            ))}
          </div>
        )
      }
    </InvModal>
  );
}

/* ── RECIPE MANAGER ──────────────────────────────────*/
function RecipeManager({ menuItems, inventoryItems, onUpdate, useFirebase, firebaseServices }) {
  const [selMenu,   setSelMenu]   = useState(null);
  const [recipe,    setRecipe]    = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState("");

  const filteredMenu = menuItems.filter(m=>!search||m.name.toLowerCase().includes(search.toLowerCase()));

  const loadRecipe = async(menuItem)=>{
    setSelMenu(menuItem);
    if (useFirebase) {
      const r = await firebaseServices.recipes.get(menuItem.id);
      setRecipe(safeArr(r.ingredients));
    } else {
      const r = await RecipeService.get(menuItem.id);
      setRecipe(safeArr(r.ingredients));
    }
  };

  const addIngredient = ()=>setRecipe(p=>[...p,{inventoryItemId:"",inventoryItemName:"",qty:1,unit:"g"}]);

  const updateIng=(i,field,val)=>{
    setRecipe(p=>p.map((r,idx)=>{
      if(idx!==i) return r;
      if(field==="inventoryItemId"){
        const invItem=inventoryItems.find(x=>x.id===val);
        return {...r,inventoryItemId:val,inventoryItemName:invItem?.name||"",unit:invItem?.unit||"piece"};
      }
      return {...r,[field]:val};
    }));
  };

  const removeIng=(i)=>setRecipe(p=>p.filter((_,idx)=>idx!==i));

  const save=async()=>{
    if(!selMenu) return;
    setSaving(true);
    if (useFirebase) {
      await firebaseServices.recipes.save(selMenu.id, recipe.filter(r=>r.inventoryItemId));
    } else {
      await RecipeService.save(selMenu.id, recipe.filter(r=>r.inventoryItemId));
    }
    setSaving(false);
    onUpdate();
  };

  return (
    <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:14,minHeight:400}}>
      {/* Menu item picker */}
      <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"10px 12px",borderBottom:`1px solid ${C.bdr}`}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search menu items…" style={{...Inp,padding:"6px 10px",fontSize:12}}/>
        </div>
        <div style={{flex:1,overflowY:"auto", paddingBottom:80}}>
          {filteredMenu.map(m=>(
            <div key={m.id} onClick={()=>loadRecipe(m)}
              style={{padding:"10px 14px",cursor:"pointer",borderBottom:`1px solid ${C.bdr}`,background:selMenu?.id===m.id?C.acc+"18":"transparent",borderLeft:selMenu?.id===m.id?`3px solid ${C.acc}`:"3px solid transparent",transition:"all 0.12s"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>{m.em||"🍽"}</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:selMenu?.id===m.id?C.acc:C.text}}>{m.name}</div>
                  <div style={{fontSize:10,color:C.muted}}>{m.cat}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recipe editor */}
      <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16,display:"flex",flexDirection:"column"}}>
        {!selMenu
          ? <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,flexDirection:"column",gap:8}}>
              <div style={{fontSize:36,opacity:0.3}}>🍳</div>
              <div style={{fontSize:13}}>Select a menu item to edit its recipe</div>
            </div>
          : (
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <div style={{fontWeight:800,color:C.text,fontSize:15}}>{selMenu.em} {selMenu.name}</div>
                  <div style={{fontSize:11,color:C.muted}}>Recipe ingredients — deducted per order</div>
                </div>
                <button className="iv-btn" onClick={addIngredient} style={{...Btn(C.acc)}}>+ Ingredient</button>
              </div>

              {recipe.length===0
                ? <div style={{textAlign:"center",padding:30,color:C.muted,fontSize:12}}>No ingredients yet. Click "+ Ingredient" to add.</div>
                : (
                  <div style={{flex:1,overflowY:"auto", paddingBottom:80}}>
                    {/* Header */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 32px",gap:8,padding:"4px 0",borderBottom:`1px solid ${C.bdr}`,marginBottom:8}}>
                      {["Ingredient","Qty","Unit",""].map(h=>(
                        <span key={h} style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:"0.08em"}}>{h}</span>
                      ))}
                    </div>
                    {recipe.map((r,i)=>(
                      <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 32px",gap:8,marginBottom:8,alignItems:"center"}}>
                        <select value={r.inventoryItemId} onChange={e=>updateIng(i,"inventoryItemId",e.target.value)} style={{...Sel,fontSize:12,padding:"6px 8px"}}>
                          <option value="">— Select —</option>
                          {inventoryItems.map(inv=><option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>)}
                        </select>
                        <input type="number" min="0" step="0.1" value={r.qty} onChange={e=>updateIng(i,"qty",+e.target.value)} style={{...Inp,padding:"6px 8px",fontSize:12,textAlign:"right"}}/>
                        <div style={{fontSize:12,color:C.sub,padding:"6px 8px",background:C.bg,borderRadius:6,textAlign:"center"}}>{r.unit}</div>
                        <button onClick={()=>removeIng(i)} style={{background:"transparent",border:"none",color:C.danger,cursor:"pointer",fontSize:16,padding:0}}>✕</button>
                      </div>
                    ))}
                  </div>
                )
              }

              <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.bdr}`,display:"flex",gap:8}}>
                <button className="iv-btn" onClick={save} disabled={saving} style={{...Btn(C.acc),flex:1,opacity:saving?0.6:1}}>
                  {saving?"Saving…":"💾 Save Recipe"}
                </button>
                <button className="iv-btn" onClick={async()=>{
                  if (useFirebase) {
                    await firebaseServices.recipes.delete(selMenu.id);
                  } else {
                    await RecipeService.delete(selMenu.id);
                  }
                  setRecipe([]);
                  onUpdate();
                }} style={{...Ghost(C.danger)}}>Clear</button>
              </div>
            </>
          )
        }
      </div>
    </div>
  );
}

/* ── STOCK LOGS VIEW ─────────────────────────────────*/
function StockLogsView({ logs }) {
  const [search, setSearch] = useState("");
  const [typeFil, setTypeFil] = useState("All");
  const TYPE_COL={add:C.success,deduct:C.info,adjust:C.warn,waste:C.danger};

  const visible = logs.filter(l=>{
    const ms = typeFil==="All" || l.type===typeFil;
    const mq = !search || (l.itemName||"").toLowerCase().includes(search.toLowerCase()) || (l.note||"").toLowerCase().includes(search.toLowerCase());
    return ms && mq;
  });

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search logs…" style={{...Inp,flex:1,maxWidth:280}}/>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {["All","add","deduct","adjust","waste"].map(t=>(
            <button key={t} className="iv-btn" onClick={()=>setTypeFil(t)}
              style={{background:typeFil===t?(TYPE_COL[t]||C.acc)+"22":"transparent",border:`1px solid ${typeFil===t?(TYPE_COL[t]||C.acc)+"60":C.bdr}`,color:typeFil===t?(TYPE_COL[t]||C.acc):C.muted,borderRadius:20,padding:"4px 12px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
              {t==="All"?"All":t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        <span style={{fontSize:11,color:C.muted,marginLeft:"auto"}}>{visible.length} records</span>
      </div>
      <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,overflow:"hidden"}}>
        {visible.length===0
          ? <div style={{textAlign:"center",padding:40,color:C.muted,fontSize:13}}>No logs match</div>
          : visible.slice(0,150).map((l,i)=>(
            <div key={i} style={{display:"flex",gap:10,padding:"9px 14px",borderBottom:`1px solid ${C.bdr}`,fontSize:12,alignItems:"center"}}>
              <span style={{background:(TYPE_COL[l.type]||C.muted)+"20",color:TYPE_COL[l.type]||C.muted,borderRadius:6,padding:"2px 8px",fontWeight:700,fontSize:9,letterSpacing:"0.06em",flexShrink:0}}>{(l.type||"—").toUpperCase()}</span>
              <span style={{fontWeight:700,color:C.text,minWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.itemName||"—"}</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:l.type==="add"?C.success:C.danger,minWidth:60}}>
                {l.type==="add"?"+":"-"}{safeNum(l.qty).toFixed(2)}
              </span>
              <span style={{color:C.muted,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{safeNum(l.before).toFixed(1)} → {safeNum(l.after).toFixed(1)}</span>
              <span style={{color:C.sub,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.note||""}</span>
              <span style={{color:C.muted,fontSize:11,flexShrink:0}}>{fmtDT(l.createdAt)}</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

/* ── INVENTORY REPORTS ───────────────────────────────*/
function InventoryReports({ items, logs, todayUse }) {
  const deductLogs = logs.filter(l=>l.type===LOG_TYPES.DEDUCT);
  const totalCost  = items.reduce((s,i)=>s+safeNum(i.currentStock)*safeNum(i.costPrice),0);
  const topUsed    = [...todayUse].slice(0,8);

  const usageByItem = {};
  deductLogs.forEach(l=>{
    if(!usageByItem[l.itemName]) usageByItem[l.itemName]={name:l.itemName,total:0,orders:0};
    usageByItem[l.itemName].total+=safeNum(l.qty);
    usageByItem[l.itemName].orders+=1;
  });
  const topAll = Object.values(usageByItem).sort((a,b)=>b.total-a.total).slice(0,10);

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
        <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>📦 STOCK SUMMARY</div>
        {[
          {l:"Total Items",v:items.length,c:C.info},
          {l:"Total Stock Value",v:CUR(totalCost),c:C.acc},
          {l:"Low / Critical",v:items.filter(i=>["low","critical"].includes(stockStatus(i))).length,c:C.warn},
          {l:"Out of Stock",v:items.filter(i=>stockStatus(i)==="out").length,c:C.danger},
        ].map(m=>(
          <div key={m.l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.bdr}`,fontSize:13}}>
            <span style={{color:C.muted}}>{m.l}</span>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,color:m.c}}>{m.val||m.v}</span>
          </div>
        ))}
      </div>
      <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
        <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>🔥 MOST CONSUMED (ALL TIME)</div>
        {topAll.length===0
          ? <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:20}}>No deduction data yet</div>
          : topAll.map((u,i)=>(
            <div key={u.name} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.bdr}`,fontSize:12}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:10,color:C.muted,minWidth:16}}>#{i+1}</span>
                <span style={{color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{u.name}</span>
              </div>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <span style={{color:C.muted,fontSize:11}}>{u.orders} orders</span>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc}}>{safeNum(u.total).toFixed(1)}</span>
              </div>
            </div>
          ))
        }
      </div>
      <div style={{gridColumn:"span 2",background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
        <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>💡 COST BY CATEGORY</div>
        <CategoryValueChart items={items} showAll/>
      </div>
    </div>
  );
}

/* ── CATEGORY VALUE CHART ────────────────────────────*/
function CategoryValueChart({ items, showAll }) {
  const bycat = {};
  items.forEach(i=>{
    const c=i.category||"Other";
    const v=safeNum(i.currentStock)*safeNum(i.costPrice);
    bycat[c]=(bycat[c]||0)+v;
  });
  const sorted=Object.entries(bycat).sort((a,b)=>b[1]-a[1]);
  const maxV=sorted[0]?.[1]||1;
  const COLS=["#f0a500","#58a6ff","#3fb950","#f85149","#a78bfa","#fb923c","#34d399","#7d8fa0"];
  return (
    <div>
      {sorted.slice(0,showAll?99:6).map(([cat,val],i)=>(
        <div key={cat} style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
            <span style={{color:C.sub}}>{cat}</span>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:COLS[i%COLS.length]}}>{CUR(val)}</span>
          </div>
          <div style={{height:5,background:C.bg,borderRadius:3}}>
            <div style={{height:"100%",width:`${(val/maxV)*100}%`,background:COLS[i%COLS.length],borderRadius:3}}/>
          </div>
        </div>
      ))}
      {sorted.length===0&&<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:16}}>No cost data — add cost prices to items</div>}
    </div>
  );
}

/* ── SHARED MODAL WRAPPER ────────────────────────────*/
function InvModal({ title, onClose, children, wide }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9000,padding:16}}>
      <div style={{background:"#0d1525",border:`1px solid ${C.bdr}`,borderRadius:16,padding:"22px 20px",width:wide?640:420,maxWidth:"96vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <span style={{fontWeight:800,fontSize:15,color:C.text}}>{title}</span>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20,padding:0,lineHeight:1}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── UTILS ───────────────────────────────────────────*/
function EmptyInventory({ isAdmin, onAdd }) {
  return (
    <div style={{textAlign:"center",padding:"50px 20px",color:C.muted}}>
      <div style={{fontSize:54,marginBottom:12,opacity:0.2}}>📦</div>
      <div style={{fontSize:15,fontWeight:700,color:"#3a4a60",marginBottom:6}}>No inventory items yet</div>
      <div style={{fontSize:12,marginBottom:20}}>Add ingredients, supplies and packaging items</div>
      {isAdmin&&<button className="iv-btn" onClick={onAdd} style={{...Btn(C.acc),padding:"10px 24px"}}>+ Add First Item</button>}
    </div>
  );
}
function LoadingState({ small }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:small?16:60,flexDirection:"column",gap:10}}>
      <div style={{width:28,height:28,border:`2px solid ${C.bdr}`,borderTopColor:C.acc,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      {!small&&<div style={{fontSize:12,color:C.muted}}>Loading inventory…</div>}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
