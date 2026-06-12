import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { MenuService, ModifierService, SEED_MODIFIER_GROUPS } from "../db/services/menu.js";
import { RecipeService } from "../db/services/inventory.js";
import { useFirebaseServices } from "../firebase/FirebaseServicesProvider.jsx";
import { useTenant } from "../contexts/TenantProvider.jsx";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Menu Management  ·  v1.0
   Admin-only: add/edit/delete items, categories,
   modifiers, recipes, cost & profit tracking.
══════════════════════════════════════════════════════ */

// ── Design tokens ─────────────────────────────────────
const C = {
  bg:"#070c16", surf:"#0b1220", card:"#101828", bdr:"#1a2438",
  acc:"#f0a500", text:"#e8edf5", muted:"#4a6080", sub:"#7d8fa0",
  success:"#3fb950", danger:"#f85149", info:"#58a6ff", warn:"#d29922",
};
const safeArr = (v, d=[]) => Array.isArray(v) ? v : d;
const safeNum = (v) => { const n=+v; return isFinite(n)?n:0; };
const CUR  = (n, s="$") => `${s}${safeNum(n).toFixed(2)}`;
const PCT  = (n) => `${safeNum(n).toFixed(1)}%`;

const Btn  = (bg, col="#000", sm=false) => ({ background:bg, color:col, border:"none", borderRadius:8, padding:sm?"5px 12px":"9px 16px", cursor:"pointer", fontWeight:700, fontSize:sm?11:12, fontFamily:"inherit", transition:"opacity 0.14s", whiteSpace:"nowrap" });
const Ghost= (col=C.muted, sm=false)   => ({ background:"transparent", color:col, border:`1px solid ${C.bdr}`, borderRadius:8, padding:sm?"5px 11px":"8px 14px", cursor:"pointer", fontWeight:600, fontSize:sm?11:12, fontFamily:"inherit", whiteSpace:"nowrap" });
const Inp  = { width:"100%", background:C.card, border:`1px solid ${C.bdr}`, borderRadius:8, padding:"8px 12px", color:C.text, fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
const Sel  = { ...{width:"100%", background:C.card, border:`1px solid ${C.bdr}`, borderRadius:8, padding:"8px 12px", color:C.text, fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box"} };

const BG_PALETTE = [
  "#7c3aed","#92400e","#78716c","#1c1917","#78350f","#44403c",
  "#0c4a6e","#1e3a5f","#c2410c","#166534","#164e63","#713f12",
  "#14532d","#78350f","#7f1d1d","#7c2d12","#9d174d","#431407",
  "#1e3a5f","#1e1b4b","#0f172a","#172554","#065f46","#134e4a",
];
const EMOJI_LIST = [
  "☕","🥛","🍫","🧋","🥤","🍊","💧","🍋","🥪","🥗","🥑","🍳","🍔","🍝",
  "🍰","🍮","🍨","🧇","⭐","🍱","🍵","🧃","🍺","🍷","🎂","🌮","🍕","🥩",
  "🫕","🥘","🍲","🍜","🫙","🍩","🍪","🧁","🍦","🫖","🧊","🫐","🍓","🥞",
];

const TABS = [
  { id:"items",      label:"🍽 Menu Items" },
  { id:"categories", label:"📂 Categories" },
  { id:"modifiers",  label:"⚙ Modifiers" },
];

const CAT_ICONS = ["☕","🧋","🍔","🍰","⭐","🌮","🍕","🥗","🍷","🍵","🧃","🎉"];

// ══════════════════════════════════════════════════════
//   MAIN COMPONENT
// ══════════════════════════════════════════════════════
export default function MenuManagement({ onBack, onNavigate }) {
  const { user } = useAuth();
  const sym = "$";
  
  // Firebase integration
  const firebaseServices = useFirebaseServices();
  const { tenantId } = useTenant();
  const useFirebase = !!tenantId && !!firebaseServices;

  const [tab,       setTab]       = useState("items");
  const [items,     setItems]     = useState([]);
  const [cats,      setCats]      = useState([]);
  const [modGroups, setModGroups] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [catFil,    setCatFil]    = useState("all");
  const [statusFil, setStatusFil] = useState("all"); // all|active|inactive|oos|fav
  const [modal,     setModal]     = useState(null);
  const [selItem,   setSelItem]   = useState(null);
  const [selCat,    setSelCat]    = useState(null);
  const [selMod,    setSelMod]    = useState(null);
  const [toast,     setToast]     = useState(null);
  const [sortBy,    setSortBy]    = useState("name"); // name|price|margin|cat

  const showToast = (msg, type="ok") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 2600);
  };

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (useFirebase) {
        // Use Firebase services
        console.log('Loading menu data from Firebase...');
        const [allItems, allCats, allMods] = await Promise.all([
          firebaseServices.menu.getAll(),
          firebaseServices.menu.getCategories(),
          firebaseServices.menu.getModifierGroups(),
        ]);
        console.log('Loaded items:', allItems);
        console.log('Loaded categories:', allCats);
        console.log('Loaded modifier groups:', allMods);
        setItems(safeArr(allItems));
        setCats(safeArr(allCats));
        setModGroups(safeArr(allMods));
      } else {
        // Fallback to local IndexedDB
        console.log('Loading menu data from IndexedDB...');
        const [allItems, allCats, allMods] = await Promise.all([
          MenuService.getAll(),
          MenuService.getCategories(),
          ModifierService.getAll(),
        ]);
        console.log('Loaded items:', allItems);
        console.log('Loaded categories:', allCats);
        console.log('Loaded modifier groups:', allMods);
        setItems(safeArr(allItems));
        setCats(safeArr(allCats));
        setModGroups(safeArr(allMods));
      }
    } catch(e) { 
      console.error('Error loading menu data:', e);
      showToast('Error loading data', 'error');
    }
    setLoading(false);
  }, [useFirebase, firebaseServices]);

  useEffect(() => { reload(); }, [reload]);

  // ── Computed recipe costs (async, runs after items load) ──
  const [recipeCosts, setRecipeCosts] = useState({});
  useEffect(() => {
    const fetchCosts = async () => {
      const costs = {};
      for (const item of items) {
        costs[item.id] = await MenuService.calcRecipeCost(item.id);
      }
      setRecipeCosts(costs);
    };
    if (items.length > 0) fetchCosts();
  }, [items]);

  const getCost  = (item) => recipeCosts[item.id] ?? safeNum(item.costPrice);
  const getMargin= (item) => MenuService.profitMargin(item.price, getCost(item));

  // ── Filtered + sorted items ────────────────────────
  const visible = useMemo(() => {
    let list = items.filter(i => {
      const mc = catFil === "all" || i.cat === catFil;
      const mq = !search || i.name?.toLowerCase().includes(search.toLowerCase());
      const ms = statusFil === "all"      ? true
               : statusFil === "active"   ? (i.active !== false && !i.outOfStock)
               : statusFil === "inactive" ? (i.active === false)
               : statusFil === "oos"      ? !!i.outOfStock
               : statusFil === "fav"      ? !!i.favorite
               : true;
      return mc && mq && ms;
    });
    list.sort((a,b) => {
      if (sortBy === "price")  return safeNum(b.price) - safeNum(a.price);
      if (sortBy === "margin") return getMargin(b) - getMargin(a);
      if (sortBy === "cat")    return (a.cat||"").localeCompare(b.cat||"");
      return (a.name||"").localeCompare(b.name||"");
    });
    return list;
  }, [items, catFil, search, statusFil, sortBy, recipeCosts]);

  // ── Dashboard stats ────────────────────────────────
  const stats = useMemo(() => ({
    total:    items.length,
    active:   items.filter(i => i.active !== false && !i.outOfStock).length,
    inactive: items.filter(i => i.active === false).length,
    oos:      items.filter(i => !!i.outOfStock).length,
    fav:      items.filter(i => !!i.favorite).length,
    avgPrice: items.length ? items.reduce((s,i) => s+safeNum(i.price), 0) / items.length : 0,
  }), [items]);

  // ── Quick toggles ──────────────────────────────────
  const quickToggle = async (id, field) => {
    try {
      if (useFirebase) {
        // Use Firebase services
        if (field === "active")     await firebaseServices.menu.toggleActive(id);
        if (field === "outOfStock") await firebaseServices.menu.toggleOutOfStock(id);
        if (field === "favorite")   await firebaseServices.menu.toggleFavorite(id);
      } else {
        // Use local services
        if (field === "active")     await MenuService.toggleActive(id);
        if (field === "outOfStock") await MenuService.toggleOutOfStock(id);
        if (field === "favorite")   await MenuService.toggleFavorite(id);
      }
      reload();
    } catch(e) {
      console.error('Error toggling field:', e);
      showToast('Error updating item', 'error');
    }
  };

  return (
    <div style={{ height:"100vh", background:C.bg, color:C.text, fontFamily:"system-ui,-apple-system,sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:${C.bg}; }
        ::-webkit-scrollbar-thumb { background:${C.bdr}; border-radius:4px; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        .mm-in  { animation:fadeUp 0.28s ease; }
        .mm-btn:hover { opacity:0.82; }
        .mm-btn { transition:opacity 0.14s; }
        .mm-tab:hover { background:#1a2438!important; }
        .mm-row:hover { background:#0d1828!important; }
        .mm-card:hover { border-color:${C.acc}60!important; }
        .mm-toggle { transition:background 0.18s; cursor:pointer; }
        input:focus,select:focus,textarea:focus { border-color:${C.acc}!important; outline:none; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{ background:C.surf, borderBottom:`2px solid ${C.acc}`, padding:"0 16px", height:54, display:"flex", alignItems:"center", gap:10, flexShrink:0, flexWrap:"wrap" }}>
        <button className="mm-btn" onClick={onBack} style={Ghost(C.muted,true)}>← Back</button>
        <div style={{ width:1, height:24, background:C.bdr }}/>
        <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:900, fontSize:17, color:C.acc, letterSpacing:"0.07em" }}>KAVO<span style={{color:C.text,opacity:0.3}}>-SYS</span></span>
        <span style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:"0.1em" }}>MENU MANAGER</span>

          <div style={{ display:"flex", gap:3, marginLeft:6 }}>
            {TABS.map(t => (
              <button key={t.id} className="mm-tab mm-btn" onClick={() => setTab(t.id)}
                style={{ background:tab===t.id?C.acc+"22":"transparent", border:`1px solid ${tab===t.id?C.acc+"60":C.bdr}`, color:tab===t.id?C.acc:C.muted, borderRadius:8, padding:"5px 12px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit", transition:"all 0.14s" }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ flex:1 }}/>
          <div style={{ display:"flex", gap:7, alignItems:"center" }}>
            {tab==="items" && (
              <button className="mm-btn" onClick={() => { setSelItem(null); setModal("editItem"); }} style={Btn(C.acc)}>+ New Item</button>
            )}
            {tab==="categories" && (
              <button className="mm-btn" onClick={() => { setSelCat(null); setModal("editCat"); }} style={Btn(C.acc)}>+ New Category</button>
            )}
            {tab==="modifiers" && (
              <button className="mm-btn" onClick={() => { setSelMod(null); setModal("editMod"); }} style={Btn(C.acc)}>+ New Group</button>
            )}
          </div>
        </header>

      {/* ═══ CONTENT ═══ */}
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", padding:14, paddingBottom:80 }}>
        {loading ? <Spinner/> : (
          <>
            {/* ══ MENU ITEMS TAB ══ */}
            {tab === "items" && (
              <div className="mm-in">
                {/* Stats row */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:8, marginBottom:14 }}>
                  {[
                    { label:"Total Items",  val:stats.total,           col:C.info,    filter:"all"      },
                    { label:"Active",       val:stats.active,          col:C.success, filter:"active"   },
                    { label:"Inactive",     val:stats.inactive,        col:C.muted,   filter:"inactive" },
                    { label:"Out of Stock", val:stats.oos,             col:C.danger,  filter:"oos"      },
                    { label:"Favorites",    val:stats.fav,             col:C.warn,    filter:"fav"      },
                    { label:"Avg Price",    val:CUR(stats.avgPrice,sym),col:C.acc,    filter:null        },
                  ].map(s => (
                    <div key={s.label}
                      onClick={() => s.filter && setStatusFil(statusFil===s.filter?"all":s.filter)}
                      style={{ background:statusFil===s.filter?s.col+"22":C.card, border:`1px solid ${statusFil===s.filter?s.col+"60":C.bdr}`, borderRadius:10, padding:"10px 12px", cursor:s.filter?"pointer":"default", transition:"all 0.14s" }}>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:18, color:s.col }}>{s.val}</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Filters */}
                <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
                  <div style={{ position:"relative", flex:1, minWidth:180 }}>
                    <input value={search} onChange={e=>setSearch(e.target.value)}
                      placeholder="🔍 Search items…" style={Inp}/>
                    {search && <button onClick={()=>setSearch("")} style={{ position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16 }}>✕</button>}
                  </div>
                  <select value={catFil} onChange={e=>setCatFil(e.target.value)} style={{ ...Sel, width:140 }}>
                    <option value="all">All Categories</option>
                    {cats.filter(c=>c.id!=="all").map(c => <option key={c.id} value={c.id}>{c.icon||"📂"} {c.name}</option>)}
                  </select>
                  <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ ...Sel, width:130 }}>
                    <option value="name">Sort: Name</option>
                    <option value="price">Sort: Price ↓</option>
                    <option value="margin">Sort: Margin ↓</option>
                    <option value="cat">Sort: Category</option>
                  </select>
                  <span style={{ fontSize:11, color:C.muted }}>{visible.length}/{items.length} items</span>
                </div>

                {/* Items table */}
                {visible.length === 0 ? (
                  <EmptyMsg icon="🍽" msg="No items match. Click + New Item to add."/>
                ) : (
                  <div style={{ background:C.card, border:`1px solid ${C.bdr}`, borderRadius:12, overflow:"hidden" }}>
                    {/* Table header */}
                    <div style={{ display:"grid", gridTemplateColumns:"48px 1fr 90px 80px 80px 72px 72px 72px 130px", gap:0, padding:"8px 14px", borderBottom:`1px solid ${C.bdr}`, background:"#0a1020" }}>
                      {["","Item","Category","Price","Cost","Margin","Active","Stock","Actions"].map(h => (
                        <span key={h} style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:"0.08em" }}>{h}</span>
                      ))}
                    </div>
                    {visible.map((item, i) => {
                      const cost   = getCost(item);
                      const margin = getMargin(item);
                      const cat    = cats.find(c => c.id === item.cat);
                      const isLast = i === visible.length-1;
                      return (
                        <div key={item.id} className="mm-row" style={{ display:"grid", gridTemplateColumns:"48px 1fr 90px 80px 80px 72px 72px 72px 130px", gap:0, padding:"9px 14px", borderBottom:isLast?"none":`1px solid ${C.bdr}`, alignItems:"center", transition:"background 0.1s" }}>

                          {/* Emoji tile */}
                          <div style={{ width:34, height:34, borderRadius:8, background:item.bg||C.card, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, overflow:"hidden", flexShrink:0 }}>
                            {item.photo
                              ? <img src={item.photo} alt={item.name} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                              : (item.em||"🍽")
                            }
                          </div>

                          {/* Name */}
                          <div style={{ paddingLeft:8 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:C.text, display:"flex", alignItems:"center", gap:5 }}>
                              {item.name}
                              {item.favorite && <span style={{ fontSize:11 }}>⭐</span>}
                              {item.modifierGroups?.length > 0 && <span style={{ background:C.info+"18", color:C.info, borderRadius:5, padding:"1px 5px", fontSize:9, fontWeight:800 }}>+MOD</span>}
                            </div>
                            {item.description && <div style={{ fontSize:10, color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}>{item.description}</div>}
                          </div>

                          {/* Category */}
                          <div style={{ fontSize:11, color:C.sub }}>{cat?.icon||""} {cat?.name||item.cat}</div>

                          {/* Price */}
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:C.acc, fontSize:13 }}>{CUR(item.price,sym)}</div>

                          {/* Cost */}
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:cost>0?C.sub:C.bdr }}>{cost>0?CUR(cost,sym):"—"}</div>

                          {/* Margin */}
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:margin>=60?C.success:margin>=30?C.warn:margin>0?C.danger:C.bdr }}>
                            {cost>0?PCT(margin):"—"}
                          </div>

                          {/* Active toggle */}
                          <div>
                            <Toggle on={item.active!==false} onChange={() => quickToggle(item.id,"active")} onColor={C.success}/>
                          </div>

                          {/* Out of stock */}
                          <div>
                            <Toggle on={!item.outOfStock} onChange={() => quickToggle(item.id,"outOfStock")} onColor={C.success} offColor={C.danger} offLabel="OOS"/>
                          </div>

                          {/* Actions */}
                          <div style={{ display:"flex", gap:4 }}>
                            <button className="mm-btn" onClick={() => { setSelItem(item); setModal("editItem"); }} style={Ghost(C.info,true)}>✏ Edit</button>
                            <button className="mm-btn" onClick={() => quickToggle(item.id,"favorite")} style={{ ...Ghost(item.favorite?C.warn:C.muted,true), fontSize:13, padding:"4px 7px" }} title={item.favorite?"Unmark favorite":"Mark as favorite"}>
                              {item.favorite?"⭐":"☆"}
                            </button>
                            <button className="mm-btn" onClick={async () => { 
                              if(window.confirm(`Delete "${item.name}"?`)) {
                                try {
                                  if (useFirebase) {
                                    await firebaseServices.menu.delete(item.id);
                                  } else {
                                    await MenuService.delete(item.id);
                                  }
                                  reload(); 
                                  showToast("Item deleted","warn");
                                } catch(e) {
                                  console.error('Error deleting item:', e);
                                  showToast('Error deleting item', 'error');
                                }
                              }
                            }} style={{ ...Ghost(C.danger,true), fontSize:13, padding:"4px 7px" }}>🗑</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══ CATEGORIES TAB ══ */}
            {tab === "categories" && (
              <div className="mm-in">
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
                  {cats.filter(c=>c.id!=="all").map(c => {
                    const count = items.filter(i=>i.cat===c.id).length;
                    return (
                      <div key={c.id} className="mm-card mm-btn" style={{ background:C.card, border:`1px solid ${C.bdr}`, borderRadius:12, padding:16, transition:"border-color 0.14s" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                          <div style={{ fontSize:32 }}>{c.icon||"📂"}</div>
                          <div style={{ display:"flex", gap:5 }}>
                            <button className="mm-btn" onClick={() => { setSelCat(c); setModal("editCat"); }} style={Ghost(C.info,true)}>✏</button>
                            <button className="mm-btn" onClick={async () => { 
                              if(window.confirm(`Delete category "${c.name}"?`)) {
                                try {
                                  if (useFirebase) {
                                    await firebaseServices.menu.deleteCategory(c.id);
                                  } else {
                                    await MenuService.deleteCategory(c.id);
                                  }
                                  reload(); 
                                  showToast("Category deleted","warn");
                                } catch(e) {
                                  console.error('Error deleting category:', e);
                                  showToast('Error deleting category', 'error');
                                }
                              }
                            }} style={Ghost(C.danger,true)}>🗑</button>
                          </div>
                        </div>
                        <div style={{ fontWeight:800, color:C.text, fontSize:14, marginBottom:3 }}>{c.name}</div>
                        <div style={{ fontSize:11, color:C.muted }}>{count} item{count!==1?"s":""}</div>
                      </div>
                    );
                  })}
                  {/* Add placeholder */}
                  <div onClick={() => { setSelCat(null); setModal("editCat"); }}
                    style={{ background:"transparent", border:`1.5px dashed ${C.bdr}`, borderRadius:12, padding:16, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, cursor:"pointer", minHeight:110, opacity:0.5, transition:"opacity 0.14s" }}
                    onMouseEnter={e=>e.currentTarget.style.opacity="0.8"}
                    onMouseLeave={e=>e.currentTarget.style.opacity="0.5"}>
                    <span style={{ fontSize:28 }}>+</span>
                    <span style={{ fontSize:12, color:C.muted }}>Add Category</span>
                  </div>
                </div>
              </div>
            )}

            {/* ══ MODIFIERS TAB ══ */}
            {tab === "modifiers" && (
              <div className="mm-in">
                <div style={{ fontSize:12, color:C.muted, marginBottom:12, padding:"8px 12px", background:C.card, borderRadius:8, border:`1px solid ${C.bdr}` }}>
                  📌 Modifier groups define size/extra options customers choose when ordering. Assign groups to menu items in the item edit form.
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
                  {modGroups.map(mg => (
                    <div key={mg.id} className="mm-card" style={{ background:C.card, border:`1px solid ${C.bdr}`, borderRadius:12, padding:14, transition:"border-color 0.14s" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                        <div>
                          <div style={{ fontWeight:800, color:C.text, fontSize:14 }}>{mg.name}</div>
                          <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                            {mg.required?"Required":"Optional"} · {mg.multiSelect?"Multi-select":"Single select"}
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:5 }}>
                          <button className="mm-btn" onClick={() => { setSelMod(mg); setModal("editMod"); }} style={Ghost(C.info,true)}>✏</button>
                          <button className="mm-btn" onClick={async () => { 
                            if(window.confirm(`Delete "${mg.name}"?`)) {
                              try {
                                if (useFirebase) {
                                  await firebaseServices.menu.deleteModifierGroup(mg.id);
                                } else {
                                  await ModifierService.delete(mg.id);
                                }
                                reload(); 
                                showToast("Group deleted","warn");
                              } catch(e) {
                                console.error('Error deleting modifier group:', e);
                                showToast('Error deleting group', 'error');
                              }
                            }
                          }} style={Ghost(C.danger,true)}>🗑</button>
                        </div>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                        {safeArr(mg.options).map(opt => (
                          <span key={opt.id} style={{ background:C.bg, borderRadius:6, padding:"3px 9px", fontSize:11, color:C.sub }}>
                            {opt.label}
                            {safeNum(opt.priceAdj) !== 0 && <span style={{ color:C.acc, marginLeft:4 }}>{safeNum(opt.priceAdj)>0?"+":""}{CUR(opt.priceAdj,sym)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      {modal === "editItem" && (
        <ItemFormModal
          item={selItem} cats={cats} modGroups={modGroups} sym={sym}
          getCost={getCost} getMargin={getMargin}
          onSave={async (data) => {
            try {
              const prev_ = selItem;
              console.log('Saving menu item:', data);
              if (useFirebase) {
                const saved = await firebaseServices.menu.save(data);
                console.log('Item saved to Firebase:', saved);
              } else {
                const saved = await MenuService.save(data);
                console.log('Item saved to IndexedDB:', saved);
              }
              reload(); setModal(null);
              showToast(selItem ? "Item updated" : "Item created");
            } catch(e) {
              console.error('Error saving item:', e);
              showToast('Error saving item', 'error');
            }
          }}
          onClose={() => setModal(null)}/>
      )}
      {modal === "editCat" && (
        <CategoryFormModal
          cat={selCat}
          onSave={async (data) => {
            try {
              console.log('Saving category:', {...selCat,...data});
              if (useFirebase) {
                const saved = await firebaseServices.menu.saveCategory({...selCat,...data});
                console.log('Category saved to Firebase:', saved);
              } else {
                const saved = await MenuService.saveCategory({...selCat,...data});
                console.log('Category saved to IndexedDB:', saved);
              }
              reload(); setModal(null);
              showToast(selCat ? "Category updated" : "Category created");
            } catch(e) {
              console.error('Error saving category:', e);
              showToast('Error saving category', 'error');
            }
          }}
          onClose={() => setModal(null)}/>
      )}
      {modal === "editMod" && (
        <ModifierGroupModal
          group={selMod} sym={sym}
          onSave={async (data) => {
            try {
              if (useFirebase) {
                await firebaseServices.menu.saveModifierGroup({...selMod,...data});
              } else {
                await ModifierService.save({...selMod,...data});
              }
              reload(); setModal(null);
              showToast(selMod ? "Modifier group updated" : "Group created");
            } catch(e) {
              console.error('Error saving modifier group:', e);
              showToast('Error saving modifier group', 'error');
            }
          }}
          onClose={() => setModal(null)}/>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:toast.type==="err"?C.danger:toast.type==="warn"?C.warn:C.success, color:"#000", fontWeight:700, fontSize:13, padding:"9px 20px", borderRadius:20, zIndex:9999, boxShadow:"0 4px 20px rgba(0,0,0,.4)", whiteSpace:"nowrap", pointerEvents:"none" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   ITEM FORM MODAL
══════════════════════════════════════════════════════ */
function ItemFormModal({ item, cats, modGroups, sym, getCost, getMargin, onSave, onClose }) {
  const [f, setF] = useState({
    id:             item?.id || `m_${Date.now()}`,
    name:           item?.name || "",
    description:    item?.description || "",
    cat:            item?.cat || (cats.find(c=>c.id!=="all")?.id || "hot"),
    price:          item?.price ?? "",
    costPrice:      item?.costPrice ?? "",
    bg:             item?.bg || BG_PALETTE[0],
    em:             item?.em || "🍽",
    photo:          item?.photo || "",   // base64 encoded image
    active:         item?.active !== false,
    outOfStock:     !!item?.outOfStock,
    favorite:       !!item?.favorite,
    modifierGroups: safeArr(item?.modifierGroups),
    createdAt:      item?.createdAt,
  });

  const [activeTab,   setActiveTab] = useState("basic"); // basic|modifiers|recipe
  const [recipeCost,  setRecipeCost]= useState(0);
  const [showEmoji,   setShowEmoji] = useState(false);

  useEffect(() => {
    if (item?.id) {
      MenuService.calcRecipeCost(item.id).then(setRecipeCost);
    }
  }, [item]);

  const set = (k, v) => setF(p => ({...p, [k]:v}));
  const price    = safeNum(f.price);
  const manCost  = safeNum(f.costPrice);
  const effCost  = recipeCost > 0 ? recipeCost : manCost;
  const margin   = MenuService.profitMargin(price, effCost);
  const profit   = price - effCost;

  const toggleMod = (mgId) => {
    setF(p => ({
      ...p,
      modifierGroups: p.modifierGroups.includes(mgId)
        ? p.modifierGroups.filter(id => id !== mgId)
        : [...p.modifierGroups, mgId],
    }));
  };

  return (
    <MModal title={item ? `✏ Edit — ${item.name}` : "🆕 New Menu Item"} onClose={onClose} wide>
      {/* Sub-tabs */}
      <div style={{ display:"flex", gap:5, marginBottom:16, borderBottom:`1px solid ${C.bdr}`, paddingBottom:10 }}>
        {[["basic","📋 Basic"],["modifiers","⚙ Modifiers"],["recipe","🔗 Recipe & Cost"]].map(([id,label]) => (
          <button key={id} className="mm-btn" onClick={() => setActiveTab(id)}
            style={{ background:activeTab===id?C.acc+"22":"transparent", border:`1px solid ${activeTab===id?C.acc+"60":C.bdr}`, color:activeTab===id?C.acc:C.muted, borderRadius:8, padding:"5px 13px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── BASIC TAB ── */}
      {activeTab === "basic" && (
        <div>
          {cats.filter(c=>c.id!=="all").length === 0 && (
            <div style={{ background:C.warn+"18", border:`1px solid ${C.warn}60`, borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:C.warn }}>
              ⚠️ No categories available. Go to the <strong>Categories</strong> tab to create one first.
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <FLabel>ITEM NAME *</FLabel>
              <input value={f.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Cappuccino" style={Inp}/>
            </div>
            <div>
              <FLabel>CATEGORY</FLabel>
              <select value={f.cat} onChange={e=>set("cat",e.target.value)} style={Sel}>
                {cats.filter(c=>c.id!=="all").length === 0 ? (
                  <option value="">No categories - create one first</option>
                ) : (
                  cats.filter(c=>c.id!=="all").map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)
                )}
              </select>
            </div>
            <div>
              <FLabel>SELLING PRICE *</FLabel>
              <input type="number" min="0" step="0.01" value={f.price} onChange={e=>set("price",e.target.value)} placeholder="0.00" style={{...Inp, fontFamily:"'JetBrains Mono',monospace", fontSize:15}}/>
            </div>
            <div>
              <FLabel>COST PRICE (manual override)</FLabel>
              <input type="number" min="0" step="0.01" value={f.costPrice} onChange={e=>set("costPrice",e.target.value)} placeholder="0.00 (or use Recipe)" style={{...Inp, fontFamily:"'JetBrains Mono',monospace"}}/>
            </div>
          </div>

          {/* Profit strip */}
          {price > 0 && effCost > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, margin:"12px 0", padding:"10px 14px", background:C.bg, borderRadius:10 }}>
              {[
                { l:"Selling Price",  v:CUR(price,sym),    c:C.acc },
                { l:"Est. Cost",      v:CUR(effCost,sym),  c:C.muted },
                { l:"Profit Margin",  v:PCT(margin),       c:margin>=60?C.success:margin>=30?C.warn:C.danger },
              ].map(m => (
                <div key={m.l} style={{ textAlign:"center" }}>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:16, color:m.c }}>{m.v}</div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{m.l}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom:12 }}>
            <FLabel>DESCRIPTION</FLabel>
            <input value={f.description} onChange={e=>set("description",e.target.value)} placeholder="Optional item description…" style={Inp}/>
          </div>

          {/* Emoji + Color picker */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <FLabel>EMOJI ICON</FLabel>
              <div style={{ position:"relative" }}>
                <button className="mm-btn" onClick={() => setShowEmoji(!showEmoji)}
                  style={{ ...Inp, textAlign:"left", display:"flex", alignItems:"center", gap:10, cursor:"pointer", border:`1px solid ${C.bdr}` }}>
                  <span style={{ fontSize:24, background:f.bg, padding:"4px 8px", borderRadius:8 }}>{f.em}</span>
                  <span style={{ color:C.muted, fontSize:12 }}>Click to choose emoji</span>
                </button>
                {showEmoji && (
                  <div style={{ position:"absolute", zIndex:100, top:"110%", left:0, background:"#0d1525", border:`1px solid ${C.bdr}`, borderRadius:12, padding:10, display:"flex", flexWrap:"wrap", gap:4, width:280, maxHeight:180, overflowY:"auto", boxShadow:"0 10px 30px rgba(0,0,0,0.5)" }}>
                    {EMOJI_LIST.map(e => (
                      <button key={e} className="mm-btn" onClick={() => { set("em",e); setShowEmoji(false); }}
                        style={{ background:f.em===e?C.acc+"22":"transparent", border:`1px solid ${f.em===e?C.acc:C.bdr}`, borderRadius:7, padding:"4px 8px", cursor:"pointer", fontSize:20 }}>
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <FLabel>TILE COLOR</FLabel>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5, padding:"6px 10px", background:C.card, borderRadius:8, border:`1px solid ${C.bdr}` }}>
                {BG_PALETTE.map(bg => (
                  <button key={bg} className="mm-btn" onClick={() => set("bg",bg)}
                    style={{ width:22, height:22, borderRadius:5, background:bg, border:f.bg===bg?`2px solid ${C.acc}`:`1px solid transparent`, cursor:"pointer", padding:0 }}/>
                ))}
              </div>
            </div>
          </div>

          {/* ── PHOTO UPLOAD ── */}
          <PhotoUpload photo={f.photo} onChange={v => set("photo", v)}/>

          {/* Toggles */}
          <div style={{ display:"flex", gap:20, marginBottom:8 }}>
            {[
              { label:"Active on POS",   key:"active",     onColor:C.success },
              { label:"Favorite",        key:"favorite",   onColor:C.warn    },
              { label:"Out of Stock",    key:"outOfStock", onColor:C.danger, inverted:true },
            ].map(tog => (
              <div key={tog.key} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Toggle on={tog.inverted ? !f[tog.key] : f[tog.key]} onChange={() => set(tog.key, !f[tog.key])} onColor={tog.onColor}/>
                <span style={{ fontSize:12, color:C.sub }}>{tog.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODIFIERS TAB ── */}
      {activeTab === "modifiers" && (
        <div>
          <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
            Select modifier groups that apply to this item. Customers will choose options when ordering.
          </div>
          {modGroups.length === 0 ? (
            <div style={{ textAlign:"center", padding:30, color:C.muted }}>
              No modifier groups yet. Go to the Modifiers tab to create some.
            </div>
          ) : (
            modGroups.map(mg => {
              const on = f.modifierGroups.includes(mg.id);
              return (
                <div key={mg.id} onClick={() => toggleMod(mg.id)}
                  style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 14px", marginBottom:8, background:on?C.acc+"14":C.bg, border:`1px solid ${on?C.acc+"60":C.bdr}`, borderRadius:10, cursor:"pointer", transition:"all 0.14s" }}>
                  <Toggle on={on} onChange={() => toggleMod(mg.id)} onColor={C.acc}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, color:on?C.acc:C.text, fontSize:13, marginBottom:4 }}>{mg.name}</div>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:5 }}>
                      {mg.required?"Required":"Optional"} · {mg.multiSelect?"Multi-select":"Pick one"}
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                      {safeArr(mg.options).map(opt => (
                        <span key={opt.id} style={{ background:C.card, borderRadius:5, padding:"2px 8px", fontSize:10, color:C.sub }}>
                          {opt.label}
                          {safeNum(opt.priceAdj) !== 0 && <span style={{ color:C.acc, marginLeft:3 }}>{safeNum(opt.priceAdj)>0?"+":""}{CUR(opt.priceAdj,sym)}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── RECIPE TAB ── */}
      {activeTab === "recipe" && (
        <div>
          {!item?.id ? (
            <div style={{ textAlign:"center", padding:30, color:C.muted, fontSize:12 }}>
              Save the item first, then come back to assign ingredients.
            </div>
          ) : (
            <>
              <div style={{ padding:"10px 14px", background:C.bg, borderRadius:10, marginBottom:14 }}>
                <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Estimated ingredient cost from recipe</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:20, color:recipeCost>0?C.success:C.muted }}>
                  {recipeCost > 0 ? CUR(recipeCost, sym) : "No recipe linked"}
                </div>
                {recipeCost > 0 && price > 0 && (
                  <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
                    Gross profit: <span style={{ color:C.acc, fontWeight:700 }}>{CUR(price-recipeCost, sym)}</span>
                    {" "}· Margin: <span style={{ color:margin>=50?C.success:C.warn, fontWeight:700 }}>{PCT(margin)}</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
                To manage ingredients, go to <strong style={{color:C.acc}}>Inventory → Recipes</strong> and select this item.
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ display:"flex", gap:8, marginTop:16, borderTop:`1px solid ${C.bdr}`, paddingTop:14 }}>
        <button className="mm-btn" onClick={() => {
          if(!f.name.trim()){alert("Item name is required");return;}
          if(!f.price && f.price!==0){alert("Selling price is required");return;}
          if(+f.price <= 0){alert("Selling price must be greater than 0");return;}
          if(f.costPrice !== "" && +f.costPrice < 0){alert("Cost price cannot be negative");return;}
          onSave(f);
        }} style={{...Btn(C.acc),flex:1}}>
          {item ? "💾 Update Item" : "✅ Create Item"}
        </button>
        <button className="mm-btn" onClick={onClose} style={{...Ghost(),flex:1}}>Cancel</button>
      </div>
    </MModal>
  );
}

/* ── CATEGORY FORM MODAL ─────────────────────────────*/
function CategoryFormModal({ cat, onSave, onClose }) {
  const [name,      setName]      = useState(cat?.name || "");
  const [icon,      setIcon]      = useState(cat?.icon || "📂");
  const [sortOrder, setSortOrder] = useState(cat?.sortOrder ?? 99);
  const [showEmoji, setShowEmoji] = useState(false);

  return (
    <MModal title={cat ? "Edit Category" : "New Category"} onClose={onClose}>
      <div style={{ marginBottom:12 }}>
        <FLabel>CATEGORY NAME *</FLabel>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Hot Drinks" style={Inp}/>
      </div>
      <div style={{ marginBottom:12 }}>
        <FLabel>ICON</FLabel>
        <div style={{ position:"relative" }}>
          <button className="mm-btn" onClick={() => setShowEmoji(!showEmoji)}
            style={{ ...Inp, textAlign:"left", display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
            <span style={{ fontSize:22 }}>{icon}</span>
            <span style={{ color:C.muted, fontSize:12 }}>Click to choose icon</span>
          </button>
          {showEmoji && (
            <div style={{ position:"absolute", zIndex:100, top:"110%", left:0, background:"#0d1525", border:`1px solid ${C.bdr}`, borderRadius:12, padding:10, display:"flex", flexWrap:"wrap", gap:4, maxHeight:150, overflowY:"auto", boxShadow:"0 10px 30px rgba(0,0,0,0.5)" }}>
              {CAT_ICONS.map(e => (
                <button key={e} className="mm-btn" onClick={() => { setIcon(e); setShowEmoji(false); }}
                  style={{ background:icon===e?C.acc+"22":"transparent", border:`1px solid ${icon===e?C.acc:C.bdr}`, borderRadius:7, padding:"4px 8px", cursor:"pointer", fontSize:22 }}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ marginBottom:16 }}>
        <FLabel>SORT ORDER</FLabel>
        <input type="number" value={sortOrder} onChange={e=>setSortOrder(+e.target.value)} style={Inp}/>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button className="mm-btn" onClick={() => { if(!name.trim()){alert("Name required");return;} onSave({name,icon,sortOrder}); }} style={{...Btn(C.acc),flex:1}}>Save</button>
        <button className="mm-btn" onClick={onClose} style={{...Ghost(),flex:1}}>Cancel</button>
      </div>
    </MModal>
  );
}

/* ── MODIFIER GROUP MODAL ────────────────────────────*/
function ModifierGroupModal({ group, sym, onSave, onClose }) {
  const [name,        setName]        = useState(group?.name || "");
  const [required,    setRequired]    = useState(!!group?.required);
  const [multiSelect, setMultiSelect] = useState(!!group?.multiSelect);
  const [options,     setOptions]     = useState(safeArr(group?.options).map(o=>({...o})) || []);

  const addOpt    = () => setOptions(p => [...p, { id:`opt_${Date.now()}`, label:"", priceAdj:0 }]);
  const removeOpt = (i) => setOptions(p => p.filter((_,idx) => idx!==i));
  const updateOpt = (i, field, val) => setOptions(p => p.map((o,idx) => idx===i ? {...o,[field]:val} : o));

  return (
    <MModal title={group ? "Edit Modifier Group" : "New Modifier Group"} onClose={onClose} wide>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
        <div>
          <FLabel>GROUP NAME *</FLabel>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Size" style={Inp}/>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end", paddingBottom:1 }}>
          <div style={{ flex:1 }}>
            <FLabel>SELECTION TYPE</FLabel>
            <select value={multiSelect?"multi":"single"} onChange={e=>setMultiSelect(e.target.value==="multi")} style={Sel}>
              <option value="single">Pick one</option>
              <option value="multi">Multi-select</option>
            </select>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
            <Toggle on={required} onChange={() => setRequired(!required)} onColor={C.warn}/>
            <span style={{ fontSize:12, color:C.sub }}>Required</span>
          </div>
        </div>
      </div>

      {/* Options list */}
      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <FLabel>OPTIONS</FLabel>
          <button className="mm-btn" onClick={addOpt} style={Btn(C.acc,undefined,true)}>+ Add Option</button>
        </div>
        {options.length === 0
          ? <div style={{ textAlign:"center", padding:20, color:C.muted, fontSize:12 }}>Click "+ Add Option" to add choices.</div>
          : (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 100px 24px", gap:8, marginBottom:6 }}>
                <span style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:"0.08em" }}>OPTION LABEL</span>
                <span style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:"0.08em" }}>PRICE ADJ. ({sym})</span>
                <span/>
              </div>
              {options.map((opt, i) => (
                <div key={opt.id||i} style={{ display:"grid", gridTemplateColumns:"1fr 100px 24px", gap:8, marginBottom:8, alignItems:"center" }}>
                  <input value={opt.label} onChange={e=>updateOpt(i,"label",e.target.value)} placeholder="e.g. Large" style={Inp}/>
                  <input type="number" step="0.01" value={opt.priceAdj} onChange={e=>updateOpt(i,"priceAdj",+e.target.value)}
                    style={{...Inp, textAlign:"right", fontFamily:"'JetBrains Mono',monospace"}} placeholder="+0.00"/>
                  <button onClick={()=>removeOpt(i)} style={{ background:"transparent", border:"none", color:C.danger, cursor:"pointer", fontSize:18, padding:0 }}>✕</button>
                </div>
              ))}
            </>
          )
        }
      </div>

      <div style={{ display:"flex", gap:8 }}>
        <button className="mm-btn"
          onClick={() => { if(!name.trim()){alert("Name required");return;} onSave({name,required,multiSelect,options}); }}
          style={{...Btn(C.acc),flex:1}}>Save Group</button>
        <button className="mm-btn" onClick={onClose} style={{...Ghost(),flex:1}}>Cancel</button>
      </div>
    </MModal>
  );
}

/* ── SHARED COMPONENTS ───────────────────────────────*/
/* ── PHOTO UPLOAD ────────────────────────────────────
   Compresses/resizes to 300×300 before storing as base64.
   Falls back to emoji if no photo uploaded.
─────────────────────────────────────────────────────*/
function PhotoUpload({ photo, onChange }) {
  const fileRef = useRef();

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) {
      alert("Only JPG, PNG, or WebP images are supported."); return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Compress & resize to 300×300 max
        const SIZE = 300;
        const canvas = document.createElement("canvas");
        const ratio  = Math.min(SIZE / img.width, SIZE / img.height, 1);
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataURL = canvas.toDataURL("image/jpeg", 0.82); // ~82% quality
        onChange(dataURL);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <FLabel>ITEM PHOTO <span style={{ color:C.muted, fontWeight:400, fontSize:9 }}>(JPG/PNG/WEBP · resized to 300×300 · emoji used as fallback)</span></FLabel>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {/* Preview */}
        <div style={{ width:72, height:72, borderRadius:10, background:C.card,
                      border:`1.5px dashed ${photo ? C.acc+"60" : C.bdr}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      overflow:"hidden", flexShrink:0 }}>
          {photo
            ? <img src={photo} alt="Item" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
            : <span style={{ fontSize:28, opacity:0.3 }}>🖼</span>
          }
        </div>
        {/* Buttons */}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <button className="mm-btn"
            onClick={() => fileRef.current?.click()}
            style={{ background:C.info+"18", border:`1px solid ${C.info}50`, color:C.info,
                     borderRadius:8, padding:"6px 14px", cursor:"pointer",
                     fontSize:11, fontWeight:700, fontFamily:"inherit" }}>
            📁 {photo ? "Change Photo" : "Upload Photo"}
          </button>
          {photo && (
            <button className="mm-btn"
              onClick={() => onChange("")}
              style={{ background:"transparent", border:`1px solid ${C.danger}40`, color:C.danger,
                       borderRadius:8, padding:"5px 14px", cursor:"pointer",
                       fontSize:11, fontWeight:600, fontFamily:"inherit" }}>
              ✕ Remove Photo
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            onChange={handleFile} style={{ display:"none" }}/>
        </div>
        {photo && (
          <div style={{ fontSize:10, color:C.muted, flex:1 }}>
            Photo stored in IndexedDB · shown on POS tiles and cart
          </div>
        )}
      </div>
    </div>
  );
}

function MModal({ title, onClose, children, wide }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9000, padding:16 }}>
      <div style={{ background:"#0d1525", border:`1px solid ${C.bdr}`, borderRadius:16, padding:"22px 20px", width:wide?680:440, maxWidth:"96vw", maxHeight:"92vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <span style={{ fontWeight:800, fontSize:15, color:C.text }}>{title}</span>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:C.muted, cursor:"pointer", fontSize:20, padding:0, lineHeight:1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toggle({ on, onChange, onColor=C.success, offColor="#2a3a50", offLabel="" }) {
  return (
    <div className="mm-toggle" onClick={e => { e.stopPropagation(); onChange(); }}
      style={{ width:36, height:20, borderRadius:10, background:on?onColor:offColor, position:"relative", flexShrink:0, transition:"background 0.18s" }}>
      <div style={{ position:"absolute", top:2, left:on?18:2, width:16, height:16, borderRadius:8, background:"#fff", transition:"left 0.18s", boxShadow:"0 1px 3px rgba(0,0,0,0.3)" }}/>
    </div>
  );
}

function FLabel({ children }) {
  return <div style={{ fontSize:10, color:C.muted, fontWeight:700, letterSpacing:"0.08em", marginBottom:5 }}>{children}</div>;
}

function EmptyMsg({ icon, msg }) {
  return (
    <div style={{ textAlign:"center", padding:"40px 20px", color:C.muted }}>
      <div style={{ fontSize:48, marginBottom:10, opacity:0.2 }}>{icon}</div>
      <div style={{ fontSize:13 }}>{msg}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:60 }}>
      <div style={{ width:28, height:28, border:`2px solid ${C.bdr}`, borderTopColor:C.acc, borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
    </div>
  );
}
