/**
 * Firebase Services Context Provider
 * Provides tenant-specific Firebase services to the React app
 */

import React, { createContext, useContext, useMemo } from 'react';
import { getFirebaseServices } from './services/serviceFactory';

const FirebaseServicesContext = createContext(null);

/**
 * Provider component that creates and provides Firebase services
 * based on the tenant ID
 */
export function FirebaseServicesProvider({ children, tenantId }) {
  const services = useMemo(() => {
    if (!tenantId) {
      console.warn('FirebaseServicesProvider: No tenantId provided');
      return null;
    }

    try {
      return getFirebaseServices(tenantId);
    } catch (error) {
      console.error('Error creating Firebase services:', error);
      return null;
    }
  }, [tenantId]);

  return (
    <FirebaseServicesContext.Provider value={services}>
      {children}
    </FirebaseServicesContext.Provider>
  );
}

/**
 * Hook to access Firebase services
 * @returns {Object} Firebase services (menu, orders, kitchen, etc.)
 */
export function useFirebaseServices() {
  const context = useContext(FirebaseServicesContext);
  
  if (context === undefined) {
    throw new Error('useFirebaseServices must be used within FirebaseServicesProvider');
  }

  if (!context) {
    throw new Error('Firebase services not initialized. Make sure tenantId is provided to FirebaseServicesProvider');
  }

  return context;
}

/**
 * Hook to access a specific service
 * @param {string} serviceName - Name of the service (menu, orders, kitchen, etc.)
 * @returns {Object} The requested service
 */
export function useFirebaseService(serviceName) {
  const services = useFirebaseServices();
  
  if (!services[serviceName]) {
    throw new Error(`Service '${serviceName}' not found`);
  }

  return services[serviceName];
}

export default FirebaseServicesProvider;
