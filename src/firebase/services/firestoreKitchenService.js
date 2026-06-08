/**
 * Firebase Firestore Kitchen Service
 * Handles kitchen display and order preparation tracking
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

export class FirestoreKitchenService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'kitchenOrders';
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  /**
   * Send order to kitchen
   */
  async sendToKitchen(orderData) {
    try {
      // Remove any existing 'id' field from orderData to avoid conflicts
      const { id: _, ...dataWithoutId } = orderData;
      
      const docRef = await addDoc(this.getCollectionRef(), {
        ...dataWithoutId,
        tenantId: this.tenantId,
        status: 'pending',
        sentAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      return {
        ...dataWithoutId,
        id: docRef.id,
      };
    } catch (error) {
      console.error('Error sending order to kitchen:', error);
      throw error;
    }
  }

  /**
   * Get all kitchen orders
   */
  async getAll() {
    try {
      const q = query(
        this.getCollectionRef(),
        orderBy('sentAt', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        // Remove any 'id' field from data to avoid conflicts
        const { id: _, ...dataWithoutId } = data;
        return {
          ...dataWithoutId,
          id: doc.id,
        };
      });
    } catch (error) {
      console.error('Error getting kitchen orders:', error);
      throw error;
    }
  }

  /**
   * Get pending orders
   */
  async getPending() {
    try {
      const q = query(
        this.getCollectionRef(),
        where('status', '==', 'pending'),
        orderBy('sentAt', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        const { id: _, ...dataWithoutId } = data;
        return {
          ...dataWithoutId,
          id: doc.id,
        };
      });
    } catch (error) {
      console.error('Error getting pending kitchen orders:', error);
      throw error;
    }
  }

  /**
   * Get orders in preparation
   */
  async getInPreparation() {
    try {
      const q = query(
        this.getCollectionRef(),
        where('status', '==', 'preparing'),
        orderBy('sentAt', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        const { id: _, ...dataWithoutId } = data;
        return {
          ...dataWithoutId,
          id: doc.id,
        };
      });
    } catch (error) {
      console.error('Error getting orders in preparation:', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateStatus(id, status) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      const updateData = {
        status,
        updatedAt: serverTimestamp(),
      };

      if (status === 'preparing') {
        updateData.startedAt = serverTimestamp();
      } else if (status === 'ready') {
        updateData.readyAt = serverTimestamp();
      } else if (status === 'completed') {
        updateData.completedAt = serverTimestamp();
      }

      await updateDoc(docRef, updateData);
      
      return { id, status };
    } catch (error) {
      console.error('Error updating kitchen order status:', error);
      throw error;
    }
  }

  /**
   * Mark order as completed
   */
  async complete(id) {
    return await this.updateStatus(id, 'completed');
  }

  /**
   * Delete kitchen order
   */
  async delete(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting kitchen order:', error);
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
        throw new Error('Kitchen order not found');
      }
      
      const data = docSnap.data();
      const { id: _, ...dataWithoutId } = data;
      
      return {
        ...dataWithoutId,
        id: docSnap.id,
      };
    } catch (error) {
      console.error('Error getting kitchen order:', error);
      throw error;
    }
  }

  /**
   * Check if an order exists by orderNo
   * Returns the existing order if found, null otherwise
   */
  async getByOrderNo(orderNo) {
    try {
      const q = query(
        this.getCollectionRef(),
        where('orderNo', '==', orderNo)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return null;
      }
      
      // Return the first match
      const doc = snapshot.docs[0];
      const data = doc.data();
      const { id: _, ...dataWithoutId } = data;
      
      return {
        ...dataWithoutId,
        id: doc.id,
      };
    } catch (error) {
      console.error('Error checking for existing order:', error);
      throw error;
    }
  }
}

export default FirestoreKitchenService;
