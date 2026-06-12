/**
 * Firebase Service Factory
 * Creates and manages tenant-specific service instances
 */

import FirestoreMenuService from './firestoreMenuService';
import { FirestoreOrderService, FirestoreHeldOrderService } from './firestoreOrderService';
import FirestoreKitchenService from './firestoreKitchenService';
import FirestoreInventoryService from './firestoreInventoryService';
import FirestoreStockLogService from './firestoreStockLogService';
import FirestoreRecipeService from './firestoreRecipeService';
import FirestoreTableService from './firestoreTableService';
import FirestoreSettingsService from './firestoreSettingsService';
import FirestoreUserService from './firestoreUserService';
import FirestoreShiftService from './firestoreShiftService';
import { 
  FirestoreEmployeeService, 
  FirestoreAdvanceService, 
  FirestorePayrollService 
} from './firestorePayrollService';
import {
  FirestoreSupplierService,
  FirestorePurchaseOrderService
} from './firestorePurchasingService';
import { FirestoreAuditLogService } from './auditService';

/**
 * Service Factory for creating tenant-specific service instances
 * Usage:
 *   const services = createFirebaseServices(tenantId);
 *   const menuItems = await services.menu.getAll();
 */
export function createFirebaseServices(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required to create Firebase services');
  }

  return {
    menu: new FirestoreMenuService(tenantId),
    orders: new FirestoreOrderService(tenantId),
    heldOrders: new FirestoreHeldOrderService(tenantId),
    kitchen: new FirestoreKitchenService(tenantId),
    inventory: new FirestoreInventoryService(tenantId),
    stockLogs: new FirestoreStockLogService(tenantId),
    recipes: new FirestoreRecipeService(tenantId),
    tables: new FirestoreTableService(tenantId),
    settings: new FirestoreSettingsService(tenantId),
    users: new FirestoreUserService(tenantId),
    shifts: new FirestoreShiftService(tenantId),
    employees: new FirestoreEmployeeService(tenantId),
    advances: new FirestoreAdvanceService(tenantId),
    payroll: new FirestorePayrollService(tenantId),
    suppliers: new FirestoreSupplierService(tenantId),
    purchaseOrders: new FirestorePurchaseOrderService(tenantId),
    auditLogs: new FirestoreAuditLogService(tenantId),
  };
}

/**
 * Service cache to avoid creating duplicate instances
 */
const serviceCache = new Map();

/**
 * Get cached services for a tenant or create new ones
 */
export function getFirebaseServices(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  if (!serviceCache.has(tenantId)) {
    serviceCache.set(tenantId, createFirebaseServices(tenantId));
  }

  return serviceCache.get(tenantId);
}

/**
 * Clear service cache (useful for testing or tenant switching)
 */
export function clearServiceCache(tenantId) {
  if (tenantId) {
    serviceCache.delete(tenantId);
  } else {
    serviceCache.clear();
  }
}

export default {
  create: createFirebaseServices,
  get: getFirebaseServices,
  clear: clearServiceCache,
};
