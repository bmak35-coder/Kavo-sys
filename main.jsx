import { useState, useEffect, useRef, useCallback } from "react";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Offline-First POS  ·  v1.0
   Storage layer is isolated — swap DB.get/set with
   real API calls later without touching business logic.
══════════════════════════════════════════════════════ */

// ─── SEED DATA ────────────────────────────────────────
const SEED_CATS = [
  { id:"all",      name:"All Items",   icon:"ti-layout-grid" },
  { id:"hot",      name:"Hot Drinks",  icon:"ti-coffee" },
  { id:"cold",     name:"Cold Drinks", icon:"ti-glass" },
  { id:"food",     name:"Food",        icon:"ti-chef-hat" },
  { id:"desserts", name:"Desserts",    icon:"ti-cake" },
  { id:"specials", name:"Star Pick",   icon:"ti-star" },
];

const SEED_MENU = [
  { id:"m1",  cat:"hot",      name:"Espresso",      price:3.50, bg:"#7c3aed", em:"☕" },
  { id:"m2",  cat:"hot",      name:"Cappuccino",    price:4.50, bg:"#92400e", em:"☕" },
  { id:"m3",  cat:"hot",      name:"Latte",         price:5.00, bg:"#78716c", em:"🥛" },
  { id:"m4",  cat:"hot",      name:"Americano",     price:4.00, bg:"#1c1917", em:"☕" },
  { id:"m5",  cat:"hot",      name:"Hot Chocolate", price:5.50, bg:"#78350f", em:"🍫" },
  { id:"m6",  cat:"hot",      name:"Mocha",         price:5.00, bg:"#44403c", em:"☕" },
  { id:"m7",  cat:"cold",     name:"Iced Latte",    price:5.50, bg:"#0c4a6e", em:"🧋" },
  { id:"m8",  cat:"cold",     name:"Frappuccino",   price:6.00, bg:"#1e3a5f", em:"🥤" },
  { id:"m9",  cat:"cold",     name:"Fresh OJ",      price:4.50, bg:"#c2410c", em:"🍊" },
  { id:"m10", cat:"cold",     name:"Smoothie",      price:6.50, bg:"#166534", em:"🥤" },
  { id:"m11", cat:"cold",     name:"Mineral Water", price:2.00, bg:"#164e63", em:"💧" },
  { id:"m12", cat:"cold",     name:"Lemonade",      price:4.00, bg:"#713f12", em:"🍋" },
  { id:"m13", cat:"food",     name:"Club Sandwich", price:8.50, bg:"#92400e", em:"🥪" },
  { id:"m14", cat:"food",     name:"Caesar Salad",  price:7.50, bg:"#14532d", em:"🥗" },
  { id:"m15", cat:"food",     name:"Avocado Toast", price:9.00, bg:"#166534", em:"🥑" },
  { id:"m16", cat:"food",     name:"Eggs Benedict", price:10.5, bg:"#78350f", em:"🍳" },
  { id:"m17", cat:"food",     name:"Beef Burger",   price:12.0, bg:"#7f1d1d", em:"🍔" },
  { id:"m18", cat:"food",     name:"Pasta",         price:11.0, bg:"#7c2d12", em:"🍝" },
  { id:"m19", cat:"desserts", name:"Cheesecake",    price:6.00, bg:"#9d174d", em:"🍰" },
  { id:"m20", cat:"desserts", name:"Tiramisu",      price:6.50, bg:"#44403c", em:"🍮" },
  { id:"m21", cat:"desserts", name:"Brownie",       price:5.00, bg:"#431407", em:"🍫" },
  { id:"m22", cat:"desserts", name:"Ice Cream",     price:4.50, bg:"#1e3a5f", em:"🍨" },
  { id:"m23", cat:"desserts", name:"Waffles",       price:7.00, bg:"#78350f", em:"🧇" },
  { id:"m24", cat:"specials", name:"Chef Special",  price:15.0, bg:"#1e1b4b", em:"⭐" },
  { id:"m25", cat:"specials", name:"Set Meal A",    price:18.0, bg:"#0f172a", em:"🍱" },
  { id:"m26", cat:"specials", name:"Set Meal B",    price:22.0, bg:"#172554", em:"🍱" },
];

const DEFAULT_SETTINGS = {
  branch:      "KAVO Main Branch",
  cashier:     "Alex Kassem",
  shift:       "SHF-" + new Date().toISOString().slice(0,10).replace(/-/g,"") + "-A",
  taxRate:     11,
  serviceRate: 10,
  currency:    "$",
};

// ─── STORAGE LAYER (swap for API later) ───────────────
const DB = {
  get: (k, def = null) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── UTILITIES ────────────────────────────────────────
const cur = (n, s = "$") => `${s}${parseFloat(n || 0).toFixed(2)}`;
const genNo = () => `#${String(Date.now()).slice(-5)}`;
const clock = () => ({
  date: new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }),
  time: new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", second:"2-digit" }),
});

