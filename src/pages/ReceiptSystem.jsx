import { useState, useMemo, useEffect } from "react";
import { ReceiptService } from "../db/services/receipts.js";
import { SettingsService } from "../db/services/settings.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Thermal Receipt System  ·  v2.0
   Offline-first · IndexedDB-backed via ReceiptService
   Structure ready for ESC/POS real printer bridge.
══════════════════════════════════════════════════════ */

const RECEIPT_SETTINGS_KEY = "kavo_receipt_settings"; // kept for LS shim

// ─── STORAGE SHIM (LS fallback only) ──────────────────
const RDB = {
  get:(k,d=null)=>{try{const v=localStorage.getItem(k);if(!v)return d;const p=JSON.parse(v);return(p==null)?d:p;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
};
const safeArr = (v)=>Array.isArray(v)?v:[];
const safeNum = (v)=>{const n=+v;return isFinite(n)?n:0;};

// ─── RECEIPT DEFAULTS ─────────────────────────────────
export const DEFAULT_RECEIPT_SETTINGS = {
  businessName:  "KAVO Restaurant",
  branchName:    "Main Branch",
  address:       "123 Main Street, Beirut, Lebanon",
  phone:         "+961 1 234 567",
  taxNumber:     "TRN-000-000-000",
  footerLine1:   "Thank you for dining with us!",
  footerLine2:   "Please come again soon",
  website:       "www.kavo-sys.com",
  autoPrint:     false,
  showQR:        true,
  paperWidth:    "80mm",
};

// ─── UNIQUE RECEIPT ID ────────────────────────────────
const genReceiptId = (orderNo) => {
  const ts = Date.now().toString(36).toUpperCase();
  return `RCP-${(orderNo||"").replace("#","")||ts}-${ts.slice(-4)}`;
};

// ─── FORMAT HELPERS ───────────────────────────────────
const CUR  = (n, s="$") => `${s}${safeNum(n).toFixed(2)}`;
const pad  = (str, len, right=false) => {
  const s = String(str||"");
  if (s.length >= len) return s.slice(0, len);
  return right ? s.padStart(len," ") : s.padEnd(len," ");
};
const center = (str, w=40) => {
  const s = String(str||"");
  const total = Math.max(0, w - s.length);
  const l = Math.floor(total/2);
  return " ".repeat(l) + s;
};
const line40 = (l, r, w=40) => {
  const left  = String(l||"");
  const right = String(r||"");
  const gap   = Math.max(1, w - left.length - right.length);
  return left + " ".repeat(gap) + right;
};
const SEP  = "─".repeat(40);
const DSEP = "═".repeat(40);

// ─── BUILD RECEIPT DATA OBJECT ────────────────────────
export const buildReceiptData = (order, rSettings, appSettings) => {
  const rs = { ...DEFAULT_RECEIPT_SETTINGS, ...rSettings };
  const as = { ...appSettings };
  const receiptId = genReceiptId(order.orderNo);
  const now = new Date();
  return {
    receiptId,
    order,
    rs,
    as,
    printedAt: now.toISOString(),
    printedDate: now.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}),
    printedTime: now.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),
  };
};

// ─── BUILD TEXT LINES (for clipboard / ESC/POS future) ─
export const buildReceiptText = (rd) => {
  const { order:o, rs, as, receiptId, printedDate, printedTime } = rd;
  const sym = as?.currency || "$";
  const lines = [];
  const add = (...l) => lines.push(...l);

  add(
    DSEP,
    center(rs.businessName),
    center(rs.branchName),
    center(rs.address),
    center(`Tel: ${rs.phone}`),
    rs.taxNumber ? center(`TRN: ${rs.taxNumber}`) : null,
    DSEP,
    line40("Order:", o.orderNo||""),
    line40("Receipt:", receiptId),
    line40("Date:", printedDate),
    line40("Time:", printedTime),
    line40("Cashier:", o.cashier||as?.cashier||""),
    o.shift ? line40("Shift:", o.shift) : null,
    SEP,
    line40("Type:", (o.type||"").toUpperCase()),
    o.tableNo  ? line40("Table:", o.tableNo)    : null,
    o.custName ? line40("Customer:", o.custName) : null,
    o.custPhone? line40("Phone:", o.custPhone)   : null,
    SEP,
  ).filter(Boolean);

  // Items
  safeArr(o.cart).forEach(item => {
    const name = pad(item.name||"?", 22);
    const qty  = `x${item.qty}`;
    const tot  = CUR((item.price||0)*(item.qty||0), sym);
    add(`${name} ${pad(qty,4,true)} ${pad(tot,8,true)}`);
    if (item.note) add(`  ↳ ${item.note}`);
  });

  add(
    SEP,
    line40("Subtotal:", CUR(o.subtotal, sym)),
  );
  if (safeNum(o.discAmt) > 0) add(line40(`Discount (${o.discPct||0}%):`, `-${CUR(o.discAmt,sym)}`));
  add(
    line40(`Service (${as?.serviceRate||0}%):`, `+${CUR(o.svcAmt,sym)}`),
    line40(`VAT (${as?.taxRate||0}%):`,          `+${CUR(o.vatAmt,sym)}`),
    DSEP,
    line40("TOTAL:", CUR(o.grand, sym)),
    DSEP,
    line40("Payment:", o.payMethod||""),
    line40("Amount Paid:", CUR(o.amtPaid||o.grand, sym)),
    o.payMethod==="Cash" ? line40("Change:", CUR(o.change||0, sym)) : null,
    SEP,
    center(rs.footerLine1),
    center(rs.footerLine2),
    rs.website ? center(rs.website) : null,
    SEP,
    center(`ID: ${receiptId}`),
    center("Powered by KAVO-SYS"),
    DSEP,
  ).filter(Boolean);

  return lines.filter(l => l !== null).join("\n");
};

