/**
 * Product Service
 * 
 * Handles product and category management with tenant isolation.
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
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config';
import auditService from './auditService';

class ProductService {
  /**
   * Get products collection reference for a tenant
   */
  getProductsRef(tenantId) {
    return collection(db, 'tenants', tenantId, 'products');
  }

  /**
   * Get categories collection reference for a tenant
   */
  getCategoriesRef(tenantId) {
    return collection(db, 'tenants', tenantId, 'categories');
  }

  // ==================== PRODUCT OPERATIONS ====================

  /**
   * Create a new product
   */
  async createProduct(tenantId, productData, userId) {
    try {
      const newProduct = {
        ...productData,
        tenantId,
        active: productData.active !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      };

      const docRef = await addDoc(this.getProductsRef(tenantId), newProduct);

      // Log audit
      await auditService.log(tenantId, {
        action: 'create',
        entityType: 'product',
        entityId: docRef.id,
        userId,
      });

      return {
        id: docRef.id,
        ...newProduct,
      };
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  }

  /**
   * Get product by ID
   */
  async getProductById(tenantId, productId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'products', productId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Product not found');
      }

      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } catch (error) {
      console.error('Error getting product:', error);
      throw error;
    }
  }

  /**
   * Get all products for a tenant
   */
  async getProducts(tenantId, options = {}) {
    try {
      const {
        categoryId,
        active,
        searchTerm,
        pageSize = 50,
        lastDoc = null,
      } = options;

      let q = query(this.getProductsRef(tenantId), orderBy('name'));

      if (categoryId) {
        q = query(q, where('categoryId', '==', categoryId));
      }

      if (active !== undefined) {
        q = query(q, where('active', '==', active));
      }

      if (pageSize) {
        q = query(q, limit(pageSize));
      }

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      let products = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Client-side search filter (for simple searches)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        products = products.filter(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            p.sku?.toLowerCase().includes(term) ||
            p.barcode?.toLowerCase().includes(term)
        );
      }

      return {
        products,
        lastDoc: snapshot.docs[snapshot.docs.length - 1],
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch (error) {
      console.error('Error getting products:', error);
      throw error;
    }
  }

  /**
   * Update product
   */
  async updateProduct(tenantId, productId, updates, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'products', productId);
      
      // Get old data for audit
      const oldData = await this.getProductById(tenantId, productId);

      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      // Log audit with changes
      await auditService.log(tenantId, {
        action: 'update',
        entityType: 'product',
        entityId: productId,
        userId,
        changes: auditService.getChanges(oldData, updates),
      });

      return await this.getProductById(tenantId, productId);
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  /**
   * Delete product
   */
  async deleteProduct(tenantId, productId, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'products', productId);
      await deleteDoc(docRef);

      // Log audit
      await auditService.log(tenantId, {
        action: 'delete',
        entityType: 'product',
        entityId: productId,
        userId,
      });
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }

  /**
   * Update product stock
   */
  async updateStock(tenantId, productId, quantity, userId) {
    try {
      const product = await this.getProductById(tenantId, productId);
      
      if (!product.trackInventory) {
        throw new Error('Product does not track inventory');
      }

      const newStock = (product.stock || 0) + quantity;

      await this.updateProduct(
        tenantId,
        productId,
        { stock: newStock },
        userId
      );

      return newStock;
    } catch (error) {
      console.error('Error updating stock:', error);
      throw error;
    }
  }

  // ==================== CATEGORY OPERATIONS ====================

  /**
   * Create a new category
   */
  async createCategory(tenantId, categoryData, userId) {
    try {
      const newCategory = {
        ...categoryData,
        tenantId,
        active: categoryData.active !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      };

      const docRef = await addDoc(this.getCategoriesRef(tenantId), newCategory);

      await auditService.log(tenantId, {
        action: 'create',
        entityType: 'category',
        entityId: docRef.id,
        userId,
      });

      return {
        id: docRef.id,
        ...newCategory,
      };
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  /**
   * Get all categories for a tenant
   */
  async getCategories(tenantId, activeOnly = false) {
    try {
      let q = query(
        this.getCategoriesRef(tenantId),
        orderBy('sortOrder')
      );

      if (activeOnly) {
        q = query(q, where('active', '==', true));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error('Error getting categories:', error);
      throw error;
    }
  }

  /**
   * Update category
   */
  async updateCategory(tenantId, categoryId, updates, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'categories', categoryId);
      
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      await auditService.log(tenantId, {
        action: 'update',
        entityType: 'category',
        entityId: categoryId,
        userId,
      });
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  /**
   * Delete category
   */
  async deleteCategory(tenantId, categoryId, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'categories', categoryId);
      await deleteDoc(docRef);

      await auditService.log(tenantId, {
        action: 'delete',
        entityType: 'category',
        entityId: categoryId,
        userId,
      });
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }

  /**
   * Bulk update products
   */
  async bulkUpdateProducts(tenantId, updates, userId) {
    try {
      const batch = writeBatch(db);

      updates.forEach(({ productId, data }) => {
        const docRef = doc(db, 'tenants', tenantId, 'products', productId);
        batch.update(docRef, {
          ...data,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();

      await auditService.log(tenantId, {
        action: 'update',
        entityType: 'product',
        entityId: 'bulk',
        userId,
        metadata: { count: updates.length },
      });
    } catch (error) {
      console.error('Error bulk updating products:', error);
      throw error;
    }
  }
}

export default new ProductService();
