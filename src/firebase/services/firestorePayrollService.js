/**
 * Firebase Firestore Payroll Service
 * Handles employees, salary advances, and payroll calculations
 */

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config';

function safeNum(v) { const n = +v; return isFinite(n) ? n : 0; }

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

// ══════════════════════════════════════════════════════
//   EMPLOYEE SERVICE
// ══════════════════════════════════════════════════════

export class FirestoreEmployeeService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, 'employees');
  }

  getDocRef(employeeId) {
    return doc(db, 'tenants', this.tenantId, 'employees', employeeId);
  }

  /**
   * Get all employees
   */
  async getAll() {
    try {
      const querySnapshot = await getDocs(this.getCollectionRef());
      const employees = [];
      querySnapshot.forEach((doc) => {
        employees.push({ id: doc.id, ...doc.data() });
      });
      return employees.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error getting employees:', error);
      throw error;
    }
  }

  /**
   * Get active employees only
   */
  async getActive() {
    try {
      const employees = await this.getAll();
      return employees.filter(e => e.status !== "inactive");
    } catch (error) {
      console.error('Error getting active employees:', error);
      throw error;
    }
  }

  /**
   * Get employee by ID
   */
  async get(employeeId) {
    try {
      const docSnap = await getDoc(this.getDocRef(employeeId));
      if (!docSnap.exists()) return null;
      return { id: docSnap.id, ...docSnap.data() };
    } catch (error) {
      console.error('Error getting employee:', error);
      throw error;
    }
  }

  /**
   * Save employee (create or update)
   */
  async save(emp) {
    try {
      const employeeId = emp.id || `emp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const docRef = this.getDocRef(employeeId);
      
      const record = {
        name: (emp.name || "").trim(),
        role: emp.role || "Staff",
        phone: emp.phone || "",
        monthlySalary: safeNum(emp.monthlySalary),
        hireDate: emp.hireDate || yearMonth(new Date()) + "-01",
        status: emp.status || "active",
        notes: emp.notes || "",
        tenantId: this.tenantId,
        updatedAt: serverTimestamp(),
      };

      if (emp.id) {
        // Update existing
        await updateDoc(docRef, record);
      } else {
        // Create new
        await setDoc(docRef, {
          ...record,
          createdAt: serverTimestamp(),
        });
      }

      return { id: employeeId, ...record };
    } catch (error) {
      console.error('Error saving employee:', error);
      throw error;
    }
  }

  /**
   * Delete employee
   */
  async delete(employeeId) {
    try {
      await deleteDoc(this.getDocRef(employeeId));
      
      // Also delete all advances for this employee
      const advanceService = new FirestoreAdvanceService(this.tenantId);
      const advances = await advanceService.getForEmployee(employeeId);
      await Promise.all(advances.map(a => advanceService.delete(a.id)));
      
      console.log('Employee deleted:', employeeId);
    } catch (error) {
      console.error('Error deleting employee:', error);
      throw error;
    }
  }
}

// ══════════════════════════════════════════════════════
//   SALARY ADVANCE SERVICE
// ══════════════════════════════════════════════════════

export class FirestoreAdvanceService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, 'salaryAdvances');
  }

  getDocRef(advanceId) {
    return doc(db, 'tenants', this.tenantId, 'salaryAdvances', advanceId);
  }

  /**
   * Get all advances, optionally filtered by month
   */
  async getAll(month) {
    try {
      const querySnapshot = await getDocs(this.getCollectionRef());
      let advances = [];
      querySnapshot.forEach((doc) => {
        advances.push({ id: doc.id, ...doc.data() });
      });
      
      if (month) {
        advances = advances.filter(a => a.month === month);
      }
      
      return advances.sort((a, b) => b.date.localeCompare(a.date));
    } catch (error) {
      console.error('Error getting advances:', error);
      throw error;
    }
  }

  /**
   * Get advances for a specific employee
   */
  async getForEmployee(employeeId, month) {
    try {
      const advances = await this.getAll(month);
      return advances.filter(a => a.employeeId === employeeId);
    } catch (error) {
      console.error('Error getting employee advances:', error);
      throw error;
    }
  }

  /**
   * Save advance
   */
  async save(adv) {
    try {
      const advanceId = adv.id || `adv_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const docRef = this.getDocRef(advanceId);
      
      const date = adv.date || new Date().toISOString().slice(0, 10);
      const record = {
        employeeId: adv.employeeId,
        amount: safeNum(adv.amount),
        date,
        month: adv.month || yearMonth(new Date(date)),
        note: adv.note || "",
        createdBy: adv.createdBy || "admin",
        tenantId: this.tenantId,
      };

      if (adv.id) {
        // Update existing
        await updateDoc(docRef, record);
      } else {
        // Create new
        await setDoc(docRef, {
          ...record,
          createdAt: serverTimestamp(),
        });
      }

      return { id: advanceId, ...record };
    } catch (error) {
      console.error('Error saving advance:', error);
      throw error;
    }
  }

  /**
   * Delete advance
   */
  async delete(advanceId) {
    try {
      await deleteDoc(this.getDocRef(advanceId));
      console.log('Advance deleted:', advanceId);
    } catch (error) {
      console.error('Error deleting advance:', error);
      throw error;
    }
  }
}