// ─── PRINT VIA POPUP WINDOW ───────────────────────────
export const printReceiptWindow = (rd) => {
  const { order:o, rs, receiptId, printedDate, printedTime } = rd;
  const as  = rd.as || {};
  const sym = as.currency || "$";
  const W   = rs.paperWidth === "58mm" ? "210px" : "302px";

  const itemRows = safeArr(o.cart).map(item => `
    <tr>
      <td class="name">${item.name||""}</td>
      <td class="qty">×${item.qty||1}</td>
      <td class="price">${CUR(item.price||0,sym)}</td>
      <td class="total">${CUR((item.price||0)*(item.qty||1),sym)}</td>
    </tr>
    ${item.note ? `<tr><td colspan="4" class="note">↳ ${item.note}</td></tr>` : ""}
  `).join("");

  // Simple SVG QR-like block using data matrix style (no external lib needed)
  const qrBlock = rs.showQR ? `
    <div class="qr-wrap">
      <canvas id="kv-qr" width="80" height="80"></canvas>
      <div class="qr-label">${receiptId}</div>
    </div>
  ` : "";

  const qrScript = rs.showQR ? `
    // Micro QR-style block pattern from receipt ID hash
    (function(){
      const c=document.getElementById('kv-qr');
      if(!c)return;
      const ctx=c.getContext('2d');
      const id='${receiptId}';
      let h=5381;for(let i=0;i<id.length;i++){h=((h<<5)+h)+id.charCodeAt(i);h|=0;}
      const sz=8,cells=10;
      ctx.fillStyle='#fff';ctx.fillRect(0,0,80,80);
      ctx.fillStyle='#000';
      // finder patterns
      [[0,0],[0,7],[7,0]].forEach(([r,c2])=>{ctx.fillRect(c2*sz,r*sz,3*sz,3*sz);ctx.fillStyle='#fff';ctx.fillRect(c2*sz+sz,r*sz+sz,sz,sz);ctx.fillStyle='#000';});
      // data cells
      for(let r=0;r<cells;r++){for(let c2=0;c2<cells;c2++){if((h>>(r*cells+c2)%31)&1){ctx.fillRect(c2*sz,r*sz,sz,sz);}}}
    })();
  ` : "";

  const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<title>Receipt ${o.orderNo||""}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
  @page{margin:4mm;size:${rs.paperWidth} auto;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{
    font-family:'JetBrains Mono','Courier New',monospace;
    font-size:11px;color:#000;background:#fff;
    width:${W};margin:0 auto;padding:4px 6px;
  }
  .logo{text-align:center;margin-bottom:2px;}
  .logo-main{font-size:18px;font-weight:700;letter-spacing:0.1em;}
  .logo-sub{font-size:9px;letter-spacing:0.15em;color:#333;}
  .center{text-align:center;}
  .dsep{border-top:2px solid #000;margin:4px 0;}
  .sep{border-top:1px dashed #555;margin:4px 0;}
  .row{display:flex;justify-content:space-between;padding:1px 0;font-size:10.5px;}
  .row .lbl{color:#444;}
  .section-title{font-size:9px;letter-spacing:0.12em;color:#666;text-align:center;margin:4px 0 2px;}
  table{width:100%;border-collapse:collapse;}
  th{font-size:9px;letter-spacing:0.08em;color:#555;padding:2px 0;border-bottom:1px solid #ccc;}
  td{padding:2px 0;font-size:10.5px;vertical-align:top;}
  td.name{width:45%;}
  td.qty{width:12%;text-align:center;}
  td.price{width:20%;text-align:right;}
  td.total{width:23%;text-align:right;font-weight:700;}
  td.note{font-size:9.5px;color:#555;padding-left:8px;font-style:italic;}
  .total-row{display:flex;justify-content:space-between;padding:2px 0;font-size:11px;}
  .grand-row{display:flex;justify-content:space-between;padding:3px 0;font-size:14px;font-weight:700;border-top:2px solid #000;border-bottom:2px solid #000;margin:4px 0;}
  .badge{
    display:inline-block;border:1.5px solid #000;border-radius:3px;
    padding:2px 8px;font-size:11px;font-weight:700;letter-spacing:0.05em;
    margin:3px 0;
  }
  .footer{text-align:center;font-size:9.5px;color:#444;margin-top:6px;line-height:1.7;}
  .footer .site{font-size:9px;color:#888;}
  .footer .powered{font-size:8.5px;color:#aaa;margin-top:2px;letter-spacing:0.05em;}
  .qr-wrap{text-align:center;margin:6px 0;}
  .qr-label{font-size:7.5px;color:#888;margin-top:2px;letter-spacing:0.04em;}
  .change-box{background:#f0f0f0;border:1px solid #ccc;border-radius:3px;padding:3px 8px;margin:3px 0;}
  .type-badge{text-align:center;margin:3px 0;}
  @media print{
    html,body{width:${W}!important;}
    .no-print{display:none!important;}
    button{display:none!important;}
  }
</style>
</head><body>

<div class="logo">
  <div class="logo-main">⚡ ${rs.businessName}</div>
  <div class="logo-sub">${rs.branchName}</div>
</div>
<div class="center" style="font-size:9.5px;color:#444;line-height:1.6;">
  ${rs.address}<br/>
  Tel: ${rs.phone}<br/>
  ${rs.taxNumber?`TRN: ${rs.taxNumber}`:""}
</div>

<div class="dsep"></div>

<div class="row"><span class="lbl">Order</span><span><strong>${o.orderNo||""}</strong></span></div>
<div class="row"><span class="lbl">Receipt</span><span>${receiptId}</span></div>
<div class="row"><span class="lbl">Date</span><span>${printedDate}</span></div>
<div class="row"><span class="lbl">Time</span><span>${printedTime}</span></div>
<div class="row"><span class="lbl">Cashier</span><span>${o.cashier||as.cashier||""}</span></div>
${o.shift ? `<div class="row"><span class="lbl">Shift</span><span>${o.shift}</span></div>` : ""}

<div class="sep"></div>

<div class="type-badge">
  <span class="badge">${
    o.type==="dine-in"?"🍽 DINE-IN":o.type==="takeaway"?"🛍 TAKEAWAY":"🛵 DELIVERY"
  }</span>
</div>
${o.tableNo  ? `<div class="row"><span class="lbl">Table</span><span>${o.tableNo}</span></div>`    : ""}
${o.custName ? `<div class="row"><span class="lbl">Customer</span><span>${o.custName}</span></div>`: ""}
${o.custPhone? `<div class="row"><span class="lbl">Phone</span><span>${o.custPhone}</span></div>`  : ""}

<div class="sep"></div>
<div class="section-title">ITEMS</div>
<table>
  <thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<div class="sep"></div>

<div class="total-row"><span>Subtotal</span><span>${CUR(o.subtotal,sym)}</span></div>
${safeNum(o.discAmt)>0?`<div class="total-row"><span>Discount (${o.discPct||0}%)</span><span>-${CUR(o.discAmt,sym)}</span></div>`:""}
<div class="total-row"><span>Service (${as.serviceRate||0}%)</span><span>+${CUR(o.svcAmt,sym)}</span></div>
<div class="total-row"><span>VAT (${as.taxRate||0}%)</span><span>+${CUR(o.vatAmt,sym)}</span></div>

<div class="grand-row"><span>GRAND TOTAL</span><span>${CUR(o.grand,sym)}</span></div>

<div class="row"><span class="lbl">Payment</span><span><strong>${o.payMethod||""}</strong></span></div>
<div class="row"><span class="lbl">Amount Paid</span><span>${CUR(o.amtPaid||o.grand,sym)}</span></div>
${o.payMethod==="Cash"?`<div class="change-box total-row"><span><strong>Change Due</strong></span><span><strong>${CUR(o.change||0,sym)}</strong></span></div>`:""}

<div class="sep"></div>
<div class="footer">
  <div>${rs.footerLine1}</div>
  <div>${rs.footerLine2}</div>
  ${rs.website?`<div class="site">${rs.website}</div>`:""}
</div>

${qrBlock}

<div class="footer">
  <div class="powered">POWERED BY KAVO-SYS v1.0</div>
</div>

<script>
  ${qrScript}
  window.onload=()=>{
    setTimeout(()=>{ window.print(); setTimeout(()=>window.close(),1800); }, 300);
  };
</script>
</body></html>`;

  const w = window.open("","_blank","width=380,height=700,scrollbars=yes,toolbar=no,menubar=no");
  if (!w) { alert("Allow popups in your browser to print receipts"); return; }
  w.document.write(html);
  w.document.close();
};

// ─── RECEIPT HISTORY HELPERS ──────────────────────────
export const saveReceiptToHistory = (rd) => {
  // Write to IDB (primary) + LS (fallback bridge)
  ReceiptService.save(rd).catch(() => {});
  try {
    const lsKey = "kavo_receipts";
    const raw   = localStorage.getItem(lsKey);
    const hist  = raw ? (JSON.parse(raw) || []) : [];
    const upd   = [{ ...rd, _ts: Date.now() }, ...hist].slice(0, 200);
    localStorage.setItem(lsKey, JSON.stringify(upd));
  } catch (_) {}
};

/* ══════════════════════════════════════════════════════
   RECEIPT MODAL — shown from POS after payment
══════════════════════════════════════════════════════ */
export function ReceiptModal({ receiptData, onClose, onReprint }) {
  const { order:o, rs, as, receiptId, printedDate, printedTime } = receiptData;
  const sym = as?.currency || "$";
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    printReceiptWindow(receiptData);
  };

  const handleCopy = () => {
    const txt = buildReceiptText(receiptData);
    navigator.clipboard?.writeText(txt).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };

  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(5,8,20,0.88)",
      display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:9000,padding:16,
    }}>
      <div style={{
        display:"flex",flexDirection:"column",
        width:"100%",maxWidth:860,maxHeight:"92vh",
        background:"#0b1220",border:"1px solid #1a2438",borderRadius:16,
        overflow:"hidden",boxShadow:"0 32px 80px rgba(0,0,0,0.7)",
      }}>
        {/* Header */}
        <div style={{
          background:"#0d1525",borderBottom:"1px solid #1a2438",
          padding:"12px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0,
        }}>
          <span style={{fontWeight:900,fontSize:16,color:"#f0a500",letterSpacing:"0.06em"}}>
            🧾 RECEIPT
          </span>
          <span style={{fontSize:12,color:"#4a6080"}}>
            {receiptId}
          </span>
          <div style={{flex:1}}/>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            <button onClick={handleCopy}
              style={{
                background:copied?"#3fb95020":"transparent",
                border:`1px solid ${copied?"#3fb95060":"#1a2438"}`,
                borderRadius:8,padding:"6px 12px",
                color:copied?"#3fb950":"#4a6080",fontSize:11,fontWeight:700,
                cursor:"pointer",fontFamily:"inherit",transition:"all 0.14s",
              }}>
              {copied?"✓ Copied":"📋 Copy"}
            </button>
            <button onClick={handlePrint}
              style={{
                background:"#f0a500",border:"none",borderRadius:8,
                padding:"6px 14px",color:"#000",fontSize:11,fontWeight:800,
                cursor:"pointer",fontFamily:"inherit",
              }}>
              🖨 Print
            </button>
            <button onClick={onClose}
              style={{
                background:"transparent",border:"1px solid #1a2438",borderRadius:8,
                padding:"6px 12px",color:"#4a6080",fontSize:11,fontWeight:700,
                cursor:"pointer",fontFamily:"inherit",
              }}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* Body: receipt preview + order summary */}
        <div style={{flex:1,overflowY:"auto",display:"flex",gap:0}}>

          {/* White receipt preview */}
          <div style={{
            flex:"0 0 302px",overflowY:"auto",borderRight:"1px solid #1a2438",
            background:"#e8e8e8",display:"flex",justifyContent:"center",padding:"16px 8px",
          }}>
            <ReceiptPreview rd={receiptData} sym={sym}/>
          </div>

          {/* Right: order detail + actions */}
          <div style={{flex:1,padding:16,display:"flex",flexDirection:"column",gap:12,minWidth:0}}>

            {/* Status */}
            <div style={{
              background:"#0d2010",border:"1px solid #3fb95040",borderRadius:10,
              padding:"10px 14px",display:"flex",alignItems:"center",gap:10,
            }}>
              <span style={{fontSize:20}}>✅</span>
              <div>
                <div style={{fontWeight:800,color:"#3fb950",fontSize:14}}>Payment Complete</div>
                <div style={{fontSize:11,color:"#4a6080"}}>{o.orderNo} · {printedDate} {printedTime}</div>
              </div>
            </div>

            {/* Order meta */}
            <div style={{background:"#0d1525",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:10,color:"#4a6080",fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>ORDER INFO</div>
              {[
                ["Type",     (o.type||"").toUpperCase()],
                o.tableNo  ?["Table",    o.tableNo]         :null,
                o.custName ?["Customer", o.custName]        :null,
                o.custPhone?["Phone",    o.custPhone]       :null,
                ["Cashier",  o.cashier||""],
              ].filter(Boolean).map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",borderBottom:"1px solid #1a2438"}}>
                  <span style={{color:"#4a6080"}}>{l}</span>
                  <span style={{color:"#e8edf5",fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div style={{background:"#0d1525",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:10,color:"#4a6080",fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>PAYMENT SUMMARY</div>
              {[
                ["Subtotal",  CUR(o.subtotal,sym)],
                safeNum(o.discAmt)>0?["Discount",`-${CUR(o.discAmt,sym)}`]:null,
                ["Service",  `+${CUR(o.svcAmt,sym)}`],
                ["VAT",      `+${CUR(o.vatAmt,sym)}`],
              ].filter(Boolean).map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0"}}>
                  <span style={{color:"#4a6080"}}>{l}</span>
                  <span style={{color:"#7d8fa0",fontFamily:"'JetBrains Mono',monospace"}}>{v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",borderTop:"2px solid #1a2438",paddingTop:8,marginTop:4}}>
                <span style={{fontWeight:800,color:"#e8edf5",fontSize:15}}>TOTAL</span>
                <span style={{fontWeight:900,color:"#f0a500",fontSize:15,fontFamily:"'JetBrains Mono',monospace"}}>{CUR(o.grand,sym)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:12}}>
                <span style={{color:"#4a6080"}}>{o.payMethod}</span>
                <span style={{color:"#7d8fa0",fontFamily:"'JetBrains Mono',monospace"}}>{CUR(o.amtPaid||o.grand,sym)}</span>
              </div>
              {o.payMethod==="Cash" && safeNum(o.change)>0 && (
                <div style={{display:"flex",justifyContent:"space-between",marginTop:4,background:"#0d2010",borderRadius:6,padding:"4px 8px"}}>
                  <span style={{color:"#3fb950",fontWeight:700,fontSize:12}}>Change Due</span>
                  <span style={{color:"#3fb950",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{CUR(o.change,sym)}</span>
                </div>
              )}
            </div>

            {/* Items quick view */}
            <div style={{background:"#0d1525",borderRadius:10,padding:"12px 14px",flex:1,overflowY:"auto"}}>
              <div style={{fontSize:10,color:"#4a6080",fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>ITEMS ({safeArr(o.cart).length})</div>
              {safeArr(o.cart).map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid #0f1825"}}>
                  <span style={{fontSize:16,flexShrink:0}}>{item.em}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#dde6f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                    {item.note&&<div style={{fontSize:10,color:"#d29922",fontStyle:"italic"}}>↳ {item.note}</div>}
                  </div>
                  <div style={{flexShrink:0,textAlign:"right"}}>
                    <div style={{fontSize:11,color:"#4a6080"}}>×{item.qty}</div>
                    <div style={{fontSize:12,fontWeight:700,color:"#f0a500",fontFamily:"'JetBrains Mono',monospace"}}>{CUR((item.price||0)*(item.qty||1),sym)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   WHITE RECEIPT PREVIEW (visual replica of thermal paper)
══════════════════════════════════════════════════════ */
function ReceiptPreview({ rd, sym }) {
  const { order:o, rs, as, receiptId, printedDate, printedTime } = rd;
  const R = { fontFamily:"'JetBrains Mono','Courier New',monospace", color:"#000", fontSize:10.5, lineHeight:1.7 };
  const center = { textAlign:"center" };
  const row = { display:"flex", justifyContent:"space-between", fontSize:10.5 };
  const sep = { borderTop:"1px dashed #bbb", margin:"5px 0" };
  const dsep= { borderTop:"2px solid #000",  margin:"5px 0" };

  return (
    <div style={{
      ...R, background:"#fff", width:286, padding:"10px 14px",
      boxShadow:"0 4px 20px rgba(0,0,0,0.2)",borderRadius:2,
    }}>
      {/* Logo */}
      <div style={{...center,fontWeight:700,fontSize:16,marginBottom:2,letterSpacing:"0.06em"}}>⚡ {rs.businessName}</div>
      <div style={{...center,fontSize:9.5,color:"#555",letterSpacing:"0.1em"}}>{rs.branchName}</div>
      <div style={{...center,fontSize:9,color:"#666",lineHeight:1.5}}>{rs.address}</div>
      <div style={{...center,fontSize:9,color:"#666"}}>Tel: {rs.phone}</div>
      {rs.taxNumber&&<div style={{...center,fontSize:9,color:"#666"}}>TRN: {rs.taxNumber}</div>}
      <div style={dsep}/>
      <div style={row}><span style={{color:"#555"}}>Order</span><strong>{o.orderNo}</strong></div>
      <div style={row}><span style={{color:"#555"}}>Date</span><span>{printedDate}</span></div>
      <div style={row}><span style={{color:"#555"}}>Time</span><span>{printedTime}</span></div>
      <div style={row}><span style={{color:"#555"}}>Cashier</span><span>{o.cashier||""}</span></div>
      <div style={sep}/>
      <div style={{...center,fontSize:11,fontWeight:700,border:"1.5px solid #000",borderRadius:2,padding:"2px 8px",display:"inline-block",margin:"0 auto 4px",width:"100%"}}>
        {o.type==="dine-in"?"🍽 DINE-IN":o.type==="takeaway"?"🛍 TAKEAWAY":"🛵 DELIVERY"}
      </div>
      {o.tableNo&&<div style={row}><span style={{color:"#555"}}>Table</span><span>{o.tableNo}</span></div>}
      {o.custName&&<div style={row}><span style={{color:"#555"}}>Customer</span><span>{o.custName}</span></div>}
      <div style={sep}/>
      {/* Items */}
      <div style={{fontSize:9,color:"#555",display:"flex",justifyContent:"space-between",borderBottom:"1px solid #ccc",paddingBottom:2,marginBottom:3}}>
        <span style={{flex:2}}>Item</span><span>Qty</span><span>Price</span><span style={{textAlign:"right"}}>Total</span>
      </div>
      {safeArr(o.cart).map((item,i)=>(
        <div key={i}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,gap:4}}>
            <span style={{flex:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.em} {item.name}</span>
            <span>×{item.qty}</span>
            <span>{CUR(item.price||0,sym)}</span>
            <span style={{fontWeight:700}}>{CUR((item.price||0)*(item.qty||1),sym)}</span>
          </div>
          {item.note&&<div style={{fontSize:9,color:"#888",fontStyle:"italic",paddingLeft:8}}>↳ {item.note}</div>}
        </div>
      ))}
      <div style={sep}/>
      {[
        ["Subtotal", CUR(o.subtotal,sym)],
        safeNum(o.discAmt)>0?[`Discount (${o.discPct||0}%)`,`-${CUR(o.discAmt,sym)}`]:null,
        [`Service (${as?.serviceRate||0}%)`,`+${CUR(o.svcAmt,sym)}`],
        [`VAT (${as?.taxRate||0}%)`,`+${CUR(o.vatAmt,sym)}`],
      ].filter(Boolean).map(([l,v])=>(
        <div key={l} style={row}><span style={{color:"#555"}}>{l}</span><span>{v}</span></div>
      ))}
      <div style={{...row,...dsep,paddingTop:3,fontWeight:900,fontSize:13}}>
        <span>TOTAL</span><span>{CUR(o.grand,sym)}</span>
      </div>
      <div style={row}><span style={{color:"#555"}}>Payment</span><span><strong>{o.payMethod}</strong></span></div>
      <div style={row}><span style={{color:"#555"}}>Paid</span><span>{CUR(o.amtPaid||o.grand,sym)}</span></div>
      {o.payMethod==="Cash"&&<div style={{...row,fontWeight:700}}><span>Change</span><span>{CUR(o.change||0,sym)}</span></div>}
      <div style={sep}/>
      <div style={{...center,fontSize:10,lineHeight:1.7,color:"#444"}}>{rs.footerLine1}</div>
      <div style={{...center,fontSize:10,color:"#444"}}>{rs.footerLine2}</div>
      {rs.website&&<div style={{...center,fontSize:9,color:"#888"}}>{rs.website}</div>}
      {/* QR block */}
      {rs.showQR&&(
        <div style={{...center,margin:"8px 0"}}>
          <canvas id="prev-qr" width="70" height="70" style={{border:"1px solid #eee"}}/>
          <div style={{fontSize:7.5,color:"#999",marginTop:2}}>{receiptId}</div>
        </div>
      )}
      <div style={{...center,fontSize:8,color:"#aaa",marginTop:6}}>POWERED BY KAVO-SYS v1.0</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   RECEIPT HISTORY PANEL (shown in POS header modal)
══════════════════════════════════════════════════════ */
export function ReceiptHistoryPanel({ onClose }) {
  const [hist,    setHist]    = useState([]);
  const [search,  setSearch]  = useState("");
  const [selected,setSelected]= useState(null);
  const [as,      setAs]      = useState({});
  const [rs,      setRs]      = useState(DEFAULT_RECEIPT_SETTINGS);

  // Load from IDB on mount, fall back to LS
  useEffect(() => {
    ReceiptService.getAll()
      .then(data => { if (safeArr(data).length > 0) setHist(data); else throw new Error("empty"); })
      .catch(() => {
        try {
          const v = localStorage.getItem("kavo_receipts");
          if (v) setHist(JSON.parse(v) || []);
        } catch {}
      });
    SettingsService.getAppSettings().then(s => { if (s) setAs(s); }).catch(() => {});
    SettingsService.getReceiptSettings().then(s => { if (s) setRs({...DEFAULT_RECEIPT_SETTINGS,...s}); }).catch(() => {});
  }, []);

  const filtered = useMemo(()=>
    hist.filter(r=>{
      const q=search.toLowerCase();
      return !q||
        (r.order?.orderNo||"").toLowerCase().includes(q)||
        (r.receiptId||"").toLowerCase().includes(q)||
        (r.order?.custName||"").toLowerCase().includes(q)||
        (r.printedDate||"").toLowerCase().includes(q);
    })
  ,[hist,search]);

  const reprint = (rd) => printReceiptWindow({ ...rd, rs, as });

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(5,8,20,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9100,padding:16}}>
      <div style={{background:"#0b1220",border:"1px solid #1a2438",borderRadius:16,width:"100%",maxWidth:620,maxHeight:"88vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}}>
        {/* Header */}
        <div style={{background:"#0d1525",borderBottom:"1px solid #1a2438",padding:"12px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontWeight:900,fontSize:15,color:"#f0a500"}}>🧾 Receipt History</span>
          <span style={{fontSize:11,color:"#4a6080"}}>{hist.length} receipts</span>
          <div style={{flex:1}}/>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#4a6080",cursor:"pointer",fontSize:20,padding:0}}>✕</button>
        </div>
        {/* Search */}
        <div style={{padding:"10px 16px",borderBottom:"1px solid #1a2438",flexShrink:0}}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="🔍 Search by order, receipt ID, customer, date..."
            style={{width:"100%",background:"#0d1525",border:"1px solid #1a2438",borderRadius:8,padding:"7px 12px",color:"#e8edf5",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
        </div>
        {/* List */}
        <div style={{flex:1,overflowY:"auto",padding:"8px 16px"}}>
          {filtered.length===0
            ? <div style={{textAlign:"center",padding:40,color:"#2a3a50"}}>
                <div style={{fontSize:36,marginBottom:8}}>🧾</div>
                <div style={{fontSize:13}}>No receipts found</div>
              </div>
            : filtered.map((rd,i)=>{
              const o=rd.order||{};
              const sym=(rd.as||{}).currency||"$";
              const isSelected=selected===i;
              return (
                <div key={i}>
                  <div
                    onClick={()=>setSelected(isSelected?null:i)}
                    style={{
                      background:isSelected?"#101828":"#0d1525",
                      border:`1px solid ${isSelected?"#f0a50060":"#1a2438"}`,
                      borderRadius:10,padding:"10px 14px",marginBottom:5,
                      cursor:"pointer",display:"flex",alignItems:"center",gap:10,
                      transition:"all 0.14s",
                    }}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:3}}>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:"#f0a500",fontSize:13}}>{o.orderNo}</span>
                        <span style={{fontSize:10,color:"#4a6080",fontFamily:"monospace"}}>{rd.receiptId}</span>
                      </div>
                      <div style={{display:"flex",gap:8,fontSize:11,color:"#4a6080"}}>
                        <span>{rd.printedDate}</span>
                        <span>{rd.printedTime}</span>
                        {o.custName&&<span>· {o.custName}</span>}
                        <span>· {o.payMethod}</span>
                      </div>
                    </div>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,color:"#3fb950",fontSize:13,flexShrink:0}}>
                      {CUR(o.grand,sym)}
                    </span>
                    <button
                      onClick={e=>{e.stopPropagation();reprint(rd);}}
                      style={{background:"#f0a500",border:"none",borderRadius:7,padding:"5px 11px",color:"#000",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                      🖨 Print
                    </button>
                  </div>
                  {isSelected&&(
                    <div style={{background:"#080e1a",borderRadius:8,padding:14,marginBottom:8,fontSize:11}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                        {[
                          {l:"Total",   v:CUR(o.grand,sym),      c:"#f0a500"},
                          {l:"Orders",  v:`${safeArr(o.cart).length} items`,c:"#58a6ff"},
                          {l:"Method",  v:o.payMethod||"",        c:"#3fb950"},
                        ].map(m=>(
                          <div key={m.l} style={{background:"#0d1525",borderRadius:7,padding:"8px 10px",textAlign:"center"}}>
                            <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,color:m.c,fontSize:13}}>{m.v}</div>
                            <div style={{fontSize:9.5,color:"#4a6080",marginTop:2}}>{m.l}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{color:"#4a6080",marginBottom:5,fontWeight:700,letterSpacing:"0.06em",fontSize:9.5}}>ITEMS</div>
                      {safeArr(o.cart).map((item,j)=>(
                        <div key={j} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",color:"#7d8fa0"}}>
                          <span>{item.em} {item.name}</span>
                          <span>×{item.qty} · {CUR((item.price||0)*(item.qty||1),sym)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          }
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   RECEIPT SETTINGS PANEL (for Admin)
══════════════════════════════════════════════════════ */
export function ReceiptSettingsPanel({ onClose }) {
  const [cfg, setCfg] = useState({ ...DEFAULT_RECEIPT_SETTINGS });
  const set = (k,v) => setCfg(p=>({...p,[k]:v}));

  // Load from IDB on mount, fall back to LS
  useEffect(() => {
    SettingsService.getReceiptSettings()
      .then(s => { if (s && Object.keys(s).length > 0) setCfg({...DEFAULT_RECEIPT_SETTINGS,...s}); })
      .catch(() => {
        const ls = RDB.get(RECEIPT_SETTINGS_KEY, {});
        setCfg({...DEFAULT_RECEIPT_SETTINGS,...ls});
      });
  }, []);

  const save = () => {
    SettingsService.saveReceiptSettings(cfg).catch(() => {});
    RDB.set(RECEIPT_SETTINGS_KEY, cfg); // LS bridge
    onClose();
  };

  const field=(label,key,type="text",placeholder="")=>(
    <div style={{marginBottom:12}}>
      <label style={{display:"block",fontSize:10,color:"#4a6080",fontWeight:700,letterSpacing:"0.08em",marginBottom:5}}>{label}</label>
      {type==="bool"
        ? <div style={{display:"flex",gap:8}}>
            {[["Yes",true],["No",false]].map(([l,v])=>(
              <button key={l} onClick={()=>set(key,v)}
                style={{flex:1,background:cfg[key]===v?"#f0a50022":"transparent",border:`1px solid ${cfg[key]===v?"#f0a50060":"#1a2438"}`,color:cfg[key]===v?"#f0a500":"#4a6080",borderRadius:7,padding:"6px 0",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"inherit"}}>
                {l}
              </button>
            ))}
          </div>
        : type==="select"
        ? <select value={cfg[key]} onChange={e=>set(key,e.target.value)}
            style={{width:"100%",background:"#0d1525",border:"1px solid #1a2438",borderRadius:8,padding:"7px 10px",color:"#e8edf5",fontSize:12,fontFamily:"inherit",outline:"none"}}>
            <option value="80mm">80mm (Standard)</option>
            <option value="58mm">58mm (Compact)</option>
          </select>
        : <input type={type} value={cfg[key]||""} onChange={e=>set(key,e.target.value)} placeholder={placeholder}
            style={{width:"100%",background:"#0d1525",border:"1px solid #1a2438",borderRadius:8,padding:"8px 12px",color:"#e8edf5",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
      }
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(5,8,20,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9200,padding:16}}>
      <div style={{background:"#0b1220",border:"1px solid #1a2438",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"88vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 32px 80px rgba(0,0,0,0.6)"}}>
        <div style={{background:"#0d1525",borderBottom:"1px solid #1a2438",padding:"12px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontWeight:900,fontSize:15,color:"#f0a500"}}>⚙ Receipt Settings</span>
          <div style={{flex:1}}/>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#4a6080",cursor:"pointer",fontSize:20,padding:0}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:18}}>
          {field("Business Name","businessName","text","KAVO Restaurant")}
          {field("Branch Name","branchName","text","Main Branch")}
          {field("Address","address","text","123 Street, City")}
          {field("Phone","phone","text","+961 1 000 000")}
          {field("Tax / TRN Number","taxNumber","text","TRN-000")}
          {field("Footer Line 1","footerLine1","text","Thank you!")}
          {field("Footer Line 2","footerLine2","text","Please come again")}
          {field("Website","website","text","www.yoursite.com")}
          {field("Paper Width","paperWidth","select")}
          {field("Show QR Code","showQR","bool")}
          {field("Auto-Print on Payment","autoPrint","bool")}
        </div>
        <div style={{borderTop:"1px solid #1a2438",padding:"12px 18px",display:"flex",gap:8,flexShrink:0}}>
          <button onClick={save} style={{flex:1,background:"#f0a500",border:"none",borderRadius:9,padding:"10px 0",color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Save Settings</button>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid #1a2438",borderRadius:9,padding:"10px 16px",color:"#4a6080",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
