/**
 * Firebase Firestore Orders Service
 * Handles all order-related operations with tenant isolation
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
  limit,
  Timestamp,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config';

export class FirestoreOrderService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'orders';
  }

  /**
   * Get collection reference for this tenant
   */
  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  /**
   * Create a new order
   */
  async create(orderData) {
    try {
      const docRef = await addDoc(this.getCollectionRef(), {
        ...orderData,
        tenantId: this.tenantId,
        status: orderData.status || 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      return {
        id: docRef.id,
        ...orderData,
      };
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getById(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Order not found');
      }
      
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } catch (error) {
      console.error('Error getting order:', error);
      throw error;
    }
  }

  /**
   * Get all orders
   */
  async getAll() {
    try {
      const q = query(
        this.getCollectionRef(),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting orders:', error);
      throw error;
    }
  }

  /**
   * Get orders by status
   */
  async getByStatus(status) {
    try {
      const q = query(
        this.getCollectionRef(),
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting orders by status:', error);
      throw error;
    }
  }

  /**
   * Get orders by date range
   */
  async getByDateRange(startDate, endDate) {
    try {
      const q = query(
        this.getCollectionRef(),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate)),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting orders by date range:', error);
      throw error;
    }
  }

  /**
   * Get today's orders
   */
  async getToday() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      return await this.getByDateRange(today, tomorrow);
    } catch (error) {
      console.error('Error getting today\'s orders:', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateStatus(id, status) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await updateDoc(docRef, {
        status,
        updatedAt: serverTimestamp(),
      });
      
      return { id, status };
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  /**
   * Update order
   */
  async update(id, updates) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      
      return { id, ...updates };
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  }

  /**
   * Delete order
   */
  async delete(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  }

  /**
   * Get recent orders
   */
  async getRecent(count = 10) {
    try {
      const q = query(
        this.getCollectionRef(),
        orderBy('createdAt', 'desc'),
        limit(count)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting recent orders:', error);
      throw error;
    }
  }

  /**
   * Get orders by table
   */
  async getByTable(tableId) {
    try {
      const q = query(
        this.getCollectionRef(),
        where('tableId', '==', tableId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting orders by table:', error);
      throw error;
    }
  }

  /**
   * Get order statistics
   */
  async getStats(startDate, endDate) {
    try {
      const orders = await this.getByDateRange(startDate, endDate);
      
      const stats = {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, order) => sum + (order.total || 0), 0),
        averageOrderValue: 0,
        ordersByStatus: {},
      };
      
      if (stats.totalOrders > 0) {
        stats.averageOrderValue = stats.totalRevenue / stats.totalOrders;
      }
      
      orders.forEach(order => {
        const status = order.status || 'unknown';
        stats.ordersByStatus[status] = (stats.ordersByStatus[status] || 0) + 1;
      });
      
      return stats;
    } catch (error) {
      console.error('Error getting order stats:', error);
      throw error;
    }
  }
}

// Held Orders Service
export class FirestoreHeldOrderService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'heldOrders';
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  async create(orderData) {
    try {
      const docRef = await addDoc(this.getCollectionRef(), {
        ...orderData,
        tenantId: this.tenantId,
        heldAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      return {
        id: docRef.id,
        ...orderData,
      };
    } catch (error) {
      console.error('Error holding order:', error);
      throw error;
    }
  }

  async getAll() {
    try {
      const q = query(
        this.getCollectionRef(),
        orderBy('heldAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting held orders:', error);
      throw error;
    }
  }

  async delete(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting held order:', error);
      throw error;
    }
  }
}

export default FirestoreOrderService;
