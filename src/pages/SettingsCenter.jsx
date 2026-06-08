import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth, PERMISSIONS, ROLE_META, DEFAULT_USERS } from "../auth/AuthProvider";
import { SettingsService } from "../db/services/settings.js";
import { AuthService } from "../db/services/auth.js";
import { useLang } from "../i18n/LanguageContext.jsx";
import { useFirebaseServices } from "../firebase/FirebaseServicesProvider.jsx";
import { useTenant } from "../contexts/TenantProvider.jsx";
import { hashPassword } from "../utils/password.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Settings Center  ·  v1.0
   Admin-only · Offline-first · IndexedDB
══════════════════════════════════════════════════════ */

// ── Design tokens ──────────────────────────────────────
const C = {
  bg:"#070c16", surf:"#0b1220", card:"#101828", card2:"#0d1525",
  bdr:"#1a2438", acc:"#f0a500", text:"#e8edf5", muted:"#4a6080",
  sub:"#7d8fa0", success:"#3fb950", danger:"#f85149",
  info:"#58a6ff", warn:"#d29922",
};
const safeNum = (v,d=0) => { const n=+v; return isFinite(n)?n:d; };
const safeArr = (v,d=[]) => Array.isArray(v)?v:d;

// ── Shared style helpers ───────────────────────────────
const Btn  = (bg, col="#000", sm=false) => ({ background:bg, color:col, border:"none", borderRadius:8, padding:sm?"6px 13px":"10px 18px", cursor:"pointer", fontWeight:700, fontSize:sm?11:13, fontFamily:"inherit", transition:"opacity 0.14s", whiteSpace:"nowrap" });
const Ghost= (col=C.muted, sm=false)   => ({ background:"transparent", color:col, border:`1px solid ${C.bdr}`, borderRadius:8, padding:sm?"5px 12px":"9px 16px", cursor:"pointer", fontWeight:600, fontSize:sm?11:12, fontFamily:"inherit", whiteSpace:"nowrap" });
const Inp  = (w="100%") => ({ width:w, background:C.card, border:`1px solid ${C.bdr}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" });
const SelS = (w="100%") => ({ ...Inp(w), cursor:"pointer" });

const TABS = [
// TABS defined inside component
];

const ROLES = ["admin","cashier","kitchen"];
const PERM_LABELS = {
// PERM_LABELS defined inside component
  canEditPrices:     "Edit Prices",
  canVoidOrders:     "Void Orders",
  canApplyDiscount:  "Apply Discounts",
};

// ══════════════════════════════════════════════════════
//   MAIN COMPONENT
// ══════════════════════════════════════════════════════
export default function SettingsCenter({ onBack }) {
  const { user } = useAuth();
  const { t } = useLang();
  
  // Firebase integration
  const firebaseServices = useFirebaseServices();
  const { tenantId } = useTenant();
  const useFirebase = !!tenantId && !!firebaseServices;

  const TABS = [
    { id:"business", icon:"🏢", label:t("settingsBusiness") },
    { id:"currency", icon:"💱", label:t("settingsCurrency")  },
    { id:"tax",      icon:"🧮", label:t("settingsTax")       },
    { id:"receipt",  icon:"🖨", label:t("settingsReceipt")   },
    { id:"pos",      icon:"⚙",  label:t("settingsPOS")      },
    { id:"security", icon:"🔐", label:t("settingsSecurity")  },
  ];

  const PERM_LABELS = {
    canAccessPOS:      t("permAccessPOS"),
    canAccessKitchen:  t("permAccessKitchen"),
    canAccessReports:  t("permAccessReports"),
    canAccessSettings: t("permAccessSettings"),
    canManageMenu:     t("permManageMenu"),
    canBackupRestore:  t("permBackupRestore"),
    canDeleteData:     t("permDeleteData"),
  };


  const [tab,     setTab]     = useState("business");
  const [all,     setAll]     = useState(null);
  const [users,   setUsers]   = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);
  const [dirty,   setDirty]   = useState(false);

  // Per-section draft state
  const [app,      setApp]      = useState({});
  const [currency, setCurrency] = useState({});
  const [receipt,  setReceipt]  = useState({});
  const [pos,      setPos]      = useState({});

  const showToast = (msg, type="ok") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 2800);
  };

  const load = useCallback(async () => {
    try {
      let allUsers;
      let settings;
      
      if (useFirebase) {
        console.log('Loading users and settings from Firebase...');
        allUsers = await firebaseServices.users.getAll();
        settings = await firebaseServices.settings.getAll();
        console.log('Loaded from Firebase - Users:', allUsers, 'Settings:', settings);
      } else {
        console.log('Loading users and settings from localStorage...');
        allUsers = await AuthService.getUsers();
        settings = await SettingsService.getAll();
        console.log('Loaded from localStorage - Users:', allUsers, 'Settings:', settings);
      }
      
      setAll(settings);
      setApp(settings.app || {});
      setCurrency(settings.currency || {});
      setReceipt(settings.receipt || {});
      setPos(settings.pos || {});
      setUsers(safeArr(allUsers));
    } catch(e) { 
      console.error('Error loading settings:', e); 
      showToast("Failed to load settings: " + e.message, "err");
    }
  }, [useFirebase, firebaseServices]);

  useEffect(() => { load(); }, [load]);

  const setA = (k, v) => { setApp(p => ({...p,[k]:v})); setDirty(true); };
  const setC = (k, v) => { setCurrency(p => ({...p,[k]:v})); setDirty(true); };
  const setR = (k, v) => { setReceipt(p => ({...p,[k]:v})); setDirty(true); };
  const setP = (k, v) => { setPos(p => ({...p,[k]:v})); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      // Sync app fields into receipt settings (overlapping fields)
      const receiptMerged = {
        ...receipt,
        businessName: app.businessName || receipt.businessName,
        branchName:   app.branch || receipt.branchName,
        address:      app.address || receipt.address,
        phone:        app.phone || receipt.phone,
        taxNumber:    app.taxNumber || receipt.taxNumber,
        website:      app.website || receipt.website,
      };
      
      const settingsToSave = { 
        app, 
        receipt: receiptMerged, 
        pos, 
        currency 
      };
      
      if (useFirebase) {
        console.log('Saving settings to Firebase:', settingsToSave);
        await firebaseServices.settings.saveAll(settingsToSave);
        console.log('Settings saved to Firebase successfully');
      } else {
        console.log('Saving settings to localStorage:', settingsToSave);
        await SettingsService.saveAll(settingsToSave);
        console.log('Settings saved to localStorage successfully');
      }
      
      setDirty(false);
      showToast("Settings saved");
    } catch(e) {
      console.error('Error saving settings:', e);
      showToast("Save failed: " + (e.message||"error"), "err");
    }
    setSaving(false);
  };

  if (!all) return <LoadingScreen/>;

  return (
    <div style={{ height:"100vh", background:C.bg, color:C.text, fontFamily:"system-ui,-apple-system,sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:${C.bg}; } ::-webkit-scrollbar-thumb { background:${C.bdr}; border-radius:4px; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        .sc-in  { animation:fadeUp 0.25s ease; }
        .sc-btn:hover { opacity:0.82; }
        .sc-btn { transition:opacity 0.14s; }
        .sc-tab { transition:all 0.14s; }
        .sc-tab:hover { background:#1a2438!important; color:${C.sub}!important; }
        .sc-tog { cursor:pointer; transition:background 0.18s; }
        input:focus, select:focus, textarea:focus { border-color:${C.acc}!important; outline:none; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
        input[type=range] { accent-color:${C.acc}; }
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{ background:C.surf, borderBottom:`2px solid ${C.acc}`, padding:"0 20px", height:56, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <button className="sc-btn" onClick={onBack} style={Ghost(C.muted,true)}>← Back</button>
        <div style={{ width:1, height:26, background:C.bdr }}/>
        <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:900, fontSize:18, color:C.acc, letterSpacing:"0.07em" }}>
          KAVO<span style={{color:C.text,opacity:0.3}}>-SYS</span>
        </span>
        <span style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:"0.12em" }}>SETTINGS</span>
        <div style={{ flex:1 }}/>

        {dirty && (
          <div style={{ fontSize:11, color:C.warn, display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:C.warn, display:"inline-block" }}/>
            Unsaved changes
          </div>
        )}

        <button className="sc-btn" onClick={save} disabled={saving || !dirty}
          style={{ ...Btn(dirty?C.acc:C.bdr, dirty?"#000":C.muted), opacity:(!dirty||saving)?0.5:1, display:"flex", alignItems:"center", gap:7 }}>
          {saving ? <><Spin/>Saving…</> : "💾 Save All"}
        </button>

        <div style={{ background:"#f0a50018", border:"1px solid #f0a50040", borderRadius:20, padding:"3px 12px", display:"flex", alignItems:"center", gap:6 }}>
          <span>👑</span>
          <span style={{ fontSize:11, fontWeight:700, color:C.acc }}>{user?.name}</span>
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div style={{ flex:1, display:"flex", minHeight:0 }}>

        {/* Sidebar */}
        <nav style={{ width:180, background:C.surf, borderRight:`1px solid ${C.bdr}`, padding:"12px 8px", flexShrink:0, overflowY:"auto" }}>
          {TABS.map(t => (
            <button key={t.id} className="sc-tab sc-btn" onClick={() => setTab(t.id)}
              style={{
                width:"100%", textAlign:"left", display:"flex", alignItems:"center", gap:10,
                padding:"10px 12px", borderRadius:9, marginBottom:3, border:"none",
                background: tab===t.id ? C.acc+"22" : "transparent",
                color:      tab===t.id ? C.acc : C.muted,
                fontWeight: tab===t.id ? 800 : 600,
                fontSize:   13, fontFamily:"inherit", cursor:"pointer",
                borderLeft: `3px solid ${tab===t.id?C.acc:"transparent"}`,
              }}>
              <span style={{ fontSize:16 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Main panel */}
        <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", padding:24, paddingBottom:80 }}>
          <div className="sc-in" key={tab}>

            {/* ══════════ BUSINESS ══════════ */}
            {tab === "business" && (
              <Section title="🏢 Business Profile" desc="Your restaurant's identity. Used on receipts, reports, and the POS header.">

                {/* Logo upload */}
                <LogoUpload value={app.logo} onChange={v => setA("logo", v)}/>

                <Grid>
                  <Field label={t("businessName")} value={app.businessName||""} onChange={v=>setA("businessName",v)} placeholder="KAVO Restaurant"/>
                  <Field label="Branch Name"   value={app.branch||""}       onChange={v=>setA("branch",v)}       placeholder="Main Branch"/>
                  <Field label="Address"        value={app.address||""}      onChange={v=>setA("address",v)}      placeholder="123 Main Street, City"/>
                  <Field label="Phone"          value={app.phone||""}        onChange={v=>setA("phone",v)}        placeholder="+961 1 000 000"/>
                  <Field label="Email"          value={app.email||""}        onChange={v=>setA("email",v)}        type="email" placeholder="info@restaurant.com"/>
                  <Field label={t("taxNumber")} value={app.taxNumber||""} onChange={v=>setA("taxNumber",v)}    placeholder="TRN-000-000-000"/>
                  <Field label="Website"        value={app.website||""}      onChange={v=>setA("website",v)}      placeholder="www.yourrestaurant.com"/>
                  <Field label="Default Cashier Name" value={app.cashier||""} onChange={v=>setA("cashier",v)}    placeholder="Cashier name shown on receipts"/>
                </Grid>

                <InfoBox>Business name and branch are displayed in the POS header, all receipts, and shift reports.</InfoBox>
              </Section>
            )}

            {/* ══════════ CURRENCY ══════════ */}
            {tab === "currency" && (
              <Section title="💱 Currency Settings" desc="Configure how prices are displayed and optionally show a secondary currency.">
                <Grid>
                  <div>
                    <FLabel>PRIMARY CURRENCY</FLabel>
                    <select value={currency.primaryCurrency||"USD"} onChange={e => { const s=e.target.value; setC("primaryCurrency",s); setC("primarySymbol",s==="USD"?"$":s==="EUR"?"€":s==="GBP"?"£":s==="LBP"?"L.L.":s==="AED"?"AED ":"$"); }} style={SelS()}>
                      {[["USD","US Dollar ($)"],["EUR","Euro (€)"],["GBP","British Pound (£)"],["LBP","Lebanese Pound (L.L.)"],["AED","UAE Dirham (AED)"],["SAR","Saudi Riyal (SAR)"],["QAR","Qatari Riyal (QAR)"],["KWD","Kuwaiti Dinar (KWD)"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <Field label="PRIMARY SYMBOL" value={currency.primarySymbol||"$"} onChange={v=>setC("primarySymbol",v)} placeholder="$"/>
                  <div>
                    <FLabel>SECONDARY CURRENCY</FLabel>
                    <select value={currency.secondaryCurrency||"LBP"} onChange={e=>setC("secondaryCurrency",e.target.value)} style={SelS()}>
                      {[["LBP","Lebanese Pound (L.L.)"],["USD","US Dollar ($)"],["EUR","Euro (€)"],["AED","UAE Dirham (AED)"],["None","None"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <Field label="SECONDARY SYMBOL" value={currency.secondarySymbol||"L.L."} onChange={v=>setC("secondarySymbol",v)} placeholder="L.L."/>
                </Grid>

                {currency.secondaryCurrency !== "None" && currency.secondaryCurrency && (
                  <>
                    <div style={{ marginBottom:16 }}>
                      <FLabel>EXCHANGE RATE — 1 {currency.primaryCurrency||"USD"} = ? {currency.secondaryCurrency||"LBP"}</FLabel>
                      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                        <input type="number" min="0" step="0.01" value={currency.exchangeRate||0} onChange={e=>setC("exchangeRate",+e.target.value)}
                          style={{...Inp("200px"), fontFamily:"'JetBrains Mono',monospace", fontSize:15, fontWeight:700}}/>
                        <span style={{ fontSize:12, color:C.sub }}>1 {currency.primaryCurrency||"USD"} = {(currency.exchangeRate||0).toLocaleString()} {currency.secondaryCurrency}</span>
                      </div>
                    </div>
                    <ToggleRow label="Show dual currency on receipts" sublabel="Prints both primary and secondary amounts on every receipt line" value={currency.showDualCurrency} onChange={v=>setC("showDualCurrency",v)}/>
                  </>
                )}

                <InfoBox>Primary currency is used throughout the POS. The exchange rate only affects receipt dual-currency display.</InfoBox>
              </Section>
            )}

            {/* ══════════ TAX & SERVICE ══════════ */}
            {tab === "tax" && (
              <Section title="🧮 Tax & Service Charges" desc="Configure VAT and service charge rates applied to all orders.">
                <Grid cols={2}>
                  <div>
                    <FLabel>VAT / TAX RATE (%)</FLabel>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <input type="number" min="0" max="100" step="0.1"
                        value={app.taxRate??11}
                        onChange={e => setA("taxRate", +e.target.value)}
                        disabled={!pos.enableTax}
                        style={{...Inp("120px"), fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, opacity:pos.enableTax===false?0.4:1}}/>
                      <span style={{ fontSize:13, color:C.sub }}>{app.taxRate??11}% of (subtotal + service)</span>
                    </div>
                  </div>
                  <div>
                    <FLabel>SERVICE CHARGE RATE (%)</FLabel>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <input type="number" min="0" max="100" step="0.1"
                        value={app.serviceRate??10}
                        onChange={e => setA("serviceRate", +e.target.value)}
                        disabled={!pos.enableService}
                        style={{...Inp("120px"), fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, opacity:pos.enableService===false?0.4:1}}/>
                      <span style={{ fontSize:13, color:C.sub }}>{app.serviceRate??10}% of discounted subtotal</span>
                    </div>
                  </div>
                </Grid>

                <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
                  <ToggleRow label="Enable VAT / Tax" sublabel="Apply tax to all orders" value={pos.enableTax!==false} onChange={v=>setP("enableTax",v)}/>
                  <ToggleRow label="Enable Service Charge" sublabel="Apply service charge to all orders" value={pos.enableService!==false} onChange={v=>setP("enableService",v)}/>
                </div>

                {/* Live preview */}
                <TaxPreview taxRate={app.taxRate??11} svcRate={app.serviceRate??10} taxOn={pos.enableTax!==false} svcOn={pos.enableService!==false} sym={currency.primarySymbol||"$"}/>
              </Section>
            )}

            {/* ══════════ RECEIPT ══════════ */}
            {tab === "receipt" && (
              <Section title="🖨 Receipt Settings" desc="Customise thermal receipt output, paper size, and footer messages.">
                <Grid>
                  <Field label="RECEIPT FOOTER LINE 1" value={receipt.footerLine1||""} onChange={v=>setR("footerLine1",v)} placeholder="Thank you for dining with us!"/>
                  <Field label="RECEIPT FOOTER LINE 2" value={receipt.footerLine2||""} onChange={v=>setR("footerLine2",v)} placeholder="Please come again soon"/>
                </Grid>

                <div style={{ marginBottom:20 }}>
                  <FLabel>THERMAL PAPER SIZE</FLabel>
                  <div style={{ display:"flex", gap:10 }}>
                    {[["58mm","58mm (Compact)"],["80mm","80mm (Standard)"]].map(([v,l]) => (
                      <button key={v} className="sc-btn" onClick={() => setR("paperWidth",v)}
                        style={{ background:receipt.paperWidth===v?C.acc+"22":"transparent", border:`1px solid ${receipt.paperWidth===v?C.acc+"70":C.bdr}`, color:receipt.paperWidth===v?C.acc:C.muted, borderRadius:9, padding:"9px 22px", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>
                        🧻 {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
                  <ToggleRow label="Auto-print after payment" sublabel="Opens print dialog automatically when an order is paid" value={receipt.autoPrint} onChange={v=>setR("autoPrint",v)}/>
                  <ToggleRow label="Show QR code on receipt" sublabel="Prints a QR pattern with the receipt ID" value={receipt.showQR} onChange={v=>setR("showQR",v)}/>
                  {currency.showDualCurrency && (
                    <ToggleRow label="Show dual currency on receipt" sublabel="Already enabled in Currency settings" value={true} onChange={() => {}} disabled/>
                  )}
                </div>

                {/* Receipt mini preview */}
                <ReceiptPreview receipt={receipt} app={app} currency={currency}/>
              </Section>
            )}

            {/* ══════════ POS ══════════ */}
            {tab === "pos" && (
              <Section title="⚙ POS Behaviour" desc="Control how the POS operates during a shift.">
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
                  <ToggleRow label="Prevent negative stock" sublabel="Blocks selling items when inventory would go below zero" value={pos.preventNegativeStock} onChange={v=>setP("preventNegativeStock",v)}/>
                  <ToggleRow label="Require customer name for delivery" sublabel="Makes customer name mandatory for delivery orders" value={pos.requireCustomerDelivery} onChange={v=>setP("requireCustomerDelivery",v)}/>
                  <ToggleRow label="Require open shift before selling" sublabel="Cashiers cannot process orders without an active shift" value={pos.requireShiftToSell} onChange={v=>setP("requireShiftToSell",v)}/>
                </div>

                <div style={{ marginBottom:20 }}>
                  <FLabel>DEFAULT ORDER TYPE</FLabel>
                  <div style={{ display:"flex", gap:8 }}>
                    {[["dine-in","🍽 Dine-In"],["takeaway","🛍 Takeaway"],["delivery","🛵 Delivery"]].map(([v,l]) => (
                      <button key={v} className="sc-btn" onClick={() => setP("defaultOrderType",v)}
                        style={{ background:pos.defaultOrderType===v?C.acc+"22":"transparent", border:`1px solid ${pos.defaultOrderType===v?C.acc+"70":C.bdr}`, color:pos.defaultOrderType===v?C.acc:C.muted, borderRadius:9, padding:"9px 18px", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <InfoBox>POS settings take effect immediately after saving. Cashiers will see the updated defaults on their next order.</InfoBox>
              </Section>
            )}

            {/* ══════════ SECURITY ══════════ */}
            {tab === "security" && (
              <SecurityPanel users={users} onRefresh={load} showToast={showToast} firebaseServices={firebaseServices} useFirebase={useFirebase}/>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:22, left:"50%", transform:"translateX(-50%)", background:toast.type==="err"?C.danger:toast.type==="warn"?C.warn:C.success, color:"#000", fontWeight:700, fontSize:13, padding:"10px 22px", borderRadius:24, zIndex:9999, boxShadow:"0 6px 24px rgba(0,0,0,0.5)", whiteSpace:"nowrap", pointerEvents:"none" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECURITY PANEL — Users & Permissions
══════════════════════════════════════════════════════ */

function SecurityPanel({ users, onRefresh, showToast, firebaseServices, useFirebase }) {
  const [modal,    setModal]    = useState(null);  // "editUser"|"addUser"|"permissions"
  const [selUser,  setSelUser]  = useState(null);
  const [delConfirm,setDelConfirm] = useState(null);
  const [permsRole, setPermsRole] = useState("cashier");

  const handleDelete = async (u) => {
    if (u.id === "u1" || u.username === "admin") { showToast("Cannot delete the admin account","err"); return; }
    try {
      console.log('Deleting user:', u.id);
      if (useFirebase) {
        await firebaseServices.users.delete(u.id);
        console.log('User deleted from Firebase');
      } else {
        await AuthService.deleteUser(u.id);
        console.log('User deleted from localStorage');
      }
      
      onRefresh();
      showToast("User deleted","warn");
    } catch(e) { 
      console.error('Error deleting user:', e);
      showToast("Delete failed","err"); 
    }
    setDelConfirm(null);
  };

  return (
    <div>
      {/* Users list */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <SectionLabel icon="👤" label="System Users"/>
          <button className="sc-btn" onClick={() => { setSelUser(null); setModal("addUser"); }} style={Btn(C.acc)}>+ Add User</button>
        </div>
        <div style={{ background:C.card, border:`1px solid ${C.bdr}`, borderRadius:12, overflow:"hidden" }}>
          {/* Table header */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 130px 110px 160px", gap:0, padding:"8px 16px", background:"#0a1020", borderBottom:`1px solid ${C.bdr}` }}>
            {["Name / Username","Role","Status","Actions"].map(h=>(
              <span key={h} style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:"0.08em" }}>{h}</span>
            ))}
          </div>
          {users.map((u, i) => {
            const meta = ROLE_META[u.role] || ROLE_META.cashier;
            const isLast = i === users.length - 1;
            return (
              <div key={u.id} style={{ display:"grid", gridTemplateColumns:"1fr 130px 110px 160px", gap:0, padding:"11px 16px", borderBottom:isLast?"none":`1px solid ${C.bdr}`, alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:700, color:C.text, fontSize:13 }}>{u.name}</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:C.muted }}>@{u.username}</div>
                </div>
                <div>
                  <span style={{ background:meta.bg, border:`1px solid ${meta.color}40`, color:meta.color, borderRadius:20, padding:"3px 10px", fontSize:10, fontWeight:800 }}>
                    {meta.icon} {meta.label}
                  </span>
                </div>
                <div>
                  <span style={{ background:C.success+"18", color:C.success, borderRadius:6, padding:"2px 9px", fontSize:10, fontWeight:700 }}>Active</span>
                </div>
                <div style={{ display:"flex", gap:5 }}>
                  <button className="sc-btn" onClick={() => { setSelUser(u); setModal("editUser"); }} style={Ghost(C.info, true)}>✏ Edit</button>
                  {u.id !== "u1" && u.username !== "admin" && (
                    <button className="sc-btn" onClick={() => setDelConfirm(u)} style={Ghost(C.danger, true)}>🗑</button>
                  )}
                </div>
              </div>
            );
          })}
          {users.length === 0 && (
            <div style={{ padding:24, textAlign:"center", color:C.muted, fontSize:12 }}>No users found</div>
          )}
        </div>
      </div>

      {/* Role Permissions */}
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <SectionLabel icon="🔐" label="Role Permissions"/>
          <div style={{ display:"flex", gap:6 }}>
            {ROLES.map(r => {
              const m = ROLE_META[r];
              return (
                <button key={r} className="sc-btn" onClick={() => setPermsRole(r)}
                  style={{ background:permsRole===r?m.color+"22":"transparent", border:`1px solid ${permsRole===r?m.color+"60":C.bdr}`, color:permsRole===r?m.color:C.muted, borderRadius:8, padding:"5px 13px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ background:C.card, border:`1px solid ${C.bdr}`, borderRadius:12, padding:"4px 0", overflow:"hidden" }}>
          {Object.entries(PERM_LABELS).map(([perm, label], i) => {
            const granted = PERMISSIONS[permsRole]?.[perm] === true;
            const isAdmin = permsRole === "admin";
            return (
              <div key={perm} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 16px", borderBottom:i<Object.keys(PERM_LABELS).length-1?`1px solid ${C.bdr}`:"none" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:granted?C.text:C.muted }}>{label}</div>
                  <div style={{ fontSize:10, color:C.muted, fontFamily:"monospace" }}>{perm}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:11, color:granted?C.success:C.danger, fontWeight:700 }}>
                    {granted ? "✅ Allowed" : "🚫 Denied"}
                  </span>
                  {isAdmin && (
                    <span style={{ fontSize:10, color:C.acc, background:C.acc+"18", borderRadius:6, padding:"2px 8px" }}>Full access</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:8, padding:"6px 12px", background:C.card, borderRadius:8, border:`1px solid ${C.bdr}` }}>
          📌 Role permissions are fixed in this version. Admin always has full access. To customise per-user permissions, use the user edit form.
        </div>
      </div>

      {/* User form modal */}
      {(modal === "editUser" || modal === "addUser") && (
        <UserFormModal
          user={selUser}
          onSave={async (data) => {
            try {
              // Check for duplicate username
              const duplicate = users.find(u => 
                u.username?.toLowerCase() === data.username?.toLowerCase() && u.id !== data.id
              );
              if (duplicate) { 
                showToast("Username already exists", "err"); 
                return; 
              }
              
              console.log('Saving user:', data);
              if (useFirebase) {
                await firebaseServices.users.save(data);
                console.log('User saved to Firebase');
              } else {
                await AuthService.saveUser(data);
                console.log('User saved to localStorage');
              }
              await onRefresh();
              setModal(null);
              showToast(selUser ? "User updated" : "User created");
            } catch(e) { 
              console.error('Error saving user:', e);
              showToast("Save failed: " + e.message, "err"); 
            }
          }}
          onClose={() => setModal(null)}/>
      )}

      {/* Delete confirm */}
      {delConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9000, padding:16 }}>
          <div style={{ background:C.card2, border:`1px solid ${C.bdr}`, borderRadius:14, padding:"24px 22px", width:360, maxWidth:"96vw" }}>
            <div style={{ fontWeight:800, color:C.text, marginBottom:8 }}>Delete user?</div>
            <div style={{ fontSize:13, color:C.sub, marginBottom:20 }}>
              Remove <strong style={{color:C.text}}>{delConfirm.name}</strong> (@{delConfirm.username})? They will no longer be able to log in.
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button className="sc-btn" onClick={() => handleDelete(delConfirm)} style={{...Btn(C.danger,"#fff"),flex:1}}>Delete</button>
              <button className="sc-btn" onClick={() => setDelConfirm(null)} style={{...Ghost(),flex:1}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── USER FORM MODAL ─────────────────────────────────*/
function UserFormModal({ user, onSave, onClose }) {
  const [name,     setName]    = useState(user?.name     || "");
  const [username, setUsername]= useState(user?.username || "");
  const [password, setPassword]= useState("");
  const [role,     setRole]    = useState(user?.role     || "cashier");
  const [showPwd,  setShowPwd] = useState(false);

  const save = async () => {
    if (!name.trim())     { alert("Name required"); return; }
    if (!username.trim()) { alert("Username required"); return; }
    if (!user && !password) { alert("Password required for new user"); return; }
    
    const data = {
      id:       user?.id || `u_${Date.now()}`,
      name:     name.trim(),
      username: username.trim().toLowerCase(),
      role,
    };
    
    // Hash password if provided
    if (password) {
      data.password = await hashPassword(password);
    } else if (user?.password) {
      data.password = user.password;
    }
    
    await onSave(data);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9000, padding:16 }}>
      <div style={{ background:C.card2, border:`1px solid ${C.bdr}`, borderRadius:14, padding:"22px 20px", width:400, maxWidth:"96vw", boxShadow:"0 24px 64px rgba(0,0,0,0.6)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <span style={{ fontWeight:800, fontSize:15, color:C.text }}>{user ? "Edit User" : "New User"}</span>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:C.muted, cursor:"pointer", fontSize:20, padding:0 }}>✕</button>
        </div>

        <div style={{ marginBottom:12 }}>
          <FLabel>FULL NAME</FLabel>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Alex Kassem" style={Inp()}/>
        </div>
        <div style={{ marginBottom:12 }}>
          <FLabel>USERNAME</FLabel>
          <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. cashier1" style={{...Inp(), fontFamily:"'JetBrains Mono',monospace"}}/>
        </div>
        <div style={{ marginBottom:12 }}>
          <FLabel>{user ? "NEW PASSWORD (leave blank to keep current)" : "PASSWORD"}</FLabel>
          <div style={{ position:"relative" }}>
            <input type={showPwd?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder={user?"••••••••":"Create password"} style={{...Inp(), paddingRight:40}}/>
            <button onClick={()=>setShowPwd(!showPwd)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16 }}>
              {showPwd?"🙈":"👁"}
            </button>
          </div>
        </div>
        <div style={{ marginBottom:20 }}>
          <FLabel>ROLE</FLabel>
          <div style={{ display:"flex", gap:8 }}>
            {ROLES.map(r => {
              const m = ROLE_META[r];
              return (
                <button key={r} className="sc-btn" onClick={() => setRole(r)}
                  style={{ flex:1, background:role===r?m.color+"22":"transparent", border:`1px solid ${role===r?m.color+"60":C.bdr}`, color:role===r?m.color:C.muted, borderRadius:8, padding:"8px 0", cursor:"pointer", fontWeight:700, fontSize:11, fontFamily:"inherit" }}>
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>
            {role === "admin" ? "Full access to all features and settings." : role === "cashier" ? "POS access, payments, receipts. No settings or prices." : "Kitchen display only. No POS or reports access."}
          </div>
        </div>

        <div style={{ display:"flex", gap:8 }}>
          <button className="sc-btn" onClick={save} style={{...Btn(C.acc),flex:1}}>Save User</button>
          <button className="sc-btn" onClick={onClose} style={{...Ghost(),flex:1}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   LOGO UPLOAD
══════════════════════════════════════════════════════ */
function LogoUpload({ value, onChange }) {
  const ref = useRef();
  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 200 * 1024) { alert("Logo must be under 200KB"); return; }
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target.result);
    reader.readAsDataURL(f);
    e.target.value = "";
  };
  return (
    <div style={{ marginBottom:20 }}>
      <FLabel>BUSINESS LOGO</FLabel>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:72, height:72, borderRadius:12, background:C.card, border:`1.5px dashed ${C.bdr}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
          {value
            ? <img src={value} alt="Logo" style={{ width:"100%", height:"100%", objectFit:"contain" }}/>
            : <span style={{ fontSize:28, opacity:0.3 }}>🖼</span>}
        </div>
        <div>
          <button className="sc-btn" onClick={() => ref.current?.click()} style={Ghost(C.info, true)}>📁 Upload Logo</button>
          {value && <button className="sc-btn" onClick={() => onChange("")} style={{...Ghost(C.danger, true), marginLeft:8}}>Remove</button>}
          <div style={{ fontSize:10, color:C.muted, marginTop:5 }}>PNG / JPEG · max 200KB · Appears on receipts</div>
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg" onChange={handleFile} style={{ display:"none" }}/>
      </div>
    </div>
  );
}

