/**
 * KAVO-SYS · User Management Page
 * Create, edit, deactivate staff accounts — owner/admin only.
 */
import { useState, useEffect, useCallback } from "react";
import { useAuth, ROLE_META, PERMISSIONS } from "../auth/AuthProvider";
import { useLang } from "../i18n/LanguageContext.jsx";
import { db, safeDB } from "../db/db.js";
import { DEFAULT_USERS } from "../auth/authConstants.js";

// ── Design tokens ──────────────────────────────────────────────────────
const C = {
  bg: "#070c16", surf: "#0b1220", card: "#101828", bdr: "#1a2438",
  text: "#e6edf3", muted: "#7d8fa0", sub: "#9198a1",
  acc: "#f0a500", success: "#3fb950", danger: "#f85149",
  info: "#58a6ff", warn: "#d29922",
};
const fam = "system-ui,-apple-system,sans-serif";

const ROLES = ["owner","manager","cashier","kitchen"];

function btnStyle(bg, col="#000") {
  return { background:bg, color:col, border:"none", borderRadius:9,
           padding:"8px 16px", fontWeight:700, fontSize:12,
           cursor:"pointer", fontFamily:fam };
}
function ghostStyle(danger) {
  return { background:"transparent",
           border:`1px solid ${danger ? C.danger+"50" : C.bdr}`,
           color: danger ? C.danger : C.muted,
           borderRadius:8, padding:"6px 12px", fontWeight:600,
           fontSize:12, cursor:"pointer", fontFamily:fam };
}
function inp() {
  return { width:"100%", background:C.bg, border:`1px solid ${C.bdr}`,
           borderRadius:8, padding:"8px 10px", color:C.text, fontSize:13,
           fontFamily:fam, outline:"none", boxSizing:"border-box" };
}
function FLabel({ children }) {
  return <div style={{ fontSize:10, color:C.muted, fontWeight:700,
                       letterSpacing:"0.07em", marginBottom:5 }}>{children}</div>;
}

// ── Password strength helper ───────────────────────────────────────────
function pwStrength(pw) {
  if (!pw) return { level:0, label:"", col:C.muted };
  if (pw.length < 4) return { level:1, label:"Too short", col:C.danger };
  if (pw.length < 7) return { level:2, label:"Weak",      col:C.warn };
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) return { level:4, label:"Strong", col:C.success };
  return { level:3, label:"Good", col:C.info };
}

