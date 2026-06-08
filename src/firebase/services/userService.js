/**
 * User Service
 * 
 * Handles user management with tenant isolation.
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
} from 'firebase/firestore';
import { db } from '../config';
import auditService from './auditService';

class UserService {
  /**
   * Get users collection reference for a tenant
   */
  getUsersRef(tenantId) {
    return collection(db, 'tenants', tenantId, 'users');
  }

  /**
   * Create a new user document (called after Firebase Auth user creation)
   */
  async createUser(tenantId, userData, userId) {
    try {
      const newUser = {
        ...userData,
        tenantId,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      };

      // Use uid as document ID
      const docRef = doc(db, 'tenants', tenantId, 'users', userData.uid);
      await setDoc(docRef, newUser);

      await auditService.log(tenantId, {
        action: 'create',
        entityType: 'user',
        entityId: userData.uid,
        userId,
      });

      return {
        id: userData.uid,
        ...newUser,
      };
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(tenantId, uid) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'users', uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('User not found');
      }

      return {
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
        updatedAt: docSnap.data().updatedAt?.toDate(),
        lastLogin: docSnap.data().lastLogin?.toDate(),
      };
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  /**
   * Get all users for a tenant
   */
  async getUsers(tenantId, options = {}) {
    try {
      const { role, active } = options;

      let q = query(this.getUsersRef(tenantId), orderBy('name'));

      if (role) {
        q = query(q, where('role', '==', role));
      }

      if (active !== undefined) {
        q = query(q, where('active', '==', active));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
        lastLogin: doc.data().lastLogin?.toDate(),
      }));
    } catch (error) {
      console.error('Error getting users:', error);
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(tenantId, uid, updates, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'users', uid);
      
      const oldData = await this.getUserById(tenantId, uid);

      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      await auditService.log(tenantId, {
        action: 'update',
        entityType: 'user',
        entityId: uid,
        userId,
        changes: auditService.getChanges(oldData, updates),
      });

      return await this.getUserById(tenantId, uid);
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Deactivate user
   */
  async deactivateUser(tenantId, uid, userId) {
    return this.updateUser(tenantId, uid, { active: false }, userId);
  }

  /**
   * Activate user
   */
  async activateUser(tenantId, uid, userId) {
    return this.updateUser(tenantId, uid, { active: true }, userId);
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(tenantId, uid, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'users', uid);
      await deleteDoc(docRef);

      await auditService.log(tenantId, {
        action: 'delete',
        entityType: 'user',
        entityId: uid,
        userId,
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Update user role (requires Cloud Function to update custom claims)
   */
  async updateUserRole(tenantId, uid, newRole, userId) {
    try {
      await this.updateUser(tenantId, uid, { role: newRole }, userId);
      
      // Note: This should trigger a Cloud Function to update custom claims
      // The frontend should call refreshClaims() after this
      
      return { success: true, message: 'Role updated. User must refresh their session.' };
    } catch (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(tenantId) {
    try {
      const users = await this.getUsers(tenantId);

      const stats = {
        total: users.length,
        active: users.filter((u) => u.active).length,
        inactive: users.filter((u) => !u.active).length,
        byRole: {},
      };

      users.forEach((user) => {
        stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }
}

export default new UserService();