/* ── TAX PREVIEW ─────────────────────────────────────*/
function TaxPreview({ taxRate, svcRate, taxOn, svcOn, sym }) {
  const base    = 10.00;
  const disc    = 0;
  const after   = base - disc;
  const svc     = svcOn  ? (after * svcRate / 100) : 0;
  const tax     = taxOn  ? ((after + svc) * taxRate / 100) : 0;
  const total   = after + svc + tax;
  const fmt = (n) => `${sym}${n.toFixed(2)}`;
  return (
    <div style={{ background:C.card, border:`1px solid ${C.bdr}`, borderRadius:10, padding:16 }}>
      <div style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:"0.06em", marginBottom:10 }}>PREVIEW — ORDER OF {fmt(base)}</div>
      {[
        ["Subtotal",                                    fmt(base),  C.sub    ],
        svcOn  ? [`Service (${svcRate}%)`,`+${fmt(svc)}`, C.warn]   : null,
        taxOn  ? [`VAT (${taxRate}%)`,    `+${fmt(tax)}`, C.warn]   : null,
        ["Grand Total",                                 fmt(total), C.acc    ],
      ].filter(Boolean).map(([l,v,c]) => (
        <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"3px 0", borderBottom:l==="Grand Total"?`1px solid ${C.bdr}`:"none", marginTop:l==="Grand Total"?4:0, paddingTop:l==="Grand Total"?6:3 }}>
          <span style={{ color:C.sub }}>{l}</span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:l==="Grand Total"?900:600, color:c, fontSize:l==="Grand Total"?15:13 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ── RECEIPT PREVIEW ─────────────────────────────────*/
function ReceiptPreview({ receipt, app, currency }) {
  const sym = currency.primarySymbol || "$";
  const W   = receipt.paperWidth === "58mm" ? 200 : 280;
  return (
    <div>
      <FLabel>PREVIEW</FLabel>
      <div style={{ background:"#f0f0f0", padding:16, borderRadius:8, display:"flex", justifyContent:"center" }}>
        <div style={{ width:W, background:"#fff", padding:"10px 12px", fontFamily:"'Courier New',monospace", fontSize:10, color:"#000", borderRadius:2, boxShadow:"0 2px 10px rgba(0,0,0,0.15)" }}>
          {app.logo && <div style={{ textAlign:"center", marginBottom:4 }}><img src={app.logo} alt="" style={{ height:32, objectFit:"contain" }}/></div>}
          <div style={{ textAlign:"center", fontWeight:700, fontSize:12, marginBottom:2 }}>{app.businessName || "KAVO Restaurant"}</div>
          <div style={{ textAlign:"center", fontSize:9, color:"#555", marginBottom:2 }}>{app.branch || "Main Branch"}</div>
          <div style={{ textAlign:"center", fontSize:9, color:"#666" }}>{app.address || ""}</div>
          <div style={{ textAlign:"center", fontSize:9, color:"#666" }}>Tel: {app.phone || ""}</div>
          <div style={{ borderTop:"1px dashed #999", margin:"6px 0" }}/>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:9 }}><span>Espresso ×1</span><span>{sym}3.50</span></div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:9 }}><span>Cappuccino ×2</span><span>{sym}9.00</span></div>
          <div style={{ borderTop:"1px dashed #999", margin:"6px 0" }}/>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, fontWeight:700 }}><span>TOTAL</span><span>{sym}12.50</span></div>
          <div style={{ borderTop:"1px solid #000", margin:"6px 0" }}/>
          <div style={{ textAlign:"center", fontSize:9, lineHeight:1.6, color:"#444" }}>
            <div>{receipt.footerLine1 || "Thank you!"}</div>
            <div>{receipt.footerLine2 || "Please come again"}</div>
            {app.website && <div style={{ color:"#888", fontSize:8 }}>{app.website}</div>}
          </div>
          {receipt.showQR && (
            <div style={{ textAlign:"center", marginTop:6, fontSize:8, color:"#bbb" }}>
              ▪▪▪ QR ▪▪▪
            </div>
          )}
          <div style={{ textAlign:"center", fontSize:7, color:"#ccc", marginTop:4 }}>POWERED BY KAVO-SYS</div>
        </div>
      </div>
    </div>
  );
}