// ── User Form Modal ────────────────────────────────────────────────────
function UserModal({ user, onSave, onClose, currentUserId }) {
  const isEdit = !!user?.id;
  const [f, setF] = useState({
    username:    user?.username || "",
    name:        user?.name     || "",
    role:        user?.role     || "cashier",
    password:    "",
    confirmPw:   "",
    active:      user?.active   !== false,
    notes:       user?.notes    || "",
  });
  const [saving, setSaving]     = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const set = useCallback((k,v) => setF(p => ({...p,[k]:v})), []);

  const pw = pwStrength(f.password);

  async function save() {
    if (!f.username.trim()) { alert("Username is required"); return; }
    if (!f.name.trim())     { alert("Display name is required"); return; }
    if (!isEdit && !f.password) { alert("Password is required for new users"); return; }
    if (f.password && f.password !== f.confirmPw) { alert("Passwords do not match"); return; }
    if (f.password && f.password.length < 4) { alert("Password must be at least 4 characters"); return; }
    setSaving(true);
    try { await onSave(f); }
    finally { setSaving(false); }
  }

  const roleInfo = ROLE_META[f.role] || ROLE_META.cashier;
  const perms    = PERMISSIONS[f.role] || {};

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", display:"flex",
                  alignItems:"center", justifyContent:"center", zIndex:2000, padding:16 }}>
      <div style={{ background:C.surf, border:`1px solid ${C.bdr}`, borderRadius:14,
                    width:500, maxWidth:"97vw", maxHeight:"92vh",
                    overflowY:"auto", padding:24 }}>
        <div style={{ fontWeight:800, color:C.text, fontSize:15, marginBottom:18 }}>
          {isEdit ? "✏ Edit User" : "👤 New User Account"}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
          <div>
            <FLabel>USERNAME *</FLabel>
            <input value={f.username} onChange={e=>set("username",e.target.value.toLowerCase().replace(/\s/g,""))}
              placeholder="e.g. sara" autoFocus style={inp()}/>
          </div>
          <div>
            <FLabel>DISPLAY NAME *</FLabel>
            <input value={f.name} onChange={e=>set("name",e.target.value)}
              placeholder="e.g. Sara Ahmad" style={inp()}/>
          </div>
          <div>
            <FLabel>ROLE *</FLabel>
            <select value={f.role} onChange={e=>set("role",e.target.value)}
              style={{...inp(), cursor:"pointer"}}>
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {ROLE_META[r]?.icon} {ROLE_META[r]?.label || r}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, paddingTop:18 }}>
            <input type="checkbox" id="user-active" checked={f.active}
              onChange={e=>set("active",e.target.checked)}/>
            <label htmlFor="user-active" style={{ fontSize:12, color:C.muted, cursor:"pointer" }}>
              Active (can log in)
            </label>
          </div>
          {/* Password fields */}
          <div>
            <FLabel>{isEdit ? "NEW PASSWORD (leave blank to keep)" : "PASSWORD *"}</FLabel>
            <div style={{ position:"relative" }}>
              <input type={showPw?"text":"password"} value={f.password}
                onChange={e=>set("password",e.target.value)}
                placeholder={isEdit ? "Leave blank to keep current" : "Min 4 characters"}
                style={{...inp(), paddingRight:36}}/>
              <button type="button" onClick={()=>setShowPw(!showPw)}
                style={{ position:"absolute", right:8, top:8, background:"none",
                         border:"none", color:C.muted, cursor:"pointer", fontSize:12 }}>
                {showPw?"🙈":"👁"}
              </button>
            </div>
            {f.password && (
              <div style={{ marginTop:4 }}>
                <div style={{ height:4, borderRadius:2, background:C.bdr, overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:2,
                                background:pw.col, width:(pw.level*25)+"%",
                                transition:"width .3s" }}/>
                </div>
                <div style={{ fontSize:10, color:pw.col, marginTop:2 }}>{pw.label}</div>
              </div>
            )}
          </div>
          <div>
            <FLabel>CONFIRM PASSWORD</FLabel>
            <input type={showPw?"text":"password"} value={f.confirmPw}
              onChange={e=>set("confirmPw",e.target.value)}
              placeholder="Re-enter password"
              style={{...inp(), border:`1px solid ${f.confirmPw && f.password!==f.confirmPw ? C.danger+"60" : C.bdr}`}}/>
          </div>
          <div style={{ gridColumn:"span 2" }}>
            <FLabel>NOTES (optional)</FLabel>
            <input value={f.notes} onChange={e=>set("notes",e.target.value)}
              placeholder="e.g. Weekend shift, part-time…" style={inp()}/>
          </div>
        </div>

        {/* Role permissions preview */}
        <div style={{ background:C.bg, borderRadius:10, padding:"10px 12px", marginBottom:14,
                      border:`1px solid ${roleInfo.color}20` }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
            <span style={{ fontSize:14 }}>{roleInfo.icon}</span>
            <span style={{ fontWeight:700, color:roleInfo.color, fontSize:12 }}>
              {ROLE_META[f.role]?.label} Permissions
            </span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:4 }}>
            {[
              ["POS Access",        "canAccessPOS"],
              ["Kitchen Access",    "canAccessKitchen"],
              ["Reports",           "canAccessReports"],
              ["Inventory",         "canAccessInventory"],
              ["Menu Management",   "canManageMenu"],
              ["Payroll",           "canAccessPayroll"],
              ["Purchasing",        "canManagePurchasing"],
              ["Settings",          "canAccessSettings"],
              ["Backup/Restore",    "canBackupRestore"],
              ["Void Orders",       "canVoidOrders"],
              ["Apply Discount",    "canApplyDiscount"],
              ["Delete Data",       "canDeleteData"],
              ["Manage Users",      "canManageUsers"],
            ].map(([label, key]) => (
              <div key={key} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
                <span style={{ color: perms[key] ? C.success : C.danger, fontWeight:700 }}>
                  {perms[key] ? "✓" : "✕"}
                </span>
                <span style={{ color: perms[key] ? C.muted : C.card===C.bdr ? "#2a3a50" : "#2a3a50" }}
                      style={{ color: perms[key] ? C.sub : "#3a4a5a" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

<div style={{ display:"flex", gap:8 }}>
  <button
    onClick={save}
    disabled={saving}
    style={{ ...btnStyle(C.acc,"#000"), flex:2 }}
  >
    {saving ? "Saving..." : (isEdit ? "💾 Save Changes" : "👤 Create User")}
  </button>
</div>
      </div>
    </div>
  );
}


// ── Main UserManagement Page ───────────────────────────────────────────
export default function UserManagement({ onBack }) {
  const { user: currentUser, can } = useAuth();
  const { t } = useLang();

  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null);  // null | {} | user
  const [delId,    setDelId]    = useState(null);
  const [toast,    setToast]    = useState(null);
  const [search,   setSearch]   = useState("");

  const showToast = (msg, type="ok") => {
    setToast({msg,type}); setTimeout(()=>setToast(null), 2800);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await safeDB(() => db.users.toArray(), []);
      setUsers(rows.sort((a,b) => {
        const roleOrder = {owner:0,admin:0,manager:1,cashier:2,kitchen:3};
        return (roleOrder[a.role]??4) - (roleOrder[b.role]??4) || a.name.localeCompare(b.name);
      }));
    } catch { showToast("Failed to load users","err"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveUser(form) {
    const editUser = modal?.id ? modal : null;
    try {
      // Check username uniqueness
      const all = await safeDB(() => db.users.toArray(), []);
      const dup = all.find(u => u.username === form.username && u.id !== editUser?.id);
      if (dup) { showToast("Username already exists","err"); return; }

      const record = {
        id:       editUser?.id || "u_" + Date.now() + "_" + Math.random().toString(36).slice(2,5),
        username: form.username.trim().toLowerCase(),
        name:     form.name.trim(),
        role:     form.role,
        active:   form.active !== false,
        notes:    form.notes || "",
        updatedAt: new Date().toISOString(),
        createdAt: editUser?.createdAt || new Date().toISOString(),
      };
      // Only update password if provided
      if (form.password) record.password = form.password;
      else if (editUser?.password) record.password = editUser.password;
      else record.password = "changeme";

      await safeDB(() => db.users.put(record));
      // Also update localStorage fallback
      const updated = await safeDB(() => db.users.toArray(), []);
      try { localStorage.setItem("kavo_users", JSON.stringify(updated)); } catch {}

      setModal(null);
      showToast(editUser ? "User updated" : "User created");
      load();
    } catch(e) {
      showToast("Save failed: " + e.message, "err");
    }
  }

  async function toggleActive(u) {
    if (u.id === currentUser?.id) {
      showToast("You cannot deactivate yourself","err"); return;
    }
    await safeDB(() => db.users.update(u.id, { active: !u.active }));
    showToast(u.active ? "User deactivated" : "User activated", u.active ? "warn" : "ok");
    load();
  }

  async function deleteUser(id) {
    if (id === currentUser?.id) {
      showToast("You cannot delete yourself","err"); setDelId(null); return;
    }
    await safeDB(() => db.users.delete(id));
    setDelId(null);
    showToast("User deleted","warn");
    load();
  }

  async function resetToDefaults() {
    if (!window.confirm("Reset to default users? This will overwrite all custom user accounts.")) return;
    await safeDB(() => db.users.bulkPut(DEFAULT_USERS));
    try { localStorage.setItem("kavo_users", JSON.stringify(DEFAULT_USERS)); } catch {}
    showToast("Users reset to defaults","warn");
    load();
  }

  const filtered = users.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  const byRole = ROLES.reduce((acc, r) => {
    acc[r] = filtered.filter(u => u.role === r || (r==="owner" && u.role==="admin"));
    return acc;
  }, {});

  return (
    <div style={{ height:"100vh", background:C.bg, color:C.text, fontFamily:fam,
                  display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* Header */}
      <header style={{ background:C.surf, borderBottom:`1px solid ${C.bdr}`,
                       padding:"0 16px", height:52, flexShrink:0,
                       display:"flex", alignItems:"center", gap:10, justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={onBack}
            style={{ background:"transparent", border:"none", color:C.muted,
                     fontSize:18, cursor:"pointer", padding:"0 4px" }}>←</button>
          <span style={{ fontWeight:800, color:C.acc, fontSize:16 }}>👥 User Management</span>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search users…"
            style={{...inp(), width:180, padding:"5px 10px", fontSize:12}}/>
          <button onClick={() => setModal({})}
            style={btnStyle(C.acc,"#000")}>
            + New User
          </button>
          <button onClick={resetToDefaults}
            style={ghostStyle()}
            title="Reset to factory default users">
            ↺ Defaults
          </button>
        </div>
      </header>

      {/* Stats bar */}
      <div style={{ background:C.surf, borderBottom:`1px solid ${C.bdr}`,
                    padding:"6px 16px", display:"flex", gap:16, flexShrink:0 }}>
        {[
          ["Total Users",    users.length,                    C.text],
          ["Active",         users.filter(u=>u.active!==false).length, C.success],
          ["Inactive",       users.filter(u=>u.active===false).length, C.muted],
          ["Owners",         users.filter(u=>u.role==="owner"||u.role==="admin").length, C.acc],
          ["Managers",       users.filter(u=>u.role==="manager").length, "#a78bfa"],
          ["Cashiers",       users.filter(u=>u.role==="cashier").length, C.info],
          ["Kitchen",        users.filter(u=>u.role==="kitchen").length, C.success],
        ].map(([label, count, col]) => (
          <div key={label} style={{ textAlign:"center", minWidth:60 }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800,
                          fontSize:14, color:col }}>{count}</div>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.05em" }}>{label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:"auto", padding:16, paddingBottom:80 }}>
        {loading ? (
          <div style={{ textAlign:"center", color:C.muted, padding:"40px 0" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center", color:C.muted, padding:"60px 0" }}>
            <div style={{ fontSize:36, marginBottom:8 }}>👤</div>
            {search ? "No users match your search." : "No users found."}
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {ROLES.filter(r => (byRole[r]?.length || 0) > 0).map(role => (
              <div key={role}>
                {/* Role group header */}
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:16 }}>{ROLE_META[role]?.icon}</span>
                  <span style={{ fontWeight:800, color:ROLE_META[role]?.color,
                                 fontSize:13, letterSpacing:"0.04em" }}>
                    {ROLE_META[role]?.label}s
                  </span>
                  <span style={{ fontSize:11, color:C.muted }}>
                    ({byRole[role].length})
                  </span>
                  <div style={{ flex:1, height:1, background:C.bdr }}/>
                </div>

                {/* User cards */}
                <div style={{ display:"grid",
                              gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",
                              gap:8 }}>
                  {byRole[role].map(u => {
                    const rm = ROLE_META[u.role] || ROLE_META.cashier;
                    const isMe = u.id === currentUser?.id;
                    const inactive = u.active === false;
                    return (
                      <div key={u.id}
                        style={{ background:C.card, border:`1px solid ${inactive ? C.bdr : rm.color+"25"}`,
                                 borderRadius:12, padding:"12px 14px",
                                 opacity: inactive ? 0.6 : 1 }}>
                        <div style={{ display:"flex", justifyContent:"space-between",
                                      alignItems:"flex-start", marginBottom:8 }}>
                          {/* Left: avatar + name */}
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <div style={{ width:38, height:38, borderRadius:"50%",
                                          background:rm.bg, border:`1.5px solid ${rm.color}40`,
                                          display:"flex", alignItems:"center",
                                          justifyContent:"center", fontSize:18, flexShrink:0 }}>
                              {rm.icon}
                            </div>
                            <div>
                              <div style={{ fontWeight:700, color:C.text, fontSize:13 }}>
                                {u.name} {isMe && <span style={{ fontSize:10, color:C.acc }}>← You</span>}
                              </div>
                              <div style={{ fontFamily:"'JetBrains Mono',monospace",
                                            fontSize:11, color:C.muted }}>
                                @{u.username}
                              </div>
                            </div>
                          </div>
                          {/* Right: status badge */}
                          <div style={{ display:"flex", flexDirection:"column",
                                        alignItems:"flex-end", gap:4 }}>
                            <span style={{ background:rm.bg, border:`1px solid ${rm.color}40`,
                                           color:rm.color, borderRadius:10,
                                           padding:"2px 8px", fontSize:9, fontWeight:700 }}>
                              {rm.label.toUpperCase()}
                            </span>
                            <span style={{ background: inactive ? "#1a1a1a" : C.success+"18",
                                           color: inactive ? C.muted : C.success,
                                           border: `1px solid ${inactive ? C.bdr : C.success+"40"}`,
                                           borderRadius:10, padding:"2px 8px",
                                           fontSize:9, fontWeight:700 }}>
                              {inactive ? "○ INACTIVE" : "✓ ACTIVE"}
                            </span>
                          </div>
                        </div>

                        {/* Notes */}
                        {u.notes && (
                          <div style={{ fontSize:11, color:C.muted, marginBottom:8,
                                        fontStyle:"italic" }}>
                            {u.notes}
                          </div>
                        )}

                        {/* Permission pills (compact) */}
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:10 }}>
                          {[
                            ["POS",       "canAccessPOS"],
                            ["Kitchen",   "canAccessKitchen"],
                            ["Reports",   "canAccessReports"],
                            ["Inventory", "canAccessInventory"],
                            ["Payroll",   "canAccessPayroll"],
                            ["Settings",  "canAccessSettings"],
                          ].map(([label, key]) => {
                            const granted = PERMISSIONS[u.role]?.[key];
                            return (
                              <span key={key} style={{
                                background: granted ? C.success+"15" : "transparent",
                                border: `1px solid ${granted ? C.success+"40" : C.bdr}`,
                                color: granted ? C.success : "#2a3a50",
                                borderRadius:4, padding:"1px 6px", fontSize:9, fontWeight:600,
                              }}>
                                {granted?"✓":"✕"} {label}
                              </span>
                            );
                          })}
                        </div>

                        {/* Actions */}
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          <button onClick={() => setModal(u)}
                            style={{...ghostStyle(), fontSize:11, padding:"4px 10px", flex:1}}>
                            ✏ Edit
                          </button>
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={isMe}
                            style={{...ghostStyle(inactive?false:true),
                                    fontSize:11, padding:"4px 10px",
                                    opacity: isMe ? 0.4 : 1, flex:1 }}>
                            {inactive ? "✓ Activate" : "○ Deactivate"}
                          </button>
                          <button
                            onClick={() => setDelId(u.id)}
                            disabled={isMe}
                            style={{...ghostStyle(true), fontSize:11, padding:"4px 8px",
                                    opacity: isMe ? 0.3 : 1}}>
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User form modal */}
      {modal !== null && (
        <UserModal
          user={modal?.id ? modal : null}
          onSave={saveUser}
          onClose={() => setModal(null)}
          currentUserId={currentUser?.id}/>
      )}

      {/* Delete confirm */}
      {delId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)",
                      display:"flex", alignItems:"center", justifyContent:"center", zIndex:3000 }}>
          <div style={{ background:C.surf, border:`1px solid ${C.bdr}`, borderRadius:12,
                        padding:22, maxWidth:320, width:"96vw", textAlign:"center" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🗑</div>
            <div style={{ fontWeight:700, color:C.text, marginBottom:6 }}>Delete this user?</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>
              They will no longer be able to log in. This cannot be undone.
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>deleteUser(delId)}
                style={{...btnStyle(C.danger,"#fff"), flex:1}}>Delete</button>
              <button onClick={()=>setDelId(null)}
                style={{...ghostStyle(), flex:1}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)",
                      background: toast.type==="err"?"#1f0a0a":toast.type==="warn"?"#1a1200":"#0d2010",
                      border:`1px solid ${toast.type==="err"?C.danger+"40":toast.type==="warn"?C.warn+"40":C.success+"40"}`,
                      color: toast.type==="err"?C.danger:toast.type==="warn"?C.warn:C.success,
                      borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:700,
                      zIndex:5000, whiteSpace:"nowrap" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
