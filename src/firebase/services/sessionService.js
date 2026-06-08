/**
 * Session Service
 * 
 * Handles user session management and tracking.
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config';

class SessionService {
  /**
   * Get sessions collection reference for a tenant
   */
  getSessionsRef(tenantId) {
    return collection(db, 'tenants', tenantId, 'sessions');
  }

  /**
   * Create a new session
   */
  async createSession(tenantId, sessionData) {
    try {
      const newSession = {
        ...sessionData,
        tenantId,
        loginAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
        active: true,
        createdBy: sessionData.userId,
      };

      const docRef = await addDoc(this.getSessionsRef(tenantId), newSession);

      return {
        id: docRef.id,
        ...newSession,
      };
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Update session last activity
   */
  async updateActivity(tenantId, sessionId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'sessions', sessionId);
      
      await updateDoc(docRef, {
        lastActivity: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating session activity:', error);
    }
  }

  /**
   * End session (logout)
   */
  async endSession(tenantId, sessionId) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'sessions', sessionId);
      
      await updateDoc(docRef, {
        active: false,
        logoutAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error ending session:', error);
      throw error;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(tenantId, userId) {
    try {
      const q = query(
        this.getSessionsRef(tenantId),
        where('userId', '==', userId),
        where('active', '==', true),
        orderBy('loginAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        loginAt: doc.data().loginAt?.toDate(),
        lastActivity: doc.data().lastActivity?.toDate(),
      }));
    } catch (error) {
      console.error('Error getting active sessions:', error);
      throw error;
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(tenantId, userId, limitCount = 50) {
    try {
      const q = query(
        this.getSessionsRef(tenantId),
        where('userId', '==', userId),
        orderBy('loginAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        loginAt: doc.data().loginAt?.toDate(),
        lastActivity: doc.data().lastActivity?.toDate(),
        logoutAt: doc.data().logoutAt?.toDate(),
      }));
    } catch (error) {
      console.error('Error getting user sessions:', error);
      throw error;
    }
  }

  /**
   * End all sessions for a user (force logout all devices)
   */
  async endAllUserSessions(tenantId, userId) {
    try {
      const sessions = await this.getActiveSessions(tenantId, userId);

      const updatePromises = sessions.map((session) =>
        this.endSession(tenantId, session.id)
      );

      await Promise.all(updatePromises);

      return sessions.length;
    } catch (error) {
      console.error('Error ending all user sessions:', error);
      throw error;
    }
  }

  /**
   * Clean up expired sessions (should be run by Cloud Function)
   */
  async cleanupExpiredSessions(tenantId, expirationMinutes = 30) {
    try {
      const expirationDate = new Date();
      expirationDate.setMinutes(expirationDate.getMinutes() - expirationMinutes);

      const q = query(
        this.getSessionsRef(tenantId),
        where('active', '==', true),
        where('lastActivity', '<', expirationDate)
      );

      const snapshot = await getDocs(q);
      
      const updatePromises = snapshot.docs.map((doc) =>
        updateDoc(doc.ref, {
          active: false,
          logoutAt: serverTimestamp(),
        })
      );

      await Promise.all(updatePromises);

      return snapshot.docs.length;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      throw error;
    }
  }

  /**
   * Get session statistics for a tenant
   */
  async getSessionStats(tenantId) {
    try {
      const q = query(
        this.getSessionsRef(tenantId),
        where('active', '==', true)
      );

      const snapshot = await getDocs(q);
      
      const sessions = snapshot.docs.map((doc) => doc.data());
      const uniqueUsers = new Set(sessions.map((s) => s.userId)).size;
      
      const devices = sessions.reduce((acc, session) => {
        acc[session.device] = (acc[session.device] || 0) + 1;
        return acc;
      }, {});

      const browsers = sessions.reduce((acc, session) => {
        acc[session.browser] = (acc[session.browser] || 0) + 1;
        return acc;
      }, {});

      return {
        activeSessions: sessions.length,
        activeUsers: uniqueUsers,
        devices,
        browsers,
      };
    } catch (error) {
      console.error('Error getting session stats:', error);
      throw error;
    }
  }
}

export default new SessionService();
