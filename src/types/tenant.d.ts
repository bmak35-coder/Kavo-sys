/**
 * TypeScript Type Definitions for Multi-Tenant System
 */

// ==================== TENANT TYPES ====================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  token: string; // For API integrations/webhooks only
  domain?: string; // Optional custom domain
  status: TenantStatus;
  plan: SubscriptionPlan;
  billingStatus: BillingStatus;
  renewalDate?: Date;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  metadata?: Record<string, any>;
}

export type TenantStatus = 'active' | 'suspended' | 'disabled' | 'trial';

export type SubscriptionPlan = 'free' | 'starter' | 'business' | 'enterprise';

export type BillingStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface TenantSettings {
  currency: string;
  timezone: string;
  language: string;
  taxRate: number;
  receiptFormat: string;
  autoLogout: number; // minutes
  allowedDevices: number;
  features: TenantFeatures;
}

export interface TenantFeatures {
  inventory: boolean;
  kitchen: boolean;
  reports: boolean;
  multiLocation: boolean;
  api: boolean;
  customReports: boolean;
}

// ==================== USER TYPES ====================

export interface User {
  uid: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  phone?: string;
  avatar?: string;
  permissions?: string[];
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type UserRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'admin';

export interface CustomClaims {
  tenantId: string;
  role: UserRole;
  tenantSlug: string;
  permissions?: string[];
}

// ==================== PRODUCT TYPES ====================

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  nameAr?: string;
  sku: string;
  barcode?: string;
  categoryId: string;
  price: number;
  cost?: number;
  taxable: boolean;
  active: boolean;
  trackInventory: boolean;
  stock?: number;
  minStock?: number;
  image?: string;
  modifiers?: ProductModifier[];
  variants?: ProductVariant[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  nameAr?: string;
  color: string;
  icon?: string;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ProductModifier {
  id: string;
  name: string;
  options: ModifierOption[];
  required: boolean;
  multiSelect: boolean;
}

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  sku?: string;
}

// ==================== ORDER TYPES ====================

export interface Order {
  id: string;
  tenantId: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  tableId?: string;
  customerId?: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payments: Payment[];
  notes?: string;
  userId: string; // Cashier/waiter who created the order
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  createdBy: string;
}

export type OrderType = 'dine-in' | 'takeout' | 'delivery';

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  subtotal: number;
  modifiers?: SelectedModifier[];
  variant?: string;
  notes?: string;
  status: OrderItemStatus;
}

export type OrderItemStatus = 'pending' | 'preparing' | 'ready' | 'served';

export interface SelectedModifier {
  modifierId: string;
  optionId: string;
  name: string;
  price: number;
}

// ==================== PAYMENT TYPES ====================

export interface Payment {
  id: string;
  tenantId: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  status: PaymentStatus;
  userId: string;
  createdAt: Date;
  createdBy: string;
}

export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'check' | 'other';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

// ==================== CUSTOMER TYPES ====================

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// ==================== TABLE TYPES ====================

export interface Table {
  id: string;
  tenantId: string;
  number: string;
  name: string;
  capacity: number;
  status: TableStatus;
  currentOrderId?: string;
  section?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';

// ==================== SESSION TYPES ====================

export interface Session {
  id: string;
  tenantId: string;
  userId: string;
  loginAt: Date;
  lastActivity: Date;
  ip?: string;
  device?: string;
  browser?: string;
  active: boolean;
  logoutAt?: Date;
  createdBy: string;
}

// ==================== AUDIT LOG TYPES ====================

export interface AuditLog {
  id: string;
  tenantId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  timestamp: Date;
  changes?: AuditChange[];
  metadata?: Record<string, any>;
  ip?: string;
}

export type AuditAction = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'login' 
  | 'logout' 
  | 'export' 
  | 'import'
  | 'restore';

export interface AuditChange {
  field: string;
  oldValue: any;
  newValue: any;
}

// ==================== SHIFT TYPES ====================

export interface Shift {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  startTime: Date;
  endTime?: Date;
  startingCash: number;
  endingCash?: number;
  expectedCash?: number;
  difference?: number;
  totalSales?: number;
  totalOrders?: number;
  notes?: string;
  status: ShiftStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type ShiftStatus = 'open' | 'closed';

// ==================== INVENTORY TYPES ====================

export interface InventoryItem {
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  currentStock: number;
  minStock: number;
  maxStock?: number;
  unit: string;
  lastRestockDate?: Date;
  lastRestockQuantity?: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface InventoryTransaction {
  id: string;
  tenantId: string;
  productId: string;
  type: InventoryTransactionType;
  quantity: number;
  reason?: string;
  userId: string;
  createdAt: Date;
  createdBy: string;
}

export type InventoryTransactionType = 'restock' | 'sale' | 'waste' | 'adjustment' | 'return';

// ==================== KITCHEN TYPES ====================

export interface KitchenOrder {
  id: string;
  tenantId: string;
  orderId: string;
  orderNumber: string;
  tableNumber?: string;
  items: KitchenOrderItem[];
  status: KitchenOrderStatus;
  priority: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  preparedAt?: Date;
  createdBy: string;
}

export type KitchenOrderStatus = 'pending' | 'preparing' | 'ready';

export interface KitchenOrderItem {
  id: string;
  productName: string;
  quantity: number;
  modifiers?: string[];
  notes?: string;
  status: OrderItemStatus;
}

// ==================== ROLE & PERMISSION TYPES ====================

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  permissions: Permission[];
  isSystem: boolean; // Cannot be deleted if true
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface Permission {
  resource: string;
  actions: PermissionAction[];
}

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'export';

// ==================== REPORT TYPES ====================

export interface SalesReport {
  tenantId: string;
  period: 'day' | 'week' | 'month' | 'year' | 'custom';
  startDate: Date;
  endDate: Date;
  totalSales: number;
  totalOrders: number;
  totalTax: number;
  totalDiscount: number;
  averageOrderValue: number;
  salesByCategory: CategorySales[];
  salesByPaymentMethod: PaymentMethodSales[];
  topProducts: ProductSales[];
  hourlyBreakdown?: HourlySales[];
}

export interface CategorySales {
  categoryId: string;
  categoryName: string;
  totalSales: number;
  orderCount: number;
}

export interface PaymentMethodSales {
  method: PaymentMethod;
  totalAmount: number;
  transactionCount: number;
}

export interface ProductSales {
  productId: string;
  productName: string;
  quantitySold: number;
  totalRevenue: number;
}

export interface HourlySales {
  hour: number;
  sales: number;
  orders: number;
}

// ==================== TENANT CONTEXT ====================

export interface TenantContext {
  tenant: Tenant | null;
  tenantId: string | null;
  tenantSlug: string | null;
  loading: boolean;
  error: string | null;
  resolveTenant: (slug: string) => Promise<void>;
  clearTenant: () => void;
}

// ==================== AUTH CONTEXT ====================

export interface AuthContext {
  user: User | null;
  loading: boolean;
  error: string | null;
  claims: CustomClaims | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshClaims: () => Promise<void>;
}

// ==================== PERMISSION CONTEXT ====================

export interface PermissionContext {
  permissions: Permission[];
  loading: boolean;
  hasPermission: (resource: string, action: PermissionAction) => boolean;
  canView: (resource: string) => boolean;
  canEdit: (resource: string) => boolean;
  canDelete: (resource: string) => boolean;
  canCreate: (resource: string) => boolean;
}
