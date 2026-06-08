/**
 * Firebase Firestore Stock Log Service
 * Handles stock transaction logging with tenant isolation
 */

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  query, 
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config';

const safeNum = (v) => { const n = +v; return isFinite(n) ? n : 0; };
const safeArr = (v, d = []) => Array.isArray(v) ? v : d;

export const LOG_TYPES = {
  ADD: "add",
  DEDUCT: "deduct",
  ADJUST: "adjust",
  WASTE: "waste",
  PURCHASE: "purchase",
  TRANSFER: "transfer",
};

export class FirestoreStockLogService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'stockLogs';
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  /**
   * Get recent logs, newest first
   */
  async getRecent(limitCount = 100) {
    try {
      const q = query(
        this.getCollectionRef(),
        orderBy('createdAt', 'desc'),
        firestoreLimit(limitCount)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert Firestore Timestamp to ISO string for compatibility
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      }));
    } catch (error) {
      console.error('Error getting recent logs:', error);
      return [];
    }
  }

  /**
   * Get logs for a specific item
   */
  async getByItem(itemId, limitCount = 50) {
    try {
      const q = query(
        this.getCollectionRef(),
        where('itemId', '==', itemId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(limitCount)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      }));
    } catch (error) {
      console.error('Error getting logs by item:', error);
      return [];
    }
  }

  /**
   * Get logs for a date range
   */
  async getByDateRange(fromISO, toISO) {
    try {
      const q = query(
        this.getCollectionRef(),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      }));

      // Filter by date range
      return logs.filter(l => {
        const logDate = l.createdAt;
        return logDate >= fromISO && logDate <= toISO;
      });
    } catch (error) {
      console.error('Error getting logs by date range:', error);
      return [];
    }
  }

  /**
   * Get today's usage (deduction logs grouped by ingredient)
   */
  async getTodayUsage() {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const logs = await this.getByDateRange(
        todayStart.toISOString(),
        new Date().toISOString()
      );

      const deductions = logs.filter(l => l.type === LOG_TYPES.DEDUCT);
      const grouped = {};

      deductions.forEach(l => {
        if (!grouped[l.itemId]) {
          grouped[l.itemId] = {
            itemId: l.itemId,
            name: l.itemName,
            total: 0,
            count: 0
          };
        }
        grouped[l.itemId].total += safeNum(l.qty);
        grouped[l.itemId].count += 1;
      });

      return Object.values(grouped).sort((a, b) => b.total - a.total);
    } catch (error) {
      console.error('Error getting today usage:', error);
      return [];
    }
  }

  /**
   * Bulk import logs
   */
  async bulkImport(logs) {
    try {
      if (!Array.isArray(logs) || !logs.length) return;

      const promises = logs.map(log =>
        addDoc(this.getCollectionRef(), {
          ...log,
          tenantId: this.tenantId,
          createdAt: serverTimestamp(),
        })
      );

      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk importing logs:', error);
      throw error;
    }
  }
}

export default FirestoreStockLogService;
