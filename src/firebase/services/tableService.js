/**
 * Table Service
 * 
 * Handles table management with tenant isolation.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../config';
import auditService from './auditService';

class TableService {
  /**
   * Get tables collection reference for a tenant
   */
  getTablesRef(tenantId) {
    return collection(db, 'tenants', tenantId, 'tables');
  }

  /**
   * Create a new table
   */
  async createTable(tenantId, tableData, userId) {
    try {
      const newTable = {
        ...tableData,
        tenantId,
        status: 'available',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      };

      const docRef = await addDoc(this.getTablesRef(tenantId), newTable);

      await auditService.log(tenantId, {
        action: 'create',
        entityType: 'table',
        entityId: docRef.id,
        userId,
      });

      return {
        id: docRef.id,
        ...newTable,
      };
    } catch (error) {
      console.error('Error creating table:', error);
      throw error;
    }
  }

  /**
   * Get table by ID
   */
  async getTableById(tenantId, tableId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'tables', tableId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Table not found');
      }

      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } catch (error) {
      console.error('Error getting table:', error);
      throw error;
    }
  }

  /**
   * Get all tables for a tenant
   */
  async getTables(tenantId, options = {}) {
    try {
      const { status, section } = options;

      let q = query(this.getTablesRef(tenantId), orderBy('number'));

      if (status) {
        q = query(q, where('status', '==', status));
      }

      if (section) {
        q = query(q, where('section', '==', section));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting tables:', error);
      throw error;
    }
  }

  /**
   * Subscribe to table updates (real-time)
   */
  subscribeToTables(tenantId, callback) {
    const q = query(this.getTablesRef(tenantId), orderBy('number'));

    return onSnapshot(q, (snapshot) => {
      const tables = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(tables);
    });
  }

  /**
   * Update table
   */
  async updateTable(tenantId, tableId, updates, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'tables', tableId);
      
      const oldData = await this.getTableById(tenantId, tableId);

      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      await auditService.log(tenantId, {
        action: 'update',
        entityType: 'table',
        entityId: tableId,
        userId,
        changes: auditService.getChanges(oldData, updates),
      });

      return await this.getTableById(tenantId, tableId);
    } catch (error) {
      console.error('Error updating table:', error);
      throw error;
    }
  }

  /**
   * Update table status
   */
  async updateTableStatus(tenantId, tableId, status, orderId = null, userId) {
    const updates = { status };
    if (orderId) {
      updates.currentOrderId = orderId;
    } else {
      updates.currentOrderId = null;
    }

    return this.updateTable(tenantId, tableId, updates, userId);
  }

  /**
   * Occupy table with order
   */
  async occupyTable(tenantId, tableId, orderId, userId) {
    return this.updateTableStatus(tenantId, tableId, 'occupied', orderId, userId);
  }

  /**
   * Release table
   */
  async releaseTable(tenantId, tableId, userId) {
    return this.updateTableStatus(tenantId, tableId, 'available', null, userId);
  }

  /**
   * Delete table
   */
  async deleteTable(tenantId, tableId, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'tables', tableId);
      await deleteDoc(docRef);

      await auditService.log(tenantId, {
        action: 'delete',
        entityType: 'table',
        entityId: tableId,
        userId,
      });
    } catch (error) {
      console.error('Error deleting table:', error);
      throw error;
    }
  }

  /**
   * Get table statistics
   */
  async getTableStats(tenantId) {
    try {
      const tables = await this.getTables(tenantId);

      const stats = {
        total: tables.length,
        available: tables.filter((t) => t.status === 'available').length,
        occupied: tables.filter((t) => t.status === 'occupied').length,
        reserved: tables.filter((t) => t.status === 'reserved').length,
        cleaning: tables.filter((t) => t.status === 'cleaning').length,
      };

      return stats;
    } catch (error) {
      console.error('Error getting table stats:', error);
      throw error;
    }
  }
}

export default new TableService();
