/**
 * Tenant Service
 * 
 * Handles tenant management operations.
 * Only accessible by super admins.
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

class TenantService {
  /**
   * Create a new tenant
   * Only super admins can call this
   */
  async createTenant(tenantData, userId) {
    try {
      const slug = this.generateSlug(tenantData.name);
      const token = this.generateToken();

      const newTenant = {
        name: tenantData.name,
        slug: slug,
        token: token,
        domain: tenantData.domain || null,
        status: 'trial',
        plan: 'free',
        billingStatus: 'trialing',
        settings: {
          currency: 'USD',
          timezone: 'UTC',
          language: 'en',
          taxRate: 0,
          receiptFormat: 'standard',
          autoLogout: 30,
          allowedDevices: 5,
          features: {
            inventory: true,
            kitchen: true,
            reports: true,
            multiLocation: false,
            api: false,
            customReports: false,
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      };

      const docRef = await addDoc(collection(db, 'tenants'), newTenant);
      
      return {
        id: docRef.id,
        ...newTenant,
      };
    } catch (error) {
      console.error('Error creating tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId) {
    try {
      const docRef = doc(db, 'tenants', tenantId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Tenant not found');
      }

      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } catch (error) {
      console.error('Error getting tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug) {
    try {
      const q = query(
        collection(db, 'tenants'),
        where('slug', '==', slug),
        limit(1)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        throw new Error('Tenant not found');
      }

      const docSnap = snapshot.docs[0];
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } catch (error) {
      console.error('Error getting tenant by slug:', error);
      throw error;
    }
  }

  /**
   * Get all tenants (paginated)
   */
  async getTenants(pageSize = 20, lastDoc = null) {
    try {
      let q = query(
        collection(db, 'tenants'),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const tenants = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return {
        tenants,
        lastDoc: snapshot.docs[snapshot.docs.length - 1],
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch (error) {
      console.error('Error getting tenants:', error);
      throw error;
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(tenantId, updates, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId);
      
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      return await this.getTenantById(tenantId);
    } catch (error) {
      console.error('Error updating tenant:', error);
      throw error;
    }
  }

  /**
   * Change tenant status
   */
  async changeTenantStatus(tenantId, status, userId) {
    return this.updateTenant(tenantId, { status }, userId);
  }

  /**
   * Change tenant plan
   */
  async changeTenantPlan(tenantId, plan, userId) {
    return this.updateTenant(tenantId, { plan }, userId);
  }

  /**
   * Delete tenant
   */
  async deleteTenant(tenantId) {
    try {
      // In production, this should be a Cloud Function that also deletes
      // all subcollections and related data
      const docRef = doc(db, 'tenants', tenantId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant statistics
   */
  async getTenantStats(tenantId) {
    try {
      // This would query various collections to get stats
      // Implement based on your needs
      const stats = {
        totalUsers: 0,
        totalProducts: 0,
        totalOrders: 0,
        totalSales: 0,
        activeShifts: 0,
      };

      return stats;
    } catch (error) {
      console.error('Error getting tenant stats:', error);
      throw error;
    }
  }

  /**
   * Generate unique slug from tenant name
   */
  generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  /**
   * Generate secure token for API access
   */
  generateToken() {
    return crypto.randomUUID();
  }

  /**
   * Verify tenant token
   */
  async verifyToken(token) {
    try {
      const q = query(
        collection(db, 'tenants'),
        where('token', '==', token),
        limit(1)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data(),
      };
    } catch (error) {
      console.error('Error verifying token:', error);
      return null;
    }
  }
}

export default new TenantService();
