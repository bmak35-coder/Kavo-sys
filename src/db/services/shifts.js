import { db, safeDB } from "../db.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Shifts Service  ·  IndexedDB-backed
══════════════════════════════════════════════════════ */

const safeArr = (v, d = []) => Array.isArray(v) ? v : d;

export const ShiftService = {
  // ── Current shift ──────────────────────────────────
  async getCurrent() {
    return safeDB(async () => {
      const row = await db.currentShift.get("active");
      if (!row) return null;
      // row.id = "active" (our internal IDB key), shiftId = the real shift ID
      // Return everything except the internal "active" key ID
      const { id: _id, ...rest } = row;
      return rest;
    }, null);
  },

  async openShift(shiftData) {
    const row = { id: "active", ...shiftData };
    return safeDB(() => db.currentShift.put(row));
  },

  async clearCurrentShift() {
    return safeDB(() => db.currentShift.delete("active"));
  },

  // ── Shift history ──────────────────────────────────
  async getHistory() {
    const shifts = await safeDB(() =>
      db.shifts.orderBy("openedAt").reverse().toArray(), []
    );
    return safeArr(shifts);
  },

  async saveClosedShift(shift) {
    return safeDB(() => db.shifts.put(shift));
  },

  async deleteShift(id) {
    return safeDB(() => db.shifts.delete(id));
  },

  async getByDateRange(fromMs, toMs) {
    const all = await ShiftService.getHistory();
    return all.filter(s => {
      try {
        const t = new Date(s.openedAt).getTime();
        return t >= fromMs && t <= toMs;
      } catch { return false; }
    });
  },

  async bulkImport(shifts) {
    if (!Array.isArray(shifts) || shifts.length === 0) return;
    return safeDB(() => db.shifts.bulkPut(shifts));
  },
};
