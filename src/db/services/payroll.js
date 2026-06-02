/**
 * KAVO-SYS · Payroll Service
 * Manages employees and salary advances in IndexedDB (Dexie v7).
 */
import { db } from "../db.js";

function nowISO()  { return new Date().toISOString(); }
function genId()   { return "emp_" + Date.now() + "_" + Math.random().toString(36).slice(2,5); }
function genAdvId(){ return "adv_" + Date.now() + "_" + Math.random().toString(36).slice(2,5); }
function safeNum(v){ const n = +v; return isFinite(n) ? n : 0; }

/** Returns "YYYY-MM" string for a given Date (or now) */
export function yearMonth(date) {
  const d = date ? new Date(date) : new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

/** Human-readable month label: "May 2026" */
export function monthLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

// ── Employee Service ───────────────────────────────────────────────────
export const EmployeeService = {
  async getAll() {
    try {
      const rows = await db.employees.toArray();
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    } catch { return []; }
  },

  async getActive() {
    try {
      const rows = await db.employees.toArray();
      return rows.filter(e => e.status !== "inactive").sort((a, b) => a.name.localeCompare(b.name));
    } catch { return []; }
  },

  async save(emp) {
    const record = {
      id:            emp.id || genId(),
      name:          (emp.name || "").trim(),
      role:          emp.role || "Staff",
      phone:         emp.phone || "",
      monthlySalary: safeNum(emp.monthlySalary),
      hireDate:      emp.hireDate || yearMonth(new Date()) + "-01",
      status:        emp.status || "active",
      notes:         emp.notes || "",
      updatedAt:     nowISO(),
      createdAt:     emp.createdAt || nowISO(),
    };
    await db.employees.put(record);
    return record;
  },

  async delete(id) {
    try {
      await db.employees.delete(id);
      // Also delete all advances for this employee
      const advances = await db.salaryAdvances.where("employeeId").equals(id).toArray();
      await Promise.all(advances.map(a => db.salaryAdvances.delete(a.id)));
    } catch {}
  },
};

// ── Advance Service ────────────────────────────────────────────────────
export const AdvanceService = {
  /** Get all advances, optionally filtered by month ("YYYY-MM") */
  async getAll(month) {
    try {
      let rows = await db.salaryAdvances.toArray();
      if (month) rows = rows.filter(a => a.month === month);
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    } catch { return []; }
  },

  /** Get advances for a specific employee, optionally filtered by month */
  async getForEmployee(employeeId, month) {
    try {
      let rows = await db.salaryAdvances.where("employeeId").equals(employeeId).toArray();
      if (month) rows = rows.filter(a => a.month === month);
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    } catch { return []; }
  },

  async save(adv) {
    const date   = adv.date || new Date().toISOString().slice(0, 10);
    const record = {
      id:         adv.id || genAdvId(),
      employeeId: adv.employeeId,
      amount:     safeNum(adv.amount),
      date,
      month:      adv.month || yearMonth(new Date(date)), // "YYYY-MM"
      note:       adv.note || "",
      createdBy:  adv.createdBy || "admin",
      createdAt:  adv.createdAt || nowISO(),
    };
    await db.salaryAdvances.put(record);
    return record;
  },

  async delete(id) {
    try { await db.salaryAdvances.delete(id); } catch {}
  },

  /** Calculate total advances for an employee in a given month */
  async totalForEmployee(employeeId, month) {
    const advances = await AdvanceService.getForEmployee(employeeId, month);
    return advances.reduce((s, a) => s + safeNum(a.amount), 0);
  },
};

// ── Payroll Summary ────────────────────────────────────────────────────
export const PayrollService = {
  /** Build full payroll view for all employees for a given month */
  async getMonthlyPayroll(month) {
    const employees = await EmployeeService.getAll();
    const advances  = await AdvanceService.getAll(month);

    const rows = employees.map(emp => {
      const empAdvances = advances.filter(a => a.employeeId === emp.id);
      const totalAdv    = empAdvances.reduce((s, a) => s + safeNum(a.amount), 0);
      const remaining   = Math.max(0, safeNum(emp.monthlySalary) - totalAdv);
      return {
        employee:        emp,
        monthlySalary:   safeNum(emp.monthlySalary),
        totalAdvances:   totalAdv,
        remainingSalary: remaining,
        advances:        empAdvances,
      };
    });

    const summary = {
      totalSalaries:  rows.reduce((s, r) => s + r.monthlySalary, 0),
      totalAdvances:  rows.reduce((s, r) => s + r.totalAdvances, 0),
      totalRemaining: rows.reduce((s, r) => s + r.remainingSalary, 0),
    };

    return { rows, summary, month };
  },

  /** Export employees as CSV */
  exportEmployeesCSV(employees) {
    const header = "ID,Name,Role,Phone,Monthly Salary,Hire Date,Status";
    const lines  = employees.map(e =>
      [e.id, e.name, e.role, e.phone, e.monthlySalary, e.hireDate, e.status]
        .map(v => `"${String(v || "").replace(/"/g, '""')}"`)
        .join(",")
    );
    return header + "\n" + lines.join("\n");
  },

  /** Export advances as CSV for a given month */
  exportAdvancesCSV(advances, employeeMap) {
    const header = "ID,Employee,Amount,Date,Month,Note,Created By";
    const lines  = advances.map(a => {
      const empName = employeeMap[a.employeeId]?.name || a.employeeId;
      return [a.id, empName, a.amount, a.date, a.month, a.note, a.createdBy]
        .map(v => `"${String(v || "").replace(/"/g, '""')}"`)
        .join(",");
    });
    return header + "\n" + lines.join("\n");
  },
};
