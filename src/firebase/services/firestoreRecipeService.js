/**
 * Firebase Firestore Recipe Service
 * Handles menu item recipes with tenant isolation
 */

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config';

const safeNum = (v) => { const n = +v; return isFinite(n) ? n : 0; };
const safeArr = (v, d = []) => Array.isArray(v) ? v : d;

export class FirestoreRecipeService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'recipes';
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  /**
   * Get recipe for a menu item
   */
  async get(menuItemId) {
    try {
      const docRef = doc(this.getCollectionRef(), menuItemId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return { menuItemId, ingredients: [] };
      }
      
      return {
        menuItemId,
        ...docSnap.data(),
      };
    } catch (error) {
      console.error('Error getting recipe:', error);
      return { menuItemId, ingredients: [] };
    }
  }

  /**
   * Get all recipes
   */
  async getAll() {
    try {
      const snapshot = await getDocs(this.getCollectionRef());
      return snapshot.docs.map(doc => ({
        menuItemId: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting all recipes:', error);
      return [];
    }
  }

  /**
   * Save/update a recipe
   */
  async save(menuItemId, ingredients) {
    try {
      const recipe = {
        menuItemId,
        ingredients: safeArr(ingredients),
        tenantId: this.tenantId,
        updatedAt: serverTimestamp(),
      };

      const docRef = doc(this.getCollectionRef(), menuItemId);
      await setDoc(docRef, recipe, { merge: true });

      return recipe;
    } catch (error) {
      console.error('Error saving recipe:', error);
      throw error;
    }
  }

  /**
   * Delete a recipe
   */
  async delete(menuItemId) {
    try {
      const docRef = doc(this.getCollectionRef(), menuItemId);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting recipe:', error);
      throw error;
    }
  }

  /**
   * Check if all ingredients for cart items are available
   */
  async checkAvailability(cartItems) {
    try {
      const issues = [];
      // Import inventory service dynamically to avoid circular dependency
      const { FirestoreInventoryService } = await import('./firestoreInventoryService.js');
      const inventoryService = new FirestoreInventoryService(this.tenantId);

      for (const cartItem of safeArr(cartItems)) {
        const recipe = await this.get(cartItem.id);
        
        for (const ing of safeArr(recipe.ingredients)) {
          try {
            const invItem = await inventoryService.getById(ing.inventoryItemId);
            if (!invItem) continue;

            const needed = safeNum(ing.qty) * safeNum(cartItem.qty);
            const available = safeNum(invItem.currentStock);

            if (available < needed) {
              issues.push({
                menuItem: cartItem.name,
                ingredient: invItem.name,
                needed,
                available,
                unit: ing.unit,
                critical: available <= 0,
              });
            }
          } catch (err) {
            console.warn('Error checking ingredient:', ing.inventoryItemId, err);
          }
        }
      }

      return issues;
    } catch (error) {
      console.error('Error checking availability:', error);
      return [];
    }
  }

  /**
   * Restore inventory for a voided order
   */
  async restoreForOrder(orderItems, orderId, cashier) {
    try {
      const results = [];
      // Import inventory service dynamically
      const { FirestoreInventoryService } = await import('./firestoreInventoryService.js');
      const inventoryService = new FirestoreInventoryService(this.tenantId);

      for (const cartItem of safeArr(orderItems)) {
        const recipe = await this.get(cartItem.id);
        if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) continue;

        for (const ing of recipe.ingredients) {
          try {
            const invItem = await inventoryService.getById(ing.inventoryItemId);
            if (!invItem) continue;

            const restored = safeNum(ing.qty) * safeNum(cartItem.qty);
            const before = safeNum(invItem.currentStock);
            const after = before + restored;

            // Use adjustStock to restore with logging
            await inventoryService.adjustStock(
              ing.inventoryItemId,
              after,
              `VOID ${orderId}`,
              cashier || "pos"
            );

            results.push({
              id: ing.inventoryItemId,
              name: invItem.name,
              restored,
              before,
              after
            });
          } catch (err) {
            console.warn('Error restoring ingredient:', ing.inventoryItemId, err);
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Error restoring for order:', error);
      return [];
    }
  }
}

export default FirestoreRecipeService;
