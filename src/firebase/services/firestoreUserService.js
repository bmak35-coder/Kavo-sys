/**
 * Firebase Firestore User Service
 * Handles user management with tenant isolation
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
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config';

export class FirestoreUserService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'users';
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  /**
   * Get all users
   */
  async getAll() {
    try {
      const q = query(
        this.getCollectionRef(),
        orderBy('name', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.(),
        updatedAt: doc.data().updatedAt?.toDate?.(),
      }));
    } catch (error) {
      console.error('Error getting users:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getById(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('User not found');
      }
      
      return {
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate?.(),
        updatedAt: docSnap.data().updatedAt?.toDate?.(),
      };
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  /**
   * Create or update user
   * If user.id exists, updates existing user; otherwise creates new one
   */
  async save(userData) {
    try {
      const isUpdate = !!userData.id;
      const userId = userData.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const docRef = doc(this.getCollectionRef(), userId);
      
      const userDoc = {
        ...userData,
        tenantId: this.tenantId,
        updatedAt: serverTimestamp(),
      };
      
      // Set active default if not specified
      if (userDoc.active === undefined) {
        userDoc.active = true;
      }
      
      // Remove id from the document (it's the document ID)
      delete userDoc.id;
      
      // Use setDoc with merge for updates to handle both cases:
      // 1. Document exists in Firebase -> update it
      // 2. Document doesn't exist but has ID from IndexedDB -> create it
      if (isUpdate) {
        // Check if document exists, if not add createdAt
        const existingDoc = await getDoc(docRef);
        if (!existingDoc.exists()) {
          userDoc.createdAt = serverTimestamp();
        }
        // Merge to preserve existing fields
        await setDoc(docRef, userDoc, { merge: true });
      } else {
        // Create new user with createdAt
        userDoc.createdAt = serverTimestamp();
        await setDoc(docRef, userDoc);
      }
      
      return {
        id: userId,
        ...userData,
      };
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }

  /**
   * Update user
   */
  async update(id, updates) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      
      return this.getById(id);
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Delete user
   */
  async delete(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Get active users only
   */
  async getActive() {
    try {
      const q = query(
        this.getCollectionRef(),
        where('active', '==', true),
        orderBy('name', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.(),
        updatedAt: doc.data().updatedAt?.toDate?.(),
      }));
    } catch (error) {
      console.error('Error getting active users:', error);
      throw error;
    }
  }

  /**
   * Get users by role
   */
  async getByRole(role) {
    try {
      const q = query(
        this.getCollectionRef(),
        where('role', '==', role),
        orderBy('name', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.(),
        updatedAt: doc.data().updatedAt?.toDate?.(),
      }));
    } catch (error) {
      console.error('Error getting users by role:', error);
      throw error;
    }
  }

  /**
   * Toggle user active status
   */
  async toggleActive(id) {
    try {
      const user = await this.getById(id);
      return this.update(id, { active: !user.active });
    } catch (error) {
      console.error('Error toggling user active status:', error);
      throw error;
    }
  }

  /**
   * Check if username exists
   */
  async usernameExists(username, excludeId = null) {
    try {
      const q = query(
        this.getCollectionRef(),
        where('username', '==', username)
      );
      const snapshot = await getDocs(q);
      
      if (excludeId) {
        // Exclude the current user when checking (for updates)
        return snapshot.docs.some(doc => doc.id !== excludeId);
      }
      
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking username:', error);
      throw error;
    }
  }
}

export default FirestoreUserService;
