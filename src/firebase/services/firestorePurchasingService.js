/**
 * Firebase Firestore Purchasing Service
 * Handles suppliers and purchase orders with tenant isolation
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
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../config';

const safeArr = (v, d = []) => Array.isArray(v) ? v : d;
const safeNum = (v) => { const n = +v; return isFinite(n) ? n : 0; };

export const PO_STATUSES = ["Draft", "Ordered", "Received", "Cancelled"];
export const PO_STATUS_CFG = {
  Draft:     { color:"#7d8fa0", bg:"#7d8fa018", icon:"📝" },
  Ordered:   { color:"#58a6ff", bg:"#58a6ff18", icon:"📦" },
  Received:  { color:"#3fb950", bg:"#3fb95018", icon:"✅" },
  Cancelled: { color:"#f85149", bg:"#f8514918", icon:"🚫" },
};

/**
 * Generate PO number: PO-YYYYMMDD-NNN
 */
async function genPoNumber(tenantId) {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `PO-${today}-`;
    
    const posRef = collection(db, 'tenants', tenantId, 'purchaseOrders');
    const q = query(posRef, orderBy('poNo', 'desc'));
    const snapshot = await getDocs(q);
    
    let maxSeq = 0;
    snapshot.docs.forEach(doc => {
      const poNo = doc.data().poNo;
      if (poNo && poNo.startsWith(prefix)) {
        const seq = parseInt(poNo.slice(-3)) || 0;
        maxSeq = Math.max(maxSeq, seq);
      }
    });
    
    return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
  } catch (error) {
    console.error('Error generating PO number:', error);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `PO-${today}-001`;
  }
}

