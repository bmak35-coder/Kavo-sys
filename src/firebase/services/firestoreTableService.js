/**
 * Firebase Firestore Tables Service
 * Handles table management and status tracking
 */

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config';

export class FirestoreTableService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'tables';
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  /**
   * Get all tables
   */
  async getAll() {
    try {
      const q = query(
        this.getCollectionRef(),
        orderBy('number', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting tables:', error);
      throw error;
    }
  }

  /**
   * Get table by ID
   */
  async getById(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
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
   * Create table
   */
  async create(tableData) {
    try {
      const docRef = await addDoc(this.getCollectionRef(), {
        ...tableData,
        tenantId: this.tenantId,
        status: tableData.status || 'available',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      return {
        id: docRef.id,
        ...tableData,
      };
    } catch (error) {
      console.error('Error creating table:', error);
      throw error;
    }
  }

  /**
   * Update table
   */
  async update(id, updates) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      
      // Check if document exists
      const existingDoc = await getDoc(docRef);
      if (!existingDoc.exists()) {
        throw new Error('Table not found');
      }
      
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      
      return { id, ...updates };
    } catch (error) {
      console.error('Error updating table:', error);
      throw error;
    }
  }

  /**
   * Update table status
   */
  async updateStatus(id, status) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      
      // Check if document exists
      const existingDoc = await getDoc(docRef);
      if (!existingDoc.exists()) {
        throw new Error('Table not found');
      }
      
      await updateDoc(docRef, {
        status,
        updatedAt: serverTimestamp(),
      });
      
      return { id, status };
    } catch (error) {
      console.error('Error updating table status:', error);
      throw error;
    }
  }

  /**
   * Delete table
   */
  async delete(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting table:', error);
      throw error;
    }
  }

  /**
   * Get available tables
   */
  async getAvailable() {
    try {
      const q = query(
        this.getCollectionRef(),
        where('status', '==', 'available'),
        orderBy('number', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting available tables:', error);
      throw error;
    }
  }

  /**
   * Get occupied tables
   */
  async getOccupied() {
    try {
      const q = query(
        this.getCollectionRef(),
        where('status', '==', 'occupied'),
        orderBy('number', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting occupied tables:', error);
      throw error;
    }
  }

  /**
   * Save table (create or update)
   */
  async save(table) {
    try {
      const tableId = table.id || `tbl_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
      const docRef = doc(this.getCollectionRef(), tableId);
      
      const docData = {
        ...table,
        id: tableId,
        tenantId: this.tenantId,
        number: String(table.number || "").trim(),
        label: String(table.label || table.number || "").trim(),
        capacity: Number(table.capacity) || 0,
        status: table.status || 'Available',
        active: table.active !== false,
        notes: table.notes || "",
        updatedAt: serverTimestamp(),
        createdAt: table.createdAt || serverTimestamp(),
      };
      
      const { setDoc } = await import('firebase/firestore');
      await setDoc(docRef, docData);
      return { ...docData, id: tableId };
    } catch (error) {
      console.error('Error saving table:', error);
      throw error;
    }
  }

  /**
   * Set table status
   */
  async setStatus(id, status) {
    return await this.updateStatus(id, status);
  }

  /**
   * Mark table as occupied
   */
  async occupy(id) {
    return await this.setStatus(id, 'Occupied');
  }

  /**
   * Mark table as available (release)
   */
  async release(id) {
    return await this.setStatus(id, 'Available');
  }

  /**
   * Get active tables only
   */
  async getActive() {
    try {
      const q = query(
        this.getCollectionRef(),
        where('active', '==', true),
        orderBy('number', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting active tables:', error);
      throw error;
    }
  }
}

export default FirestoreTableService;
