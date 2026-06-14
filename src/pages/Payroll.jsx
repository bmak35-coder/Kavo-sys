/**
 * KAVO-SYS · Payroll Page
 * Staff salary & advance management — admin/manager only
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useLang } from "../i18n/LanguageContext.jsx";
import { useFirebaseServices } from "../firebase/FirebaseServicesProvider.jsx";
import { useTenant } from "../contexts/TenantProvider.jsx";
import {
  EmployeeService, AdvanceService, PayrollService,
  yearMonth, monthLabel,
} from "../db/services/payroll.js";
import { isValidPhone, isNonNeg, MSG } from "../utils/validate.js";

// ── Colours (matches KAVO-SYS dark theme) ─────────────────────────────
const C = {
  bg: "#070c16", surf: "#0b1220", card: "#101828", bdr: "#1a2438",
  text: "#e6edf3", muted: "#7d8fa0", sub: "#9198a1",
  acc: "#f0a500", success: "#3fb950", danger: "#f85149",
  info: "#58a6ff", warn: "#d29922",
};
const fam = "system-ui,-apple-system,sans-serif";
const roundMoney = (v) => Number(Number(v || 0).toFixed(2));
const safeNum   = (v) => { const n = +v; return isFinite(n) ? n : 0; };
const CUR       = (n, s = "$") => `${s}${safeNum(n).toFixed(2)}`;

function btn(bg, col = "#000") {
  return {
    background: bg, color: col, border: "none", borderRadius: 9,
    padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer",
    fontFamily: fam,
  };
}
function ghostBtn(danger) {
  return {
    background: "transparent",
    border: `1px solid ${danger ? C.danger + "50" : C.bdr}`,
    color: danger ? C.danger : C.muted,
    borderRadius: 8, padding: "6px 12px", fontWeight: 600,
    fontSize: 12, cursor: "pointer", fontFamily: fam,
  };
}
function inputStyle() {
  return {
    width: "100%", background: C.bg, border: `1px solid ${C.bdr}`,
    borderRadius: 8, padding: "8px 10px", color: C.text,
    fontSize: 13, fontFamily: fam, outline: "none", boxSizing: "border-box",
  };
}
function Label({ children }) {
  return (
    <div style={{ fontSize: 10, color: C.muted, fontWeight: 700,
                  letterSpacing: "0.07em", marginBottom: 5 }}>
      {children}
    </div>
  );
}
function Pill({ label, value, col }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${(col || C.bdr) + "40"}`,
                  borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 900,
                    fontSize: 16, color: col || C.acc }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── Month helpers ──────────────────────────────────────────────────────
function currentMonth() { return yearMonth(); }
function prevMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return yearMonth(d);
}
function monthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push(yearMonth(d));
  }
  return opts;
}

// ── Employee Form Modal ────────────────────────────────────────────────
function EmployeeModal({ emp, onSave, onClose }) {
  const { t } = useLang();
  const [f, setF] = useState({
    name:          emp?.name          || "",
    role:          emp?.role          || "Cashier",
    phone:         emp?.phone         || "",
    monthlySalary: emp?.monthlySalary ?? "",
    hireDate:      emp?.hireDate      || new Date().toISOString().slice(0,10),
    status:        emp?.status        || "active",
    notes:         emp?.notes         || "",
  });
  const [errors, setErrors] = useState({});
  const set = useCallback((k, v) => { setF(p => ({ ...p, [k]: v })); setErrors(e => ({...e,[k]:undefined})); }, []);
  const [saving, setSaving] = useState(false);

  function validate() {
    const errs = {};
    if (!f.name.trim())             errs.name          = MSG.required;
    if (!isValidPhone(f.phone))     errs.phone         = MSG.phone;
    if (f.monthlySalary !== "" && !isNonNeg(f.monthlySalary)) errs.monthlySalary = MSG.nonNeg;
    return errs;
  }

  async function save() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try { await onSave({ ...emp, ...f }); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex",
                  alignItems:"center", justifyContent:"center", zIndex:2000, padding:16 }}>
      <div style={{ background:C.surf, border:`1px solid ${C.bdr}`, borderRadius:14,
                    width:420, maxWidth:"96vw", maxHeight:"90vh", overflowY:"auto", padding:22 }}>
        <div style={{ fontWeight:800, color:C.text, fontSize:15, marginBottom:16 }}>
          {emp?.id ? t("editEmployeeTitle") : t("newEmployeeTitle")}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
          <div style={{ gridColumn:"span 2" }}>
            <Label>{t("fullNameField")} *</Label>
            <input value={f.name} onChange={e=>set("name",e.target.value)}
              placeholder="e.g. Sara Ahmad" autoFocus
              style={{...inputStyle(), border:`1px solid ${errors.name ? "#f8514960" : C.bdr}`}}/>
            {errors.name && <div style={{fontSize:10,color:"#f85149",marginTop:3}}>{errors.name}</div>}
          </div>
          <div>
            <Label>{t("roleField")}</Label>
            <select value={f.role} onChange={e=>set("role",e.target.value)}
              style={{...inputStyle()}}>
              {["Owner","Manager","Cashier","Kitchen","Waiter","Chef","Driver","Cleaner","Other"]
                .map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <Label>{t("status")}</Label>
            <select value={f.status} onChange={e=>set("status",e.target.value)}
              style={{...inputStyle()}}>
              <option value="active">{t("activeEmployee")}</option>
              <option value="inactive">{t("inactiveEmployee")}</option>
            </select>
          </div>
          <div>
            <Label>{t("phoneField")}</Label>
            <input value={f.phone} onChange={e=>set("phone",e.target.value)}
              placeholder="+961..." style={{...inputStyle(), border:`1px solid ${errors.phone ? "#f8514960" : C.bdr}`}}/>
            {errors.phone && <div style={{fontSize:10,color:"#f85149",marginTop:3}}>{errors.phone}</div>}
          </div>
          <div>
            <Label>{t("colMonthlySalary")} ($)</Label>
            <input type="number" min="0" step="0.01" value={f.monthlySalary}
              onChange={e=>set("monthlySalary",e.target.value)}
              placeholder="0.00"
              style={{...inputStyle(), fontFamily:"'JetBrains Mono',monospace", border:`1px solid ${errors.monthlySalary ? "#f8514960" : C.bdr}`}}/>
            {errors.monthlySalary && <div style={{fontSize:10,color:"#f85149",marginTop:3}}>{errors.monthlySalary}</div>}
          </div>
          <div>
            <Label>{t("colHireDate")}</Label>
            <input type="date" value={f.hireDate} onChange={e=>set("hireDate",e.target.value)}
              style={inputStyle()}/>
          </div>
          <div>
            <Label>{t("notesOptional")}</Label>
            <input value={f.notes} onChange={e=>set("notes",e.target.value)}
              placeholder="Any notes..." style={inputStyle()}/>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, marginTop:6 }}>
          <button onClick={save} disabled={saving}
            style={{...btn(C.acc,"#000"), flex:2}}>
            {saving ? t("savingLabel") : t("saveEmployeeBtn")}
          </button>
          <button onClick={onClose} style={{...ghostBtn(), flex:1}}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}

// ── Advance Form Modal ─────────────────────────────────────────────────
function AdvanceModal({ employees, preselected, onSave, onClose }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [f, setF] = useState({
    employeeId: preselected?.id || (employees[0]?.id || ""),
    amount:     "",
    date:       new Date().toISOString().slice(0,10),
    note:       "",
  });
  const set = useCallback((k, v) => setF(p => ({ ...p, [k]: v })), []);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!f.employeeId) { alert(t("employeeFieldReq")); return; }
    if (!safeNum(f.amount) || safeNum(f.amount) <= 0) { alert(t("amountFieldReq")); return; }
    setSaving(true);
    try { await onSave({ ...f, createdBy: user?.name || "admin" }); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex",
                  alignItems:"center", justifyContent:"center", zIndex:2000, padding:16 }}>
      <div style={{ background:C.surf, border:`1px solid ${C.bdr}`, borderRadius:14,
                    width:380, maxWidth:"96vw", padding:22 }}>
        <div style={{ fontWeight:800, color:C.text, fontSize:15, marginBottom:16 }}>
          {t("recordAdvanceTitle")}
        </div>
        <div style={{ marginBottom:10 }}>
          <Label>{t("employeeFieldReq")}</Label>
          <select value={f.employeeId} onChange={e=>set("employeeId",e.target.value)}
            style={{...inputStyle()}}>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
          </select>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
          <div>
            <Label>{t("amountFieldReq")}</Label>
            <input type="number" min="0.01" step="0.01" value={f.amount}
              onChange={e=>set("amount",e.target.value)} placeholder="0.00" autoFocus
              style={{...inputStyle(), fontFamily:"'JetBrains Mono',monospace"}}/>
          </div>
          <div>
            <Label>{t("date")}</Label>
            <input type="date" value={f.date} onChange={e=>set("date",e.target.value)}
              style={inputStyle()}/>
          </div>
          <div style={{ gridColumn:"span 2" }}>
            <Label>{t("reasonNoteField")}</Label>
            <input value={f.note} onChange={e=>set("note",e.target.value)}
              placeholder="e.g. Emergency advance" style={inputStyle()}/>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={save} disabled={saving}
            style={{...btn(C.acc,"#000"), flex:2}}>
            {saving ? t("savingLabel") : t("recordAdvanceBtn")}
          </button>
          <button onClick={onClose} style={{...ghostBtn(), flex:1}}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Payroll Page ──────────────────────────────────────────────────
export default function Payroll({ onBack }) {
  const { user, can } = useAuth();
  const { t } = useLang();
  
  // Firebase integration
  const firebaseServices = useFirebaseServices();
  const { tenantId } = useTenant();
  const useFirebase = !!tenantId && !!firebaseServices;

  const [month,       setMonth]       = useState(currentMonth());
  const [payroll,     setPayroll]     = useState({ rows:[], summary:{}, month:"" });
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState("payroll"); // payroll | employees
  const [toast,       setToast]       = useState(null);
  const [empModal,    setEmpModal]    = useState(null);   // null | {} | employee
  const [advModal,    setAdvModal]    = useState(null);   // null | {} | {preselected}
  const [expandedEmp, setExpandedEmp] = useState(null);
  const [delEmpId,    setDelEmpId]    = useState(null);
  const [delAdvId,    setDelAdvId]    = useState(null);
  const [activeEmps,  setActiveEmps]  = useState([]);

  const showToast = (msg, type="ok") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 2800);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let pr, emps;
      
      if (useFirebase) {
        console.log('Loading payroll from Firebase...');
        [pr, emps] = await Promise.all([
          firebaseServices.payroll.getMonthlyPayroll(month),
          firebaseServices.employees.getActive(),
        ]);
        console.log('Loaded from Firebase - Payroll:', pr, 'Employees:', emps);
      } else {
        console.log('Loading payroll from localStorage...');
        [pr, emps] = await Promise.all([
          PayrollService.getMonthlyPayroll(month),
          EmployeeService.getActive(),
        ]);
        console.log('Loaded from localStorage - Payroll:', pr, 'Employees:', emps);
      }
      
      setPayroll(pr);
      setActiveEmps(emps);
    } catch(e) {
      console.error('Error loading payroll:', e);
      showToast(t("loadFailed") + e.message, "err");
    }
    setLoading(false);
  }, [month, useFirebase, firebaseServices]);

  useEffect(() => { load(); }, [load]);

  async function saveEmployee(data) {
    try {
      console.log('Saving employee:', data);
      if (useFirebase) {
        await firebaseServices.employees.save(data);
        console.log('Employee saved to Firebase');
      } else {
        await EmployeeService.save(data);
        console.log('Employee saved to localStorage');
      }
      setEmpModal(null);
      showToast(data.id ? t("employeeUpdated") : t("employeeAdded"));
      load();
    } catch(e) {
      console.error('Error saving employee:', e);
      showToast(t("loadFailed") + e.message, "err");
    }
  }

  async function saveAdvance(data) {
    try {
      console.log('Saving advance:', data);
      if (useFirebase) {
        await firebaseServices.advances.save(data);
        console.log('Advance saved to Firebase');
      } else {
        await AdvanceService.save(data);
        console.log('Advance saved to localStorage');
      }
      setAdvModal(null);
      showToast(t("advanceRecorded"));
      load();
    } catch(e) {
      console.error('Error saving advance:', e);
      showToast(t("loadFailed") + e.message, "err");
    }
  }

  async function deleteEmployee(id) {
    try {
      console.log('Deleting employee:', id);
      if (useFirebase) {
        await firebaseServices.employees.delete(id);
        console.log('Employee deleted from Firebase');
      } else {
        await EmployeeService.delete(id);
        console.log('Employee deleted from localStorage');
      }
      setDelEmpId(null);
      showToast(t("employeeDeleted"), "warn");
      load();
    } catch(e) {
      console.error('Error deleting employee:', e);
      showToast(t("deleteFailed") + ": " + e.message, "err");
    }
  }

  async function deleteAdvance(id) {
    try {
      console.log('Deleting advance:', id);
      if (useFirebase) {
        await firebaseServices.advances.delete(id);
        console.log('Advance deleted from Firebase');
      } else {
        await AdvanceService.delete(id);
        console.log('Advance deleted from localStorage');
      }
      setDelAdvId(null);
      showToast(t("advanceDeleted"), "warn");
      load();
    } catch(e) {
      console.error('Error deleting advance:', e);
      showToast(t("deleteFailed") + ": " + e.message, "err");
    }
  }

  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportEmployees() {
    const emps = await EmployeeService.getAll();
    downloadCSV(PayrollService.exportEmployeesCSV(emps), "employees.csv");
  }

  async function exportAdvances() {
    const advs = await AdvanceService.getAll(month);
    const empMap = {};
    (await EmployeeService.getAll()).forEach(e => { empMap[e.id] = e; });
    downloadCSV(PayrollService.exportAdvancesCSV(advs, empMap),
      `advances-${month}.csv`);
  }

  const { rows, summary } = payroll;
  const months = useMemo(() => monthOptions(), []);
  const isManagerOrAdmin = can("canAccessReports") || can("canManageTables");

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ height:"100vh", background:C.bg, color:C.text, fontFamily:fam,
                  display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* Header */}
      <header style={{ background:C.surf, borderBottom:`1px solid ${C.bdr}`,
                       padding:"0 16px", height:52, flexShrink:0,
                       display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={onBack}
            style={{ background:"transparent", border:"none", color:C.muted,
                     fontSize:18, cursor:"pointer", padding:"0 4px" }}>←</button>
          <span style={{ fontWeight:800, color:C.acc, fontSize:16 }}>{t("payrollTitle")}</span>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {/* Month selector */}
          <select value={month} onChange={e=>setMonth(e.target.value)}
            style={{ background:C.card, border:`1px solid ${C.bdr}`, color:C.text,
                     borderRadius:7, padding:"4px 10px", fontSize:12, fontFamily:fam }}>
            {months.map(m => (
              <option key={m} value={m}>
                {m === currentMonth() ? "📅 " : ""}{monthLabel(m)}
                {m === currentMonth() ? " (Current)" : ""}
              </option>
            ))}
          </select>
          <button onClick={() => setAdvModal({})} style={btn(C.acc,"#000")}>
            {t("addAdvanceBtn")}
          </button>
          <button onClick={() => setEmpModal({})} style={btn(C.info,"#000")}>
            {t("addEmployeeBtn")}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ background:C.surf, borderBottom:`1px solid ${C.bdr}`,
                    padding:"0 16px", display:"flex", gap:2, flexShrink:0 }}>
        {[
          { id:"payroll", label:"📊 Payroll — " + monthLabel(month) },
          { id:"employees", label:"👥 Employees" },
        ].map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            style={{ background:"transparent", border:"none",
                     borderBottom: tab===tb.id ? `2px solid ${C.acc}` : "2px solid transparent",
                     color: tab===tb.id ? C.acc : C.muted,
                     padding:"10px 14px", fontWeight:700, fontSize:12,
                     cursor:"pointer", fontFamily:fam }}>
            {tb.label}
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center" }}>
          <button onClick={exportEmployees}
            style={{...ghostBtn(), fontSize:11, padding:"4px 10px"}}>
            📥 Employees CSV
          </button>
          <button onClick={exportAdvances}
            style={{...ghostBtn(), fontSize:11, padding:"4px 10px"}}>
            📥 Advances CSV
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:"auto", padding:16, paddingBottom:80 }}>

        {/* Summary cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",
                      gap:10, marginBottom:18 }}>
          <Pill label={t("totalEmployees")}   value={rows.length}                   col={C.info}/>
          <Pill label={t("totalSalaries")}    value={CUR(summary.totalSalaries)}    col={C.acc}/>
          <Pill label={t("totalAdvances")}    value={CUR(summary.totalAdvances)}    col={C.warn}/>
          <Pill label={t("remainingPayroll")} value={CUR(summary.totalRemaining)}   col={C.success}/>
        </div>

        {/* ── PAYROLL TAB ── */}
        {tab === "payroll" && (
          loading ? (
            <div style={{ textAlign:"center", color:C.muted, padding:"40px 0" }}>
              {t("loading")}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign:"center", color:C.muted, padding:"60px 0" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>👤</div>
              <div>{t("noEmployeesYet")}</div>
              <div style={{ fontSize:12, marginTop:4 }}>
                {t("addEmployeeHint")}
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {rows.map(row => {
                const emp    = row.employee;
                const isExp  = expandedEmp === emp.id;
                const pct    = row.monthlySalary > 0
                  ? Math.min(100, (row.totalAdvances / row.monthlySalary) * 100)
                  : 0;
                return (
                  <div key={emp.id} style={{ background:C.card, border:`1px solid ${C.bdr}`,
                                              borderRadius:12, overflow:"hidden" }}>
                    {/* Main row */}
                    <div style={{ padding:"12px 14px", display:"flex",
                                  alignItems:"center", gap:10, flexWrap:"wrap",
                                  cursor:"pointer" }}
                         onClick={() => setExpandedEmp(isExp ? null : emp.id)}>
                      {/* Avatar */}
                      <div style={{ width:36, height:36, borderRadius:"50%",
                                    background:C.surf, border:`1.5px solid ${C.bdr}`,
                                    display:"flex", alignItems:"center", justifyContent:"center",
                                    fontSize:16, flexShrink:0 }}>
                        👤
                      </div>
                      {/* Name + role */}
                      <div style={{ flex:1, minWidth:120 }}>
                        <div style={{ fontWeight:700, color:C.text, fontSize:13 }}>
                          {emp.name}
                          {emp.status === "inactive" && (
                            <span style={{ marginLeft:6, fontSize:10, color:C.muted,
                                           background:C.surf, borderRadius:4,
                                           padding:"1px 5px" }}>{t("inactiveEmployee")}</span>
                          )}
                        </div>
                        <div style={{ fontSize:11, color:C.muted }}>{emp.role}</div>
                      </div>
                      {/* Salary columns */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,90px)",
                                    gap:8, textAlign:"right" }}>
                        <div>
                          <div style={{ fontSize:10, color:C.muted }}>{t("colMonthlySalary")}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace",
                                        fontWeight:700, color:C.acc, fontSize:13 }}>
                            {CUR(row.monthlySalary)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize:10, color:C.muted }}>{t("totalAdvances")}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace",
                                        fontWeight:700, color:C.warn, fontSize:13 }}>
                            -{CUR(row.totalAdvances)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize:10, color:C.muted }}>{t("remainingSalaryLabel")}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace",
                                        fontWeight:800, color:C.success, fontSize:13 }}>
                            {CUR(row.remainingSalary)}
                          </div>
                        </div>
                      </div>
                      {/* Expand toggle */}
                      <span style={{ color:C.muted, fontSize:12 }}>{isExp ? "▲" : "▼"}</span>
                    </div>

                    {/* Advance progress bar */}
                    {pct > 0 && (
                      <div style={{ padding:"0 14px 8px" }}>
                        <div style={{ background:C.surf, borderRadius:4, height:5, overflow:"hidden" }}>
                          <div style={{ height:"100%", borderRadius:4,
                                        background: pct >= 100 ? C.danger : pct >= 70 ? C.warn : C.success,
                                        width: pct + "%" }}/>
                        </div>
                        <div style={{ fontSize:9, color:C.muted, marginTop:2 }}>
                          {pct.toFixed(0)}{t("pctSalaryAdvanced")}
                        </div>
                      </div>
                    )}

                    {/* Expanded: advance history + actions */}
                    {isExp && (
                      <div style={{ borderTop:`1px solid ${C.bdr}`, padding:"12px 14px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between",
                                      alignItems:"center", marginBottom:10 }}>
                          <div style={{ fontSize:11, color:C.muted, fontWeight:700,
                                        letterSpacing:"0.06em" }}>
                            {t("advanceHistoryTitle")} — {monthLabel(month)}
                          </div>
                          <div style={{ display:"flex", gap:6 }}>
                            <button onClick={() => setAdvModal({ preselected: emp })}
                              style={{...btn(C.acc+"22","#f0a500"), border:`1px solid ${C.acc}40`,
                                      fontSize:11, padding:"4px 12px"}}>
                              {t("addAdvanceInline")}
                            </button>
                            <button onClick={() => setEmpModal(emp)}
                              style={{...ghostBtn(), fontSize:11, padding:"4px 10px"}}>
                              {t("edit")}
                            </button>
                            <button onClick={() => setDelEmpId(emp.id)}
                              style={{...ghostBtn(true), fontSize:11, padding:"4px 10px"}}>
                              🗑
                            </button>
                          </div>
                        </div>

                        {row.advances.length === 0 ? (
                          <div style={{ fontSize:12, color:C.muted,
                                        padding:"8px 0", textAlign:"center" }}>
                            {t("noAdvancesForMonth")} {monthLabel(month)}
                          </div>
                        ) : (
                          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                            {row.advances.map(adv => (
                              <div key={adv.id}
                                style={{ display:"flex", alignItems:"center", gap:10,
                                         background:C.surf, borderRadius:8, padding:"8px 12px",
                                         border:`1px solid ${C.bdr}` }}>
                                <div style={{ flex:1 }}>
                                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                                    <span style={{ fontFamily:"'JetBrains Mono',monospace",
                                                   fontWeight:800, color:C.warn, fontSize:13 }}>
                                      -{CUR(adv.amount)}
                                    </span>
                                    <span style={{ fontSize:11, color:C.muted }}>{adv.date}</span>
                                    {adv.note && (
                                      <span style={{ fontSize:11, color:C.sub,
                                                     fontStyle:"italic" }}>— {adv.note}</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                                    by {adv.createdBy}
                                  </div>
                                </div>
                                <button onClick={() => setDelAdvId(adv.id)}
                                  style={{...ghostBtn(true), fontSize:10, padding:"3px 8px"}}>
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Subtotal */}
                        {row.advances.length > 0 && (
                          <div style={{ display:"flex", justifyContent:"space-between",
                                        marginTop:10, padding:"8px 12px",
                                        background:C.bg, borderRadius:8,
                                        border:`1px solid ${C.bdr}` }}>
                            <div style={{ fontSize:12, color:C.muted }}>
                              {t("remainingSalaryLabel")} ({monthLabel(month)})
                            </div>
                            <div style={{ fontFamily:"'JetBrains Mono',monospace",
                                          fontWeight:900, fontSize:14, color:C.success }}>
                              {CUR(row.remainingSalary)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── EMPLOYEES TAB ── */}
        {tab === "employees" && (
          loading ? (
            <div style={{ textAlign:"center", color:C.muted, padding:"40px 0" }}>{t("loading")}</div>
          ) : payroll.rows.length === 0 ? (
            <div style={{ textAlign:"center", color:C.muted, padding:"60px 0" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
              {t("noEmployeesYet")}
            </div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse",
                              fontFamily:fam, fontSize:12 }}>
                <thead>
                  <tr style={{ background:C.surf, color:C.muted }}>
                    {[t("name"),t("roleField"),t("phoneField"),t("colMonthlySalary"),t("colHireDate"),t("status"),t("actions")]
                      .map(h => (
                        <th key={h} style={{ padding:"10px 12px", textAlign:"left",
                                             fontWeight:700, letterSpacing:"0.06em",
                                             borderBottom:`1px solid ${C.bdr}`,
                                             fontSize:10 }}>
                          {h.toUpperCase()}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {payroll.rows.map(({ employee: e }) => (
                    <tr key={e.id}
                      style={{ borderBottom:`1px solid ${C.bdr}`,
                               opacity: e.status==="inactive" ? 0.5 : 1 }}>
                      <td style={{ padding:"10px 12px", fontWeight:700, color:C.text }}>
                        {e.name}
                      </td>
                      <td style={{ padding:"10px 12px", color:C.muted }}>{e.role}</td>
                      <td style={{ padding:"10px 12px", color:C.muted }}>{e.phone || "—"}</td>
                      <td style={{ padding:"10px 12px", fontFamily:"'JetBrains Mono',monospace",
                                   color:C.acc, fontWeight:700 }}>
                        {CUR(e.monthlySalary)}
                      </td>
                      <td style={{ padding:"10px 12px", color:C.muted }}>{e.hireDate}</td>
                      <td style={{ padding:"10px 12px" }}>
                        <span style={{ background: e.status==="active" ? C.success+"18" : "#1a1a1a",
                                       color: e.status==="active" ? C.success : C.muted,
                                       border: `1px solid ${e.status==="active" ? C.success+"40" : C.bdr}`,
                                       borderRadius:10, padding:"2px 8px", fontSize:10,
                                       fontWeight:700 }}>
                          {e.status === "active" ? t("activeEmployee") : t("inactiveEmployee")}
                        </span>
                      </td>
                      <td style={{ padding:"10px 12px" }}>
                        <div style={{ display:"flex", gap:5 }}>
                          <button onClick={() => setEmpModal(e)}
                            style={{...ghostBtn(), padding:"3px 8px", fontSize:11}}>
                            ✏
                          </button>
                          <button onClick={() => setAdvModal({ preselected: e })}
                            style={{...btn(C.acc+"18","#f0a500"),
                                    border:`1px solid ${C.acc}40`,
                                    padding:"3px 8px", fontSize:11}}>
                            💸
                          </button>
                          <button onClick={() => setDelEmpId(e.id)}
                            style={{...ghostBtn(true), padding:"3px 8px", fontSize:11}}>
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Modals */}
      {empModal !== null && (
        <EmployeeModal
          emp={empModal?.id ? empModal : undefined}
          onSave={saveEmployee}
          onClose={() => setEmpModal(null)}/>
      )}
      {advModal !== null && (
        <AdvanceModal
          employees={activeEmps}
          preselected={advModal?.preselected}
          onSave={saveAdvance}
          onClose={() => setAdvModal(null)}/>
      )}

      {/* Delete Employee Confirm */}
      {delEmpId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)",
                      display:"flex", alignItems:"center", justifyContent:"center", zIndex:3000 }}>
          <div style={{ background:C.surf, border:`1px solid ${C.bdr}`, borderRadius:12,
                        padding:22, maxWidth:320, width:"96vw", textAlign:"center" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>⚠️</div>
            <div style={{ fontWeight:700, color:C.text, marginBottom:6 }}>{t("deleteUserConfirm")}</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>
              {t("deleteUserWarning")}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => deleteEmployee(delEmpId)}
                style={{...btn(C.danger,"#fff"), flex:1}}>{t("delete")}</button>
              <button onClick={() => setDelEmpId(null)}
                style={{...ghostBtn(), flex:1}}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Advance Confirm */}
      {delAdvId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)",
                      display:"flex", alignItems:"center", justifyContent:"center", zIndex:3000 }}>
          <div style={{ background:C.surf, border:`1px solid ${C.bdr}`, borderRadius:12,
                        padding:22, maxWidth:300, width:"96vw", textAlign:"center" }}>
            <div style={{ fontWeight:700, color:C.text, marginBottom:6 }}>{t("deleteUserConfirm")}</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
              {t("deleteUserWarning")}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => deleteAdvance(delAdvId)}
                style={{...btn(C.danger,"#fff"), flex:1}}>{t("delete")}</button>
              <button onClick={() => setDelAdvId(null)}
                style={{...ghostBtn(), flex:1}}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)",
                      background: toast.type==="err" ? C.danger : toast.type==="warn" ? "#7d4a00" : "#0d3320",
                      border:`1px solid ${toast.type==="err" ? C.danger+"40" : toast.type==="warn" ? C.warn+"40" : C.success+"40"}`,
                      color: toast.type==="err" ? "#fff" : toast.type==="warn" ? C.warn : C.success,
                      borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:700,
                      zIndex:5000, whiteSpace:"nowrap" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
