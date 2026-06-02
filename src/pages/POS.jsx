/**
 * KAVO-SYS · POS · Minimal Safe Version
 *
 * All helpers are `function` declarations (hoisted by JS engine).
 * No `const` arrow at module level that references another module-level `const`.
 * This eliminates the Temporal Dead Zone crash in Chrome V8 when Rollup
 * flattens all modules into one scope.
 *
 * Included: menu, cart, payment, send-to-kitchen, hold, void, discount
 * Excluded (for now): receipt printing, audit logs, modifier picker,
 *                     backup/restore, inventory deduction
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth, ROLE_META } from "../auth/AuthProvider";
import { OrderService, HeldOrderService } from "../db/services/orders.js";
import { KitchenService }                 from "../db/services/kitchen.js";
import { MenuService }                    from "../db/services/menu.js";
import { SettingsService }               from "../db/services/settings.js";
import { useLang, LangSwitcher }         from "../i18n/LanguageContext.jsx";
import { ReceiptService }                from "../db/services/receipts.js";
import { InventoryService }              from "../db/services/inventory.js";
import { TableService }                  from "../db/services/tables.js";
import { useActiveShift }                from "../hooks/useActiveShift.js";

/* ─────────────────────────────────────────────────────────────────────
   HELPERS — all `function` declarations so they are hoisted.
   No module-level `const X = () => ...` that Rollup could mis-order.
───────────────────────────────────────────────────────────────────── */

function safeNum(v) { var n = +v; return isFinite(n) ? n : 0; }
function safeArr(v, d) { return Array.isArray(v) ? v : (d || []); }
function safeObj(v, d) { return (v && typeof v === "object" && !Array.isArray(v)) ? v : (d || {}); }
function roundMoney(v) { return Number(Number(v || 0).toFixed(2)); }
// Sanitize a menu item before it enters cart state or gets stored in any order/receipt.
// Only keeps the fields needed for display, receipts, kitchen, and reports.
// photo/base64/description/modifierGroups and other heavy fields are dropped.
function sanitizeCartItem(item, extraFields) {
  var clean = {
    id:    item.id    || "",
    name:  item.name  || "",
    price: item.price || 0,
    qty:   item.qty   || 1,
    note:  item.note  || "",
    cat:   item.cat   || "",
    em:    item.em    || "",
    bg:    item.bg    || "",
  };
  // Allow callers to merge extra fields (e.g. qty override)
  if (extraFields) {
    var keys = Object.keys(extraFields);
    for (var i = 0; i < keys.length; i++) {
      clean[keys[i]] = extraFields[keys[i]];
    }
  }
  return clean;
}
// Apply sanitizer to an array of cart items (for storage)
function sanitizeCart(cart) {
  return safeArr(cart).map(function(item) { return sanitizeCartItem(item); });
}
function cur(n, s)     { return (s || "$") + safeNum(n).toFixed(2); }
function genNo()       { return "#" + String(Date.now()).slice(-5); }
function nowISO()      { return new Date().toISOString(); }
function clock() {
  var d = new Date();
  return {
    date: d.toLocaleDateString("en-US", {weekday:"short",month:"short",day:"numeric",year:"numeric"}),
    time: d.toLocaleTimeString("en-US", {hour:"2-digit",minute:"2-digit",second:"2-digit"}),
  };
}
function lsGet(k, d) {
  try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e) { return d; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
}

/* ─────────────────────────────────────────────────────────────────────
   DESIGN TOKENS — plain object literal, no references to other consts
───────────────────────────────────────────────────────────────────── */
var T = {
  bg:"#0d1117", surf:"#161b22", card:"#1c2128", border:"#30363d",
  acc:"#f0a500", accDim:"rgba(240,165,0,0.12)",
  text:"#e6edf3", muted:"#7d8590", sub:"#9198a1",
  success:"#3fb950", danger:"#f85149", info:"#58a6ff", warn:"#d29922",
};

/* ─────────────────────────────────────────────────────────────────────
   STYLE HELPERS — functions (hoisted), not const arrows
───────────────────────────────────────────────────────────────────── */
function btnStyle(bg, col, sm) {
  return {
    background: bg, color: col || "#000", border: "none",
    borderRadius: 8, padding: sm ? "6px 12px" : "9px 14px",
    cursor: "pointer", fontWeight: 700, fontSize: sm ? 11 : 12,
    fontFamily: "inherit", transition: "opacity 0.12s", whiteSpace: "nowrap",
  };
}
function ghostStyle(sm) {
  return {
    background: "transparent", color: T.muted,
    border: "1px solid " + T.border,
    borderRadius: 8, padding: sm ? "5px 10px" : "8px 12px",
    cursor: "pointer", fontWeight: 600, fontSize: sm ? 11 : 12,
    fontFamily: "inherit",
  };
}
function inputStyle(w) {
  return {
    width: w || "100%", background: T.surf, border: "1px solid " + T.border,
    borderRadius: 8, padding: "7px 10px", color: T.text,
    fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };
}

/* ─────────────────────────────────────────────────────────────────────
   SEED DATA (fallback if IndexedDB is empty)
───────────────────────────────────────────────────────────────────── */
var SEED_CATS = [
  {id:"all",name:"All",icon:"🍽"},{id:"hot",name:"Hot Drinks",icon:"☕"},
  {id:"cold",name:"Cold Drinks",icon:"🧋"},{id:"food",name:"Food",icon:"🍔"},
  {id:"desserts",name:"Desserts",icon:"🍰"},{id:"specials",name:"Star Pick",icon:"⭐"},
];
var SEED_MENU = [
  {id:"m1",cat:"hot",name:"Espresso",    price:3.50,bg:"#7c3aed",em:"☕"},
  {id:"m2",cat:"hot",name:"Cappuccino",  price:4.50,bg:"#92400e",em:"☕"},
  {id:"m3",cat:"hot",name:"Latte",       price:5.00,bg:"#78716c",em:"🥛"},
  {id:"m4",cat:"hot",name:"Americano",   price:4.00,bg:"#1c1917",em:"☕"},
  {id:"m5",cat:"hot",name:"Hot Chocolate",price:5.50,bg:"#78350f",em:"🍫"},
  {id:"m6",cat:"cold",name:"Iced Latte", price:5.50,bg:"#0c4a6e",em:"🧋"},
  {id:"m7",cat:"cold",name:"Frappuccino",price:6.00,bg:"#1e3a5f",em:"🥤"},
  {id:"m8",cat:"cold",name:"Fresh OJ",   price:4.50,bg:"#c2410c",em:"🍊"},
  {id:"m9",cat:"cold",name:"Lemonade",   price:4.00,bg:"#713f12",em:"🍋"},
  {id:"m10",cat:"food",name:"Club Sandwich",price:8.50,bg:"#92400e",em:"🥪"},
  {id:"m11",cat:"food",name:"Caesar Salad", price:7.50,bg:"#14532d",em:"🥗"},
  {id:"m12",cat:"food",name:"Beef Burger",  price:12.0,bg:"#7f1d1d",em:"🍔"},
  {id:"m13",cat:"desserts",name:"Cheesecake",price:6.00,bg:"#9d174d",em:"🍰"},
  {id:"m14",cat:"desserts",name:"Tiramisu",  price:6.50,bg:"#44403c",em:"🍮"},
  {id:"m15",cat:"specials",name:"Chef Special",price:15.0,bg:"#1e1b4b",em:"⭐"},
];
var DEFAULT_SETTINGS = { taxRate:11, serviceRate:10, currency:"$", cashier:"Cashier", branch:"KAVO", shift:"SHF-001" };

