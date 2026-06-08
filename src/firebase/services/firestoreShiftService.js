/**
 * Firebase Firestore Shift Service
 * Manages shift operations (open/close) and shift history
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
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config';

const safeArr = (v, d = []) => Array.isArray(v) ? v : d;

export class FirestoreShiftService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, 'shifts');
  }

  getDocRef(shiftId) {
    return doc(db, 'tenants', this.tenantId, 'shifts', shiftId);
  }

  getCurrentShiftDocRef() {
    return doc(db, 'tenants', this.tenantId, 'currentShift', 'active');
  }

  /**
   * Get current active shift
   */
  async getCurrent() {
    try {
      const docSnap = await getDoc(this.getCurrentShiftDocRef());
      
      if (!docSnap.exists()) return null;
      
      const data = docSnap.data();
      return {
        ...data,
        shiftId: data.shiftId || data.id,
      };
    } catch (error) {
      console.error('Error getting current shift:', error);
      return null;
    }
  }

  /**
   * Open a new shift
   */
  async openShift(shiftData) {
    try {
      const docRef = this.getCurrentShiftDocRef();
      
      const data = {
        ...shiftData,
        tenantId: this.tenantId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      await setDoc(docRef, data);
      
      console.log('Shift opened in Firebase:', shiftData.shiftId);
      return data;
    } catch (error) {
      console.error('Error opening shift:', error);
      throw error;
    }
  }

  /**
   * Clear current active shift
   */
  async clearCurrentShift() {
    try {
      await deleteDoc(this.getCurrentShiftDocRef());
      console.log('Current shift cleared from Firebase');
    } catch (error) {
      console.error('Error clearing current shift:', error);
      throw error;
    }
  }

  /**
   * Get shift history
   */
  async getHistory() {
    try {
      const q = query(
        this.getCollectionRef(),
        orderBy('openedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const shifts = [];
      
      querySnapshot.forEach((doc) => {
        shifts.push({ 
          id: doc.id, 
          ...doc.data() 
        });
      });
      
      return safeArr(shifts);
    } catch (error) {
      console.error('Error getting shift history:', error);
      return [];
    }
  }

  /**
   * Save closed shift to history
   */
  async saveClosedShift(shift) {
    try {
      const shiftId = shift.shiftId || shift.id;
      const docRef = this.getDocRef(shiftId);
      
      const data = {
        ...shift,
        id: shiftId,
        shiftId,
        tenantId: this.tenantId,
        updatedAt: serverTimestamp(),
      };
      
      // If this is a new closed shift (not updating existing), add createdAt
      if (!shift.createdAt) {
        data.createdAt = serverTimestamp();
      }
      
      await setDoc(docRef, data);
      
      console.log('Closed shift saved to Firebase:', shiftId);
      return data;
    } catch (error) {
      console.error('Error saving closed shift:', error);
      throw error;
    }
  }

  /**
   * Delete shift from history
   */
  async deleteShift(shiftId) {
    try {
      await deleteDoc(this.getDocRef(shiftId));
      console.log('Shift deleted from Firebase:', shiftId);
    } catch (error) {
      console.error('Error deleting shift:', error);
      throw error;
    }
  }

  /**
   * Get shifts by date range
   */
  async getByDateRange(fromMs, toMs) {
    try {
      const shifts = await this.getHistory();
      
      return shifts.filter(s => {
        try {
          const t = new Date(s.openedAt).getTime();
          return t >= fromMs && t <= toMs;
        } catch { 
          return false; 
        }
      });
    } catch (error) {
      console.error('Error getting shifts by date range:', error);
      return [];
    }
  }

  /**
   * Bulk import shifts
   */
  async bulkImport(shifts) {
    if (!Array.isArray(shifts) || shifts.length === 0) return;
    
    try {
      const promises = shifts.map(shift => {
        const shiftId = shift.shiftId || shift.id;
        const docRef = this.getDocRef(shiftId);
        
        return setDoc(docRef, {
          ...shift,
          id: shiftId,
          shiftId,
          tenantId: this.tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      
      await Promise.all(promises);
      console.log(`Bulk imported ${shifts.length} shifts to Firebase`);
    } catch (error) {
      console.error('Error bulk importing shifts:', error);
      throw error;
    }
  }
}

export default FirestoreShiftService;
