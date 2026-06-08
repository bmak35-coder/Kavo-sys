/**
 * Firebase Firestore Menu Service
 * Handles all menu-related operations with tenant isolation
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

export class FirestoreMenuService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'menuItems';
  }

  /**
   * Get collection reference for this tenant
   */
  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  /**
   * Get all menu items for this tenant
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
      console.error('Error getting menu items:', error);
      throw error;
    }
  }

  /**
   * Get menu items by category
   */
  async getByCategory(category) {
    try {
      const q = query(
        this.getCollectionRef(),
        where('category', '==', category),
        orderBy('name', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting menu items by category:', error);
      throw error;
    }
  }

  /**
   * Get a single menu item by ID
   */
  async getById(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Menu item not found');
      }
      
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } catch (error) {
      console.error('Error getting menu item:', error);
      throw error;
    }
  }

  /**
   * Create a new menu item
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
      console.error('Error creating menu item:', error);
      throw error;
    }
  }

  /**
   * Update a menu item
   */
  async update(id, updates) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      
      return {
        id,
        ...updates,
      };
    } catch (error) {
      console.error('Error updating menu item:', error);
      throw error;
    }
  }

  /**
   * Delete a menu item
   */
  async delete(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting menu item:', error);
      throw error;
    }
  }

  /**
   * Toggle active status
   */
  async toggleActive(id) {
    try {
      const item = await this.getById(id);
      return await this.update(id, { active: !item.active });
    } catch (error) {
      console.error('Error toggling active status:', error);
      throw error;
    }
  }

  /**
   * Toggle out of stock status
   */
  async toggleOutOfStock(id) {
    try {
      const item = await this.getById(id);
      return await this.update(id, { outOfStock: !item.outOfStock });
    } catch (error) {
      console.error('Error toggling out of stock status:', error);
      throw error;
    }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(id) {
    try {
      const item = await this.getById(id);
      return await this.update(id, { favorite: !item.favorite });
    } catch (error) {
      console.error('Error toggling favorite status:', error);
      throw error;
    }
  }

  /**
   * Get all categories
   */
  async getCategories() {
    try {
      const categoriesRef = collection(db, 'tenants', this.tenantId, 'categories');
      const q = query(categoriesRef, orderBy('sortOrder', 'asc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting categories:', error);
      throw error;
    }
  }

  /**
   * Get a single category by ID
   */
  async getCategoryById(id) {
    try {
      const categoriesRef = collection(db, 'tenants', this.tenantId, 'categories');
      const docRef = doc(categoriesRef, id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Category not found');
      }
      
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } catch (error) {
      console.error('Error getting category:', error);
      throw error;
    }
  }

  /**
   * Create a new category
   */
  async createCategory(categoryData) {
    try {
      const categoriesRef = collection(db, 'tenants', this.tenantId, 'categories');
      const docRef = await addDoc(categoriesRef, {
        ...categoryData,
        tenantId: this.tenantId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      return {
        id: docRef.id,
        ...categoryData,
      };
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  /**
   * Update a category
   */
  async updateCategory(id, updates) {
    try {
      const categoriesRef = collection(db, 'tenants', this.tenantId, 'categories');
      const docRef = doc(categoriesRef, id);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      
      return {
        id,
        ...updates,
      };
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  /**
   * Delete a category
   */
  async deleteCategory(id) {
    try {
      const categoriesRef = collection(db, 'tenants', this.tenantId, 'categories');
      const docRef = doc(categoriesRef, id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }

  /**
   * Save category (create or update)
   */
  async saveCategory(category) {
    try {
      if (category.id) {
        // Update existing
        const { id, ...updates } = category;
        return await this.updateCategory(id, updates);
      } else {
        // Create new with generated ID
        const newCategory = {
          ...category,
          id: category.id || `cat_${Date.now()}`,
        };
        const categoriesRef = collection(db, 'tenants', this.tenantId, 'categories');
        const docRef = doc(categoriesRef, newCategory.id);
        await updateDoc(docRef, {
          ...newCategory,
          tenantId: this.tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return newCategory;
      }
    } catch (error) {
      // If document doesn't exist, create it
      try {
        const newCategory = {
          ...category,
          id: category.id || `cat_${Date.now()}`,
        };
        const categoriesRef = collection(db, 'tenants', this.tenantId, 'categories');
        const docRef = doc(categoriesRef, newCategory.id);
        const docData = {
          ...newCategory,
          tenantId: this.tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        // Use setDoc for documents with custom IDs
        const { setDoc } = await import('firebase/firestore');
        await setDoc(docRef, docData);
        return newCategory;
      } catch (innerError) {
        console.error('Error saving category:', innerError);
        throw innerError;
      }
    }
  }

  /**
   * Get all modifier groups
   */
  async getModifierGroups() {
    try {
      const modGroupsRef = collection(db, 'tenants', this.tenantId, 'modifierGroups');
      const snapshot = await getDocs(modGroupsRef);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting modifier groups:', error);
      throw error;
    }
  }

  /**
   * Save modifier group (create or update)
   */
  async saveModifierGroup(group) {
    try {
      const modGroupsRef = collection(db, 'tenants', this.tenantId, 'modifierGroups');
      const groupId = group.id || `mg_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
      const docRef = doc(modGroupsRef, groupId);
      
      const docData = {
        ...group,
        id: groupId,
        tenantId: this.tenantId,
        updatedAt: serverTimestamp(),
        createdAt: group.createdAt || serverTimestamp(),
      };
      
      const { setDoc } = await import('firebase/firestore');
      await setDoc(docRef, docData);
      return { ...docData, id: groupId };
    } catch (error) {
      console.error('Error saving modifier group:', error);
      throw error;
    }
  }

  /**
   * Delete modifier group
   */
  async deleteModifierGroup(id) {
    try {
      const modGroupsRef = collection(db, 'tenants', this.tenantId, 'modifierGroups');
      const docRef = doc(modGroupsRef, id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting modifier group:', error);
      throw error;
    }
  }

  /**
   * Save menu item (create or update) - enhanced version
   */
  async save(item) {
    try {
      const itemId = item.id || `m_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
      const docRef = doc(this.getCollectionRef(), itemId);
      
      const docData = {
        ...item,
        id: itemId,
        tenantId: this.tenantId,
        active: item.active !== undefined ? item.active : true,
        outOfStock: !!item.outOfStock,
        favorite: !!item.favorite,
        updatedAt: serverTimestamp(),
        createdAt: item.createdAt || serverTimestamp(),
      };
      
      const { setDoc } = await import('firebase/firestore');
      await setDoc(docRef, docData);
      return { ...docData, id: itemId };
    } catch (error) {
      console.error('Error saving menu item:', error);
      throw error;
    }
  }

  /**
   * Search menu items by name
   */
  async search(searchTerm) {
    try {
      const items = await this.getAll();
      const term = searchTerm.toLowerCase();
      return items.filter(item => 
        item.name?.toLowerCase().includes(term) ||
        item.category?.toLowerCase().includes(term)
      );
    } catch (error) {
      console.error('Error searching menu items:', error);
      throw error;
    }
  }

  /**
   * Bulk update menu items
   */
  async bulkUpdate(updates) {
    try {
      const promises = updates.map(({ id, ...data }) => 
        this.update(id, data)
      );
      return await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk updating menu items:', error);
      throw error;
    }
  }
}

export default FirestoreMenuService;
