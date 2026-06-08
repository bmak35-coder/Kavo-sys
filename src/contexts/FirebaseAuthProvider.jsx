/**
 * Firebase Authentication Provider with Custom Claims
 * 
 * Handles user authentication with tenant-specific custom claims.
 * SECURITY: Custom claims include tenantId and role, preventing cross-tenant access.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdTokenResult,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { useTenant } from './TenantProvider';

const FirebaseAuthContext = createContext(null);

export const useFirebaseAuth = () => {
  const context = useContext(FirebaseAuthContext);
  if (!context) {
    throw new Error('useFirebaseAuth must be used within FirebaseAuthProvider');
  }
  return context;
};

export const FirebaseAuthProvider = ({ children }) => {
  const { tenantId, tenantSlug } = useTenant();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claims, setClaims] = useState(null);

  /**
   * Get user custom claims (includes tenantId and role)
   */
  const getUserClaims = async (firebaseUser) => {
    try {
      const tokenResult = await getIdTokenResult(firebaseUser);
      return tokenResult.claims;
    } catch (err) {
      console.error('Error getting user claims:', err);
      return null;
    }
  };

  /**
   * Load user document from Firestore
   */
  const loadUserDocument = async (uid, userTenantId) => {
    try {
      const userRef = doc(db, 'tenants', userTenantId, 'users', uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        throw new Error('User document not found');
      }

      return {
        uid,
        ...userDoc.data(),
        createdAt: userDoc.data().createdAt?.toDate(),
        updatedAt: userDoc.data().updatedAt?.toDate(),
        lastLogin: userDoc.data().lastLogin?.toDate(),
      };
    } catch (err) {
      console.error('Error loading user document:', err);
      throw err;
    }
  };

  /**
   * Create session record
   */
  const createSession = async (uid, userTenantId) => {
    try {
      const sessionRef = doc(db, 'tenants', userTenantId, 'sessions', crypto.randomUUID());
      
      await setDoc(sessionRef, {
        tenantId: userTenantId,
        userId: uid,
        loginAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
        ip: await getClientIP(),
        device: getDeviceInfo(),
        browser: getBrowserInfo(),
        active: true,
        createdBy: uid,
      });
    } catch (err) {
      console.error('Error creating session:', err);
    }
  };

  /**
   * Update last login timestamp
   */
  const updateLastLogin = async (uid, userTenantId) => {
    try {
      const userRef = doc(db, 'tenants', userTenantId, 'users', uid);
      await updateDoc(userRef, {
        lastLogin: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error updating last login:', err);
    }
  };

  /**
   * Login with email and password
   */
  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);

      // Validate tenant context
      if (!tenantId && tenantSlug !== 'admin') {
        throw new Error('Tenant context not available');
      }

      // Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // Get custom claims
      const userClaims = await getUserClaims(firebaseUser);

      // Validate tenant match (except for super admins)
      if (userClaims.role !== 'admin') {
        if (!userClaims.tenantId) {
          throw new Error('User is not associated with any tenant');
        }

        if (userClaims.tenantId !== tenantId) {
          await signOut(auth);
          throw new Error('User does not belong to this tenant');
        }

        if (userClaims.tenantSlug !== tenantSlug) {
          await signOut(auth);
          throw new Error('Invalid tenant access');
        }
      }

      // Load user document
      const userData = await loadUserDocument(firebaseUser.uid, userClaims.tenantId);

      // Check if user is active
      if (!userData.active) {
        await signOut(auth);
        throw new Error('User account is deactivated');
      }

      // Create session record
      await createSession(firebaseUser.uid, userClaims.tenantId);

      // Update last login
      await updateLastLogin(firebaseUser.uid, userClaims.tenantId);

      // Set user state
      setUser(userData);
      setClaims(userClaims);
      setLoading(false);

    } catch (err) {
      console.error('Login error:', err);
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  /**
   * Logout
   */
  const logout = async () => {
    try {
      setLoading(true);

      // Deactivate current session
      if (user && claims) {
        // This would be done via Cloud Function in production
        // For now, we just sign out
      }

      await signOut(auth);
      setUser(null);
      setClaims(null);
      setLoading(false);
    } catch (err) {
      console.error('Logout error:', err);
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  /**
   * Refresh custom claims
   * Call this after role/permission changes
   */
  const refreshClaims = async () => {
    try {
      if (auth.currentUser) {
        // Force token refresh
        await auth.currentUser.getIdToken(true);
        const newClaims = await getUserClaims(auth.currentUser);
        setClaims(newClaims);
      }
    } catch (err) {
      console.error('Error refreshing claims:', err);
    }
  };

  /**
   * Listen for auth state changes
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Get custom claims
          const userClaims = await getUserClaims(firebaseUser);

          // Validate tenant match
          if (tenantId && userClaims.tenantId !== tenantId && userClaims.role !== 'admin') {
            console.error('Tenant mismatch - signing out');
            await signOut(auth);
            setUser(null);
            setClaims(null);
            setLoading(false);
            return;
          }

          // Load user document
          if (userClaims.tenantId) {
            const userData = await loadUserDocument(firebaseUser.uid, userClaims.tenantId);
            setUser(userData);
            setClaims(userClaims);
          }
        } catch (err) {
          console.error('Error loading user:', err);
          setUser(null);
          setClaims(null);
        }
      } else {
        setUser(null);
        setClaims(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId]);

  const value = {
    user,
    loading,
    error,
    claims,
    login,
    logout,
    refreshClaims,
  };

  return (
    <FirebaseAuthContext.Provider value={value}>
      {children}
    </FirebaseAuthContext.Provider>
  );
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Get client IP (best effort)
 */
const getClientIP = async () => {
  try {
    // In production, use a service or Cloud Function to get real IP
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return 'unknown';
  }
};

/**
 * Get device information
 */
const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  if (/mobile/i.test(ua)) return 'mobile';
  if (/tablet/i.test(ua)) return 'tablet';
  return 'desktop';
};

/**
 * Get browser information
 */
const getBrowserInfo = () => {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown';
};
