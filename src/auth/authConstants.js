/**
 * KAVO-SYS · Auth Constants
 * ─────────────────────────────────────────────────────
 * Standalone file — imports NOTHING.
 * Extracted from AuthProvider.jsx so auth.js and migration.js
 * can import DEFAULT_USERS without creating a circular dep.
 *
 *   BEFORE (circular, causes TDZ crash):
 *     AuthProvider → auth.js → AuthProvider   ← CYCLE
 *
 *   AFTER (safe):
 *     AuthProvider → authConstants  ← no cycle
 *     auth.js      → authConstants  ← no cycle
 *     migration.js → authConstants  ← no cycle
 */

export const DEFAULT_USERS = [
  { id:"u1", username:"owner",   password:"owner123",   name:"Restaurant Owner", role:"owner"   },
  { id:"u2", username:"manager", password:"manager123", name:"Manager",          role:"manager" },
  { id:"u3", username:"cashier", password:"cashier123", name:"Alex Kassem",      role:"cashier" },
  { id:"u4", username:"kitchen", password:"kitchen123", name:"Kitchen Staff",    role:"kitchen" },
];

export const PERMISSIONS = {
  owner: {
    canAccessPOS:true,      canAccessKitchen:true,  canAccessReports:true,
    canAccessSettings:true, canManageMenu:true,      canBackupRestore:true,
    canDeleteData:true,     canEditPrices:true,      canVoidOrders:true,
    canApplyDiscount:true,  canAccessInventory:true, canManageTables:true,
    canManageUsers:true,    canAccessPayroll:true,   canManagePurchasing:true,
  },
  // admin is an alias for owner (backward compat)
  admin: {
    canAccessPOS:true,      canAccessKitchen:true,  canAccessReports:true,
    canAccessSettings:true, canManageMenu:true,      canBackupRestore:true,
    canDeleteData:true,     canEditPrices:true,      canVoidOrders:true,
    canApplyDiscount:true,  canAccessInventory:true, canManageTables:true,
    canManageUsers:true,    canAccessPayroll:true,   canManagePurchasing:true,
  },
  manager: {
    canAccessPOS:true,      canAccessKitchen:true,  canAccessReports:true,
    canAccessSettings:false, canManageMenu:true,     canBackupRestore:true,
    canDeleteData:false,    canEditPrices:true,      canVoidOrders:true,
    canApplyDiscount:true,  canAccessInventory:true, canManageTables:true,
    canManageUsers:false,   canAccessPayroll:true,   canManagePurchasing:true,
  },
  cashier: {
    canAccessPOS:true,      canAccessKitchen:true,  canAccessReports:false,
    canAccessSettings:false, canManageMenu:false,    canBackupRestore:false,
    canDeleteData:false,    canEditPrices:false,     canVoidOrders:false,
    canApplyDiscount:false, canAccessInventory:false, canManageTables:false,
    canManageUsers:false,   canAccessPayroll:false,  canManagePurchasing:false,
  },
  kitchen: {
    canAccessPOS:false,     canAccessKitchen:true,  canAccessReports:false,
    canAccessSettings:false, canManageMenu:false,    canBackupRestore:false,
    canDeleteData:false,    canEditPrices:false,     canVoidOrders:false,
    canApplyDiscount:false, canAccessInventory:false, canManageTables:false,
    canManageUsers:false,   canAccessPayroll:false,  canManagePurchasing:false,
  },
};

export const ROLE_META = {
  owner:   { label:"Owner",   color:"#f0a500", bg:"#f0a50018", icon:"👑" },
  admin:   { label:"Admin",   color:"#f0a500", bg:"#f0a50018", icon:"👑" },
  manager: { label:"Manager", color:"#a78bfa", bg:"#a78bfa18", icon:"🔑" },
  cashier: { label:"Cashier", color:"#58a6ff", bg:"#58a6ff18", icon:"💳" },
  kitchen: { label:"Kitchen", color:"#3fb950", bg:"#3fb95018", icon:"🍳" },
};
