/**
 * Order Service
 * 
 * Handles order management with tenant isolation.
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
  Timestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../config';
import auditService from './auditService';
import productService from './productService';

class OrderService {
  /**
   * Get orders collection reference for a tenant
   */
  getOrdersRef(tenantId) {
    return collection(db, 'tenants', tenantId, 'orders');
  }

  /**
   * Get payments collection reference for a tenant
   */
  getPaymentsRef(tenantId) {
    return collection(db, 'tenants', tenantId, 'payments');
  }

  /**
   * Generate order number
   */
  async generateOrderNumber(tenantId) {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD-${timestamp}-${random}`;
  }

  /**
   * Create a new order
   */
  async createOrder(tenantId, orderData, userId) {
    try {
      const orderNumber = await this.generateOrderNumber(tenantId);

      const newOrder = {
        ...orderData,
        tenantId,
        orderNumber,
        status: 'pending',
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      };

      const docRef = await addDoc(this.getOrdersRef(tenantId), newOrder);

      // Update product stock if tracking inventory
      if (orderData.items && orderData.items.length > 0) {
        await this.updateInventoryForOrder(tenantId, orderData.items, userId, 'sale');
      }

      // Create kitchen order if needed
      if (orderData.type === 'dine-in' || orderData.items.some(item => item.requiresKitchen)) {
        await this.createKitchenOrder(tenantId, docRef.id, orderData, userId);
      }

      // Log audit
      await auditService.log(tenantId, {
        action: 'create',
        entityType: 'order',
        entityId: docRef.id,
        userId,
      });

      return {
        id: docRef.id,
        ...newOrder,
      };
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(tenantId, orderId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'orders', orderId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Order not found');
      }

      return {
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
        updatedAt: docSnap.data().updatedAt?.toDate(),
        completedAt: docSnap.data().completedAt?.toDate(),
      };
    } catch (error) {
      console.error('Error getting order:', error);
      throw error;
    }
  }

  /**
   * Get orders for a tenant
   */
  async getOrders(tenantId, options = {}) {
    try {
      const {
        status,
        type,
        tableId,
        customerId,
        userId,
        startDate,
        endDate,
        pageSize = 50,
        lastDoc = null,
      } = options;

      let q = query(
        this.getOrdersRef(tenantId),
        orderBy('createdAt', 'desc')
      );

      if (status) {
        q = query(q, where('status', '==', status));
      }

      if (type) {
        q = query(q, where('type', '==', type));
      }

      if (tableId) {
        q = query(q, where('tableId', '==', tableId));
      }

      if (customerId) {
        q = query(q, where('customerId', '==', customerId));
      }

      if (userId) {
        q = query(q, where('userId', '==', userId));
      }

      if (startDate) {
        q = query(q, where('createdAt', '>=', Timestamp.fromDate(startDate)));
      }

      if (endDate) {
        q = query(q, where('createdAt', '<=', Timestamp.fromDate(endDate)));
      }

      if (pageSize) {
        q = query(q, limit(pageSize));
      }

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      }));

      return {
        orders,
        lastDoc: snapshot.docs[snapshot.docs.length - 1],
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch (error) {
      console.error('Error getting orders:', error);
      throw error;
    }
  }

  /**
   * Update order
   */
  async updateOrder(tenantId, orderId, updates, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'orders', orderId);
      
      const oldData = await this.getOrderById(tenantId, orderId);

      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      // Log audit
      await auditService.log(tenantId, {
        action: 'update',
        entityType: 'order',
        entityId: orderId,
        userId,
        changes: auditService.getChanges(oldData, updates),
      });

      return await this.getOrderById(tenantId, orderId);
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(tenantId, orderId, status, userId) {
    const updates = { status };
    
    if (status === 'completed') {
      updates.completedAt = serverTimestamp();
    }

    return this.updateOrder(tenantId, orderId, updates, userId);
  }

  /**
   * Cancel order
   */
  async cancelOrder(tenantId, orderId, userId, reason) {
    try {
      const order = await this.getOrderById(tenantId, orderId);

      // Restore inventory
      if (order.items && order.items.length > 0) {
        await this.updateInventoryForOrder(tenantId, order.items, userId, 'return');
      }

      await this.updateOrder(
        tenantId,
        orderId,
        {
          status: 'cancelled',
          cancelReason: reason,
          cancelledAt: serverTimestamp(),
          cancelledBy: userId,
        },
        userId
      );
    } catch (error) {
      console.error('Error cancelling order:', error);
      throw error;
    }
  }

  /**
   * Delete order (admin only)
   */
  async deleteOrder(tenantId, orderId, userId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'orders', orderId);
      await deleteDoc(docRef);

      await auditService.log(tenantId, {
        action: 'delete',
        entityType: 'order',
        entityId: orderId,
        userId,
      });
    } catch (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  }

  /**
   * Add payment to order
   */
  async addPayment(tenantId, orderId, paymentData, userId) {
    try {
      const payment = {
        ...paymentData,
        tenantId,
        orderId,
        userId,
        status: 'completed',
        createdAt: serverTimestamp(),
        createdBy: userId,
      };

      const paymentRef = await addDoc(this.getPaymentsRef(tenantId), payment);

      // Update order with payment
      const order = await this.getOrderById(tenantId, orderId);
      const payments = [...(order.payments || []), { id: paymentRef.id, ...payment }];
      
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const isPaid = totalPaid >= order.total;

      await this.updateOrder(
        tenantId,
        orderId,
        {
          payments,
          status: isPaid ? 'completed' : order.status,
          completedAt: isPaid ? serverTimestamp() : order.completedAt,
        },
        userId
      );

      await auditService.log(tenantId, {
        action: 'create',
        entityType: 'payment',
        entityId: paymentRef.id,
        userId,
        metadata: { orderId, amount: paymentData.amount },
      });

      return {
        id: paymentRef.id,
        ...payment,
      };
    } catch (error) {
      console.error('Error adding payment:', error);
      throw error;
    }
  }

  /**
   * Update inventory for order items
   */
  async updateInventoryForOrder(tenantId, items, userId, type) {
    try {
      const batch = writeBatch(db);

      for (const item of items) {
        const product = await productService.getProductById(tenantId, item.productId);
        
        if (product.trackInventory) {
          const productRef = doc(db, 'tenants', tenantId, 'products', item.productId);
          const stockChange = type === 'sale' ? -item.quantity : item.quantity;
          
          batch.update(productRef, {
            stock: increment(stockChange),
            updatedAt: serverTimestamp(),
          });

          // Create inventory transaction
          const transactionRef = doc(collection(db, 'tenants', tenantId, 'inventoryTransactions'));
          batch.set(transactionRef, {
            tenantId,
            productId: item.productId,
            type,
            quantity: Math.abs(stockChange),
            userId,
            createdAt: serverTimestamp(),
            createdBy: userId,
          });
        }
      }

      await batch.commit();
    } catch (error) {
      console.error('Error updating inventory:', error);
      // Don't throw - inventory updates shouldn't block order creation
    }
  }

  /**
   * Create kitchen order
   */
  async createKitchenOrder(tenantId, orderId, orderData, userId) {
    try {
      const kitchenOrderRef = collection(db, 'tenants', tenantId, 'kitchenOrders');
      
      await addDoc(kitchenOrderRef, {
        tenantId,
        orderId,
        orderNumber: orderData.orderNumber,
        tableNumber: orderData.tableId,
        items: orderData.items.map(item => ({
          id: item.id,
          productName: item.productName,
          quantity: item.quantity,
          modifiers: item.modifiers?.map(m => m.name) || [],
          notes: item.notes,
          status: 'pending',
        })),
        status: 'pending',
        priority: 1,
        notes: orderData.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      });
    } catch (error) {
      console.error('Error creating kitchen order:', error);
    }
  }

  /**
   * Get sales summary
   */
  async getSalesSummary(tenantId, startDate, endDate) {
    try {
      const { orders } = await this.getOrders(tenantId, {
        status: 'completed',
        startDate,
        endDate,
        pageSize: 10000,
      });

      const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
      const totalOrders = orders.length;
      const totalTax = orders.reduce((sum, order) => sum + (order.tax || 0), 0);
      const totalDiscount = orders.reduce((sum, order) => sum + (order.discount || 0), 0);
      const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

      return {
        totalSales,
        totalOrders,
        totalTax,
        totalDiscount,
        averageOrderValue,
      };
    } catch (error) {
      console.error('Error getting sales summary:', error);
      throw error;
    }
  }
}

export default new OrderService();
