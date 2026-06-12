/**
 * Audit Service
 * 
 * Handles audit logging for all tenant operations.
 * Provides complete audit trail for compliance and security.
 */

import {
  collection,
  addDoc,
  doc,
  getDocs,
  deleteDoc,
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

// ══════════════════════════════════════════════════════
//   TENANT-SCOPED AUDIT LOG SERVICE
//   Used by ActivityLogs page and service factory
// ══════════════════════════════════════════════════════

export class FirestoreAuditLogService {
  constructor(tenantId) {
    if (!tenantId) throw new Error('tenantId is required');
    this.tenantId = tenantId;
  }

  getCollectionRef() {
    return collection(db, 'tenants', this.tenantId, 'auditLogs');
  }

  // Normalize either schema (old singleton schema or new writeLog schema) to ActivityLogs format
  _normalize(data, docId) {
    const ts = data.timestamp?.toDate?.()
      ? data.timestamp.toDate()
      : new Date(data.createdAt || Date.now());
    return {
      id:          data.id      || docId,
      userId:      data.userId  || 'system',
      userName:    data.userName || 'System',
      userRole:    data.userRole || data.metadata?.userRole || '',
      action:      data.action  || '',
      category:    data.category || (data.action ? data.action.split('.')[0] : 'system'),
      description: data.description
        || (data.action ? `${data.action}${data.entityType ? ' · ' + data.entityType : ''}` : ''),
      orderId:     data.orderId || (data.entityType === 'order' ? data.entityId : null) || null,
      entityId:    data.entityId || null,
      entityType:  data.entityType || null,
      oldValue:    data.oldValue ?? (data.changes?.[0]?.oldValue != null
        ? JSON.stringify(data.changes[0].oldValue) : null),
      newValue:    data.newValue ?? (data.changes?.[0]?.newValue != null
        ? JSON.stringify(data.changes[0].newValue) : null),
      extra:       data.extra || null,
      createdAt:   ts.toISOString(),
    };
  }

  async getAll(maxCount = 1000) {
    try {
      const q = query(
        this.getCollectionRef(),
        orderBy('createdAt', 'desc'),
        limit(maxCount)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => this._normalize(d.data(), d.id));
    } catch (err) {
      // Fallback: try ordering by timestamp if createdAt index doesn't exist
      try {
        const q2 = query(
          this.getCollectionRef(),
          orderBy('timestamp', 'desc'),
          limit(maxCount)
        );
        const snap2 = await getDocs(q2);
        return snap2.docs.map(d => this._normalize(d.data(), d.id));
      } catch {
        console.error('Error getting audit logs:', err);
        return [];
      }
    }
  }

  async getCount() {
    try {
      const snap = await getDocs(this.getCollectionRef());
      return snap.size;
    } catch {
      return 0;
    }
  }

  async clearAll() {
    try {
      const snap = await getDocs(this.getCollectionRef());
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    } catch (error) {
      console.error('Error clearing audit logs:', error);
      throw error;
    }
  }

  async write(logData) {
    try {
      await addDoc(this.getCollectionRef(), {
        ...logData,
        tenantId: this.tenantId,
        createdAt: logData.createdAt || new Date().toISOString(),
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      // Never crash the app for a logging failure
      console.warn('[KAVO-LOG-FB] write failed:', error?.message || error);
    }
  }

  toCSV(logs) {
    if (!Array.isArray(logs)) return '';
    const e = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const h = ['ID', 'Date', 'Time', 'User', 'Role', 'Action', 'Category',
      'Description', 'Order ID', 'Old Value', 'New Value'].map(e).join(',');
    const rows = logs.map(l => {
      const d = new Date(l.createdAt);
      return [
        l.id,
        d.toLocaleDateString('en-GB'),
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        l.userName, l.userRole, l.action, l.category,
        l.description, l.orderId || '', l.oldValue || '', l.newValue || '',
      ].map(e).join(',');
    });
    return h + '\n' + rows.join('\n');
  }
}
