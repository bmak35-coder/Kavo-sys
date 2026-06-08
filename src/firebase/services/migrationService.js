/**
 * Database Migration Utility
 * 
 * Migrates data from local Dexie database to Firebase Firestore.
 * Run this script to transfer all existing data to the multi-tenant Firebase system.
 */

import { db as dexieDb } from '../db/db';
import { db as firebaseDb } from '../firebase/config';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import productService from '../firebase/services/productService';
import orderService from '../firebase/services/orderService';
import customerService from '../firebase/services/customerService';
import tableService from '../firebase/services/tableService';

class MigrationService {
  constructor() {
    this.tenantId = null;
    this.userId = null;
    this.migrationLog = [];
  }

  /**
   * Initialize migration
   */
  async initialize(tenantId, userId) {
    this.tenantId = tenantId;
    this.userId = userId;
    this.migrationLog = [];
    
    console.log(`Starting migration for tenant: ${tenantId}`);
    this.log('info', 'Migration initialized', { tenantId, userId });
  }

  /**
   * Log migration events
   */
  log(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
    this.migrationLog.push(entry);
    console.log(`[${level.toUpperCase()}] ${message}`, data);
  }

  /**
   * Migrate all data
   */
  async migrateAll() {
    try {
      this.log('info', 'Starting full migration...');

      const results = {
        categories: await this.migrateCategories(),
        products: await this.migrateProducts(),
        customers: await this.migrateCustomers(),
        tables: await this.migrateTables(),
        orders: await this.migrateOrders(),
      };

      this.log('success', 'Migration completed successfully', results);
      
      return {
        success: true,
        results,
        log: this.migrationLog,
      };
    } catch (error) {
      this.log('error', 'Migration failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Migrate categories
   */
  async migrateCategories() {
    try {
      this.log('info', 'Migrating categories...');

      // Get all categories from Dexie
      const localCategories = await dexieDb.categories.toArray();
      
      if (localCategories.length === 0) {
        this.log('info', 'No categories to migrate');
        return { migrated: 0, skipped: 0, failed: 0 };
      }

      let migrated = 0;
      let failed = 0;

      for (const category of localCategories) {
        try {
          await productService.createCategory(
            this.tenantId,
            {
              name: category.name,
              nameAr: category.nameAr,
              color: category.color || '#007bff',
              icon: category.icon,
              sortOrder: category.sortOrder || 0,
              active: category.active !== false,
            },
            this.userId
          );
          migrated++;
        } catch (error) {
          this.log('error', `Failed to migrate category: ${category.name}`, { error: error.message });
          failed++;
        }
      }

      const result = { migrated, failed };
      this.log('info', 'Categories migration completed', result);
      return result;
    } catch (error) {
      this.log('error', 'Categories migration failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Migrate products
   */
  async migrateProducts() {
    try {
      this.log('info', 'Migrating products...');

      // Get all products from Dexie
      const localProducts = await dexieDb.products.toArray();
      
      if (localProducts.length === 0) {
        this.log('info', 'No products to migrate');
        return { migrated: 0, failed: 0 };
      }

      // Get Firebase categories to map IDs
      const categories = await productService.getCategories(this.tenantId);
      const categoryMap = {};
      categories.forEach((cat) => {
        categoryMap[cat.name] = cat.id;
      });

      let migrated = 0;
      let failed = 0;

      for (const product of localProducts) {
        try {
          // Find matching category ID
          const localCategory = await dexieDb.categories.get(product.categoryId);
          const firebaseCategoryId = categoryMap[localCategory?.name] || categories[0]?.id;

          await productService.createProduct(
            this.tenantId,
            {
              name: product.name,
              nameAr: product.nameAr,
              sku: product.sku || `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              barcode: product.barcode,
              categoryId: firebaseCategoryId,
              price: product.price || 0,
              cost: product.cost,
              taxable: product.taxable !== false,
              active: product.active !== false,
              trackInventory: product.trackInventory || false,
              stock: product.stock || 0,
              minStock: product.minStock,
              image: product.image,
              modifiers: product.modifiers || [],
              variants: product.variants || [],
            },
            this.userId
          );
          migrated++;
        } catch (error) {
          this.log('error', `Failed to migrate product: ${product.name}`, { error: error.message });
          failed++;
        }
      }

      const result = { migrated, failed };
      this.log('info', 'Products migration completed', result);
      return result;
    } catch (error) {
      this.log('error', 'Products migration failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Migrate customers
   */
  async migrateCustomers() {
    try {
      this.log('info', 'Migrating customers...');

      const localCustomers = await dexieDb.customers.toArray();
      
      if (localCustomers.length === 0) {
        this.log('info', 'No customers to migrate');
        return { migrated: 0, failed: 0 };
      }

      let migrated = 0;
      let failed = 0;

      for (const customer of localCustomers) {
        try {
          await customerService.createCustomer(
            this.tenantId,
            {
              name: customer.name,
              phone: customer.phone,
              email: customer.email,
              address: customer.address,
              notes: customer.notes,
            },
            this.userId
          );
          migrated++;
        } catch (error) {
          this.log('error', `Failed to migrate customer: ${customer.name}`, { error: error.message });
          failed++;
        }
      }

      const result = { migrated, failed };
      this.log('info', 'Customers migration completed', result);
      return result;
    } catch (error) {
      this.log('error', 'Customers migration failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Migrate tables
   */
  async migrateTables() {
    try {
      this.log('info', 'Migrating tables...');

      const localTables = await dexieDb.tables.toArray();
      
      if (localTables.length === 0) {
        this.log('info', 'No tables to migrate');
        return { migrated: 0, failed: 0 };
      }

      let migrated = 0;
      let failed = 0;

      for (const table of localTables) {
        try {
          await tableService.createTable(
            this.tenantId,
            {
              number: table.number,
              name: table.name,
              capacity: table.capacity || 4,
              section: table.section,
            },
            this.userId
          );
          migrated++;
        } catch (error) {
          this.log('error', `Failed to migrate table: ${table.name}`, { error: error.message });
          failed++;
        }
      }

      const result = { migrated, failed };
      this.log('info', 'Tables migration completed', result);
      return result;
    } catch (error) {
      this.log('error', 'Tables migration failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Migrate orders (historical data)
   */
  async migrateOrders() {
    try {
      this.log('info', 'Migrating orders...');

      const localOrders = await dexieDb.orders.toArray();
      
      if (localOrders.length === 0) {
        this.log('info', 'No orders to migrate');
        return { migrated: 0, failed: 0 };
      }

      // Get Firebase products and customers to map IDs
      const products = await productService.getProducts(this.tenantId, { pageSize: 1000 });
      const customers = await customerService.getCustomers(this.tenantId, { pageSize: 1000 });

      const productMap = {};
      products.products.forEach((p) => {
        productMap[p.name] = p.id;
      });

      const customerMap = {};
      customers.customers.forEach((c) => {
        customerMap[c.phone] = c.id;
      });

      let migrated = 0;
      let failed = 0;

      // Migrate in batches to avoid overwhelming Firestore
      const batchSize = 50;
      for (let i = 0; i < localOrders.length; i += batchSize) {
        const batch = localOrders.slice(i, i + batchSize);

        for (const order of batch) {
          try {
            // Map order items to Firebase product IDs
            const items = order.items.map((item) => {
              const firebaseProductId = productMap[item.productName] || null;
              
              return {
                id: crypto.randomUUID(),
                productId: firebaseProductId,
                productName: item.productName,
                quantity: item.quantity,
                price: item.price,
                subtotal: item.subtotal,
                modifiers: item.modifiers || [],
                variant: item.variant,
                notes: item.notes,
                status: 'served',
              };
            });

            // Map customer ID
            const localCustomer = await dexieDb.customers.get(order.customerId);
            const firebaseCustomerId = customerMap[localCustomer?.phone] || null;

            await orderService.createOrder(
              this.tenantId,
              {
                type: order.type || 'dine-in',
                tableId: order.tableId,
                customerId: firebaseCustomerId,
                items,
                subtotal: order.subtotal,
                tax: order.tax || 0,
                discount: order.discount || 0,
                total: order.total,
                payments: order.payments || [],
                notes: order.notes,
                status: order.status || 'completed',
              },
              this.userId
            );

            migrated++;
          } catch (error) {
            this.log('error', `Failed to migrate order`, { error: error.message });
            failed++;
          }
        }

        // Add delay between batches
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const result = { migrated, failed };
      this.log('info', 'Orders migration completed', result);
      return result;
    } catch (error) {
      this.log('error', 'Orders migration failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Export migration log
   */
  exportLog() {
    const logText = this.migrationLog
      .map((entry) => {
        return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message} ${
          Object.keys(entry.data).length > 0 ? JSON.stringify(entry.data) : ''
        }`;
      })
      .join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `migration-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export default new MigrationService();