// ══════════════════════════════════════════════════════
//   SUPPLIER SERVICE
// ══════════════════════════════════════════════════════
export class FirestoreSupplierService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'suppliers';
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  /**
   * Get all suppliers
   */
  async getAll() {
    try {
      const q = query(this.getCollectionRef(), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
        updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt,
      }));
    } catch (error) {
      console.error('Error getting suppliers:', error);
      return [];
    }
  }

  /**
   * Get active suppliers only
   */
  async getActive() {
    try {
      const all = await this.getAll();
      return all.filter(s => s.status !== 'inactive');
    } catch (error) {
      console.error('Error getting active suppliers:', error);
      return [];
    }
  }

  /**
   * Get supplier by ID
   */
  async getOne(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return null;
      }
      
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      };
    } catch (error) {
      console.error('Error getting supplier:', error);
      return null;
    }
  }

  /**
   * Save (create or update) supplier
   */
  async save(supplier) {
    try {
      const toSave = {
        ...supplier,
        status: supplier.status || 'active',
        tenantId: this.tenantId,
      };

      if (supplier.id) {
        // Update existing
        const docRef = doc(this.getCollectionRef(), supplier.id);
        await updateDoc(docRef, {
          ...toSave,
          updatedAt: serverTimestamp(),
        });
        return { ...toSave, id: supplier.id };
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
      console.error('Error saving supplier:', error);
      throw error;
    }
  }

  /**
   * Soft delete (mark inactive)
   */
  async delete(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await updateDoc(docRef, {
        status: 'inactive',
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error('Error deleting supplier:', error);
      throw error;
    }
  }

  /**
   * Hard delete
   */
  async hardDelete(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error hard deleting supplier:', error);
      throw error;
    }
  }

  /**
   * Get supplier statistics
   */
  async getStats(supplierId) {
    try {
      const posRef = collection(db, 'tenants', this.tenantId, 'purchaseOrders');
      const q = query(posRef, where('supplierId', '==', supplierId));
      const snapshot = await getDocs(q);
      
      const pos = snapshot.docs.map(doc => doc.data());
      const received = pos.filter(p => p.status === 'Received');
      const totalSpend = received.reduce((s, p) => s + safeNum(p.total), 0);
      
      const lastOrder = pos.length
        ? pos.sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || ''))[0]
        : null;
      
      return {
        totalOrders: pos.length,
        receivedOrders: received.length,
        totalSpend,
        lastOrderDate: lastOrder?.orderDate || null,
      };
    } catch (error) {
      console.error('Error getting supplier stats:', error);
      return {
        totalOrders: 0,
        receivedOrders: 0,
        totalSpend: 0,
        lastOrderDate: null,
      };
    }
  }

  /**
   * Bulk import suppliers
   */
  async bulkImport(suppliers) {
    try {
      if (!Array.isArray(suppliers) || !suppliers.length) return;
      
      const batch = writeBatch(db);
      suppliers.forEach(supplier => {
        const docRef = supplier.id
          ? doc(this.getCollectionRef(), supplier.id)
          : doc(this.getCollectionRef());
        
        batch.set(docRef, {
          ...supplier,
          tenantId: this.tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error bulk importing suppliers:', error);
      throw error;
    }
  }
}

// ══════════════════════════════════════════════════════
//   PURCHASE ORDER SERVICE
// ══════════════════════════════════════════════════════
export class FirestorePurchaseOrderService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
    this.collectionName = 'purchaseOrders';
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, this.collectionName);
  }

  /**
   * Get all purchase orders
   */
  async getAll() {
    try {
      const q = query(this.getCollectionRef(), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          receivedAt: data.receivedAt?.toDate?.()?.toISOString() || data.receivedAt,
        };
      });
    } catch (error) {
      console.error('Error getting purchase orders:', error);
      return [];
    }
  }

  /**
   * Get purchase order by ID with items
   */
  async getOne(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return null;
      }
      
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        items: safeArr(data.items),
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        receivedAt: data.receivedAt?.toDate?.()?.toISOString() || data.receivedAt,
      };
    } catch (error) {
      console.error('Error getting purchase order:', error);
      return null;
    }
  }

  /**
   * Get POs by supplier
   */
  async getBySupplier(supplierId) {
    try {
      const q = query(
        this.getCollectionRef(),
        where('supplierId', '==', supplierId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        };
      });
    } catch (error) {
      console.error('Error getting POs by supplier:', error);
      return [];
    }
  }

  /**
   * Get POs by status
   */
  async getByStatus(status) {
    try {
      const q = query(
        this.getCollectionRef(),
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        };
      });
    } catch (error) {
      console.error('Error getting POs by status:', error);
      return [];
    }
  }

  /**
   * Create new purchase order
   */
  async create(poData) {
    try {
      const poNo = await genPoNumber(this.tenantId);
      const items = safeArr(poData.items);
      const total = items.reduce(
        (s, i) => s + safeNum(i.qty) * safeNum(i.unitCost), 0
      );

      const po = {
        poNo,
        supplierId: poData.supplierId || '',
        supplierName: poData.supplierName || '',
        status: 'Draft',
        orderDate: poData.orderDate || new Date().toISOString().slice(0, 10),
        deliveryDate: poData.deliveryDate || '',
        notes: poData.notes || '',
        total,
        items: items.map(i => ({
          inventoryItemId: i.inventoryItemId,
          inventoryItemName: i.inventoryItemName || '',
          unit: i.unit || 'piece',
          qty: safeNum(i.qty),
          unitCost: safeNum(i.unitCost),
          total: safeNum(i.qty) * safeNum(i.unitCost),
          receivedQty: 0,
        })),
        tenantId: this.tenantId,
        createdBy: poData.createdBy || 'admin',
        receivedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(this.getCollectionRef(), po);
      return { ...po, id: docRef.id };
    } catch (error) {
      console.error('Error creating purchase order:', error);
      throw error;
    }
  }

  /**
   * Update purchase order
   */
  async update(id, changes) {
    try {
      const updates = { ...changes };
      
      // Recalculate total if items changed
      if (changes.items) {
        const total = safeArr(changes.items).reduce(
          (s, i) => s + safeNum(i.qty) * safeNum(i.unitCost), 0
        );
        updates.total = total;
        updates.items = safeArr(changes.items).map(i => ({
          inventoryItemId: i.inventoryItemId,
          inventoryItemName: i.inventoryItemName || '',
          unit: i.unit || 'piece',
          qty: safeNum(i.qty),
          unitCost: safeNum(i.unitCost),
          total: safeNum(i.qty) * safeNum(i.unitCost),
          receivedQty: 0,
        }));
      }

      const docRef = doc(this.getCollectionRef(), id);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      
      return true;
    } catch (error) {
      console.error('Error updating purchase order:', error);
      throw error;
    }
  }

  /**
   * Delete purchase order (only Draft/Cancelled)
   */
  async delete(id) {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      throw error;
    }
  }

  /**
   * Receive purchase order (update inventory)
   */
  async receive(id, userId = 'admin') {
    try {
      const po = await this.getOne(id);
      if (!po) throw new Error('PO not found');
      if (po.status === 'Received') throw new Error('PO already received');
      if (po.status === 'Cancelled') throw new Error('Cannot receive a cancelled PO');

      // Import inventory service dynamically
      const { FirestoreInventoryService } = await import('./firestoreInventoryService.js');
      const inventoryService = new FirestoreInventoryService(this.tenantId);

      const results = [];
      const items = safeArr(po.items);

      for (const item of items) {
        try {
          const result = await inventoryService.receiveStock(
            item.inventoryItemId,
            item.qty,
            item.unitCost,
            id,
            po.poNo,
            userId
          );
          results.push({ ...item, result, success: true });
        } catch (err) {
          console.error('Error receiving item:', err);
          results.push({ ...item, error: err.message, success: false });
        }
      }

      // Update PO status and mark items as received
      const updatedItems = items.map(item => ({
        ...item,
        receivedQty: item.qty,
        receivedAt: new Date().toISOString(),
      }));

      const docRef = doc(this.getCollectionRef(), id);
      await updateDoc(docRef, {
        status: 'Received',
        items: updatedItems,
        receivedAt: serverTimestamp(),
        receivedBy: userId,
        updatedAt: serverTimestamp(),
      });

      return results;
    } catch (error) {
      console.error('Error receiving purchase order:', error);
      throw error;
    }
  }

  /**
   * Cancel purchase order
   */
  async cancel(id, reason = '') {
    try {
      const docRef = doc(this.getCollectionRef(), id);
      await updateDoc(docRef, {
        status: 'Cancelled',
        notes: reason,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error('Error cancelling purchase order:', error);
      throw error;
    }
  }

  /**
   * Get spending by supplier
   */
  async spendBySupplier() {
    try {
      const pos = await this.getAll();
      const received = pos.filter(p => p.status === 'Received');
      const map = {};
      
      received.forEach(p => {
        if (!map[p.supplierId]) {
          map[p.supplierId] = {
            supplierId: p.supplierId,
            supplierName: p.supplierName,
            total: 0,
            orders: 0,
          };
        }
        map[p.supplierId].total += safeNum(p.total);
        map[p.supplierId].orders += 1;
      });
      
      return Object.values(map).sort((a, b) => b.total - a.total);
    } catch (error) {
      console.error('Error getting spend by supplier:', error);
      return [];
    }
  }

  /**
   * Get top purchased items
   */
  async topPurchasedItems(limit = 10) {
    try {
      const pos = await this.getAll();
      const received = pos.filter(p => p.status === 'Received');
      const map = {};
      
      received.forEach(po => {
        safeArr(po.items).forEach(item => {
          const k = item.inventoryItemId;
          if (!map[k]) {
            map[k] = {
              id: k,
              name: item.inventoryItemName,
              qty: 0,
              spend: 0,
              orders: 0,
            };
          }
          map[k].qty += safeNum(item.qty);
          map[k].spend += safeNum(item.total);
          map[k].orders += 1;
        });
      });
      
      return Object.values(map)
        .sort((a, b) => b.spend - a.spend)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting top purchased items:', error);
      return [];
    }
  }

  /**
   * Get monthly totals
   */
  async monthlyTotals(months = 6) {
    try {
      const pos = await this.getAll();
      const received = pos.filter(p => p.status === 'Received' && p.orderDate);
      const buckets = {};
      
      received.forEach(p => {
        const key = p.orderDate.slice(0, 7); // YYYY-MM
        buckets[key] = (buckets[key] || 0) + safeNum(p.total);
      });
      
      // Fill last N months
      const result = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toISOString().slice(0, 7);
        result.push({ month: key, total: buckets[key] || 0 });
      }
      
      return result;
    } catch (error) {
      console.error('Error getting monthly totals:', error);
      return [];
    }
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    try {
      const all = await this.getAll();
      const draft = all.filter(p => p.status === 'Draft').length;
      const ordered = all.filter(p => p.status === 'Ordered').length;
      const received = all.filter(p => p.status === 'Received');
      const cancelled = all.filter(p => p.status === 'Cancelled').length;
      const totalSpend = received.reduce((s, p) => s + safeNum(p.total), 0);
      
      const thisMonth = new Date().toISOString().slice(0, 7);
      const monthSpend = received
        .filter(p => (p.orderDate || '').startsWith(thisMonth))
        .reduce((s, p) => s + safeNum(p.total), 0);
      
      return {
        total: all.length,
        draft,
        ordered,
        received: received.length,
        cancelled,
        totalSpend,
        monthSpend,
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      return {
        total: 0,
        draft: 0,
        ordered: 0,
        received: 0,
        cancelled: 0,
        totalSpend: 0,
        monthSpend: 0,
      };
    }
  }

  /**
   * Bulk import
   */
  async bulkImport(pos) {
    try {
      if (!Array.isArray(pos) || !pos.length) return;
      
      const batch = writeBatch(db);
      pos.forEach(po => {
        const docRef = po.id
          ? doc(this.getCollectionRef(), po.id)
          : doc(this.getCollectionRef());
        
        batch.set(docRef, {
          ...po,
          tenantId: this.tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error bulk importing purchase orders:', error);
      throw error;
    }
  }
}

export default {
  FirestoreSupplierService,
  FirestorePurchaseOrderService,
};
