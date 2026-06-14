import { useState, useMemo, useCallback, useEffect } from "react";
import { useAuth, ROLE_META } from "../auth/AuthProvider";
import { OrderService } from "../db/services/orders.js";
import { ShiftService } from "../db/services/shifts.js";
import { useActiveShift } from "../hooks/useActiveShift.js";
import { SettingsService } from "../db/services/settings.js";
import { BackupService } from "../db/services/backup.js";
import { useLang } from "../i18n/LanguageContext.jsx";
import { useFirebaseServices } from "../firebase/FirebaseServicesProvider.jsx";
import { useTenant } from "../contexts/TenantProvider.jsx";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Reports & Shift Management  ·  v2.0
   Offline-first · IndexedDB-backed via services
   Replace service calls with fetch/Supabase for cloud.
══════════════════════════════════════════════════════ */

export const SHIFT_KEY  = "kavo_current_shift";
export const SHIFTS_KEY = "kavo_shifts";
const ORDERS_KEY = "kavo_orders";

const safeArr = (v,d=[])=>Array.isArray(v)?v:d;
const safeNum = (v)=>{const n=+v;return isFinite(n)?n:0;};
const roundMoney = (v) => Number(Number(v || 0).toFixed(2));

// ─── UTILS ────────────────────────────────────────────
const CUR  = (n,s="$")=>`${s}${safeNum(n).toFixed(2)}`;
const PCE  = (p,t)=>t>0?`${((p/t)*100).toFixed(1)}%`:"0%";
const fmtDate = (iso)=>{try{return new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}catch{return "-";}};
const fmtTime = (iso)=>{try{return new Date(iso).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});}catch{return "-";}};
const fmtDur  = (a,b)=>{const ms=new Date(b||new Date())-new Date(a);if(ms<0)return"-";const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return h>0?`${h}h ${m}m`:`${m}m`;};
const genShiftId = ()=>{const d=new Date();return`SHF-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;};
const isoDate = (iso)=>{try{return new Date(iso).toDateString();}catch{return "";}};

// ─── SUMMARY ENGINE ───────────────────────────────────
const calcSummary = (orderList)=>{
  const paid = safeArr(orderList).filter(o=>o?.status==="Paid");
  const total  = roundMoney(paid.reduce((s,o)=>s+safeNum(o.grand),0));
  // Helper: get method total — for split orders, sum individual method amounts
  const getMethodTotal = (method) => roundMoney(paid.reduce((s, o) => {
    if (!o) return s;
    if (o.payMethod === "split" || o.payMethod === "Split") {
      // Distributed split: sum only the matching sub-payments
      const subPayments = Array.isArray(o.payments) ? o.payments : [];
      return s + subPayments.filter(p => p.method === method).reduce((ss, p) => ss + safeNum(p.amount), 0);
    }
    // Single-method payment: only add if it matches
    return s + (o.payMethod === method ? safeNum(o.grand) : 0);
  }, 0));
  const cashS  = getMethodTotal("Cash");
  const cardS  = getMethodTotal("Card");
  const whishS = getMethodTotal("Whish");
  // splitS removed — split is distributed to Cash/Card/Whish above
  const splitS = 0; // kept for backward compat with any display that references it
  const disc   = roundMoney(paid.reduce((s,o)=>s+safeNum(o.discAmt),0));
  const tax    = roundMoney(paid.reduce((s,o)=>s+safeNum(o.vatAmt),0));
  const svc    = roundMoney(paid.reduce((s,o)=>s+safeNum(o.svcAmt),0));
  const imap={};
  paid.forEach(o=>safeArr(o?.cart).forEach(i=>{
    const k=i?.name||"?";
    if(!imap[k])imap[k]={name:k,em:i?.em||"🍽",qty:0,rev:0};
    imap[k].qty+=safeNum(i?.qty);
    imap[k].rev+=safeNum(i?.price)*safeNum(i?.qty);
  }));
  const topItems=Object.values(imap).sort((a,b)=>b.qty-a.qty).slice(0,8);
  const hourly=Array.from({length:24},(_,h)=>({h,sales:0,orders:0}));
  paid.forEach(o=>{try{const h=new Date(o.savedAt).getHours();hourly[h].sales+=safeNum(o.grand);hourly[h].orders+=1;}catch{}});
  return{count:paid.length,total,cashS,cardS,whishS,splitS,disc,tax,svc,avg:paid.length?total/paid.length:0,topItems,hourly,orders:paid};
};

// ─── PRINT HELPER ─────────────────────────────────────
const printHTML = (body,title)=>{
  const w=window.open("","_blank","width=520,height=780,scrollbars=yes");
  if(!w){alert("Allow popups to print");return;}
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Courier New',monospace;padding:20px;background:#fff;color:#000;font-size:12px;}.c{text-align:center;}.b{font-weight:bold;}.row{display:flex;justify-content:space-between;padding:3px 0;}.sep{border-top:1px dashed #000;margin:7px 0;}.dsep{border-top:2px solid #000;margin:7px 0;}.sec{font-size:13px;font-weight:bold;margin:12px 0 4px;border-bottom:1px solid #000;padding-bottom:2px;}@media print{@page{margin:10mm;}}</style></head><body>${body}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),1500);}</script></body></html>`);
  w.document.close();
};

// ─── DESIGN TOKENS ────────────────────────────────────
const C = {
  bg:"#070c16",surf:"#0b1220",card:"#101828",bdr:"#1a2438",
  acc:"#f0a500",text:"#e8edf5",muted:"#4a6080",sub:"#7d8fa0",
  success:"#3fb950",danger:"#f85149",info:"#58a6ff",warn:"#d29922",
};
const btn=(bg,col="#000",sm=false)=>({
  background:bg,color:col,border:"none",borderRadius:8,
  padding:sm?"5px 12px":"9px 16px",cursor:"pointer",
  fontWeight:700,fontSize:sm?11:12,fontFamily:"inherit",
  transition:"opacity 0.14s",letterSpacing:"0.03em",
});
const ghost=(col=C.muted)=>({
  background:"transparent",color:col,border:`1px solid ${C.bdr}`,
  borderRadius:8,padding:"8px 14px",cursor:"pointer",
  fontWeight:600,fontSize:12,fontFamily:"inherit",transition:"opacity 0.14s",
});
const inp={
  width:"100%",background:C.card,border:`1px solid ${C.bdr}`,
  borderRadius:8,padding:"9px 12px",color:C.text,fontSize:13,
  fontFamily:"inherit",outline:"none",boxSizing:"border-box",
};

