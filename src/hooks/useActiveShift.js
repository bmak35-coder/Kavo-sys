/**
 * KAVO-SYS · useActiveShift
 * Returns the current active shift from IndexedDB (db.currentShift / id="active").
 * Persists across component mounts/unmounts and browser refreshes.
 * Accepts an optional onChange callback to re-read after open/close.
 *
 * Usage:
 *   const { activeShift, reload } = useActiveShift();
 */
import { useState, useEffect, useCallback } from "react";
import { ShiftService } from "../db/services/shifts.js";

const LS_KEY = "kavo_active_shift_id"; // localStorage fallback key

export function useActiveShift() {
  const [activeShift, setActiveShift] = useState(null);
  const [loading, setLoading]         = useState(true);

  const reload = useCallback(async () => {
    try {
      const s = await ShiftService.getCurrent();
      setActiveShift(s && s.status === "open" ? s : null);
      // Mirror id to localStorage as a quick-read fallback
      if (s && s.status === "open" && s.shiftId) {
        try { localStorage.setItem(LS_KEY, s.shiftId); } catch(_) {}
      } else {
        try { localStorage.removeItem(LS_KEY); } catch(_) {}
      }
    } catch (_) {
      setActiveShift(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { activeShift, setActiveShift, loading, reload };
}