const STATUS_COLOR = { New:"#3b82f6", Preparing:"#f59e0b", Ready:"#22c55e", Paid:"#6b7280" };
const STATUS_LIST  = ["New","Preparing","Ready","Paid"];

// ─── DESIGN TOKENS ────────────────────────────────────
const T = {
  bg:      "#0d1117",
  surf:    "#161b22",
  card:    "#1c2128",
  border:  "#30363d",
  acc:     "#f0a500",
  accDim:  "rgba(240,165,0,0.12)",
  text:    "#e6edf3",
  muted:   "#7d8590",
  sub:     "#9198a1",
  success: "#3fb950",
  danger:  "#f85149",
  info:    "#58a6ff",
  warn:    "#d29922",
};

// ─── SHARED STYLES ────────────────────────────────────
const S = {
  btn: (bg, col="#000", sm=false) => ({
    background: bg, color: col, border: "none",
    borderRadius: 8, padding: sm ? "6px 12px" : "9px 14px",
    cursor: "pointer", fontWeight: 700,
    fontSize: sm ? 11 : 12, letterSpacing: "0.04em",
    fontFamily: "inherit", transition: "opacity 0.12s",
    whiteSpace: "nowrap",
  }),
  ghost: (sm=false) => ({
    background: "transparent", color: T.muted,
    border: `1px solid ${T.border}`,
    borderRadius: 8, padding: sm ? "5px 10px" : "8px 12px",
    cursor: "pointer", fontWeight: 600,
    fontSize: sm ? 11 : 12, fontFamily: "inherit",
  }),
  input: (w="100%") => ({
    width: w, background: T.surf, border: `1px solid ${T.border}`,
    borderRadius: 8, padding: "7px 10px", color: T.text,
    fontSize: 13, fontFamily: "inherit", outline: "none",
    boxSizing: "border-box",
  }),
};

