/**
 * Permission Provider
 * 
 * Provides role-based permission checking throughout the application.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTenant } from './TenantProvider';
import { useFirebaseAuth } from './FirebaseAuthProvider';

const PermissionContext = createContext(null);

export const usePermissions = () => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissions must be used within PermissionProvider');
  }
  return context;
};

// Default permissions by role
const DEFAULT_PERMISSIONS = {
  owner: {
    products: ['create', 'read', 'update', 'delete', 'export'],
    categories: ['create', 'read', 'update', 'delete', 'export'],
    orders: ['create', 'read', 'update', 'delete', 'export'],
    customers: ['create', 'read', 'update', 'delete', 'export'],
    tables: ['create', 'read', 'update', 'delete', 'export'],
    users: ['create', 'read', 'update', 'delete', 'export'],
    reports: ['read', 'export'],
    settings: ['read', 'update'],
    inventory: ['create', 'read', 'update', 'delete', 'export'],
    shifts: ['create', 'read', 'update', 'delete', 'export'],
    kitchen: ['read', 'update'],
    audit: ['read', 'export'],
  },
  manager: {
    products: ['create', 'read', 'update', 'export'],
    categories: ['create', 'read', 'update', 'export'],
    orders: ['create', 'read', 'update', 'export'],
    customers: ['create', 'read', 'update', 'export'],
    tables: ['create', 'read', 'update'],
    users: ['read'],
    reports: ['read', 'export'],
    settings: ['read'],
    inventory: ['create', 'read', 'update', 'export'],
    shifts: ['create', 'read', 'update', 'export'],
    kitchen: ['read', 'update'],
    audit: ['read'],
  },
  cashier: {
    products: ['read'],
    categories: ['read'],
    orders: ['create', 'read', 'update'],
    customers: ['create', 'read', 'update'],
    tables: ['read', 'update'],
    users: [],
    reports: [],
    settings: [],
    inventory: ['read'],
    shifts: ['create', 'read', 'update'],
    kitchen: [],
    audit: [],
  },
  waiter: {
    products: ['read'],
    categories: ['read'],
    orders: ['create', 'read', 'update'],
    customers: ['read'],
    tables: ['read', 'update'],
    users: [],
    reports: [],
    settings: [],
    inventory: ['read'],
    shifts: ['create', 'read', 'update'],
    kitchen: ['read'],
    audit: [],
  },
  kitchen: {
    products: ['read'],
    categories: ['read'],
    orders: ['read', 'update'],
    customers: [],
    tables: [],
    users: [],
    reports: [],
    settings: [],
    inventory: ['read'],
    shifts: [],
    kitchen: ['read', 'update'],
    audit: [],
  },
  admin: {
    // Super admin has all permissions
    '*': ['create', 'read', 'update', 'delete', 'export'],
  },
};

export const PermissionProvider = ({ children }) => {
  const { tenantId } = useTenant();
  const { user, claims } = useFirebaseAuth();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  /**
   * Load permissions for current user
   */
  useEffect(() => {
    const loadPermissions = async () => {
      if (!user || !claims || !tenantId) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Check if user has a custom role
        const roleRef = doc(db, 'tenants', tenantId, 'roles', claims.role);
        const roleDoc = await getDoc(roleRef);

        if (roleDoc.exists()) {
          // Use custom role permissions
          setPermissions(roleDoc.data().permissions || []);
        } else {
          // Use default permissions for standard roles
          const defaultPerms = DEFAULT_PERMISSIONS[claims.role] || {};
          const permArray = Object.entries(defaultPerms).map(([resource, actions]) => ({
            resource,
            actions,
          }));
          setPermissions(permArray);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading permissions:', err);
        setPermissions([]);
        setLoading(false);
      }
    };

    loadPermissions();
  }, [user, claims, tenantId]);

  /**
   * Check if user has specific permission
   */
  const hasPermission = (resource, action) => {
    if (!user || !claims) return false;

    // Super admin has all permissions
    if (claims.role === 'admin') return true;

    // Owner has all permissions within their tenant
    if (claims.role === 'owner') return true;

    // Check specific permission
    const resourcePermission = permissions.find((p) => p.resource === resource);
    if (!resourcePermission) return false;

    return resourcePermission.actions.includes(action);
  };

  /**
   * Check if user can view resource
   */
  const canView = (resource) => {
    return hasPermission(resource, 'read');
  };

  /**
   * Check if user can edit resource
   */
  const canEdit = (resource) => {
    return hasPermission(resource, 'update');
  };

  /**
   * Check if user can delete resource
   */
  const canDelete = (resource) => {
    return hasPermission(resource, 'delete');
  };

  /**
   * Check if user can create resource
   */
  const canCreate = (resource) => {
    return hasPermission(resource, 'create');
  };

  /**
   * Check if user can export resource
   */
  const canExport = (resource) => {
    return hasPermission(resource, 'export');
  };

  const value = {
    permissions,
    loading,
    hasPermission,
    canView,
    canEdit,
    canDelete,
    canCreate,
    canExport,
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

/**
 * HOC to protect routes based on permissions
 */
export const withPermission = (Component, resource, action = 'read') => {
  return (props) => {
    const { hasPermission } = usePermissions();

    if (!hasPermission(resource, action)) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p>You do not have permission to access this resource.</p>
        </div>
      );
    }

    return <Component {...props} />;
  };
};