/* ── SHARED SUB-COMPONENTS ───────────────────────────*/
function Section({ title, desc, children }) {
  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontWeight:900, fontSize:17, color:C.text, marginBottom:4 }}>{title}</div>
        {desc && <div style={{ fontSize:12, color:C.muted }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function SectionLabel({ icon, label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ fontSize:14 }}>{icon}</span>
      <span style={{ fontSize:11, fontWeight:800, color:C.acc, letterSpacing:"0.08em" }}>{label.toUpperCase()}</span>
    </div>
  );
}

function Grid({ children, cols=2 }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols},1fr)`, gap:14, marginBottom:20 }}>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type="text", placeholder="", disabled=false }) {
  return (
    <div>
      <FLabel>{label}</FLabel>
      <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        style={{...Inp(), opacity:disabled?0.5:1}}/>
    </div>
  );
}

function ToggleRow({ label, sublabel, value, onChange, disabled=false }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background:C.card, borderRadius:10, border:`1px solid ${C.bdr}`, opacity:disabled?0.5:1 }}>
      <div>
        <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{label}</div>
        {sublabel && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{sublabel}</div>}
      </div>
      <div className="sc-tog" onClick={() => !disabled && onChange(!value)}
        style={{ width:42, height:23, borderRadius:12, background:value?C.success:"#2a3a50", position:"relative", flexShrink:0, transition:"background 0.2s" }}>
        <div style={{ position:"absolute", top:3, left:value?21:3, width:17, height:17, borderRadius:9, background:"#fff", transition:"left 0.18s", boxShadow:"0 1px 4px rgba(0,0,0,0.3)" }}/>
      </div>
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div style={{ fontSize:11, color:C.info, background:C.info+"12", border:`1px solid ${C.info}30`, borderRadius:8, padding:"8px 12px", lineHeight:1.6 }}>
      ℹ {children}
    </div>
  );
}

function FLabel({ children }) {
  return <div style={{ fontSize:10, color:C.muted, fontWeight:700, letterSpacing:"0.08em", marginBottom:5 }}>{children}</div>;
}

function Spin() {
  return <span style={{ display:"inline-block", width:13, height:13, border:"2px solid rgba(0,0,0,0.2)", borderTopColor:"currentColor", borderRadius:"50%", animation:"spin 0.7s linear infinite", flexShrink:0 }}/>;
}

function LoadingScreen() {
  return (
    <div style={{ height:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14 }}>
      <Spin/>
      <div style={{ fontSize:12, color:C.muted }}>Loading settings…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
