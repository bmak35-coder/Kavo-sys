/**
 * Audit Service
 * 
 * Handles audit logging for all tenant operations.
 * Provides complete audit trail for compliance and security.
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config';

class AuditService {
  /**
   * Get audit logs collection reference for a tenant
   */
  getAuditLogsRef(tenantId) {
    return collection(db, 'tenants', tenantId, 'auditLogs');
  }

  /**
   * Log an audit event
   */
  async log(tenantId, data) {
    try {
      const { action, entityType, entityId, userId, changes, metadata, userName } = data;

      const auditLog = {
        tenantId,
        action,
        entityType,
        entityId,
        userId,
        userName: userName || 'System',
        timestamp: serverTimestamp(),
        changes: changes || [],
        metadata: metadata || {},
        ip: await this.getClientIP(),
      };

      await addDoc(this.getAuditLogsRef(tenantId), auditLog);
    } catch (error) {
      console.error('Error logging audit:', error);
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Get audit logs for a tenant
   */
  async getAuditLogs(tenantId, options = {}) {
    try {
      const {
        entityType,
        entityId,
        userId,
        action,
        startDate,
        endDate,
        pageSize = 50,
        lastDoc = null,
      } = options;

      let q = query(
        this.getAuditLogsRef(tenantId),
        orderBy('timestamp', 'desc')
      );

      if (entityType) {
        q = query(q, where('entityType', '==', entityType));
      }

      if (entityId) {
        q = query(q, where('entityId', '==', entityId));
      }

      if (userId) {
        q = query(q, where('userId', '==', userId));
      }

      if (action) {
        q = query(q, where('action', '==', action));
      }

      if (startDate) {
        q = query(q, where('timestamp', '>=', Timestamp.fromDate(startDate)));
      }

      if (endDate) {
        q = query(q, where('timestamp', '<=', Timestamp.fromDate(endDate)));
      }

      if (pageSize) {
        q = query(q, limit(pageSize));
      }

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      }));

      return {
        logs,
        lastDoc: snapshot.docs[snapshot.docs.length - 1],
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch (error) {
      console.error('Error getting audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit trail for a specific entity
   */
  async getEntityAuditTrail(tenantId, entityType, entityId) {
    try {
      const q = query(
        this.getAuditLogsRef(tenantId),
        where('entityType', '==', entityType),
        where('entityId', '==', entityId),
        orderBy('timestamp', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      }));
    } catch (error) {
      console.error('Error getting entity audit trail:', error);
      throw error;
    }
  }

  /**
   * Get user activity logs
   */
  async getUserActivity(tenantId, userId, limit = 100) {
    try {
      const q = query(
        this.getAuditLogsRef(tenantId),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(limit)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      }));
    } catch (error) {
      console.error('Error getting user activity:', error);
      throw error;
    }
  }

  /**
   * Compare old and new data to generate change list
   */
  getChanges(oldData, newData) {
    const changes = [];

    Object.keys(newData).forEach((key) => {
      if (key === 'updatedAt' || key === 'createdAt') return;

      const oldValue = oldData[key];
      const newValue = newData[key];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field: key,
          oldValue: oldValue,
          newValue: newValue,
        });
      }
    });

    return changes;
  }

  /**
   * Get client IP (best effort)
   */
  async getClientIP() {
    try {
      // In production, use a service or get from request headers via Cloud Function
      return 'client';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Export audit logs to CSV
   */
  async exportAuditLogs(tenantId, options = {}) {
    try {
      const { logs } = await this.getAuditLogs(tenantId, {
        ...options,
        pageSize: 10000,
      });

      const headers = [
        'Timestamp',
        'Action',
        'Entity Type',
        'Entity ID',
        'User',
        'IP Address',
        'Changes',
      ];

      const rows = logs.map((log) => [
        log.timestamp?.toISOString(),
        log.action,
        log.entityType,
        log.entityId,
        log.userName,
        log.ip,
        JSON.stringify(log.changes),
      ]);

      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(','))
        .join('\n');

      return csv;
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      throw error;
    }
  }
}

export default new AuditService();