/* ─────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────── */
export default function POS({ onNavigate }) {
  if (!onNavigate) onNavigate = function() {};

  var { user, logout, can } = useAuth();
  var lang = useLang();  // use lang.t() to avoid shadowing by loop vars named "t"

  // ── Safe translation helper (never throws, falls back to English) ──
  function tr(key, fallback) {
    try {
      var val = lang && lang.t ? lang.t(key) : null;
      return val || fallback || key;
    } catch(e) {
      return fallback || key;
    }
  }
  var userMeta = ROLE_META[user && user.role] || ROLE_META.cashier;
  // Get active shift for linking orders to shifts (read-only — Reports manages open/close)
  var { activeShift } = useActiveShift();
  var sym = "$";

  // ── Settings (loaded from IDB async) ──
  var [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(function() {
    SettingsService.getAppSettings().then(function(s) {
      if (s) setSettings(Object.assign({}, DEFAULT_SETTINGS, s));
    }).catch(function() {});
  }, []);

  // ── Tables (for dine-in table picker) ──
  var [tables, setTables]           = useState([]);
  var [showTablePicker, setShowTablePicker] = useState(false);
  // tableConflict: {held: heldOrder} — shows the "table has active order" modal
  var [tableConflict, setTableConflict]   = useState(null);

  useEffect(function() {
    try { TableService.seedIfEmpty(); const t = TableService.getActive(); if (t.length > 0) setTables(t); } catch(_) {}
  }, []);

  // ── Menu + categories ──
  var [menu, setMenu]         = useState(SEED_MENU);
  var [categories, setCategories] = useState(SEED_CATS);
  var [activeCat, setActiveCat]   = useState("all");
  var [menuSearch, setMenuSearch] = useState("");

  useEffect(function() {
    MenuService.getAll().then(function(items) {
      if (Array.isArray(items) && items.length > 0) {
        setMenu(items.filter(function(i) { return i.active !== false && !i.outOfStock; }));
      }
    }).catch(function() {});
    MenuService.getCategories().then(function(cats) {
      if (Array.isArray(cats) && cats.length > 0) setCategories(cats);
    }).catch(function() {});
  }, []);

  // ── Order state ──
  var [orderNo, setOrderNo]   = useState(genNo);
  var [type, setType]         = useState("dine-in");
  var [tableNo, setTableNo]   = useState("");
  var [custName, setCustName]           = useState("");
  var [custPhone, setCustPhone]         = useState("");
  var [deliveryAddr, setDeliveryAddr]   = useState("");
  var [orderNotes, setOrderNotes]       = useState("");  // takeaway notes / delivery notes
  var [cart, setCart]         = useState([]);
  var [discPct, setDiscPct]   = useState(0);
  var [payMethod, setPayMethod] = useState("Cash");
  var [status, setStatus]     = useState("New");
  var [modal, setModal]           = useState(null); // "payment"|"held"|"note"|"kitchen"
  var [receiptOrder, setReceiptOrder] = useState(null); // set after payment → shows receipt preview
  var [noteItemId, setNoteItemId] = useState(null);
  var [noteText, setNoteText]   = useState("");
  var [paidInput, setPaidInput]         = useState("");
  var [splitAmounts, setSplitAmounts]   = useState({Cash:0, Card:0, Whish:0});
  var [held, setHeld]           = useState(function() { return safeArr(lsGet("kavo_held", []), []); });
  var [tableId, setTableId]     = useState(""); // ID of the selected table object
  var [toast, setToast]         = useState(null);
  var [ticker, setTicker]       = useState(clock);

  // ── History from IDB ──
  var [history, setHistory] = useState([]);
  useEffect(function() {
    OrderService.getAll().then(function(o) {
      if (Array.isArray(o) && o.length > 0) setHistory(o);
    }).catch(function() {});
    HeldOrderService.getAll().then(function(h) {
      if (Array.isArray(h) && h.length > 0) setHeld(h);
    }).catch(function() {});
  }, []);

  // ── Clock tick ──
  useEffect(function() {
    var tickTimer = setInterval(function() { setTicker(clock()); }, 1000);
    return function() { clearInterval(tickTimer); };
  }, []);

  function showToast(msg, type) {
    setToast({ msg: msg, type: type || "ok" });
    setTimeout(function() { setToast(null); }, 2600);
  }

  // ── Totals ──
  var subtotal  = roundMoney(cart.reduce(function(s, i) { return s + safeNum(i.price) * safeNum(i.qty); }, 0));
  var discAmt   = roundMoney(subtotal * safeNum(discPct) / 100);
  var afterDisc = roundMoney(subtotal - discAmt);
  var taxEnabled = settings.enableTax !== false;
  var svcEnabled = settings.enableService !== false;
  var svcAmt    = svcEnabled ? roundMoney(afterDisc * safeNum(settings.serviceRate) / 100) : 0;
  var vatAmt    = taxEnabled ? roundMoney((afterDisc + svcAmt) * safeNum(settings.taxRate) / 100) : 0;
  var grand     = roundMoney(afterDisc + svcAmt + vatAmt);
  var paidNum   = safeNum(paidInput);
  var change    = roundMoney(Math.max(0, paidNum - grand));

  // ── Filtered menu ──
  var filteredMenu = menu.filter(function(item) {
    var matchCat = activeCat === "all" || item.cat === activeCat;
    var matchQ   = !menuSearch || (item.name || "").toLowerCase().includes(menuSearch.toLowerCase());
    return matchCat && matchQ;
  });

  // ── Cart actions ──
  function addItem(item) {
    setCart(function(c) {
      var ex = c.find(function(i) { return i.id === item.id; });
      if (ex) return c.map(function(i) { return i.id === item.id ? Object.assign({}, i, {qty: i.qty + 1}) : i; });
      // sanitizeCartItem strips photo/base64 before photo ever enters cart state
      return c.concat([sanitizeCartItem(item, {qty: 1, note: ""})]);
    });
  }
  function adjQty(id, d) {
    setCart(function(c) {
      return c.map(function(i) { return i.id === id ? Object.assign({}, i, {qty: Math.max(1, i.qty + d)}) : i; });
    });
  }
  function remItem(id) {
    setCart(function(c) { return c.filter(function(i) { return i.id !== id; }); });
  }
  function openNote(item) { setNoteItemId(item.id); setNoteText(item.note || ""); setModal("note"); }
  function saveNote() {
    setCart(function(c) { return c.map(function(i) { return i.id === noteItemId ? Object.assign({}, i, {note: noteText}) : i; }); });
    setModal(null);
  }

  // ── Order reset ──
  function resetOrder() {
    setOrderNo(genNo()); setCart([]); setDiscPct(0); setStatus("New");
    setType("dine-in"); setTableNo(""); setTableId(""); setCustName("");
    setCustPhone(""); setDeliveryAddr(""); setOrderNotes(""); setPaidInput("");
    setSplitAmounts({Cash:0, Card:0, Whish:0});
    setPayMethod("Cash"); setModal(null);
  }

  // ── Hold / resume ──
  // ── Order validation — runs before any action ──
  function validateOrder() {
    if (!cart.length) { showToast(tr("cartEmpty","Cart is empty"), "err"); return false; }
    if (type === "dine-in") {
      if (!tableNo) { showToast("Please select a table", "err"); setShowTablePicker(true); return false; }
    }
    if (type === "takeaway" || type === "delivery") {
      if (!custName.trim()) { showToast("Please enter customer name", "err"); return false; }
      if (!custPhone.trim()) { showToast("Please enter phone number", "err"); return false; }
    }
    if (type === "delivery") {
      if (!deliveryAddr.trim()) { showToast("Please enter delivery address", "err"); return false; }
    }
    return true;
  }

  function holdOrder() {
    if (!validateOrder()) return;
    // Block duplicate held orders for the same dine-in table
    if (type === "dine-in" && tableId) {
      var existingForTable = held.find(function(h) {
        return h.tableId === tableId || h.tableNo === tableNo;
      });
      if (existingForTable && existingForTable.orderNo !== orderNo) {
        // Show explicit conflict modal instead of silent resume
        setTableConflict({ held: existingForTable });
        return;
      }
    }
    var o = { orderNo: orderNo, type: type, tableNo: tableNo, custName: custName,
               custPhone: custPhone, deliveryAddr: deliveryAddr, orderNotes: orderNotes,
               cart: sanitizeCart(cart), discPct: discPct, status: status, heldAt: nowISO() };
    var upd = held.concat([o]);
    setHeld(upd); lsSet("kavo_held", upd);
    HeldOrderService.save(o).catch(function() {});
    // Mark table Occupied when a dine-in order is held
    if (type === "dine-in" && tableId) { try { TableService.occupy(tableId); } catch(_) {} }
    showToast("Order " + orderNo + " held");
    resetOrder();
  }
  function resumeOrder(h) {
    setOrderNo(h.orderNo); setType(h.type || "dine-in"); setTableNo(h.tableNo || ""); setTableId(h.tableId || "");
    setCustName(h.custName || ""); setCustPhone(h.custPhone || "");
    setDeliveryAddr(h.deliveryAddr || ""); setOrderNotes(h.orderNotes || "");
    setCart(safeArr(h.cart)); setDiscPct(h.discPct || 0); setStatus(h.status || "New");
    var upd = held.filter(function(x) { return x.orderNo !== h.orderNo; });
    setHeld(upd); lsSet("kavo_held", upd);
    HeldOrderService.delete(h.orderNo).catch(function() {});
    setModal(null); showToast("Resumed " + h.orderNo);
  }
  function removeHeld(no) {
    var upd = held.filter(function(h) { return h.orderNo !== no; });
    setHeld(upd); lsSet("kavo_held", upd);
    HeldOrderService.delete(no).catch(function() {});
  }

  // ── Send to kitchen ──
  function sendKitchen() {
    if (!validateOrder()) return;
    var kitchenOrder = {
      id: orderNo, orderNo: orderNo, type: type, tableNo: tableNo, custName: custName,
      custPhone: custPhone, deliveryAddr: deliveryAddr, orderNotes: orderNotes,
      cart: sanitizeCart(cart), status: "New", priority: "Normal", sentAt: nowISO(), updatedAt: nowISO(),
    };
    var queue = safeArr(lsGet("kavo_kitchen", []), []);
    var existIdx = queue.findIndex(function(o) { return o.id === orderNo; });
    if (existIdx >= 0) queue[existIdx] = kitchenOrder; else queue.unshift(kitchenOrder);
    lsSet("kavo_kitchen", queue);
    KitchenService.save(kitchenOrder).catch(function() {});
    // Mark table Occupied as soon as order goes to kitchen
    if (type === "dine-in" && tableId) { try { TableService.occupy(tableId); } catch(_) {} }
    // Keep order in held[] so the table picker can find and resume it after kitchen workflow
    // (status "Preparing" signals it's been sent — not a plain hold)
    var openOrder = {
      orderNo: orderNo, type: type, tableNo: tableNo, tableId: tableId,
      custName: custName, custPhone: custPhone, deliveryAddr: deliveryAddr,
      orderNotes: orderNotes, cart: sanitizeCart(cart),
      discPct: discPct, status: "Preparing", heldAt: nowISO(),
    };
    var existHeldIdx = held.findIndex(function(h) { return h.orderNo === orderNo; });
    var updHeld = existHeldIdx >= 0
      ? held.map(function(h) { return h.orderNo === orderNo ? openOrder : h; })
      : held.concat([openOrder]);
    setHeld(updHeld); lsSet("kavo_held", updHeld);
    HeldOrderService.save(openOrder).catch(function() {});
    setStatus("Preparing"); setModal("kitchen"); showToast("Sent to kitchen", "ok");
  }

  // ── Save / pay ──
  function saveOrder(pay) {
    if (!validateOrder()) return null;
    // Round every money field at the point of storage — guarantees clean values
    // in localStorage, IndexedDB, receipts, and backup exports regardless of
    // any floating-point drift from upstream calculations.
    var o = {
      orderNo:   orderNo,
      type:      type,
      tableNo:   tableNo,
      custName:  custName,
      custPhone: custPhone,
      deliveryAddr: deliveryAddr,
      orderNotes: orderNotes,
      cart:      sanitizeCart(cart),
      subtotal:  roundMoney(subtotal),
      discAmt:   roundMoney(discAmt),
      svcAmt:    roundMoney(svcAmt),
      vatAmt:    roundMoney(vatAmt),
      grand:     roundMoney(grand),
      discPct:   discPct,
      payMethod: payMethod === "Split" ? "split" : payMethod,
      payments: payMethod === "Split"
        ? Object.entries(splitAmounts).filter(function(e){return e[1]>0;}).map(function(e){return {method:e[0],amount:roundMoney(e[1])};})
        : [{method: payMethod, amount: roundMoney(paidNum || grand)}],
      amtPaid:   roundMoney(paidNum || grand),
      change:    roundMoney(change),
      status:    pay ? "Paid" : status,
      cashier:   settings.cashier,
      branch:    settings.branch,
      shift:     settings.shift,
      shiftId:   activeShift ? activeShift.shiftId : null,
      savedAt:   nowISO(),
    };
    var upd = [o].concat(history); setHistory(upd); lsSet("kavo_orders", upd);
    OrderService.save(o).catch(function() {});
    // Occupy the table as soon as a dine-in order is saved (not just on kitchen send)
    if (type === "dine-in" && tableId && !pay) {
      try { TableService.occupy(tableId); } catch(_) {}
    }
    if (pay) {
      setStatus("Paid");
      // Deduct inventory for cart items that have recipes (non-blocking, background)
      InventoryService.deductForOrder(cart, o.orderNo, false).catch(function() {});
      // On payment: set table to Cleaning (staff cleans before seating next guests)
      // Table transitions: Occupied → Cleaning → Available (via Settings > Tables)
      if (tableId) { try { TableService.setStatus(tableId, "Cleaning"); } catch(_) {} }
      // Save receipt record
      var rcp = { receiptId: "RCP-" + Date.now(), printedAt: nowISO(),
                   order: o, printedDate: new Date().toLocaleDateString("en-GB") };
      ReceiptService.save(rcp).catch(function() {});
    } else {
      showToast("Order saved", "ok");
    }
    return o; // caller uses this for receipt preview
  }

  function voidOrder() {
    if (!can("canVoidOrders")) {
      showToast("Manager approval required to void orders", "err");
      return;
    }
    if (window.confirm(tr("voidOrder","🚫 Void").replace("🚫 ","") + " " + orderNo + "?")) {
      // Check if this order was already paid (has been deducted) — only restore if status is Paid
      if (status === "Paid") {
        InventoryService.restoreForOrder(cart, orderNo, settings.cashier).catch(function() {});
      if (tableId) { try { TableService.release(tableId); } catch(_) {} }
      }
      resetOrder();
      showToast("Order voided", "warn");
    }
  }

  // ── CSV export ──
  function exportCSV() {
    var hdr = "Order,Date,Type,Items,Total,Payment\n";
    var rows = history.map(function(o) {
      return [o.orderNo, o.savedAt, o.type,
              safeArr(o.cart).map(function(i) { return i.name + " x" + i.qty; }).join("; "),
              safeNum(o.grand).toFixed(2), o.payMethod
      ].map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\n");
    var blob = new Blob([hdr + rows], {type:"text/csv"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "KAVO_orders.csv"; a.click();
    showToast("CSV exported");
  }

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100vh", background:T.bg, color:T.text,
                  fontFamily:"system-ui,-apple-system,sans-serif", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${T.bg}}::-webkit-scrollbar-thumb{background:${T.border};border-radius:4px}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .pos-tile:hover{opacity:0.85;transform:scale(0.98);}
        .pos-tile{transition:opacity .12s,transform .12s;}
        .pos-btn:hover{opacity:0.82;}.pos-btn{transition:opacity .14s;}
        .pos-row:hover{background:${T.border}20!important;}
        input:focus{border-color:${T.acc}!important;outline:none;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
      `}</style>

      {/* ── LEFT: Menu ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", borderRight:"1px solid " + T.border, minWidth:0 }}>

        {/* Topbar */}
        <header style={{ background:T.surf, borderBottom:"2px solid " + T.acc, padding:"0 12px",
                         height:50, display:"flex", alignItems:"center", gap:8, flexShrink:0, flexWrap:"wrap" }}>
          <span style={{ fontWeight:900, fontSize:16, color:T.acc, letterSpacing:".07em" }}>
            KAVO<span style={{ color:T.text, opacity:.3 }}>-SYS</span>
          </span>
          <div style={{ width:1, height:20, background:T.border }}/>
          <span style={{ fontSize:10, color:T.muted }}>{ticker.date} · {ticker.time}</span>
          <div style={{ flex:1 }}/>
          {/* Nav buttons */}
          <button className="pos-btn" onClick={function() { onNavigate("home"); }} style={ghostStyle(true)}>🏠 Home</button>
          {can("canAccessReports") &&
            <button className="pos-btn" onClick={function() { onNavigate("reports"); }} style={ghostStyle(true)}>{tr("reports","Reports")}</button>}
          {(can("canAccessSettings") || can("canManageMenu")) &&
            <button className="pos-btn" onClick={function() { onNavigate("inventory"); }} style={ghostStyle(true)}>{tr("inventory","Inventory")}</button>}
          {can("canManageMenu") &&
            <button className="pos-btn" onClick={function() { onNavigate("menu"); }} style={ghostStyle(true)}>{tr("menu","Menu")}</button>}
          <LangSwitcher/>
          {can("canBackupRestore") &&
            <button className="pos-btn" onClick={function() { onNavigate("data"); }} style={Object.assign({}, ghostStyle(true), {borderColor: T.acc + "40", color: T.acc})}>{tr("backup","Backup")}</button>}
          {can("canAccessSettings") &&
            <button className="pos-btn" onClick={function() { onNavigate("settings"); }} style={Object.assign({}, ghostStyle(true), {borderColor: T.acc + "40", color: T.acc})}>{tr("settings","Settings")}</button>}
          <div style={{ height:24, width:1, background:T.border }}/>
          {/* User */}
          <div style={{ background: userMeta.bg, border:"1px solid " + userMeta.color + "40",
                        borderRadius:20, padding:"3px 10px", display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ fontSize:12 }}>{userMeta.icon}</span>
            <span style={{ fontSize:11, fontWeight:700, color:userMeta.color }}>{user && user.name}</span>
          </div>
          <button className="pos-btn" onClick={logout} style={ghostStyle(true)} title={tr("signOut","Sign Out")}>↩</button>
        </header>

        {/* Category bar */}
        <div style={{ display:"flex", gap:6, padding:"8px 12px", background:T.surf,
                      borderBottom:"1px solid " + T.border, overflowX:"auto", flexShrink:0 }}>
          {categories.map(function(c) {
            return (
              <button key={c.id} className="pos-btn"
                onClick={function() { setActiveCat(c.id); }}
                style={{ background: activeCat === c.id ? T.acc + "22" : "transparent",
                         border:"1px solid " + (activeCat === c.id ? T.acc + "60" : T.border),
                         color: activeCat === c.id ? T.acc : T.muted,
                         borderRadius:20, padding:"4px 12px", cursor:"pointer",
                         fontSize:11, fontWeight:700, fontFamily:"inherit",
                         display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap" }}>
                <span>{c.icon}</span><span>{c.name}</span>
              </button>
            );
          })}
          <div style={{ flex:1 }}/>
          <input value={menuSearch} onChange={function(e) { setMenuSearch(e.target.value); }}
            placeholder="Search…" style={Object.assign({}, inputStyle("140px"), {padding:"4px 8px", fontSize:11})}/>
        </div>

        {/* Menu grid */}
        <div style={{ flex:1, overflowY:"auto", padding:"10px 12px",
                      display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:8, alignContent:"start" }}>
          {filteredMenu.map(function(item) {
            return (
              <button key={item.id} className="pos-tile"
                onClick={function() { addItem(item); }}
                style={{ background: item.bg || "#1c2128", borderRadius:10,
                         border:"1px solid " + T.border, padding:"10px 8px",
                         textAlign:"center", cursor:"pointer", fontFamily:"inherit" }}>
                <div style={{ width:48, height:48, margin:"0 auto 6px", borderRadius:8,
                              background:item.bg||T.card, overflow:"hidden",
                              display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {item.photo
                    ? <img src={item.photo} alt={item.name}
                           style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                    : <span style={{ fontSize:24 }}>{item.em || "🍽"}</span>
                  }
                </div>
                <div style={{ fontSize:11, fontWeight:700, color:T.text, marginBottom:3,
                              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {item.name}
                </div>
                <div style={{ fontSize:11, fontWeight:800, color:T.acc,
                              fontFamily:"'JetBrains Mono',monospace" }}>
                  {cur(item.price, sym)}
                </div>
              </button>
            );
          })}
          {filteredMenu.length === 0 && (
            <div style={{ gridColumn:"1/-1", textAlign:"center", color:T.muted, padding:"30px 0" }}>
              No items found
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Cart & Order ── */}
      <div style={{ width:340, display:"flex", flexDirection:"column", background:T.surf }}>

        {/* Order header */}
        <div style={{ padding:"8px 12px", borderBottom:"1px solid " + T.border, flexShrink:0 }}>
          <div style={{ display:"flex", gap:6, marginBottom:6 }}>
            {[
              { value:"dine-in",  label:"🍽 " + tr("dineIn","Dine-In"),   flag: tr("dineIn","Dine-In")   },
              { value:"takeaway", label:"🛍 " + tr("takeaway","Takeaway"),  flag: tr("takeaway","Takeaway") },
              { value:"delivery", label:"🛵 " + tr("delivery","Delivery"),  flag: tr("delivery","Delivery") },
            ].map(function(otype) {
              return (
                <button key={otype.value} className="pos-btn"
                  onClick={function() { setType(otype.value); }}
                  style={{ flex:1, background: type === otype.value ? T.acc + "22" : "transparent",
                           border:"1px solid " + (type === otype.value ? T.acc : T.border),
                           color: type === otype.value ? T.acc : T.muted,
                           borderRadius:7, padding:"5px 0", cursor:"pointer",
                           fontSize:10, fontWeight:700, fontFamily:"inherit" }}>
                  {otype.label}
                </button>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {/* Table picker — button for dine-in (required), free text for takeaway/delivery */}
            {type === "dine-in" ? (
              <button className="pos-btn"
                onClick={function() { setShowTablePicker(true); }}
                style={Object.assign({}, inputStyle("auto"), {
                  flex:1, padding:"5px 8px", fontSize:11, cursor:"pointer",
                  textAlign:"left", display:"flex", alignItems:"center", gap:6,
                  border: tableNo ? "1px solid " + T.acc + "60" : "1px solid " + T.border,
                  color: tableNo ? T.acc : T.muted,
                })}>
                <span>🪑</span>
                <span>{tableNo ? ("Table " + tableNo) : tr("tableNo","Table #")}</span>
                {!tableNo && <span style={{ marginLeft:"auto", fontSize:9, color:"#f85149" }}>required</span>}
              </button>
            ) : null}
            <input value={custName} onChange={function(e) { setCustName(e.target.value); }}
              placeholder={type === "dine-in" ? tr("customerName","Customer name (optional)") : tr("customerName","Customer name") + " *"}
              style={Object.assign({}, inputStyle(), {
                flex:2, padding:"5px 8px", fontSize:11,
                border: (type !== "dine-in" && !custName)
                  ? "1px solid #f8514940" : "1px solid " + T.border
              })}/>
          </div>
          {/* Phone + address — required for takeaway/delivery */}
          {(type === "takeaway" || type === "delivery") && (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <input value={custPhone} onChange={function(e) { setCustPhone(e.target.value); }}
                placeholder="📞 Phone number *"
                style={Object.assign({}, inputStyle(), {
                  padding:"5px 8px", fontSize:11,
                  border: !custPhone ? "1px solid #f8514940" : "1px solid " + T.border
                })}/>
              {type === "delivery" && (
                <textarea value={deliveryAddr} onChange={function(e) { setDeliveryAddr(e.target.value); }}
                  placeholder={"📍 Delivery address *\nBuilding, floor, street, landmark…"}
                  rows={3}
                  style={Object.assign({}, inputStyle(), {
                    padding:"6px 8px", fontSize:11, resize:"vertical", minHeight:70,
                    lineHeight:1.4, fontFamily:"inherit",
                    border: !deliveryAddr ? "1px solid #f8514940" : "1px solid " + T.border
                  })}/>
              )}
              <textarea value={orderNotes} onChange={function(e) { setOrderNotes(e.target.value); }}
                placeholder={type === "delivery" ? "🗒 Delivery notes (optional)…" : "🗒 Takeaway notes (optional)…"}
                rows={2}
                style={Object.assign({}, inputStyle(), {
                  padding:"5px 8px", fontSize:11, resize:"vertical", minHeight:44,
                  lineHeight:1.4, fontFamily:"inherit", border:"1px solid " + T.border
                })}/>
            </div>
          )}
        </div>

        {/* Order number + status */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                      padding:"4px 12px", flexShrink:0 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:T.acc, fontSize:12 }}>
            {orderNo}
          </span>
          <span style={{ fontSize:10, fontWeight:700,
                         color: status === "Paid" ? T.success : status === "Preparing" ? T.warn : T.info }}>
            {status}
          </span>
        </div>

        {/* Cart items */}
        <div style={{ flex:1, overflowY:"auto", padding:"4px 10px" }}>
          {cart.length === 0 ? (
            <div style={{ textAlign:"center", color:T.muted, padding:"30px 10px" }}>
              <div style={{ fontSize:32, marginBottom:6 }}>🛒</div>
              <div style={{ fontSize:12 }}>Cart is empty</div>
            </div>
          ) : cart.map(function(item) {
            return (
              <div key={item.id} className="pos-row"
                style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 6px",
                         background:T.card, borderRadius:8, marginBottom:4,
                         border:"1px solid " + T.border }}>
                <div style={{ width:30, height:30, borderRadius:7, background:item.bg || T.surf,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              fontSize:16, flexShrink:0, overflow:"hidden" }}>
                  {item.photo
                    ? <img src={item.photo} alt={item.name}
                           style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                    : (item.em || "🍽")
                  }</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:T.text,
                                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize:10, color:T.muted }}>{cur(item.price, sym)} each</div>
                  {item.note && (
                    <div style={{ fontSize:9, color:T.warn, fontStyle:"italic",
                                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      📝 {item.note}
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                  <button onClick={function() { adjQty(item.id, -1); }}
                    style={{ width:22, height:22, borderRadius:5, border:"1px solid " + T.border,
                             background:T.surf, color:T.text, cursor:"pointer", fontSize:13,
                             display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
                  <span style={{ minWidth:18, textAlign:"center", fontWeight:800, fontSize:12,
                                 fontFamily:"'JetBrains Mono',monospace" }}>{item.qty}</span>
                  <button onClick={function() { adjQty(item.id, 1); }}
                    style={{ width:22, height:22, borderRadius:5, border:"1px solid " + T.acc,
                             background:T.accDim, color:T.acc, cursor:"pointer", fontSize:13,
                             display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
                </div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:T.acc,
                              minWidth:48, textAlign:"right", fontSize:11 }}>
                  {cur(item.price * item.qty, sym)}
                </div>
                <button onClick={function() { openNote(item); }}
                  style={{ background:"transparent", border:"none", color:item.note ? T.warn : T.border,
                           cursor:"pointer", fontSize:12, padding:0 }}>📝</button>
                <button onClick={function() { remItem(item.id); }}
                  style={{ background:"transparent", border:"none", color:T.danger,
                           cursor:"pointer", fontSize:12, padding:0 }}>✕</button>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div style={{ borderTop:"1px solid " + T.border, padding:"8px 12px", flexShrink:0 }}>
          {[
            [tr("subtotal","Subtotal"), cur(subtotal, sym), T.sub],
            discPct > 0 ? ["Discount (" + discPct + "%)", "−" + cur(discAmt, sym)] : null,
            svcEnabled ? ["Service (" + settings.serviceRate + "%)", "+" + cur(svcAmt, sym)] : null,
            taxEnabled ? ["VAT (" + settings.taxRate + "%)", "+" + cur(vatAmt, sym)] : null,
          ].filter(Boolean).map(function(row) {
            return (
              <div key={row[0]} style={{ display:"flex", justifyContent:"space-between",
                                         fontSize:11, color:T.muted, marginBottom:3 }}>
                <span>{row[0]}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace" }}>{row[1]}</span>
              </div>
            );
          })}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                        borderTop:"1px solid " + T.border, marginTop:4, paddingTop:6 }}>
            <span style={{ fontWeight:900, fontSize:14, color:T.text }}>TOTAL</span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900,
                           fontSize:18, color:T.acc }}>
              {cur(grand, sym)}
            </span>
          </div>

          {/* Discount input */}
          {can("canApplyDiscount") && (
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <span style={{ fontSize:11, color:T.muted, alignSelf:"center" }}>Disc%:</span>
              <input type="number" min="0" max="100" value={discPct}
                onChange={function(e) {
                  if (!can("canApplyDiscount")) { showToast("Manager approval required", "err"); return; }
                  setDiscPct(safeNum(e.target.value));
                }}
                style={Object.assign({}, inputStyle("60px"), {textAlign:"center", padding:"4px 6px", fontSize:11})}/>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ padding:"8px 10px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, flexShrink:0 }}>
          <button className="pos-btn" onClick={sendKitchen}
            style={btnStyle("#0284c7","#fff")}>{tr("kitchen","🍳 Kitchen")}</button>
          <button className="pos-btn" onClick={holdOrder}
            style={btnStyle(T.warn,"#000")}>{tr("hold","⏸ Hold")}</button>
          {held.length > 0 && (
            <button className="pos-btn" onClick={function() { setModal("held"); }}
              style={Object.assign({}, btnStyle("#334155","#fff"), {gridColumn:"span 2"})}>
              📂 Held Orders ({held.length})
            </button>
          )}
          <button className="pos-btn" onClick={function() { saveOrder(false); }}
            style={btnStyle("#1f2937","#fff")}>{tr("save","💾 Save")}</button>
          {can("canVoidOrders") && (
            <button className="pos-btn" onClick={voidOrder}
              style={btnStyle(T.danger,"#fff")}>{tr("voidOrder","🚫 Void")}</button>
          )}
          <button className="pos-btn" onClick={function() {
              if (!validateOrder()) return;
              setModal("payment");
            }}
            disabled={!cart.length}
            style={Object.assign({}, btnStyle(T.acc,"#000"), {gridColumn:"span 2", padding:"12px 0",
                   fontSize:14, fontWeight:900, opacity: cart.length ? 1 : 0.4})}>
            💳 Pay {cur(grand, sym)}
          </button>
          <button className="pos-btn" onClick={exportCSV}
            style={Object.assign({}, ghostStyle(true), {gridColumn:"span 2"})}>{tr("exportCSV","📥 Export CSV")}</button>
        </div>
      </div>

      {/* ── MODALS ── */}

      {/* Payment modal */}
      {modal === "payment" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex",
                      alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background:T.surf, border:"1px solid " + T.border, borderRadius:14,
                        padding:22, width:340, fontFamily:"inherit" }}>
            <div style={{ fontWeight:800, color:T.text, fontSize:16, marginBottom:14 }}>{tr("payment","💳 Payment")}</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:28,
                          color:T.acc, textAlign:"center", marginBottom:16 }}>
              {cur(grand, sym)}
            </div>
            {/* Payment method */}
            <div style={{ display:"flex", gap:6, marginBottom:14 }}>
              {[
                { value:"Cash",  label: tr("cash","Cash")  },
                { value:"Card",  label: tr("card","Card")  },
                { value:"Split", label: tr("split","Split") },
              ].map(function(pm) {
                return (
                  <button key={pm.value} className="pos-btn"
                    onClick={function() { setPayMethod(pm.value); }}
                    style={{ flex:1, background: payMethod === pm.value ? T.acc + "22" : "transparent",
                             border:"1px solid " + (payMethod === pm.value ? T.acc : T.border),
                             color: payMethod === pm.value ? T.acc : T.muted,
                             borderRadius:8, padding:"7px 0", cursor:"pointer",
                             fontWeight:700, fontSize:12, fontFamily:"inherit" }}>
                    {pm.label}
                  </button>
                );
              })}
            </div>
            {payMethod === "Cash" && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:T.muted, marginBottom:5 }}>{tr("amountPaid","Amount paid")} ({sym})</div>
                <input type="number" min="0" step="0.01" value={paidInput}
                  onChange={function(e) { setPaidInput(e.target.value); }}
                  placeholder={cur(grand, sym)}
                  style={Object.assign({}, inputStyle(), {fontSize:16, fontFamily:"'JetBrains Mono',monospace", textAlign:"right"})}/>
                {paidNum >= grand && (
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:8,
                                fontSize:14, fontWeight:700, color:T.success }}>
                    <span>Change</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(change, sym)}</span>
                  </div>
                )}
              </div>
            )}
            {payMethod === "Split" && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:T.muted, fontWeight:700, marginBottom:8 }}>
                  Split Payment — enter amounts per method
                </div>
                {[
                  {method:"Cash",  icon:"💵"},
                  {method:"Card",  icon:"💳"},
                  {method:"Whish", icon:"📱"},
                ].map(function(pm) {
                  return (
                    <div key={pm.method} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                      <div style={{ width:62, fontSize:11, color:T.muted, fontWeight:600 }}>
                        {pm.icon} {pm.method}
                      </div>
                      <input type="number" min="0" step="0.01"
                        value={splitAmounts[pm.method] || ""}
                        placeholder="0.00"
                        onChange={function(e) {
                          var v = roundMoney(safeNum(e.target.value));
                          setSplitAmounts(function(prev) {
                            return Object.assign({}, prev, {[pm.method]: v});
                          });
                        }}
                        style={Object.assign({}, inputStyle(), {
                          flex:1, fontSize:14, textAlign:"right",
                          fontFamily:"'JetBrains Mono',monospace"
                        })}/>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12,
                                     color:T.muted, width:22, textAlign:"right" }}>{sym}</span>
                    </div>
                  );
                })}
                {/* Running total */}
                {(function() {
                  var splitTotal = roundMoney(Object.values(splitAmounts).reduce(function(s,v){return s+(+v||0);},0));
                  var remaining  = roundMoney(grand - splitTotal);
                  var isExact    = Math.abs(remaining) < 0.005;
                  return (
                    <div style={{ background:T.card, borderRadius:8, padding:"9px 12px", marginTop:4,
                                  border:"1px solid " + (isExact ? T.success+"50" : "#f85149"+"50") }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:3 }}>
                        <span style={{ color:T.muted }}>Split total</span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700,
                                       color: isExact ? T.success : T.text }}>
                          {cur(splitTotal, sym)}
                        </span>
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
                        <span style={{ color:T.muted }}>
                          {isExact ? "✅ Balanced" : remaining > 0 ? "Remaining" : "⚠ Over by"}
                        </span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800,
                                       color: isExact ? T.success : "#f85149" }}>
                          {isExact ? "" : cur(Math.abs(remaining), sym)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            <div style={{ display:"flex", gap:8 }}>
              <button className="pos-btn"
                onClick={function() {
                  // Check inventory availability first (non-blocking warning, not hard block)
                  // Validate split payment amounts sum to grand total
                  if (payMethod === "Split") {
                    var splitTotal = roundMoney(Object.values(splitAmounts).reduce(function(s,v){return s+(+v||0);},0));
                    if (Math.abs(splitTotal - grand) > 0.005) {
                      showToast("Payment amounts must equal invoice total (" + cur(grand, sym) + ")", "err");
                      return;
                    }
                    if (splitTotal <= 0) {
                      showToast("Please enter at least one payment amount", "err");
                      return;
                    }
                  }
                  InventoryService.checkAvailability(cart).then(function(issues) {
                    if (issues && issues.length > 0) {
                      var msgs = issues.map(function(i) {
                        return i.menuItem + ": need " + i.needed + " " + (i.unit||"") +
                               " of " + i.ingredient + ", have " + i.available;
                      }).join("\n");
                      if (!window.confirm("⚠ Insufficient inventory stock:\n" + msgs + "\n\nContinue anyway?")) return;
                    }
                    try {
                      var paid = saveOrder(true);
                      setModal(null);
                      if (paid) { setReceiptOrder(paid); }
                      else { resetOrder(); }
                    } catch(err) {
                      resetOrder(); setModal(null);
                      showToast("Order saved (receipt preview unavailable)", "ok");
                    }
                  }).catch(function() {
                    // If availability check fails, proceed with payment normally
                    try {
                      var paid = saveOrder(true);
                      setModal(null);
                      if (paid) { setReceiptOrder(paid); }
                      else { resetOrder(); }
                    } catch(err) {
                      resetOrder(); setModal(null);
                    }
                  });
                }}
                style={Object.assign({}, btnStyle(T.acc,"#000"), {flex:2, padding:"11px 0", fontWeight:800})}>
                ✅ Confirm Payment
              </button>
              <button className="pos-btn" onClick={function() { setModal(null); }}
                style={Object.assign({}, ghostStyle(), {flex:1})}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Held orders modal */}
      {modal === "held" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex",
                      alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background:T.surf, border:"1px solid " + T.border, borderRadius:14,
                        padding:22, width:420, maxHeight:"82vh", overflowY:"auto" }}>
            <div style={{ fontWeight:800, color:T.text, fontSize:16, marginBottom:14 }}>📂 Held Orders</div>
            {held.length === 0 ? (
              <div style={{ textAlign:"center", color:T.muted, padding:"20px 0" }}>No held orders</div>
            ) : held.map(function(h) {
              var typeCfg = h.type === "dine-in"  ? {icon:"🍽",  label:"Dine-In",  col:"#58a6ff"}
                          : h.type === "takeaway" ? {icon:"🥡",  label:"Takeaway", col:"#f0a500"}
                          : h.type === "delivery" ? {icon:"🚚",  label:"Delivery", col:"#3fb950"}
                          :                         {icon:"🧾",  label:"Order",    col:T.muted};
              var itemCount = safeArr(h.cart).length;
              var total     = roundMoney(safeArr(h.cart).reduce(function(s,i){return s+safeNum(i.price)*safeNum(i.qty);},0));
              var heldTime  = h.heldAt ? new Date(h.heldAt).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}) : "";

              return (
                <div key={h.orderNo} style={{ padding:"10px 12px", background:T.card,
                                               borderRadius:10, marginBottom:7,
                                               border:"1px solid " + typeCfg.col + "30" }}>
                  {/* Type badge + order# + time */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ background:typeCfg.col+"18", border:"1px solid "+typeCfg.col+"40",
                                     borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:800,
                                     color:typeCfg.col }}>
                        {typeCfg.icon} {typeCfg.label}
                      </span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700,
                                     color:T.muted, fontSize:11 }}>{h.orderNo}</span>
                    </div>
                    {heldTime && <span style={{ fontSize:10, color:T.muted }}>🕐 {heldTime}</span>}
                  </div>
                  {/* Context: table / customer */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                    <div style={{ flex:1 }}>
                      {h.type === "dine-in" ? (
                        <div style={{ fontWeight:800, color:T.text, fontSize:13 }}>🪑 Table {h.tableNo || "—"}</div>
                      ) : (
                        <div>
                          {h.custName && <div style={{ fontWeight:700, color:T.text, fontSize:12 }}>👤 {h.custName}</div>}
                          {h.custPhone && <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>📞 {h.custPhone}</div>}
                        </div>
                      )}
                      <div style={{ fontSize:10, color:T.muted, marginTop:3 }}>
                        {itemCount} item{itemCount !== 1 ? "s" : ""}
                        {total > 0 && (
                          <span style={{ color:T.acc, fontWeight:700, marginLeft:8 }}>{cur(total, sym)}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:5, marginLeft:10 }}>
                      <button className="pos-btn" onClick={function() { resumeOrder(h); setModal(null); }}
                        style={Object.assign({}, btnStyle(T.acc,"#000",true), {padding:"5px 14px", fontSize:11})}>
                        Resume
                      </button>
                      <button className="pos-btn" onClick={function() { removeHeld(h.orderNo); }}
                        style={Object.assign({}, ghostStyle(true), {padding:"5px 10px", fontSize:11})}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
            <button className="pos-btn" onClick={function() { setModal(null); }}
              style={Object.assign({}, ghostStyle(), {width:"100%", marginTop:10})}>Close</button>
          </div>
        </div>
      )}
      {/* Note modal */}
      {modal === "note" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex",
                      alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background:T.surf, border:"1px solid " + T.border, borderRadius:14,
                        padding:22, width:340 }}>
            <div style={{ fontWeight:800, color:T.text, fontSize:15, marginBottom:12 }}>📝 Item Note</div>
            <input value={noteText} onChange={function(e) { setNoteText(e.target.value); }}
              placeholder="e.g. no sugar, extra hot…"
              style={Object.assign({}, inputStyle(), {marginBottom:12})}/>
            <div style={{ display:"flex", gap:8 }}>
              <button className="pos-btn" onClick={saveNote}
                style={Object.assign({}, btnStyle(T.acc,"#000"), {flex:1})}>Save</button>
              <button className="pos-btn" onClick={function() { setModal(null); }}
                style={Object.assign({}, ghostStyle(), {flex:1})}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Kitchen confirm modal */}
      {modal === "kitchen" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex",
                      alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background:T.surf, border:"1px solid " + T.border, borderRadius:14,
                        padding:22, width:320, textAlign:"center" }}>
            <div style={{ fontSize:36, marginBottom:8 }}>🍳</div>
            <div style={{ fontWeight:800, color:T.success, fontSize:15, marginBottom:8 }}>
              Sent to Kitchen
            </div>
            <div style={{ fontSize:12, color:T.muted, marginBottom:16 }}>
              Order {orderNo} has been sent.
            </div>
            <button className="pos-btn" onClick={function() { setModal(null); }}
              style={Object.assign({}, btnStyle(T.acc,"#000"), {width:"100%"})}>OK</button>
          </div>
        </div>
      )}

      {/* ── RECEIPT PREVIEW MODAL ── */}
      {receiptOrder && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.80)", display:"flex",
                      alignItems:"center", justifyContent:"center", zIndex:1100, padding:16 }}>
          <div style={{ background:"#0b1220", border:"1px solid " + T.border, borderRadius:16,
                        width:400, maxWidth:"96vw", maxHeight:"90vh", display:"flex",
                        flexDirection:"column", boxShadow:"0 24px 60px rgba(0,0,0,0.7)" }}>

            {/* Header */}
            <div style={{ padding:"16px 18px 12px", borderBottom:"1px solid " + T.border,
                          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:900, color:T.acc, fontSize:15, letterSpacing:".04em" }}>
                🧾 Receipt Preview
              </div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700,
                            color:"#4a6080", fontSize:12 }}>
                {receiptOrder.orderNo}
              </div>
            </div>

            {/* Scrollable receipt body */}
            <div id="kavo-receipt-print" style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>

              {/* Business name */}
              <div style={{ textAlign:"center", marginBottom:12 }}>
                <div style={{ fontWeight:900, color:T.text, fontSize:14 }}>
                  {settings.branch || "KAVO Restaurant"}
                </div>
                <div style={{ fontSize:11, color:"#4a6080", marginTop:2 }}>
                  {new Date(receiptOrder.savedAt).toLocaleString("en-US",
                    {weekday:"short", month:"short", day:"2-digit",
                     hour:"2-digit", minute:"2-digit"})}
                </div>
              </div>

              {/* Order meta — type badge + customer block */}
              <div style={{ borderTop:"1px dashed #1e2d4a", borderBottom:"1px dashed #1e2d4a",
                            padding:"9px 0", marginBottom:10 }}>
                {(function() {
                  var o = receiptOrder;

                  // ── Type badge ──
                  var typeCfg = o.type === "dine-in"  ? {icon:"🍽", label:"DINE-IN",   col:"#58a6ff"}
                              : o.type === "takeaway" ? {icon:"🛍", label:"TAKEAWAY",  col:"#f0a500"}
                              : o.type === "delivery" ? {icon:"🚚", label:"DELIVERY",  col:"#3fb950"}
                              : {icon:"🧾", label:(o.type||"ORDER").toUpperCase(), col:"#7d8590"};

                  // ── Flat meta rows (order, cashier) ──
                  var metaRows = [
                    ["Order",                       o.orderNo],
                    [tr("receiptCashier","Cashier"), o.cashier || "—"],
                    o.tableNo ? [tr("receiptTable","Table"), o.tableNo] : null,
                  ].filter(Boolean);

                  // ── Customer info section ──
                  var hasCustomer = o.custName || o.custPhone;
                  var hasAddress  = o.deliveryAddr && o.deliveryAddr.trim();
                  var hasNotes    = o.orderNotes && o.orderNotes.trim();

                  return (
                    <div>
                      {/* Type badge */}
                      <div style={{ display:"flex", justifyContent:"center", marginBottom:8 }}>
                        <div style={{ background:typeCfg.col+"18", border:"1.5px solid "+typeCfg.col+"40",
                                      borderRadius:20, padding:"4px 16px", display:"inline-flex",
                                      alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:14 }}>{typeCfg.icon}</span>
                          <span style={{ fontSize:12, fontWeight:900, color:typeCfg.col,
                                         letterSpacing:".08em" }}>{typeCfg.label}</span>
                        </div>
                      </div>

                      {/* Flat meta rows */}
                      {metaRows.map(function(row) {
                        return (
                          <div key={row[0]} style={{ display:"flex", justifyContent:"space-between",
                                                     fontSize:11, padding:"2px 0" }}>
                            <span style={{ color:"#4a6080" }}>{row[0]}</span>
                            <span style={{ color:T.sub, fontWeight:600 }}>{row[1]}</span>
                          </div>
                        );
                      })}

                      {/* Customer Information group */}
                      {hasCustomer && (
                        <div style={{ marginTop:8, background:"#0e1826", borderRadius:8,
                                      border:"1px solid #1e2d4a", padding:"8px 10px" }}>
                          <div style={{ fontSize:9, color:"#4a6080", fontWeight:800,
                                        letterSpacing:".1em", marginBottom:6 }}>
                            👤 CUSTOMER INFORMATION
                          </div>
                          {o.custName && (
                            <div style={{ fontSize:11, marginBottom:3 }}>
                              <span style={{ color:"#4a6080" }}>Name: </span>
                              <span style={{ color:T.sub, fontWeight:700 }}>{o.custName}</span>
                            </div>
                          )}
                          {o.custPhone && (
                            <div style={{ fontSize:11 }}>
                              <span style={{ color:"#4a6080" }}>Phone: </span>
                              <span style={{ color:T.sub, fontWeight:700 }}>{o.custPhone}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Delivery address block */}
                      {hasAddress && (
                        <div style={{ marginTop:6, background:"#0b1825", borderRadius:8,
                                      border:"1px solid #1a2f20", padding:"8px 10px" }}>
                          <div style={{ fontSize:9, color:"#3fb950", fontWeight:800,
                                        letterSpacing:".1em", marginBottom:5, display:"flex",
                                        alignItems:"center", gap:5 }}>
                            📍 DELIVERY ADDRESS
                          </div>
                          <div style={{ fontSize:11, color:T.sub, fontWeight:600,
                                        whiteSpace:"pre-wrap", wordBreak:"break-word",
                                        lineHeight:1.6, textAlign:"left" }}>
                            {o.deliveryAddr.trim()}
                          </div>
                        </div>
                      )}

                      {/* Notes block — hidden when empty */}
                      {hasNotes && (
                        <div style={{ marginTop:6, background:"#14120a", borderRadius:8,
                                      border:"1px solid #2a200a", padding:"8px 10px" }}>
                          <div style={{ fontSize:9, color:"#f0a500", fontWeight:800,
                                        letterSpacing:".1em", marginBottom:5 }}>
                            {o.type === "delivery" ? "📝 DELIVERY NOTES" : "📝 TAKEAWAY NOTES"}
                          </div>
                          <div style={{ fontSize:11, color:T.sub, fontStyle:"italic",
                                        whiteSpace:"pre-wrap", wordBreak:"break-word",
                                        lineHeight:1.6 }}>
                            {o.orderNotes.trim()}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Items */}
              <div style={{ marginBottom:10 }}>
                {safeArr(receiptOrder.cart).map(function(item, i) {
                  return (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between",
                                          alignItems:"flex-start", padding:"5px 0",
                                          borderBottom:"1px solid #0e1826" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:T.text }}>
                          {item.name}
                          {item._modLabel && (
                            <span style={{ fontWeight:400, color:"#4a6080", fontSize:10 }}> · {item._modLabel}</span>
                          )}
                        </div>
                        {item.note && (
                          <div style={{ fontSize:10, color:T.warn, fontStyle:"italic", marginTop:1 }}>
                            📝 {item.note}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0, marginLeft:10 }}>
                        <div style={{ fontSize:11, color:"#4a6080" }}>
                          {cur(item.price, sym)} × {item.qty}
                        </div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800,
                                      fontSize:12, color:T.acc }}>
                          {cur(item.price * item.qty, sym)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Totals */}
              <div style={{ borderTop:"1px solid " + T.border, paddingTop:8 }}>
                {[
                  [tr("subtotal","Subtotal"),                           cur(receiptOrder.subtotal, sym),     T.sub   ],
                  receiptOrder.discAmt > 0
                    ? ["Discount (" + receiptOrder.discPct + "%)", "–" + cur(receiptOrder.discAmt, sym), T.warn]
                    : null,
                  receiptOrder.svcAmt > 0
                    ? [tr("service","Service"),                         "+" + cur(receiptOrder.svcAmt, sym), T.sub]
                    : null,
                  receiptOrder.vatAmt > 0
                    ? [tr("vat","VAT"),                                 "+" + cur(receiptOrder.vatAmt, sym), T.sub]
                    : null,
                ].filter(Boolean).map(function(row) {
                  return (
                    <div key={row[0]} style={{ display:"flex", justifyContent:"space-between",
                                               fontSize:11, marginBottom:4 }}>
                      <span style={{ color:"#4a6080" }}>{row[0]}</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace",
                                     color:row[2], fontWeight:600 }}>{row[1]}</span>
                    </div>
                  );
                })}
                {/* Grand total */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                              borderTop:"1px solid " + T.border, paddingTop:8, marginTop:4 }}>
                  <span style={{ fontWeight:900, color:T.text, fontSize:14 }}>TOTAL</span>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900,
                                 fontSize:20, color:T.acc }}>
                    {cur(receiptOrder.grand, sym)}
                  </span>
                </div>
                {/* Payment info */}
                <div style={{ marginTop:10, padding:"9px 12px", background:"#070c16",
                              borderRadius:9, border:"1px solid #1a2438" }}>
                  {[
                    // Payment row — expand split into individual method lines
                    ...(function() {
                      var o = receiptOrder;
                      if ((o.payMethod === "split" || o.payMethod === "Split") && Array.isArray(o.payments) && o.payments.length > 0) {
                        return [["Payment", "Split"]].concat(
                          o.payments.filter(function(p){return p.amount>0;}).map(function(p) {
                            return ["  " + p.method, cur(p.amount, sym)];
                          })
                        );
                      }
                      return [["Payment", o.payMethod || "—"]];
                    })(),
                    [tr("receiptPaid","Paid"),  cur(receiptOrder.amtPaid, sym)],
                    receiptOrder.change > 0 ? [tr("change","Change"), cur(receiptOrder.change, sym)] : null,
                  ].filter(Boolean).map(function(row) {
                    return (
                      <div key={row[0]} style={{ display:"flex", justifyContent:"space-between",
                                                 fontSize:12, marginBottom:4, lastChild:{marginBottom:0} }}>
                        <span style={{ color:"#4a6080", fontWeight:600 }}>{row[0]}</span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace",
                                       fontWeight:700, color:T.text }}>{row[1]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ textAlign:"center", marginTop:12, fontSize:10, color:"#2a3a50" }}>
                Thank you for your visit!
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ padding:"12px 18px", borderTop:"1px solid " + T.border,
                          display:"flex", gap:8 }}>
              <button className="pos-btn"
                onClick={function() {
                  // Print only the receipt content
                  var content = document.getElementById("kavo-receipt-print");
                  if (!content) { window.print(); return; }
                  var win = window.open("", "_blank", "width=400,height=600");
                  if (!win) { window.print(); return; }
                  win.document.write(
                    "<html><head><title>Receipt " + receiptOrder.orderNo + "</title>" +
                    "<style>body{font-family:monospace;padding:20px;max-width:380px;margin:0 auto}" +
                    "@media print{body{margin:0;padding:8px}}</style></head><body>" +
                    content.innerHTML + "</body></html>"
                  );
                  win.document.close();
                  win.focus();
                  setTimeout(function() { win.print(); }, 300);
                }}
                style={Object.assign({}, btnStyle("#1e3a50","#58a6ff"), {flex:1})}>
                🖨 Print
              </button>
              <button className="pos-btn"
                onClick={function() {
                  // Receipt already saved in IDB by saveOrder — just close
                  showToast(tr("orderSaved","Order paid · Receipt saved"), "ok");
                  setReceiptOrder(null);
                  resetOrder();
                }}
                style={Object.assign({}, btnStyle(T.success,"#000"), {flex:2, fontWeight:800})}>
                ✓ Done / Skip Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TABLE PICKER MODAL ── */}
      {showTablePicker && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.80)", display:"flex",
                      alignItems:"center", justifyContent:"center", zIndex:1200, padding:16 }}>
          <div style={{ background:T.surf, border:"1px solid " + T.border, borderRadius:14,
                        width:420, maxWidth:"96vw", maxHeight:"85vh", display:"flex",
                        flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"14px 16px 10px", borderBottom:"1px solid " + T.border,
                          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:800, color:T.text, fontSize:15 }}>🪑 Select Table</div>
              <button className="pos-btn" onClick={function() { setShowTablePicker(false); }}
                style={{ background:"transparent", border:"none", color:T.muted,
                         fontSize:18, cursor:"pointer", padding:"0 4px" }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:14 }}>
              {tables.length === 0 ? (
                <div style={{ textAlign:"center", padding:"30px 0", color:T.muted }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>🪑</div>
                  <div style={{ fontSize:12 }}>No tables configured.</div>
                  <div style={{ fontSize:11, marginTop:4 }}>Go to Settings → Tables to add tables.</div>
                </div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))", gap:8 }}>
                  {tables.map(function(tbl) {
                    var isOccupied = tbl.status === "Occupied";
                    var isCurrent  = tableNo === tbl.number || tableNo === tbl.label;
                    return (
                      <button key={tbl.id} className="pos-btn"
                        onClick={function() {
                          if (isOccupied && !isCurrent) {
                            // Try to find and resume a held/open order for this table
                            var matchedHeld = held.find(function(h) {
                              return h.tableId === tbl.id || h.tableNo === tbl.number || h.tableNo === (tbl.label || tbl.number);
                            });
                            if (matchedHeld) {
                              // If current cart has items, warn before discarding
                              if (cart.length > 0) {
                                setShowTablePicker(false);
                                setTableConflict({ held: matchedHeld });
                                return;
                              }
                              resumeOrder(matchedHeld);
                              setShowTablePicker(false);
                              return;
                            }
                            // Occupied but no active order found — offer to clear the stale status
                            if (!window.confirm(
                              "Table " + tbl.number + " is marked Occupied but no active order was found.\n\nClear table status and use it for a new order?"
                            )) return;
                            // Clear stale occupied status
                            try { TableService.release(tbl.id); } catch(_) {}
                          }
                          setTableNo(tbl.number);   // store raw number to avoid "Table Table 1"
                          setTableId(tbl.id);
                          setShowTablePicker(false);
                        }}
                        style={{
                          background: isCurrent ? T.acc + "22"
                                    : isOccupied ? "#f8514918" : T.card,
                          border: "1.5px solid " + (isCurrent ? T.acc
                                    : isOccupied ? "#f8514950" : T.border),
                          borderRadius:10, padding:"12px 8px", textAlign:"center",
                          cursor:"pointer", fontFamily:"inherit",
                        }}>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900,
                                      fontSize:20, color: isCurrent ? T.acc : isOccupied ? "#f85149" : T.text,
                                      marginBottom:4 }}>
                          {tbl.number}
                        </div>
                        {tbl.label && tbl.label !== tbl.number && (
                          <div style={{ fontSize:9, color:T.muted, marginBottom:4,
                                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {tbl.label}
                          </div>
                        )}
                        <div style={{ fontSize:9, fontWeight:700,
                                      color: isCurrent ? T.acc : isOccupied ? "#f85149" : "#3fb950" }}>
                          {isCurrent ? "✓ Selected" : tbl.status}
                        </div>
                        {tbl.capacity > 0 && (
                          <div style={{ fontSize:9, color:T.muted, marginTop:2 }}>👥 {tbl.capacity}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {tableNo && (
              <div style={{ padding:"10px 14px", borderTop:"1px solid " + T.border }}>
                <button className="pos-btn"
                  onClick={function() { setTableNo(""); setTableId(""); setShowTablePicker(false); }}
                  style={{ width:"100%", background:"transparent", border:"1px solid #f8514940",
                           color:"#f85149", borderRadius:8, padding:"7px 0", fontSize:12,
                           fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                  ✕ Clear Table Selection
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TABLE CONFLICT MODAL ── */}
      {tableConflict && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex",
                      alignItems:"center", justifyContent:"center", zIndex:1300, padding:16 }}>
          <div style={{ background:T.surf, border:"1px solid #f0a50060", borderRadius:14,
                        width:380, maxWidth:"96vw", padding:22 }}>
            {/* Icon + title */}
            <div style={{ textAlign:"center", marginBottom:14 }}>
              <div style={{ fontSize:36, marginBottom:8 }}>🪑</div>
              <div style={{ fontWeight:900, color:"#f0a500", fontSize:16, marginBottom:6 }}>
                Table Already Has an Active Order
              </div>
              <div style={{ fontSize:12, color:T.muted, lineHeight:1.5 }}>
                Table {tableConflict.held.tableNo || "—"} has an active order
                {" "}(<span style={{ fontFamily:"'JetBrains Mono',monospace", color:T.acc }}>
                  {tableConflict.held.orderNo}
                </span>)
                {tableConflict.held.cart && tableConflict.held.cart.length > 0
                  ? " with " + tableConflict.held.cart.length + " item(s)"
                  : ""}.
              </div>
            </div>

            {/* Cart warning */}
            {cart.length > 0 && (
              <div style={{ background:"#1a1205", border:"1px solid #f0a50030", borderRadius:9,
                            padding:"9px 12px", marginBottom:14, fontSize:12, color:"#f0a500" }}>
                ⚠ You have {cart.length} unsaved item(s) in the current cart. Resuming the
                existing order will discard them.
              </div>
            )}

            {/* Actions */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button className="pos-btn"
                onClick={function() {
                  resumeOrder(tableConflict.held);
                  setTableConflict(null);
                }}
                style={Object.assign({}, btnStyle(T.acc,"#000"), {
                  padding:"11px 0", fontWeight:800, fontSize:13
                })}>
                ✅ Resume Existing Order ({tableConflict.held.orderNo})
              </button>
              <button className="pos-btn"
                onClick={function() { setTableConflict(null); }}
                style={Object.assign({}, ghostStyle(), {
                  padding:"10px 0", fontSize:13
                })}>
                Cancel — Keep Current Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:18, left:"50%", transform:"translateX(-50%)",
                      background: toast.type === "err" ? T.danger : toast.type === "warn" ? T.warn : T.success,
                      color:"#000", fontWeight:700, fontSize:13, padding:"9px 20px",
                      borderRadius:20, zIndex:9999, pointerEvents:"none",
                      boxShadow:"0 4px 20px rgba(0,0,0,.4)", whiteSpace:"nowrap" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
