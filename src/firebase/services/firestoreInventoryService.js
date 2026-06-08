/**
 * Firebase Firestore Inventory Service
 * Handles inventory management with tenant isolation
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
  increment,
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

export class FirestoreInventoryService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'inventory';
    this.logsCollectionName = 'stockLogs';
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  getLogsCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.logsCollectionName);
  }

  /**
   * Get all inventory items
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
      }));
    } catch (error) {
      console.error('Error getting inventory items:', error);
      throw error;
    }
  }

  /**
   * Get inventory item by ID
   */
  async getById(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Inventory item not found');
      }
      
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } catch (error) {
      console.error('Error getting inventory item:', error);
      throw error;
    }
  }

  /**
   * Create inventory item
   */
  async create(itemData) {
    try {
      const docRef = await addDoc(this.getCollectionRef(), {
        ...itemData,
        tenantId: this.tenantId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      return {
        id: docRef.id,
        ...itemData,
      };
    } catch (error) {
      console.error('Error creating inventory item:', error);
      throw error;
    }
  }

  /**
   * Update inventory item
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
      console.error('Error updating inventory item:', error);
      throw error;
    }
  }

  /**
   * Delete inventory item
   */
  async delete(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      throw error;
    }
  }

  /**
   * Update stock quantity
   */
  async updateStock(id, quantity) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await updateDoc(docRef, {
        quantity: increment(quantity),
        updatedAt: serverTimestamp(),
      });
      
      return { id, quantity };
    } catch (error) {
      console.error('Error updating stock:', error);
      throw error;
    }
  }

  /**
   * Get inventory item by ID (alias for getById)
   */
  async getOne(id) {
    return this.getById(id);
  }

  /**
   * Save (create or update) inventory item - matches IndexedDB API
   */
  async save(item) {
    try {
      const toSave = {
        ...item,
        currentStock: safeNum(item.currentStock),
        minStock: safeNum(item.minStock),
        costPrice: safeNum(item.costPrice),
        tenantId: this.tenantId,
      };

      if (item.id) {
        // Update existing
        const docRef = doc(this.getCollectionRef(), item.id);
        await updateDoc(docRef, {
          ...toSave,
          updatedAt: serverTimestamp(),
        });
        return { ...toSave, id: item.id };
      } else {
        // Create new
        const { id, ...dataWithoutId } = toSave;
        const docRef = await addDoc(this.getCollectionRef(), {
          ...dataWithoutId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return { ...toSave, id: docRef.id };
      }
    } catch (error) {
      console.error('Error saving inventory item:', error);
      throw error;
    }
  }

  /**
   * Add stock with logging
   */
  async addStock(id, qty, note = "", userId = "system") {
    try {
      const item = await this.getById(id);
      const before = safeNum(item.currentStock);
      const after = before + safeNum(qty);

      // Update inventory
      await updateDoc(doc(this.getCollectionRef(), id), {
        currentStock: after,
        updatedAt: serverTimestamp(),
      });

      // Create log
      await addDoc(this.getLogsCollectionRef(), {
        itemId: id,
        itemName: item.name,
        type: LOG_TYPES.ADD,
        qty: safeNum(qty),
        before,
        after,
        note,
        userId,
        tenantId: this.tenantId,
        createdAt: serverTimestamp(),
      });

      return { ...item, currentStock: after };
    } catch (error) {
      console.error('Error adding stock:', error);
      throw error;
    }
  }

  /**
   * Adjust stock to exact quantity with logging
   */
  async adjustStock(id, newQty, note = "", userId = "system") {
    try {
      const item = await this.getById(id);
      const before = safeNum(item.currentStock);
      const after = safeNum(newQty);
      const diff = after - before;

      // Update inventory
      await updateDoc(doc(this.getCollectionRef(), id), {
        currentStock: after,
        updatedAt: serverTimestamp(),
      });

      // Create log
      await addDoc(this.getLogsCollectionRef(), {
        itemId: id,
        itemName: item.name,
        type: LOG_TYPES.ADJUST,
        qty: diff,
        before,
        after,
        note,
        userId,
        tenantId: this.tenantId,
        createdAt: serverTimestamp(),
      });

      return { ...item, currentStock: after };
    } catch (error) {
      console.error('Error adjusting stock:', error);
      throw error;
    }
  }

  /**
   * Log waste and reduce stock
   */
  async logWaste(id, qty, note = "", userId = "system") {
    try {
      const item = await this.getById(id);
      const before = safeNum(item.currentStock);
      const after = Math.max(0, before - safeNum(qty));

      // Update inventory
      await updateDoc(doc(this.getCollectionRef(), id), {
        currentStock: after,
        updatedAt: serverTimestamp(),
      });

      // Create log
      await addDoc(this.getLogsCollectionRef(), {
        itemId: id,
        itemName: item.name,
        type: LOG_TYPES.WASTE,
        qty: safeNum(qty),
        before,
        after,
        note,
        userId,
        tenantId: this.tenantId,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error logging waste:', error);
      throw error;
    }
  }

  /**
   * Receive stock from purchase order
   */
  async receiveStock(id, qty, unitCost, poId, poNo, userId = "system") {
    try {
      const item = await this.getById(id);
      const before = safeNum(item.currentStock);
      const after = before + safeNum(qty);
      const oldCost = safeNum(item.costPrice);
      const newUnitCost = safeNum(unitCost);

      // Weighted average cost
      const avgCost = after > 0
        ? (before * oldCost + safeNum(qty) * newUnitCost) / after
        : newUnitCost;

      // Update inventory
      await updateDoc(doc(this.getCollectionRef(), id), {
        currentStock: after,
        costPrice: parseFloat(avgCost.toFixed(4)),
        lastPurchaseCost: newUnitCost,
        lastPurchaseDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Create log
      await addDoc(this.getLogsCollectionRef(), {
        itemId: id,
        itemName: item.name,
        type: LOG_TYPES.PURCHASE,
        qty: safeNum(qty),
        before,
        after,
        unitCost: newUnitCost,
        note: `PO: ${poNo}`,
        poId,
        userId,
        tenantId: this.tenantId,
        createdAt: serverTimestamp(),
      });

      return { ...item, currentStock: after, costPrice: avgCost };
    } catch (error) {
      console.error('Error receiving stock:', error);
      throw error;
    }
  }

  /**
   * Deduct stock for order (with recipe support)
   */
  async deductForOrder(orderItems, orderId, preventNegative = false) {
    try {
      const results = [];
      const recipesRef = collection(db, 'tenants', this.tenantId, 'recipes');

      for (const cartItem of safeArr(orderItems)) {
        try {
          const recipeDoc = await getDoc(doc(recipesRef, cartItem.id));
          if (!recipeDoc.exists()) continue;

          const recipe = recipeDoc.data();
          if (!Array.isArray(recipe.ingredients)) continue;

          for (const ing of recipe.ingredients) {
            try {
              const invItem = await this.getById(ing.inventoryItemId);
              if (!invItem) continue;

              const needed = safeNum(ing.qty) * safeNum(cartItem.qty);
              const before = safeNum(invItem.currentStock);
              let after = before - needed;

              if (preventNegative && after < 0) {
                results.push({
                  id: ing.inventoryItemId,
                  name: invItem.name,
                  blocked: true,
                  needed,
                  available: before
                });
                continue;
              }

              after = Math.max(0, after);

              // Update inventory
              await updateDoc(doc(this.getCollectionRef(), ing.inventoryItemId), {
                currentStock: after,
                updatedAt: serverTimestamp(),
              });

              // Create log
              await addDoc(this.getLogsCollectionRef(), {
                itemId: ing.inventoryItemId,
                itemName: invItem.name,
                type: LOG_TYPES.DEDUCT,
                qty: needed,
                before,
                after,
                note: `Order ${orderId}`,
                orderId,
                userId: "pos",
                tenantId: this.tenantId,
                createdAt: serverTimestamp(),
              });

              results.push({
                id: ing.inventoryItemId,
                name: invItem.name,
                needed,
                before,
                after,
                blocked: false
              });
            } catch (err) {
              console.warn('Error processing ingredient:', ing.inventoryItemId, err);
            }
          }
        } catch (err) {
          console.warn('Error processing cart item:', cartItem.id, err);
        }
      }

      return results;
    } catch (error) {
      console.error('Error deducting for order:', error);
      return [];
    }
  }

  /**
   * Check availability for cart items
   */
  async checkAvailability(cartItems) {
    try {
      const issues = [];
      const recipesRef = collection(db, 'tenants', this.tenantId, 'recipes');

      for (const cartItem of safeArr(cartItems)) {
        try {
          const recipeDoc = await getDoc(doc(recipesRef, cartItem.id));
          if (!recipeDoc.exists() || !recipeDoc.data().ingredients?.length) continue;

          const recipe = recipeDoc.data();

          for (const ing of safeArr(recipe.ingredients)) {
            try {
              const invItem = await this.getById(ing.inventoryItemId);
              if (!invItem) continue;

              const needed = safeNum(ing.qty) * safeNum(cartItem.qty);
              const available = safeNum(invItem.currentStock);

              if (available < needed) {
                issues.push({
                  menuItem: cartItem.name || "Unknown item",
                  ingredient: invItem.name || "Unknown ingredient",
                  needed,
                  available,
                  unit: ing.unit || "",
                  critical: available <= 0,
                });
              }
            } catch (err) {
              console.warn('Error checking ingredient:', ing.inventoryItemId, err);
            }
          }
        } catch (err) {
          console.warn('Error checking cart item:', cartItem.id, err);
        }
      }

      return issues;
    } catch (error) {
      console.warn('[Firebase Inventory] checkAvailability failed silently:', error?.message);
      return [];
    }
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    try {
      const all = await this.getAll();
      const low = all.filter(i => safeNum(i.currentStock) > 0 && safeNum(i.currentStock) <= safeNum(i.minStock));
      const out = all.filter(i => safeNum(i.currentStock) <= 0);
      const totalValue = all.reduce((s, i) => s + safeNum(i.currentStock) * safeNum(i.costPrice), 0);

      return {
        total: all.length,
        low: low.length,
        out: out.length,
        totalValue,
        items: all
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Get low stock items
   */
  async getLowStockItems() {
    try {
      const all = await this.getAll();
      return all.filter(i => safeNum(i.currentStock) <= safeNum(i.minStock) && safeNum(i.minStock) > 0);
    } catch (error) {
      console.error('Error getting low stock items:', error);
      throw error;
    }
  }

  /**
   * Get out of stock items
   */
  async getOutOfStockItems() {
    try {
      const all = await this.getAll();
      return all.filter(i => safeNum(i.currentStock) <= 0);
    } catch (error) {
      console.error('Error getting out of stock items:', error);
      throw error;
    }
  }

  /**
   * Get items by category
   */
  async getByCategory(category) {
    try {
      const all = await this.getAll();
      return all.filter(i => i.category === category);
    } catch (error) {
      console.error('Error getting items by category:', error);
      throw error;
    }
  }

  /**
   * Bulk import items
   */
  async bulkImport(items) {
    try {
      if (!Array.isArray(items) || !items.length) return;

      const promises = items.map(item => this.save(item));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk importing items:', error);
      throw error;
    }
  }
}

export default FirestoreInventoryService;
