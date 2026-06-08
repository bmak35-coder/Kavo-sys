/**
 * Customer Service
 * 
 * Handles customer management with tenant isolation.
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
  limit,
  startAfter,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config';
import auditService from './auditService';

class CustomerService {
  /**
   * Get customers collection reference for a tenant
   */
  getCustomersRef(tenantId) {
    return collection(db, 'tenants', tenantId, 'customers');
  }

  /**
   * Create a new customer
   */
  async createCustomer(tenantId, customerData, userId) {
    try {
      const newCustomer = {
        ...customerData,
        tenantId,
        totalOrders: 0,
        totalSpent: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      };

      const docRef = await addDoc(this.getCustomersRef(tenantId), newCustomer);

      await auditService.log(tenantId, {
        action: 'create',
        entityType: 'customer',
        entityId: docRef.id,
        userId,
      });

      return {
        id: docRef.id,
        ...newCustomer,
      };
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(tenantId, customerId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'customers', customerId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Customer not found');
      }

      return {
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
        updatedAt: docSnap.data().updatedAt?.toDate(),
        lastOrderDate: docSnap.data().lastOrderDate?.toDate(),
      };
    } catch (error) {
      console.error('Error getting customer:', error);
      throw error;
    }
  }

  /**
   * Get all customers for a tenant
   */
  async getCustomers(tenantId, options = {}) {
    try {
      const { searchTerm, pageSize = 50, lastDoc = null } = options;

      let q = query(
        this.getCustomersRef(tenantId),
        orderBy('name'),
        limit(pageSize)
      );

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      let customers = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      }));

      // Client-side search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        customers = customers.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.phone?.toLowerCase().includes(term) ||
            c.email?.toLowerCase().includes(term)
        );
      }

      return {
        customers,
        lastDoc: snapshot.docs[snapshot.docs.length - 1],
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch (error) {
      console.error('Error getting customers:', error);
      throw error;
    }
  }

  /**
   * Search customers by phone
   */
  async searchByPhone(tenantId, phone) {
    try {
      const q = query(
        this.getCustomersRef(tenantId),
        where('phone', '==', phone),
        limit(10)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error searching customers by phone:', error);
      throw error;
    }
  }

  /**
   * Update customer
   */
  async updateCustomer(tenantId, customerId, updates, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'customers', customerId);
      
      const oldData = await this.getCustomerById(tenantId, customerId);

      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      await auditService.log(tenantId, {
        action: 'update',
        entityType: 'customer',
        entityId: customerId,
        userId,
        changes: auditService.getChanges(oldData, updates),
      });

      return await this.getCustomerById(tenantId, customerId);
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  }

  /**
   * Update customer statistics after order
   */
  async updateCustomerStats(tenantId, customerId, orderTotal) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'customers', customerId);
      const customer = await this.getCustomerById(tenantId, customerId);

      await updateDoc(docRef, {
        totalOrders: (customer.totalOrders || 0) + 1,
        totalSpent: (customer.totalSpent || 0) + orderTotal,
        lastOrderDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating customer stats:', error);
    }
  }

  /**
   * Delete customer
   */
  async deleteCustomer(tenantId, customerId, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'customers', customerId);
      await deleteDoc(docRef);

      await auditService.log(tenantId, {
        action: 'delete',
        entityType: 'customer',
        entityId: customerId,
        userId,
      });
    } catch (error) {
      console.error('Error deleting customer:', error);
      throw error;
    }
  }

  /**
   * Get top customers by spending
   */
  async getTopCustomers(tenantId, limitCount = 10) {
    try {
      const q = query(
        this.getCustomersRef(tenantId),
        orderBy('totalSpent', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting top customers:', error);
      throw error;
    }
  }
}

export default new CustomerService();