// ══════════════════════════════════════════════════════
//   MAIN COMPONENT
// ══════════════════════════════════════════════════════
export default function KAVOSYS() {
  // ── settings & static data ──
  const [settings]   = useState(() => DB.get("kavo_settings", DEFAULT_SETTINGS));
  const [categories] = useState(() => { const s=DB.get("kavo_cats"); if(!s){DB.set("kavo_cats",SEED_CATS);return SEED_CATS;} return s; });
  const [menu]       = useState(() => { const s=DB.get("kavo_menu"); if(!s){DB.set("kavo_menu",SEED_MENU);return SEED_MENU;} return s; });

  // ── menu filter ──
  const [activeCat, setActiveCat] = useState("hot");
  const [search,    setSearch]    = useState("");

  // ── current order ──
  const [orderNo,    setOrderNo]    = useState(genNo);
  const [status,     setStatus]     = useState("New");
  const [type,       setType]       = useState("dine-in");
  const [tableNo,    setTableNo]    = useState("");
  const [custName,   setCustName]   = useState("");
  const [custPhone,  setCustPhone]  = useState("");
  const [cart,       setCart]       = useState([]);
  const [discPct,    setDiscPct]    = useState(0);
  const [payMethod,  setPayMethod]  = useState("Cash");
  const [amtPaid,    setAmtPaid]    = useState("");
  const [splitAmt,   setSplitAmt]   = useState({ Cash:"", Card:"", Whish:"" });

  // ── persistence ──
  const [held,    setHeld]    = useState(() => DB.get("kavo_held", []));
  const [history, setHistory] = useState(() => DB.get("kavo_orders", []));

  // ── ui ──
  const [modal,      setModal]      = useState(null);
  const [noteItemId, setNoteItemId] = useState(null);
  const [noteText,   setNoteText]   = useState("");
  const [ticker,     setTicker]     = useState(clock());
  const [toast,      setToast]      = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    const t = setInterval(() => setTicker(clock()), 1000);
    return () => clearInterval(t);
  }, []);

  const showToast = (msg, type="ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2600);
  };

  // ── computed totals ──
  const sym       = settings.currency;
  const subtotal  = cart.reduce((s,i) => s + i.price * i.qty, 0);
  const discAmt   = (subtotal * discPct) / 100;
  const afterDisc = subtotal - discAmt;
  const svcAmt    = (afterDisc * settings.serviceRate) / 100;
  const vatAmt    = ((afterDisc + svcAmt) * settings.taxRate) / 100;
  const grand     = afterDisc + svcAmt + vatAmt;
  const paidNum   = parseFloat(amtPaid) || 0;
  const change    = payMethod === "Cash" ? Math.max(0, paidNum - grand) : 0;
  const splitTotal= Object.values(splitAmt).reduce((s,v)=>s+(parseFloat(v)||0),0);

  // ── menu filter ──
  const visible = menu.filter(i => {
    if (search) return i.name.toLowerCase().includes(search.toLowerCase());
    return activeCat === "all" || i.cat === activeCat;
  });

  // ── cart actions ──
  const addItem = (item) => {
    setCart(c => {
      const ex = c.find(i => i.id === item.id);
      if (ex) return c.map(i => i.id===item.id ? {...i, qty:i.qty+1} : i);
      return [...c, {...item, qty:1, note:""}];
    });
  };
  const adjQty  = (id, d) => setCart(c => c.map(i => i.id===id ? {...i, qty:Math.max(1,i.qty+d)} : i));
  const remItem = (id) => setCart(c => c.filter(i => i.id!==id));
  const openNote = (item) => { setNoteItemId(item.id); setNoteText(item.note||""); setModal("note"); };
  const saveNote = () => { setCart(c=>c.map(i=>i.id===noteItemId?{...i,note:noteText}:i)); setModal(null); };

  // ── order actions ──
  const resetOrder = useCallback(() => {
    setCart([]); setOrderNo(genNo()); setStatus("New"); setType("dine-in");
    setTableNo(""); setCustName(""); setCustPhone(""); setDiscPct(0);
    setAmtPaid(""); setPayMethod("Cash"); setSplitAmt({Cash:"",Card:"",Whish:""});
  }, []);

  const holdOrder = () => {
    if (!cart.length) { showToast("Cart is empty", "err"); return; }
    const o = { orderNo,type,tableNo,custName,custPhone,cart,discPct,status,heldAt:new Date().toISOString() };
    const upd = [...held, o]; setHeld(upd); DB.set("kavo_held", upd);
    showToast(`Order ${orderNo} held`);
    resetOrder();
  };

  const resumeOrder = (h) => {
    setOrderNo(h.orderNo); setType(h.type); setTableNo(h.tableNo);
    setCustName(h.custName); setCustPhone(h.custPhone); setCart(h.cart);
    setDiscPct(h.discPct); setStatus(h.status);
    const upd = held.filter(x=>x.orderNo!==h.orderNo); setHeld(upd); DB.set("kavo_held",upd);
    setModal(null); showToast(`Resumed ${h.orderNo}`);
  };

  const removeHeld = (no) => {
    const upd = held.filter(h=>h.orderNo!==no); setHeld(upd); DB.set("kavo_held",upd);
  };

  const sendKitchen = () => {
    if (!cart.length) { showToast("Cart is empty","err"); return; }
    setStatus("Preparing"); setModal("kitchen"); showToast("Sent to kitchen","ok");
  };

  const saveOrder = (pay=true) => {
    if (!cart.length) { showToast("Cart is empty","err"); return; }
    const o = {
      orderNo, type, tableNo, custName, custPhone, cart,
      subtotal, discAmt, svcAmt, vatAmt, grand, discPct,
      payMethod, amtPaid: paidNum||grand, change, status: pay?"Paid":status,
      cashier:settings.cashier, branch:settings.branch, shift:settings.shift,
      date:ticker.date, time:ticker.time, savedAt:new Date().toISOString(),
    };
    const upd = [o,...history]; setHistory(upd); DB.set("kavo_orders",upd);
    if (pay) { setStatus("Paid"); setModal("receipt"); showToast("Order saved & paid","ok"); }
    else showToast("Order saved","ok");
  };

  const voidOrder = () => {
    if (window.confirm(`Void order ${orderNo}?`)) { resetOrder(); showToast("Order voided","warn"); }
  };

  // ── export / backup ──
  const exportCSV = () => {
    const hdr = "Order,Date,Type,Table,Customer,Items,Total,Payment,Status\n";
    const rows = history.map(o =>
      [o.orderNo,o.savedAt,o.type,o.tableNo||"-",o.custName||"-",
       o.cart.map(i=>`${i.name} x${i.qty}`).join("; "),
       o.grand.toFixed(2),o.payMethod,o.status].map(v=>`"${v}"`).join(",")
    ).join("\n");
    dl(new Blob([hdr+rows],{type:"text/csv"}), `KAVO_orders_${Date.now()}.csv`);
    showToast("CSV exported");
  };

  const backupJSON = () => {
    const data = JSON.stringify({ orders:history, held, menu, categories, settings },null,2);
    dl(new Blob([data],{type:"application/json"}), `KAVO_backup_${Date.now()}.json`);
    showToast("Backup saved");
  };

  const importJSON = (e) => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.orders) { DB.set("kavo_orders",d.orders); setHistory(d.orders); }
        if (d.held)   { DB.set("kavo_held",d.held);     setHeld(d.held); }
        showToast("Backup restored");
      } catch { showToast("Invalid backup file","err"); }
    };
    r.readAsText(f);
    e.target.value = "";
  };

  const dl = (blob, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name; a.click();
  };

  // ── daily report ──
  const todayStr  = new Date().toDateString();
  const todayPaid = history.filter(o => new Date(o.savedAt).toDateString()===todayStr && o.status==="Paid");
  const dailyRev  = todayPaid.reduce((s,o)=>s+o.grand,0);

  // ── receipt lines ──
  const receiptLines = [
    "════════════════════════",
    `     ${settings.branch}`,
    "════════════════════════",
    `Order  : ${orderNo}`,
    `Date   : ${ticker.date}`,
    `Time   : ${ticker.time}`,
    `Cashier: ${settings.cashier}`,
    `Shift  : ${settings.shift}`,
    `Type   : ${type.toUpperCase()}`,
    tableNo  ? `Table  : ${tableNo}` : "",
    custName ? `Name   : ${custName}` : "",
    custPhone? `Phone  : ${custPhone}` : "",
    "────────────────────────",
    ...cart.map(i =>
      `${i.name.substring(0,16).padEnd(16)} ×${i.qty}\n  ${cur(i.price,sym)} × ${i.qty} = ${cur(i.price*i.qty,sym)}`
      + (i.note ? `\n  ↳ ${i.note}` : "")
    ),
    "────────────────────────",
    `Subtotal  : ${cur(subtotal,sym)}`,
    discPct>0 ? `Discount  : -${cur(discAmt,sym)} (${discPct}%)` : "",
    `Service   : +${cur(svcAmt,sym)} (${settings.serviceRate}%)`,
    `VAT       : +${cur(vatAmt,sym)} (${settings.taxRate}%)`,
    "════════════════════════",
    `TOTAL     : ${cur(grand,sym)}`,
    `Payment   : ${payMethod}`,
    `Paid      : ${cur(paidNum||grand,sym)}`,
    payMethod==="Cash" ? `Change    : ${cur(change,sym)}` : "",
    "════════════════════════",
    "   Thank you for your visit!",
    "       KAVO-SYS  v1.0",
    "════════════════════════",
  ].filter(Boolean).join("\n");

  // ══════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:T.bg, color:T.text, fontFamily:"system-ui,-apple-system,sans-serif", overflow:"hidden", position:"relative" }}>
      {/* inject font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:${T.bg}; }
        ::-webkit-scrollbar-thumb { background:${T.border}; border-radius:4px; }
        .menu-btn:hover { opacity:0.85; transform:scale(0.98); }
        .action-btn:hover { opacity:0.85; }
        input:focus { border-color:${T.acc} !important; }
        select:focus { border-color:${T.acc} !important; outline:none; }
      `}</style>

      {/* ─── TOPBAR ─── */}
      <header style={{ background:T.surf, borderBottom:`2px solid ${T.acc}`, padding:"0 12px", display:"flex", alignItems:"center", gap:10, height:52, flexShrink:0, flexWrap:"wrap" }}>
        {/* Logo */}
        <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:18, color:T.acc, letterSpacing:"0.06em", marginRight:4 }}>
          KAVO<span style={{color:T.text,opacity:0.5}}>-SYS</span>
        </span>
        <div style={{ width:1, height:26, background:T.border }}/>
        <span style={{ fontSize:12, color:T.sub }}>{settings.branch}</span>
        <div style={{ width:1, height:26, background:T.border }}/>
        <span style={{ fontSize:12, color:T.sub }}>Cashier: <b style={{color:T.text,fontWeight:700}}>{settings.cashier}</b></span>
        <span style={{ fontSize:12, color:T.sub }}>Shift: <b style={{color:T.text,fontWeight:700}}>{settings.shift}</b></span>

        <div style={{ flex:1 }}/>

        {/* Status badge */}
        <span style={{ background:STATUS_COLOR[status]+"22", border:`1px solid ${STATUS_COLOR[status]}`, color:STATUS_COLOR[status], borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>{status}</span>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:T.acc, fontSize:15 }}>{orderNo}</span>
        <div style={{ textAlign:"right", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:T.sub }}>
          <div style={{color:T.text,fontSize:12}}>{ticker.time}</div>
          <div>{ticker.date}</div>
        </div>

        <div style={{ width:1, height:26, background:T.border }}/>

        {/* Action buttons */}
        <button className="action-btn" onClick={()=>setModal("held")} style={{ ...S.btn(held.length?T.warn:T.card, held.length?"#000":T.text), border:`1px solid ${T.border}`, position:"relative" }}>
          ⏸ Held {held.length>0 && <span style={{background:T.danger,color:"#fff",borderRadius:10,padding:"0 5px",fontSize:9,position:"absolute",top:-4,right:-4}}>{held.length}</span>}
        </button>
        <button className="action-btn" onClick={()=>setModal("report")} style={S.ghost()}>📊 Report</button>
        <button className="action-btn" onClick={exportCSV} style={S.ghost()}>📥 CSV</button>
        <button className="action-btn" onClick={backupJSON} style={S.ghost()}>💾 Backup</button>
        <button className="action-btn" onClick={()=>fileRef.current?.click()} style={S.ghost()}>📂 Restore</button>
        <input ref={fileRef} type="file" accept=".json" onChange={importJSON} style={{display:"none"}}/>
      </header>

      {/* ─── BODY ─── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ═══ LEFT · MENU PANEL ═══ */}
        <div style={{ flex:"0 0 57%", display:"flex", flexDirection:"column", borderRight:`1px solid ${T.border}`, overflow:"hidden" }}>

          {/* Search */}
          <div style={{ padding:"8px 10px", background:T.surf, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:T.muted, fontSize:15 }}>🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search menu items..."
                style={{ ...S.input(), paddingLeft:32, border:`1px solid ${search?T.acc:T.border}` }}/>
              {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:16 }}>✕</button>}
            </div>
          </div>

          {/* Category tabs */}
          {!search && (
            <div style={{ display:"flex", gap:5, padding:"7px 10px", overflowX:"auto", background:T.surf, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
              {categories.map(c => (
                <button key={c.id} onClick={()=>setActiveCat(c.id)}
                  style={{ flexShrink:0, padding:"5px 13px", borderRadius:20, border:`1px solid ${activeCat===c.id?T.acc:T.border}`, background:activeCat===c.id?T.accDim:"transparent", color:activeCat===c.id?T.acc:T.muted, fontWeight:700, fontSize:11, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", transition:"all 0.15s" }}>
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Menu grid */}
          <div style={{ flex:1, overflowY:"auto", padding:10, display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:8, alignContent:"start" }}>
            {visible.map(item => {
              const inCart = cart.find(i=>i.id===item.id);
              return (
                <button key={item.id} className="menu-btn" onClick={()=>addItem(item)}
                  style={{ background:inCart?`${T.acc}1a`:T.card, border:`1.5px solid ${inCart?T.acc:T.border}`, borderRadius:12, padding:"12px 8px", cursor:"pointer", textAlign:"center", fontFamily:"inherit", position:"relative", transition:"all 0.15s" }}>
                  {inCart && (
                    <span style={{ position:"absolute", top:6, right:7, background:T.acc, color:"#000", borderRadius:12, padding:"0 6px", fontSize:10, fontWeight:800, fontFamily:"'JetBrains Mono',monospace" }}>{inCart.qty}</span>
                  )}
                  <div style={{ width:52, height:52, borderRadius:12, background:item.bg, margin:"0 auto 8px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>{item.em}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:T.text, lineHeight:1.3, marginBottom:4 }}>{item.name}</div>
                  <div style={{ fontSize:13, fontWeight:800, color:T.acc, fontFamily:"'JetBrains Mono',monospace" }}>{cur(item.price,sym)}</div>
                </button>
              );
            })}
            {visible.length === 0 && (
              <div style={{ gridColumn:"1/-1", textAlign:"center", color:T.muted, padding:40 }}>
                <div style={{fontSize:36,marginBottom:8}}>🔍</div>
                No items found
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT · ORDER PANEL ═══ */}
        <div style={{ flex:"0 0 43%", display:"flex", flexDirection:"column", background:T.surf, overflow:"hidden" }}>

          {/* Order header: type + table + customer */}
          <div style={{ padding:"8px 10px", background:T.card, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            {/* Type selector */}
            <div style={{ display:"flex", gap:5, marginBottom:7 }}>
              {["dine-in","takeaway","delivery"].map(t=>(
                <button key={t} onClick={()=>setType(t)}
                  style={{ flex:1, padding:"6px 0", borderRadius:8, border:`1px solid ${type===t?T.acc:T.border}`, background:type===t?T.acc:"transparent", color:type===t?"#000":T.muted, fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                  {t==="dine-in"?"🍽 Dine-In":t==="takeaway"?"🛍 Takeaway":"🛵 Delivery"}
                </button>
              ))}
            </div>
            {/* Table + customer row */}
            <div style={{ display:"flex", gap:6 }}>
              {type==="dine-in" && (
                <select value={tableNo} onChange={e=>setTableNo(e.target.value)}
                  style={{ ...S.input("90px"), color:tableNo?T.text:T.muted }}>
                  <option value="">Table #</option>
                  {Array.from({length:20},(_,i)=>`T${i+1}`).map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              )}
              <input value={custName} onChange={e=>setCustName(e.target.value)} placeholder="Customer name"
                style={{ ...S.input(), flex:1 }}/>
              <input value={custPhone} onChange={e=>setCustPhone(e.target.value)} placeholder="Phone"
                style={{ ...S.input("90px") }}/>
            </div>
          </div>

          {/* Status selector */}
          <div style={{ display:"flex", gap:5, padding:"6px 10px", background:T.card, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <span style={{ fontSize:10, color:T.muted, alignSelf:"center", marginRight:2, letterSpacing:"0.06em" }}>STATUS</span>
            {STATUS_LIST.map(s=>(
              <button key={s} onClick={()=>setStatus(s)}
                style={{ flex:1, padding:"4px 0", borderRadius:6, border:`1px solid ${status===s?STATUS_COLOR[s]:T.border}`, background:status===s?STATUS_COLOR[s]+"28":"transparent", color:status===s?STATUS_COLOR[s]:T.muted, fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                {s}
              </button>
            ))}
          </div>

          {/* Cart */}
          <div style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>
            {cart.length===0 ? (
              <div style={{ textAlign:"center", color:T.muted, padding:"40px 20px" }}>
                <div style={{fontSize:38,marginBottom:8}}>🛒</div>
                <div style={{fontSize:13}}>Cart is empty</div>
                <div style={{fontSize:11,marginTop:4,color:T.border}}>Tap items from the menu to add</div>
              </div>
            ) : cart.map(item=>(
              <div key={item.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 9px", background:T.card, borderRadius:10, marginBottom:5, border:`1px solid ${T.border}` }}>
                <div style={{ width:36, height:36, borderRadius:8, background:item.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{item.em}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{cur(item.price,sym)} each</div>
                  {item.note && <div style={{ fontSize:10, color:T.warn, fontStyle:"italic", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>📝 {item.note}</div>}
                </div>
                {/* qty controls */}
                <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                  <button onClick={()=>adjQty(item.id,-1)} style={{ width:24, height:24, borderRadius:6, border:`1px solid ${T.border}`, background:T.surf, color:T.text, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
                  <span style={{ minWidth:20, textAlign:"center", fontWeight:800, fontFamily:"'JetBrains Mono',monospace", fontSize:13 }}>{item.qty}</span>
                  <button onClick={()=>adjQty(item.id,1)} style={{ width:24, height:24, borderRadius:6, border:`1px solid ${T.acc}`, background:T.accDim, color:T.acc, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
                </div>
                <div style={{ fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:T.acc, minWidth:52, textAlign:"right", fontSize:12 }}>{cur(item.price*item.qty,sym)}</div>
                <button onClick={()=>openNote(item)} title="Note" style={{ width:22, height:22, borderRadius:5, border:"none", background:"transparent", color:item.note?T.warn:T.border, cursor:"pointer", fontSize:13, padding:0 }}>📝</button>
                <button onClick={()=>remItem(item.id)} style={{ width:22, height:22, borderRadius:5, border:"none", background:"transparent", color:T.danger, cursor:"pointer", fontSize:13, padding:0 }}>✕</button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ borderTop:`1px solid ${T.border}`, padding:"9px 12px", background:T.card, flexShrink:0 }}>
            <Row label="Subtotal" value={cur(subtotal,sym)} />
            <div style={{ display:"flex", alignItems:"center", marginBottom:3, gap:6 }}>
              <span style={{ fontSize:12, color:T.muted, flex:1 }}>Discount %</span>
              <input type="number" min="0" max="100" value={discPct}
                onChange={e=>setDiscPct(Math.min(100,Math.max(0,+e.target.value)))}
                style={{ width:55, background:T.surf, border:`1px solid ${T.border}`, borderRadius:6, padding:"3px 7px", color:T.text, fontSize:12, fontFamily:"'JetBrains Mono',monospace", textAlign:"right", outline:"none" }}/>
              <span style={{ fontSize:12, color:T.danger, fontFamily:"'JetBrains Mono',monospace", minWidth:62, textAlign:"right" }}>-{cur(discAmt,sym)}</span>
            </div>
            <Row label={`Service (${settings.serviceRate}%)`} value={`+${cur(svcAmt,sym)}`} />
            <Row label={`VAT (${settings.taxRate}%)`}         value={`+${cur(vatAmt,sym)}`} />
            <div style={{ display:"flex", justifyContent:"space-between", borderTop:`1px solid ${T.border}`, paddingTop:7, marginTop:4 }}>
              <span style={{ fontSize:17, fontWeight:900, color:T.acc }}>GRAND TOTAL</span>
              <span style={{ fontSize:17, fontWeight:900, color:T.acc, fontFamily:"'JetBrains Mono',monospace" }}>{cur(grand,sym)}</span>
            </div>
          </div>

          {/* Payment */}
          <div style={{ borderTop:`1px solid ${T.border}`, padding:"8px 10px", background:T.card, flexShrink:0 }}>
            <div style={{ display:"flex", gap:5, marginBottom:7 }}>
              {["Cash","Card","Whish","Split"].map(m=>(
                <button key={m} onClick={()=>setPayMethod(m)}
                  style={{ flex:1, padding:"5px 0", borderRadius:7, border:`1px solid ${payMethod===m?T.acc:T.border}`, background:payMethod===m?T.acc:"transparent", color:payMethod===m?"#000":T.muted, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                  {m==="Cash"?"💵":m==="Card"?"💳":m==="Whish"?"📱":"🔀"} {m}
                </button>
              ))}
            </div>

            {payMethod==="Cash" && (
              <div style={{ display:"flex", gap:7, marginBottom:4 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:T.muted, marginBottom:3 }}>Amount Paid</div>
                  <input type="number" value={amtPaid} onChange={e=>setAmtPaid(e.target.value)}
                    placeholder={cur(grand,sym)}
                    style={{ ...S.input(), fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700 }}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:T.muted, marginBottom:3 }}>Change Due</div>
                  <div style={{ ...S.input(), background:change>0?T.success+"1a":T.surf, border:`1px solid ${change>0?T.success:T.border}`, fontSize:14, fontWeight:800, fontFamily:"'JetBrains Mono',monospace", color:change>0?T.success:T.muted, display:"flex", alignItems:"center" }}>
                    {cur(change,sym)}
                  </div>
                </div>
              </div>
            )}

            {payMethod==="Split" && (
              <div style={{ display:"flex", gap:6, marginBottom:4 }}>
                {["Cash","Card","Whish"].map(m=>(
                  <div key={m} style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:T.muted, marginBottom:3 }}>{m==="Cash"?"💵":m==="Card"?"💳":"📱"} {m}</div>
                    <input type="number" value={splitAmt[m]}
                      onChange={e=>setSplitAmt(s=>({...s,[m]:e.target.value}))}
                      placeholder="0.00"
                      style={{ ...S.input(), fontFamily:"'JetBrains Mono',monospace" }}/>
                  </div>
                ))}
              </div>
            )}
            {payMethod==="Split" && (
              <div style={{ fontSize:11, color:splitTotal>=grand?T.success:T.danger, textAlign:"right", marginBottom:4, fontFamily:"'JetBrains Mono',monospace" }}>
                Collected: {cur(splitTotal,sym)} / {cur(grand,sym)}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ borderTop:`1px solid ${T.border}`, padding:"8px 10px", background:T.card, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:5, flexShrink:0 }}>
            <button className="action-btn" onClick={holdOrder}     style={S.btn(T.warn,"#000")}>⏸ Hold</button>
            <button className="action-btn" onClick={sendKitchen}   style={S.btn(T.info,"#000")}>🍳 Kitchen</button>
            <button className="action-btn" onClick={()=>setModal("receipt")} style={S.ghost()}>🧾 Preview</button>
            <button className="action-btn" onClick={()=>saveOrder(true)}  style={{ ...S.btn(T.success,"#000"), gridColumn:"span 2" }}>✅ Pay & Save</button>
            <button className="action-btn" onClick={()=>saveOrder(false)} style={S.ghost()}>💾 Save</button>
            <button className="action-btn" onClick={voidOrder}     style={S.btn(T.danger,"#fff")}>🚫 Void</button>
            <button className="action-btn" onClick={resetOrder}    style={{ ...S.ghost(), gridColumn:"span 1" }}>＋ New</button>
            <button className="action-btn" onClick={()=>window.print()} style={S.ghost()}>🖨 Print</button>
          </div>
        </div>
      </div>

      {/* ═══ MODALS ═══ */}

      {/* Item note */}
      {modal==="note" && (
        <Modal title="Add Item Note" onClose={()=>setModal(null)}>
          <textarea value={noteText} onChange={e=>setNoteText(e.target.value)}
            placeholder="e.g. No sugar, extra ice, allergen info..."
            style={{ width:"100%", height:90, background:T.surf, border:`1px solid ${T.border}`, borderRadius:8, padding:10, color:T.text, fontSize:13, resize:"none", fontFamily:"inherit", outline:"none" }}/>
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <button onClick={saveNote} style={{ ...S.btn(T.acc,"#000"), flex:1 }}>Save Note</button>
            <button onClick={()=>setModal(null)} style={{ ...S.ghost(), flex:1 }}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* Kitchen ticket */}
      {modal==="kitchen" && (
        <Modal title="Kitchen Ticket" onClose={()=>setModal(null)}>
          <div style={{ background:"#000", borderRadius:10, padding:16, fontFamily:"'JetBrains Mono',monospace", fontSize:13 }}>
            <div style={{ color:T.warn, fontWeight:900, fontSize:15, marginBottom:10, letterSpacing:"0.08em" }}>★ KITCHEN ORDER ★</div>
            <div style={{ color:T.muted, marginBottom:3 }}>Order <span style={{color:T.acc}}>{orderNo}</span> · {type.toUpperCase()}</div>
            {tableNo && <div style={{ color:T.muted, marginBottom:3 }}>Table: <span style={{color:"#fff"}}>{tableNo}</span></div>}
            {custName && <div style={{ color:T.muted, marginBottom:3 }}>Name: <span style={{color:"#fff"}}>{custName}</span></div>}
            <div style={{ borderTop:`1px dashed ${T.border}`, margin:"10px 0" }}/>
            {cart.map(i=>(
              <div key={i.id}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ color:"#fff", fontWeight:700 }}>{i.em} {i.name}</span>
                  <span style={{ color:T.acc, fontSize:16, fontWeight:900 }}>×{i.qty}</span>
                </div>
                {i.note && <div style={{ color:T.warn, fontSize:11, marginBottom:6, paddingLeft:8 }}>↳ {i.note}</div>}
              </div>
            ))}
            <div style={{ borderTop:`1px dashed ${T.border}`, margin:"10px 0" }}/>
            <div style={{ color:T.muted, fontSize:11 }}>{ticker.time} · {settings.cashier}</div>
          </div>
          <button onClick={()=>setModal(null)} style={{ ...S.btn(T.success,"#000"), width:"100%", marginTop:12 }}>✓ Confirmed – Sent to Kitchen</button>
        </Modal>
      )}

      {/* Receipt */}
      {modal==="receipt" && (
        <Modal title="Receipt Preview" onClose={()=>setModal(null)} wide>
          <div style={{ background:"#fff", borderRadius:8, padding:"14px 16px", color:"#000", fontFamily:"'Courier New',monospace", fontSize:11.5, lineHeight:1.8, whiteSpace:"pre", maxHeight:420, overflowY:"auto", userSelect:"all" }}>
            {receiptLines}
          </div>
          <div style={{ display:"flex", gap:7, marginTop:10 }}>
            <button onClick={()=>window.print()} style={{ ...S.btn(T.acc,"#000"), flex:1 }}>🖨 Print</button>
            <button onClick={()=>{navigator.clipboard?.writeText(receiptLines);showToast("Copied!");}} style={{ ...S.ghost(), flex:1 }}>📋 Copy</button>
            <button onClick={()=>setModal(null)} style={{ ...S.ghost(), flex:1 }}>Close</button>
          </div>
        </Modal>
      )}

      {/* Held orders */}
      {modal==="held" && (
        <Modal title="Held Orders" onClose={()=>setModal(null)} wide>
          {held.length===0 ? (
            <div style={{ textAlign:"center", color:T.muted, padding:30 }}>
              <div style={{fontSize:34,marginBottom:8}}>⏸</div>
              No held orders
            </div>
          ) : held.map(h=>(
            <div key={h.orderNo} style={{ background:T.card, borderRadius:10, padding:10, marginBottom:7, border:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, color:T.acc, fontFamily:"'JetBrains Mono',monospace", fontSize:14 }}>{h.orderNo}</div>
                <div style={{ fontSize:12, color:T.sub }}>{h.type} {h.tableNo?`· ${h.tableNo}`:""} {h.custName?`· ${h.custName}`:""}</div>
                <div style={{ fontSize:11, color:T.muted }}>{h.cart.length} item{h.cart.length!==1?"s":""} · {new Date(h.heldAt).toLocaleTimeString()}</div>
              </div>
              <button onClick={()=>resumeOrder(h)} style={S.btn(T.success,"#000")}>▶ Resume</button>
              <button onClick={()=>removeHeld(h.orderNo)} style={S.btn(T.danger,"#fff")}>✕</button>
            </div>
          ))}
        </Modal>
      )}

      {/* Daily report */}
      {modal==="report" && (
        <Modal title="Daily Report" onClose={()=>setModal(null)} wide>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
            {[
              { label:"Orders Today",  val:todayPaid.length,               col:T.info },
              { label:"Revenue Today", val:cur(dailyRev,sym),              col:T.success },
              { label:"Avg. Order",    val:cur(todayPaid.length?dailyRev/todayPaid.length:0,sym), col:T.acc },
            ].map(s=>(
              <div key={s.label} style={{ background:T.card, borderRadius:10, padding:12, border:`1px solid ${T.border}`, textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:900, color:s.col, fontFamily:"'JetBrains Mono',monospace" }}>{s.val}</div>
                <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ maxHeight:260, overflowY:"auto" }}>
            {todayPaid.length===0
              ? <div style={{ textAlign:"center", color:T.muted, padding:20 }}>No paid orders today</div>
              : todayPaid.map(o=>(
                <div key={o.orderNo} style={{ display:"flex", justifyContent:"space-between", padding:"7px 10px", background:T.card, borderRadius:8, marginBottom:4, border:`1px solid ${T.border}`, fontSize:12 }}>
                  <span style={{ color:T.acc, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{o.orderNo}</span>
                  <span style={{ color:T.sub }}>{o.type}</span>
                  <span style={{ color:T.sub }}>{o.payMethod}</span>
                  <span style={{ color:T.text, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{cur(o.grand,sym)}</span>
                  <span style={{ color:STATUS_COLOR[o.status], fontWeight:700 }}>{o.status}</span>
                </div>
              ))
            }
          </div>
          <div style={{ display:"flex", gap:7, marginTop:12 }}>
            <button onClick={exportCSV}  style={{ ...S.btn(T.acc,"#000"), flex:1 }}>📥 Export CSV</button>
            <button onClick={backupJSON} style={{ ...S.btn(T.success,"#000"), flex:1 }}>💾 Backup JSON</button>
          </div>
        </Modal>
      )}

      {/* ─── TOAST ─── */}
      {toast && (
        <div style={{ position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:toast.type==="err"?T.danger:toast.type==="warn"?T.warn:T.success, color:"#000", fontWeight:700, fontSize:13, padding:"9px 20px", borderRadius:20, zIndex:9999, boxShadow:"0 4px 20px rgba(0,0,0,0.4)", whiteSpace:"nowrap", pointerEvents:"none" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────
function Row({ label, value }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3, fontSize:12, color:T.muted }}>
      <span>{label}</span>
      <span style={{ color:T.sub, fontFamily:"'JetBrains Mono',monospace" }}>{value}</span>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:16 }}>
      <div style={{ background:T.surf, border:`1px solid ${T.border}`, borderRadius:14, padding:18, width:wide?520:380, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <span style={{ fontWeight:800, fontSize:15, color:T.text }}>{title}</span>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:20, lineHeight:1, padding:0 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