// ══════════════════════════════════════════════════════
//   MAIN COMPONENT
// ══════════════════════════════════════════════════════
export default function Reports({ onBack }) {
  const { user, can } = useAuth();
  const isAdmin  = user?.role === "admin";
  const sym      = "$";

  // ── State ──────────────────────────────────────────
  const { t } = useLang();
  
  // Firebase integration
  const firebaseServices = useFirebaseServices();
  const { tenantId } = useTenant();
  const useFirebase = !!tenantId && !!firebaseServices;

  const DATE_FILTERS = [
    ["today",     t("filterToday")],
    ["yesterday", t("filterYesterday")],
    ["week",      t("filter7Days")],
    ["month",     t("filter30Days")],
    ["all",       t("filterAllTime")],
    ["custom",    t("filterCustom")],
  ];
  const DATE_FILTERS_SHORT = [
    ["today",     t("filterToday")],
    ["yesterday", t("filterYesterday")],
    ["week",      t("filter7Days")],
    ["month",     t("filter30Days")],
    ["all",       t("filterAllTime")],
  ];


  const [tab,            setTab]            = useState("dashboard");
  const [dateRange,      setDateRange]      = useState("today");
  const [customDate,     setCustomDate]     = useState(new Date().toISOString().slice(0,10));
  const { activeShift: currentShift, setActiveShift: setCurrentShift, reload: reloadShift } = useActiveShift();
  const [shifts,         setShifts]         = useState([]);
  const [allOrders,      setAllOrders]      = useState([]);
  const [shiftSearch,    setShiftSearch]    = useState("");
  const [selectedShift,  setSelectedShift]  = useState(null);
  const [showOpenModal,  setShowOpenModal]  = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showDelConfirm, setShowDelConfirm] = useState(null);
  const [openCash,       setOpenCash]       = useState("");
  const [closeCash,      setCloseCash]      = useState("");
  const [cashierName,    setCashierName]    = useState(user?.name||"");

  // ── Load all data from Firebase or IDB on mount ──────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        if (useFirebase) {
          console.log('Loading reports data from Firebase...');
          const [orders, shiftHistory, current] = await Promise.all([
            firebaseServices.orders.getAll(),
            firebaseServices.shifts.getHistory(),
            firebaseServices.shifts.getCurrent(),
          ]);
          setAllOrders(safeArr(orders));
          setShifts(safeArr(shiftHistory));
          setCurrentShift(current);
          console.log('Loaded from Firebase - Orders:', orders.length, 'Shifts:', shiftHistory.length);
        } else {
          console.log('Loading reports data from localStorage...');
          const orders = await OrderService.getAll().catch(() => {
            try { const v=localStorage.getItem("kavo_orders"); return v ? JSON.parse(v)||[] : []; } catch { return []; }
          });
          const shiftHistory = await ShiftService.getHistory().catch(() => {
            try { const v=localStorage.getItem("kavo_shifts"); return v ? JSON.parse(v)||[] : []; } catch { return []; }
          });
          const current = await ShiftService.getCurrent().catch(() => {
            try { const v=localStorage.getItem("kavo_current_shift"); return v ? JSON.parse(v) : null; } catch { return null; }
          });
          setAllOrders(safeArr(orders));
          setShifts(safeArr(shiftHistory));
          setCurrentShift(current);
          console.log('Loaded from localStorage - Orders:', orders.length, 'Shifts:', shiftHistory.length);
        }
      } catch (error) {
        console.error('Error loading reports data:', error);
      }
    };
    loadData();
  }, [useFirebase, firebaseServices]);

  // ── Date filter ──────────────────────────────────
  const filteredOrders = useMemo(()=>{
    const today = new Date().toDateString();
    const yest  = new Date(Date.now()-86400000).toDateString();
    const weekAgo = Date.now()-7*86400000;
    const monAgo  = Date.now()-30*86400000;
    return allOrders.filter(o=>{
      if(!o?.savedAt) return false;
      const d=new Date(o.savedAt);
      if(dateRange==="today")   return d.toDateString()===today;
      if(dateRange==="yesterday") return d.toDateString()===yest;
      if(dateRange==="week")    return d.getTime()>=weekAgo;
      if(dateRange==="month")   return d.getTime()>=monAgo;
      if(dateRange==="custom")  return d.toDateString()===new Date(customDate+"T12:00").toDateString();
      return true; // all
    });
  },[allOrders,dateRange,customDate]);

  const summary = useMemo(()=>calcSummary(filteredOrders),[filteredOrders]);

  // Shift orders
  const shiftOrders = useMemo(()=>{
    if(!currentShift?.openedAt) return [];
    return allOrders.filter(o=>{
      try{
        // If order has shiftId, use it for precise linking
        if (o.shiftId && currentShift.shiftId) {
          return o.shiftId === currentShift.shiftId && o.status === "Paid";
        }
        // Fallback: time-based (orders saved during shift)
        return new Date(o.savedAt)>=new Date(currentShift.openedAt) && o.status==="Paid";
      }catch{return false;}
    });
  },[allOrders,currentShift]);
  const shiftSummary = useMemo(()=>calcSummary(shiftOrders),[shiftOrders]);

  // ── Shift actions ────────────────────────────────
  const openShift = async () => {
    if(!cashierName.trim()){alert("Enter cashier name");return;}
    const s={
      shiftId: genShiftId(),  // named shiftId so the hook can reference it
      cashier: cashierName.trim(), cashierId: user?.id,
      status: "open", openedAt: new Date().toISOString(), closedAt: null,
      openingCash: safeNum(openCash), closingCash: null, summary: null,
    };
    try {
      if (useFirebase) {
        console.log('Opening shift in Firebase:', s.shiftId);
        await firebaseServices.shifts.openShift(s);
        await reloadShift();
        console.log('Shift opened in Firebase');
      } else {
        console.log('Opening shift in localStorage:', s.shiftId);
        await ShiftService.openShift(s);
        await reloadShift();
        console.log('Shift opened in localStorage');
      }
    } catch (error) {
      console.error('Error opening shift:', error);
      // Fallback to local state
      setCurrentShift(s);
    }
    setShowOpenModal(false);
    setOpenCash("");
  };

  const closeShift = async () => {
    if(!currentShift) return;
    // Require explicit entry of actual closing cash
    // Empty string = "Not Reconciled" (cashier skipped) — different from entering 0
    const actualEntered = closeCash.trim() !== "";
    const closingCashNum = actualEntered ? safeNum(closeCash) : null;
    const expectedCash   = roundMoney(safeNum(currentShift.openingCash) + safeNum(shiftSummary.cashS));
    // Only compute variance when actual drawer was actually entered
    const diff = actualEntered
      ? roundMoney(closingCashNum - expectedCash)
      : null;
    const closedShift = {
      ...currentShift,
      id: currentShift.shiftId || currentShift.id,  // shifts table uses `id` as key
      status:"closed",
      closedAt:new Date().toISOString(),
      closingCash: closingCashNum,  // null = not reconciled, 0 = entered as zero
      summary:{
        ...shiftSummary,
        openingCash:  safeNum(currentShift.openingCash),
        cashSales:    safeNum(shiftSummary.cashS),   // explicit field for clarity
        cardSales:    safeNum(shiftSummary.cardS),
        whishSales:   safeNum(shiftSummary.whishS||0),
        expectedCash,
        closingCash:  closingCashNum,
        cashDiff:     diff,        // null = not reconciled
        reconciled:   actualEntered,
      },
    };
    
    try {
      if (useFirebase) {
        console.log('Closing shift in Firebase:', closedShift.id);
        await firebaseServices.shifts.saveClosedShift(closedShift);
        await firebaseServices.shifts.clearCurrentShift();
        await reloadShift();
        console.log('Shift closed in Firebase');
      } else {
        console.log('Closing shift in localStorage:', closedShift.id);
        await ShiftService.saveClosedShift(closedShift);
        await ShiftService.clearCurrentShift();
        await reloadShift();
        console.log('Shift closed in localStorage');
      }
    } catch (error) {
      console.error('Error closing shift:', error);
      // Fallback
      localStorage.removeItem(SHIFT_KEY);
    }
    
    const upd=[closedShift,...shifts];
    setShifts(upd);
    setCurrentShift(null);
    setShowCloseModal(false);
    setCloseCash("");
  };

  const deleteShift = async (id) => {
    try {
      if (useFirebase) {
        console.log('Deleting shift from Firebase:', id);
        await firebaseServices.shifts.deleteShift(id);
        console.log('Shift deleted from Firebase');
      } else {
        console.log('Deleting shift from localStorage:', id);
        await ShiftService.deleteShift(id);
        console.log('Shift deleted from localStorage');
      }
    } catch (error) {
      console.error('Error deleting shift:', error);
    }
    const upd=shifts.filter(s=>s.id!==id);
    setShifts(upd);
    setShowDelConfirm(null);
    if(selectedShift?.id===id) setSelectedShift(null);
  };

  const reopenShift = async (s) => {
    const upd=shifts.filter(x=>x.id!==s.id);
    const reopened={...s,status:"open",closedAt:null,summary:null};
    
    try {
      if (useFirebase) {
        console.log('Reopening shift in Firebase:', s.id);
        await firebaseServices.shifts.deleteShift(s.id);
        await firebaseServices.shifts.openShift(reopened);
        console.log('Shift reopened in Firebase');
      } else {
        console.log('Reopening shift in localStorage:', s.id);
        await ShiftService.deleteShift(s.id);
        await ShiftService.openShift(reopened);
        console.log('Shift reopened in localStorage');
      }
    } catch (error) {
      console.error('Error reopening shift:', error);
    }
    
    setShifts(upd);
    setCurrentShift(reopened);
    setSelectedShift(null);
  };

  // ── Export helpers ───────────────────────────────
  const exportOrdersCSV = ()=>{
    const hdr="Order,Date,Time,Type,Table,Customer,Items,Subtotal,Discount,Service,VAT,Total,Payment,Status\n";
    const rows=filteredOrders.map(o=>[
      o.orderNo,fmtDate(o.savedAt),fmtTime(o.savedAt),o.type||"",o.tableNo||"",o.custName||"",
      safeArr(o.cart).map(i=>`${i.name} x${i.qty}`).join("; "),
      safeNum(o.subtotal).toFixed(2),safeNum(o.discAmt).toFixed(2),
      safeNum(o.svcAmt).toFixed(2),safeNum(o.vatAmt).toFixed(2),
      safeNum(o.grand).toFixed(2),o.payMethod||"",o.status||"",
    ].map(v=>`"${v}"`).join(",")).join("\n");
    dl(new Blob([hdr+rows],{type:"text/csv"}),`KAVO_orders_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const exportShiftsCSV = ()=>{
    const hdr="Shift ID,Cashier,Opened,Closed,Duration,Orders,Total Sales,Cash Sales,Opening Cash,Closing Cash,Difference\n";
    const rows=shifts.map(s=>{
      const sm=s.summary||{};
      return[s.id,s.cashier,fmtDate(s.openedAt),fmtDate(s.closedAt||""),fmtDur(s.openedAt,s.closedAt),
        sm.count||0,safeNum(sm.total).toFixed(2),safeNum(sm.cashS).toFixed(2),
        safeNum(sm.openingCash).toFixed(2),safeNum(sm.closingCash).toFixed(2),safeNum(sm.cashDiff).toFixed(2),
      ].map(v=>`"${v}"`).join(",");
    }).join("\n");
    dl(new Blob([hdr+rows],{type:"text/csv"}),`KAVO_shifts_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const dl=(blob,name)=>{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();};

  const printShiftReport = (s)=>{
    const sm=s.summary||shiftSummary;
    const sc=s.status==="open"?shiftSummary:sm;
    const body=`
      <div class="c b" style="font-size:16px;margin-bottom:4px">KAVO-SYS</div>
      <div class="c" style="margin-bottom:2px">SHIFT REPORT</div>
      <div class="dsep"></div>
      <div class="row"><span>Shift ID</span><span class="b">${s.id}</span></div>
      <div class="row"><span>Cashier</span><span>${s.cashier}</span></div>
      <div class="row"><span>Opened</span><span>${fmtDate(s.openedAt)} ${fmtTime(s.openedAt)}</span></div>
      <div class="row"><span>Closed</span><span>${s.closedAt?`${fmtDate(s.closedAt)} ${fmtTime(s.closedAt)}`:"Open"}</span></div>
      <div class="row"><span>Duration</span><span>${fmtDur(s.openedAt,s.closedAt)}</span></div>
      <div class="sep"></div>
      <div class="sec">SALES SUMMARY</div>
      <div class="row"><span>Total Orders</span><span class="b">${sc.count||0}</span></div>
      <div class="row"><span>Total Sales</span><span class="b">${CUR(sc.total,sym)}</span></div>
      <div class="row"><span>Avg. Order</span><span>${CUR(sc.avg,sym)}</span></div>
      <div class="sep"></div>
      <div class="sec">PAYMENT BREAKDOWN</div>
      <div class="row"><span>💵 Cash</span><span>${CUR(sc.cashS,sym)}</span></div>
      <div class="row"><span>💳 Card</span><span>${CUR(sc.cardS,sym)}</span></div>
      <div class="row"><span>📱 Whish</span><span>${CUR(sc.whishS,sym)}</span></div>
      <div class="sep"></div>
      <div class="sec">DEDUCTIONS</div>
      <div class="row"><span>Discounts</span><span>-${CUR(sc.disc,sym)}</span></div>
      <div class="row"><span>Service Charges</span><span>+${CUR(sc.svc,sym)}</span></div>
      <div class="row"><span>VAT</span><span>+${CUR(sc.tax,sym)}</span></div>
      <div class="sep"></div>
      <div class="sec">CASH RECONCILIATION</div>
      <div class="row"><span>Opening Cash</span><span>${CUR(sc.openingCash||s.openingCash,sym)}</span></div>
      <div class="row"><span>Cash Sales</span><span>+${CUR(sc.cashS,sym)}</span></div>
      <div class="row b"><span>Expected in Drawer</span><span>${CUR((sc.openingCash||s.openingCash)+sc.cashS,sym)}</span></div>
      ${sc.closingCash!=null?`<div class="row"><span>Actual Closing</span><span>${CUR(sc.closingCash,sym)}</span></div><div class="row b ${sc.cashDiff>=0?"text-g":"text-r"}"><span>${sc.cashDiff>=0?"OVER":"SHORT"}</span><span>${sc.cashDiff>=0?"+":""}${CUR(sc.cashDiff,sym)}</span></div>`:""}
      <div class="dsep"></div>
      <div class="c" style="font-size:10px;margin-top:8px">Printed ${new Date().toLocaleString()} · KAVO-SYS v1.0</div>
    `;
    printHTML(body,`Shift ${s.id}`);
  };

  // ── Filtered shifts for history ──────────────────
  const visibleShifts = useMemo(()=>
    shifts.filter(s=>{
      const matchRole = isAdmin || s.cashierId===user?.id;
      const q=shiftSearch.toLowerCase();
      const matchQ = !q || s.id.toLowerCase().includes(q) || (s.cashier||"").toLowerCase().includes(q) || fmtDate(s.openedAt).toLowerCase().includes(q);
      return matchRole && matchQ;
    })
  ,[shifts,isAdmin,user,shiftSearch]);

  // ─────────────────────────────────────────────────
  const TABS=[
    {id:"dashboard",label:`📊 ${t("totalSalesReport")}`},
    {id:"shift",    label:`🕐 ${t("currentShift")}`},
    {id:"history",  label:`📋 ${t("shiftHistory")}`},
    {id:"export",   label:`💾 ${t("dateRangeExport")}`},
  ];

  return (
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,sans-serif",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:${C.bg};} ::-webkit-scrollbar-thumb{background:${C.bdr};border-radius:4px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .rv-in{animation:fadeUp 0.3s ease;}
        .rv-btn:hover{opacity:0.82;} .rv-btn{transition:opacity 0.14s;}
        .rv-tab:hover{background:#1a2438!important;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        input:focus{border-color:${C.acc}!important;outline:none;}
        select:focus{border-color:${C.acc}!important;outline:none;}
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{background:C.surf,borderBottom:`2px solid ${C.acc}`,padding:"0 16px",height:54,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button className="rv-btn" onClick={onBack} style={{...ghost(),padding:"5px 12px",fontSize:12}}>← {t("back")}</button>
        <div style={{width:1,height:24,background:C.bdr}}/>
        <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:900,fontSize:17,color:C.acc,letterSpacing:"0.07em"}}>KAVO<span style={{color:C.text,opacity:0.35}}>-SYS</span></span>
        <span style={{fontSize:10,fontWeight:800,color:C.muted,letterSpacing:"0.1em"}}>REPORTS</span>

        {/* Tabs */}
        <div style={{display:"flex",gap:3,marginLeft:8}}>
          {TABS.map(t=>(
            <button key={t.id} className="rv-tab rv-btn" onClick={()=>setTab(t.id)}
              style={{
                background:tab===t.id?C.acc+"22":"transparent",
                border:`1px solid ${tab===t.id?C.acc+"60":C.bdr}`,
                color:tab===t.id?C.acc:C.muted,
                borderRadius:8,padding:"5px 12px",cursor:"pointer",
                fontSize:11,fontWeight:700,fontFamily:"inherit",transition:"all 0.14s",
              }}>{t.label}</button>
          ))}
        </div>

        <div style={{flex:1}}/>

        {/* Shift badge */}
        {currentShift && (
          <div style={{background:"#3fb95018",border:"1px solid #3fb95040",borderRadius:20,padding:"3px 12px",fontSize:11,fontWeight:700,color:"#3fb950"}}>
            🟢 {t("shiftOpenStatus")} · {currentShift.id}
          </div>
        )}

        {/* User */}
        <div style={{background:ROLE_META[user?.role]?.bg,border:`1px solid ${ROLE_META[user?.role]?.color}40`,borderRadius:20,padding:"3px 11px",display:"flex",alignItems:"center",gap:5}}>
          <span style={{fontSize:12}}>{ROLE_META[user?.role]?.icon}</span>
          <span style={{fontSize:11,fontWeight:700,color:ROLE_META[user?.role]?.color}}>{user?.name}</span>
        </div>
      </header>

      {/* ═══ CONTENT ═══ */}
      <div style={{flex:1,overflowY:"auto",padding:16, paddingBottom:80}}>

        {/* ════════════════ DASHBOARD TAB ════════════════ */}
        {tab==="dashboard" && (
          <div className="rv-in">
            {/* Date filter */}
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
              {DATE_FILTERS.map(([v,l])=>(
                <button key={v} className="rv-btn" onClick={()=>setDateRange(v)}
                  style={{
                    background:dateRange===v?C.acc+"22":"transparent",
                    border:`1px solid ${dateRange===v?C.acc+"60":C.bdr}`,
                    color:dateRange===v?C.acc:C.muted,
                    borderRadius:20,padding:"5px 13px",cursor:"pointer",
                    fontSize:11,fontWeight:700,fontFamily:"inherit",
                  }}>{l}</button>
              ))}
              {dateRange==="custom" && (
                <input type="date" value={customDate} onChange={e=>setCustomDate(e.target.value)}
                  style={{...inp,width:150,padding:"5px 10px",fontSize:12}}/>
              )}
              <span style={{fontSize:11,color:C.muted,marginLeft:"auto"}}>{summary.count} {t("paidOrders")}</span>
            </div>

            {/* Metric cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,marginBottom:16}}>
              {[
                {label:t("totalRevenue"),      val:CUR(summary.total,sym),    col:C.acc,   icon:"💰"},
                {label:t("orders"),            val:summary.count,              col:C.info,  icon:"📋"},
                {label:t("avgOrderVal"),       val:CUR(summary.avg,sym),       col:C.success,icon:"📈"},
                {label:t("discountsGiven"),    val:CUR(summary.disc,sym),      col:C.warn,  icon:"🏷"},
                {label:t("serviceChargesLabel"), val:CUR(summary.svc,sym),     col:C.muted, icon:"🔧"},
                {label:t("vatCollected"),      val:CUR(summary.tax,sym),       col:"#a78bfa",icon:"🏛"},
              ].map(m=>(
                <div key={m.label} style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:"14px 16px"}}>
                  <div style={{fontSize:18,marginBottom:6}}>{m.icon}</div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:900,fontSize:20,color:m.col,marginBottom:4}}>{m.val}</div>
                  <div style={{fontSize:11,color:C.muted}}>{m.label}</div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
              {/* Payment breakdown */}
              <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
                <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>💳 {t("paymentMethodsTitle").toUpperCase()}</div>
                {[
                  {label:t("cash"),         val:summary.cashS,  col:"#3fb950",icon:"💵"},
                  {label:t("card"),         val:summary.cardS,  col:"#58a6ff",icon:"💳"},
                  {label:t("whishPayment"), val:summary.whishS, col:"#a78bfa",icon:"📱"},
                  {label:"Split",           val:summary.splitS, col:"#fb923c",icon:"🔀"},
                ].map(p=>(
                  <div key={p.label} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12}}>
                      <span style={{color:C.sub}}>{p.icon} {p.label}</span>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:p.col}}>{CUR(p.val,sym)}</span>
                    </div>
                    <div style={{height:5,background:C.bg,borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:PCE(p.val,summary.total),background:p.col,borderRadius:3,transition:"width 0.4s ease"}}/>
                    </div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>{PCE(p.val,summary.total)} {t("ofTotal")}</div>
                  </div>
                ))}
              </div>

              {/* Top items */}
              <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
                <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>⭐ {t("topItemsTitle").toUpperCase()}</div>
                {summary.topItems.length===0
                  ? <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:20}}>{t("noOrdersInPeriod")}</div>
                  : summary.topItems.slice(0,6).map((item,i)=>(
                    <div key={item.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <span style={{fontSize:10,color:C.muted,fontFamily:"monospace",minWidth:14}}>#{i+1}</span>
                      <span style={{fontSize:16}}>{item.em}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                        <div style={{fontSize:10,color:C.muted}}>{item.qty} {t("soldLabel")} · {CUR(item.rev,sym)}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Hourly chart */}
            <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:14,letterSpacing:"0.04em"}}>⏰ {t("hourlySalesTitle").toUpperCase()}</div>
              <HourlyChart hourly={summary.hourly} sym={sym}/>
            </div>

            {/* Recent orders */}
            <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
              <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12,letterSpacing:"0.04em"}}>🧾 {t("recentTransTitle").toUpperCase()}</div>
              {summary.orders.length===0
                ? <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:20}}>{t("noOrdersInPeriod")}</div>
                : summary.orders.slice().reverse().slice(0,15).map(o=>(
                  <div key={o.orderNo} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:`1px solid ${C.bdr}`}}>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc,fontSize:12,minWidth:70}}>{o.orderNo}</span>
                    <span style={{fontSize:11,color:C.muted,minWidth:90}}>{fmtDate(o.savedAt)}</span>
                    <span style={{fontSize:11,color:C.muted,minWidth:48}}>{fmtTime(o.savedAt)}</span>
                    <span style={{fontSize:11,color:C.sub,flex:1}}>{o.type||""}{o.tableNo?` · ${o.tableNo}`:""}{o.custName?` · ${o.custName}`:""}</span>
                    <span style={{fontSize:11,color:C.sub,minWidth:40}}>{o.payMethod}</span>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,color:C.success,fontSize:12,minWidth:70,textAlign:"right"}}>{CUR(o.grand,sym)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ════════════════ SHIFT TAB ════════════════ */}
        {tab==="shift" && (
          <div className="rv-in" style={{maxWidth:680,margin:"0 auto"}}>

            {/* Current shift status */}
            {currentShift ? (
              <div style={{background:C.card,border:`1.5px solid #3fb95050`,borderLeft:`4px solid #3fb950`,borderRadius:14,padding:20,marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:"#3fb950"}}/>
                      <span style={{fontWeight:800,fontSize:15,color:C.text}}>{t("shiftActiveLabel")}</span>
                    </div>
                    <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.acc,fontSize:14}}>{currentShift.id}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:12,color:C.muted}}>{t("duration")}</div>
                    <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.text,fontSize:16}}>{fmtDur(currentShift.openedAt)}</div>
                  </div>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
                  {[
                    {label:t("cashierLabel"),   val:currentShift.cashier,             mono:false},
                    {label:t("shiftOpened"),    val:`${fmtDate(currentShift.openedAt)} ${fmtTime(currentShift.openedAt)}`, mono:false},
                    {label:t("openingCash"),    val:CUR(currentShift.openingCash,sym), mono:true},
                  ].map(r=>(
                    <div key={r.label} style={{background:C.bg,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:10,color:C.muted,marginBottom:3}}>{r.label}</div>
                      <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:r.mono?"'JetBrains Mono',monospace":"inherit"}}>{r.val}</div>
                    </div>
                  ))}
                </div>

                {/* Live shift metrics */}
                <div style={{background:C.bg,borderRadius:10,padding:12,marginBottom:12}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:8,fontWeight:700,letterSpacing:"0.05em"}}>{t("currentShiftMetrics").toUpperCase()}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                    {[
                      {label:t("orders"),        val:shiftSummary.count,            col:C.info},
                      {label:t("totalSales"),    val:CUR(shiftSummary.total,sym),    col:C.acc},
                      {label:t("avgOrderLabel"), val:CUR(shiftSummary.avg,sym),      col:C.warn},
                      {label:t("discountsLabel"),val:"-"+CUR(shiftSummary.disc,sym), col:"#d29922"},
                    ].map(m=>(
                      <div key={m.label} style={{textAlign:"center"}}>
                        <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:15,color:m.col}}>{m.val}</div>
                        <div style={{fontSize:10,color:C.muted}}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Payment breakdown */}
                  <div style={{borderTop:"1px solid #1e2d4a",paddingTop:10}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:7,fontWeight:700,letterSpacing:"0.05em"}}>{t("paymentMethodsTitle").toUpperCase()}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      {[
                        {label:`💵 ${t("cash")}`,  val:shiftSummary.cashS,  col:"#3fb950"},
                        {label:`💳 ${t("card")}`,  val:shiftSummary.cardS,  col:"#58a6ff"},
                        {label:`📱 ${t("whishPayment")}`, val:shiftSummary.whishS, col:"#a78bfa"},
                      ].map(m=>(
                        <div key={m.label} style={{background:C.surf,borderRadius:8,padding:"9px 10px",border:"1px solid "+m.col+"30"}}>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:14,color:m.col}}>{CUR(m.val,sym)}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                    {/* Expected drawer */}
                    <div style={{marginTop:10,background:"#0b1820",borderRadius:8,padding:"9px 12px",border:"1px solid #1e3a20"}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                        <span style={{color:C.muted}}>{t("openingCash")}</span>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",color:C.text}}>{CUR(currentShift.openingCash,sym)}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginTop:4}}>
                        <span style={{color:C.muted}}>+ {t("cash")} {t("totalSales")}</span>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",color:"#3fb950"}}>+{CUR(shiftSummary.cashS,sym)}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginTop:6,paddingTop:6,borderTop:"1px solid #1e3a20"}}>
                        <span style={{color:"#3fb950",fontWeight:700}}>{t("drawerLabel")}</span>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:900,color:"#3fb950"}}>{CUR(safeNum(currentShift.openingCash)+shiftSummary.cashS,sym)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{display:"flex",gap:10}}>
                  <button className="rv-btn" onClick={()=>setShowCloseModal(true)}
                    style={{...btn(C.acc),flex:1}}>🔒 {t("closeShiftBtn")}</button>
                  <button className="rv-btn" onClick={()=>printShiftReport(currentShift)}
                    style={{...btn(C.surf,"#fff"),border:`1px solid ${C.bdr}`}}>🖨 {t("print")}</button>
                </div>
              </div>
            ) : (
              <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:14,padding:24,marginBottom:16,textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:10}}>⏱</div>
                <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>{t("noShiftOpen")}</div>
                <div style={{fontSize:12,color:C.muted,marginBottom:20}}>{t("openShiftToTrack")}</div>
                <button className="rv-btn" onClick={()=>{setCashierName(user?.name||"");setShowOpenModal(true);}}
                  style={{...btn(C.success,"#000"),padding:"10px 28px"}}>
                  🟢 {t("openNewShiftBtn")}
                </button>
              </div>
            )}

            {/* Quick stats for last closed shift */}
            {shifts.filter(s=>isAdmin||s.cashierId===user?.id).slice(0,1).map(s=>(
              <div key={s.id} style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16}}>
                <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.06em",marginBottom:10}}>{t("lastClosedShift").toUpperCase()}</div>
                <ShiftRow s={s} sym={sym} onView={()=>{setSelectedShift(s);setTab("history");}} isAdmin={isAdmin} onDelete={()=>setShowDelConfirm(s.id)} onPrint={()=>printShiftReport(s)} onReopen={isAdmin?()=>reopenShift(s):null}/>
              </div>
            ))}
          </div>
        )}

        {/* ════════════════ HISTORY TAB ════════════════ */}
        {tab==="history" && (
          <div className="rv-in">
            <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
              <input value={shiftSearch} onChange={e=>setShiftSearch(e.target.value)}
                placeholder="🔍  Search by cashier, shift ID, or date..."
                style={{...inp,flex:1,maxWidth:400}}/>
              <span style={{fontSize:11,color:C.muted}}>{visibleShifts.length} shift{visibleShifts.length!==1?"s":""}</span>
              {isAdmin && shifts.length>0 && (
                <button className="rv-btn" onClick={exportShiftsCSV} style={ghost(C.info)}>📥 {t("exportShiftHistCSV")}</button>
              )}
            </div>

            {visibleShifts.length===0
              ? <div style={{textAlign:"center",padding:60,color:C.muted}}>
                  <div style={{fontSize:40,marginBottom:10}}>📋</div>
                  <div style={{fontSize:14}}>{t("noShiftHistory")}</div>
                </div>
              : (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {visibleShifts.map(s=>(
                    <div key={s.id} style={{background:C.card,border:`1px solid ${selectedShift?.id===s.id?C.acc+"60":C.bdr}`,borderRadius:12,padding:"12px 16px",cursor:"pointer"}}
                      onClick={()=>setSelectedShift(selectedShift?.id===s.id?null:s)}>
                      <ShiftRow s={s} sym={sym} onView={null} isAdmin={isAdmin}
                        onDelete={isAdmin?()=>{setShowDelConfirm(s.id);}:null}
                        onPrint={()=>printShiftReport(s)}
                        onReopen={isAdmin?()=>reopenShift(s):null}/>
                      {selectedShift?.id===s.id && <ShiftDetail s={s} sym={sym}/>}
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        )}

        {/* ════════════════ EXPORT TAB ════════════════ */}
        {tab==="export" && (
          <div className="rv-in" style={{maxWidth:580,margin:"0 auto"}}>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[
                {icon:"🖨",title:t("printShiftReport"),desc:"Thermal receipt-style shift summary for current or last shift",action:()=>printShiftReport(currentShift||shifts[0]),disabled:!currentShift&&shifts.length===0,col:C.acc},
                {icon:"📥",title:t("exportOrdersCSVBtn"),desc:`Export ${filteredOrders.length} ${t("orders")}`,action:exportOrdersCSV,disabled:filteredOrders.length===0,col:C.info},
                {icon:"📋",title:t("exportShiftHistCSV"),desc:`Export ${shifts.length} ${t("shiftHistory")}`,action:exportShiftsCSV,disabled:shifts.length===0,col:C.success},
              ].map(e=>(
                <div key={e.title} style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:20,display:"flex",alignItems:"center",gap:16,opacity:e.disabled?0.4:1}}>
                  <div style={{fontSize:32,flexShrink:0}}>{e.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:C.text,marginBottom:4}}>{e.title}</div>
                    <div style={{fontSize:12,color:C.muted}}>{e.desc}</div>
                  </div>
                  <button className="rv-btn" onClick={e.action} disabled={e.disabled}
                    style={{...btn(e.col),flexShrink:0,opacity:e.disabled?0.4:1}}>
                    {t("goBtn")}
                  </button>
                </div>
              ))}

              <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:12,padding:16,marginTop:4}}>
                <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.06em",marginBottom:8}}>{t("dateRangeExport").toUpperCase()}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {DATE_FILTERS_SHORT.map(([v,l])=>(
                    <button key={v} className="rv-btn" onClick={()=>setDateRange(v)}
                      style={{
                        background:dateRange===v?C.acc+"22":"transparent",
                        border:`1px solid ${dateRange===v?C.acc+"60":C.bdr}`,
                        color:dateRange===v?C.acc:C.muted,
                        borderRadius:20,padding:"5px 13px",cursor:"pointer",
                        fontSize:11,fontWeight:700,fontFamily:"inherit",
                      }}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ OPEN SHIFT MODAL ══ */}
      {showOpenModal && (
        <Modal title={`🟢 ${t("openShift")}`} onClose={()=>setShowOpenModal(false)}>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.06em",display:"block",marginBottom:6}}>{t("cashierNameField").toUpperCase()}</label>
            <input value={cashierName} onChange={e=>setCashierName(e.target.value)} placeholder={t("enterCashierName")} style={inp}/>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.06em",display:"block",marginBottom:6}}>{t("openingCashField").toUpperCase()} ({sym})</label>
            <input type="number" min="0" step="0.01" value={openCash} onChange={e=>setOpenCash(e.target.value)} placeholder="0.00" style={{...inp,fontFamily:"'JetBrains Mono',monospace"}}/>
          </div>
          <div style={{background:C.bg,borderRadius:8,padding:"10px 12px",marginBottom:16,fontSize:12,color:C.info}}>
            📌 {t("shiftIdWillBe")}: <strong style={{fontFamily:"monospace"}}>{genShiftId()}</strong>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="rv-btn" onClick={openShift} style={{...btn(C.success,"#000"),flex:1}}>{t("openShiftBtn")}</button>
            <button className="rv-btn" onClick={()=>setShowOpenModal(false)} style={{...ghost(),flex:1}}>{t("cancel")}</button>
          </div>
        </Modal>
      )}

      {/* ══ CLOSE SHIFT MODAL ══ */}
      {showCloseModal && currentShift && (
        <Modal title={`🔒 ${t("closeShift")}`} onClose={()=>setShowCloseModal(false)} wide>
          {/* Summary */}
          <div style={{background:C.bg,borderRadius:10,padding:14,marginBottom:14}}>
            <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:10,letterSpacing:"0.05em"}}>{t("shiftSummaryLabel").toUpperCase()}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {[
                [t("totalOrdersLabel"), shiftSummary.count],
                [t("totalSales"),       CUR(shiftSummary.total,sym)],
                [t("openingCash"),      CUR(currentShift.openingCash,sym)],
                [t("avgOrderLabel"),    CUR(shiftSummary.avg,sym)],
              ].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",borderBottom:`1px solid ${C.bdr}`}}>
                  <span style={{color:C.muted}}>{l}</span>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.text}}>{v}</span>
                </div>
              ))}
            </div>
            {/* Payment breakdown inside close modal */}
            <div style={{marginTop:10,borderTop:`1px solid ${C.bdr}`,paddingTop:10}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:7,letterSpacing:"0.06em"}}>{t("paymentMethodsTitle").toUpperCase()}</div>
              {[
                [`💵 ${t("cash")} ${t("totalSales")}`,  CUR(shiftSummary.cashS,sym),  "#3fb950"],
                [`💳 ${t("card")} ${t("totalSales")}`,  CUR(shiftSummary.cardS,sym),  "#58a6ff"],
                [`📱 ${t("whishPayment")} ${t("totalSales")}`, CUR(shiftSummary.whishS,sym), "#a78bfa"],
                [`🏷 ${t("discountsLabel")}`,   "-"+CUR(shiftSummary.disc,sym), "#d29922"],
              ].map(([l,v,col])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0"}}>
                  <span style={{color:C.muted}}>{l}</span>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:col}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cash reconciliation */}
          <div style={{background:C.bg,borderRadius:10,padding:14,marginBottom:14}}>
            <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:10,letterSpacing:"0.05em"}}>{t("drawerLabel").toUpperCase()}</div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
              <span style={{color:C.muted}}>{t("openingCash")}</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",color:C.text}}>{CUR(currentShift.openingCash,sym)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${C.bdr}`}}>
              <span style={{color:C.muted}}>+ {t("cash")} {t("totalSales")}</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",color:C.success}}>+{CUR(shiftSummary.cashS,sym)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:14}}>
              <span style={{color:C.text,fontWeight:700}}>{t("drawerLabel")}</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,color:C.acc,fontSize:15}}>{CUR(safeNum(currentShift.openingCash)+shiftSummary.cashS,sym)}</span>
            </div>
            <label style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.06em",display:"block",marginBottom:6}}>
              ACTUAL CLOSING CASH ({sym}) — <span style={{color:"#4a6080",fontWeight:400}}>Leave blank to skip reconciliation</span>
            </label>
            <input type="number" min="0" step="0.01" value={closeCash} onChange={e=>setCloseCash(e.target.value)}
              placeholder={CUR(roundMoney(safeNum(currentShift.openingCash)+shiftSummary.cashS),sym)}
              style={{...inp,fontFamily:"'JetBrains Mono',monospace",fontSize:15}}/>
            {closeCash.trim() !== "" && (()=>{
              const expected = roundMoney(safeNum(currentShift.openingCash)+shiftSummary.cashS);
              const actual   = safeNum(closeCash);
              const diff     = roundMoney(actual - expected);
              const isOver   = diff > 0.005;
              const isShort  = diff < -0.005;
              const isBal    = !isOver && !isShort;
              return(
                <div style={{marginTop:10,padding:"10px 12px",borderRadius:8,
                  background:isBal?"#0a1f10":isOver?"#0a1f10":"#200a0a",
                  border:`1px solid ${(isBal||isOver)?"#3fb95040":"#f8514940"}`,
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:800,color:(isBal||isOver)?C.success:C.danger}}>
                      {isBal?`✓ ${t("balancedLabel")}`:isOver?`📈 ${t("overageLabel")}`:`📉 ${t("shortageLabel")}`}
                    </div>
                    <div style={{fontSize:10,color:"#4a6080",marginTop:2}}>
                      {isBal?t("balancedLabel")
                        :isOver?t("overageLabel")
                        :t("shortageLabel")}
                    </div>
                  </div>
                  {!isBal&&<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:900,color:isOver?C.success:C.danger}}>{isOver?"+":""}{CUR(diff,sym)}</span>}
                </div>
              );
            })()}
          </div>

          <div style={{display:"flex",gap:8}}>
            <button className="rv-btn" onClick={closeShift} style={{...btn(C.danger,"#fff"),flex:1}}>{t("closeShiftSaveBtn")}</button>
            <button className="rv-btn" onClick={()=>setShowCloseModal(false)} style={{...ghost(),flex:1}}>{t("cancel")}</button>
          </div>
        </Modal>
      )}

      {/* ══ DELETE CONFIRM MODAL ══ */}
      {showDelConfirm && (
        <Modal title="⚠ Delete Shift" onClose={()=>setShowDelConfirm(null)}>
          <p style={{fontSize:13,color:C.sub,lineHeight:1.6,marginBottom:20}}>
            This will permanently remove shift <strong style={{color:C.text,fontFamily:"monospace"}}>{showDelConfirm}</strong> from local history. This cannot be undone.
          </p>
          <div style={{display:"flex",gap:8}}>
            <button className="rv-btn" onClick={()=>deleteShift(showDelConfirm)} style={{...btn(C.danger,"#fff"),flex:1}}>{t("delete")}</button>
            <button className="rv-btn" onClick={()=>setShowDelConfirm(null)} style={{...ghost(),flex:1}}>{t("cancel")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════ */
function ShiftRow({ s, sym, isAdmin, onDelete, onPrint, onReopen }) {
  const { t } = useLang();
  const sm = s.summary||{};
  const diff = safeNum(sm.cashDiff);
  const hasDiff = sm.cashDiff !== null && sm.cashDiff !== undefined;
  const isBalanced = hasDiff && Math.abs(diff) < 0.005;
  const isOver     = hasDiff && !isBalanced && diff > 0;
  const diffLabel  = isBalanced ? `✓ ${t("balancedLabel")}` : isOver ? `📈 ${t("overageLabel")}` : `📉 ${t("shortageLabel")}`;
  const diffCol    = isBalanced ? "#3fb950"    : isOver ? "#3fb950"    : "#f85149";
  const diffBg     = isBalanced ? "#0d2010"    : isOver ? "#0d2010"    : "#200a0a";
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:13,color:"#f0a500"}}>{s.shiftId||s.id}</span>
        <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:s.status==="open"?"#3fb95020":"#6b728020",border:`1px solid ${s.status==="open"?"#3fb95060":"#6b728040"}`,color:s.status==="open"?"#3fb950":"#94a3b8",fontWeight:700}}>{s.status==="open"?`🟢 ${t("shiftOpenStatus")}`:`✓ ${t("shiftClosedStatus")}`}</span>
        <span style={{fontSize:11,color:"#7d8fa0"}}>{s.cashier}</span>
        <span style={{fontSize:11,color:"#4a6080"}}>{fmtDate(s.openedAt)}</span>
        <span style={{fontSize:11,color:"#4a6080"}}>{fmtDur(s.openedAt,s.closedAt)}</span>
        {/* Total sales — always labeled */}
        <span style={{marginLeft:"auto",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1}}>
          <span style={{fontSize:9,color:"#4a6080",letterSpacing:"0.06em"}}>{t("totalSales").toUpperCase()}</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,color:"#3fb950"}}>{CUR(sm.total||0,sym)}</span>
        </span>
        {/* Cash variance — labeled with context; null = not reconciled */}
        {sm.reconciled === false || sm.closingCash == null ? (
          s.status === "closed" && (
            <span style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1}}>
              <span style={{fontSize:9,color:"#4a6080",letterSpacing:"0.06em"}}>{t("drawerLabel").toUpperCase()}</span>
              <span style={{fontSize:10,fontWeight:700,color:"#4a6080",background:"#1a2438",border:"1px solid #2a3a50",borderRadius:6,padding:"2px 7px"}}>
                ○ {t("notReconciled")}
              </span>
            </span>
          )
        ) : hasDiff && (
          <span style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1}}>
            <span style={{fontSize:9,color:"#4a6080",letterSpacing:"0.06em"}}>{t("drawerVariance").toUpperCase()}</span>
            <span style={{
              fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:800,
              color:diffCol,
              background:diffBg,border:`1px solid ${diffCol}40`,
              borderRadius:6,padding:"2px 7px"
            }}>
              {diffLabel}{!isBalanced ? " " + (diff>0?"+":"") + CUR(diff,sym) : ""}
            </span>
          </span>
        )}
        <button className="rv-btn" onClick={e=>{e.stopPropagation();onPrint&&onPrint();}} style={{background:"transparent",border:"1px solid #1a2438",borderRadius:6,padding:"3px 8px",color:"#4a6080",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🖨</button>
        {isAdmin&&onReopen&&s.status==="closed"&&<button className="rv-btn" onClick={e=>{e.stopPropagation();onReopen();}} style={{background:"transparent",border:"1px solid #58a6ff30",borderRadius:6,padding:"3px 8px",color:"#58a6ff",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>↩ {t("reopenShiftBtn")}</button>}
        {isAdmin&&onDelete&&<button className="rv-btn" onClick={e=>{e.stopPropagation();onDelete();}} style={{background:"transparent",border:"1px solid #f8514930",borderRadius:6,padding:"3px 8px",color:"#f85149",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✕</button>}
      </div>
    </div>
  );
}

function ShiftDetail({ s, sym }) {
  const { t } = useLang();
  const sm = s.summary||{};
  const safeNum=(v)=>{const n=+v;return isFinite(n)?n:0;};
  const CUR=(n,s="$")=>`${s}${safeNum(n).toFixed(2)}`;
  const diff = safeNum(sm.cashDiff);
  const actualEntered = sm.reconciled !== false && sm.closingCash !== null && sm.closingCash !== undefined;
  const hasDiff = actualEntered;
  const isBalanced = hasDiff && Math.abs(diff) < 0.005;
  const isOver     = hasDiff && !isBalanced && diff > 0;
  return (
    <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #1a2438"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8,marginBottom:12}}>
        {[
          {label:t("totalOrdersLabel"),             val:sm.count||0,           col:"#58a6ff"},
          {label:t("totalSales"),                   val:CUR(sm.total,sym),     col:"#f0a500"},
          {label:t("avgOrderLabel"),                val:CUR(sm.avg,sym),       col:"#3fb950"},
          {label:`💵 ${t("cash")} ${t("totalSales")}`,  val:CUR(sm.cashS,sym),     col:"#3fb950"},
          {label:`💳 ${t("card")} ${t("totalSales")}`,  val:CUR(sm.cardS,sym),     col:"#58a6ff"},
          {label:`📱 ${t("whishPayment")} ${t("totalSales")}`, val:CUR(sm.whishS||0,sym), col:"#a78bfa"},
          {label:`🏷 ${t("discountsLabel")}`,       val:"-"+CUR(sm.disc,sym),  col:"#d29922"},
        ].map(m=>(
          <div key={m.label} style={{background:"#0d1525",borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:14,color:m.col,marginBottom:3}}>{m.val}</div>
            <div style={{fontSize:10,color:"#4a6080"}}>{m.label}</div>
          </div>
        ))}
      </div>

      {hasDiff && (
        <div style={{background:"#0d1525",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:10,color:"#4a6080",fontWeight:700,letterSpacing:"0.08em",marginBottom:10}}>💰 {t("drawerLabel").toUpperCase()}</div>
          {[
            [t("openingCash"),      CUR(sm.openingCash||s.openingCash||0,sym), "#7d8fa0"],
            [`+ ${t("cash")} ${t("totalSales")}`,"+"+CUR(sm.cashS||0,sym),   "#3fb950"],
            [t("drawerLabel"),      CUR(safeNum(sm.openingCash||s.openingCash)+safeNum(sm.cashS),sym), "#f0a500"],
            [t("closingCash")||"Actual Closing", CUR(sm.closingCash,sym),     "#7d8fa0"],
          ].map(([l,v,col])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",fontSize:11,padding:"4px 0",borderBottom:"1px solid #1a2438"}}>
              <span style={{color:"#6b7fa0",flex:1,paddingRight:8}}>{l}</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:col,flexShrink:0}}>{v}</span>
            </div>
          ))}
          <div style={{marginTop:8,borderRadius:8,padding:"9px 12px",
            background:isBalanced?"#0a1f10":isOver?"#0a1f10":"#1f0a0a",
            border:`1.5px solid ${isBalanced?"#3fb950":(isOver?"#3fb950":"#f85149")}40`,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:isBalanced?"#3fb950":(isOver?"#3fb950":"#f85149")}}>
                {isBalanced?`✓ ${t("balancedLabel")}`:isOver?`📈 ${t("overageLabel")}`:`📉 ${t("shortageLabel")}`}
              </div>
              <div style={{fontSize:10,color:"#4a6080",marginTop:2}}>
                {isBalanced?t("balancedLabel"):isOver?t("overageLabel"):t("shortageLabel")}
              </div>
            </div>
            {!isBalanced&&<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:15,fontWeight:900,color:isOver?"#3fb950":"#f85149"}}>{isOver?"+":"-"}{CUR(Math.abs(diff),sym)}</span>}
          </div>
        </div>
      )}

      {sm.topItems&&sm.topItems.length>0&&(
        <div style={{background:"#0d1525",borderRadius:8,padding:12}}>
          <div style={{fontSize:10,color:"#4a6080",fontWeight:700,letterSpacing:"0.06em",marginBottom:8}}>{t("topItemsTitle").toUpperCase()}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{sm.topItems.slice(0,5).map(i=>(
            <span key={i.name} style={{background:"#1a2438",borderRadius:6,padding:"4px 10px",fontSize:11,color:"#9198a1"}}>
              {i.em} {i.name} <strong style={{color:"#f0a500"}}>×{i.qty}</strong>
            </span>
          ))}</div>
        </div>
      )}
    </div>
  );
}
function HourlyChart({ hourly, sym }) {
  const visible = hourly.filter(h=>h.h>=6);
  const maxS = Math.max(...visible.map(h=>h.sales),0.01);
  const safeNum=(v)=>{const n=+v;return isFinite(n)?n:0;};
  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-end",gap:3,height:110,marginBottom:4}}>
        {visible.map(h=>{
          const pct=h.sales/maxS;
          const active=h.sales>0;
          return (
            <div key={h.h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:0,position:"relative"}}>
              {active&&<div style={{position:"absolute",top:-18,fontSize:8,color:"#f0a500",fontFamily:"monospace",whiteSpace:"nowrap"}}>{sym}{safeNum(h.sales).toFixed(0)}</div>}
              <div style={{width:"100%",height:`${Math.max(pct*96,active?4:1)}px`,background:active?"#f0a500":"#1e2d4a22",borderRadius:"3px 3px 0 0",marginTop:"auto"}}/>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:3,marginTop:2}}>
        {visible.map(h=>(
          <div key={h.h} style={{flex:1,textAlign:"center",fontSize:8,color:"#374a60"}}>{h.h}</div>
        ))}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}>
      <div style={{background:"#0d1525",border:"1px solid #1a2438",borderRadius:16,padding:"22px 20px",width:wide?540:400,maxWidth:"96vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <span style={{fontWeight:800,fontSize:15,color:"#e8edf5"}}>{title}</span>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#4a6080",cursor:"pointer",fontSize:20,padding:0,lineHeight:1}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