// ══════════════════════════════════════════════════════
//   PAYROLL SERVICE (Calculations & Reports)
// ══════════════════════════════════════════════════════

export class FirestorePayrollService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.employeeService = new FirestoreEmployeeService(tenantId);
    this.advanceService = new FirestoreAdvanceService(tenantId);
  }

  /**
   * Get monthly payroll report
   */
  async getMonthlyPayroll(month) {
    try {
      const [employees, advances] = await Promise.all([
        this.employeeService.getActive(),
        this.advanceService.getAll(month),
      ]);

      // Build payroll rows for each employee
      const rows = employees.map(emp => {
        const empAdvances = advances.filter(a => a.employeeId === emp.id);
        const totalAdvances = empAdvances.reduce((sum, a) => sum + safeNum(a.amount), 0);
        const remainingSalary = Math.max(0, safeNum(emp.monthlySalary) - totalAdvances);

        return {
          employee: emp,
          monthlySalary: safeNum(emp.monthlySalary),
          totalAdvances,
          remainingSalary,
          advances: empAdvances,
        };
      });

      // Calculate summary
      const summary = {
        totalSalaries: rows.reduce((sum, r) => sum + r.monthlySalary, 0),
        totalAdvances: rows.reduce((sum, r) => sum + r.totalAdvances, 0),
        totalRemaining: rows.reduce((sum, r) => sum + r.remainingSalary, 0),
      };

      return {
        month,
        rows,
        summary,
      };
    } catch (error) {
      console.error('Error generating payroll:', error);
      throw error;
    }
  }

  /**
   * Export payroll to CSV
   */
  async exportToCSV(month) {
    try {
      const payroll = await this.getMonthlyPayroll(month);
      
      let csv = "Employee,Role,Monthly Salary,Advances,Remaining Salary\n";
      payroll.rows.forEach(row => {
        const emp = row.employee;
        csv += `"${emp.name}","${emp.role}",${row.monthlySalary.toFixed(2)},${row.totalAdvances.toFixed(2)},${row.remainingSalary.toFixed(2)}\n`;
      });
      
      csv += `\nTotals,,${payroll.summary.totalSalaries.toFixed(2)},${payroll.summary.totalAdvances.toFixed(2)},${payroll.summary.totalRemaining.toFixed(2)}\n`;
      
      return csv;
    } catch (error) {
      console.error('Error exporting payroll:', error);
      throw error;
    }
  }
}

export default {
  FirestoreEmployeeService,
  FirestoreAdvanceService,
  FirestorePayrollService,
};
