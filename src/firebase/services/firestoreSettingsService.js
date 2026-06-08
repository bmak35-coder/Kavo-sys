/**
 * Firebase Firestore Settings Service
 * Handles tenant settings and configuration
 * Supports the SettingsCenter structure (app, receipt, pos, currency)
 */

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config';

export class FirestoreSettingsService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
  }

  getDocRef() {
    return doc(db, 'tenants', this.tenantId, 'settings', 'config');
  }

  /**
   * Get all settings (structured format for SettingsCenter)
   */
  async getAll() {
    try {
      const docSnap = await getDoc(this.getDocRef());
      
      if (!docSnap.exists()) {
        // Return default settings if none exist
        return this.getDefaults();
      }
      
      const data = docSnap.data();
      
      // Ensure the structure matches SettingsCenter expectations
      return {
        app: data.app || this.getDefaults().app,
        receipt: data.receipt || this.getDefaults().receipt,
        pos: data.pos || this.getDefaults().pos,
        currency: data.currency || this.getDefaults().currency,
        tenantId: data.tenantId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    } catch (error) {
      console.error('Error getting settings:', error);
      throw error;
    }
  }

  /**
   * Get setting by key (supports nested keys like 'app.businessName')
   */
  async get(key) {
    try {
      const settings = await this.getAll();
      const keys = key.split('.');
      let value = settings;
      for (const k of keys) {
        value = value?.[k];
      }
      return value;
    } catch (error) {
      console.error('Error getting setting:', error);
      throw error;
    }
  }

  /**
   * Save all settings (full update with app, receipt, pos, currency)
   */
  async saveAll(settings) {
    try {
      const docRef = this.getDocRef();
      const docSnap = await getDoc(docRef);
      
      const payload = {
        app: settings.app || {},
        receipt: settings.receipt || {},
        pos: settings.pos || {},
        currency: settings.currency || {},
        tenantId: this.tenantId,
        updatedAt: serverTimestamp(),
      };
      
      if (docSnap.exists()) {
        // Update existing document
        await updateDoc(docRef, payload);
      } else {
        // Create new document
        await setDoc(docRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      
      console.log('Settings saved to Firebase:', payload);
      return settings;
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  }

  /**
   * Update settings (partial update)
   */
  async update(updates) {
    try {
      const docRef = this.getDocRef();
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      
      return updates;
    } catch (error) {
      // If document doesn't exist, create it
      if (error.code === 'not-found') {
        await setDoc(docRef, {
          ...this.getDefaults(),
          ...updates,
          tenantId: this.tenantId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return updates;
      }
      console.error('Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Set a single setting (supports nested keys like 'app.businessName')
   */
  async set(key, value) {
    const keys = key.split('.');
    if (keys.length === 1) {
      return await this.update({ [key]: value });
    }
    
    // Handle nested updates (e.g., 'app.businessName')
    const updateObj = {};
    updateObj[keys.join('.')] = value;
    return await this.update(updateObj);
  }

  /**
   * Get default settings (structured format)
   */
  getDefaults() {
    return {
      app: {
        businessName: "KAVO Restaurant",
        branch: "Main Branch",
        address: "123 Main Street, Beirut, Lebanon",
        phone: "+961 1 234 567",
        email: "",
        taxNumber: "TRN-000-000-000",
        website: "www.kavo-sys.com",
        cashier: "",
        logo: "",
        taxRate: 11,
        serviceRate: 10,
        language: "en",
      },
      receipt: {
        businessName: "KAVO Restaurant",
        branchName: "Main Branch",
        address: "123 Main Street, Beirut, Lebanon",
        phone: "+961 1 234 567",
        taxNumber: "TRN-000-000-000",
        footerLine1: "Thank you for dining with us!",
        footerLine2: "Please come again soon",
        website: "www.kavo-sys.com",
        autoPrint: false,
        showQR: true,
        paperWidth: "80mm",
      },
      pos: {
        preventNegativeStock: false,
        requireCustomerDelivery: false,
        requireShiftToSell: false,
        defaultOrderType: "dine-in",
        enableTax: true,
        enableService: true,
      },
      currency: {
        primaryCurrency: "USD",
        primarySymbol: "$",
        secondaryCurrency: "LBP",
        secondarySymbol: "L.L.",
        exchangeRate: 90000,
        showDualCurrency: false,
      },
    };
  }

  /**
   * Reset to defaults
   */
  async reset() {
    try {
      const docRef = this.getDocRef();
      await setDoc(docRef, {
        ...this.getDefaults(),
        tenantId: this.tenantId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      return this.getDefaults();
    } catch (error) {
      console.error('Error resetting settings:', error);
      throw error;
    }
  }
}

export default FirestoreSettingsService;
