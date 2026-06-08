/**
 * Tenant Context Provider
 * 
 * Resolves tenant from URL slug and provides tenant context to the application.
 * SECURITY: Tenant is always resolved from the URL, never from user input.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase/config';

const TenantContext = createContext(null);

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
};

export const TenantProvider = ({ children, token }) => {
  const [tenant, setTenant] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [tenantSlug, setTenantSlug] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auto-resolve tenant when token prop changes
  useEffect(() => {
    if (token) {
      resolveTenant(token);
    }
  }, [token]);

  /**
   * Resolve tenant from token (not slug)
   * Called on app initialization and route changes
   */
  const resolveTenant = async (token) => {
    try {
      setLoading(true);
      setError(null);

      // Special case: admin area (no tenant)
      if (token === 'admin') {
        setTenantSlug('admin');
        setTenantId(null);
        setTenant(null);
        setLoading(false);
        return;
      }

      // Query Firestore for tenant by token (not slug)
      const tenantsRef = collection(db, 'tenants');
      const q = query(
        tenantsRef,
        where('token', '==', token),
        where('status', '==', 'active'),
        limit(1)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        throw new Error('Tenant not found or inactive');
      }

      const tenantDoc = snapshot.docs[0];
      const tenantData = {
        id: tenantDoc.id,
        ...tenantDoc.data(),
        createdAt: tenantDoc.data().createdAt?.toDate(),
        updatedAt: tenantDoc.data().updatedAt?.toDate(),
        renewalDate: tenantDoc.data().renewalDate?.toDate(),
      };

      setTenant(tenantData);
      setTenantId(tenantDoc.id);
      setTenantSlug(tenantData.slug); // Keep slug for internal use
      setLoading(false);

      // Store in sessionStorage for quick access
      sessionStorage.setItem('currentTenant', JSON.stringify({
        id: tenantDoc.id,
        token: token,
        slug: tenantData.slug,
        name: tenantData.name,
      }));

    } catch (err) {
      console.error('Error resolving tenant:', err);
      setError(err.message);
      setTenant(null);
      setTenantId(null);
      setTenantSlug(null);
      setLoading(false);
    }
  };

  /**
   * Clear tenant context (on logout or tenant switch)
   */
  const clearTenant = () => {
    setTenant(null);
    setTenantId(null);
    setTenantSlug(null);
    sessionStorage.removeItem('currentTenant');
  };

  /**
   * Resolve tenant from URL on mount
   */
  useEffect(() => {
    // Get slug from URL
    // Format: https://pos.com/{slug} or https://{slug}.pos.com
    const path = window.location.pathname;
    const subdomain = window.location.hostname.split('.')[0];
    const appDomain = import.meta.env.VITE_APP_URL || 'pos.com';

    let slug = null;

    // Check for path-based slug (e.g., /pizza-palace)
    if (path && path !== '/') {
      const pathSegments = path.split('/').filter(Boolean);
      if (pathSegments.length > 0) {
        slug = pathSegments[0];
      }
    }

    // Check for subdomain-based slug (e.g., pizza-palace.pos.com)
    if (!slug && subdomain && !appDomain.includes(subdomain)) {
      slug = subdomain;
    }

    if (slug) {
      resolveTenant(slug);
    } else {
      // No slug found - redirect to landing page or show tenant selector
      setLoading(false);
    }
  }, []);

  /**
   * Listen for tenant changes in URL
   */
  useEffect(() => {
    const handleRouteChange = () => {
      const path = window.location.pathname;
      const pathSegments = path.split('/').filter(Boolean);
      
      if (pathSegments.length > 0) {
        const newSlug = pathSegments[0];
        if (newSlug !== tenantSlug) {
          resolveTenant(newSlug);
        }
      }
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, [tenantSlug]);

  const value = {
    tenant,
    tenantId,
    tenantSlug,
    loading,
    error,
    resolveTenant,
    clearTenant,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};
